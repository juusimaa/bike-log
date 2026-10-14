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

Cutover A1 (research D13). Pending.

| Check | Result |
| --- | --- |
| Docker Engine version | |
| Docker Compose version (v2 or later) | |
| Docker Buildx present | |
| Architecture | |
| Caddy version; in a container?; network name | |
| Firewall allows 80, 443 and SSH | |
| SSH key-only | |
| Memory total / free (at least 1 GB free) | |
| Disk total / free on Docker's data root | |
| IPv4 present; IPv6 present | |
| Default UpCloud hostname form; resolves forward to the server | |
| `/srv/bikelog` absent before install | |

## Cutover

Each step of the cutover contract with its UTC time and outcome. Pending.

| Step | UTC | Outcome |
| --- | --- | --- |
| A2 install.sh (dry run, then real) | | |
| A3 secrets and settings copied (file names only) | | |
| A4 backup app registration; certificate expiry; backup.bicep deployed | | |
| A5 Caddy site block, certificate issuer | | |
| A6 Auth0 URLs added | | |
| A7 GitHub production environment | | |
| B1 Azure deploy workflow disabled (downtime starts) | | |
| B2 Azure revision deactivated; backup job schedule removed | | |
| B3 Aiven client sessions before the server starts (must be 0) | | |
| B4 Aiven allow-list set to the server | | |
| B5 first deploy on the server (result line) | | |
| B6 `db-connections` shows only the server | | |
| C checks passed; first signed-in page on the new address (downtime ends) | | |
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
| U3 (gate on) | | | |
| U3 (gate open) | | | |
| U4 | | | |
| U5 | | | |
| U6 | | | |
| U7 | | | |
| U8 | | | |
| U9 | | | |
| U10 | | | |
| U11 | | | |
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
