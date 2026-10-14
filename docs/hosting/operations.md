# Hosted operations

Day-to-day commands for the hosted environment. Setup is in [setup.md](setup.md); command contracts are
in [specs/004-hosted-deployment/contracts/operations.md](../../specs/004-hosted-deployment/contracts/operations.md).
Every command needs `az login` as the owner and `.local/hosted.env`. None prints secret values.

```sh
scripts/hosted/hosted.sh status   # FQDN, image tag, revision health, last job executions
```

## Deploy

Merging to `main` deploys automatically: **Containers** publishes the images, then **Deploy** runs
([deploy.yml](../../.github/workflows/deploy.yml)). The workflow:

1. resolves the `web`, `api`, `migrations` and `backup` digests for the commit's `sha-<short>` tag;
2. runs `main.bicep` with the app's **current** images, so only the jobs get the new digests;
3. runs `job-bikelog-migrate` and stops if it fails (the app is unchanged);
4. runs `main.bicep` again with the new `web` and `api` digests, which creates one new revision;
5. waits for the revision to be healthy and checks `https://<fqdn>/healthz`.

In single revision mode the old revision keeps serving until the new one passes its probes, so a broken
build never takes traffic. Deployments queue (`concurrency: deploy-production`); a second merge waits
for the first deployment to finish rather than cancelling it.

The step summary lists the tag, the four digests, the revision, the migration execution and the
**previous tag**, which is the rollback target.

## Rollback

```sh
gh run list --workflow deploy.yml --limit 5          # find the last good deployment
gh workflow run deploy.yml -f image_tag=sha-<previous> -f skip_migrations=true
gh run watch
```

Take `<previous>` from the "Previous tag (rollback target)" row of the failed or unwanted deployment's
summary, or from `hosted.sh status` before deploying (`imageTag`).

This creates a new revision from the earlier images; it does not reactivate an old revision. It is safe
because migrations are additive and rollback-compatible (constitution): older code runs against the
newer schema, so the schema is never rolled back. `skip_migrations=true` keeps the earlier migrations
bundle from running.

## Pilot riders

See "Hosted riders" in [docs/auth/auth0-pilot-setup.md](../auth/auth0-pilot-setup.md#hosted-riders).

```sh
scripts/hosted/hosted.sh provision-pilot-user --subject '<auth0 sub>' --email '<address>'
scripts/hosted/hosted.sh disable-pilot-user --owner <uuid>
scripts/hosted/hosted.sh enable-pilot-user --owner <uuid>
```

Each command sets the operator job's arguments, runs one execution, prints its status and output, and
restores the default `--help` arguments. Add `--dry-run` to see the steps without running them.

## Backups

`job-bikelog-backup` runs daily at 02:30 UTC. Each run writes two create-only blobs to the `backups`
container: `<date>/bikelog-<timestamp>.dump` and, after it, the matching `.manifest.json`
([backup format](../../specs/004-hosted-deployment/contracts/backup-format.md)). A backup counts only
when both exist. Blobs are deleted 35 days after creation. The job identity can create and read blobs
but cannot overwrite or delete them.

```sh
scripts/hosted/hosted.sh backup-now                  # run once now; prints the database round trip
scripts/hosted/hosted.sh backups                     # dumps and manifests from the last 35 days
scripts/hosted/hosted.sh backup-verify-permissions   # overwrite and delete must both be refused
```

When a day passes without a successful run, `alert-backup-missing` emails the owner. Check the job's
executions with `hosted.sh status`, then its logs in the portal. A common cause is the Aiven service
being powered off (see [setup.md](setup.md#aiven-service-powered-off)).

### Backup image packages

The backup image installs exact Debian versions of `ca-certificates`, `curl` and `jq` from a fixed
`snapshot.debian.org` timestamp, so builds do not break when Debian replaces a package. Every Monday the
**Backup image pins** workflow looks for newer versions (usually security fixes) in a snapshot at least
12 hours old. When it finds some, it pushes a `chore/backup-pins-<timestamp>` branch and opens an issue with
a link to create the pull request; merging it rebuilds and redeploys the image. To check by hand, or to
take a fix sooner, run the workflow from the Actions tab or `scripts/hosted/update-backup-pins.sh`
locally.

## Restore rehearsal

Run it on your Mac with Docker. It downloads one backup, restores it into a fresh, uniquely named
PostgreSQL 18.6 container and compares it with the manifest:

```sh
scripts/hosted/hosted.sh backups                                  # pick a .dump name
time scripts/hosted/restore-rehearsal.sh 2026-10-20/bikelog-20261020T023004Z.dump
```

It checks the checksum, the `pg_restore` exit code, every table's row count (no extra or missing
tables), every component's stored usage totals and the latest migration, and prints a table of the
results. It always removes its container and volume. Record each rehearsal in
[setup-results.md](setup-results.md): date, blob, data kind, duration, results and problems.

## Real recovery

If the Aiven service or its data is lost:

1. Create a new Aiven PostgreSQL service (check its region, as in setup step 3), download its CA
   certificate and set a new password.
2. Download the newest complete backup:

   ```sh
   az storage blob download --auth-mode login --account-name <storage account> \
     --container-name backups --name <date>/bikelog-<timestamp>.dump --file .local/recovery.dump
   ```

3. Restore it into the new service's `defaultdb`, over verified TLS:

   ```sh
   docker run --rm -v "$PWD/.local:/work:ro" postgres:18.6 pg_restore --no-owner --exit-on-error \
     --dbname "postgresql://avnadmin:<password>@<host>:<port>/defaultdb?sslmode=verify-full&sslrootcert=/work/secrets/aiven-ca-certificate" \
     /work/recovery.dump
   ```

4. Update the Key Vault secrets `api-postgres-connection`, `web-database-url`, `backup-database-url` and
   `aiven-ca-certificate`, and the GitHub environment secret `AIVEN_DATABASE_HOST`
   ([setup.md step 7](setup.md#7-key-vault-secrets)).
5. Redeploy without migrations: `gh workflow run deploy.yml -f image_tag=<current tag> -f skip_migrations=true`.
6. Sign in and check the garage, then run `hosted.sh backup-now`.

Records entered after the last backup are lost; at most one day's worth.

## Secret rotation

Key Vault references are versionless, so a new version reaches the app within 30 minutes. To apply it at
once, restart the active revision:

```sh
az containerapp revision restart -g rg-bikelog-prod -n ca-bikelog \
  --revision "$(az containerapp show -g rg-bikelog-prod -n ca-bikelog --query properties.latestRevisionName -o tsv)"
```

Jobs read secrets at the start of each execution. For each secret, write the new value to a file under
`.local/secrets/` without a trailing newline and run
`az keyvault secret set --vault-name <kv> --name <secret> --file .local/secrets/<secret>`:

| Secret | Order of steps |
| --- | --- |
| Database password (`api-postgres-connection`, `web-database-url`, `backup-database-url`) | 1. Reset the `avnadmin` password in Aiven. 2. Set all three secrets at once. 3. Restart the revision. The app fails health checks between steps 1 and 3, so do this when nobody is using it. |
| `auth0-client-secret` | 1. Rotate the secret in the Auth0 application (the old one stops working). 2. Set the secret. 3. Restart the revision. |
| `web-session-key` | 1. Set a new 32-byte base64url key. 2. Restart. Every signed-in session ends; riders sign in again. |
| `aiven-ca-certificate` | 1. Download the new CA from Aiven. 2. Set the secret. 3. Restart. |

## Cost

```sh
scripts/hosted/hosted.sh cost   # budget, month-to-date spend and forecast; portal link
```

Cost data lags by up to a day. The expected spend is €0.50–€2 a month
([cost-estimate.md](cost-estimate.md)); the budget is €10 with emails at 50% and 80% actual and 100%
forecast. The Container Apps free grant (180,000 vCPU-seconds, 360,000 GiB-seconds, 2 million requests a
month) covers about 100 active hours of the 0.5 vCPU / 1 GiB replica.

These settings would break the budget. Each needs a new estimate and the owner's approval first
(FR-026):

- `minReplicas` above 0 (idle charges around the clock);
- a Dedicated workload profile, private endpoints or a planned maintenance window (Dedicated Plan
  Management, about €83 a month);
- a NAT gateway for a static outbound address;
- an Aiven paid plan.
