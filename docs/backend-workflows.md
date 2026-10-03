# Local backend workflows

This milestone is synthetic-data development on loopback only. It is not authenticated personal use, a deployed Azure environment or proof of web/native behavior.

## Start and inspect

Follow README.md to select the pinned SDK, set local `.env` credentials, start Docker PostgreSQL, apply migrations and run the API. No migrations run automatically at API startup. `GET /health/ready` queries PostgreSQL. `GET /openapi/v1.json` describes the contracts and error responses.

The named `bikelog-local_postgres-data` volume survives `db-down`, restart and normal Docker shutdown. `db-reset --confirm-delete-local-data` deletes local records permanently. Test databases use unique `bikelog_test_*` names and are dropped independently of `bikelog_dev`.

## API contract

All routes start with `/api`. JSON uses camelCase. IDs are UUIDs; distances are integer metres, durations optional positive integer seconds, instants require an explicit offset and whole-microsecond precision and are stored as UTC. Missing timestamp fields, unspecified offsets, infinity sentinel values and submicrosecond inputs return sanitized 400 errors. Component types are `chain`, `cassette`, `tyre`; positions are `chain`, `cassette`, `front-tyre`, `rear-tyre`. Compatibility is validated. Entity versions start at 1. Updates/replacement increment the edited entity version. A repeated creation POST creates another record; offline operation deduplication is deferred.

| Method / route | Request / result |
| --- | --- |
| POST `/bikes` | `{name?,make,model,kind,year,color?}` → identity, metadata, displayName/version, 201 |
| PUT `/bikes/{id}` | Full metadata plus `expectedVersion`; nullable name/color can be cleared |
| GET `/bikes/{id}` | Bike ID/name/version |
| POST `/components` | `{type:"chain",make,model}` → chain identity/version, 201 |
| GET `/components/{id}` | Identity plus dated installation history |
| POST `/installations` | `{bikeId,componentId,position:"chain",startUtc,endUtc?}` → installation, 201 |
| GET `/installations/{id}` | Installation and version |
| PUT `/installations/{id}` | `{startUtc,endUtc?,expectedVersion}` → corrected dates/version |
| POST `/installations/{id}/replacement` | `{newComponentId,replacedAtUtc,expectedInstallationVersion}` → closed old/open new installations |
| POST `/rides` | `{bikeId,startUtc,distanceMetres,durationSeconds?}` → ride/version, 201 |
| GET `/rides/{id}` | Ride fields/version |
| PUT `/rides/{id}` | Creation fields plus `expectedVersion` → corrected ride/version |
| DELETE `/rides/{id}?expectedVersion=…` | Delete with version check; 204 |
| POST `/maintenance` | `{bikeId,componentId?,task,performedUtc,notes?,cost?,currency?}` → record, 201 |
| GET `/maintenance/{id}` | Maintenance record |
| GET `/bikes/{id}/maintenance` | Chronological work history |
| GET `/components/{id}/usage` | Lifetime and per-installation totals/history, duration completeness, separate initial estimate, combined lifetime and calculation time |
| GET `/bikes/{id}/usage` | All four current positions, calculated/estimated/combined lifetime, position-specific gaps, legacy currentChain and calculation time |

A component-specific maintenance record requires that component to be fitted to the selected bike at its performed instant. Installation corrections/replacements that would invalidate existing work records are rejected with 409 `maintenance_history_conflict`; keep the dates consistent with recorded work. This slice has no maintenance-correction workflow. Cost/currency are supplied together: nonnegative decimal with at most two fractional digits (up to the database's 18-digit precision), and three uppercase currency letters. Bike-specific work need not name a component.

Errors use ProblemDetails: 400 invalid input; 404 absent or other-owner record; 409 overlap, stale version or maintenance-history conflict; 500 failed persistence/calculation; 503 database unavailable. Stale responses include `currentVersion` after owner checks. The caller should preserve attempted edits, reload and resubmit after reviewing differences. Secrets and exception internals are not included in responses.

## Mileage explanation

Installation intervals are `[start,end)`. Whole rides allocate at their start. A ride exactly at removal belongs to the new chain, while one microsecond before belongs to the old chain. Chain identity persists in history after replacement; a new chain has a new component ID.

Maintenance never resets lifetime totals. Missing installation history produces `unallocatedRideIds`, not guessed usage. Seconds sum only known ride durations; `hasUnknownDuration` indicates incomplete riding hours. Initial estimates are separately persisted nonnegative integer metres. They never change recorded or installation usage; combined lifetime is checked for overflow on estimate edits and all recalculations. Components with no installation return zero usage and no calculation timestamp. A bike without installations likewise has no stored calculation timestamp, even if it has allocation gaps.

Mutations use one transaction and a per-owner PostgreSQL advisory lock, then deterministic rebuilding from authoritative history. A calculation failure rolls back both edits and projections. Usage reads use a repeatable-read snapshot. This deliberately favors simple correct rebuilding over incremental optimization for a small synthetic dataset.

## Acceptance and evidence

With the API running:

```sh
./scripts/acceptance.sh
./scripts/dev.sh test
```

Acceptance creates unique synthetic records without clearing the database. It proves: chain A receives 65,000 m; lubrication leaves that lifetime unchanged; replacement retains A's history; chain B receives the next 10,000 m. Use only an explicit loopback `BIKELOG_API_URL` if changing the default port.

Execution evidence is recorded below after running checks. Domain tests, actual PostgreSQL integration tests and HTTP acceptance are separate from cloud/client evidence.

## Later milestones and Strava next action

Sign-in and real ownership enforcement, web/native clients and a dedicated move command remain later work. Estimates and oil/wax reminder baselines are now implemented in the local synthetic backend. Azure/Neon deployment, worker/outbox, offline entry, attachments and import lifecycle remain later work. Backups and restoration must be exercised before relying on hosted records.

Strava next action: perform a separately approved feasibility spike to clarify permitted maintenance calculations, derived storage, retention and deletion for this use case. No provider OAuth, data fetch or persistent integration was implemented here; synthetic fixtures do not establish provider permission.

### Local verification on 2026-10-01

- SDK 10.0.401 build: passed, zero warnings/errors.
- Domain suite: 17 passed; PostgreSQL/API suite: 49 passed, using migrated isolated test databases.
- Live `scripts/acceptance.sh`: passed against the loopback API and named-volume PostgreSQL, preserving the 65,000/10,000 m replacement workflow.
- Repeating `scripts/dev.sh migrate`: no migrations applied on the second run.
- Database stop: readiness returned 503. Restart with the same volume: readiness returned 200 and the acceptance bike's 10,000 m current-chain total persisted.
- `git diff --check`: passed.

No cloud resources, Neon project, authentication, personal records or mobile/web UI were created. This verifies the local foundation/backend milestone only.

### Independent branch review

A fresh reviewer checked the completed six-task branch. Four Important findings were reproduced with failing tests and fixed: required timestamp fields, sanitized binding errors, PostgreSQL timestamp precision and maintenance associations after historical edits. The final suite has 66 passing tests (17 domain, 49 PostgreSQL/API).

Historical Minor: ride DELETE lacked explicit OpenAPI 204 metadata. The 2026-10-02 milestone adds and regression-tests that declaration. No Important finding remains open; no second review was requested after the regression-tested fix pass.

After the review fixes, the rebuilt API passed live HTTP acceptance again. A malformed JSON request returned sanitized 400 ProblemDetails with `code=invalid_input` and no exception details. The task-started API and PostgreSQL container were stopped after checks; the named volume and synthetic acceptance records are retained.


## UI backend contract additions (2026-10-02)

New bikes require trimmed make/model (1–100 characters), kind (`gravel|road|mountain|hybrid|other`) and year 1900–9999. Optional custom name is trimmed (maximum 100); blank normalizes to null and displayName falls back to make/model. Optional color is free text (maximum 100 characters), for example `Hazy IPA`; surrounding whitespace is trimmed and blank normalizes to null. Existing hex values remain valid. Legacy absent metadata stays readable. Ride creation/correction accepts optional name. Full PUT supplies all required fields and expectedVersion.

| Method / route | Request / result |
| --- | --- |
| GET `/bikes`, `/components` | Owner inventory, including replaced/unused parts, page envelope |
| GET `/bikes/{id}/rides` | Named ride page |
| GET `/bikes/{id}/installations` | Installation page; `status=current|all`, default current |
| GET `/components/{id}/maintenance` | Component service page |
| POST `/installations/{id}/replacement-with-service` | `{newMake,newModel,replacedAtUtc,expectedInstallationVersion,cost?,currency?}`; 200 with new component, closed/open installations and service, atomically |
| PUT `/components/{id}/estimate` | `{initialUsageEstimateMetres,expectedVersion}`; 200 updated component |
| GET/PUT `/bikes/{id}/reminder` | Backend evaluated rule; PUT `{enabled,method?,oilThresholdMetres?,waxThresholdMetres?,expectedVersion}` |
| GET `/bikes/{id}/overview` | Metadata, full stats, current positions, gaps, currency-separated spend, recent activity and reminder in one snapshot |

Components require separate trimmed make and model (1–100 characters each) for every type: chain, cassette and tyre. For example, `make: "Campagnolo"` and `model: "Ekar C13 C-Link 13-speed"`. Creation requires `make`; replacement requires `newMake`. Component detail, collection, installation and estimate responses include both fields. Apply the `ComponentMake` migration before using the updated API; missing or blank make is rejected for new components and replacements.

Pages return `{items,nextCursor}`. `pageSize` defaults to 50 and ranges 1–200. Follow opaque nextCursor on the same route/parent/filter; malformed, oversized (over 2048 characters) or mismatched cursors return 400. These pages are not one shared snapshot across requests: refresh collection pages after mutation and do not reuse cursors under a different filter. Current installations exclude future starts. Existing bike maintenance remains unpaged for compatibility.

Reminder method wire values are `oil|wax`; both intervals are independent integer metres from 1000 to 10000000. Absent rules are disabled with ruleVersion zero. Enabling requires method and both intervals. Selection/interval edits immediately re-evaluate without fabricating service or changing baseline/lifetime. Stable service taskKey is `chain-lubrication`; only this keyed task establishes lubrication (migration backfills the exact legacy `Lubricate chain` on a chain). Future service does not reset today's baseline. Baseline/due/remaining values come from the server's captured evaluation time. Service records remain costs/history and never reset lifetime. These synthetic thresholds are not maintenance advice.

## Explicit compatible upgrade

```sh
./scripts/dev.sh db-up
./scripts/dev.sh migrate
./scripts/dev.sh rebuild-usage
./scripts/dev.sh run
# In another terminal:
./scripts/acceptance.sh
./scripts/acceptance-ui-backend.sh
```

Migration and rebuild never run at normal startup. `rebuild-usage` runs the guarded Development executable with `--rebuild-usage`, enumerates distinct local owners and rebuilds each under its mutation lock and transaction, logs aggregate owner counts and exits without serving HTTP. A failing owner retains prior projections and the command can safely repeat; earlier owners may already have committed. Preserve the named volume. Additive migration preserves IDs/names/history/costs, initializes estimates to zero and leaves absent reminder rules disabled. Rollback means compatible application code: foundation code cannot safely interpret new types/nullable names; schema downgrade is not a preservation strategy.

UI acceptance uses unique synthetic run markers and paginated rediscovery rather than fixture identities. It refuses non-loopback URLs and creates retained synthetic records without clearing data. The existing fixed-boundary integration tests and server-relative HTTP reminder scenario provide different evidence. No UI/client integration, authentication, personal data or cloud resources are authorized by these commands.

### Local verification on 2026-10-02

Final controller regression passed: 48 domain and 143 PostgreSQL/API tests, zero failures; pinned formatter/analyzer lint passed with zero warnings/errors. Eight upgrade/contract tests cover foundation-schema SQL upgrade, repeatable owner-atomic rebuild failure, OpenAPI routes/required fields/units/wire enums/envelopes/statuses, ride DELETE 204, nullable enum null membership and API-only paginated reload. Both live HTTP scripts passed against readiness 200 on port 5080. UI acceptance also round-tripped name clearing to make/model fallback, named absent-duration rides, notes and omitted replacement costs. Repeated migration applied nothing; repeated explicit rebuild completed for one local owner. Non-loopback acceptance was refused. `git diff --check` passed.

All eight tasks passed independent review. The final whole-branch reviewer found no Critical or Important defects; five Minor follow-ups were fixed in one wave and passed scoped re-review. Final regression totals above include those fixes. Task-started API processes and PostgreSQL were stopped after verification, restoring the initial service state. The named volume and all preexisting/synthetic acceptance data remain intact. The owner selected committing and local integration into `main` on 2026-10-02; remote publication was not requested.

After the nullable-enum and redirect fixes, both HTTP acceptance scripts passed again with readiness HTTP 200 on port 5080. Task-started API processes were stopped; PostgreSQL was subsequently stopped by the controller; the named volume is retained.
