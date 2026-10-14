# Data Model: Minimal Hosted Deployment

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

This feature adds no database tables or migrations. Its "entities" are environment resources, secrets,
backup artifacts and recorded proofs. Spec entities map to them as follows.

## Hosted environment (Azure resource group `rg-bikelog-prod`, Sweden Central)

| Resource | Name pattern | Defined in | Key settings |
| --- | --- | --- | --- |
| Budget | `budget-bikelog` | bootstrap | €10 monthly; actual 50%, actual 80%, forecast 100%; owner email (parameter, not committed) |
| App identity | `id-bikelog-app` | bootstrap | Key Vault Secrets User; Bike Log Backup Writer on `backups` container |
| Deploy identity | `id-bikelog-deploy` | bootstrap | Contributor on the resource group; federated subject `repo:juusimaa/bike-log:environment:production` |
| Key Vault | `kv-bikelog-<suffix>` | bootstrap | Standard, RBAC, purge protection on, soft delete 7 days |
| Backup storage | `stbikelog<suffix>` | bootstrap | StorageV2 Standard LRS Hot; TLS 1.2 minimum; no public blob access; shared-key access disabled; container `backups`; lifecycle: delete 35 days after creation |
| Custom role | `Bike Log Backup Writer` | bootstrap | Data actions `blobs/add/action`, `blobs/read`; assignable to this resource group |
| Log workspace | `log-bikelog` | main | PerGB2018, 30-day retention, 0.15 GB daily cap |
| Environment | `cae-bikelog` | main | Workload profiles, Consumption only; logs to `log-bikelog` |
| Container app | `ca-bikelog` | main | Single revision mode; 0–1 replicas; containers `web` and `api`; external ingress to `web:3000`, HTTPS only |
| Migration job | `job-bikelog-migrate` | main | Manual; `migrations` image; timeout 600 s; retries 0 |
| Operator job | `job-bikelog-ops` | main | Manual; `api` image; timeout 120 s; retries 0 |
| Backup job | `job-bikelog-backup` | main | Schedule `30 2 * * *` UTC; `backup` image; timeout 900 s; retries 1 |
| Action group | `ag-bikelog-owner` | main | Email to owner (from GitHub environment variable) |
| Alerts | `alert-backup-missing`, `alert-app-restarts` | main | Metric alerts (D10) |

**Validation rules**:

- `maxReplicas` is 1. The connection budget in research D11 must hold whenever any pool size or replica
  count changes.
- No resource may enable private endpoints, Dedicated workload profiles or planned maintenance (D1, cost).
- `main.bicep` declares no `Microsoft.Authorization/roleAssignments` or role definitions (D3).

## App version (revision)

| Field | Source |
| --- | --- |
| Revision name | Container Apps, `ca-bikelog--<suffix>` |
| Source commit | Image tag `sha-<short>` |
| Image digests | `web`, `api`, `migrations` and `backup` digests resolved by the deploy workflow |
| Deployed at, outcome | Deploy workflow run summary |

**State transitions**: provisioning → running (probes pass, gets 100% traffic) → deactivated (when
replaced). Provisioning → failed (probes fail): the old revision keeps traffic. Rollback creates a new
revision from earlier digests; it does not reactivate an old one.

## Database change run

One execution of `job-bikelog-migrate`, holding the execution name, image digest, start and end times and
exit status. Exit 0 is required before the app update step. Kept in the job's execution history (last
100) and in the workflow log.

## Backup

See [contracts/backup-format.md](contracts/backup-format.md).

| Field | Notes |
| --- | --- |
| Dump blob | `backups/<yyyy-mm-dd>/bikelog-<yyyymmddThhmmssZ>.dump`; custom-format `pg_dump` |
| Manifest blob | Same name with `.manifest.json`; written after the dump upload succeeds |
| Created | Blob creation time; the lifecycle rule deletes 35 days later |
| Outcome | Job execution state; a missing manifest means an incomplete backup |

**Rules**: a backup counts only when both blobs exist and the manifest's `dumpSha256` matches the dump. The
job never overwrites or deletes blobs; a name collision fails the run.

## Restore rehearsal record

An entry in `docs/hosting/setup-results.md`:

- date;
- backup blob name;
- data kind (synthetic or real);
- duration;
- per-table count comparison;
- usage-total comparison;
- outcome;
- problems found.

## Secret

| Key Vault secret | Used by | Delivered as |
| --- | --- | --- |
| `api-postgres-connection` | `api`, migrate, ops | Environment variable `ConnectionStrings__Postgres` (Npgsql form) |
| `web-database-url` | `web` | `BIKELOG_WEB_DATABASE_URL` |
| `web-session-key` | `web` | `BIKELOG_SESSION_KEY` (32 bytes, base64url) |
| `auth0-client-secret` | `web` | `AUTH0_CLIENT_SECRET` |
| `aiven-ca-certificate` | all containers | File `/mnt/secrets/aiven-ca-certificate` via a secret volume |
| `backup-database-url` | backup | `BIKELOG_DATABASE_URL` (libpq URI with `sslmode=verify-full&sslrootcert=/mnt/secrets/aiven-ca-certificate`) |

**Rules**: values are set only by the owner (Key Vault Secrets Officer). References are versionless, so
new versions roll out automatically. No value appears in Bicep parameters, workflow logs or the
repository. See [contracts/hosted-configuration.md](contracts/hosted-configuration.md) for each
container's full settings.

## Cost estimate and budget

`docs/hosting/cost-estimate.md` holds the date, resources with unit prices, expected monthly total, the
approved amount (€10), thresholds and an owner approval line with a date. The budget resource in
bootstrap must match it.
