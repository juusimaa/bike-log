# Data Model: Hosting on UpCloud

This feature adds no database tables or migrations. Its "data" is the state kept on the server, in Azure
and in GitHub to run, deploy and back up Bike Log. Layout and interfaces are in
[contracts/](contracts/); decisions are in [research.md](research.md).

## Server environment

Bike Log's part of the UpCloud server, under `/srv/bikelog` ([server-layout](contracts/server-layout.md)).

| Field | Value / rule |
| --- | --- |
| Compose project | `bikelog`; no resource outside this project is created, changed or deleted by Bike Log scripts |
| Public address | `https://<server hostname>`, the server's default UpCloud hostname (D3) |
| Long-running services | `web` (public through Caddy), `api` (in `web`'s network namespace, loopback only) |
| One-off services | `migrate`, `ops`, `backup` (Compose profiles; never started by `up`) |
| Limits | 512 MB and 0.5 CPU per container (D6) |
| Logs | `local` driver, 10 MB × 3 files per container (D7) |
| Owner gate | `open` or `owner-only`; starts `owner-only`, becomes `open` after the refusal checks pass |

## Release

The deployed version, kept as two files so rollback needs no lookup.

| Field | Rule |
| --- | --- |
| `release.env` | `WEB_IMAGE`, `API_IMAGE`, `MIGRATIONS_IMAGE`, `BACKUP_IMAGE` as `ghcr.io/juusimaa/bike-log/<name>@sha256:<64 hex>`, plus `IMAGE_TAG=sha-<7 hex>` and `DEPLOYED_UTC` |
| `release.previous.env` | The release before the current one; absent before the second deploy |
| Validation | Every image reference must match the pattern above; anything else is refused before Docker runs |

**State transitions** (one deploy):

```text
current ──deploy: disk check, pull──▶ pulled ──migrate ok──▶ starting ──healthy──▶ current' (previous := current)
                     │ fail                      │ fail             │ unhealthy
                     ▼                           ▼                  ▼
                 unchanged                   unchanged        restore previous ──healthy──▶ current (deploy failed)
rollback: swap release.env ⇄ release.previous.env ──▶ starting ──▶ (as above, no migrations)
```

Only the current and previous releases' Bike Log images stay on disk after a successful deploy.

## Server secrets

Files in `/srv/bikelog/secrets/` (root, 0700; files 0600). Never in the repository, images or logs.

| File | Contents | Used by |
| --- | --- | --- |
| `app.env` | `AUTH0_CLIENT_SECRET`, `BIKELOG_WEB_DATABASE_URL`, `BIKELOG_SESSION_KEY` | `web` |
| `api.env` | `ConnectionStrings__Postgres` | `api`, `migrate`, `ops` |
| `backup.env` | `BIKELOG_DATABASE_URL`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `BACKUP_ACCOUNT_URL`, `BACKUP_CONTAINER` | `backup` |
| `aiven-ca-certificate` | Aiven project CA (PEM) | all services that reach the database |
| `backup-client.pem` | Backup app registration's private key and certificate | `backup` |

Non-secret settings (`WEB_PUBLIC_ORIGIN`, Auth0 issuer, audience and client ID, `Operator__HostedDatabaseHost`)
live in `/srv/bikelog/settings.env` (0644).

## Backup

Unchanged from spec 004 ([backup-format](../004-hosted-deployment/contracts/backup-format.md)): a custom
format dump and a manifest per run, in `backups/<yyyy-mm-dd>/bikelog-<timestamp>.{dump,manifest.json}`,
deleted 35 days after creation by the storage lifecycle rule. Only the writer changes: the server's backup
principal instead of the Azure app identity.

| Field | Rule |
| --- | --- |
| Writer | App registration **Bike Log backup (UpCloud)**, role Bike Log Backup Writer on `backups` (add + read only) |
| Schedule | Daily 02:30 UTC, `Persistent=true` (a missed run after a reboot runs at boot) |
| Success signal | Two successful `PutBlob` transactions in a day; fewer raises `alert-backup-missing-blobs` |

## Deploy credential

| Field | Rule |
| --- | --- |
| Server account | `bikelog-deploy`; no password, not in the `docker` group |
| Key | Ed25519; private part only in GitHub environment secret `UPCLOUD_DEPLOY_SSH_KEY` |
| `authorized_keys` options | `restrict,command="sudo /srv/bikelog/bin/bikelog-deploy"` |
| Allowed commands | `deploy <4 image refs> <tag>`, `rollback`, `status` ([deploy-command](contracts/deploy-command.md)) |
| Host key | Pinned in GitHub variable `UPCLOUD_SSH_KNOWN_HOSTS` |

## Azure resources kept

Defined in `infra/backup.bicep`, deployed by the owner. Everything else from spec 004 is deleted at cutover.

| Resource | Purpose |
| --- | --- |
| Storage account `stbikelog<suffix>`, container `backups`, lifecycle rule | Backup storage, 35-day retention |
| Custom role Bike Log Backup Writer; assignments to the backup principal and the owner (reader) | Write-only backups; restore rehearsals |
| Action group `ag-bikelog-owner`; metric alert `alert-backup-missing-blobs` | Missed or failed backup email |
| Budget `budget-bikelog` (€10, 50% / 80% actual, 100% forecast) | Cost guard for what remains |

## Cutover record

Recorded in `docs/hosting/upcloud-results.md`.

| Field | Rule |
| --- | --- |
| Steps | Each step of [cutover](contracts/cutover.md) with UTC time and outcome |
| Azure connections | `pg_stat_activity` count from non-server addresses before the server starts (must be 0) |
| Unavailable from / to | Times the old address stopped and the new address served; target at most 30 minutes |
| Checks | Results of the quickstart scenarios run during cutover |
| Removed | Azure resources deleted, with time; Auth0 URLs removed; Aiven password rotated |
