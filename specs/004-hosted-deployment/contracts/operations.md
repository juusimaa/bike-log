# Contract: Operations

Commands an operator runs. All need `az login` as the owner (or the deploy identity, in CI). None prints
secret values.

## Deploy (automatic)

`.github/workflows/deploy.yml`:

| Trigger | Behaviour |
| --- | --- |
| `workflow_run` of `containers.yml`, conclusion `success`, branch `main` | Deploys tag `sha-<short>` of that commit, with migrations |
| `workflow_dispatch` with `image_tag` (required, `sha-<short>`) and `skip_migrations` (boolean, default `false`) | Deploys the given tag; with `skip_migrations=true` the migration step is skipped (rollback) |

**Steps and failure behaviour**:

1. Resolve the digests of `web`, `api`, `migrations` and `backup` for the tag. A missing image fails the
   run.
2. Run `az deployment group create` with `infra/main.bicep`. The jobs get the new digests; the app
   keeps its current images. A failure stops the run, and the app is unchanged.
3. Unless skipped: start `job-bikelog-migrate` and wait. A non-zero exit or timeout stops the run, and
   the app is unchanged.
4. Update `ca-bikelog` to the new `web` and `api` digests.
5. Wait up to 10 minutes for the new revision's `runningState` to be `Running` and its health to be
   `Healthy`, then require `GET https://<fqdn>/healthz` to return 200. On failure, the run fails; in
   single revision mode the old revision keeps traffic.
6. Write a step summary with the tag, digests, revision name and migration execution.

**Workflow settings**:

- `concurrency: { group: deploy-production, cancel-in-progress: false }`
- `environment: production`
- `permissions: { id-token: write, contents: read }`

**Required GitHub environment variables** (non-secret): `AZURE_CLIENT_ID` (deploy identity),
`AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `OWNER_ALERT_EMAIL`,
`AIVEN_DATABASE_HOST`, `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID`, `INGRESS_ALLOW_CIDRS` (empty once
the app is opened). There are no GitHub secrets.

## Rollback

```sh
gh workflow run deploy.yml -f image_tag=sha-<previous> -f skip_migrations=true
```

Find `<previous>` in the last successful deploy summary.

## Pilot riders

```sh
scripts/hosted/hosted.sh provision-pilot-user --subject <auth0 sub> --email <address>
scripts/hosted/hosted.sh disable-pilot-user --owner <uuid>
scripts/hosted/hosted.sh enable-pilot-user --owner <uuid>
```

The script:

- reads the resource group from `.local/hosted.env`, which is ignored;
- starts `job-bikelog-ops` with the matching operator arguments, adding `--issuer` from the job's own
  `Auth__Issuer`;
- waits for the execution and prints its status and the command's own sanitized output.

It exits non-zero if the execution fails.

## Backups

```sh
scripts/hosted/hosted.sh backup-now        # start job-bikelog-backup once and wait
scripts/hosted/hosted.sh backups           # list blobs from the last 35 days with sizes
scripts/hosted/hosted.sh backup-verify-permissions   # job identity tries overwrite + delete; both must fail
```

## Restore rehearsal

```sh
scripts/hosted/restore-rehearsal.sh <blob name>
scripts/hosted/restore-rehearsal.sh --local <dir> [--keep]   # tests only
```

The script:

1. Downloads the dump and manifest with `--auth-mode login`.
2. Starts its own uniquely named PostgreSQL 18.6 container on a random loopback port.
3. Restores and runs the checks in [backup-format.md](backup-format.md).
4. Prints the duration and result.
5. Removes its container and volume. `--keep` is accepted only with `--local`; a rehearsal from Azure
   always removes its copy.

## Secret rotation

1. Set a new version in Key Vault with `az keyvault secret set`.
2. Wait up to 30 minutes, or restart the active revision with `az containerapp revision restart`.
3. For the database password: change it in Aiven, update both `api-postgres-connection` and
   `backup-database-url`, then restart.

The full order of steps lives in `docs/hosting/operations.md`.
