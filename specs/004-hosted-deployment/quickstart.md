# Quickstart: Minimal Hosted Deployment

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

A setup and validation runbook. Each scenario lists its prerequisites, steps and expected outcome. Record
each run's date, observed result and any deviation in `docs/hosting/setup-results.md`. Commands and
settings are defined in [contracts/](contracts/), so this guide does not repeat them.

## Part A: local checks (no Azure)

### A1. Application changes pass their tests

```sh
./scripts/dev.sh db-up
./scripts/dev.sh lint && ./scripts/dev.sh test
npm run web:lint && npm run web:typecheck && npm test && npm run web:build
```

Expected: all pass, including:

- operator target guard cases (local allowed; hosted allowed only in Production with VerifyFull, CA and a
  matching host; everything else refused);
- Production + Synthetic refused;
- OpenAPI absent outside Development;
- proxy accepts an https origin and refuses a mismatched Host or `X-Forwarded-Proto: http`;
- session database refuses a non-loopback host without a CA file;
- `/healthz` returns 200 or 503 per [contracts/health.md](contracts/health.md);
- security headers present.

### A2. Backup and restore round trip against Docker

```sh
scripts/hosted/tests/run.sh
```

Expected:

1. The test seeds a synthetic database, runs `backup.sh` with a local-directory upload target and
   restores the result.
2. All checks in [contracts/backup-format.md](contracts/backup-format.md) pass.
3. A second run that deletes one ride after the dump makes the comparison fail with a non-zero exit.
4. The test removes only the containers it created.

### A3. Infrastructure compiles

```sh
az bicep install --version v0.48.1
az bicep build --file infra/bootstrap.bicep && az bicep build --file infra/main.bicep
az bicep lint --file infra/main.bicep
```

Expected:

- no errors or lint warnings;
- `main.bicep` contains no role assignment or role definition;
- no resource sets private endpoints, Dedicated profiles or a maintenance window.

## Part B: owner gate (before any Azure resource exists)

1. Review `docs/hosting/cost-estimate.md` and add the dated approval line (FR-024).
2. Make the GHCR packages `web`, `api`, `migrations` and `backup` public. Confirm an anonymous
   `docker pull` of `web` works.
3. Create the Aiven free PostgreSQL service and record its cloud, region and PostgreSQL version. **Stop
   if the region is outside the EU** (research D16).
4. In Auth0, create the "Bike Log (hosted)" application per `docs/auth/auth0-pilot-setup.md`. The
   callback URL is filled in after B6.
5. In GitHub, create environment `production`, restricted to `main`, and set the variables listed in
   [contracts/operations.md](contracts/operations.md).
6. Run `bootstrap.bicep` with values from `.local/`, then set every Key Vault secret from
   [contracts/hosted-configuration.md](contracts/hosted-configuration.md).

Expected: `az consumption budget list` shows €10 with three notifications. Key Vault lists six secret
names. The deploy identity has only Contributor on the resource group.

## Part C: hosted validation with test data only

### C1. First deployment (US3, SC-004)

Push to `main`, or run the deploy workflow with the current tag. Expected: the workflow passes in under
20 minutes, the migration execution succeeds, `https://<fqdn>/healthz` returns 200, and the step summary
lists the digests.

### C2. Network latency (D16)

Run `hosted.sh backup-now`. `backup.sh` logs the median of ten `SELECT 1` round trips before it dumps.
Record that value, read from the job's log, in `setup-results.md`.

### C3. Sign-in from anywhere (US1, SC-001, SC-003)

1. Provision the owner and one test rider with `hosted.sh provision-pilot-user`.
2. On a phone using mobile data, open the address, sign in with an emailed code, create a test bike and
   a ride, and time it.
3. Sign in on a laptop and check the ride and usage are there.

Expected: under 1 minute when warm, and both devices show the same data.

### C4. Refusals (US1, SC-003)

| Attempt | Expected |
| --- | --- |
| Sign in with an uninvited address | No account and no garage data |
| `curl -I http://<fqdn>/` | Redirect to HTTPS or refused, with no content |
| Request with `Host` altered, or with `Origin` foreign on a POST | 403 |
| `https://<fqdn>/openapi/v1.json` | Not found |
| Any route of the API port from outside | Unreachable (no ingress) |

### C5. Cold start (SC-002)

Leave the app idle for over 30 minutes, then open it and time until the garage is usable. Expected:
30 seconds or less, with a loading state and no error page.

### C6. Pilot rider isolation and revocation (US4)

1. Sign in as the test rider: their garage is empty and separate from the owner's.
2. Run `hosted.sh disable-pilot-user --owner <uuid>`. The rider's next request is refused while their
   session is still valid.

### C7. Failed deployment and rollback (US3, SC-005)

1. Deploy a commit whose `/healthz` deliberately returns 503 (a temporary branch built with a test flag;
   never merged).
2. Confirm the old revision keeps serving with no failed requests during the attempt, and the workflow
   fails.
3. Run the rollback command from [contracts/operations.md](contracts/operations.md) for the previous good
   tag and time it.

Expected: under 5 minutes.

### C8. Backup, alert and restore rehearsal (US2, FR-022, SC-006)

1. Run `hosted.sh backup-now`, then `hosted.sh backups`. Expected: one dump and one manifest.
2. Run `restore-rehearsal.sh <blob>` and time it. Expected: all checks pass in under 1 hour.
3. Disable the backup job's schedule, or point it at a wrong secret version, for one day. Expected: the
   "backup missing" email arrives within a day. Restore the setting afterwards.
4. Confirm the job identity cannot overwrite or delete. Run `hosted.sh backup-verify-permissions`, which
   starts the backup job once with `backup.sh --verify-permissions`. That mode re-uploads the latest dump
   name and then deletes it, as the job identity. Expected: both attempts are refused (409/403) and the
   blob is unchanged.

**Gate**: only after C1–C8 pass and are recorded may real records be entered.

### C9. Recreate check (SC-009, optional before real data)

In a second, temporary resource group, run bootstrap and main from the repository and time it to a
healthy `/healthz`, pointing at a test database. Then delete the temporary resource group. This needs
the owner's approval, because it briefly doubles resources; the cost stays within free allowances.

## Part D: after real use begins

- After 30 days, check that there are at least 28 daily backups and that any failures alerted (SC-007).
- Monthly, compare actual cost with the estimate (SC-010).
- Search the repository and workflow logs for secrets with `gitleaks detect` and a log grep for known
  secret prefixes (SC-008).
