# Implementation Plan: Hosting on UpCloud

**Branch**: `005-upcloud-hosting` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/005-upcloud-hosting/spec.md`

## Summary

Bike Log moves from Azure Container Apps to the owner's UpCloud server, where Gym Notebook and Subscription
Tracker already run with Docker Compose behind Caddy. The database stays in Aiven, so no records move.

- **Runtime**: a `bikelog` Compose project in `/srv/bikelog` runs the published `web` and `api` images by
  digest. The API shares the web container's network namespace and stays on loopback, as in Azure.
  Migrations, operator commands and backups are one-off services. Each container has 512 MB, 0.5 CPU and
  bounded logs.
- **HTTPS**: one site block in the owner's Caddy serves the server's default UpCloud hostname. It starts
  owner-only, as the Azure ingress allow-list did.
- **Delivery**: `deploy.yml` keeps resolving digests, then reaches the server over SSH with a key that
  can only run a forced command, `bikelog-deploy`. That command takes a lock, checks disk space, pulls,
  migrates, swaps containers behind a health gate, puts the previous version back on failure, and prunes
  old Bike Log images only.
- **Backups**: the existing backup image runs on a daily timer on the server and writes to the existing
  Azure storage. It signs in as a new app registration with a certificate and the existing write-only role.
  A storage metric alert replaces the job alert. Aiven's allow-list is then limited to the server.
- **Azure**: after a checked cutover, everything except the backup storage, its alert and the budget is
  deleted. The Aiven password is rotated.
- **Records**: decision 0007, constitution amendment 1.0.2, and `PROJECT_PLAN.md` name the new host and note
  the future option of the server's shared PostgreSQL.

No application code changes. See [research.md](research.md) for decisions D1–D15.

## Technical Context

**Language/Version**:

- Bash for the deploy script, installer and tests (shellcheck-clean).
- Bicep 0.48.1 for the remaining Azure resources.
- Existing application: .NET SDK 10.0.401, Node 24.21.0 (unchanged).

**Primary Dependencies**:

- Existing published images: `ghcr.io/juusimaa/bike-log/{web,api,migrations,backup}`, deployed by digest.
- On the server (owner-managed, versions recorded at setup): Docker Engine with Compose v2, Caddy, systemd,
  OpenSSH, `flock`.
- Backup image: adds a pinned `openssl` Debian package if the base image lacks the CLI (D10).
- GitHub Actions: no new actions; `ssh` from the runner.

**Storage**:

- Aiven for PostgreSQL free plan (unchanged; allow-list limited to the server).
- Azure Blob Storage `backups` container (unchanged format and retention; new writer).
- Server files under `/srv/bikelog` ([data-model](data-model.md)).
- No database migrations.

**Testing**:

- `scripts/upcloud/tests/run.sh`: the deploy script against local Docker with stand-in images (validation,
  lock, disk check, failed migration, health-gate fallback, rollback, pruning scope).
- Existing `scripts/hosted/tests/run.sh` plus a client-assertion test for `backup.sh`.
- `docker compose config` checks on `deploy/upcloud/compose.yaml`; Bicep build and lint of
  `infra/backup.bicep`; shellcheck and actionlint in CI.
- Recorded runtime proofs ([quickstart](quickstart.md) U1–U14) in `docs/hosting/upcloud-results.md`.

**Target Platform**: the owner's UpCloud server (Linux, `linux/amd64`, **verify**), shared with two other
apps; Azure Sweden Central for backup storage only.

**Project Type**: deployment and operations for the existing web app and API.

**Performance Goals**: first page within 3 s even after idle (no scale to zero); merge to live within
15 minutes; failed deploy unavailable at most 1 minute.

**Constraints**:

- At most 3 GB of the server's disk; 512 MB and 0.5 CPU per container.
- Under 15 of Aiven's 20 connections.
- No effect on the other apps; scripts touch only what Bike Log created.
- Azure cost under €1 a month after cutover.
- Certificate for a hostname under `upcloud.host`, which shares Let's Encrypt limits (D3).

**Scale/Scope**: one server, one instance, the owner and a few pilot riders.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / constraint | Status | Notes |
| --- | --- | --- |
| I. Trustworthy, explainable usage | Pass | No domain change; records are not moved. |
| II. Backend-owned domain rules | Pass | No application change. |
| III. Evidence-based verification | Pass | Deploy script tested against Docker; every hosting claim backed by a recorded quickstart run, failures recorded as observed. |
| IV. Privacy, ownership, synthetic data | Pass | Owner gate until the refusal checks pass on the new address; secrets only in root-owned 0600 files and the owner's password manager; the hosted environment still holds test records only, and real records wait for U9. |
| V. Incremental simplicity | Pass | Removes Container Apps, Key Vault, two identities, a log workspace and jobs. Adds one Compose file, one script, one timer and one app registration, each needed by an FR. |
| Stack constraint names Azure Container Apps | **Amend** | Constitution 1.0.2 (PATCH, like 1.0.1) and decision 0007, as FR-029 requires. Not a violation once amended in this feature. |
| Pinned versions | **Justified exception** | Images are pinned by digest and the backup image's packages by exact version. Caddy, Docker Engine and Compose, and the OS belong to the owner's shared server, so this repository can't pin them. Their versions are recorded at setup (T013) and in decision 0007; see Complexity Tracking. |
| Explicit, additive migrations | Pass | `migrate` runs as its own step before the swap; rollback skips migrations. |
| Destructive operations | Pass | Pruning limited to `ghcr.io/juusimaa/bike-log/*` digests outside the current and previous releases; never `prune -a`. Azure deletions are listed owner steps after checks. |
| No new paid resource without estimate | Pass | No new paid resource. A dated addendum to `docs/hosting/cost-estimate.md` for the new alert and what remains (under €0.50) is approved by the owner before any Azure change (T005a). |
| Backups exercised before reliance | Pass | U9 rehearsal on a post-move backup gates real records. |

Re-check after Phase 1: unchanged. The design adds no service beyond the research decisions. The stack line
is amended, and the one exception (shared-server tools) is justified below.

## Project Structure

### Documentation (this feature)

```text
specs/005-upcloud-hosting/
├── plan.md               # This file
├── research.md           # D1–D15
├── data-model.md         # Server, release, secrets, backup, credential, Azure kept, cutover record
├── quickstart.md         # L1–L6 local checks, U1–U14 on the server
├── contracts/
│   ├── server-layout.md  # Files, Compose services, Caddy block, timer
│   ├── deploy-command.md # bikelog-deploy commands, callers, exit codes
│   └── cutover.md        # Prepare, switch, check/fallback, finish
├── checklists/requirements.md
└── tasks.md              # /speckit-tasks
```

### Source Code (repository root)

```text
deploy/upcloud/
├── compose.yaml                  # NEW: web, api (service:web), migrate/ops/backup in profile "jobs"
├── settings.env.example          # NEW: non-secret settings with placeholders
├── secrets.example/              # NEW: placeholder app.env, api.env, backup.env
├── Caddyfile.bikelog             # NEW: site block with owner gate
└── systemd/bikelog-backup.{service,timer}   # NEW

scripts/upcloud/
├── bikelog-deploy                # NEW: forced command and operator commands (contracts/deploy-command.md)
├── install.sh                    # NEW: one-time server setup (account, sudoers, files, timer); idempotent
└── tests/run.sh                  # NEW: deploy script tests against local Docker

scripts/hosted/
├── hosted.sh                     # CHANGED: keeps `backups` and `cost`; other commands point to bikelog-deploy
├── restore-rehearsal.sh          # unchanged
└── tests/run.sh                  # CHANGED: adds the client-assertion test

images/backup/
├── backup.sh                     # CHANGED: certificate sign-in path (D10)
└── Dockerfile                    # CHANGED if needed: pinned openssl

infra/
├── backup.bicep                  # NEW: storage, container, lifecycle, Backup Writer role and assignments,
│                                 #      action group, storage alert, budget (from bootstrap/main/alerts)
├── backup.example.bicepparam     # NEW
├── bootstrap.bicep, main.bicep, modules/   # DELETED at cutover step D (kept until then for fallback)

.github/workflows/
├── deploy.yml                    # REWRITTEN: digests → ssh forced command; dispatch inputs image_tag / rollback
├── ci.yml                        # CHANGED: shellcheck scripts/upcloud, compose config check, backup.bicep build
└── containers.yml                # unchanged

docs/
├── decisions/0007-upcloud-hosting.md     # NEW (FR-029, FR-031)
├── hosting/upcloud.md                    # NEW: setup, deploy, rollback, rotation, backup, restore, cutover
├── hosting/upcloud-results.md            # NEW: recorded results
├── hosting/setup.md, operations.md       # CHANGED: marked historical (Azure), link to upcloud.md
├── hosting/cost-estimate.md              # CHANGED: dated addendum
└── containers.md                         # CHANGED: points to deploy/upcloud

.specify/memory/constitution.md   # CHANGED: amendment 1.0.2
PROJECT_PLAN.md                   # CHANGED: Phase 3 hosting line
README.md                         # CHANGED: hosted deployment section
```

**Structure Decision**: server-side files live in `deploy/upcloud/` (copied to the server) and
`scripts/upcloud/` (run on it), apart from `scripts/hosted/`, which keeps the Azure storage and restore
tools that still apply. The Azure templates for the app are deleted only after cutover, so the fallback in
[cutover](contracts/cutover.md) step C still works from the repository.

## Delivery order

1. **Code, locally**: Compose file, `bikelog-deploy` and its tests, `install.sh`, the `backup.sh`
   certificate path and its test, `infra/backup.bicep`, the new `deploy.yml` (trigger disabled), CI checks.
   Quickstart L1–L6.
2. **Records**: decision 0007, constitution 1.0.2, `PROJECT_PLAN.md`, `docs/hosting/upcloud.md`.
3. **Cutover** with the owner: [cutover](contracts/cutover.md) A–C, recording each step.
4. **Finish**: cutover D, quickstart U5–U14, delete the Azure app templates, mark the Azure docs as
   historical.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| Caddy, Docker and the OS are not pinned by this repository | They're shared with Gym Notebook and Subscription Tracker and upgraded by the owner for all three apps | Pinning them here would let one app hold back upgrades to the whole server; a dedicated server just for Bike Log is out of scope |

The constitution's stack line is amended within this feature (FR-029), and amendment 1.0.2 states how tools
on a shared host are handled (T004).
