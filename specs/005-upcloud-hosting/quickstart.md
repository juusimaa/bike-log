# Quickstart: validating Bike Log on UpCloud

Runnable checks that prove [spec 005](spec.md). Record every result, sanitized (no secrets, email
addresses, database host names or IP addresses), in `docs/hosting/upcloud-results.md`, and report failures
as observed. Layout and commands: [server-layout](contracts/server-layout.md),
[deploy-command](contracts/deploy-command.md); order of the switch: [cutover](contracts/cutover.md).

## Prerequisites

- Admin SSH access to the server; `sudo`.
- `az login` as the owner (for the backup storage and the remaining Azure resources).
- Aiven console and Auth0 dashboard access.
- A phone on mobile data, and a laptop.
- `ADDR=https://<server hostname>`.

## Part L: local checks (before touching the server)

| Check | Command | Expected |
| --- | --- | --- |
| L1 scripts | `shellcheck scripts/upcloud/* images/backup/backup.sh` | clean |
| L2 deploy script | `scripts/upcloud/tests/run.sh` | Against a local Docker with fake images: a valid deploy succeeds; bad references, extra arguments and disallowed commands from the deploy key exit 64; a failing migration leaves the release unchanged; an unhealthy web container restores the previous release (exit 1); low disk exits 73; a concurrent call waits on the lock; pruning removes only `bike-log` images that are neither current nor previous, and leaves an unrelated tagged image alone |
| L3 compose | `docker compose -f deploy/upcloud/compose.yaml config` with sample env files | valid; `api` uses `service:web`; only `web` is on the `caddy` network; no published ports; log and memory limits on every service |
| L4 backup sign-in | `scripts/hosted/tests/run.sh` (existing) plus the new certificate test | Existing backup and restore checks pass; a JWT built by `backup.sh` has the right `aud`, `iss`, `sub`, `x5t#S256` and lifetime, verified against the test certificate |
| L5 app tests | `./scripts/dev.sh lint`, `./scripts/dev.sh test`, web checks in `docs/web-workflows.md` | pass (no application code change expected) |
| L6 Bicep | `bicep build infra/backup.bicep` and lint | clean; template contains only the kept resources (data-model.md) |

## Part U: on the server

| ID | Scenario | Steps | Expected |
| --- | --- | --- | --- |
| U1 | Serving and sign-in (US1) | From the owner's address: open `$ADDR`, sign in, open the existing test bike, log a ride; on a second device, see it | Garage with the records created on Azure; the ride appears on both; `curl -sI $ADDR/healthz` 200 |
| U2 | No cold start (SC-002) | After at least 3 hours idle, time the first page load | Usable within 3 s |
| U3 | Refusals (SC-003) | The 004 C4 set against `$ADDR`: no session on `/api/bikes` and `/api/me`; foreign or missing Origin on POST; altered Host; `X-Forwarded-Host`; `/openapi/v1.json`; `/health/ready`; `http://` | 401 / 403 / 404 as recorded for 004; `http://` redirects to `https://`; `nmap -p 3000,5080 <server>` shows both closed or filtered. With the owner gate on, another address gets 403; after opening it, an uninvited email gets no code |
| U4 | Other apps unaffected (US1-4) | Open Gym Notebook and Subscription Tracker; during U1, `docker stats --no-stream` | Both work; `web` and `api` under 512 MB each |
| U5 | Reboot (FR-007) | `sudo reboot`; after it, open `$ADDR` | Usable without manual steps; `bikelog-deploy status` healthy |
| U6 | Automatic deploy (US4, SC-004) | Merge a harmless change | Deploy workflow passes; live within 15 min; summary shows tag and previous tag |
| U7 | Failed deploy and rollback (SC-005) | Make a copy of `api.env` named `api.unhealthy.env` with an unreachable database host. Run `sudo bikelog-deploy deploy <current tag and digests> --api-env api.unhealthy.env` while sending a request to `$ADDR` every second. Delete the copy. Then run `gh workflow run deploy.yml -f rollback=true` | Failed deploy: at most 60 s of failed requests, previous version serving, workflow red. Rollback: previous tag serving within 5 min |
| U8 | Backups (US3) | `sudo bikelog-deploy backup`; `hosted.sh backups`; `sudo bikelog-deploy backup-verify-permissions`; next day, check the timer ran; stop the timer for a day | New dump and manifest listed; overwrite and delete refused; daily run at 02:30 UTC; with the timer stopped, `alert-backup-missing-blobs` emails within a day |
| U9 | Restore rehearsal (SC-007) | `scripts/hosted/restore-rehearsal.sh <post-move blob>` | All checks pass; date, duration and outcome recorded in the rehearsal table; under 1 hour |
| U10 | Disk and logs (SC-009) | After 10 deploys: `docker images 'ghcr.io/juusimaa/bike-log/*'`; `du -sh` of the Bike Log container log directories; `df -h` | Only current and previous digests; logs under 100 MB; Bike Log total under 3 GB |
| U11 | Database allow-list (FR-009) | From the owner's machine, `psql` to the Aiven host with valid credentials | Connection refused or times out; from the server it works |
| U12 | Pilot rider (US5) | `sudo bikelog-deploy provision-pilot-user …`, sign in as the rider, `disable-pilot-user`, reload | Empty, separate garage; refused after disable even with a valid session |
| U13 | Secrets (SC-010) | `gitleaks` over the repository; search the deploy workflow logs and `docker logs` of `web`, `api`, `backup` for the database password, session key and client secret | Zero findings |
| U14 | Azure removed (SC-011) | `az resource list -g rg-bikelog-prod -o table`; next month's cost view | Only the resources in data-model.md "Azure resources kept"; cost under €1 |

## Gate

Real records may be entered when U1, U3 (with the gate open), U5, U7, U8, U9 and U11 have passed and are
recorded, mirroring spec 004's FR-022.
