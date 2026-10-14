# Bike Log on UpCloud

How Bike Log runs on the owner's UpCloud server (spec 005, [decision 0007](../decisions/0007-upcloud-hosting.md)):
setup, deploys, rollback, secrets, backups, restore, operator commands, the cutover from Azure and changing
the address. Record every result, sanitized, in [upcloud-results.md](upcloud-results.md). Scenario IDs
(U1–U14) are from the [quickstart](../../specs/005-upcloud-hosting/quickstart.md); cutover steps (A–D) from
the [cutover contract](../../specs/005-upcloud-hosting/contracts/cutover.md).

Placeholders: `<host>` is the server's default UpCloud hostname, `<admin>` your own admin account on the
server, `<address>` your public IP address. Commands marked **(server)** run in your admin SSH session;
the rest run on your machine from the repository root. Local files go in `.local/` (ignored by git).

## What runs where

- `/srv/bikelog` on the server: `compose.yaml`, `settings.env`, `secrets/`, `release.env`,
  `release.previous.env`, `bin/bikelog-deploy` ([server layout](../../specs/005-upcloud-hosting/contracts/server-layout.md)).
- Compose project `bikelog`: `web` (behind Caddy) and `api` (in `web`'s network namespace, loopback only)
  run all the time; `migrate`, `ops` and `backup` run once per command.
- `bikelog-deploy` is the only way anything changes. It holds a lock, so deploys, jobs and operator commands
  never overlap ([command contract](../../specs/005-upcloud-hosting/contracts/deploy-command.md)).
- Azure keeps only the backup storage, its alert and the budget (`infra/backup.bicep`). Aiven keeps the
  database; its allow-list admits only the server.
- Files in `deploy/upcloud/` and `scripts/upcloud/` reach the server only through `install.sh`. A merge
  that changes them needs step 2 of [Setup](#setup) again; the deploy workflow updates images only.

## Setup

For the first server, these are cutover steps A1–A7; the rest of the cutover is under [Cutover](#cutover).
For a replacement server, do the same with the values from your password manager, then a first deploy
by hand (B5) and the checks in C.

### 1. Check the server (A1)

**(server)**

```sh
docker version --format 'Engine {{.Server.Version}} {{.Server.Os}}/{{.Server.Arch}}'
docker compose version          # v2 or later
docker buildx version           # needed for the disk check
docker ps --format '{{.Names}} {{.Image}}' | grep -i caddy || caddy version   # Caddy in a container, or on the host
docker network ls               # name of Caddy's network, if in a container
sudo ufw status || sudo nft list ruleset | head -40   # 80, 443 and SSH allowed
sudo sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication) '   # both "no"
free -m; df -h "$(docker info --format '{{.DockerRootDir}}')"
ip -brief address               # IPv4 and IPv6 present?
ls /srv/bikelog                 # must not exist
```

The hostname is in the UpCloud control panel (server, **IP addresses**, reverse DNS of the public IPv4).
Check that it resolves to the server: `dig +short <host> A` (and `AAAA` if the server has IPv6).

Stop and decide with the owner if Compose is older than v2, less than 1 GB of memory is free, or the
hostname does not resolve. Record the results under "Server prerequisites".

### 2. Install (A2)

**(server)**, from a checkout of this repository at the commit being deployed:

```sh
git clone https://github.com/juusimaa/bike-log.git ~/bike-log && cd ~/bike-log   # or: git pull
sudo scripts/upcloud/install.sh --dry-run            # add --caddy-on-host if Caddy is not in a container
sudo scripts/upcloud/install.sh
```

It creates `/srv/bikelog`, the `bikelog-deploy` account (no password, not in `docker`), the sudoers rule
and the backup timer (disabled), and prints what is left. It never overwrites `settings.env`, `secrets/` or
the release files, and refuses a `/srv/bikelog` it did not create.

### 3. Settings and secrets (A3)

Settings, **(server)**: copy `/srv/bikelog/settings.env.example` to `/srv/bikelog/settings.env` and fill
in `WEB_PUBLIC_ORIGIN=https://<host>`, the Auth0 issuer, audience and client ID (the hosted application's;
the GitHub `production` variables hold them) and `Operator__HostedDatabaseHost` (the Aiven host). If Caddy's
network is not called `caddy`, set `CADDY_NETWORK`.

Secrets, on your machine, from Key Vault (`kv` is the vault name). Values are single-quoted, which Compose
reads literally; none of the generated values contains a quote.

```sh
umask 077; mkdir -p .local/upcloud
kv=<keyVaultName>
get() { az keyvault secret show --vault-name "$kv" -n "$1" --query value -o tsv; }
{
  printf "AUTH0_CLIENT_SECRET='%s'\n" "$(get auth0-client-secret)"
  printf "BIKELOG_WEB_DATABASE_URL='%s'\n" "$(get web-database-url)"
  printf "BIKELOG_SESSION_KEY='%s'\n" "$(get web-session-key)"
} > .local/upcloud/app.env
printf "ConnectionStrings__Postgres='%s'\n" "$(get api-postgres-connection)" > .local/upcloud/api.env
printf "BIKELOG_DATABASE_URL='%s'\n" "$(get backup-database-url)" > .local/upcloud/backup.env
get aiven-ca-certificate > .local/upcloud/aiven-ca-certificate
ssh <admin>@<host> 'umask 077; mkdir -p /tmp/bikelog-secrets'
scp .local/upcloud/{app.env,api.env,backup.env,aiven-ca-certificate} <admin>@<host>:/tmp/bikelog-secrets/
```

**(server)**

```sh
cd /tmp/bikelog-secrets
sudo install -o root -g root -m 0600 app.env api.env backup.env /srv/bikelog/secrets/
sudo install -o root -g root -m 0644 aiven-ca-certificate /srv/bikelog/secrets/   # public CA, read by every container
shred -u ./* && cd && rmdir /tmp/bikelog-secrets
```

`backup.env` gets its Azure lines in step 4. Store every value in your password manager too; Key Vault is
deleted at D3. Check that `api.env` still has `SSL Mode=VerifyFull`, the root certificate path and
`Maximum Pool Size=3`. Then delete `.local/upcloud/*.env` and the CA copy on your machine. Record the file
names only.

### 4. Backup identity (A4)

Only after the cost addendum in [cost-estimate.md](cost-estimate.md) is approved.

On your machine:

```sh
app=$(az ad app create --display-name 'Bike Log backup (UpCloud)' --query appId -o tsv)
az ad sp create --id "$app" --query id -o tsv          # backupPrincipalId
echo "$app"                                             # AZURE_CLIENT_ID
az account show --query tenantId -o tsv                 # AZURE_TENANT_ID
```

**(server)**: a key and a one-year certificate. The private key never leaves the server; the backup image
runs as `postgres` (uid 999), which must be able to read the file.

```sh
# secrets/ is root-only (0700), so everything goes through sudo with full paths.
sudo sh -c 'cd /srv/bikelog/secrets && umask 077 && openssl req -x509 -newkey rsa:3072 -nodes -days 365 \
  -subj "/CN=Bike Log backup (UpCloud)" -keyout backup-client.key -out backup-client.crt \
  && cat backup-client.key backup-client.crt > backup-client.pem && rm backup-client.key'
sudo chown 999:999 /srv/bikelog/secrets/backup-client.pem
sudo chmod 0400 /srv/bikelog/secrets/backup-client.pem
sudo openssl x509 -in /srv/bikelog/secrets/backup-client.crt -noout -enddate   # record the expiry date
sudo cat /srv/bikelog/secrets/backup-client.crt                                # public part only
```

`ls -l` shows uid 999 under whatever name the host gives it (on the first server, `bikelog-deploy` and the
group `systemd-journal`). Only the number matters: inside the container it is `postgres`. No account but
root can reach the file, because `secrets/` is 0700; `sudo -u bikelog-deploy cat
/srv/bikelog/secrets/backup-client.pem` must say "Permission denied".

Copy the certificate text to `.local/upcloud/backup-client.crt` and upload it:

```sh
az ad app credential reset --id "$app" --cert @.local/upcloud/backup-client.crt --append
az ad app credential list --id "$app" -o table               # no client secrets
```

Append to `/srv/bikelog/secrets/backup.env` **(server)**:

```text
AZURE_TENANT_ID='<tenant id>'
AZURE_CLIENT_ID='<backup app client id>'
AZURE_CLIENT_CERTIFICATE_FILE='/mnt/secrets/backup-client.pem'
BACKUP_ACCOUNT_URL='https://<storage account>.blob.core.windows.net'
BACKUP_CONTAINER='backups'
```

Deploy the kept Azure resources with the new principal. Copy `infra/backup.example.bicepparam` to
`.local/backup.local.bicepparam`, set `using '../infra/backup.bicep'` and the real values
(`budgetStartDate` is the budget's existing start date, see the parameter description), then:

```sh
az deployment group what-if -g rg-bikelog-prod -f infra/backup.bicep -p .local/backup.local.bicepparam
az deployment group create  -g rg-bikelog-prod -f infra/backup.bicep -p .local/backup.local.bicepparam -o none
```

`what-if` must create only the role assignment for the backup principal and `alert-backup-missing-blobs`;
anything else marked as a change is recorded and explained before deploying.

### 5. Caddy (A5)

**(server)**

```sh
sudo /srv/bikelog/bin/bikelog-deploy gate owner-only <address>    # prints the site block
```

Add the block to the Caddyfile (or a file it imports), then validate and reload. Caddy in a container
named `caddy`: `docker exec caddy caddy validate --config /etc/caddy/Caddyfile && docker exec caddy caddy
reload --config /etc/caddy/Caddyfile`. Caddy on the host: `sudo caddy validate --config
/etc/caddy/Caddyfile && sudo systemctl reload caddy`. Nothing else in the global configuration changes.

Check from your address: `curl -sI https://<host>` returns 502 (Bike Log is not running yet) over a valid
certificate; from mobile data it returns 403. Record the issuer (`curl -vI https://<host> 2>&1 | grep
issuer`). If no certificate is issued by Let's Encrypt or ZeroSSL, stop: the app is never served over
HTTP. Choose another address with the owner.

### 6. Auth0 (A6)

In the hosted Auth0 application, **add** beside the Azure entries:

- Allowed Callback URLs: `https://<host>/auth/callback`
- Allowed Logout URLs: `https://<host>/?signedOut=1`
- Allowed Web Origins: `https://<host>`

### 7. Deploy key and GitHub (A7)

On your machine:

```sh
ssh-keygen -t ed25519 -N '' -C bikelog-deploy-github -f .local/upcloud/deploy_key
ssh-keyscan -t ed25519 <host> > .local/upcloud/known_hosts
ssh-keygen -lf .local/upcloud/known_hosts                # compare with the server's own fingerprint:
ssh <admin>@<host> ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

Only if the two fingerprints match:

```sh
gh secret set UPCLOUD_DEPLOY_SSH_KEY --env production < .local/upcloud/deploy_key
gh secret set UPCLOUD_HOST --env production --body '<host>'
gh variable set UPCLOUD_SSH_KNOWN_HOSTS --env production < .local/upcloud/known_hosts
```

**(server)**: the public key with the forced command and `restrict` (no shell, PTY or forwarding):

```sh
printf 'restrict,command="sudo /srv/bikelog/bin/bikelog-deploy" %s\n' "<contents of deploy_key.pub>" |
  sudo tee -a /home/bikelog-deploy/.ssh/authorized_keys > /dev/null
```

Check from your machine, and record:

```sh
k=(-i .local/upcloud/deploy_key -o IdentitiesOnly=yes)
ssh "${k[@]}" bikelog-deploy@<host> status               # works
ssh "${k[@]}" bikelog-deploy@<host> bash                 # refused, exit 64
ssh "${k[@]}" -N -L 9999:127.0.0.1:22 bikelog-deploy@<host>   # forwarding refused
```

Then delete `.local/upcloud/deploy_key` (GitHub holds it; a lost key is replaced, not recovered). Merge the
branch with the new `deploy.yml`, whose job stays disabled until D1. From this merge on, Azure receives no
more deploys and stays on its current revision.

## Deploy

After cutover step D1, merging to `main` deploys automatically: **Containers** publishes the images, then
**Deploy** ([deploy.yml](../../.github/workflows/deploy.yml)) resolves the four digests for the commit's
`sha-<short>` tag and runs `bikelog-deploy deploy` over the deploy key. On the server it:

1. checks that at least 3 GB would remain on Docker's disk after the pull (exit 73 otherwise);
2. pulls the four images by digest while the current version keeps serving;
3. runs migrations (10-minute limit); on failure the app is unchanged (exit 1);
4. records the new release, keeping the old one as `release.previous.env`;
5. replaces `web` and `api` and waits up to 90 s for `web` to be healthy (`/healthz` checks the API too);
6. if unhealthy, starts the previous release again (exit 1), or exits 2 if that is not healthy either;
7. removes Bike Log images that are neither current nor previous. Other projects' images are never touched.

The step summary shows the result line (`result=… tag=… previous=…`), the digests and the server status.
Deploys queue (`concurrency: deploy-production`), and the server lock serializes them with backups and
operator commands. Replacing the containers costs about 10–20 s of unavailability.

Deploy a specific published tag: `gh workflow run deploy.yml -f image_tag=sha-<7 hex>`.

By hand **(server)**, for example the first deploy (B5), with the digests of the tag:

```sh
tag=sha-<7 hex>; refs=()
for image in web api migrations backup; do
  refs+=("ghcr.io/juusimaa/bike-log/$image@$(docker buildx imagetools inspect \
    ghcr.io/juusimaa/bike-log/$image:$tag --format '{{json .Manifest}}' | jq -r .digest)")
done
sudo /srv/bikelog/bin/bikelog-deploy deploy "$tag" "${refs[@]}"
```

Status: `sudo /srv/bikelog/bin/bikelog-deploy status` shows the current and previous tags, container state
and health, and free disk. Logs: `docker logs bikelog-web-1`, `docker logs bikelog-api-1` (10 MB × 3 per
container).

## Rollback

```sh
gh workflow run deploy.yml -f rollback=true
gh run watch
```

This swaps `release.env` and `release.previous.env` and starts the previous release behind the same health
gate, without migrations; every migration is additive, so the previous version runs on the newer schema.
Running it twice returns to where you started. **(server)** equivalent: `sudo /srv/bikelog/bin/bikelog-deploy
rollback`.

Failed-deploy rehearsal (U7) **(server)**: copy `secrets/api.env` to `secrets/api.unhealthy.env` with the
database host changed to one that does not resolve, then deploy the current tag and digests (from `status`
and `release.env`) with `--api-env api.unhealthy.env` while requesting `https://<host>/healthz` every second
from another terminal. Expect exit 1 and the previous release healthy; then `sudo rm
/srv/bikelog/secrets/api.unhealthy.env`. The option applies to that one deploy and is never recorded.

## Secrets and rotation

Secrets live only in `/srv/bikelog/secrets/` (root, 0700; files 0600, except the public CA certificate at
0644 and `backup-client.pem`, owned by uid 999 at 0400) and in your password manager. `bikelog-deploy`
never prints them. After changing a file, `sudo /srv/bikelog/bin/bikelog-deploy restart` recreates `web`
and `api` with it behind the health gate.

| Secret | Rotate | Order |
| --- | --- | --- |
| Aiven `avnadmin` password | Aiven console, **Users**, reset | The old password stops at once: update the password in `api.env`, `app.env` and `backup.env` right away, `restart`, then `backup` to check the backup path |
| Session key | `openssl rand -base64 32 \| tr '+/' '-_' \| tr -d '=\n'` | Update `app.env`, `restart`. Everyone signs in again |
| Auth0 client secret | Auth0, the application's **Credentials**, rotate | The old secret stops at once: update `app.env`, `restart` |
| Backup certificate | Before the recorded expiry, see [Backups](#backups) | New certificate uploaded first, old one removed last |
| Deploy key | New key pair | Add the new `authorized_keys` line, update `UPCLOUD_DEPLOY_SSH_KEY`, run a deploy or `status` through GitHub, then delete the old line |

Revoke the deploy key at once by deleting its line in `/home/bikelog-deploy/.ssh/authorized_keys`.

## Backups

`bikelog-backup.timer` runs `bikelog-deploy backup` daily at 02:30 UTC (up to 10 minutes later), and at
boot if a run was missed. Each run writes a dump and a manifest to the `backups` container as create-only
blobs; the lifecycle rule deletes them after 35 days. Format and restore are unchanged from spec 004.

```sh
sudo /srv/bikelog/bin/bikelog-deploy backup                      # (server) run once now
sudo /srv/bikelog/bin/bikelog-deploy backup-verify-permissions   # (server) overwrite and delete refused
systemctl list-timers bikelog-backup.timer; journalctl -u bikelog-backup -n 50   # (server)
scripts/hosted/hosted.sh backups                                 # dumps and manifests, last 35 days
```

`alert-backup-missing-blobs` emails you when a day has fewer than two successful uploads, whether the run
failed or never happened. Start with `journalctl -u bikelog-backup`: a token error names the Entra error
code (often an expired or replaced certificate); a connection error usually means Aiven's allow-list or the
service is powered off.

Certificate renewal, before the expiry recorded in upcloud-results.md:

1. **(server)** create `backup-client.new.pem` and `.crt` as in [Setup step 4](#4-backup-identity-a4).
2. Upload the new certificate with `az ad app credential reset --id <app> --cert @<new crt> --append`.
3. **(server)** `sudo mv /srv/bikelog/secrets/backup-client.new.pem /srv/bikelog/secrets/backup-client.pem`
   (keep owner 999, mode 0400), run `backup`.
4. Remove the old certificate: `az ad app credential list --id <app> --cert -o table`, then
   `az ad app credential delete --id <app> --key-id <old keyId> --cert`. Record the new expiry.

## Restore

Unchanged from spec 004: `scripts/hosted/restore-rehearsal.sh <blob>` downloads a dump with your Azure
sign-in, restores it into a fresh local PostgreSQL container and compares it with its manifest (see
[operations.md](operations.md#restore-rehearsal) for what it checks). Record each rehearsal in the "Restore
rehearsals" table.

Real recovery, if the Aiven service or its data is lost (records after the last backup, at most a day's
worth, are lost):

1. Create a new Aiven PostgreSQL service (EU region), set a new password and its allow-list to the server,
   and download its CA certificate.
2. **(server)** stop the app: `cd /srv/bikelog && sudo docker compose --env-file settings.env --env-file
   release.env stop web api`.
3. Download the newest complete backup on your machine (`hosted.sh backups`, then
   `az storage blob download --auth-mode login --account-name <storage account> --container-name backups
   --name <date>/bikelog-<timestamp>.dump --file .local/recovery.dump`) and copy it to the server.
4. **(server)** restore it over verified TLS, from the server because Aiven admits no other address:

   ```sh
   sudo docker run --rm -v /tmp/recovery.dump:/recovery.dump:ro \
     -v /srv/bikelog/secrets/aiven-ca-certificate:/ca:ro postgres:18.6@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336 pg_restore --no-owner --exit-on-error \
     --dbname 'postgresql://avnadmin:<password>@<new host>:<port>/defaultdb?sslmode=verify-full&sslrootcert=/ca' \
     /recovery.dump
   ```

5. Replace the host, password and CA in `secrets/` and `Operator__HostedDatabaseHost` in `settings.env`
   ([Setup step 3](#3-settings-and-secrets-a3)), then `sudo /srv/bikelog/bin/bikelog-deploy restart`.
6. Sign in and check the garage, run `backup`, and delete the dump copies.

## Operator commands

**(server)**, with `sudo`, each under the lock. They run the API image in operator mode (`ops`), which
refuses unless the connection is the configured Aiven host over verified TLS.

```sh
sudo /srv/bikelog/bin/bikelog-deploy provision-pilot-user --subject '<auth0 sub>' --email '<address>'
sudo /srv/bikelog/bin/bikelog-deploy disable-pilot-user --owner <uuid>
sudo /srv/bikelog/bin/bikelog-deploy enable-pilot-user --owner <uuid>
sudo /srv/bikelog/bin/bikelog-deploy db-connections   # sessions per client address, last part masked
sudo /srv/bikelog/bin/bikelog-deploy status
```

`provision-pilot-user` prints `Provisioned pilot owner <uuid>.`; the rider then signs in to an empty garage.
`disable-pilot-user` refuses that rider's next request even with a valid session; check by reloading as the
rider. Subjects must look like `auth0|…` or `email|…`, the address must be plain and the owner a UUID;
anything else exits 64 before Docker runs. The deploy key cannot run any of these.

## Cutover

Order and fallback: [cutover contract](../../specs/005-upcloud-hosting/contracts/cutover.md). Never let
Azure and the server use the database at the same time. Record the UTC time and outcome of every step.
Keep `rg` as `rg-bikelog-prod`.

**A. Prepare**: [Setup](#setup) steps 1–7. The server does not start anything yet.

**B. Switch** (downtime starts):

```sh
gh workflow disable deploy.yml                                                   # B1
rev=$(az containerapp show -g rg-bikelog-prod -n ca-bikelog --query properties.latestRevisionName -o tsv)
echo "$rev"                                                                      # record: needed to go back
az containerapp revision deactivate -g rg-bikelog-prod -n ca-bikelog --revision "$rev"   # B2
az containerapp replica list -g rg-bikelog-prod -n ca-bikelog --revision "$rev" -o table # empty
```

If the CLI refuses to deactivate the only revision, run `az containerapp ingress disable -g rg-bikelog-prod
-n ca-bikelog` instead and wait until the replica list is empty (no traffic, so it scales to zero); record
which one you used. Then stop the Azure backup job from running: `az containerapp job update -g
rg-bikelog-prod -n job-bikelog-backup --cron-expression '0 0 31 2 *'` (31 February never comes); record the
old expression (`30 2 * * *`). If the CLI rejects that expression, leave it: after B4 the job cannot reach
Aiven, and its failure emails are expected until D3.

B3, in the Aiven console: the service, **Current queries**. Wait until no client session remains (Aiven's
own maintenance sessions excepted), and record the count (must be 0).

B4: **Overview**, **Allowed IP addresses**: replace the list with the server's IPv4 address as `/32` (and
its IPv6 `/128` if A1 found IPv6). Record the old value; it is needed to go back.

B5 and B6 **(server)**: the deploy by hand from [Deploy](#deploy) with the current `main` tag, then
`sudo /srv/bikelog/bin/bikelog-deploy db-connections`: only the server's (masked) address appears. On a
first deploy there is no previous release, so a failure exits 2: go to the fallback.

**C. Check** (owner gate on): U1, U3 with the gate on, U4 and U11. Record the time of the first signed-in
page on `https://<host>`: downtime ends there (at most 30 minutes; under 2 hours from B1).

Fallback, if any check fails:

```sh
cd /srv/bikelog && sudo docker compose --env-file settings.env --env-file release.env down   # (server) C1
```

C2: set Aiven's allow-list back to the recorded value. C3: `az containerapp revision activate -g
rg-bikelog-prod -n ca-bikelog --revision "$rev"` (or `az containerapp ingress enable … --type external
--target-port 3000 --transport auto`, then `az containerapp ingress access-restriction set … --rule-name
owner-0 --ip-address <address>/32 --action Allow` if you disabled ingress); restore the backup job's cron
expression; `gh workflow enable deploy.yml` re-enables the workflow, but its Azure version is in git history
only: further Azure deploys need `deploy.yml` reverted. C4: record what failed. Azure is unchanged otherwise.

**D. Finish**:

1. D1: open a PR removing `false &&` from `deploy.yml`, merge it, and watch the automatic deploy (U6). Then
   U7 (rehearsal above, and `gh workflow run deploy.yml -f rollback=true`), timing both, and U5 (`sudo
   reboot`, then `https://<host>` and `status` without manual steps).
2. D2 **(server)**: `sudo systemctl enable --now bikelog-backup.timer`; run `backup` and
   `backup-verify-permissions` once; next day confirm the timer ran (U8).
3. D3: confirm every Key Vault value is in your password manager. Delete the role assignments of the two
   identities first, so none is left orphaned, then the resources:

   ```sh
   for id in id-bikelog-app id-bikelog-deploy; do
     principal=$(az identity show -g rg-bikelog-prod -n "$id" --query principalId -o tsv)
     az role assignment list --all --assignee "$principal" --query '[].id' -o tsv |
       xargs -r -n1 az role assignment delete --ids
   done
   az containerapp delete -g rg-bikelog-prod -n ca-bikelog --yes
   for job in job-bikelog-migrate job-bikelog-ops job-bikelog-backup; do
     az containerapp job delete -g rg-bikelog-prod -n "$job" --yes
   done
   az containerapp env delete -g rg-bikelog-prod -n cae-bikelog --yes
   az monitor log-analytics workspace delete -g rg-bikelog-prod -n log-bikelog --yes --force
   az monitor metrics alert delete -g rg-bikelog-prod -n alert-app-restarts
   az monitor metrics alert delete -g rg-bikelog-prod -n alert-backup-missing
   az identity federated-credential delete -g rg-bikelog-prod --identity-name id-bikelog-deploy -n github-production --yes
   az identity delete -g rg-bikelog-prod -n id-bikelog-app
   az identity delete -g rg-bikelog-prod -n id-bikelog-deploy
   az keyvault delete -g rg-bikelog-prod -n <keyVaultName>   # soft-deleted for 7 days; purge protection keeps it until then
   ```

   Then the repository change that deletes `infra/main.bicep`, `infra/main.bicepparam`, `infra/modules/`,
   `infra/bootstrap.bicep`, `infra/bootstrap.example.bicepparam` and their CI checks, and deploy
   `infra/backup.bicep` again: `what-if` must report no changes. `az resource list -g rg-bikelog-prod -o
   table` shows only the kept resources (U14).
4. D4: rotate the Aiven password ([Secrets and rotation](#secrets-and-rotation)).
5. D5: remove the Azure callback, logout and origin URLs from the Auth0 application.
6. D6: in the GitHub `production` environment, delete the variables `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`,
   `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID` and
   the secrets `INGRESS_ALLOW_CIDRS`, `AIVEN_DATABASE_HOST`, `OWNER_ALERT_EMAIL`; none is used any more
   (`gh variable delete … --env production`, `gh secret delete … --env production`).
7. D7: after U3 passes with the gate on, print the open block (`gate open`), put it in Caddy, reload, and
   run U3's "other address" and uninvited-email checks from mobile data.
8. D8: restore rehearsal on a post-move backup (U9) before any real record is entered.

## Changing the address

The address appears in four places only:

1. `WEB_PUBLIC_ORIGIN` in `/srv/bikelog/settings.env`, then `sudo /srv/bikelog/bin/bikelog-deploy restart`;
2. the Caddy site name (`gate …` prints the block from `settings.env`), then reload Caddy and check the new
   certificate;
3. the Auth0 application's callback, logout and web origin URLs (add the new ones first, remove the old
   ones after checking sign-in);
4. `UPCLOUD_HOST` and `UPCLOUD_SSH_KNOWN_HOSTS` in GitHub, if the deploy should use the new name.

If the server's IP address changes too, update Aiven's allow-list (B4) before restarting, or the app cannot
reach the database.
