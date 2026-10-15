> **Historical (spec 004, Azure Container Apps).** Bike Log now runs on UpCloud: see [upcloud.md](upcloud.md) and [decision 0007](../decisions/0007-upcloud-hosting.md).

# Hosted setup results

Recorded proofs for [spec 004](../../specs/004-hosted-deployment/spec.md), following the
[quickstart](../../specs/004-hosted-deployment/quickstart.md). Sanitized: no secrets, email addresses,
database host names or tenant IDs. Record failures as observed.

**Real records allowed from**: not yet. Requires every C1–C8 row below to pass, and the restore rehearsal
to pass in under 1 hour (FR-022, SC-006).

## Part A: local checks (2026-10-14, branch `feat/004-hosted-deployment`)

| Check | Result |
| --- | --- |
| A1 .NET | `./scripts/dev.sh lint` passed; `./scripts/dev.sh test` 300 passed, 0 failed. Includes the operator target guard (local allowed; hosted only in Production with VerifyFull, a root certificate and a matching host; Staging, Synthetic, `Require`, a missing certificate, a host mismatch and an empty host refused), Production refusing Synthetic mode, and OpenAPI returning 404 in Production. |
| A1 OpenAPI drift | `npm run check --workspace @bikelog/api-client` against the Development API: snapshot and types match. |
| A1 web | `web:lint`, `web:typecheck` and `web:build` passed; `npm test` 223 web and 29 API-client tests passed. Includes the https origin, Host and `X-Forwarded-Proto` rules, the TLS session database rule, `/healthz` and the security headers. |
| A2 backup and restore | `scripts/hosted/tests/run.sh` passed: synthetic data (1 user, 2 bikes, 5 components, 5 installations, 10 rides) backed up with the real backup image and restored with all checks passing. A ride deleted from the source between snapshot export and dump left manifest and dump consistent (source 9 rides, backup 10). A missing ride, a changed usage total, an extra table and a wrong checksum each failed the comparison. No container, volume or image was left behind. |
| A3 infrastructure | Bicep CLI 0.48.1: both templates build, lint reports nothing, and the CI greps find no role assignment in `main.bicep`, no private endpoint, Dedicated profile or maintenance window. `actionlint` and `shellcheck` are clean. |
| Repository secret scan | `gitleaks detect --redact` (v8.24.3) over 69 commits: no leaks after ignoring two false positives, the public built-in role IDs for Key Vault Secrets User and Officer in `infra/bootstrap.bicep` (`.gitleaksignore`). |
| Image secret scan (local builds) | `gitleaks detect --no-git` over the exported filesystems of locally built `api`, `migrations`, `web` and `backup`: `api` and `migrations` clean. `web`: Next.js writes a Server Actions encryption key and Draft Mode preview keys into `.next` at build time, so they become public with the image. The app uses neither feature, so they protect nothing today; if either is adopted, the keys must come from Key Vault at runtime instead. `backup`: Debian's unused `ssl-cert-snakeoil.key` from the upstream postgres image, and a false positive in a Perl header. Repeat against the published images in T057. |

## Findings from implementation

Platform details the plan marked **verify**, and design gaps found while building. Each is handled in
the code or docs named.

| Finding | Handling |
| --- | --- |
| `az containerapp job start --image/--args` sends a template holding only that container, which drops its environment variables (secrets) and the CA mount. | The deploy starts the migration job with no overrides; `main.bicep` already set its image. `hosted.sh` changes job arguments on the job definition instead. |
| `az … --args` (and `jq --args`) reject values starting with `--`, such as `--provision-pilot-user`. | `hosted.sh` patches the job template through `az rest` and builds the argument array from NUL-separated input. |
| `az containerapp job logs show` exists, as a preview command. | `hosted.sh` uses it, and points to the portal when it returns nothing. |
| Job metric for the missed-backup alert: `Executions`, dimension `state` (Microsoft.App/jobs metric reference, 2026-07-31). The succeeded value is assumed to be `Succeeded`. | `infra/modules/alerts.bicep`. **Verify** the value in the portal at the first backup (T043). |
| The API binds to `127.0.0.1`, so platform HTTP probes (sent to the replica IP) cannot reach it. | Probes on `web` only; `/healthz` checks the API over loopback. |
| Platform probes send the replica IP as `Host`. | `/healthz` does not apply the Host check; it returns no data. |
| Next.js resolves `headers()` at build time, and one image serves every origin. | HSTS is always sent; browsers ignore it over plain HTTP (RFC 6797 §8.1). |
| `openid-client` derives `redirect_uri` from the callback URL it is given; behind ingress `request.url` is `http:`. | The callback URL is rebuilt on the configured public origin. |
| `pg` lets an `sslmode` in a connection string override an explicit `ssl` option. | The hosted session pool is built from the URL's parts; weakening `sslmode` values are refused. |
| Public repository workflow logs are public, and GitHub prints step environments and expanded scripts. | `OWNER_ALERT_EMAIL`, `AIVEN_DATABASE_HOST` and `INGRESS_ALLOW_CIDRS` are environment **secrets**, only so they are masked; `az` runs with `-o none` or narrow queries. |
| GitHub sent an immutable OIDC subject (`repo:<owner>@<owner id>/<repo>@<repo id>:environment:production`; the repository has `use_immutable_subject: true`), so the first deployment failed sign-in with AADSTS700213 (2026-10-14). | `bootstrap.bicep` takes `githubSubjectPrefix`, defaulting to this repository's immutable prefix; bootstrap was re-run and only the credential's subject changed. |
| The first hosted sign-in showed `sign_in_failed`: Auth0 redirected to the callback with `error=invalid_request` ("Client … is not authorized to access resource server"), because the hosted application had no user-access grant on the Bike Log API (2026-10-14). A client-credentials probe returned 403 `access_denied` rather than 401, which showed the client secret itself was valid. | The owner authorized **Bike Log (hosted)** for User Access with `BikeLog.Access` on the API's Application Access tab; sign-in then worked. The setup guide should list this step explicitly. |
| Restore rehearsals and `hosted.sh backups` need the owner to read blobs. | `bootstrap.bicep` assigns the owner Storage Blob Data Reader on `backups`. |
| Custom role names are unique per tenant, so the recreate check (C9) would collide. | The role name includes the resource group name. |
| The ops job's default `--help` would have started the API server until the job timeout. | `--help` prints the operator usage and exits. |
| `backup.sh --verify-permissions` as specified (re-PUT, then DELETE) would destroy the probed backup if permissions were ever wrong. | Both attempts carry a deliberately wrong `If-Match`: a refused identity gets 403; an authorized one would get 412 and change nothing. |
| Blob REST version: the plan named 2025-11-05, which could not be confirmed. | Pinned to `2025-05-05` in `backup.sh`. **Verify** at the first hosted backup. |

## Part B: owner gate

| Item | Date | Result |
| --- | --- | --- |
| Cost estimate approved | 2026-10-14 | Approved by the owner: €10 monthly budget, expected €0.50–€2 ([cost-estimate.md](cost-estimate.md)). |
| GHCR packages public; anonymous `docker pull` of `web` | 2026-10-14 | All four packages (`web`, `api`, `migrations`, `backup`) return their `main` manifest with an anonymous registry token (HTTP 200), and `docker pull ghcr.io/juusimaa/bike-log/web:main` works with no credentials. |
| Aiven service: cloud, region, PostgreSQL major version, `max_connections` | 2026-10-14 | Free plan. Region `ams` (Amsterdam, Netherlands): in the EU, so research D16 passes. PostgreSQL 18.6, so the backup image's `pg_dump` 18.6 matches. `max_connections` 20, as the connection budget in research D11 assumes. |
| Hosted Auth0 application created | | |
| GitHub environment `production` and its variables and secrets | 2026-10-14 | Deployments limited to `main`. Seven variables (`AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_RESOURCE_GROUP`, `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, `AUTH0_CLIENT_ID`) and three environment secrets (`OWNER_ALERT_EMAIL`, `AIVEN_DATABASE_HOST`, `INGRESS_ALLOW_CIDRS`); nothing at repository level. `AUTH0_CLIENT_ID` is the hosted application's, not the local one's. |
| Bootstrap: budget €10 with three notifications | 2026-10-14 | `bootstrap.bicep` validated, then deployed to `rg-bikelog-prod` (Sweden Central). `budget-bikelog`: 10, monthly from 2026-10-01, notifications `actual50`, `actual80`, `forecast100`. Key Vault: RBAC, purge protection, 7-day soft delete. Storage: TLS 1.2 minimum, no public blob access, shared keys disabled. Federated credential subject `repo:juusimaa/bike-log:environment:production`. App identity: Key Vault Secrets User on the vault and Bike Log Backup Writer on the `backups` container only. |
| Key Vault lists six secret names | 2026-10-14 | A `SELECT 1`-style check from Docker with `sslmode=verify-full` against the Aiven CA connected as `avnadmin` over TLS (PostgreSQL 18.6, `max_connections` 20, empty `public` schema). All six secrets set with `--file`; the vault lists six names, and each stored value's SHA-256 matches its local file. |
| Deploy identity holds only Contributor on the resource group | 2026-10-14 | `az role assignment list --all`: one assignment, Contributor on `rg-bikelog-prod`. |

## Part C: hosted validation (test data only)

| Scenario | Date | Result |
| --- | --- | --- |
| C1 first deployment: duration, migration execution, `/healthz` | 2026-10-14 | Dispatched for `sha-e15d0b7` (run 38514727538). First attempt failed sign-in (immutable OIDC subject; see findings). The re-run created the environment, app and jobs in 3 min 43 s; migration execution `job-bikelog-migrate-g3g8t6y` succeeded in 35 s; the app update took 1 min 37 s; total 6 min 25 s. The run then failed in "Wait for the new revision" on its first poll: a `read` at end of input under `bash -e` (fixed in `deploy.yml`). The revision itself was Provisioned, Healthy and `RunningAtMaxScale`. From the allowed address: `/healthz` 200 `ok` in 0.15 s; `/openapi/v1.json` 404; `http://` 301 to `https://`; HSTS, `nosniff`, `same-origin` and `DENY` headers present. |
| C1 automatic deployment after merge | 2026-10-14 | PR #21 merged 05:16:53Z; Containers published; Deploy (run 38515875746) passed in 4 min: migration, one new revision `ca-bikelog--0000001` (Provisioned, Healthy), tag `sha-1f25d16`. Merge to live about 5 min (SC-004: under 20). |
| C2 database round trip median (backup log) | | |
| C3 sign-in from a phone on mobile data and a laptop, timed | | Owner provisioned 2026-10-14 after C4 passed, through `hosted.sh provision-pilot-user` (execution `job-bikelog-ops-6uy16e3` succeeded; EF logged parameters as `?`, no email in the logs; job arguments restored to `--help` with its 9 settings and the CA mount intact). Laptop, 2026-10-14 (allowed address): signed in to an empty garage, then created a test bike with 27 fitted components and one test ride in about 7 minutes (owner's timing, including data entry). The hosted database then held 1 bike, 27 installations, 1 ride and 27 usage rows for this owner, and no rows for any other owner. Owner feedback: after saving one component, the next component's dialog was slow to open; the old dialog stayed visible with a disabled retry button meanwhile. Phone on mobile data: skipped; the allow-list blocks it until T034. Not yet compared with the under-1-minute target, which assumes one bike and one ride. |
| C4 refusals: uninvited address; `http://`; altered Host; foreign Origin; `/openapi/v1.json`; no API ingress; other address while the allow-list is set | 2026-10-14 (passed) | From the allowed address: `/api/bikes` and `/api/me` without a session 401 `sign_in_required`, also with a browser-supplied bearer token; POST `/api/bikes` with a foreign Origin or none 403 `foreign_origin`; POST `/auth/logout` with a foreign Origin 403; an altered `Host` (correct SNI) 404 from the platform, never reaching the app; `X-Forwarded-Host` ignored (401); `/openapi/v1.json` 404; `/health/ready` not exposed (404); `http://` 301 to `https://`; TCP 5080 and 3000 on the FQDN refused. Owner checks: an invited but unprovisioned address signed in and saw only "Your garage is not ready yet" (pilot access required) with sign-out as the only action; an uninvited address received no code; a phone on mobile data got the platform's 403 "RBAC: access denied" while the allow-list was set. |
| App opened to the internet (allow-list cleared) | | |
| C5 cold start after 30+ minutes idle | | Not yet measured. Observed after about 5 minutes idle (2026-10-14 05:26): the replica was scheduled 0 s after the request, both containers started 23 s later (node assignment and image pulls), and the startup probe still saw 503 then; a client with a 20 s timeout gave up. Measure properly with a longer client timeout. |
| C6 rider isolation, disable and re-enable | | Test rider provisioned 2026-10-14 (execution `job-bikelog-ops-mpmfi3o` succeeded; job arguments restored). Isolation: signed in as the test rider in a private window and saw an empty garage, none of the owner's test records. Disable (`job-bikelog-ops-z07x791`): with the rider's session still valid, a reload showed only "Your garage is not ready yet" with sign-out. Re-enabled (`job-bikelog-ops-m5ie3rf`). Job arguments restored to `--help` after each run. |
| C7 failed deployment keeps the old revision; rollback timed | | |
| C8 backup, listing, restore rehearsal (timed), permission check, missed-backup alert | | |
| C9 recreate from code in a temporary resource group, timed | | |

## Restore rehearsals

| Date | Blob | Data | Duration | Checks | Problems |
| --- | --- | --- | --- | --- | --- |

## Part D: after real use

| Check | Date | Result |
| --- | --- | --- |
| 30 days: at least 28 backups; every missed day alerted | | |
| Monthly cost against the estimate | | |
| Peak Aiven `numbackends` under 15 | | |
| Log and workflow-log secret search (T057) | | |
