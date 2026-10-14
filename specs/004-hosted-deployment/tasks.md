---

description: "Task list for the minimal hosted deployment"
---

# Tasks: Minimal Hosted Deployment

**Input**: Design documents from `specs/004-hosted-deployment/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included. Constitution III requires tests for the rules that keep the app trustworthy, and
evidence from exercised runs for any deployment claim. Write each code task's tests first and confirm they
fail before implementing. Hosted claims are proven by the quickstart scenarios and recorded in
`docs/hosting/setup-results.md`.

**Organization**: tasks are grouped by user story in priority order: US1 and US2 (P1), US3 and US4 (P2),
then US5 (P3). Decision IDs D1–D18 refer to [research.md](research.md).

**Conventions for every task**:

- **No secrets or personal values in the repository**: no secret values, email addresses, Aiven host
  names or tenant-specific values. Real values live in ignored `.local/` files (`.local/` and
  `*.local.bicepparam` are already in `.gitignore`), in GitHub environment variables or in Key Vault.
- **Pinning**: every new action is pinned by SHA with a version comment, every image by digest, and
  every Bicep resource by API version (Microsoft.App `2026-07-01`, budgets `2026-06-01`). Bicep CLI is
  0.48.1.
- **Loopback development stays as it is**: existing local and Synthetic behaviour must not change. Every
  new hosted rule fails closed.
- **No Azure resource is created before T024** (owner approval of the cost estimate).
- **Before each commit**: run `./scripts/dev.sh lint` and the relevant test suites. Web changes also
  need `npm run web:lint`, `npm run web:typecheck`, `npm test` and `npm run web:build`.
- **Owner action**: tasks marked 👤 need the project owner (Azure, Aiven, Auth0 or GitHub consoles, an
  inbox or a phone). The agent prepares the commands and records the sanitized results.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: the user story the task belongs to (US1–US5)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Directories, tool pins and the cost estimate that gates provisioning.

- [X] T001 Create the directories `infra/modules/`, `images/backup/`, `scripts/hosted/tests/` and `docs/hosting/`. Add `scripts/hosted/hosted.env.example` with placeholder-only keys: `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP=rg-bikelog-prod`, `AUTH0_ISSUER`, `INGRESS_ALLOW_CIDRS` (documentation only; the live value is a GitHub environment variable). Add a header comment saying "copy to `.local/hosted.env`; never commit real values".
- [X] T002 [P] Add `infra/bicepconfig.json`. Enable the core linter with these rules at `error`: `no-hardcoded-env-urls`, `secure-secrets-in-params`, `outputs-should-not-contain-secrets`, `no-unused-params` and `use-recent-api-versions` (warning). Add `scripts/hosted/install-bicep.sh`, which runs `az bicep install --version v0.48.1` and checks the reported version.
- [X] T003 [P] Write `docs/hosting/cost-estimate.md` (D18, FR-024). Content:
  - The date and region (Sweden Central).
  - One row per resource from data-model.md, with retail unit prices from 2026-10-13:
    - Container Apps: free grant 180,000 vCPU-s, 360,000 GiB-s and 2M requests; 0.5 vCPU / 1 GiB per replica, so about 100 active hours are free.
    - Log Analytics: 5 GB/month free, then €2.63/GB, with a 0.15 GB/day cap.
    - Key Vault: €0.0264 per 10k operations.
    - Storage: Hot LRS €0.0162/GB-month, writes €0.044 per 10k.
    - Metric alerts: about €0.10 each per month.
    - Budget and action group emails: free.
  - Expected total: €0.50–€2 a month. Approved budget: €10. Thresholds: actual 50%, actual 80%, forecast 100%.
  - Excluded charges to avoid: Dedicated Plan Management (about €83/month) is triggered by private endpoints, Dedicated profiles or planned maintenance; a NAT gateway is also excluded.
  - Aiven free plan: €0, with the region caveat from D16.
  - An empty approval line: `Approved by owner: ____ (date)`.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The application changes that make hosting safe (D5, D6), the infrastructure code, and the
owner gate. User story work that touches Azure cannot begin until T027 is done. Code-only work in US2 (T035–T039) can start after Phase 1.

### API changes (tests first)

- [X] T004 [P] Write failing tests in `tests/Integration.Tests/OperatorTargetGuardTests.cs` for a new `OperatorTargetGuard.Validate(IConfiguration, IHostEnvironment, string connectionString)`:
  - **Allowed (local)**: the existing local rule, unchanged: Development, host `127.0.0.1`, port 54329, database `bikelog_dev` or `bikelog_test_*`, connection string equal to the configured one.
  - **Allowed (hosted)**: all of the following hold:
    - Production environment;
    - `AccessMode=Authenticated` and `LocalSyntheticMode=false`;
    - `SSL Mode=VerifyFull` and a non-empty `Root Certificate`;
    - connection host equal (case-insensitive) to `Operator:HostedDatabaseHost`.
  - **Refused**, each with a distinct message and without opening a connection:
    - Production with `SSL Mode=Require`;
    - Production without a root certificate;
    - a host mismatch;
    - an empty `Operator:HostedDatabaseHost`;
    - Staging environment;
    - Production with Synthetic mode;
    - Development pointing at a non-loopback host.
  - Extend `tests/Integration.Tests/PilotUserCommandTests.cs` with one case: provisioning in Production with a hosted-shaped connection string that fails the guard is refused before any database access.
- [X] T005 [P] Add failing cases to `tests/Integration.Tests/HostTests.cs`:
  - Regression guard, expected to pass from the start: with `ASPNETCORE_ENVIRONMENT=Production` and `AccessMode=Synthetic`, startup throws, so Synthetic mode can never run hosted (FR-003).
  - In Authenticated mode with the Production environment, `GET /openapi/v1.json` returns 404.
  - In Development it still returns 200.
- [X] T006 Replace `src/Api/Operations/LocalDatabaseGuard.cs` with `src/Api/Operations/OperatorTargetGuard.cs`, implementing the local and hosted rules exactly as T004 describes (contracts/hosted-configuration.md, "Operator target rules"). Use `NpgsqlConnectionStringBuilder` (`SslMode == SslMode.VerifyFull`, `RootCertificate`). Update `src/Api/Operations/PilotUserCommands.cs` `ValidateTarget`:
  - Accept `Development` for the local target and `Production` for the hosted target.
  - Keep the `--issuer == Auth:Issuer` check.
  - Leave `SyntheticOwnerPurge` on the local rule only.
  - Keep `--rebuild-usage` Synthetic-only.

  Make T004 green.
- [X] T007 In `src/Api/Program.cs`, map OpenAPI (`app.MapOpenApi()`) only when `app.Environment.IsDevelopment()`. Make T005 green. Then run `npm run check --workspace @bikelog/api-client` to confirm OpenAPI drift checks still work: they run in Development. Commit as `feat(api): allow guarded hosted operator target; hide OpenAPI outside Development`.

### Web changes (tests first)

- [X] T008 [P] Write failing tests in `apps/web/tests/public-origin.test.ts` for `publicRequestOrigin(request: Request): string` in `apps/web/src/lib/public-origin.ts`. It reads `WEB_PUBLIC_ORIGIN`:
  - Returns the configured origin when the `Host` header equals its host.
  - Throws `ForeignOriginError` when the Host differs.
  - For an https origin, accepts `X-Forwarded-Proto: https` or no forwarded protocol, and throws on `X-Forwarded-Proto: http`.
  - Ignores `X-Forwarded-Host` entirely.
  - Never reads `request.url`'s scheme.
- [X] T009 [P] Extend `apps/web/tests/proxy.test.ts`:
  - In Authenticated mode, `WEB_PUBLIC_ORIGIN=https://ca-bikelog.example.azurecontainerapps.io` with upstream `http://127.0.0.1:5080` is accepted.
  - An `http://` non-localhost origin is rejected.
  - Any upstream other than `http://127.0.0.1:5080` is rejected.
  - A request whose Host does not match gets 403 `foreign_origin`.
  - A POST with a foreign Origin gets 403.
  - Synthetic mode behaviour is unchanged.
- [X] T010 [P] Add `apps/web/tests/auth-config.test.ts` for `apps/web/src/lib/auth/config.ts`:
  - **Unchanged**: the loopback `127.0.0.1:54329` database is accepted without TLS.
  - **Hosted**: a non-loopback `BIKELOG_WEB_DATABASE_URL` is accepted only when `BIKELOG_DATABASE_CA_FILE` points to a readable file, and the resulting pool options are `ssl: { ca: <file contents>, rejectUnauthorized: true }` and `max: 2`.
  - **Rejected**:
    - a non-loopback URL without a CA file;
    - a URL containing `sslmode=disable` or `sslmode=no-verify`;
    - `NODE_ENV=production` with `BIKELOG_WEB_ACCESS_MODE=Synthetic` and a non-loopback `WEB_PUBLIC_ORIGIN`.

  Extend `apps/web/tests/auth-callback.test.ts` and `apps/web/tests/auth-logout.test.ts`: behind an https public origin, with `request.url` starting `http://` and `X-Forwarded-Proto: https`, the callback succeeds and logout redirects to `https://…/?signedOut=1`.
- [X] T011 [P] Add `apps/web/tests/healthz.test.ts` for `apps/web/src/app/healthz/route.ts`, per contracts/health.md:
  - The upstream `/health/ready` returns 200 → 200 `ok`.
  - It returns 503, times out after 3 s or the fetch throws → 503 `unavailable`.
  - Both responses carry `Cache-Control: no-store`.
  - Non-GET methods → 405.
  - The body never contains error text.

  Add `apps/web/tests/security-headers.test.ts`, which imports `apps/web/next.config.ts` `headers()` and asserts `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin` and `X-Frame-Options: DENY` on `/:path*`. It also asserts that `Strict-Transport-Security: max-age=31536000` is present only when `WEB_PUBLIC_ORIGIN` starts with `https://`.
- [X] T012 Implement `apps/web/src/lib/public-origin.ts` (make T008 green). Use it in `apps/web/src/lib/proxy.ts`, which then:
  - accepts a public origin that is exactly `http://localhost:3000` or any exact `https:` origin;
  - requires the upstream to equal `http://127.0.0.1:5080`;
  - keeps the route allowlist, the Origin rule for non-GET requests and the 502 mapping.

  Make T009 green.
- [X] T013 Update `apps/web/src/lib/auth/config.ts` per T010: CA file, `ssl` options, `max: 2`, the sslmode rejections and the Synthetic-in-production check. Update `apps/web/src/lib/auth/oidc.ts`, whose callback origin check at lines 147–153 must use `publicRequestOrigin(request)` instead of `new URL(request.url).origin`. Update `apps/web/src/app/auth/logout/route.ts` to use the same helper. Make T010 green.
- [X] T014 [P] Implement `apps/web/src/app/healthz/route.ts`, which fetches `${BIKELOG_API_ORIGIN}/health/ready` with a 3 s `AbortSignal.timeout` (make T011's health cases green). Add the `headers()` export to `apps/web/next.config.ts` (make T011's header cases green). Confirm `/healthz` is not blocked by the proxy allowlist; it is a separate route, not under `/api`.
- [X] T015 Run the full local checks (quickstart A1) and commit as `feat(web): accept an https public origin, TLS session database and health route`.

### Infrastructure code

- [X] T016 Write `infra/bootstrap.bicep`, scoped to the resource group, per data-model.md "Hosted environment" bootstrap rows and D3/D4/D9/D18:
  - **Parameters**: `location` (default `swedencentral`), `ownerAlertEmail` (`@secure()` not needed, but never defaulted), `ownerPrincipalId`, `budgetStartDate` (first of a month), `githubRepository` (default `juusimaa/bike-log`), `suffix` (default `uniqueString(resourceGroup().id)`).
  - **Budget**: `Microsoft.Consumption/budgets@2026-06-01`, `budget-bikelog`: amount 10, Monthly, Cost; notifications at Actual 50, Actual 80 and Forecasted 100 to `ownerAlertEmail`.
  - **Identities**:
    - `id-bikelog-app`;
    - `id-bikelog-deploy`, with a federated identity credential: issuer `https://token.actions.githubusercontent.com`, audience `api://AzureADTokenExchange`, subject `repo:<githubRepository>:environment:production`.
  - **Key Vault** `kv-bikelog-<suffix>`: Standard, `enableRbacAuthorization: true`, purge protection on, soft delete 7 days, public network access enabled (Container Apps has no private endpoint, D1).
  - **Storage account** `stbikelog<suffix>`:
    - StorageV2 Standard_LRS Hot;
    - `minimumTlsVersion: TLS1_2`, `allowBlobPublicAccess: false`, `allowSharedKeyAccess: false`;
    - container `backups`;
    - management policy rule `delete-after-35-days`: `daysAfterCreationGreaterThan: 35`, prefix `backups/`.
  - **Custom role** `Bike Log Backup Writer`: data actions `Microsoft.Storage/storageAccounts/blobServices/containers/blobs/add/action` and `.../blobs/read`; assignable scope this resource group.
  - **Role assignments**:
    - app identity → Key Vault Secrets User on the vault;
    - app identity → Bike Log Backup Writer on the `backups` container;
    - deploy identity → Contributor on the resource group;
    - owner → Key Vault Secrets Officer on the vault.
  - **Outputs**: names, client IDs and the storage account URL; no secrets.
- [X] T017 Write `infra/main.bicep` and `infra/modules/containerApp.bicep`, per data-model.md, contracts/hosted-configuration.md, D1, D2, D10 and D11.
  - **Inputs**: existing-resource references to the bootstrap identity, vault and storage by name parameters.
  - **Log Analytics** `log-bikelog`: PerGB2018, `retentionInDays: 30`, `workspaceCapping.dailyQuotaGb: json('0.15')`.
  - **Environment** `cae-bikelog`:
    - `workloadProfiles: [{ name: 'Consumption', workloadProfileType: 'Consumption' }]`, logs to the workspace;
    - no `vnetConfiguration`, no maintenance configuration.
  - **App** `ca-bikelog`:
    - **Identity and revisions**: user-assigned `id-bikelog-app`; `activeRevisionsMode: 'Single'`.
    - **Ingress**: external, `targetPort: 3000`, `allowInsecure: false`, `transport: 'auto'`. Parameter `allowedIngressCidrs` (array, default empty): when non-empty, set `ipSecurityRestrictions` to one `Allow` rule per range (name `owner-<n>`); when empty, omit the property (contracts/hosted-configuration.md).
    - **Secrets**: Key Vault references (`keyVaultUrl` versionless plus `identity`) for the five secrets in data-model.md "Secret".
    - **Volume** `secrets` (`storageType: 'Secret'`) exposing only `aiven-ca-certificate`, mounted at `/mnt/secrets` in both containers.
    - **Containers**: `web` and `api`, with the exact settings and probes from contracts/hosted-configuration.md.
    - **Scale**: `scale: { minReplicas: 0, maxReplicas: 1 }`, with a comment citing research D11.
  - **Parameters**: `webImage`, `apiImage`, `migrationsImage`, `backupImage` (full `ghcr.io/…@sha256:` references), `auth0Issuer`, `auth0Audience`, `auth0ClientId`, `aivenDatabaseHost`, `ownerAlertEmail`.
  - **Output**: `fqdn`.
  - `WEB_PUBLIC_ORIGIN` is computed as `'https://${app name}.${environment.properties.defaultDomain}'`.
  - Declare **no** role assignments or role definitions.
- [X] T018 Write `infra/modules/jobs.bicep`, called from `main.bicep`, with two jobs, both using `id-bikelog-app`, the `secrets` volume at `/mnt/secrets` and Key Vault secret references:
  - `job-bikelog-migrate`: Manual; image `migrationsImage`; env `ConnectionStrings__Postgres` (secret); `replicaTimeout: 600`, `replicaRetryLimit: 0`.
  - `job-bikelog-ops`: Manual; image `apiImage`; env as the `api` container plus `Operator__HostedDatabaseHost=aivenDatabaseHost`; `replicaTimeout: 120`, `replicaRetryLimit: 0`; default args `["--help"]`.

  The backup job is added in T040.
- [X] T019 [P] Write `infra/bootstrap.example.bicepparam` (placeholders only) and `infra/main.bicepparam`, which reads every environment-specific value with `readEnvironmentVariable('AUTH0_ISSUER')` and similar. Image parameters come from the workflow command line. Document in a header comment which GitHub environment variables feed it (contracts/operations.md list).
- [X] T020 [P] Add an `infra` job to `.github/workflows/ci.yml` (ubuntu-24.04, 10 min, `contents: read`). It runs `scripts/hosted/install-bicep.sh`, then `az bicep build` for both templates and `az bicep lint --file infra/main.bicep --diagnostics-format sarif` (fail on errors). It then fails if a grep finds any of the following:
  - `Microsoft.Authorization/roleAssignments` or `roleDefinitions` in `infra/main.bicep` or `infra/modules/`;
  - `privateEndpoint` anywhere under `infra/`;
  - `workloadProfileType: 'D` anywhere under `infra/`;
  - `maintenanceConfigurations` anywhere under `infra/`.
- [X] T021 Write `docs/hosting/setup.md`, the owner's setup guide in the order of quickstart Part B. It covers:
  - prerequisites: `az` and `gh` CLIs, Docker, `.local/hosted.env` from T001;
  - making the GHCR packages public;
  - creating the Aiven service, including how to read its cloud, region and PostgreSQL version, the EU stop rule, downloading the CA certificate, and creating a long random password;
  - the Auth0 hosted application, with a link to T022;
  - the GitHub environment `production` (deployment branch rule `main`) and its variables;
  - the resource group plus bootstrap command with a `.local/bootstrap.local.bicepparam`;
  - setting each Key Vault secret with `az keyvault secret set --file`, so values never reach shell history, including how to build the Npgsql connection string, the libpq `backup-database-url` (contracts/hosted-configuration.md) and the 32-byte base64url session key;
  - the first deployment;
  - the steps to repeat after recreating the environment: Auth0 URLs and `WEB_PUBLIC_ORIGIN` follow the new default domain;
  - **Aiven service powered off**: symptoms are `/healthz` returning 503, `hosted.sh backup-now` failing to connect, or an Aiven notification email. Fix: power the service on in the Aiven console, wait until it shows Running, then run `hosted.sh status`. The daily backup keeps the service active, so this should only happen if backups stop;
  - opening the app after verification: clear `INGRESS_ALLOW_CIDRS` and redeploy (see T034).
- [X] T022 [P] Add a "Hosted application" section to `docs/auth/auth0-pilot-setup.md` (D15). It describes a second Regular Web Application "Bike Log (hosted)" with:
  - the `email` connection only;
  - Authorization Code and Refresh Token grants;
  - callback `https://<fqdn>/auth/callback`;
  - allowed logout URL `https://<fqdn>/?signedOut=1`;
  - the same API audience and `BikeLog.Access`;
  - its secret stored only in Key Vault.

  It also says the local application keeps only localhost URLs, and that users in the passwordless connection work with both applications.
- [X] T023 Commit the infrastructure code and docs as `feat(infra): add bootstrap and main Bicep templates and setup guide`.

### Owner gate (no Azure resource before this)

- [X] T024 👤 The owner reviews `docs/hosting/cost-estimate.md` and fills in the approval line with the date. Commit as `docs: approve hosted cost estimate`.
- [X] T025 👤 Follow `docs/hosting/setup.md`: create the Aiven free PostgreSQL service. In a new `docs/hosting/setup-results.md`, record the date, cloud, region, PostgreSQL major version and whether `max_connections` is 20. **If the region is outside the EU, stop**, record it, and prepare a paid-plan cost estimate for the owner (D16). Make the four GHCR packages public (`backup` exists once T039 is merged to `main`; until then, make the other three public) and record an anonymous `docker pull` of `web`.
  - *Status 2026-10-14*: Aiven recorded (`ams`, PostgreSQL 18.6, 20 connections; EU, so continue). Anonymous pulls of all four packages recorded.
- [ ] T026 👤 Create the "Bike Log (hosted)" Auth0 application (callback URLs are filled in after T031) and the GitHub `production` environment with its variables, except `AZURE_CLIENT_ID`. Create `rg-bikelog-prod` in Sweden Central and run `infra/bootstrap.bicep` with `.local/bootstrap.local.bicepparam`. Then set `AZURE_CLIENT_ID` to the deploy identity's client ID, and set `INGRESS_ALLOW_CIDRS` to the owner's current public IP as `/32`.
- [ ] T027 👤 Set the Key Vault secrets per `docs/hosting/setup.md`. Verify and record:
  - `az consumption budget list -g rg-bikelog-prod` shows €10 and three notifications;
  - `az keyvault secret list` shows six names;
  - `az role assignment list --assignee <deploy identity>` shows only Contributor on the resource group.

**Checkpoint**: the code is ready and tested, the infrastructure code compiles and the identities exist. Hosted user story work can begin.

---

## Phase 3: User Story 1 - Owner uses Bike Log from anywhere (Priority: P1) 🎯 MVP

**Goal**: The app runs on Azure over HTTPS, and the owner signs in from a phone and a laptop and sees the
same data. Only test records are used until US2's rehearsal passes.

**Independent Test**: quickstart C1–C5.

- [X] T028 [US1] Write `.github/workflows/deploy.yml` (D12, contracts/operations.md "Deploy"):
  - **Trigger and settings**:
    - `on: workflow_run` (workflows `["Containers"]`, i.e. the `name:` of `containers.yml`; check it), types `completed`, branches `main`;
    - a job-level `if` on `github.event.workflow_run.conclusion == 'success'`;
    - `concurrency: { group: deploy-production, cancel-in-progress: false }`;
    - `environment: production`;
    - `permissions: { id-token: write, contents: read }`.
  - **Pinned actions**: `actions/checkout` (same SHA as ci.yml) and `azure/login` v3 (pin the SHA), using `client-id`, `tenant-id` and `subscription-id` from `vars`.
  - **Steps**:
    1. Derive `sha-<7 chars>` from `github.event.workflow_run.head_sha`.
    2. Resolve digests of `ghcr.io/juusimaa/bike-log/{web,api,migrations,backup}` with `docker buildx imagetools inspect --format '{{json .Manifest}}'`. Fail if any is missing.
    3. Install Bicep via `scripts/hosted/install-bicep.sh`.
    4. Read the current app images with `az containerapp show`. On a first deployment, use the new ones.
    5. Run `az deployment group create -g $AZURE_RESOURCE_GROUP -f infra/main.bicep -p infra/main.bicepparam`. Pass the current web/api images and the new migrations/backup images.
    6. Run `az containerapp job start -n job-bikelog-migrate --image <migrations digest>`, then poll `az containerapp job execution show` every 10 s for up to 10 minutes. Fail unless the status is `Succeeded`.
    7. Run `az containerapp update -n ca-bikelog --container-name web --image <web digest>`, then the same for `api` (or one `--yaml` patch, so only one revision is created; prefer this).
    8. Poll the latest revision until `runningState` is `Running` and `healthState` is `Healthy` (10 minutes at most).
    9. `curl -fsS https://<fqdn>/healthz` must return 200.
    10. Write `$GITHUB_STEP_SUMMARY` with the tag, four digests, revision name and migration execution name.

  No secret values are referenced anywhere.
- [X] T029 [US1] Write `scripts/hosted/hosted.sh` with `set -euo pipefail`. It sources `.local/hosted.env` and refuses to run if the file is missing or keeps placeholder values. Subcommands:
  - `status`: app FQDN, latest revision, running and health state, last three job executions per job.
  - `provision-pilot-user --subject <sub> --email <addr>`: reads `Auth__Issuer` from the ops job definition with `az containerapp job show`, starts `job-bikelog-ops` with args `--provision-pilot-user --issuer <issuer> --subject <sub> --email <addr>` (**verify** the `az containerapp job start` argument override syntax first and note it in the script), waits for completion, then prints the execution status and the job's own console output from `az containerapp job logs show` (**verify** command availability, otherwise use Log Analytics) without echoing environment variables. Exits non-zero on failure.
- [ ] T030 [US1] Commit as `feat(deploy): add deploy workflow and hosted operator script`, push the branch and open a PR. After merge, `containers.yml` publishes the images and `deploy.yml` runs.
  - *Status 2026-10-14*: committed on `feat/004-hosted-deployment`; not pushed and no PR opened yet (needs the owner's go-ahead).
- [ ] T031 👤 [US1] Quickstart C1: the first deployment runs. Record the run duration, migration execution and `/healthz` result in `docs/hosting/setup-results.md`. Then set the hosted Auth0 application's callback and logout URLs from the app's FQDN.
- [ ] T032 👤 [US1] Run `hosted.sh provision-pilot-user` for the owner's Auth0 subject and for one test rider. Run quickstart C3 with **test records only**: phone on mobile data, then laptop, timed. Record the result.
- [ ] T033 👤 [US1] Run quickstart C4, the refusal table: uninvited address, `curl -I http://<fqdn>/`, altered Host, foreign Origin on POST, `/openapi/v1.json`, no API ingress. Also confirm that a phone on mobile data, which has a different IP address, gets 403 from the platform while the allow-list is set. Then run C5, the cold start after more than 30 minutes idle, timed. Record each outcome. If a refusal fails, stop and fix before continuing.
- [ ] T034 👤 [US1] After every C4 row passes, clear the GitHub variable `INGRESS_ALLOW_CIDRS`, then run `deploy.yml` with `workflow_dispatch`, the current tag and `skip_migrations=true`. Until T045 adds those inputs, re-run the last deploy run with `gh run rerun`. Confirm `https://<fqdn>/healthz` returns 200 from mobile data, and record the date the app was opened to the internet in `docs/hosting/setup-results.md` (constitution IV).

**Checkpoint**: US1 works with test data. Real records stay forbidden until T044.

---

## Phase 4: User Story 2 - Owner trusts that hosted records can be recovered (Priority: P1)

**Goal**: Daily add-only backups with a manifest, an alert on a missed day, and a rehearsed restore that
passes before any real record is entered.

**Independent Test**: quickstart A2 locally, then C8 against the hosted backup.

- [X] T035 [P] [US2] Write the failing shell test harness `scripts/hosted/tests/run.sh`. It:
  1. Starts its own uniquely named `postgres:18.6@<digest from compose.yaml>` container on a random loopback port, with a trap that removes the container and its volume.
  2. Applies EF migrations with the `migrations` image built locally (`docker build --target migrations -f src/Api/Dockerfile .`), or with `dotnet ef database update` against that port.
  3. Seeds synthetic rows: one user, two bikes, five components, installations, ten rides. Run the API's `--rebuild-usage` against it (Synthetic mode, Development, `ASPNETCORE_URLS=http://127.0.0.1:<free port>`; the Synthetic guard checks only that the database host is `127.0.0.1`, so the random port works).
  4. Runs `images/backup/backup.sh` in local mode (`BACKUP_LOCAL_DIR`).
  5. Runs `scripts/hosted/restore-rehearsal.sh --local <dir>` and expects exit 0.
  6. Deletes one ride from the source between snapshot export and dump, using the script's test hook `BACKUP_TEST_PAUSE_AFTER_MANIFEST=1`. Expects the manifest to still match the dump, which proves snapshot consistency.
  7. Corrupts the restored database (deletes one row) and expects the comparison to fail with a non-zero exit.
- [X] T036 [P] [US2] Add `images/backup/Dockerfile`:
  - Base `postgres:18.6@<same digest as compose.yaml>`.
  - Install exact Debian package versions (`curl=<ver>`, `jq=<ver>`, `ca-certificates=<ver>`), read from the base image's Debian release with `apt-cache policy`. `apt-get install` fails if a version disappears, and updating it is a deliberate change (constitution: pinned versions).
  - Copy `backup.sh`, run as user `postgres` (non-root), `ENTRYPOINT ["/usr/local/bin/backup.sh"]`.
- [X] T037 [US2] Implement `images/backup/backup.sh` per contracts/backup-format.md and D9:
  - **Setup**: `set -euo pipefail`. Read `BIKELOG_DATABASE_URL`, `BACKUP_ACCOUNT_URL`, `BACKUP_CONTAINER` and `AZURE_CLIENT_ID`, or `BACKUP_LOCAL_DIR` for tests.
  - **Latency**: log the median of ten `SELECT 1` round trips in ms (quickstart C2).
  - **Snapshot**: open a `psql` coprocess with `BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT pg_export_snapshot();`. Inside it, read the exact row count of every table in the `public` schema, the latest `__EFMigrationsHistory` row and the per-component usage totals (column names from the current `UsageProjection` EF mapping; read `src/Infrastructure/Persistence/Configurations/`), ordered by component ID.
  - **Dump**: run `pg_dump --format=custom --snapshot=<id> --no-owner --no-privileges`, then close the coprocess.
  - **Manifest**: compute `dumpBytes` and `dumpSha256`, and write a manifest with `formatVersion: 1` and every field in the contract. It contains no names, emails or notes.
  - **Upload**:
    - get a token from `$IDENTITY_ENDPOINT?resource=https://storage.azure.com/&api-version=2019-08-01&client_id=$AZURE_CLIENT_ID` with header `X-IDENTITY-HEADER: $IDENTITY_HEADER`;
    - upload the dump and then the manifest with single-shot `PUT` Blob requests: `x-ms-blob-type: BlockBlob`, `If-None-Match: *`, `x-ms-version: 2025-11-05` (or the current version; pin it);
    - treat any non-201 response as a failure.
  - **Verify-permissions mode**: `--verify-permissions` re-PUTs the latest dump name and then DELETEs it. It exits 0 only if both are refused (409 or 403) and the blob's ETag is unchanged.
  - **Logging and exit**: never log the URL's password or the token. Exit non-zero on any failure.

  Make T035 green for the backup half.
- [X] T038 [US2] Implement `scripts/hosted/restore-rehearsal.sh <blob name>` and `--local <dir> [--keep]` (D14, contracts/operations.md, backup-format.md "Restore comparison"):
  1. Download the dump and manifest with `az storage blob download --auth-mode login`, using the account from `.local/hosted.env`.
  2. Verify SHA-256.
  3. Start a uniquely named `postgres:18.6` container and volume on a random loopback port.
  4. Run `pg_restore --no-owner --exit-on-error`.
  5. Compare table counts (no extra or missing tables), usage entries and the latest migration.
  6. Print a check table and the total duration.
  7. Remove the container and volume. `--keep` is accepted only with `--local` (test runs); a rehearsal from Azure always removes its copy.

  Touch nothing it did not create. Make T035 fully green and commit as `feat(backup): add backup image and restore rehearsal with snapshot manifest`.
- [X] T039 [P] [US2] Add the `backup` image to the matrix in `.github/workflows/containers.yml` (context `.`, file `images/backup/Dockerfile`, same platforms, tags, SBOM and provenance). Add a step to the `infra` job in `.github/workflows/ci.yml`, or a new `backup-scripts` job with the pinned postgres service, that runs `scripts/hosted/tests/run.sh`.
- [X] T040 [US2] Extend `infra/modules/jobs.bicep` with `job-bikelog-backup`, per contracts/hosted-configuration.md:
  - Schedule `cronExpression: '30 2 * * *'`; image `backupImage`.
  - Env `BIKELOG_DATABASE_URL` (secret `backup-database-url`), `BACKUP_ACCOUNT_URL`, `BACKUP_CONTAINER=backups`, `AZURE_CLIENT_ID` (app identity client ID).
  - The `secrets` volume; `replicaTimeout: 900`, `replicaRetryLimit: 1`.

  Add `infra/modules/alerts.bicep`:
  - action group `ag-bikelog-owner` (email `ownerAlertEmail`);
  - metric alert `alert-backup-missing` on the backup job's `Executions` metric, filtered to the succeeded state (**verify** the exact dimension value in the portal and note it), total < 1 over a 24-hour window evaluated hourly, severity 2;
  - metric alert `alert-app-restarts` on the container app's `RestartCount` > 3 in 1 hour.

  Wire both into `infra/main.bicep`.
- [X] T041 [US2] Extend `scripts/hosted/hosted.sh`:
  - `backup-now`: start `job-bikelog-backup` and wait, then print the status and the logged round-trip median.
  - `backups`: run `az storage blob list --auth-mode login --prefix backups/` for the last 35 days, showing name, size and creation time.
  - `backup-verify-permissions`: start the backup job once with args `--verify-permissions`, wait and print the result.
- [X] T042 [US2] Write the backup, restore rehearsal and real recovery sections of `docs/hosting/operations.md`. Real recovery means: recreate the Aiven service, restore with `pg_restore` from a downloaded dump, update `api-postgres-connection`, `backup-database-url` and the GitHub variable `AIVEN_DATABASE_HOST`, redeploy, and check sign-in. Commit as `feat(infra): add daily backup job and backup alerts`.
- [ ] T043 👤 [US2] After merge and deployment, run quickstart C8:
  1. `hosted.sh backup-now` and `hosted.sh backups`.
  2. `restore-rehearsal.sh <blob>`, timed.
  3. `hosted.sh backup-verify-permissions`.
  4. The missed-backup alert test: disable the schedule for one day, confirm the email arrives, then restore the schedule.

  Record each outcome and the latency median (C2) in `docs/hosting/setup-results.md`.
- [ ] T044 👤 [US2] Confirm the restore rehearsal record in `docs/hosting/setup-results.md` shows all checks passing in under 1 hour (SC-006), then add the line `Real records allowed from: <date>` (FR-022). Commit as `docs: record hosted restore rehearsal`.

**Checkpoint**: US1 and US2 together allow real use.

---

## Phase 5: User Story 3 - Owner deploys changes safely and repeatably (Priority: P2)

**Goal**: Rollback by one command, failed deployments leave the old version serving, and the environment
can be recreated from code.

**Independent Test**: quickstart C7, plus C9 optionally.

- [X] T045 [US3] Extend `.github/workflows/deploy.yml`:
  - Add `workflow_dispatch` inputs `image_tag` (required string matching `^sha-[0-9a-f]{7}$`, validated in the first step) and `skip_migrations` (boolean, default `false`).
  - When dispatched, use `image_tag` instead of the `workflow_run` SHA, and skip the migration step if `skip_migrations` is true.
  - Add `timeout-minutes: 30` to the job.
  - Add the previous revision's image tag to the step summary, so the rollback target is always visible.
- [X] T046 [US3] Write the deploy, rollback and secret-rotation sections of `docs/hosting/operations.md`, per contracts/operations.md:
  - **Rollback**: the exact `gh workflow run` command, how to find the previous tag, and why additive migrations make it safe.
  - **Rotation**: for each of the six secrets, the order of steps, including the database password change in Aiven that updates two secrets.
  - **Concurrent deploys**: they queue.

  Commit as `feat(deploy): add rollback inputs and operations guide`.
- [ ] T047 👤 [US3] Run quickstart C7:
  1. On a temporary branch, change `apps/web/src/app/healthz/route.ts` to always return 503. Build it with `workflow_dispatch` on `containers.yml`, then deploy that tag through `deploy.yml` dispatch with `skip_migrations=true`.
  2. Confirm the workflow fails, the old revision keeps serving, and a `curl` loop every 2 s during the attempt shows no failed requests.
  3. Delete the branch.
  4. Run the rollback command to the previous good tag, timed (SC-005).

  Record the outcomes.
- [ ] T048 👤 [US3] Run quickstart C9, with the owner's approval at the time, because it briefly creates a second set of resources:
  1. Create a temporary resource group `rg-bikelog-recreate` and a temporary second database inside the Aiven service.
  2. Run bootstrap and main from the repository, timed until `/healthz` returns 200. Use only the temporary database, never production data.
  3. Record the duration (SC-009, under 2 hours) and any guide steps that were wrong, and fix them in `docs/hosting/setup.md`.
  4. Delete the temporary resource group and the temporary database.

---

## Phase 6: User Story 4 - Operator manages pilot riders on the hosted app (Priority: P2)

**Goal**: Provision, disable and enable riders on the hosted database through the operator job.

**Independent Test**: quickstart C6.

- [X] T049 [US4] Extend `scripts/hosted/hosted.sh` with `disable-pilot-user --owner <uuid>` and `enable-pilot-user --owner <uuid>`. Validate the UUID in D format before starting the job, start `job-bikelog-ops` with the matching args, and wait and report as `provision-pilot-user` does. Add a `--dry-run` flag to every operator subcommand that prints the `az` command without running it, with arguments shown but no secrets.
- [X] T050 [P] [US4] Add a "Hosted riders" section to `docs/auth/auth0-pilot-setup.md`:
  1. Create the user in the Auth0 `email` connection (as before).
  2. Read their `sub`.
  3. Run `hosted.sh provision-pilot-user`.
  4. To remove a rider, run `hosted.sh disable-pilot-user` and then block the user in Auth0.

  Note that rider email and subject appear in the job execution's arguments, which only subscription owners can see. Commit as `feat(ops): manage hosted pilot riders`.
- [ ] T051 👤 [US4] Run quickstart C6: the test rider's garage is empty and separate from the owner's. Disable the rider and confirm the next request is refused while their session is still valid, then re-enable them. Record the outcomes.

---

## Phase 7: User Story 5 - Owner keeps hosting cost within an agreed budget (Priority: P3)

**Goal**: The budget and its alerts are confirmed, and actual cost is easy to check.

**Independent Test**: verify the budget and notifications; compare cost with the estimate after a month.

- [X] T052 [US5] Add `hosted.sh cost`, which shows month-to-date actual cost for `rg-bikelog-prod` and the budget's current spend with `az consumption budget show`. If the CLI cannot show actual cost, print the portal link instead. Add a "Cost" section to `docs/hosting/operations.md`: how to read the cost, what the free grant covers, which settings would break the budget (`minReplicas` > 0, Dedicated profile, private endpoints, maintenance window, NAT gateway, Aiven paid plan), and that each needs a new estimate and the owner's approval (FR-026).
- [ ] T053 👤 [US5] Confirm with `az consumption budget show` that the budget has the €10 amount and the Actual 50, Actual 80 and Forecasted 100 notifications to the owner's address. Record the result. After the first full month, record actual cost against the estimate (SC-010).

---

## Phase 8: Polish & Cross-Cutting Concerns

- [X] T054 [P] Write `docs/decisions/0006-hosted-deployment-architecture.md` in the style of 0003 and 0004. Record:
  - the single app with two containers;
  - the bootstrap/main split and its least-privilege reason;
  - Key Vault references with a secret volume for the CA;
  - add-only backups with a snapshot manifest;
  - the operator job;
  - no IP allow-list;
  - the Aiven region finding;
  - rejected alternatives (two apps; CI with RBAC Administrator; immutability policies; ACR; minReplicas 1).
- [X] T055 [P] Update `docs/containers.md`: replace "Before deploying to Azure" with a short pointer to `docs/hosting/setup.md`, add the `backup` image to the image table, and note that the packages are public.
- [ ] T056 [P] Update `PROJECT_PLAN.md` Phase 3 with a status line naming what this slice delivered and what remains (Service Bus, outbox, worker, telemetry). Update the spec 004 Status line to Implemented when T044 is done.
  - *Status 2026-10-14*: the `PROJECT_PLAN.md` status line is written; the spec Status changes to Implemented after T044.
- [ ] T057 Run `gitleaks detect --redact` (pinned version via Docker) over the repository. Grep the last five deploy workflow logs (`gh run view --log`) for the strings `Password=`, `eyJ` and `sig=` (SC-008). Run a Log Analytics query over `ContainerAppConsoleLogs_CL` and `ContainerAppSystemLogs_CL` for the last 7 days, searching for `Password=`, `eyJ`, `sig=`, `Bearer ` and `@`, which catches emails. Run `gitleaks` over the filesystems of the published `web`, `api`, `migrations` and `backup` images (`docker export` of a created container into a temporary directory) to show they carry no secrets (FR-007a). Record zero findings, or each finding with its fix, in `docs/hosting/setup-results.md`.
  - *Status 2026-10-14*: repository history and locally built images scanned (see setup-results.md); the workflow-log, Log Analytics and published-image scans need the hosted environment.
- [X] T058 Run quickstart A1–A3 once more on the final branch, update the checklist in `specs/004-hosted-deployment/checklists/requirements.md` if anything changed, and commit as `docs: close hosted deployment slice`.
- [ ] T059 👤 After 30 days of real use, check that there are at least 28 backups and that every missed one alerted (SC-007), that cost is within budget, that the peak `numbackends` in Aiven's metrics stayed under 15, and that the T057 log query still finds nothing. Record all four in `docs/hosting/setup-results.md`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**:
  - T004–T015 (code) depend only on Setup.
  - T016–T023 (infrastructure code) depend on T001–T002.
  - The owner gate T024–T027 depends on T003 and T016–T023.
- **US1 (Phase 3)**: depends on all of Phase 2.
- **US2 (Phase 4)**:
  - Code tasks T035–T039 depend only on Setup, so they can run alongside Phase 2.
  - T040–T042 need T017–T018.
  - The hosted rehearsal T043–T044 needs US1 deployed.
- **US3 (Phase 5)**: depends on T028 (deploy workflow) and a live deployment (T031).
- **US4 (Phase 6)**: depends on T029 (`hosted.sh`) and T032.
- **US5 (Phase 7)**: depends on T026 (budget created).
- **Polish (Phase 8)**: after the stories it documents. T059 runs 30 days after T044.

### Gates

- **No Azure resource** before T024: owner approval of the cost estimate.
- **App open only to the owner's IP address** until C4 passes (T033), then opened by T034 (constitution IV).
- **No real garage record** (bikes, components, installations, rides, maintenance, reminders) before T044: restore rehearsal recorded. Pilot user identities may be provisioned once C4 passes (FR-022).
- **Stop at T025** if the Aiven region is outside the EU.

### Parallel Opportunities

- T004, T005, T008–T011 (all test-writing tasks) in parallel.
- T014 alongside T012–T013 (different files).
- T019, T020, T022 in parallel after T016–T018.
- US2 code (T035–T039) in parallel with Phase 2 infrastructure work.
- Polish T054–T056 in parallel.

### Parallel Example: Foundational tests

```text
T004 tests/Integration.Tests/OperatorTargetGuardTests.cs
T005 tests/Integration.Tests/HostTests.cs
T008 apps/web/tests/public-origin.test.ts
T009 apps/web/tests/proxy.test.ts
T010 apps/web/tests/auth-config.test.ts (+ callback/logout cases)
T011 apps/web/tests/healthz.test.ts, security-headers.test.ts
```

### Parallel Example: User Story 2 code

```text
T035 scripts/hosted/tests/run.sh
T036 images/backup/Dockerfile
then T037 images/backup/backup.sh → T038 scripts/hosted/restore-rehearsal.sh
T039 containers.yml + ci.yml (after T036)
```

## Implementation Strategy

### MVP: US1 with US2's rehearsal

US1 alone gives a working hosted app, but only with test data. The useful MVP, daily real use, needs US1
plus US2 up to T044. Build in this order:

1. Phase 1, then Phase 2 code (T004–T015) and US2 code (T035–T039) in parallel. All local, no Azure.
2. Phase 2 infrastructure code (T016–T023), then the owner gate (T024–T027).
3. US1 (T028–T034), then US2 hosted work (T040–T044). **Real use starts here.**

### Then

4. US3 rollback rehearsal and US4 rider management, in either order.
5. US5 cost check and Polish. T059 after 30 days.

## Notes

- `[P]` = different files with no dependency on an incomplete task.
- 👤 = needs the owner. The agent prepares commands and records sanitized results.
- **verify** marks platform details the research could not confirm: job argument override syntax, the job execution `state` dimension value, `az containerapp job logs show` availability and the Aiven PostgreSQL version. Check each when its task runs, and record the finding in the script or in `setup-results.md`.
- Commit after each task group as noted. Never commit `.local/` contents.
