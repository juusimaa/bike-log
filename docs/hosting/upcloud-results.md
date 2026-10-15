# UpCloud hosting: recorded results

Results for [spec 005](../../specs/005-upcloud-hosting/spec.md), recorded as observed and sanitized: no
secrets, email addresses, database host names, server hostnames or IP addresses. Steps follow
[upcloud.md](upcloud.md) and the [cutover contract](../../specs/005-upcloud-hosting/contracts/cutover.md);
scenario IDs are from the [quickstart](../../specs/005-upcloud-hosting/quickstart.md).

**Real records allowed from**: not yet. Requires U1, U3 (gate open), U5, U7, U8, U9 and U11 recorded as
passed (quickstart "Gate").

## Approvals

| Item | Date | Notes |
| --- | --- | --- |
| Cost addendum in [cost-estimate.md](cost-estimate.md) (T005a) | 2026-10-14 | Approved by the owner; Azure changes from step A4 may proceed |
| Constitution amendment 1.0.2 (T004) | 2026-10-14 | Approved by the owner |

## Server prerequisites

Cutover A1 (research D13), checked 2026-10-14.

| Check | Result |
| --- | --- |
| Docker Engine version | 29.9.0 |
| Docker Compose version (v2 or later) | v5.6.0 |
| Docker Buildx present | v0.38.0 |
| Architecture | linux/amd64 |
| Caddy version; in a container?; network name | 2.11.7, in a container owned by the Subscription Tracker Compose project; shared network `edge` (so `CADDY_NETWORK=edge`); site files from a shared host directory, imported as `/etc/caddy/sites/*.caddy` (Bike Log's goes in as `bikelog.caddy`); publishes 80/tcp, 443/tcp and 443/udp |
| Firewall allows 80, 443 and SSH | UpCloud firewall (IPv4 rules): inbound TCP 22, 80 and 443, DNS, NTP, ICMP, and return traffic on ports 32768–60999; nothing else, including 443/udp and any IPv6. Host: ufw inactive; nftables holds only Docker's rules. Bike Log publishes no port |
| SSH key-only | Yes (`passwordauthentication no`, `kbdinteractiveauthentication no`) |
| Memory total / free (at least 1 GB free) | 1,855 MB total, 1,067 MB available, no swap; the running apps use about 230 MB. Borderline: Bike Log's measured use is checked in U4 |
| Disk total / free on Docker's data root | 20 GB, 13 GB free |
| IPv4 present; IPv6 present | Both. Docker's bridge networks are IPv4-only, so containers reach Aiven over IPv4 (checked at B6) |
| Default UpCloud hostname form; resolves forward to the server | `<ip-with-dashes>.fi-hel1.upcloud.host`; A record resolves to the server; no AAAA record |
| `/srv/bikelog` absent before install | Absent |

## Cutover

Each step of the cutover contract with its UTC time and outcome. Pending.

| Step | UTC | Outcome |
| --- | --- | --- |
| A2 install.sh (dry run, then real) | 2026-10-14 | Passed. Dry run listed only Bike Log's paths, the `bikelog-deploy` account, its sudoers file and the two backup units; the real run created them, timer disabled. Missing afterwards, as expected: `settings.env` and the `secrets/` files |
| A3 secrets and settings copied (file names only) | 2026-10-14 | `settings.env`; `secrets/app.env`, `api.env`, `backup.env` (root 0600) and `aiven-ca-certificate` (0644). `api.env` keeps `SSL Mode=VerifyFull` and `Maximum Pool Size=3`. `backup.env` gets its Azure lines in A4. The six Key Vault values the server uses are also in the owner's password manager (2026-10-14) |
| A4 backup app registration; certificate expiry; backup.bicep deployed | 2026-10-14 10:35 | App registration **Bike Log backup (UpCloud)** with one certificate credential and no client secret (a duplicate upload of the same certificate was removed). Certificate created on the server, private key only there; **expires 2027-10-14 10:17 UTC**, renew before. `secrets/backup.env` completed (6 settings). `infra/backup.bicep` what-if showed only the server's Backup Writer assignment and `alert-backup-missing-blobs` as new, after the template was made to state Azure's existing defaults; deployment succeeded; a second what-if reports no change |
| A5 Caddy site block, certificate issuer | 2026-10-14 | `bikelog.caddy` added to the shared sites directory with the owner gate; `caddy validate` passed, reload kept the other sites running. Certificate issued on the first attempt by Let's Encrypt (YE2), valid to 2027-01-12, renewed by Caddy. From the owner's address: HTTPS 502 (app not running yet), HTTP 308 to HTTPS. From mobile data: empty 403 page |
| A6 Auth0 URLs added | 2026-10-14 | Callback `/auth/callback`, logout `/?signedOut=1` and web origin for the new address added to the hosted application, beside the Azure entries |
| A7 GitHub production environment | 2026-10-14 | Deploy key (Ed25519) installed with `restrict,command="sudo /srv/bikelog/bin/bikelog-deploy"`. Server host key scanned and matched against the server's own fingerprint. From the owner's machine: `status` works (exit 0); `bash` and `restart` refused (exit 64); port forwarding refused (`administratively prohibited`). GitHub `production`: secrets `UPCLOUD_DEPLOY_SSH_KEY`, `UPCLOUD_HOST` and variable `UPCLOUD_SSH_KNOWN_HOSTS` set; the private key deleted from the owner's machine |
| B1 Azure deploy workflow disabled (downtime starts) | 12:15:51 | PR #28 merged as `8a4144b`, then `gh workflow disable deploy.yml`. Containers built `sha-8a4144b` by 12:17 |
| B2 Azure revision deactivated; backup job schedule removed | 12:17:32 | **Downtime starts.** `az containerapp revision deactivate` worked in single revision mode: inactive, 0 replicas, Stopped. Backup job cron changed from `30 2 * * *` to `0 0 31 2 *`; no execution running |
| B3 Aiven client sessions before the server starts (must be 0) | ~12:20 | 0 client sessions in Current queries |
| B4 Aiven allow-list set to the server | ~12:22 | Previous value: open to all IPv4 and IPv6 addresses. New: the server's IPv4 address `/32` only |
| B5 first deploy on the server (result line) | ~12:25 | `result=ok tag=sha-8a4144b previous=none`; no migrations to apply; `web` and `api` healthy |
| B6 `db-connections` shows only the server | ~12:26 | One session from the server's masked address and one with no client address (Aiven's own, local to its host); none from elsewhere |
| C checks passed; first signed-in page on the new address (downtime ends) | 12:30 | **Downtime ends**: owner signed in at the new address. Unavailable about 13 minutes (target 30); B1 to C about 15 minutes (target 2 hours) |
| D1 automatic deploy enabled | 12:38:56 | PR #29 merged; first automatic deploy passed (U6) |
| D2 backup timer enabled | 12:33 | First server backup 12:33:12–12:33:18: Entra accepted the certificate assertion; dump 54,352 bytes, 196 rows, manifest uploaded; database round trip median 30 ms. `backup-verify-permissions`: overwrite and delete both HTTP 403, blob unchanged. Both files listed by `hosted.sh backups`. Timer enabled by the owner |
| D3 Azure resources deleted | | |
| D4 Aiven password rotated | | |
| D5 Azure URLs removed from Auth0 | | |
| D6 Azure variables and secrets removed from GitHub | | |
| D7 owner gate opened | | |

## Checks

Quickstart U1–U14. Pending.

| ID | Date | Result | Notes |
| --- | --- | --- | --- |
| U1 | 2026-10-14 | Passed | Owner signed in at the new address at 12:30 UTC and logged a test ride. The first server backup holds the test bike with its 27 components from Azure and 2 rides (one from Azure, one new), so the records came over and the new address writes to the same database. Second device: not yet checked |
| U2 | | | |
| U3 (gate on) | 2026-10-14 | Passed | From the owner's address: `/api/bikes` and `/api/me` without a session 401; POST with a foreign Origin or none 403; `X-Forwarded-Host` ignored (401); `/openapi/v1.json` and `/health/ready` 404; `http://` 308 to HTTPS; ports 3000, 5080 and 3100 closed. An altered `Host` gets Caddy's empty 200 for an unknown site and never reaches the app (004: the platform's 404). From mobile data: 403 (A5) |
| U3 (gate open) | | | |
| U4 | 2026-10-14 | Passed | Gym Notebook and Subscription Tracker work. `bikelog-api` 108 MB and `bikelog-web` 135 MB (caps 512 MB); server memory available 867 MB of 1,855 MB, no swap |
| U5 | 2026-10-14 | Passed | `sudo reboot` at about 13:04 UTC. Probe from the owner's address: unavailable 13:03:47–13:05:23, about 1.5 minutes, for all three apps; Bike Log came back without manual steps (`status`: current `sha-1b3d51b`, web healthy; every container of the three apps up; backup timer still scheduled) |
| U6 | 2026-10-14 | Passed | Merge of PR #29 at 12:38:56 UTC; Containers built by 12:40:03; Deploy ran on the server through the deploy key, `result=ok tag=sha-421369a previous=sha-8a4144b`, live at 12:41:05: about 2 minutes (target 15). The public log masks the server address and shows no key |
| U7 | 2026-10-14 | Passed (second attempt) | After the fix (PR #30) and `install.sh`: redeploy with an unreachable database host gave `container bikelog-web-1 is unhealthy`, the previous release restored by itself, `result=failed`, exit 1, rollback target kept. Probe from the owner's address: unavailable 13:00:37–13:01:15, **38 s** (target 60). `gh workflow run deploy.yml -f rollback=true`: `result=ok tag=sha-421369a previous=sha-1b3d51b` in 28 s, about 6 s unavailable; rolled forward the same way in 24 s. First attempt: see Findings |
| U8 | | | |
| U9 | 2026-10-14 | Passed | Restore rehearsal of the first post-move backup; see "Restore rehearsals" |
| U10 | | | |
| U11 | 2026-10-14 | Passed | TCP to the Aiven host from the owner's machine refused or timed out; the server connects (B5, B6) |
| U12 | | | |
| U13 | 2026-10-15 | Partly passed | Repository, published images and deploy workflow logs done (see Findings); `docker logs` of `web`, `api` and one `backup` run on the server are still to search, for the secrets and for the test bike's name and a ride note |
| U14 | | | |

## Restore rehearsals

| Date | Blob | Duration | Checks | Outcome |
| --- | --- | --- | --- | --- |
| 2026-10-14 | `2026-10-14/bikelog-20261014T123312Z.dump` (first backup from the server) | 2 s | dump SHA-256, `pg_restore` exit, row counts of all 13 tables, 27 usage entries with 0 differing totals, latest migration `20261013073652_ComponentGroupsWeight` | Passed |

## Findings

- **2026-10-14, `openssl` in the backup image (T026).** The pinned `postgres:18.6` base image
  (`sha256:74935e72…`) already contains the `openssl` CLI, package `openssl 3.5.7-1~deb13u3`, checked with
  `docker run --rm --entrypoint openssl <pinned image> version`. Its version is fixed by the base image
  digest, so `images/backup/Dockerfile` and `scripts/hosted/update-backup-pins.sh` are unchanged.
- **2026-10-14, local checks (L1–L4, L6).** `scripts/upcloud/tests/run.sh` passed against a private
  Docker 29.8.2 daemon: validation before Docker, lock, failed migration, health-gate fallback, rollback
  without migrations, disk check, pruning scope, caller limits and `db-connections` against PostgreSQL
  18.6. `scripts/hosted/tests/run.sh` passed with the new client-assertion case. The assertion is checked
  for structure and signature only; Entra accepting it is proven by the first server backup (U8).
- **2026-10-14, owner of `backup-client.pem` (A4).** The file is owned by uid 999 so the backup image's
  `postgres` user can read it. On this server, uid 999 is also the `bikelog-deploy` account (system accounts
  are numbered downwards from 999) and gid 999 is `systemd-journal`. Neither can open it: `secrets/` is root
  0700. No change made.
- **2026-10-14, the health gate missed an API-only failure (U7, first attempt).** Redeploying the current
  images with `--api-env api.unhealthy.env` (an unreachable database host) reported `result=ok`: only `api` was
  recreated, and Compose accepted the untouched `web` container's earlier "healthy" status after 1.2 s. The
  probe from the owner's address saw 503 for 56 s until the owner ran `restart`. The same would let a real
  release that changes only the API through. Also, the redeploy of the same images made `previous` equal to
  `current`, and pruning removed the real previous release's images. Fixed in `bikelog-deploy`: every deploy,
  rollback and fallback recreates `web` and `api`, and redeploying the current images keeps `previous`. The web
  health check now runs every 2 s while starting and every 5 s after (was 10 s), so a broken release is found
  in about 35 s. The stand-in web now asks the stand-in API for readiness, as the real one does; the new test
  case fails against the old script (`exit 0, expected 1`) and passes with the fix.
- **2026-10-14, the backup timer's first "LAST" time (D2).** Right after `systemctl enable --now`,
  `list-timers` showed a LAST time although the service had never run: with `Persistent=true`, systemd records
  the first activation as the last trigger instead of running a missed job. The systemd path was then proven
  by hand: `systemctl start bikelog-backup.service` at 13:11:51 UTC ran `bikelog-deploy backup` as the timer
  caller and wrote `2026-10-14/bikelog-20261014T131152Z.dump` (54,352 bytes, 196 rows). The first scheduled
  run is 2026-10-15 at about 02:33 UTC.
- **2026-10-15, secret scan of the repository and published images (U13, first part).** `gitleaks detect
  --redact` v8.24.3 (Docker, `sha256:e1b35e12…`) over 75 commits: no leaks after adding the squash-merged
  commit of the two public Key Vault role IDs in `infra/bootstrap.bicep` to `.gitleaksignore` (004 ignored
  only the branch commit). `gitleaks detect --no-git` over the exported amd64 filesystems of the published
  `sha-8557aa8` images: `api` (`sha256:b6ae12a9…`) and `migrations` (`sha256:22a9f559…`) clean. `web`
  (`sha256:c91f57b8…`): the Next.js Server Actions encryption key and Draft Mode preview keys found in 004,
  plus a false positive in Node's `v8-internal.h`. The build registers no Server Actions and the source uses
  neither `"use server"` nor `draftMode`, so the keys still protect nothing. `backup` (`sha256:98b3e1a2…`):
  Debian's unused `ssl-cert-snakeoil.key` and the Perl `cop.h` false positive, as in 004.
  Deploy workflow logs: the last 16 runs (2026-10-14 04:19 to 2026-10-15 04:31 UTC, `gh run view --log`)
  have no `Password=`, JWT, `sig=`, private key, `client_secret`, bearer token or email address; `gitleaks`
  finds only `AUTH0_CLIENT_ID` in seven Azure-era runs, which the 004 workflow printed as a job variable. A
  client ID is public (every browser sign-in sends it), and the current workflow does not print it.
