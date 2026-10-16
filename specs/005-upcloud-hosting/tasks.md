---

description: "Task list for hosting Bike Log on UpCloud"
---

# Tasks: Hosting on UpCloud

**Input**: Design documents from `specs/005-upcloud-hosting/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution III requires tests for failure modes and evidence from exercised runs for
every deployment claim. Write each script's tests first and confirm they fail before implementing. Server
claims are proven by the quickstart scenarios and recorded in `docs/hosting/upcloud-results.md`.

**Organization**: grouped by user story in priority order: US1, US2 and US3 (P1), US4 (P2), US5 (P3).
Decision IDs D1–D15 refer to [research.md](research.md); U- and L-numbers to [quickstart.md](quickstart.md);
cutover steps A–D to [contracts/cutover.md](contracts/cutover.md).

**Conventions for every task**:

- **No secrets or personal values in the repository**: no secret values, email addresses, IP addresses,
  Aiven host names, server hostnames or tenant IDs. Real values live on the server under
  `/srv/bikelog/secrets/` or `settings.env`, in ignored `.local/` files, or in GitHub environment secrets.
  Examples hold placeholders like `<server hostname>`.
- **Pinning**: images by digest; Debian packages in the backup image by exact version from the existing
  snapshot mechanism; any helper image used by tests (for example a local registry) by digest. Bicep CLI is
  0.48.1.
- **Shared server**: no script may create, change or delete anything outside the `bikelog` Compose
  project, `/srv/bikelog`, the `bikelog-deploy` account, `/etc/sudoers.d/bikelog-deploy` and the two
  `bikelog-backup` systemd units. Never `docker image prune -a` or `docker system prune`.
- **Shell**: Bash with `set -euo pipefail`, shellcheck-clean, arguments passed as arrays, never through
  `eval` or a shell string; never print environment values or `secrets/` contents.
- **Azure's app stays recreatable until cutover step D**: do not delete `infra/main.bicep`,
  `infra/modules/` or `infra/bootstrap.bicep` before T046.
- **Before each commit**: `./scripts/dev.sh lint`, the relevant test suites, `shellcheck`, `actionlint`.
- **Owner action**: tasks marked 👤 need the owner (server admin SSH, Azure, Aiven, Auth0 or GitHub
  consoles, a phone). The agent prepares commands and records sanitized results.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task belongs to (US1–US5)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Directories, examples and the records that make the move allowed.

- [X] T001 Create `deploy/upcloud/`, `deploy/upcloud/systemd/`, `deploy/upcloud/secrets.example/`, `scripts/upcloud/` and `scripts/upcloud/tests/`. Add `deploy/upcloud/README.md` (one paragraph: these files are copied to `/srv/bikelog` by `scripts/upcloud/install.sh`; real values never go here) linking to `docs/hosting/upcloud.md`.
- [X] T002 [P] Add `deploy/upcloud/settings.env.example` with placeholder values for the non-secret settings in data-model.md "Server secrets": `WEB_PUBLIC_ORIGIN=https://<server hostname>`, `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID`, `Operator__HostedDatabaseHost=<aiven host>`. Add `deploy/upcloud/secrets.example/app.env` (`AUTH0_CLIENT_SECRET`, `BIKELOG_WEB_DATABASE_URL`, `BIKELOG_SESSION_KEY`), `api.env` (`ConnectionStrings__Postgres`, with a comment that it must keep `SSL Mode=VerifyFull`, `Root Certificate=/mnt/secrets/aiven-ca-certificate` and the pool cap from the Azure secret) and `backup.env` (`BIKELOG_DATABASE_URL` with `sslmode=verify-full&sslrootcert=/mnt/secrets/aiven-ca-certificate`, `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_CERTIFICATE_FILE=/mnt/secrets/backup-client.pem`, `BACKUP_ACCOUNT_URL`, `BACKUP_CONTAINER=backups`). Placeholders only.
- [X] T003 [P] Write `docs/decisions/0007-upcloud-hosting.md` (FR-029, FR-031, research D14, D15): context (004 live with test data only; cold starts; the owner's UpCloud server already runs two apps with Compose and Caddy), decision (summary of D1–D12), alternatives rejected (from research), consequences (no cold start; one host, no failover; Caddy, Docker and OS versions owned by the shared server, recorded not pinned; app-restart alert not replaced; Aiven limited to the server; backups still in Azure). A "Future direction" section on moving the database to the server's shared PostgreSQL: no free-plan limits and one provider fewer, but database and app on one machine, shared with Gym Notebook and Subscription Tracker (own database and role at least), and backups away from the server become essential; not decided. Mark 0006 as superseded for hosting (add a line at its top) and note that 0003's Aiven choice stands.
- [X] T004 [P] 👤 Amend `.specify/memory/constitution.md` to 1.0.2 (research D14); the owner approves the amendment text before commit: in "Technology and Operational Constraints" replace "and Azure Container Apps for later cloud deployment" with "the owner's UpCloud server running Docker Compose behind Caddy for hosting, and Azure Blob Storage for backups", and add to the pinning rule "Tools on a host shared with other projects are recorded at setup rather than pinned by this repository."; add "Amendment 1.0.2 (2026-10-14)" under Governance with the reason and a link to decision 0007, affected: `PROJECT_PLAN.md`; update the version line and Last Amended date.
- [X] T005 [P] Update `PROJECT_PLAN.md` Phase 3: the hosting line names the UpCloud server (spec 005, decision 0007) instead of Azure Container Apps for the web app and API; keep Aiven; state that the platform for the asynchronous part (queue, worker) is to be decided when that slice is specified.
- [X] T005a 👤 Add a dated addendum to `docs/hosting/cost-estimate.md` for the resources this feature creates or keeps in Azure. New: the `alert-backup-missing-blobs` metric alert (about €0.10/month) and the app registration (free). Kept: storage, action group and budget. Expected total under €0.50/month. The owner approves it, and the approval date is recorded in `docs/hosting/upcloud-results.md` (create the file with T013's sections if it does not exist yet). No Azure resource is created before this approval (constitution: cost estimate before provisioning).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the Compose project and the core `deploy` path that every later story runs on.

**⚠️ CRITICAL**: no server work (US1–US5) starts until this phase is complete.

- [X] T006 Write `deploy/upcloud/compose.yaml` per [server-layout](contracts/server-layout.md) "Compose services": project name `bikelog`; images from `${WEB_IMAGE}`, `${API_IMAGE}`, `${MIGRATIONS_IMAGE}`, `${BACKUP_IMAGE}` (required, `:?`); `env_file` `settings.env` plus the service's secrets file; `web` with the environment from `infra/modules/containerApp.bicep` (`NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT=3000`, `BIKELOG_WEB_ACCESS_MODE=Authenticated`, `BIKELOG_API_ORIGIN=http://127.0.0.1:5080`, `BIKELOG_DATABASE_CA_FILE=/mnt/secrets/aiven-ca-certificate`), health check `node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"` every 10 s, timeout 5 s, 3 retries, start period 20 s, network `caddy` (external, name from `${CADDY_NETWORK:-caddy}`) with alias `bikelog-web`; `api` with `network_mode: service:web` and the API environment from `containerApp.bicep`; `migrate`, `ops` (API environment plus `Operator__HostedDatabaseHost`) and `backup` in profile `jobs`, `restart: "no"`; every service `mem_limit: 512m`, `cpus: 0.5`, `logging: {driver: local, options: {max-size: 10m, max-file: "3"}}`; `web`/`api` `restart: unless-stopped`; CA mounted read-only at `/mnt/secrets/aiven-ca-certificate`, and `backup-client.pem` at `/mnt/secrets/backup-client.pem` for `backup` only. No published ports. Add `deploy/upcloud/compose.host-caddy.yaml`, an override that publishes `127.0.0.1:3100:3000` on `web` and drops the `caddy` network, for the case where Caddy runs on the host (D2).
- [X] T007 [P] Write the test harness `scripts/upcloud/tests/run.sh` and `scripts/upcloud/tests/lib.sh` (tests first; they fail until T008): start a throwaway local registry (`registry` image pinned by digest) on a random loopback port; build stand-in images from `scripts/upcloud/tests/images/` and push them, recording digests: `web-ok` (serves `/healthz` 200 and has `node`; use a pinned `node` slim image with a 10-line server), `web-bad` (`/healthz` 503), `api` (sleeps), `migrate-ok` (exit 0), `migrate-fail` (exit 1), `backup` (writes a marker); create a temporary root with `compose.yaml` from T006, test `settings.env` and secrets files, and a test network in place of `caddy`. Run `bikelog-deploy` with `BIKELOG_ROOT=<tmp>`, `BIKELOG_IMAGE_PREFIX=127.0.0.1:<port>/bike-log` and `BIKELOG_DEPLOY_TEST=1`. Clean up every container, network, volume and image it created (and only those) on exit. Cases for this task: valid deploy succeeds with exit 0 and `release.env` written; a malformed reference, a name in the wrong position, an extra argument and `;`/`$()` in an argument exit 64 before Docker runs; `migrate-fail` exits 1 and leaves `release.env` and the running containers unchanged; `web-bad` after a good release exits 1 with the previous release serving and healthy; a second concurrent call waits on the lock (exit 75 with a short `BIKELOG_LOCK_WAIT`).
- [X] T008 Write `scripts/upcloud/bikelog-deploy` core per [deploy-command](contracts/deploy-command.md): settings `BIKELOG_ROOT` (default `/srv/bikelog`), `BIKELOG_IMAGE_PREFIX` (default `ghcr.io/juusimaa/bike-log`; either override is accepted only when `BIKELOG_DEPLOY_TEST=1` and refused when the root is `/srv/bikelog`), `BIKELOG_LOCK_WAIT` (default 900); `flock -w` on `deploy.lock` for every command; argument validation (`sha-[0-9a-f]{7}`, and `<prefix>/<name>@sha256:[0-9a-f]{64}` with `<name>` matching its position: web, api, migrations, backup); `deploy` steps 2–6 of research D5 (pull by digest; `docker compose run --rm migrate` with a 600 s timeout; write `release.env` with `IMAGE_TAG`, the four images and `DEPLOYED_UTC`, moving the old one to `release.previous.env`; `docker compose up -d --wait --wait-timeout 90 web api`; on failure restore the previous file, `up -d --wait` again, exit 1, or exit 2 if that also fails); `status`; `restart`; final line `result=<ok|failed|failed-unhealthy> tag=<tag> previous=<tag|none>`; never print environment values. Make T007's cases pass.
- [X] T009 Write `scripts/upcloud/install.sh` (idempotent, run as root on the server; `--dry-run` prints actions): refuse if `docker compose version` is not v2 or if `/srv/bikelog` exists but was not created by this script (marker file); create `/srv/bikelog` (root 0755), `secrets/` (root 0700), `bin/`; copy `compose.yaml` (and the host-Caddy override if `--caddy-on-host`), `bikelog-deploy` (0755); create the `bikelog-deploy` user with no password and not in `docker`; write `/etc/sudoers.d/bikelog-deploy` from [server-layout](contracts/server-layout.md), including `Defaults!/srv/bikelog/bin/bikelog-deploy env_keep += "SSH_ORIGINAL_COMMAND"` (sudo otherwise clears it), and check it with `visudo -c -f`; install `bikelog-backup.service` and `.timer` but leave the timer disabled; print the remaining manual steps (secrets, `authorized_keys` line, Caddy block). Never overwrite `settings.env`, `secrets/*` or `release*.env`.
- [X] T010 [P] Add the CI checks to `.github/workflows/ci.yml`: shellcheck over `scripts/upcloud/` and `scripts/upcloud/tests/`; `docker compose -f deploy/upcloud/compose.yaml config` with the example env files (fails on a published port or a missing `mem_limit`/`logging` on any service, checked with `jq` on `config --format json`); run `scripts/upcloud/tests/run.sh`. Pin any new action by SHA.

**Checkpoint**: `scripts/upcloud/tests/run.sh` passes locally and in CI (quickstart L2, L3).

---

## Phase 3: User Story 1 - Owner uses Bike Log from the UpCloud server (Priority: P1) 🎯 MVP

**Goal**: the server is prepared to serve Bike Log over HTTPS at its UpCloud hostname, owner-only, within
its resource limits, without disturbing the other apps.

**Independent Test**: quickstart U1, U2, U3 (gate on), U4 and U5. U1–U4 run in cutover step C (T027),
because the server may connect to the database only after Azure stops (US2).

- [X] T011 [P] [US1] Write `deploy/upcloud/Caddyfile.bikelog` exactly as in [server-layout](contracts/server-layout.md) "Caddy site block", with `<server hostname>` and `<owner address>` placeholders, a comment that no `tls` issuer may be pinned (D3) and no `header_up` added, and a commented host-Caddy variant proxying to `127.0.0.1:3100`.
- [X] T012 [P] [US1] Add `gate` to `scripts/upcloud/bikelog-deploy`: `gate owner-only <address>` validates an IPv4/IPv6 address or CIDR and prints the block to put in Caddy; `gate open` prints the block without the matcher. It does not edit Caddy files. Add a test case in `scripts/upcloud/tests/run.sh`.
- [X] T013 [US1] 👤 Server prerequisites (research D13, cutover A1): record in `docs/hosting/upcloud-results.md` (create it with sections "Server prerequisites", "Cutover", "Checks", "Restore rehearsals", "Findings"): Docker Engine and Compose versions; architecture; Caddy version, whether it runs in a container and its network name; firewall allows 80/443 and SSH; SSH is key-only; total/free memory and disk; IPv4 and IPv6 addresses (sanitized: record only that they exist); the default UpCloud hostname's form (sanitized) and that it resolves forward to the server; `/srv/bikelog` absent. Stop and report if Compose is not v2, free memory is under 1 GB or the hostname does not resolve.
- [X] T014 [US1] 👤 Run `scripts/upcloud/install.sh` on the server (cutover A2), first with `--dry-run`, then for real. Record the outcome.
- [X] T015 [US1] 👤 Secrets and settings (cutover A3, research D8): copy each Key Vault value into `/srv/bikelog/secrets/` (`az keyvault secret show … --query value -o tsv > file` run on the owner's machine and copied with `scp`, or typed; never through the repository or a chat), set modes 0600, write `settings.env` with the new `WEB_PUBLIC_ORIGIN`. Store the same values in the owner's password manager. Record which files exist (names only).
- [X] T016 [US1] 👤 Caddy (cutover A5): add the site block from T011 with the owner gate, reload Caddy, and confirm a certificate is issued for the hostname (`curl -sI https://<hostname>` from the owner's address gives a Caddy 502, since Bike Log is not running yet; from mobile data gives 403). Record the issuer. If no certificate is issued from either Let's Encrypt or ZeroSSL, stop and ask the owner for another address (spec edge case).
- [X] T017 [US1] 👤 Auth0 (cutover A6): add `https://<hostname>/auth/callback` to Allowed Callback URLs, `https://<hostname>` to Allowed Logout URLs and Allowed Web Origins of the hosted application, keeping the Azure ones for now. Record the date.

**Checkpoint**: server prepared, certificate issued, Auth0 accepts both addresses; nothing on the server
touches the database yet.

---

## Phase 4: User Story 2 - Owner switches over from Azure without two apps sharing the database (Priority: P1)

**Goal**: Azure stops using the database before the server starts; the server serves the existing records;
a tested fallback exists until the checks pass.

**Independent Test**: follow [cutover](contracts/cutover.md) B and C; the recorded Azure session count is 0
before the server starts; `db-connections` shows only the server; records created on Azure are present.

- [X] T018 [P] [US2] Add `db-connections` to `scripts/upcloud/bikelog-deploy`: runs `psql` in the `backup` service with `SELECT client_addr IS NOT NULL AS remote, count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() GROUP BY 1` and prints counts by `client_addr` with the last octet masked, no query text. Owner-only caller. Test case in `scripts/upcloud/tests/run.sh` against a local PostgreSQL 18.6 (pinned digest).
- [X] T019 [US2] Write the cutover section of `docs/hosting/upcloud.md` (create the file with sections Setup, Deploy, Rollback, Secrets and rotation, Backups, Restore, Operator commands, Cutover, Changing the address): the exact commands for every step of [cutover](contracts/cutover.md) A–D, including `gh workflow disable deploy.yml`, `az containerapp revision deactivate`, removing the Azure backup job's schedule, the Aiven console steps for Current queries and the IP allow-list, the server deploy by hand with the current `main` digests (`docker buildx imagetools inspect` as in `deploy.yml`), and the full fallback in C.
- [X] T020 [US2] 👤 Cutover B1–B2: disable the Azure deploy workflow; deactivate the active `ca-bikelog` revision; remove the backup job's schedule. Record UTC times (downtime starts).
- [X] T021 [US2] 👤 Cutover B3–B4: in Aiven's console confirm 0 client sessions and record the count; set the IP allow-list to the server's address(es) only (IPv6 too if T013 found IPv6 egress).
- [X] T022 [US2] 👤 Cutover B5–B6: on the server, `sudo /srv/bikelog/bin/bikelog-deploy deploy <tag> <web> <api> <migrations> <backup>` with the digests of the current `main`; then `sudo bikelog-deploy db-connections`. Record the result line and that only the server's address appears. There is no previous release on this first deploy, so if it fails (exit 2) the fallback is cutover C (Azure).
- [X] T023 [US2] 👤 Check (cutover C): run quickstart U1 (records created on Azure are present), U3 with the gate on, U4 and U11. Record each result, and the time the new address served its first signed-in page (end of downtime); check SC-006: no more than 30 minutes unavailable, and under 2 hours from T020 to the end of this task. On any failure, run the fallback in cutover C1–C4, record what failed, and stop this phase.

**Checkpoint**: the server serves Bike Log against Aiven; Azure is stopped but still recreatable.

---

## Phase 5: User Story 3 - Owner trusts that records can be recovered (Priority: P1)

**Goal**: daily backups from the server into the existing Azure storage, write-only, with a missed-backup
alert, and a rehearsed restore of a post-move backup.

**Independent Test**: quickstart U8 and U9.

- [X] T024 [P] [US3] Test first in `scripts/hosted/tests/run.sh`: a new case generates a throwaway RSA key and self-signed certificate with `openssl`, runs the client-assertion function from `images/backup/backup.sh` (exposed with `BACKUP_TEST_PRINT_ASSERTION=1`, local tests only, refused otherwise) and verifies the JWT: header `alg=RS256`, `typ=JWT`, `x5t#S256` equal to the base64url SHA-256 of the certificate's DER; claims `aud=https://login.microsoftonline.com/<tenant>/oauth2/v2.0/token`, `iss` and `sub` equal to the client ID, `jti` unique across two runs, `nbf` ≤ now, `exp` within 10 minutes; signature valid with `openssl dgst -verify`. Existing cases keep passing.
- [X] T025 [US3] Add the certificate sign-in path to `images/backup/backup.sh` (research D10): when `AZURE_CLIENT_CERTIFICATE_FILE` is set (with `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`), build the client-assertion JWT with `openssl` (base64url without padding), POST `grant_type=client_credentials`, `client_id`, `client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer`, `client_assertion`, `scope=https://storage.azure.com/.default` to the tenant token endpoint, and write the token to the auth header file as `blob_auth` does now; keep the managed-identity path when `IDENTITY_ENDPOINT` is set; fail closed with a clear message when neither is configured; never log the assertion or token. Update the settings check at the top. Make T024 pass.
- [X] T026 [US3] Check whether the `postgres:18.6` base image already has the `openssl` CLI (`docker run --rm --entrypoint openssl <pinned digest> version`). If not, add `openssl=<exact trixie version>` to the pinned install list in `images/backup/Dockerfile` and to `scripts/hosted/update-backup-pins.sh`. Record the finding in `docs/hosting/upcloud-results.md` "Findings" (create the file with T013's sections if it does not exist yet).
- [X] T027 [US3] Add `backup` and `backup-verify-permissions` to `scripts/upcloud/bikelog-deploy` (run the `backup` service once, under the lock; owner and timer callers only), and write `deploy/upcloud/systemd/bikelog-backup.service` (`Type=oneshot`, `ExecStart=/srv/bikelog/bin/bikelog-deploy backup`) and `bikelog-backup.timer` (`OnCalendar=*-*-* 02:30:00 UTC`, `Persistent=true`, `RandomizedDelaySec=10m`). Test case: the timer caller is allowed only `backup`.
- [X] T028 [US3] Write `infra/backup.bicep` and `infra/backup.example.bicepparam` (research D12, data-model "Azure resources kept"): the storage account, `backups` container, lifecycle rule and Bike Log Backup Writer role exactly as in `infra/bootstrap.bicep` (same names, so deploying it adopts the existing resources without change); role assignments for the owner (Storage Blob Data Reader on `backups`) and a new `backupPrincipalId` parameter (Backup Writer on `backups`); the action group `ag-bikelog-owner`; metric alert `alert-backup-missing-blobs` scoped to the storage account's `blobServices/default`, metric `Transactions`, dimensions `ApiName` = `PutBlob` and `ResponseType` = `Success`, total over `P1D`, evaluated `PT1H`, `LessThan 2`; the €10 budget with the three notifications. Same API versions as the existing templates. Add `bicep build` and lint of it to `ci.yml`.
- [X] T029 [US3] 👤 Backup identity (cutover A4), after T005a's approval: create the app registration **Bike Log backup (UpCloud)** with no secrets; on the server, as root, create the key and a one-year self-signed certificate into `/srv/bikelog/secrets/backup-client.pem` (0600) and upload only the certificate (`.crt`) to the app registration; record the certificate expiry date. Deploy `infra/backup.bicep` with `backupPrincipalId`; it must show only the new role assignment and the new alert as changes. Fill `backup.env`.
- [X] T030 [US3] 👤 After T023 passes: `sudo bikelog-deploy backup`, `scripts/hosted/hosted.sh backups`, `sudo bikelog-deploy backup-verify-permissions`; enable `bikelog-backup.timer`; next day confirm it ran (`systemctl list-timers`, `journalctl -u bikelog-backup`). Run `sudo bikelog-deploy backup && sudo bikelog-deploy db-connections` while the owner is using the app (both take the deploy lock, so the count is taken straight after the backup), add the backup's 2 connections, and record the peak, which must be no more than 15 (FR-010). Record results (quickstart U8, first part).
- [X] T031 [US3] 👤 Restore rehearsal (quickstart U9): `scripts/hosted/restore-rehearsal.sh <post-move blob>`; record date, blob, duration and checks in the "Restore rehearsals" table of `docs/hosting/upcloud-results.md`.
- [x] T032 [US3] 👤 Missed-backup alert (quickstart U8, second part): stop the timer for one day, confirm the email from `alert-backup-missing-blobs`, re-enable the timer. Record the times.

**Checkpoint**: daily backups land in Azure from the server; a post-move backup restores with all checks
passing.

---

## Phase 6: User Story 4 - Owner deploys changes safely and repeatably (Priority: P2)

**Goal**: merges deploy automatically through the restricted key; failed versions roll back; disk and logs
stay bounded.

**Independent Test**: quickstart U6, U7 and U10.

- [X] T033 [P] [US4] Tests first in `scripts/upcloud/tests/run.sh`: `rollback` swaps the two release files and serves the previous tag without running `migrate` (assert the migrate stand-in's marker is absent); `rollback` with no previous release exits 64; the disk check exits 73 when `BIKELOG_TEST_FREE_BYTES` (test-only override) says less than 3 GB would remain, and nothing is pulled; after three successful deploys only the current and previous digests of the test prefix remain, and an unrelated image tagged in the same local registry and one pulled from elsewhere are untouched; the forced-command caller (`SSH_ORIGINAL_COMMAND` set and `SUDO_USER=bikelog-deploy`) may run `deploy`, `rollback` and `status` only (others exit 64), and its positional arguments are ignored.
- [X] T034 [US4] Implement in `scripts/upcloud/bikelog-deploy`: caller detection and the command table from [deploy-command](contracts/deploy-command.md) "Invocation"; parsing `SSH_ORIGINAL_COMMAND` into an array without shell evaluation (split on spaces, reject any character outside `[A-Za-z0-9@:/._-]`); `rollback`; the disk check (step 1 of D5: sum the compressed layer sizes from `docker buildx imagetools inspect --raw` or `docker manifest inspect -v`, plus 500 MB margin, against `df` of `docker info --format '{{.DockerRootDir}}'`); pruning (step 7: remove images of the four repositories under the prefix whose digest is in neither release file, by explicit reference). Make T033 pass.
- [X] T035 [US4] Rewrite `.github/workflows/deploy.yml` (research D4): same triggers and `concurrency`; `workflow_dispatch` inputs `image_tag` (optional) and `rollback` (boolean); keep "Choose the image tag" and "Resolve image digests"; remove every Azure step; write `UPCLOUD_SSH_KNOWN_HOSTS` (environment variable) to a temporary `known_hosts` and `UPCLOUD_DEPLOY_SSH_KEY` (environment secret) to a 0600 file in `$RUNNER_TEMP`; run `ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=… -i … bikelog-deploy@"$UPCLOUD_HOST" deploy <tag> <web> <api> <migrations> <backup>` (or `rollback`); fail the job on a non-zero exit; put the result line and the rollback command in the step summary; delete the key file in an `always()` step. Permissions `contents: read` only (no `id-token`). Keep the trigger disabled with `if: false` on the job until T045, and say so in a comment. `actionlint` clean.
- [X] T036 [US4] Write the Deploy, Rollback and Secrets and rotation sections of `docs/hosting/upcloud.md`: how merges deploy; `gh workflow run deploy.yml -f rollback=true`; reading `bikelog-deploy status`; deploy key creation (`ssh-keygen -t ed25519`), the `authorized_keys` line `restrict,command="sudo /srv/bikelog/bin/bikelog-deploy" <key>`, rotation and revocation; pinning the host key (`ssh-keyscan` checked against the server's own fingerprint); per-secret rotation order (Aiven password, session key, Auth0 client secret, backup certificate) ending with `bikelog-deploy restart`.
- [X] T037 [US4] 👤 GitHub `production` environment (cutover A7): add `UPCLOUD_DEPLOY_SSH_KEY` and `UPCLOUD_HOST` as environment secrets and `UPCLOUD_SSH_KNOWN_HOSTS` as an environment variable; install the public key in `/home/bikelog-deploy/.ssh/authorized_keys` (0600, owned by `bikelog-deploy`) with the options above. From the owner's machine, confirm `ssh -i <key> bikelog-deploy@<host> status` works and `ssh -i <key> bikelog-deploy@<host> bash` and `-L` port forwarding are refused. Record results.
- [X] T038 [US4] Failed-deploy rehearsal for quickstart U7. The deploy script accepts only the four real repositories, so the failure is produced by configuration, not by a broken image: add an owner-only option `deploy … --api-env <file>` to `scripts/upcloud/bikelog-deploy` (the file must be a plain name inside `secrets/`; refused for the deploy-key caller) and make `deploy/upcloud/compose.yaml` take the API's secrets file from `${API_ENV_FILE:-api.env}`. For the rehearsal the owner copies `api.env` to `api.unhealthy.env` with an unreachable database host, deploys the current tag with `--api-env api.unhealthy.env`, observes the automatic fallback (exit 1, previous release healthy), then deletes the copy. The option is never written to `release.env`, so a later deploy or rollback uses `api.env`. Add test cases (option accepted for the owner, refused for the deploy key, path outside `secrets/` refused).
- [X] T039 [US4] Check that no workflow other than the old `deploy.yml` history references Azure deploy settings: `grep -rnE "AZURE_|containerapp|azure/login" .github/workflows` must find nothing. Fix any hit.

**Checkpoint**: the restricted key works and is refused for anything else; the deploy script's rollback,
disk check and pruning pass their tests.

---

## Phase 7: User Story 5 - Operator manages pilot riders on the server (Priority: P3)

**Goal**: provisioning and disabling riders against Aiven from the server, with no new endpoint.

**Independent Test**: quickstart U12.

- [X] T040 [P] [US5] Tests first in `scripts/upcloud/tests/run.sh`: `provision-pilot-user --subject auth0|abc --email a@example.test` passes `--provision-pilot-user --subject auth0|abc --email a@example.test` to the `ops` stand-in as separate arguments (the stand-in echoes its argv as JSON); a subject not matching `^(auth0|email)\|[A-Za-z0-9._-]+$`, an address with spaces or quotes, a non-UUID `--owner`, a missing or repeated option all exit 64; the deploy-key caller is refused.
- [X] T041 [US5] Implement `provision-pilot-user`, `disable-pilot-user` and `enable-pilot-user` in `scripts/upcloud/bikelog-deploy` with the validation rules of `scripts/hosted/hosted.sh` (`option` helper semantics: every option exactly once), running `docker compose run --rm ops <operator args>` under the lock. Make T040 pass.
- [X] T042 [US5] Update `scripts/hosted/hosted.sh`: keep `backups` and `cost`; make `status`, `provision-pilot-user`, `disable-pilot-user`, `enable-pilot-user`, `backup-now` and `backup-verify-permissions` print "moved to bikelog-deploy on the server (docs/hosting/upcloud.md)" and exit 2; update its usage header and `scripts/hosted/hosted.env.example`.
- [X] T043 [US5] Write the Operator commands section of `docs/hosting/upcloud.md` (each command, run with `sudo` over the owner's admin SSH session, what it prints and how to check the result).
- [ ] T044 [US5] 👤 Quickstart U12: provision a test rider, sign in as them, disable, reload, re-enable. Record results.

**Checkpoint**: riders can be managed on the server with the same guarantees as in 004.

---

## Phase 8: Finish the cutover and polish

**Purpose**: enable automatic deploys, remove Azure, rotate what Azure held, and record the results.

- [X] T045 👤 Cutover D1: remove `if: false` from `deploy.yml` (PR), merge, and confirm the automatic deploy (U6); then U7 using T038's rehearsal and `gh workflow run deploy.yml -f rollback=true`, timing both against SC-005; then U5 (reboot). Record results and times.
- [ ] T046 👤 Cutover D3: delete in Azure `ca-bikelog`, `job-bikelog-migrate`, `job-bikelog-ops`, `job-bikelog-backup`, the Container Apps environment, the log workspace, `alert-app-restarts`, `alert-backup-missing`, `id-bikelog-app`, `id-bikelog-deploy` (with its federated credential) and the Key Vault (after confirming every value is in the owner's password manager). Then delete `infra/main.bicep`, `infra/main.bicepparam`, `infra/modules/`, `infra/bootstrap.bicep`, `infra/bootstrap.example.bicepparam` and `scripts/hosted/install-bicep.sh` if nothing else uses it, and their CI checks in `ci.yml`; redeploy `infra/backup.bicep`, which must report no changes. Record the deleted resources.
- [ ] T047 👤 Cutover D4–D6: rotate the Aiven `avnadmin` password; update `api.env`, `app.env` and `backup.env`; `sudo bikelog-deploy restart` and one `backup`; remove the Azure URLs from Auth0; remove the `AZURE_*` variables and the `INGRESS_ALLOW_CIDRS` and `AIVEN_DATABASE_HOST` secrets from the GitHub `production` environment, and the federated subject from Azure if any remains. Record dates.
- [ ] T048 👤 Cutover D7: run U3 again with the gate open (`bikelog-deploy gate open`, apply in Caddy), including the "other address" and uninvited-email checks from mobile data, and U2 after at least 3 hours idle. From a phone on mobile data, time signing in and logging a ride, starting from opening the address: under 1 minute (SC-001). Record results.
- [X] T049 [P] Write the remaining sections of `docs/hosting/upcloud.md` (Setup from scratch on a new server, Backups including certificate renewal before the recorded expiry, Restore pointing to `restore-rehearsal.sh`, Changing the address: `WEB_PUBLIC_ORIGIN`, Caddy site name, Auth0 URLs, Aiven allow-list if the IP changes).
- [X] T050 [P] Mark `docs/hosting/setup.md`, `docs/hosting/operations.md` and `docs/hosting/setup-results.md` as historical (a first line linking to `upcloud.md` and decision 0007; contents unchanged); update `docs/containers.md` to point to `deploy/upcloud/`; update the README's hosted deployment section and badges (the deploy badge still applies).
- [ ] T051 [P] Secrets scan (quickstart U13): `gitleaks detect --redact` over the repository; `gitleaks detect --no-git` over the exported filesystems of the published `web`, `api`, `migrations` and `backup` images (as 004 did); search the deploy workflow logs and `docker logs` of `web`, `api` and one `backup` run for the database password, session key and client secret; search `docker logs` of `web` and `api` for the test bike's name and a ride note (expect zero hits, FR-019). Record results.
- [ ] T052 Quickstart U10 after ten deploys and U14 after the first full month: record image list, log sizes, Bike Log disk use and Azure cost. After 30 days, count the dumps in `hosted.sh backups`: at least 28, and every missing day must match an alert email (SC-008). Then update "Real records allowed from" at the top of `docs/hosting/upcloud-results.md` once U1, U3 (gate open), U5, U7, U8, U9 and U11 have passed (quickstart "Gate").
- [ ] T053 Run quickstart L1–L6 on the final branch and `/speckit-analyze`; fix any inconsistency between spec, plan, contracts and the delivered files.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: none. T003–T005 are records and can run alongside everything in Phase 2.
- **Foundational (Phase 2)**: T006 → T007 → T008; T009 needs T006 and T008; T010 needs T007.
- **US1 (Phase 3)**: needs Phase 2. T013 → T014 → T015 → T016; T017 any time after T013.
- **US2 (Phase 4)**: needs US1's checkpoint and T018, T019. T020 → T021 → T022 → T023 in strict order
  (cutover B, then C).
- **US3 (Phase 5)**: code tasks T024–T028 can run in parallel with Phases 3–4; T029 after T005a and
  before T020 (cutover A4); T030–T032 after T023.
- **US4 (Phase 6)**: code tasks T033–T036 and T038 can run in parallel with Phases 3–5 (T034 after T008;
  T038 after T034); T037 before T045.
- **US5 (Phase 7)**: T040–T043 can run any time after T008; T044 after T023.
- **Phase 8**: T045 after T023, T035, T037, T038; T046 after T030 and T045; T047 after T046; T048 after
  T045; T049–T051 any time after T046; T052 and T053 last.

### User Story Dependencies

- US1 is prepared alone, but its live checks run inside US2's cutover (T023), because the server may only
  reach the database once Azure has stopped.
- US3's server backups need the server running (T023) and must work before Azure is deleted (T046).
- US4's automatic deploy is enabled only after cutover (T045).
- US5 is independent once the server serves (T023).

### Within Each Story

- Script tests are written first and must fail before the implementation task.
- `scripts/upcloud/bikelog-deploy` is one file: tasks that change it (T008, T012, T018, T027, T034, T038,
  T041) run sequentially, in that order, even when their stories could otherwise run in parallel.

### Parallel Opportunities

- T002–T005 together (T005a after the others, since its figures depend on the design); T007 alongside T006's review.
- T011, T024, T028 and T033 (different files) alongside each other once Phase 2 is done.
- T049, T050 and T051 together at the end.

---

## Parallel Example: after Phase 2

```bash
Task: "Write deploy/upcloud/Caddyfile.bikelog (T011)"
Task: "Client-assertion test in scripts/hosted/tests/run.sh (T024)"
Task: "Write infra/backup.bicep and backup.example.bicepparam (T028)"
Task: "Rollback, disk and pruning tests in scripts/upcloud/tests/run.sh (T033)"
```

---

## Implementation Strategy

### MVP (US1 + US2)

1. Phases 1–2: records, Compose project, core deploy script with its tests.
2. Phase 3: prepare the server, Caddy and Auth0, without database access.
3. Phase 4: cutover B and C. **Stop and validate**: the app serves from the server with the existing test
   records, owner-only; the fallback to Azure is still possible.

### Incremental delivery

1. MVP above.
2. US3: backups from the server and a restore rehearsal (needed before Azure is deleted and before real
   records).
3. US4: automatic, health-gated deploys and rollback through the restricted key.
4. US5: rider management on the server.
5. Phase 8: remove Azure, rotate, open the gate, record.

---

## Notes

- [P] tasks touch different files and depend on no incomplete task.
- 👤 tasks are run by the owner; the agent prepares exact commands in `docs/hosting/upcloud.md` and records
  sanitized results in `docs/hosting/upcloud-results.md`.
- Commit after each task or logical group, with Conventional Commit prefixes.
