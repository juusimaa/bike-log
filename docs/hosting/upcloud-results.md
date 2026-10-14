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
| D1 automatic deploy enabled | | |
| D2 backup timer enabled | | |
| D3 Azure resources deleted | | |
| D4 Aiven password rotated | | |
| D5 Azure URLs removed from Auth0 | | |
| D6 Azure variables and secrets removed from GitHub | | |
| D7 owner gate opened | | |

## Checks

Quickstart U1–U14. Pending.

| ID | Date | Result | Notes |
| --- | --- | --- | --- |
| U1 | | | |
| U2 | | | |
| U3 (gate on) | 2026-10-14 | Passed | From the owner's address: `/api/bikes` and `/api/me` without a session 401; POST with a foreign Origin or none 403; `X-Forwarded-Host` ignored (401); `/openapi/v1.json` and `/health/ready` 404; `http://` 308 to HTTPS; ports 3000, 5080 and 3100 closed. An altered `Host` gets Caddy's empty 200 for an unknown site and never reaches the app (004: the platform's 404). From mobile data: 403 (A5) |
| U3 (gate open) | | | |
| U4 | 2026-10-14 | Passed | Gym Notebook and Subscription Tracker work. `bikelog-api` 108 MB and `bikelog-web` 135 MB (caps 512 MB); server memory available 867 MB of 1,855 MB, no swap |
| U5 | | | |
| U6 | | | |
| U7 | | | |
| U8 | | | |
| U9 | | | |
| U10 | | | |
| U11 | 2026-10-14 | Passed | TCP to the Aiven host from the owner's machine refused or timed out; the server connects (B5, B6) |
| U12 | | | |
| U13 | | | |
| U14 | | | |

## Restore rehearsals

| Date | Blob | Duration | Checks | Outcome |
| --- | --- | --- | --- | --- |

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
