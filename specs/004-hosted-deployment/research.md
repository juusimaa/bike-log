# Research: Minimal Hosted Deployment

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-13

The stack is fixed by the constitution and decisions 0002 and 0003. These decisions resolve how to host it
within the spec's clarified choices (backups in Azure Storage, €10 budget, public images, local restore
rehearsal, Sweden Central). Platform facts were checked against Microsoft and Aiven documentation on
2026-10-13; items marked **verify** must be confirmed during setup and recorded in
`docs/hosting/setup-results.md`.

## Starting point (as of `f0622ab`)

Hosting blockers found in the code:

- **Web proxy**: `apps/web/src/lib/proxy.ts:66-82` accepts authenticated traffic only from
  `http://localhost:3000` with upstream `http://127.0.0.1:5080`.
- **Web session database**: `apps/web/src/lib/auth/config.ts:68-72` requires host `127.0.0.1` and port
  `54329`. The pool uses `max: 5` without TLS settings.
- **OIDC callback**: `apps/web/src/lib/auth/oidc.ts:147-153` compares `new URL(request.url).origin` with
  the public origin. Behind a TLS-terminating ingress, `request.url` is built from the forwarded HTTP
  request and can carry `http:`. No code reads `x-forwarded-*`.
- **Operator commands**: `--provision-pilot-user` and `--disable-pilot-user` require the `Development`
  environment, and `LocalDatabaseGuard.cs:16-24` requires `127.0.0.1:54329/bikelog_dev`. They cannot run
  against a hosted database.
- **API surface**: `MapOpenApi()` (`src/Api/Program.cs:105`) serves `/openapi/v1.json` in every mode
  without sign-in. `/health/ready` (`Program.cs:152-170`) is data-free and unauthenticated, which is
  intended. There are no forwarded headers, HTTPS redirection or HSTS in either app.
- **Not yet built**: backup tooling, a deploy workflow and infrastructure code.

Already in place: three pinned, multi-platform images published to GHCR on every push to `main`
(`.github/workflows/containers.yml`). The migrations bundle image reads only `ConnectionStrings__Postgres`.
Synthetic mode cannot start outside `Development` with a loopback database
(`src/Api/Development/DevelopmentAccess.cs:18-60`). The web session and OIDC transaction tables are created
by the EF migrations, so the web app and the API share one database.

## D1. Container Apps environment: workload profiles with the Consumption profile only

- **Decision**: One Container Apps environment in Sweden Central with the default workload-profiles
  type and only the built-in Consumption profile. It has no custom virtual network, no private
  endpoints and no planned maintenance window. Resources use API version `2026-07-01`.
- **Rationale**: Consumption-only environments are now labelled legacy. Dedicated profiles, private
  endpoints and planned maintenance each add a Dedicated Plan Management charge of about €83 a month,
  which would break the €10 budget.
- **Alternatives**: A legacy Consumption-only environment (deprecated path). A custom virtual network
  with a NAT gateway for a static outbound IP (about €30 or more a month).

## D2. One container app with two containers, scaling to zero

- **Decision**: A single container app, `ca-bikelog`, runs `web` (port 3000, external ingress) and `api`
  (bound to `http://127.0.0.1:5080`, no ingress). Settings:
  - Revision mode single, `minReplicas: 0`, `maxReplicas: 1`, HTTP scale rule.
  - Each container gets 0.25 vCPU and 0.5 GiB.
  - Ingress has `allowInsecure: false`.
  - Readiness probes: `api` on `/health/ready`; `web` on a new `/healthz` that also checks the API over
    loopback. Startup probes allow 60 seconds.
- **Rationale**:
  - This is the layout `docs/containers.md` and `compose.app.yaml` already mirror.
  - The API is reachable only through the web proxy (FR-002).
  - At 0.5 vCPU and 1 GiB a replica, the monthly free grant (180,000 vCPU-seconds, 360,000 GiB-seconds)
    covers about 100 active hours, far above personal use.
  - With single revision mode, a new revision gets traffic only after its probes pass, so a failed
    revision leaves the old one serving (FR-011).
  - One replica keeps database connections bounded (D11).
- **Alternatives**:
  - Two container apps with internal ingress for the API: more resources, and the proxy would need a
    non-loopback upstream.
  - `minReplicas: 1`: no cold start, but the idle rate is charged around the clock, which needs a cost
    decision under FR-026.

## D3. Infrastructure as code: a bootstrap template run by the owner and a main template run by CI

- **Decision**: Bicep CLI 0.48.1, split into two templates.
  - `infra/bootstrap.bicep` is run once, by hand, by the owner, after the cost estimate is approved. It
    creates:
    - the resource group's budget;
    - the app's user-assigned identity, `id-bikelog-app`;
    - the deploy identity, `id-bikelog-deploy`, with a federated credential for GitHub environment
      `production`;
    - the Key Vault;
    - the backup storage account;
    - a custom add-only blob role;
    - every role assignment.
  - `infra/main.bicep` is run by CI with Contributor rights on the resource group. It creates or updates
    the Log Analytics workspace, Container Apps environment, the container app, the three jobs (D7, D8,
    D9), the action group and the alert rules. It creates no role assignments.
- **Rationale**: Contributor cannot create role assignments. Giving CI Role Based Access Control
  Administrator, even with conditions, widens what a compromised workflow could do. Role assignments
  and identities change rarely, so a hand-run bootstrap step is acceptable. Both templates are in the
  repository, so the environment can still be recreated from code plus the setup guide (FR-008).
- **Alternatives**:
  - A single template with CI holding User Access Administrator or conditional Role Based Access Control
    Administrator: rejected for least privilege.
  - Terraform: not part of the stack.
  - Deployment stacks: unnecessary for one resource group.

## D4. Secrets in Key Vault, referenced by the app's managed identity

- **Decision**: Key Vault Standard with RBAC authorization. `id-bikelog-app` holds Key Vault Secrets User;
  the owner holds Secrets Officer and sets values by hand. The container app and jobs reference versionless
  secret URLs through `id-bikelog-app`. Secrets:
  - `api-postgres-connection`
  - `web-database-url`
  - `web-session-key`
  - `auth0-client-secret`
  - `aiven-ca-certificate`, which is public but mounted as a file

  Other settings are plain, non-secret environment variables in Bicep parameters: issuer, audience,
  client ID, public origin, region and the budget email (supplied at bootstrap, not committed).
- **Rationale**: Versionless references pick up a new secret version within 30 minutes and restart the
  revisions that use it, which covers rotation without a code change. Key Vault operations cost about
  €0.03 per 10,000, so pennies a month. The repository is public, so the budget email and any Aiven host
  name must not be committed (constitution IV).
- **Alternatives**: Container Apps secrets set directly by CI, which would put secret values in GitHub;
  GitHub environment secrets for runtime values (rejected for the same reason).

## D5. Hosted configuration changes in the web app

- **Decision**:
  - **Proxy** (`proxy.ts`): in Authenticated mode, accept `WEB_PUBLIC_ORIGIN` when it is either exactly
    `http://localhost:3000` or an `https:` origin. The upstream stays fixed at `http://127.0.0.1:5080`.
    Host and Origin checks are unchanged.
  - **Public request origin**: one helper derives the request's public origin from `WEB_PUBLIC_ORIGIN`
    once the `Host` header matches it, and when `X-Forwarded-Proto` is present it must be `https`. The
    OIDC callback, logout and proxy all use it instead of `request.url`.
  - **Session database** (`config.ts`): accept either the existing loopback rule, or a non-loopback host
    with TLS certificate verification, using the CA file at `BIKELOG_DATABASE_CA_FILE`. Plain or
    unverified TLS connections to non-loopback hosts are refused. The pool drops to `max: 2`.
  - **Synthetic in production**: if `BIKELOG_WEB_ACCESS_MODE=Synthetic` while `NODE_ENV=production` and
    `WEB_PUBLIC_ORIGIN` is set to a non-loopback origin, startup fails.
  - **Headers**: `next.config.ts` adds `Strict-Transport-Security` (when the origin is https),
    `X-Content-Type-Options`, `Referrer-Policy` and `X-Frame-Options: DENY`.
  - **Health**: a new `GET /healthz` route returns 200 only when the API's `/health/ready` returns 200,
    and returns no data.
- **Rationale**: These are the smallest changes that let the existing, tested invite-only flow run behind
  Container Apps ingress (FR-001, FR-003, FR-004, FR-007). They keep loopback development unchanged and
  fail closed on misconfiguration.
- **Alternatives**:
  - Trusting `X-Forwarded-Host`: rejected; the configured origin is the only trusted value.
  - Disabling TLS verification for Aiven: forbidden by FR-007.

## D6. Hosted configuration changes in the API

- **Decision**:
  - Map OpenAPI only in `Development`.
  - Hosted containers run with `ASPNETCORE_ENVIRONMENT=Production`, `AccessMode=Authenticated` and
    `ASPNETCORE_URLS=http://127.0.0.1:5080`. Synthetic mode already refuses to start outside
    `Development`; an integration test is added to prove it in the Production configuration (FR-003).
  - Connection strings carry:
    - `SSL Mode=VerifyFull`
    - `Root Certificate=/mnt/secrets/aiven-ca-certificate`
    - `GSS Encryption Mode=Disable`
    - `Maximum Pool Size=3`
    - `Timeout=15`
  - The operator guard is split into two allowed targets:
    - the existing local development database rule, unchanged;
    - a hosted target, allowed only when `ASPNETCORE_ENVIRONMENT=Production`, `AccessMode=Authenticated`,
      the connection uses `SSL Mode=VerifyFull` with a root certificate, and the host equals the
      configured `Operator__HostedDatabaseHost`.

    `--rebuild-usage` stays Synthetic-only for now, and `--purge-synthetic-owner` stays local-only.
- **Rationale**:
  - Unauthenticated OpenAPI is unnecessary in hosting.
  - Operator commands must reach the hosted database (FR-023) without weakening the local guard. An
    explicit host match prevents a mistyped connection string from writing to the wrong database.
- **Alternatives**: removing the guard (rejected); a separate admin API endpoint (rejected: it opens a new
  public surface, which FR-023 forbids).

## D7. Migrations as a manual Container Apps job gated by CI

- **Decision**: The job `job-bikelog-migrate` runs the `migrations` image with `api-postgres-connection`
  and the CA mount. It has replica timeout 600 seconds and retry limit 0.
  1. CI starts it with the new image digest and waits for completion.
  2. A non-zero exit fails the workflow before the app is updated (FR-012).
  3. Migrations stay additive (constitution).
- **Rationale**: Migrations run separately and never at startup, as required. Job executions keep their
  history and logs.
- **Alternatives**: Running migrations from the GitHub runner, which would need database credentials and
  network access in GitHub.

## D8. Operator commands as a manual job

- **Decision**: The job `job-bikelog-ops` runs the `api` image in operator mode with the same identity,
  secrets and CA mount, and replica timeout 120 seconds. `scripts/hosted.sh provision-pilot-user …` and
  `disable-pilot-user …` start an execution with `az containerapp job start --args …` (**verify** the
  argument override syntax) and print only the execution status. Rider email and subject appear in the
  execution's arguments, which only the subscription owner can see; the commands themselves already
  avoid printing secrets.
- **Rationale**: No new public endpoint, and no database credentials leave Azure (FR-023).
- **Alternatives**: Running the image on the owner's Mac with the connection string pulled from Key
  Vault. This was rejected because it copies secrets to the laptop; it is kept as a documented fallback.

## D9. Daily backup job writing add-only blobs

- **Decision**:
  - **Image**: a new `backup` image, built in the existing containers workflow, based on the pinned
    `postgres:18.6` image. It runs `pg_dump --format=custom` on the hosted database, with TLS
    verify-full against the mounted CA.
  - **Manifest**: before the dump, the job opens a repeatable-read transaction, exports its snapshot and
    records row counts per table plus each component's stored usage totals in a JSON manifest. It then
    runs `pg_dump --snapshot=<id>`, so the manifest and the dump describe the same moment.
  - **Upload**: dump and manifest go up with single-shot Put Blob calls, using a token from the
    container's managed-identity endpoint. The blob name is
    `backups/<UTC date>/bikelog-<UTC timestamp>.dump` plus `.manifest.json`.
  - **Schedule**: `job-bikelog-backup` runs on cron `30 2 * * *` (UTC), with replica timeout 900 seconds
    and retry limit 1.
  - **Storage**: account `stbikelogbackup<suffix>`, Standard LRS, Hot tier, TLS 1.2 minimum, no public
    access, shared-key access disabled. It encrypts at rest by default.
  - **Retention**: a lifecycle rule deletes blobs 35 days after creation, which covers the 30-day
    minimum plus slack for the rule's 24-hour delay.
  - **Write without delete**: the custom role `Bike Log Backup Writer` grants only
    `Microsoft.Storage/storageAccounts/blobServices/containers/blobs/add/action` and `.../blobs/read` on
    the `backups` container. The job can create new blobs but cannot overwrite or delete them.
- **Rationale**:
  - Satisfies FR-018 and FR-019 and the clarified rule that the job can write but not delete.
  - The snapshot manifest gives the restore check a true source to compare against (FR-021).
  - A daily connection also keeps the free Aiven service active, which avoids its idle power-off.
  - Storage costs a few cents a month.
- **Alternatives**:
  - A time-based immutability policy: lifecycle deletes do not work on immutable containers, which would
    break the 30-day rule.
  - Block uploads: Put Block needs write permission, which also allows overwriting.
  - Client-side encryption with a separate key: adds key custody, and the restore rehearsal would need
    the key off Azure. Storage encryption at rest plus TLS in transit is enough at this scale.

## D10. Logs and alerts within the free tier

- **Decision**:
  - **Logs**: a Log Analytics workspace with 30-day retention and a daily ingestion cap of 0.15 GB (free
    up to 5 GB a month) receives the environment's logs (FR-017).
  - **Email**: one action group emails the owner.
  - **Backup alert**: a metric alert on the backup job's `Executions` fires when no succeeded execution
    is seen in 24 hours (**verify** the `state` dimension values), covering both failed and missed runs
    (FR-020).
  - **App alert**: a second metric alert fires when the container app restarts repeatedly.
- **Rationale**: Logs must be kept for a bounded time and stay within budget. Metric alerts cost about
  €0.10 a month each, and action-group emails are free at this volume.
- **Alternatives**: no log destination, which gives live streaming only and fails FR-017's bounded
  retention; Application Insights, which is deferred to the asynchronous slice.

## D11. Database connection budget

- **Decision**: Aiven's free plan allows 20 connections, a few of which are reserved for administration,
  so the plan budgets 15:

  | Client | Connections |
  | --- | --- |
  | API pool | 3 |
  | Web session pool | 2 |
  | One revision overall | 5 |
  | Two revisions while a deployment overlaps | 10 |
  | Migration job (not overlapping app updates) | 1 |
  | Backup job | 1 |
  | Operator job | 1 |
  | **Worst case** | **13** |

  `maxReplicas: 1` is pinned in Bicep, with a comment pointing here (FR-015).
- **Rationale**: Personal and pilot load needs only a few concurrent requests. Small pools only queue
  requests briefly.
- **Alternatives**: More replicas, which would need a larger plan or a pooler.

## D12. Delivery pipeline: deploy after images are published, one at a time

- **Decision**: A new `.github/workflows/deploy.yml`.
  - **Triggers**: `workflow_run` of `containers.yml` completing successfully on `main`, plus
    `workflow_dispatch` with inputs `image_tag` and `skip_migrations` for rollback.
  - **Setup**: `concurrency: deploy-production` with `cancel-in-progress: false`; `environment:
    production`; permissions `id-token: write` and `contents: read`. Actions are pinned by SHA,
    including `azure/login@v3`.
  - **Steps**:
    1. Resolve the three image digests for the commit's `sha-<short>` tag.
    2. Install Bicep 0.48.1 and run `az deployment group create` for `main.bicep`. The app keeps its
       current images; the jobs get the new digests.
    3. Start the migration job and wait. Stop on failure.
    4. Update the app's two containers to the new digests (D13).
    5. Poll until the new revision is running and ready, and check `https://<fqdn>/healthz`.
    6. Write a summary with the revision name and digests.
- **Rationale**:
  - Images exist before deployment.
  - Deploying by digest pins exactly what was tested.
  - Migrations run before the app (FR-009, FR-012).
  - Only one deployment runs at a time (FR-014).
  - Credentials are short-lived OIDC tokens, and the federated subject is limited to the `production`
    environment (FR-010).
- **Alternatives**:
  - Building and deploying in one workflow: duplicates `containers.yml`.
  - `azure/bicep-deploy@v2`: workable, but plain `az` keeps the steps visible.

## D13. Rollback by redeploying the previous digest

- **Decision**: Rollback is `gh workflow run deploy.yml -f image_tag=sha-<previous> -f skip_migrations=true`,
  which creates a new revision from the earlier images. The deploy summary records each deployment's
  tag, so the previous one is easy to find. Database changes stay additive, so the older code works
  against the newer schema (FR-013).
- **Rationale**: In single revision mode, redeploying the earlier image is the documented path. Activating
  an old revision needs multiple revision mode, which complicates traffic handling for one user.
- **Alternatives**: Multiple revision mode with traffic labels, which adds complexity for little gain.

## D14. Restore rehearsal into a fresh local database

- **Decision**: `scripts/hosted/restore-rehearsal.sh <blob-name>` runs on the owner's Mac.
  1. Downloads the dump and manifest with `az storage blob download --auth-mode login`.
  2. Starts a uniquely named `postgres:18.6` container on a random loopback port with its own volume.
  3. Runs `pg_restore`, then compares row counts and usage totals with the manifest.
  4. Times the run.
  5. Removes the container and volume when the backup holds real records (`--keep` only for synthetic
     data).

  Real recovery (documented, not rehearsed against Aiven):
  1. Recreate the Aiven service.
  2. Restore with `pg_restore`.
  3. Update `api-postgres-connection`, `web-database-url` and `Operator__HostedDatabaseHost`.
  4. Restart the revision.

  The comparison part of the script also runs in CI against a synthetic database, to prove the check
  catches a missing row.
- **Rationale**: Matches the clarification and FR-021/FR-022. It uses only the backup and the manifest,
  so it tests what a real disaster would have.
- **Alternatives**: Comparing with the live database, which can drift while the rehearsal runs.

## D15. Identity: a separate Auth0 application for the hosted app

- **Decision**: Add a second Regular Web Application, "Bike Log (hosted)", in the existing tenant.
  - Callback `https://<fqdn>/auth/callback`; logout URL `https://<fqdn>/`.
  - Only the `email` connection, the same API audience and `BikeLog.Access`.
  - Its own client secret, kept in Key Vault.

  Users already belong to the passwordless connection and work with both applications. The local
  application keeps only localhost URLs.
- **Rationale**: Keeps the hosted client secret apart from local development, and keeps localhost
  callbacks off the hosted client.
- **Alternatives**: One application with both sets of URLs, which mixes the two environments.

## D16. Aiven region cannot be chosen on the free plan

- **Decision**: Aiven's free plan places the service in a cloud and region Aiven chooses, and may move it
  later. At setup, record the cloud, region and measured round-trip time from a Container Apps job.
  - The region must be in the EU (decision 0003 and data residency). If it is not, stop and present the
    owner with a cost estimate for the smallest paid plan in `azure-sweden-central`. That plan needs a
    new approval under FR-026.
  - Also record the PostgreSQL major version (**verify** 18). The backup image uses client 18.6, which
    can dump servers up to 18.
- **Rationale**: Clarification 5 assumed region choice might be possible; it is not on the free plan.
  The spec's assumption is updated to say so.
- **Alternatives**: Paying for a region from the start, which needs a budget change.

## D17. Database access control

- **Decision**: No IP allow-list. Container Apps outbound IPs are not stable, and a static IP needs a NAT
  gateway outside the budget. Protection is TLS with server certificate verification, a long generated
  password that lives only in Key Vault, and one database user for the app, migrations and backups.
  Separate migration and runtime roles are deferred.
- **Rationale**: This is the protection decision 0003 already named as primary. Splitting roles needs
  default-privilege grants and two sets of secrets, which is not justified for one owner yet.
- **Alternatives**: An allow-list of Azure's regional ranges, which is too broad to help; separate roles
  now, which is more secrets and setup for little gain.

## D18. Cost estimate before provisioning

- **Decision**: `docs/hosting/cost-estimate.md` lists each resource with Sweden Central retail prices
  from 2026-10-13. The expected total is €0.50–€2 a month:
  - Container Apps: within the free grant.
  - Log Analytics: within 5 GB free.
  - Key Vault, storage, metric alerts: pennies each.

  The owner approves it in that file before `bootstrap.bicep` runs. The budget is €10, with alerts at
  50% and 80% actual and 100% forecast (`Microsoft.Consumption/budgets@2026-06-01`, resource group
  scope). Cost data lags by up to a day.
- **Rationale**: Required by FR-024 and the constitution before any resource exists.
