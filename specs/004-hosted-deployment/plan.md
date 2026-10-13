# Implementation Plan: Minimal Hosted Deployment

**Branch**: `004-hosted-deployment` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/004-hosted-deployment/spec.md`

## Summary

Bike Log's existing web app and API go online in one Azure Container Apps app in Sweden Central. The app
has two containers that share `localhost`, scales to zero, and uses Aiven's free PostgreSQL over verified
TLS. Two Bicep templates define everything in Azure:

- **Bootstrap** (run once by the owner): budget, identities, Key Vault, backup storage and every role
  assignment.
- **Main** (run by CI with Contributor rights): log workspace, environment, app, jobs and alerts.

A new GitHub Actions workflow deploys each published commit by image digest. It signs in to Azure with
short-lived OIDC tokens, runs migrations as a job first, and lets the new revision take traffic only after
its health checks pass. Rollback redeploys the previous digest.

A daily job writes a `pg_dump` and a matching manifest to add-only blob storage, which the job cannot
delete. Blobs expire after 35 days, and an alert fires when a day passes without a successful backup. A
restore script rehearses recovery into a fresh local PostgreSQL and checks counts and usage totals against
the manifest.

The application changes are small:

- the web proxy and session store accept an https origin and a TLS database;
- the public origin is derived from configuration, not the forwarded request;
- the web app gets a health route and security headers;
- OpenAPI is served only in Development;
- operator commands can target the hosted database through an explicit, guarded mode.

See [research.md](research.md) for decisions D1–D18.

## Technical Context

**Language/Version**:

- C# on .NET SDK 10.0.401 (ASP.NET Core 10).
- TypeScript on Node 24.21.0 (Next.js standalone).
- Bash for operator scripts.
- Bicep 0.48.1.

**Primary Dependencies**:

- Existing: EF Core 10.0.12 with Npgsql 10.0.3, and `pg` in the web app.
- New: no application packages. A `backup` image based on the pinned `postgres:18.6`.
- Azure resources at API versions:
  - `Microsoft.App@2026-07-01`
  - `Microsoft.Consumption/budgets@2026-06-01`
  - current GA versions for Key Vault, Storage, Log Analytics, Insights and Managed Identity, pinned in
    the templates.
- GitHub Actions pinned by SHA, including `azure/login@v3`.

**Storage**:

- **Aiven for PostgreSQL**, free plan: one service, 1 GB disk, 20 connections, region chosen by Aiven
  (D16).
- **Azure Blob Storage**, Standard LRS Hot, for backups.
- **Local**: Docker PostgreSQL 18.6 for development and restore rehearsals.
- **Migrations**: no new database migrations.

**Testing**:

- **xUnit integration tests** (`tests/Integration.Tests`):
  - the hosted operator guard;
  - Production refusing Synthetic mode;
  - OpenAPI absent outside Development.
- **Vitest** (`apps/web/tests`):
  - proxy origin rules;
  - public-origin derivation;
  - session database TLS rule;
  - `/healthz`;
  - security headers.
- **Shell tests**: the backup manifest and restore comparison, against Docker PostgreSQL.
- **Bicep**: `bicep build` and lint in CI.
- **Recorded runtime proofs**: under `docs/hosting/`.

**Target Platform**: Azure Container Apps (Consumption profile, `linux/amd64`) in Sweden Central;
Aiven PostgreSQL; GitHub Actions; the owner's Mac for bootstrap and restore rehearsals.

**Project Type**: Web service and web application monorepo, plus infrastructure and delivery.

**Performance Goals**:

- Cold start to a usable first page within 30 seconds (SC-002).
- Warm page loads within 3 seconds.
- Merge to live within 20 minutes (SC-004).
- Rollback within 5 minutes (SC-005).
- Restore rehearsal within 1 hour (SC-006).

**Constraints**:

- €10 monthly budget; stay within free allowances.
- At most 13 of Aiven's 20 connections (D11).
- No secrets, email addresses or database host names in the public repository.
- No role assignments from CI.
- Only synthetic or test records until the restore rehearsal passes (FR-022).

**Scale/Scope**:

- One owner plus a few pilot riders; one environment; one replica.
- Azure resources:
  - 2 identities, 1 Key Vault, 1 storage account, 1 log workspace, 1 environment, 1 app, 3 jobs;
  - 1 action group, 2 alerts, 1 budget, 1 custom role.
- 1 new workflow, 1 new image, about 8 changed source files and 4 new documents.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / constraint | Status | Notes |
| --- | --- | --- |
| I. Trustworthy, explainable usage | Pass | No domain change. The restore check compares stored usage totals with the backup manifest, so a recovered database is shown to give the same totals (D9, D14). |
| II. Backend-owned domain rules | Pass | No rules move to clients. Web changes are transport and session concerns only. |
| III. Evidence-based verification | Pass (planned) | Guard, origin, TLS and health rules get automated tests. Deployment, rollback, alert and restore claims are backed by recorded runs in `docs/hosting/` (quickstart scenarios). Failures are recorded as observed. |
| IV. Privacy, ownership, synthetic data | Pass | Remote exposure happens only in Authenticated mode, with the spec 001 checks unchanged and re-verified on the hosted address before any real record. Synthetic mode cannot start in Production (D5, D6). Secrets live only in Key Vault. The owner's email and the database host are supplied at deploy time, not committed. Real records wait for the restore rehearsal. |
| V. Incremental simplicity | Pass | Every new resource is required by Phase 3's first slice in `PROJECT_PLAN.md` (reordered on 2026-10-13). Service Bus, outbox, worker, Blob storage for files and Application Insights stay out. One replica, one environment, one database user (D17). |
| Stack | Pass | Azure Container Apps and Aiven, as decision 0003 and the constitution name. Bicep and GitHub Actions are already in the plan. |
| Pinned versions | Pass | Bicep CLI and resource API versions, action SHAs, and image digests (deployments use digests). |
| Migrations explicit and additive | Pass | A separate job runs before the app update. No migration at startup. No new migration in this feature. |
| Destructive operations | Pass | The restore script creates and removes only its own uniquely named container and volume. No script deletes Azure resources or Aiven services. |
| No cloud resource without approval and cost estimate | Pass (gated) | `docs/hosting/cost-estimate.md` must carry the owner's approval before `bootstrap.bicep` runs (D18). Moving off the Aiven free plan needs a new approval (D16). |
| Backups exercised before reliance | Pass (gated) | FR-022 and the quickstart restore scenario gate any real record. |
| Decisions recorded | Planned | Decision 0006 records the hosting architecture: bootstrap/main split, Key Vault references, add-only backups, operator job and Aiven region handling. |
| Web checks per `docs/web-workflows.md` | Planned | Lint, typecheck, Vitest and build. The UI does not change, so visual baselines stay. |

**Post-design re-check**: Pass. The design relaxes two local-only guards (web session database and
operator target) but replaces each with a stricter hosted rule: verified TLS plus an explicit, configured
host match in Production. It does not simply remove them. No Complexity Tracking entry is needed.

## Project Structure

### Documentation (this feature)

```text
specs/004-hosted-deployment/
├── plan.md                       # This file
├── research.md                   # Decisions D1–D18
├── data-model.md                 # Environment resources, secrets, backup manifest, records
├── quickstart.md                 # Setup and validation runbook
├── contracts/
│   ├── hosted-configuration.md   # Environment variables, secrets and mounts per container and job
│   ├── backup-format.md          # Blob naming and manifest schema
│   ├── operations.md             # Deploy, rollback, operator, backup and restore commands
│   └── health.md                 # /healthz and /health/ready behaviour
├── checklists/requirements.md
└── tasks.md                      # /speckit-tasks output
```

### Source Code (repository root)

```text
infra/
├── bootstrap.bicep               # NEW: budget, identities, federated credential, Key Vault, storage,
│                                 #      lifecycle rule, custom role, role assignments (owner-run)
├── main.bicep                    # NEW: log workspace, environment, container app, 3 jobs, alerts (CI)
├── modules/                      # NEW: containerApp.bicep, jobs.bicep, alerts.bicep
├── bootstrap.example.bicepparam  # NEW: placeholders only; real values stay in ignored .local/
└── main.bicepparam               # NEW: non-secret settings; host names and emails come from
                                  #      GitHub environment variables

.github/workflows/
├── containers.yml                # CHANGED: adds the backup image to the matrix
├── ci.yml                        # CHANGED: bicep build/lint job; shell tests for backup/restore
└── deploy.yml                    # NEW: digest resolution, main.bicep, migrate job, app update,
                                  #      readiness check, rollback inputs

images/backup/
├── Dockerfile                    # NEW: postgres:18.6 (pinned digest), curl, jq; non-root
└── backup.sh                     # NEW: snapshot manifest, pg_dump --snapshot, add-only uploads

scripts/hosted/
├── hosted.sh                     # NEW: provision/disable pilot user, run backup now, show status
├── restore-rehearsal.sh          # NEW: download, restore into a temporary local PostgreSQL, compare
└── tests/                        # NEW: manifest and comparison tests against Docker PostgreSQL

apps/web/
├── src/lib/proxy.ts              # CHANGED: https public origin allowed; fixed loopback upstream
├── src/lib/public-origin.ts      # NEW: configured-origin derivation and forwarded-proto check
├── src/lib/auth/config.ts        # CHANGED: TLS rule for non-loopback DB, CA file, pool max 2,
│                                 #          Synthetic refused in production
├── src/lib/auth/oidc.ts          # CHANGED: callback origin from public-origin helper
├── src/app/auth/logout/route.ts  # CHANGED: same helper
├── src/app/healthz/route.ts      # NEW: data-free readiness via the API
├── next.config.ts                # CHANGED: security headers
└── tests/                        # NEW/CHANGED: proxy, public-origin, session config, healthz, headers

src/Api/
├── Program.cs                    # CHANGED: MapOpenApi only in Development
└── Operations/
    ├── LocalDatabaseGuard.cs     # CHANGED → OperatorTargetGuard.cs: local or hosted target rules
    └── PilotUserCommands.cs      # CHANGED: uses the target guard; Production allowed for hosted

tests/Integration.Tests/
├── OperatorTargetGuardTests.cs   # NEW
└── HostTests.cs                  # CHANGED: Production + Synthetic refused; OpenAPI hidden

docs/
├── hosting/setup.md              # NEW: bootstrap, Aiven, Auth0, GitHub environment, first deploy
├── hosting/operations.md         # NEW: deploy, rollback, rotation, pilot users, backup, restore,
│                                 #      real recovery
├── hosting/cost-estimate.md      # NEW: dated estimate with owner approval line
├── hosting/setup-results.md      # NEW: recorded proofs (region, RTT, first deploy, rollback, alert,
│                                 #      restore)
├── containers.md                 # CHANGED: points to docs/hosting; backup image
├── auth/auth0-pilot-setup.md     # CHANGED: hosted application section
└── decisions/0006-hosted-deployment-architecture.md   # NEW
```

**Structure Decision**: The existing monorepo layout is kept. Infrastructure goes in `infra/`, as
`PROJECT_PLAN.md` section 11 proposes. The backup image gets its own `images/backup/` directory because
it is not an application. Operator scripts live under `scripts/hosted/`, apart from the loopback-only
`scripts/dev.sh`.

## Delivery order

1. **Code first**: web and API changes with tests (D5, D6), then the backup image, restore script and
   their tests (D9, D14). All of this can be done locally against Docker PostgreSQL, with no Azure.
2. **Infrastructure code and workflow**: `bootstrap.bicep`, `main.bicep`, `deploy.yml`, compiled and
   linted in CI.
3. **Owner gate**: approve the cost estimate, make the GHCR packages public, create the Aiven service
   and check its region (D16), and create the hosted Auth0 application.
4. **Provision**:
   1. Run bootstrap and set the Key Vault secrets.
   2. Run the first deployment, and provision the owner and a test rider through the operator job.
5. **Prove with test data**: run every quickstart scenario. The restore rehearsal must pass before any
   real record is entered.
6. **Record**: write results, decision 0006, and update the docs.

## Complexity Tracking

No constitution violations. See the post-design re-check above.
