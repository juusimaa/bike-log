# Backend Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Run a local API backed by Docker PostgreSQL that proves chain installation, manual ride allocation, maintenance, replacement and historical corrections with synthetic records.

**Architecture:** A modular ASP.NET Core API uses EF Core/Npgsql persistence and a pure domain calculator. Each relevant mutation and its rebuilt usage totals commit in one transaction; a shared calculator interface remains reusable by a future worker. This is the foundation/first-backend slice, not the complete personal release.

**Tech Stack:** .NET 10 / ASP.NET Core, EF Core 10, Npgsql EF provider 10, PostgreSQL 17 in Docker Compose, xUnit, Microsoft.AspNetCore.Mvc.Testing, built-in OpenAPI. Select current compatible stable patch versions during Task 1, then pin SDK, packages, EF tool and container digest.

**Spec:** `docs/superpowers/specs/2026-10-01-bike-maintenance-design.md` (owner approved 2026-10-01).

## Global Constraints

- "backend first; React Native is required; local PostgreSQL runs in Docker; hosted PostgreSQL uses Neon; the first useful release tracks individual parts. Detailed UI design follows validated backend workflows."
- "Use a named Docker volume; document startup, migrations and an explicitly destructive reset command. Test with synthetic data."
- "The initial synchronous milestone must save relevant edits and resulting totals atomically; failed calculation must not leave apparently current but inconsistent totals."
- "Installations use half-open intervals `[start, end)`."
- "Store distances in metres, durations in seconds and timestamps in UTC; display local time."
- "Before real personal data or remote exposure, enforce authentication and owner checks on every resource."
- "No automatic paid upgrade is authorized."
- No web/mobile scaffolding, worker, queue, cloud provisioning, hosted database access or provider OAuth in this plan. Later specification sections remain required milestones, not completion claims for this slice.

## Review Focus

- Simultaneous installs/replacements cannot pass validation independently and leave overlapping history — Tasks 2 and 4.
- A ride at the removal instant belongs to the replacement; one microsecond before belongs to the old chain — Tasks 2 and 5.
- Offset timestamps, absent duration and invalid quantities must produce consistent UTC allocation and clear errors — Tasks 2 and 5.
- A calculation failure after a historical edit must roll back history and totals together — Tasks 3 and 5.
- Stale requests, cross-owner identifiers and accidental non-development startup must not alter or expose records — Tasks 1, 4 and 5.

## Scope and contracts

Initial scope supports multiple persisted records for testing, but proves one bike and chain. Only `ComponentType.Chain` and `InstallationPosition.Chain` are accepted in this slice; other component types, moves, estimates and reminder baselines follow in Phase 2. Zero starting usage is explicit. Maintenance is retained as history without reminder calculations yet.

Use namespace root `BikeLog`. IDs are `Guid`, distances/durations are `long`, entity versions are `long` beginning at 1, input instants are `DateTimeOffset` normalized to UTC before persistence. Costs use `decimal` with up to two fractional digits, a nonnegative value and a three-letter uppercase currency supplied together. Distance must be positive; duration, when present, must be positive. Intervals must have `end > start`. No server-clock restriction on synthetic timestamps.

Every development request uses fixed synthetic owner `11111111-1111-1111-1111-111111111111` from an `IDevelopmentOwner` service, never an owner supplied by the HTTP client. Every entity lookup scopes by owner. A second owner exists only inside tests. This is not authentication and must be replaced before actual personal use.

API route prefix `/api`; camelCase JSON; ProblemDetails for failures. Statuses: 201 plus Location for creation; 200 for reads/updates/replacement; 204 for ride deletion; 400 for malformed/invalid input; 404 for unknown or other-owner IDs; 409 for overlaps or stale versions. Error extensions include `code`, and `currentVersion` for stale edits after ownership has been verified. Responses never include database exceptions, credentials or another owner's records.

Mutation DTOs include `expectedVersion` on updates/deletions and `expectedInstallationVersion` on replacement. Creates use server-generated IDs. Duplicate create retry prevention is deferred with offline operation IDs; OpenAPI documents that identical POSTs are distinct records.

### File responsibilities

| Files | Responsibility |
| --- | --- |
| `BikeLog.slnx`, `global.json`, `Directory.Build.props`, `Directory.Packages.props`, `.config/dotnet-tools.json` | Solution, pinned tooling/packages, nullable analysis |
| `compose.yaml`, `.env.example`, `scripts/dev.sh`, `README.md` | Loopback-only local database and developer commands |
| `src/Domain/BikeLog.Domain.csproj`, `src/Domain/{Bikes,Components,Installations,Rides,Maintenance,Usage}/` | Entities, interval validation and pure allocation |
| `src/Infrastructure/BikeLog.Infrastructure.csproj`, `src/Infrastructure/Persistence/` | DbContext, entity configurations, migrations and transaction coordinator |
| `src/Api/BikeLog.Api.csproj`, `src/Api/Program.cs`, `src/Api/Development/`, `src/Api/Features/` | Local-only host, owner context, contracts and grouped endpoints |
| `tests/Domain.Tests/`, `tests/Integration.Tests/` | Domain behavior and actual PostgreSQL/API verification |
| `docs/backend-workflows.md`, `docs/decisions/0001-local-backend.md` | Workflow, API semantics, chosen versions and Strava next action |

Use a dedicated file per named entity, contract group, endpoint group or service; do not put all application behavior into Program.cs. No generic repository framework or empty future modules.

## Task 1: Runnable local host and Docker PostgreSQL

**Files:** Create solution/tooling files above; `src/Api/Program.cs`, `src/Api/Development/DevelopmentAccess.cs`, `compose.yaml`, `.env.example`, `scripts/dev.sh`, `README.md`; all five project files; `tests/Integration.Tests/Fixtures/PostgresFixture.cs`, `tests/Integration.Tests/Fixtures/ApiFactory.cs`, `tests/Integration.Tests/HostTests.cs`.

**Interfaces:** Produces `IDevelopmentOwner.OwnerId : Guid`; `DevelopmentAccess.Validate(IHostEnvironment environment, IConfiguration configuration) : void`; `PostgresFixture.ConnectionString : string`; an isolated PostgreSQL database per API test factory. `scripts/dev.sh` accepts `db-up`, `db-down`, `migrate`, `run`, `test`, `db-reset`. Readiness endpoint `GET /health/ready` returns 200 only after a real database query succeeds, otherwise 503. OpenAPI is available at `/openapi/v1.json` locally.

- [x] **Step 1:** Check SDK and Docker daemon availability. Choose a current stable .NET 10 SDK and compatible 10.x packages; install/update the SDK only if necessary. Pin exact versions and a resolved PostgreSQL 17 image digest; record them in the decision document. Create the five projects and their references: Infrastructure → Domain; Api → Domain/Infrastructure; tests → relevant production projects. Add xUnit and API testing dependencies. Enable nullable analysis, package lock files and an EF local-tool manifest. This scaffolding is part of the runnable-host deliverable.
- [x] **Step 2:** Write HostTests: `ReadyRequiresReachablePostgres` asserts ready=200 with PostgreSQL and 503 with an unreachable connection; `RejectsProductionAndUnconfiguredSyntheticMode` asserts host initialization fails outside Development or without `LocalSyntheticMode=true`; `RejectsNonLoopbackBinding` asserts wildcard/LAN binding is rejected; `OpenApiIsAvailableLocally` asserts 200 and an OpenAPI document.
- [x] **Step 3:** Run `dotnet test tests/Integration.Tests --filter FullyQualifiedName~HostTests`; expect failing assertions or missing endpoint/guard until implemented. Keep fixture failures distinct from expected red tests.
- [x] **Step 4:** Implement the development host, fail-closed startup guard, synthetic owner and DB readiness check. Permit only explicitly configured loopback HTTP hosting; do not enable forwarded headers, CORS or an unauthenticated production mode. Bind API at `http://127.0.0.1:5080`, PostgreSQL at `127.0.0.1:54329`. Compose uses a named volume and `pg_isready` healthcheck; credentials come from ignored `.env`, with synthetic-only examples. Integration fixture creates/drops uniquely named test databases on the local container and refuses remote hosts or the developer database as its test target. Do not print connection strings.
- [x] **Step 5:** Implement developer commands; `db-reset` requires explicit `--confirm-delete-local-data` before deleting the Compose volume and warns that local data is lost. `db-down` preserves the volume. Document Docker startup and health, ports, isolated test databases, migration steps and synthetic-only scope. Run `./scripts/dev.sh db-up` and the HostTests; expect healthy PostgreSQL and all assertions passing.
- [x] **Step 6:** Commit this task's named files and dependency locks with `chore: add local API and Docker PostgreSQL foundation`.

## Task 2: Installation and usage domain rules

**Files:** Create `src/Domain/Bikes/Bike.cs`, `Components/Component.cs`, `Installations/Installation.cs`, `Installations/InstallationRules.cs`, `Rides/Ride.cs`, `Maintenance/MaintenanceRecord.cs`, `Usage/IUsageCalculator.cs`, `Usage/UsageCalculator.cs`, `Usage/UsageCalculation.cs`; `tests/Domain.Tests/InstallationRulesTests.cs`, `tests/Domain.Tests/UsageCalculatorTests.cs`.

**Interfaces:** Entities include ID, OwnerId and Version; Bike has Name; Component has Type and Model; Installation has ComponentId, BikeId, Position, StartUtc and nullable EndUtc; Ride has BikeId, StartUtc, DistanceMetres and nullable DurationSeconds; MaintenanceRecord has BikeId, optional ComponentId, Task, PerformedUtc, Notes and optional Cost/Currency. `InstallationRules.Validate(IReadOnlyList<Installation> installations) : void` raises `DomainValidationException` defined in `src/Domain/DomainValidationException.cs`. Define the result records in `Usage/UsageCalculation.cs` with `ComponentUsages`, `InstallationUsages` and `UnallocatedRideIds` list properties. `IUsageCalculator.Calculate(IReadOnlyList<Ride> rides, IReadOnlyList<Installation> installations) : UsageCalculation` returns `ComponentUsage` (ComponentId, LifetimeMetres, LifetimeSeconds, HasUnknownDuration), `InstallationUsage` (InstallationId, Metres, Seconds, HasUnknownDuration) and `UnallocatedRideIds`.

Duration totals sum known seconds; unknown ride durations set the flag rather than claim complete hours. Return a zero usage row for installations without rides. Lifetime totals aggregate a component's dated installations; no starting estimates in this slice.

- [x] **Step 1:** Write named tests with exact assertions: `RideAtStartAllocates65000Metres`; `RideBeforeStartIsUnallocated`; `ReplacementBoundaryIsHalfOpen` (ride at boundary → new ID; one microsecond before → old ID); `MaintenanceDoesNotChangeUsage`; `MissingDurationIsFlagged`; `OffsetInstantMatchesUtcInstant`; `OverlappingComponentAndPositionAreRejected`; `AdjacentIntervalsAreAllowed`; `OverflowFailsRatherThanWraps` (sum `long.MaxValue` and 1 throws). Validate zero/negative distances and durations and inverted intervals.
- [x] **Step 2:** Run `dotnet test tests/Domain.Tests`; expect failure for absent behavior.
- [x] **Step 3:** Implement the entities, interval validation and pure deterministic calculator using checked integer arithmetic. Domain owns overlap/allocation rules; no database/HTTP dependencies. Treat every ride without an installed chain as an allocation gap.
- [x] **Step 4:** Run the domain tests; expect all assertions passing, including `Assert.Equal(65_000L, result.ComponentUsages.Single().LifetimeMetres)`, `Assert.Contains(unfittedRide.Id, result.UnallocatedRideIds)` and `Assert.True(result.ComponentUsages.Single().HasUnknownDuration)` in their respective fixtures. Verify calculation is independent of input order and repeated calculation returns identical totals.
- [x] **Step 5:** Commit the task's files with `feat: define dated chain installation and deterministic usage rules`.

## Task 3: Persistence and atomic recalculation

**Files:** Create `src/Infrastructure/Persistence/BikeLogDbContext.cs`, `Configurations/{Bike,Component,Installation,Ride,MaintenanceRecord,Usage}Configuration.cs`, `Migrations/` generated initial migration/snapshot, `OwnerMutation.cs`, `UsageRebuilder.cs`; `tests/Integration.Tests/PersistenceTests.cs`, `AtomicRecalculationTests.cs`.

**Interfaces:** `BikeLogDbContext` exposes DbSets for the five entities plus `ComponentUsageRow` and `InstallationUsageRow`. Define both row types in `src/Infrastructure/Persistence/UsageRows.cs`; they mirror Task 2 totals and carry `OwnerId` and `CalculatedAtUtc`. Persist allocation gaps by querying authoritative ride/install history with Task 2 calculator on usage reads; do not invent a separate gap entity. `UsageRebuilder.RebuildAsync(Guid ownerId, CancellationToken ct) : Task` loads that owner's history, calls Task 2 calculator and replaces their calculated rows inside the caller's transaction. `OwnerMutation.ExecuteAsync<T>(Guid ownerId, Func<CancellationToken, Task<T>> mutation, bool recalculate, CancellationToken ct) : Task<T>` owns transaction, serialization, SaveChanges, optional rebuild and commit.

- [x] **Step 1:** Write `MigrationsCreateUsableSchema` (migrate empty test DB; save/read chain history); `RejectsCrossOwnerRelationships` (foreign-owner bike/component relationship fails at database level); `FailedRebuildRollsBackRideAndTotals` (inject throwing calculator inside OwnerMutation; ride and totals equal pre-edit snapshot); `ConcurrentOwnerMutationsSerialize` (two independently scoped coordinators; second waits, then sees first committed state).
- [x] **Step 2:** Run `dotnet test tests/Integration.Tests --filter 'FullyQualifiedName~PersistenceTests|FullyQualifiedName~AtomicRecalculationTests'`; expect the targeted behaviors to fail.
- [x] **Step 3:** Implement EF mappings, required fields, composite owner/ID relationship constraints, UTC timestamps, numeric/check constraints, stable version concurrency tokens and indexes for owner/bike/time lookups. Generate and inspect migration SQL. Do not use EnsureCreated or silently migrate at API startup; the migration command is explicit.
- [x] **Step 4:** Implement OwnerMutation with a PostgreSQL transaction-scoped advisory lock derived deterministically from OwnerId (never process-random GetHashCode); all API mutations take it before reads/validation. This intentionally serializes mutations per owner for the small synchronous slice and protects overlapping-install checks across processes. Save history, rebuild rows and commit in one transaction. Rebuild the owner's small dataset rather than introduce incremental algorithms. No user can call the internal coordinator directly.
- [x] **Step 5:** Run the targeted tests, including an injected calculation failure and actual independent database connections; expect all passing. The rollback test compares pre/post snapshots with `Assert.Equal(beforeRide, afterRide)` and `Assert.Equal(beforeTotals, afterTotals)`. Run `./scripts/dev.sh migrate` twice; second run applies no new migrations.
- [x] **Step 6:** Commit with `feat: persist maintenance history and usage atomically`.

## Task 4: Bike, chain, installation and maintenance API

**Files:** Create `src/Api/Features/Bikes/{BikeContracts,BikeEndpoints}.cs`, `Components/{ComponentContracts,ComponentEndpoints}.cs`, `Installations/{InstallationContracts,InstallationEndpoints}.cs`, `Maintenance/{MaintenanceContracts,MaintenanceEndpoints}.cs`, `Errors/ApiProblemMapping.cs`; modify Program.cs for registrations; create `tests/Integration.Tests/EquipmentApiTests.cs`, `MaintenanceApiTests.cs`.

**Interfaces:** Routes:
- `POST /api/bikes` `{name}`; `GET /api/bikes/{id}` → bike identity/version.
- `POST /api/components` `{type:"chain",model}`; `GET /api/components/{id}` → identity/version and dated installations.
- `POST /api/installations` `{bikeId,componentId,position:"chain",startUtc,endUtc?}`.
- `PUT /api/installations/{id}` `{startUtc,endUtc?,expectedVersion}` → corrected interval/version; changes to bike/component identity are outside this slice.
- `POST /api/installations/{id}/replacement` `{newComponentId,replacedAtUtc,expectedInstallationVersion}` → old and new installation records. Requires old interval open, a different chain owned by the same owner, and replacement after old start.
- `POST /api/maintenance` `{bikeId,componentId?,task,performedUtc,notes?,cost?,currency?}`; `GET /api/bikes/{id}/maintenance` → chronological records. If a component is supplied, it must be fitted to that bike at the maintenance instant. Maintenance at removal belongs to the replacement, consistent with installation intervals.

Domain services consume Task 3 coordinator; no direct SaveChanges in endpoint handlers. Increment versions on updates. Replacing changes the old installation version and creates the new installation at version 1.

- [x] **Step 1:** Write `CreatesBikeChainAndInstallation`; `ReplacementClosesOldAndOpensNewAtomically`; `ConcurrentInstallsYieldOneSuccessAndOne409`; `InvalidReplacementChangesNothing`; `StaleInstallationReturns409WithCurrentVersion`; `OtherOwnerIdsReturn404WithoutMutation`; `HistoricalCorrectionRejectsOverlap`; `MaintenanceRetainsOptionalCostAndDoesNotResetUsage`; `InvalidCostCurrencyPairReturns400`; `ComponentMaintenanceRequiresDatedBikeAssociation`.
- [x] **Step 2:** Run `dotnet test tests/Integration.Tests --filter 'FullyQualifiedName~EquipmentApiTests|FullyQualifiedName~MaintenanceApiTests'`; expect missing routes or failing behavior.
- [x] **Step 3:** Implement contracts, endpoint groups, owner-scoped lookups and ProblemDetails mapping. Validate nonblank name/model/task, allowed type/position, timestamps, references and cost rules. Normalize offsets to UTC; preserve notes. Overlap and expected-version checks happen after owner lock acquisition. Replacement and installation corrections trigger rebuilding; maintenance logging preserves existing usage.
- [x] **Step 4:** Run targeted tests; expect all passing: concurrent install responses satisfy `Assert.Equal(new[] { 201, 409 }, statuses.Order().ToArray())`; stale edit satisfies `Assert.Equal(409, (int)response.StatusCode)` and exposes the owner-visible current version. Check OpenAPI advertises units, half-open boundaries, expected versions, synthetic-only access and documented status codes.
- [x] **Step 5:** Commit with `feat: add bike chain installation and maintenance endpoints`.

## Task 5: Ride entry, correction and explained usage

**Files:** Create `src/Api/Features/Rides/{RideContracts,RideEndpoints}.cs`, `Usage/{UsageContracts,UsageEndpoints}.cs`; modify Program.cs; create `tests/Integration.Tests/RideApiTests.cs`, `MaintenanceWorkflowTests.cs`.

**Interfaces:** `POST /api/rides` `{bikeId,startUtc,distanceMetres,durationSeconds?}`; `PUT /api/rides/{id}` with same values plus `expectedVersion`; `GET /api/rides/{id}` returns its fields and version; `DELETE /api/rides/{id}?expectedVersion={version}`. `GET /api/bikes/{id}/usage` → current fitted chain, installation/lifetime totals, known seconds/unknown-duration flags, zero starting estimate, unallocated ride IDs and calculation time. `GET /api/components/{id}/usage` → lifetime totals plus per-installation totals/history. Both reads are owner-scoped. Reads never advertise pending worker state in this synchronous slice.

- [x] **Step 1:** Write full workflow assertions: install chain A; create 65,000 m ride; lifetime/current A=65,000; record lubrication, still 65,000; replace A with B; create 10,000 m ride after replacement; A=65,000 and B=10,000. Assert stored installation history and maintenance remain accessible. Add `RideAtReplacementInstantUsesNewChain` and `HistoricalInstallationCorrectionMovesRideAllocation`.
- [x] **Step 2:** Write `RideCorrectionAndDeletionRebuildTotals`; `UnfittedRideProducesVisibleGap`; `MissingDurationDoesNotClaimCompleteHours`; `MalformedAndNonpositiveQuantitiesReturn400`; `StaleRideDoesNotChangeTotals`; `OtherOwnerRideAndUsageAre404`; `FailedCorrectionPreservesRideAndProjection` using a failing calculator. Assert offset timestamps round-trip as UTC and quantities remain exact integers.
- [x] **Step 3:** Run `dotnet test tests/Integration.Tests --filter 'FullyQualifiedName~RideApiTests|FullyQualifiedName~MaintenanceWorkflowTests'`; expect failure until routes and response models exist.
- [x] **Step 4:** Implement routes and response models using Task 3 transaction coordinator and Task 2 calculator. Validate bike references and versions inside the transaction; map overflow/calculation errors without exposing internals and guarantee rollback. Owner lock also coordinates ride edits with replacement/interval edits. Use a consistent read snapshot when composing totals/history so concurrent commits cannot create mixed explanations.
- [x] **Step 5:** Run all domain and integration tests; expect workflow and failure assertions passing against actual PostgreSQL, including `Assert.Equal(65_000L, oldChain.LifetimeMetres)` and `Assert.Equal(10_000L, newChain.LifetimeMetres)` after the full workflow. Inspect output for leaked credentials or payload dumps.
- [x] **Step 6:** Commit with `feat: add manual rides and explained synchronous usage`.

## Task 6: Reproducible acceptance workflow and milestone record

**Files:** Create `docs/backend-workflows.md`, `docs/decisions/0001-local-backend.md`, `scripts/acceptance.sh`; update README.md and developer commands as needed.

**Interfaces:** `./scripts/acceptance.sh` exercises the Task 4/5 HTTP routes on the explicitly configured loopback API using fresh synthetic identifiers and asserts the 65,000/10,000 m replacement workflow. It must not wipe the developer database or call hosted services. Exits nonzero on failed assertions.

- [x] **Step 1:** Document the exact API contracts, examples, installation boundaries, gap/unknown-duration explanation, synthetic owner limitation, synchronous transaction behavior and deferred features. Record chosen pinned versions and the per-owner serialization trade-off.
- [x] **Step 2:** Record Strava next action as an unresolved separate feasibility spike to clarify permitted maintenance calculations/retention. No OAuth, transient provider read, network integration test or permission claim belongs to this milestone.
- [x] **Step 3:** Implement the acceptance script with explicit failure checks, unique records and no embedded connection strings. Its expected totals are chain A=65,000 m after maintenance/replacement and chain B=10,000 m after the next ride. Run it after migrating and starting the API; expect success and a concise synthetic-only result.
- [x] **Step 4:** From a fresh isolated test database, run migrations and all tests. Run `dotnet build BikeLog.slnx`, `./scripts/dev.sh test`, `./scripts/acceptance.sh` and `git diff --check`; all must pass. Confirm database restart preserves a synthetic record, database downtime makes readiness fail, and recovery restores readiness. Do not reset existing developer data to perform this check.
- [x] **Step 5:** Record actual commands/results and limitations in the workflow document. Confirm Phase 0/1 acceptance, not personal-production readiness: no sign-in, client/device checks, Neon/Azure deployment or distributed recovery evidence is claimed. Commit with `docs: document and verify local backend acceptance workflow`.

## Self-review and handoff

Coverage: foundation/backend sections are implemented by Tasks 1–6. Component moves, starting estimates, baselines/reminders, web/native clients and real-user identity belong to the next milestone. Azure/Neon deployment, outbox/worker, offline, attachments, integrations and hosted recovery remain later milestones. The specification remains authoritative for those requirements.

The owner selected Native execution on 2026-10-01 after the plan review handoff. All six task steps have been executed; final independent review follows. Recommended: Native, because these six tasks share a small set of closely coupled domain/persistence interfaces and the milestone runs only locally with synthetic data. Complete a fresh whole-branch review after implementation; use the executing-plans workflow for Native execution. No implementation has begun at plan-writing time.

Version-selection sources: [.NET support policy](https://dotnet.microsoft.com/en-us/platform/support/policy), [Npgsql EF Core 10 release notes](https://www.npgsql.org/efcore/release-notes/10.0.html). Framework patch selection and container digest resolution must be refreshed during Task 1, rather than infer current versions from the installed SDK.
