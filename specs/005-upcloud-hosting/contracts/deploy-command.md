# Contract: `bikelog-deploy`

`/srv/bikelog/bin/bikelog-deploy`, from `scripts/upcloud/bikelog-deploy` (Bash, `set -euo pipefail`,
shellcheck-clean). Runs as root. Every command takes `deploy.lock` with `flock -w 900`; a second caller waits
up to 15 minutes, then fails with exit 75. It never prints environment values or file contents from
`secrets/`.

## Invocation

| Caller | How arguments arrive | Allowed commands |
| --- | --- | --- |
| GitHub Actions, via the deploy key | `SSH_ORIGINAL_COMMAND` (forced command; positional arguments are ignored) | `deploy`, `rollback`, `status` |
| Owner, admin SSH session | `sudo /srv/bikelog/bin/bikelog-deploy <command> …` | all |
| systemd timer | `bikelog-deploy backup` | `backup` |

The script decides the caller by `SSH_ORIGINAL_COMMAND` being set together with `SUDO_USER=bikelog-deploy`,
and refuses commands outside that caller's column with exit 64.

## Commands

| Command | Arguments | Effect |
| --- | --- | --- |
| `deploy` | `<tag> <web> <api> <migrations> <backup>` (owner only: optional `--api-env <file in secrets/>` for the failed-deploy rehearsal, never stored in `release.env`): `sha-<7 hex>` and four `ghcr.io/juusimaa/bike-log/<name>@sha256:<64 hex>`, each name matching its position | Steps 1–7 of research D5 |
| `rollback` | none | Swap `release.env` and `release.previous.env`; start and health-gate; no migrations |
| `status` | none | Current and previous tags, container state and health, free disk on Docker's data root; no settings or secrets |
| `restart` | none | Restart `web` and `api` with the current release (after secret rotation) |
| `backup` | none | Run the `backup` service (one-off) |
| `backup-verify-permissions` | none | Run `backup --verify-permissions` |
| `provision-pilot-user` | `--subject <sub> --email <address>` | Run `ops` with these operator arguments (spec 001 command) |
| `disable-pilot-user` / `enable-pilot-user` | `--owner <uuid>` | Run `ops` |
| `db-connections` | none | Count of Aiven sessions by client address, no query text (cutover step) |
| `gate` | `open` / `owner-only <address>` | Print the Caddy block change to make; Caddy is the owner's, so the script does not edit it |

Operator arguments are validated with the same rules as `hosted.sh` (subject `auth0|…` or `email|…`, a
plain address, a UUID) and passed to Docker as an argument array, never through a shell string.

## Exit codes

| Code | Meaning |
| --- | --- |
| 0 | Done; for `deploy`, the new version is serving and healthy |
| 1 | Failed; the previous version is serving (deploy) or nothing changed |
| 2 | Failed, and the previous version did not become healthy either; the owner must act |
| 64 | Usage or validation error, or a command not allowed for this caller |
| 73 | Not enough free disk (under 3 GB would remain); nothing pulled |
| 75 | Lock not acquired in time |

## Output

Plain lines `bikelog-deploy: <message>`, with a final summary line usable in the workflow summary:
`result=<ok|failed|failed-unhealthy> tag=<tag> previous=<tag|none>`.
