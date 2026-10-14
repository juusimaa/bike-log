# Hosted setup guide

How the owner creates the hosted environment, in the order of
[quickstart Part B](../../specs/004-hosted-deployment/quickstart.md#part-b-owner-gate-before-any-azure-resource-exists).
Record every result in [setup-results.md](setup-results.md). Day-to-day commands are in
[operations.md](operations.md).

**Before anything else**: [cost-estimate.md](cost-estimate.md) must carry your dated approval. No Azure
resource is created before that.

Real values (email, host names, passwords, IDs) never go into the repository. Keep them in the ignored
`.local/` directory, in GitHub environment variables, or in Key Vault.

## 1. Prerequisites

- `az` (signed in with `az login` as the subscription owner), `gh` (signed in), Docker and `openssl`.
- `scripts/hosted/install-bicep.sh` has run (installs Bicep CLI 0.48.1).
- `.local/hosted.env`, copied from [scripts/hosted/hosted.env.example](../../scripts/hosted/hosted.env.example).
  Fill in what you know now; `BACKUP_STORAGE_ACCOUNT` comes from step 6.

```sh
mkdir -p .local/secrets && chmod 700 .local .local/secrets
cp scripts/hosted/hosted.env.example .local/hosted.env
```

## 2. Make the container packages public

The container app pulls from `ghcr.io` without a registry credential.

1. On GitHub, open **Packages** for the repository: `web`, `api`, `migrations` and `backup`. The
   `backup` package exists after the first `main` build that includes `images/backup/`.
2. For each package: **Package settings → Danger zone → Change visibility → Public**.
3. Check an anonymous pull works:

   ```sh
   docker logout ghcr.io
   docker pull ghcr.io/juusimaa/bike-log/web:main
   ```

## 3. Create the Aiven database

1. In the Aiven console, create a **PostgreSQL** service on the **Free** plan.
2. Read the service's **cloud and region** from the overview page. The free plan chooses it for you
   (research D16).
   - **If the region is outside the EU, stop.** Record it in `setup-results.md` and ask for a paid-plan
     cost estimate in `azure-sweden-central` before continuing.
3. Read the **PostgreSQL major version** (expected 18) and run `SHOW max_connections;` in the console's
   query editor (expected 20). Record both.
4. Download the **CA certificate** from the service overview to `.local/secrets/aiven-ca-certificate`.
5. Note the host, port, database (`defaultdb`) and user (`avnadmin`). Reset the user's password from the
   **Users** tab so it is long and random, and keep it only in `.local/secrets/`. Use a password made of
   URL-safe characters (letters, digits, `-` and `_`), so the URLs below need no escaping:

   ```sh
   openssl rand -base64 36 | tr '+/' '-_' | tr -d '=\n' > .local/secrets/db-password
   ```

## 4. Create the hosted Auth0 application

Follow "Hosted application" in [docs/auth/auth0-pilot-setup.md](../auth/auth0-pilot-setup.md#hosted-application).
Leave the callback and logout URLs empty for now; they are set after the first deployment (step 9).
Save the client secret to `.local/secrets/auth0-client-secret` with no trailing newline.

## 5. GitHub environment `production`

1. **Settings → Environments → New environment** `production`. Under **Deployment branches and tags**,
   choose **Selected branches** and add `main`.
2. Set the variables (all non-secret; there are no GitHub secrets). `AZURE_CLIENT_ID` is set after step 6.

   ```sh
   env=production
   gh variable set AZURE_TENANT_ID       --env $env --body "$(az account show --query tenantId -o tsv)"
   gh variable set AZURE_SUBSCRIPTION_ID --env $env --body "$(az account show --query id -o tsv)"
   gh variable set AZURE_RESOURCE_GROUP  --env $env --body rg-bikelog-prod
   gh variable set OWNER_ALERT_EMAIL     --env $env   # prompts for the value
   gh variable set AIVEN_DATABASE_HOST   --env $env   # prompts
   gh variable set AUTH0_ISSUER          --env $env   # https://<tenant>/ with the trailing slash
   gh variable set AUTH0_AUDIENCE        --env $env   # the Bike Log API identifier
   gh variable set AUTH0_CLIENT_ID       --env $env   # the hosted application's client ID
   gh variable set INGRESS_ALLOW_CIDRS   --env $env --body "$(curl -fsS https://api.ipify.org)/32"
   ```

   The deploy workflow masks `OWNER_ALERT_EMAIL` and `AIVEN_DATABASE_HOST` in its logs, which are public
   for a public repository.

## 6. Resource group and bootstrap

```sh
az group create -n rg-bikelog-prod -l swedencentral -o none
cp infra/bootstrap.example.bicepparam .local/bootstrap.local.bicepparam
```

Edit `.local/bootstrap.local.bicepparam`: change `using` to `'../infra/bootstrap.bicep'` and set
`ownerAlertEmail`, `ownerPrincipalId` (`az ad signed-in-user show --query id -o tsv`) and
`budgetStartDate` (the first day of the current month). Then:

```sh
az deployment group create -g rg-bikelog-prod -n bootstrap \
  -f infra/bootstrap.bicep -p .local/bootstrap.local.bicepparam \
  --query properties.outputs -o json
```

From the outputs:

- set `BACKUP_STORAGE_ACCOUNT` in `.local/hosted.env` to `storageAccountName`;
- set the GitHub variable `AZURE_CLIENT_ID` to `deployIdentityClientId`:

  ```sh
  gh variable set AZURE_CLIENT_ID --env production --body <deployIdentityClientId>
  ```

Role assignments can take a few minutes to apply.

## 7. Key Vault secrets

Write each value to a file under `.local/secrets/` without a trailing newline, then upload it with
`--file`, so no value reaches shell history or the process list. `kv` is the `keyVaultName` output.

```sh
umask 077
kv=<keyVaultName>
host=<aiven host>; port=<aiven port>; pw=$(cat .local/secrets/db-password)
ca=/mnt/secrets/aiven-ca-certificate

# API, migrations and operator job (Npgsql form; contracts/hosted-configuration.md).
printf '%s' "Host=$host;Port=$port;Database=defaultdb;Username=avnadmin;Password=$pw;SSL Mode=VerifyFull;Root Certificate=$ca;GSS Encryption Mode=Disable;Maximum Pool Size=3;Timeout=15" \
  > .local/secrets/api-postgres-connection
# Web session store. TLS verification is enforced by BIKELOG_DATABASE_CA_FILE.
printf '%s' "postgresql://avnadmin:$pw@$host:$port/defaultdb" > .local/secrets/web-database-url
# Backup job (libpq form).
printf '%s' "postgresql://avnadmin:$pw@$host:$port/defaultdb?sslmode=verify-full&sslrootcert=$ca" \
  > .local/secrets/backup-database-url
# 32 random bytes, base64url without padding (43 characters).
openssl rand -base64 32 | tr '+/' '-_' | tr -d '=\n' > .local/secrets/web-session-key
unset pw

for name in api-postgres-connection web-database-url backup-database-url web-session-key \
            auth0-client-secret aiven-ca-certificate; do
  az keyvault secret set --vault-name "$kv" --name "$name" --file ".local/secrets/$name" -o none
done
```

Check (and record):

```sh
az consumption budget list -g rg-bikelog-prod --query "[].{amount:amount,notifications:length(notifications)}"
az keyvault secret list --vault-name "$kv" --query "[].name" -o tsv     # six names
az role assignment list --all --assignee <deployIdentityClientId> \
  --query "[].{role:roleDefinitionName,scope:scope}" -o table         # only Contributor on the group
```

## 8. First deployment

Merge to `main`. The **Containers** workflow publishes the images, then **Deploy** runs
([.github/workflows/deploy.yml](../../.github/workflows/deploy.yml)). Follow it with
`gh run watch`. The step summary lists the tag, the four digests, the revision and the migration
execution. Record the duration and `/healthz` result (quickstart C1).

```sh
scripts/hosted/hosted.sh status
```

## 9. Finish Auth0

In the hosted Auth0 application, set:

- **Allowed Callback URLs**: `https://<fqdn>/auth/callback`
- **Allowed Logout URLs**: `https://<fqdn>/?signedOut=1`

`<fqdn>` is from `hosted.sh status`. Then provision riders (see [operations.md](operations.md#pilot-riders))
and run the quickstart C3–C5 checks with test records only.

## 10. Open the app to the internet

Only after every quickstart C4 refusal passes from your allowed address:

```sh
gh variable set INGRESS_ALLOW_CIDRS --env production --body ''
gh workflow run deploy.yml -f image_tag=<current sha- tag> -f skip_migrations=true
```

Confirm `https://<fqdn>/healthz` returns 200 from a phone on mobile data and record the date in
`setup-results.md` (constitution IV).

## After recreating the environment

A new Container Apps environment gets a new default domain, so:

1. `WEB_PUBLIC_ORIGIN` follows automatically (computed in `main.bicep`).
2. Update the Auth0 callback and logout URLs to the new FQDN.
3. Re-apply the `INGRESS_ALLOW_CIDRS` gate if the app should not be open yet.

## Aiven service powered off

The free plan powers off services that stay idle. Symptoms: `/healthz` returns 503,
`hosted.sh backup-now` cannot connect, or an Aiven notification email arrives.

Fix: power the service on in the Aiven console, wait until it shows **Running**, then run
`scripts/hosted/hosted.sh status`. The daily backup keeps the service active, so this should only
happen if backups stop; check `hosted.sh backups` afterwards.
