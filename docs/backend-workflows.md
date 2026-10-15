# Local backend workflows

This milestone is synthetic-data development on loopback only. It is not authenticated personal use, a deployed Azure environment or proof of web/native behavior.

## Start and inspect

Follow README.md to select the pinned SDK, set local `.env` credentials, start Docker PostgreSQL, apply migrations and run the API. No migrations run automatically at API startup. `GET /health/ready` queries PostgreSQL. `GET /openapi/v1.json` describes the contracts and error responses.

The named `bikelog-local_postgres18-data` volume survives `db-down`, restart and normal Docker shutdown. `db-reset --confirm-delete-local-data` deletes local records permanently. Test databases use unique `bikelog_test_*` names and are dropped independently of `bikelog_dev`.

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

## Component groups and weights (2026-10)

Feature 002 extends a bike from 4 positions to 27 in three groups (Build, Groupset, Wheels), adds optional weights and records intentionally empty positions. The domain `ComponentCatalog` is the single source for positions, types, groups, front/rear ends, labels and which positions may be empty; clients read it from `GET /component-catalog`.

| Method / route | Request / result |
| --- | --- |
| GET `/component-catalog` | `{groups, positions[{position,type,group,end,label,exemption}], pairTypes}` |
| PUT `/components/{id}` | `{make,model,weightGrams?,expectedVersion}`; type, installations and usage never change |
| POST `/installations/pair` | `{bikeId,type,make,model,weightGrams?,startUtc,initialUsageEstimateMetres?}`; two parts at the front and rear positions, all or nothing |
| POST `/installations/{id}/move` | `{toBikeId,toPosition?,movedAtUtc,expectedInstallationVersion,expectedDestinationInstallationVersion?}`; an occupied destination needs its version and its part returns to the garage |
| POST `/bikes/{id}/position-exemptions` | `{position,startUtc,expectedInstallationVersion?}`; front derailleur `none-fitted` or inner tube `tubeless`; ends an open part there at `startUtc` |
| PUT `/position-exemptions/{id}` | `{startUtc,endUtc?,expectedVersion}`; ending one makes the position `missing` until a part is fitted |
| GET `/bikes/{id}/position-exemptions` | The bike's intentionally empty periods, newest first |

Weights are whole grams, null or 1–20000, on components (`weightGrams`, also `newWeightGrams` on replacement) and the frame (`frameWeightGrams` on bikes). Bike responses add `missingPositions`; usage and overview add `positionStatuses` (`fitted|exempt|missing|not-recorded`) and `positionGaps` (rides per position without a recorded part). The overview adds `weights` per catalog group, frame and total, with `missingCount` disclosing unweighed parts and frame. Replacement maintenance is named `Replace <label>`; the existing chain, cassette and tyre names are unchanged.

### Explicit compatible upgrade (component groups)

Run `./scripts/dev.sh migrate`, then `./scripts/dev.sh rebuild-usage`. The `ComponentGroupsWeight` migration only adds nullable weight columns, widens the type and position check constraints and creates `PositionExemptions`; existing chains, cassettes and tyres keep their stored names and their totals (upgrade test `ComponentGroupsUpgradeTests`). Weights start unrecorded. Rollback is compatible application code, not a schema downgrade: earlier builds cannot read the new type and position names.

### Adding a group, type or position

1. Add the enum member and one `ComponentCatalog` entry (label, group, end, exemption).
2. Generate an additive migration; it widens `CK_Component_Type` / `CK_Installation_Position` from the enum names.
3. Regenerate the client: run the API, then `npm run api:generate`.
4. Update the counts in `ComponentCatalogTests`.
5. No web code change is expected: the board, weights and labels render from the catalog. New positions are `not-recorded` on existing bikes, so they add gaps but never make a bike incomplete.

### Local verification on 2026-10-13

Automated gates on branch `002-component-groups-weight`: CSharpier and `dotnet build --warnaserror` lint with 0 warnings and 0 errors; 72 domain and 214 PostgreSQL/API tests passed; Vitest 188 web and 29 api-client tests passed, plus 9 Node auth tests; web lint and typecheck clean; `npm run api:check` matched the local API; `git diff --check` clean. Playwright: 36 visual checks (desktop 1440, tablet 768, mobile 390, including the grouped board, wheel setup, fit/replace dialogs, overview and rides with no horizontal page scroll) and 8 live workflow checks in Chromium and WebKit against the local API and PostgreSQL. `migrate` applied `ComponentGroupsWeight` once and nothing on the second run.

| # | Result | Evidence |
| --- | --- | --- |
| 1 | Pass | `ComponentGroupsUpgradeTests`: foundation-era totals identical after migrate and rebuild; groups `groupset`/`wheels`; weights null |
| 2 | Pass | `FullPositionsApiTests` (27 statuses), web board tests, visual board check |
| 3 | Pass | API saddle test (40 km); live workflow saddle with 215 g carries the ride |
| 4 | Pass | API and live workflow: no front derailleur gap after "none fitted" |
| 5 | Pass | API: saddle in `handlebar` returns 400 |
| 6 | Pass | `AnyPositionReplacementTests` (handlebar tape, rear derailleur, rear tyre) |
| 7 | Pass | `MoveAndRefitTests`: pedals move keeps lifetime; occupied move without its version returns 409 and nothing changes |
| 8 | Pass | `PairInstallationTests`; live workflow brake pair |
| 9 | Pass | Rotor pair with rear occupied: 409, counts unchanged |
| 10 | Pass | `TubelessTests`; live workflow rear wheel tubeless |
| 11 | Pass | Front tube during tubeless period: 409 `installation_overlap` |
| 12 | Pass | Back to tubed: history lists the period, `rear-inner-tube` missing, bike incomplete |
| 13 | Pass | `BikeOverviewTests` weights: build 645 g with 1 missing, total includes frame |
| 14 | Pass | API 400 for 0, −5, 20001, 12.5; web field errors for 0 and 12.5 |
| 15 | Pass | `AuthenticatedOwnershipTests`: exemption, component edit, pair and move routes return 404 for another user |
| 16 | Pass | Two `rebuild-usage` runs on the local database (3 owners): identical usage digest |
| 17 | Pass | Owner walkthrough on 2026-10-13: all 27 positions recorded through the web app in about 6 minutes (target under 15) |
| 18 | Pass | `MoveAndRefitTests` old cassette refit to bike B |
| 19 | Pass | Move taking an occupied saddle: one call, displaced saddle to garage, lifetime continues |
| 20 | Pass | `missingPositions` on bike, list and overview; ride still saves with a saddle gap; web badge and non-blocking ride warning |

Defect found and fixed during verification: the Next.js API proxy allowlist did not include the new routes, so the live board could not load the catalog. A proxy test now checks every client-callable OpenAPI operation is forwarded.

## Bike lifecycle and ride bike choice (2026-10)

Feature `006-bike-lifecycle`; decisions D1–D11 are in `specs/006-bike-lifecycle/research.md`.

A bike has a `status` (`active` or `retired`) and, once deleted, a `DeletedUtc` tombstone that keeps only its display name. An EF Core global query filter hides deleted bikes from every bike lookup, so existing bike routes answer `404 not_found` for them without route-specific checks. These reads opt out with `IgnoreQueryFilters()`: the All rides list and component histories (to name the bike), the synthetic-owner purge, and owner discovery for `rebuild-usage`. Ride reads and usage rebuilds never query bikes, so they keep working for a deleted bike's rides.

### Contract additions

| Route | Change |
| --- | --- |
| `GET /rides?pageSize&cursor` | New. All of the owner's rides across bikes, deleted bikes included, newest first (`startUtc` desc, then `id` desc). Items are `RideListItem`: the ride fields plus `bike: BikeRef`. Cursor scope `rides:owner:{owner}`. |
| `PUT /bikes/{id}/status` | New. `{ status: "active" \| "retired", expectedVersion }`; returns `BikeResponse`. Same status again is a no-op after the version check. |
| `GET /bikes/{id}/deletion-preview` | New. Bike version, currently fitted parts (installation, component, type, make, model, position), rides kept and maintenance records deleted. |
| `POST /bikes/{id}/delete` | New. `{ expectedVersion, fittedInstallationIds, keepComponentIds }`; `204`. One transaction with a usage rebuild: kept parts' fittings end at the request time, other fitted parts are deleted, the bike's maintenance, reminder rule and exemptions are deleted, then the bike becomes a tombstone (or is removed when nothing references it). |
| `DELETE /components/{id}?expectedVersion=` | New. `204`. Deletes the part and its fittings, keeps its maintenance records with `componentId: null`, rebuilds usage. |
| `BikeResponse` | Gains `status`. |
| `ComponentResponse` | Gains `bikes: BikeRef[]`, one per bike in its installations, deleted bikes included. |
| `BikeRef` | `{ id, displayName, state: "active" \| "retired" \| "deleted" }`. |
| Reminder evaluation | `state: "paused"`, `due: false` while the bike is retired; the rule is kept. |
| `POST /rides`, `PUT /rides/{id}` | The destination must be an active bike when creating or moving (`409 bike_retired`; `404` when deleted). Keeping a ride on its own bike is always allowed, whatever that bike's state. |
| Fit, pair, move, replacement, replacement-with-service | `409 bike_retired` when the destination bike is retired. Ending a fitting (`PUT /installations/{id}`), ride corrections and deletions, and maintenance stay allowed. |

New domain error codes, both `409`: `bike_retired` and `bike_parts_changed`. The latter carries a fresh `preview` member in the problem body.

### Explicit compatible upgrade (bike lifecycle)

Run `./scripts/dev.sh migrate`. The `BikeLifecycle` migration only adds `Bikes.Status` (non-null, default `'Active'`, check `CK_Bike_Status`), `Bikes.DeletedUtc` (nullable) and the rides index `(OwnerId, StartUtc, Id)` for the All rides ordering. No data is rewritten and no `rebuild-usage` is needed: `BikeLifecycleUpgradeTests` shows every bike active and every bike, component and installation total identical before and after. Rollback is compatible application code, not a schema downgrade: older builds ignore the columns, so retired bikes look active and tombstones show as bikes with only a name. Deletions cannot be undone in the app; server backups are the only recovery.

### Local verification on 2026-10-15

Automated gates on branch `006-bike-lifecycle`: CSharpier and `dotnet build --warnaserror` lint with 0 warnings and 0 errors; 77 domain and 247 PostgreSQL/API tests passed (324, up from 300); Vitest 249 web and 30 api-client tests passed; web lint and typecheck clean; `npm run web:build` succeeded; `npm run api:check` matched the local API; `git diff --check` clean. `migrate` applied `BikeLifecycle` once and nothing on the second run. Playwright: 39 visual checks passed (desktop, tablet, mobile), including the ride bike field, All rides, the retired switcher group and the delete-bike dialog with no horizontal page scroll. Live workflows: all 12 Chromium checks passed, including the new lifecycle workflow; in WebKit the new lifecycle workflow and the error checks passed, while 5 existing checks timed out waiting for the Create bike dialog. That WebKit failure also occurs with this branch's web source changes stashed, so it predates this feature; it is recorded here and not fixed in this branch.

| # | Result | Evidence |
| --- | --- | --- |
| 1 | Pass | Web test `logRideOffersActiveBikesPreselectedToTheViewedBike`; visual `ride-bike-field` |
| 2 | Pass | Live lifecycle workflow (Chromium, WebKit): viewing A, a 30 km ride logged on B gives B's chain 30 km and A's 0 |
| 3 | Pass | Live workflow: corrected back onto A, A's chain 30 km, B's 0; `RideMoveTests` also checks a move with a new start |
| 4 | Pass | `RideMoveTests` stale move `409 stale_version`, nothing changed; web `staleCorrectionShowsSeparateCurrentAndExplicitFreshVersionReapply` |
| 5 | Pass | `AllRidesApiTests` ordering, paging and states; web `all-rides.test.tsx` links |
| 6 | Pass | Live workflow: B retired, shown with the Retired pill in the switcher, not offered in Log ride; `BikeStatusTests` history unchanged |
| 7 | Pass | Web `logRideWithOneActiveBikeShowsNoBikeField` |
| 8 | Pass | `BikeStatusTests`: fit, pair, move, both replacements `409 bike_retired`; ending a fitting `200` |
| 9 | Pass | `BikeStatusTests`: overview identical before retiring and after reactivating; reminder paused then ready again |
| 10 | Pass | `ComponentDeletionTests`: spare with a September fitting removed, gap reported for that ride |
| 11 | Pass | `ComponentDeletionTests` fitted saddle; web dialog names the bike and position |
| 12 | Pass | Live workflow: B deleted keeping both rims; rims are spares with unchanged 20 km lifetime, chain `404`, B `404` |
| 13 | Pass | Live workflow: All rides shows B's ride by name with a Deleted tag and no link |
| 14 | Pass | `BikeDeletionTests` and live workflow: kept rim's `bikes` names B as deleted; web passport shows "‹name› (deleted)" |
| 15 | Pass | `BikeDeletionTests` `409 bike_parts_changed` with a fresh preview, nothing changed; web dialog refresh keeps ticks |
| 16 | Pass | `BikeDeletionTests`: moving a deleted bike's ride to A moves usage from the kept parts to A's chain |
| 17 | Pass | `AuthenticatedOwnershipTests.LifecycleRoutesAreOwnerScoped`: every new route `404` for another owner, `401` without a session |

Scenarios were exercised through automated runs against the real API and PostgreSQL, not by hand in a browser.
