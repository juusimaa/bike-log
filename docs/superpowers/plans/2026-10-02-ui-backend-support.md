# UI Backend Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every domain flow in the UI draft persistable and discoverable through the local backend, including oil/wax reminder settings.

**Architecture:** Extend the existing domain, grouped API features and EF Core persistence. Keep synchronous, per-owner transactional mutations and snapshot reads. Clients collect input and display backend allocation/reminder results.

**Tech Stack:** Existing pinned .NET 10, ASP.NET Core, EF Core/Npgsql, Docker PostgreSQL 17, xUnit and CSharpier; no dependency upgrades required.

**Spec:** `docs/superpowers/specs/2026-10-02-ui-backend-support-design.md`, approved 2026-10-02. The overall design remains `docs/superpowers/specs/2026-10-01-bike-maintenance-design.md`.

**Status:** Implementation plan approved by the owner on 2026-10-02. Execution method: Subagent-driven. Task checkboxes record progress; approval does not imply completion.

## Global Constraints

- "Building or connecting a UI is a separate milestone."
- "Continue using synthetic records and the existing loopback development guard."
- "Keep the modular synchronous ASP.NET Core API, Docker PostgreSQL, owner-scoped queries, per-owner mutation lock, transactional recalculation, integer metres, optional integer seconds, UTC instants and half-open installation intervals."
- "Unknown and other-owner parents return 404."
- "General create-operation deduplication remains deferred."
- "Changing the method or either threshold re-evaluates the reminder immediately without changing the lubrication baseline or lifetime usage."
- "Both thresholds range from 1,000 to 10,000,000 m. Unknown methods are rejected."
- No authentication/provider choice, UI, dedicated move command, deployment, worker, Strava or cloud resources in this milestone.
- Preserve named-volume development data. Test databases remain uniquely named and disposable. Migrations and projection upgrades are explicit; startup does neither automatically.
- Use existing timestamp precision, cost/currency and sanitized error rules. Mutations check versions after ownership and lock acquisition.
- Record exact validation results. Plan approval does not authorize push/PR; commits require explicit owner authorization, even where task checkpoints suggest commit messages.

## Review Focus

- Cursor reuse across routes/parents or malformed large cursors must return 400 without owner leakage — Task 2.
- An open future installation must not appear currently fitted or supply a reminder baseline — Tasks 2, 7.
- A ride with a missing chain still allocates to fitted tyres; component compatibility must also hold for legacy replacement — Task 3.
- A combined estimate/lifetime overflow caused by a later ride must roll back that ride and its projections, not only reject estimate edits — Task 5.
- A future lubrication record must not reset today's baseline; switching oil/wax must not fabricate service or erase the other interval — Task 6.

## Shared contract decisions

IDs and versions remain `Guid` and `long`. Required request fields use the existing JSON-required pattern. Nullable fields can be explicitly cleared by full PUT requests. String enum values below are mapped explicitly at the API boundary; EF stores existing PascalCase enum names.

Use `TimeProvider.System` registered through DI; tests override it. Capture `GetUtcNow()` once per current-state read. Do not add arbitrary client-controlled evaluation times to public routes.

Collection envelope is `PageResponse<T>(IReadOnlyList<T> Items, string? NextCursor)`. Query parameters are `pageSize` (default 50, range 1–200) and `cursor`. Fetch one extra row to determine continuation. Cursors encode a version, route/parent/filter scope and final sort keys, using bounded base64url JSON; reject tokens over 2,048 characters, invalid schemas or mismatched scope. IDs use PostgreSQL UUID ordering consistently in queries and tests. Cursor opacity is an API contract, not authentication.

Existing `GET /api/bikes/{id}/maintenance` keeps its unpaged response for compatibility; new component maintenance history is paged. All collection sorting uses the approved time/ID directions. Installation filter is `status=current|all`, default current. Current filtering uses the captured server time. Component lists cover the owner’s complete inventory, including unused/replaced parts.

New creation/edit metadata: `name?`, required `make`, `model`, `kind`, `year`, optional `color`. `kind` is gravel/road/mountain/hybrid/other; `color` is `#` plus six hex digits. Trim name/make/model, max 100 characters each; blank custom names normalize to null. Legacy absent metadata is readable. A full edit supplies valid metadata; new bikes require it. DisplayName is custom name or make + model, never an invented legacy value.

## File responsibilities and dependencies

| Area | Files and responsibility |
| --- | --- |
| Identity | Existing Bikes/Rides domain, configurations and feature contracts/endpoints; add `Domain/Bikes/BikeNaming.cs` for resolved names |
| Discovery | Add `Api/Features/Collections/{PageResponse,PageCursor,CollectionEndpoints}.cs` for scoped pagination and collection reads |
| Multi-part usage | Existing Components/Installations/Usage domain and feature files; add `Domain/Installations/ComponentCompatibility.cs` |
| Replacement | Add `Api/Features/Installations/{ReplacementContracts,ReplacementEndpoints}.cs` for the composite command |
| Estimates | Add `Domain/Usage/UsageEstimate.cs` and `Api/Features/Components/ComponentEstimateEndpoints.cs` |
| Reminders | Add `Domain/Reminders/` calculator/rule/result files, EF configuration and `Api/Features/Reminders/` contracts/endpoints |
| Overview | Add `Api/Features/Bikes/{BikeOverviewContracts,BikeOverviewEndpoints}.cs` and snapshot reminder reader |
| Upgrade/evidence | EF migrations, `Api/Development/ProjectionUpgrade.cs`, dev/acceptance scripts, workflow docs and upgrade/contract tests |

Tasks 1–2 establish identity/discovery; Task 3 extends parts; Tasks 4–6 depend on that domain; Task 7 composes their reads; Task 8 verifies the complete upgraded system. Do not parallelize mutations to overlapping files.

### Task 1: Bike metadata, versioned naming and named rides

**Files:** Modify `src/Domain/Bikes/Bike.cs`, `src/Domain/Rides/Ride.cs`, `src/Infrastructure/Persistence/Configurations/{Bike,Ride}Configuration.cs`, `src/Api/Features/Bikes/{BikeContracts,BikeEndpoints}.cs`, `src/Api/Features/Rides/{RideContracts,RideEndpoints}.cs`, `tests/Integration.Tests/Fixtures/ApiScenario.cs`, `tests/Integration.Tests/{TimestampPrecisionTests,EquipmentApiTests,RideApiTests}.cs`, `scripts/acceptance.sh`. Create `src/Domain/Bikes/BikeNaming.cs`, `tests/Domain.Tests/BikeNamingTests.cs`, `tests/Integration.Tests/BikeMetadataTests.cs`, `tests/Integration.Tests/RideNamingTests.cs`. Add identity migration under `src/Infrastructure/Persistence/Migrations/`.

**Interfaces:** `BikeNaming.DisplayName(Bike bike) : string`; extend Bike with nullable Name/Make/Model/Kind/Year/Color (kind uses `BikeKind` enum), and Ride with nullable Name. `PUT /api/bikes/{id}` accepts the shared metadata fields plus `expectedVersion`; reads return those fields plus `displayName` and version. Append optional ride Name to existing create/correct/read contracts without changing distance/time/version semantics.

- [x] **Step 1:** Write `BikeNameFallsBackToMakeModel`: `Assert.Equal("Canyon Grizl 7", displayName)` after clearing custom name. Write `MetadataAndRideNameRoundTrip`, `StaleBikeEditChangesNothing`, `LegacyBikeRemainsReadable`, and `MetadataValidationRejectsInvalidValues`: assert 200/version+1 on valid edits; 409/currentVersion with unchanged state on stale edits; 404 for other-owner edits; 400 for missing new-bike metadata, 101-character fields, unsupported kind, year 1899/10000 or invalid colour. Test null/blank ride names and nonblank 100-character names round-trip.
- [x] **Step 2:** Run `./scripts/dev.sh test --filter 'FullyQualifiedName~BikeNamingTests|FullyQualifiedName~BikeMetadataTests|FullyQualifiedName~RideNamingTests'`; expect assertion failures for absent fields/routes, distinct from fixture/setup failures.
- [x] **Step 3:** Implement the named interfaces, metadata validation and versioned edit through `OwnerMutation.ExecuteAsync<T>(Guid, Func<CancellationToken,Task<T>>, bool, CancellationToken)` with recalculate=false. Generate `BikeMetadataAndRideNames` migration preserving existing Name values and null legacy metadata. Update synthetic bike creation in existing tests/scripts to send required metadata; do not weaken the old behavioral assertions.
- [x] **Step 4:** Run the targeted command and `./scripts/dev.sh test --no-restore`; require no failures. Inspect migration SQL for preservation of all old identity/history rows and nullable legacy fields.
- [x] **Step 5:** Review the task diff; commit only if authorized, suggested message `feat: add bike metadata naming and ride names`.

### Task 2: Discoverable inventory and history with scoped pagination

**Files:** Create `src/Api/Features/Collections/{PageResponse,PageCursor,CollectionEndpoints}.cs`, `tests/Integration.Tests/CollectionApiTests.cs`. Modify `src/Api/Program.cs`; add query indexes to existing configurations with a migration where query plans require them.

**Interfaces:** `PageResponse<T>` as above; `PageCursor.Encode(string scope, Guid id, DateTimeOffset? instant) : string` and `Decode(string token, string scope) : CursorPosition`, where `CursorPosition(Guid Id, DateTimeOffset? Instant)` contains the last row keys. `CollectionEndpoints.MapCollections(RouteGroupBuilder api) : void` registers the five collection routes from the spec. Installation items are `InstallationListItem(InstallationResponse Installation, ComponentResponse Component)`; ComponentResponse carries its dated history. Parent routes validate ownership before querying. Register TimeProvider here.

- [x] **Step 1:** Write `GarageLoadsWithoutKnownIds`, `RidePagesCoverEveryRowOnce`, `TiedTimesUseIdOrdering`, `CurrentAndReplacedPartsAreDiscoverable`, `ComponentMaintenanceSpansBikes`, `InvalidCursorScopeReturns400`, `PageSizeAndCursorBoundsAreValidated`, `FutureOpenInstallationIsNotCurrent`, `EmptyListsAreValid`, `CollectionsAreOwnerScoped`. Seed 51 bikes and 201 rides; assert default page count 50, continuation, complete unique ID coverage and requested ordering. Assert page sizes 0/201, tokens >2048 and route/parent/filter-mismatched cursors return 400; other-owner parent returns 404, never an empty success. Use fixed time for current/all filtering.
- [x] **Step 2:** Run `./scripts/dev.sh test --filter FullyQualifiedName~CollectionApiTests`; expect missing-route/shape failures.
- [x] **Step 3:** Implement cursor parsing, UUID/time keyset queries, envelope and owner-scoped routes. Keep all lookup/query fields scoped and sorting in SQL; do not paginate in memory. Require status=current/all, reject unknown filter values. Do not promise cross-request snapshot consistency or alter the existing bike maintenance response.
- [x] **Step 4:** Run the targeted command and full suite; require no failures. Inspect route coverage for bikes, components, bike rides, bike installations and component maintenance.
- [x] **Step 5:** Review the task diff; commit only if authorized, suggested message `feat: add owner scoped discovery and history reads`.

### Task 3: Multi-position components and explained allocation

**Files:** Modify `src/Domain/Components/Component.cs`, `src/Domain/Installations/{Installation,InstallationRules}.cs`, `src/Domain/Usage/{UsageCalculation,UsageCalculator}.cs`, Components/Installations EF configurations, Components/Installations/Usage API contracts/endpoints and `src/Infrastructure/Persistence/UsageRebuilder.cs`. Create `src/Domain/Installations/ComponentCompatibility.cs`, `tests/Domain.Tests/MultiComponentUsageTests.cs`, `tests/Integration.Tests/MultiComponentApiTests.cs`; add `IndividualComponentTypes` migration.

**Interfaces:** Add ComponentType.Cassette/Tyre and InstallationPosition.Cassette/FrontTyre/RearTyre, with wire values pinned by the spec. `ComponentCompatibility.Validate(ComponentType type, InstallationPosition position) : void`; `AllocationGap(Guid RideId, InstallationPosition Position)`. Append `AllocationGaps` to `UsageCalculation` while retaining `UnallocatedRideIds` as chain-gap IDs. `IUsageCalculator.Calculate(IReadOnlyList<Ride>, IReadOnlyList<Installation>) : UsageCalculation` remains the entry point. Bike usage adds `currentComponents` with installation identity, position and existing lifetime/installation duration fields, and `allocationGaps`; keep currentChain.

- [x] **Step 1:** Write `RideAllocatesToAllFourParts`: assert four installation/component totals equal 65_000. `MissingChainDoesNotSuppressTyres`: assert two tyre totals 65_000 and a chain AllocationGap. `DifferentPositionsMayOverlap`, `ComponentCannotOverlapAcrossBikes`, `TyreFitsEitherTyrePosition`, `TypePositionMismatchReturns400`, `LegacyReplacementRejectsDifferentType`, `BoundaryUsesReplacementPart`, `HistoricalCorrectionRebuildsAllParts`, `CurrentUsageExcludesFutureParts`: assert same-position/component overlap=409, all incompatible type/position combinations=400, exact boundary=new part and one microsecond earlier=old. Keep duration/owner tests for all allocations.
- [x] **Step 2:** Run `./scripts/dev.sh test --filter 'FullyQualifiedName~MultiComponentUsageTests|FullyQualifiedName~MultiComponentApiTests'`; expect missing enums/validation/response behavior to fail.
- [x] **Step 3:** Implement compatibility checks for create and legacy replacement, position-aware gap calculation and explicit type/position response mappings. Expand PostgreSQL type/position checks while retaining owner foreign keys. Replacement copies old Position; read current parts using one captured TimeProvider instant and repeatable-read transaction.
- [x] **Step 4:** Run targeted tests plus all domain/HTTP regressions; require no failures. Verify original 65_000/10_000 chain workflow is unchanged and maintenance-history corrections still reject invalid associations.
- [x] **Step 5:** Review the task diff; commit only if authorized, suggested message `feat: support cassette and individual tyre usage`.

### Task 4: Atomic component replacement with service and cost

**Files:** Create `src/Api/Features/Installations/{ReplacementContracts,ReplacementEndpoints}.cs`, `tests/Integration.Tests/CompositeReplacementTests.cs`. Modify `src/Api/Program.cs`; reuse existing history validation, compatibility and mutation coordinator rather than duplicating interval rules.

**Interfaces:** `POST /api/installations/{id}/replacement-with-service` accepts `ReplaceWithService(NewModel, ReplacedAtUtc, ExpectedInstallationVersion, Cost?, Currency?)`. Returns 200 `ReplacementWithServiceResponse(ComponentResponse Component, InstallationResponse OldInstallation, InstallationResponse NewInstallation, MaintenanceResponse Maintenance)`. Infer type/position from the old part; model trimmed/nonblank/max100. Task text is `Replace chain`, `Replace cassette`, `Replace front tyre` or `Replace rear tyre`; component association=new part at replacement time. Preserve existing replacement route.

- [x] **Step 1:** Write `ReplacementCreatesExactlyOneCompleteChapter`: old rear tyre gets 65_000, new gets subsequent 10_000; response/service cost=24.90m EUR and task=`Replace rear tyre`. `FailedReplacementLeavesNoRowsOrChangedTotals`: injected calculator failure=500 and before/after component, installation, maintenance and projection snapshots identical. `StaleRetryCreatesNothing`, `ConcurrentReplacementHasOneWinner`, `MaintenanceConflictLeavesNoNewComponent`, `InvalidModelAndCostPairsReturn400`, `OtherOwnerReplacementReturns404`: assert 200/409 for concurrent calls and no orphan identity/service for losers.
- [x] **Step 2:** Run `./scripts/dev.sh test --filter FullyQualifiedName~CompositeReplacementTests`; expect absent-route failures.
- [x] **Step 3:** Implement creation/history/service/rebuild inside one OwnerMutation call with recalculate=true. Check old version before creating anything; response objects include resulting versions. Preserve component history and new estimate=0. Make no independent nested HTTP requests or commits inside the command.
- [x] **Step 4:** Run the targeted command and existing EquipmentApiTests/MaintenanceHistoryConflictTests; require no failures, including atomic rollback and boundary association.
- [x] **Step 5:** Review the task diff; commit only if authorized, suggested message `feat: replace components and record service atomically`.

### Task 5: Separate persisted starting estimates

**Files:** Modify `src/Domain/Components/Component.cs`, `src/Infrastructure/Persistence/Configurations/ComponentConfiguration.cs`, `src/Infrastructure/Persistence/UsageRebuilder.cs`, Components/Usage API contracts/endpoints. Create `src/Domain/Usage/UsageEstimate.cs`, `src/Api/Features/Components/ComponentEstimateEndpoints.cs`, `tests/Domain.Tests/UsageEstimateTests.cs`, `tests/Integration.Tests/ComponentEstimateTests.cs`; add `InitialUsageEstimates` migration.

**Interfaces:** Component.InitialUsageEstimateMetres : long default zero. `UsageEstimate.Combined(long calculatedMetres, long estimateMetres) : long` uses checked addition and rejects negatives. `PUT /api/components/{id}/estimate` accepts `{initialUsageEstimateMetres,expectedVersion}` and returns identity/version, calculatedLifetimeMetres, initialUsageEstimateMetres, combinedLifetimeMetres. Append combinedLifetimeMetres to component usage and current component usage; lifetimeMetres continues to mean calculated mileage. New component creation remains estimate=0; edits set the estimate.

- [x] **Step 1:** Write `EstimateIsSeparateFromCalculatedAndInstallationMileage`: `Assert.Equal(185_000, combined)`, `Assert.Equal(65_000, calculated)`, `Assert.Equal(120_000, estimate)` and installation=65_000. `ChangingEstimateDoesNotRewriteHistory`, `EstimateFollowsComponentAcrossInstallations`, `StaleAndOtherOwnerEstimateEditsAreRejected`, `NegativeAndOverflowingEstimatesLeaveStateUnchanged`, `LaterRideOverflowRollsBack`: long.MaxValue estimate with existing positive calculated usage returns sanitized 400; a later ride that overflows combined totals also returns 400 with no committed ride/projection changes. Include an unused component with zero calculated usage.
- [x] **Step 2:** Run `./scripts/dev.sh test --filter 'FullyQualifiedName~UsageEstimateTests|FullyQualifiedName~ComponentEstimateTests'`; expect absent persistence/contract/check failures.
- [x] **Step 3:** Implement validated estimate edits with OwnerMutation and version checks; validate combined totals inside every rebuild so later ride/install mutations cannot commit unreadable totals. Add nonnegative DB constraint/default zero and expose all three values without changing installation/bike distance.
- [x] **Step 4:** Run targeted tests and full suite; require no failures. Inspect the migration for default-zero old components and verify zero-estimate legacy contract behavior.
- [x] **Step 5:** Review the task diff; commit only if authorized, suggested message `feat: persist separate component usage estimates`.

### Task 6: Oil/wax reminder rules and deterministic baselines

**Files:** Create `src/Domain/Reminders/{ChainLubricationRule,IReminderCalculator,ReminderCalculator,ReminderEvaluation}.cs`, `src/Infrastructure/Persistence/Configurations/ChainLubricationRuleConfiguration.cs`, `src/Api/Features/Reminders/{ReminderContracts,ReminderEndpoints,ReminderReader}.cs`, `tests/Domain.Tests/ReminderCalculatorTests.cs`, `tests/Integration.Tests/ReminderApiTests.cs`. Modify `src/Infrastructure/Persistence/BikeLogDbContext.cs`, `src/Domain/Maintenance/MaintenanceRecord.cs`, `src/Infrastructure/Persistence/Configurations/MaintenanceRecordConfiguration.cs`, `src/Api/Features/Maintenance/{MaintenanceContracts,MaintenanceEndpoints}.cs`, `src/Api/Program.cs`, `tests/Integration.Tests/Fixtures/ApiFactory.cs`; add `ChainLubricationReminders` migration.

**Interfaces:** `ChainLubricationRule : Entity` has BikeId, Enabled, nullable Method (`LubricationMethod.Oil/Wax`), nullable OilThresholdMetres/WaxThresholdMetres. Unique (OwnerId,BikeId) and composite owner FK; enabled requires all three configuration values. Valid supplied thresholds are 1_000–10_000_000; incomplete disabled settings are allowed but never evaluated as ready. No stored rule means disabled/version0.

`PUT /api/bikes/{id}/reminder` accepts full `{enabled,method?,oilThresholdMetres?,waxThresholdMetres?,expectedVersion}`. ExpectedVersion=0 creates the first rule at version1; later edits increment it. `GET /api/bikes/{id}/reminder` returns `ReminderEvaluation` plus both configured thresholds/version. Wire methods=`oil|wax`; states=`disabled|no-current-chain|ready`; ready has explicit due boolean. Missing state-specific values are null, not false zeroes.

`IReminderCalculator.Calculate(ChainLubricationRule? rule, Installation? currentChain, IReadOnlyList<Ride> rides, IReadOnlyList<MaintenanceRecord> maintenance, DateTimeOffset evaluatedAtUtc) : ReminderEvaluation`. Evaluation contains ruleVersion, state, enabled, method, both thresholds, activeThresholdMetres, evaluatedAtUtc, componentId/installationId, baselineKind (`installation|lubrication`), baselineUtc, distanceSinceBaselineMetres, remainingMetres and due. Rule settings are returned even in disabled/no-chain states; calculator scopes owner/bike/component and excludes future instants.

`ReminderReader.ReadAsync(Guid ownerId, Guid bikeId, DateTimeOffset evaluatedAtUtc, CancellationToken ct) : Task<ReminderEvaluation>` consumes an injected DbContext and calculator, checks parent ownership, and does not open nested transactions. Endpoints own the snapshot. Maintenance gains nullable TaskKey; key=`chain-lubrication` requires a valid fitted chain. Null retains generic task behavior. Unknown nonnull keys return 400. Migrate exact legacy `Lubricate chain` only when it already has a chain association; whole-bike historical text remains unkeyed.

- [x] **Step 1:** Write `OilThresholdBoundary`: 149_000 not due; 150_000 due. `WaxSwitchKeepsBaselineAndOilInterval`: distance=160_000, oil=150_000 due; wax=300_000 not due/remaining 140_000; edit wax=200_000 remaining 40_000; switch oil restores due and oil 150_000. `LubricationResetsOnlyReminderBaseline`, `BackdatedAndFutureServiceUseCorrectBaseline`, `ReplacementKeepsSettingsButStartsFreshBaseline`, `RideAtBaselineIsIncluded`, `EstimateDoesNotAffectReminder`, `DisabledAndNoChainStatesAreExplicit`, `GeneralInspectionDoesNotReset`: assert exact baseline and unchanged calculated lifetime. Use explicit evaluation time 2026-10-02T12:00:00Z in calculator tests.
- [x] **Step 2:** Write API tests `RuleRoundTripsWithVersion`, `ConcurrentFirstRuleCreationHasOneWinner`, `InvalidMethodDistancesAndIncompleteEnabledRulesReturn400`, `StaleRulePreservesBothIntervals`, `OtherOwnerRuleIs404`, `KeyedLubricationRejectsNonChainAssociation`, `HistoricalRideEditsChangeReminderImmediately`. Assert 200/version1 then version2, concurrent first writes=200/409, invalid 999/10_000_001 thresholds=400, invalid methods=400 and unchanged settings on stale edits. Override TimeProvider in ApiFactory for stable integration expectations.
- [x] **Step 3:** Run `./scripts/dev.sh test --filter 'FullyQualifiedName~ReminderCalculatorTests|FullyQualifiedName~ReminderApiTests'`; expect absent rules/calculation/contracts to fail.
- [x] **Step 4:** Implement pure calculation from approved baseline rules, versioned persistence under OwnerMutation(recalculate=false), DI calculator/reader and repeatable-read endpoint. Latest eligible lubrication is chosen by performed time with ID tie-break; include rides starting exactly at baseline. Method/settings edits never create maintenance. Preserve all legacy generic maintenance and use sanitized checked arithmetic.
- [x] **Step 5:** Run targeted tests and full suite; require no failures. Confirm future open chains, future services/rides, null costs and moved-component service on another bike cannot affect current due state.
- [x] **Step 6:** Review the task diff; commit only if authorized, suggested message `feat: add oil and wax chain lubrication reminders`.

### Task 7: Complete snapshot overview for future clients

**Files:** Create `src/Api/Features/Bikes/{BikeOverviewContracts,BikeOverviewEndpoints}.cs`, `tests/Integration.Tests/BikeOverviewTests.cs`. Modify Program registrations; consume existing contracts and Task 6 ReminderReader.

**Interfaces:** `GET /api/bikes/{id}/overview` returns BikeResponse, evaluatedAtUtc, rideCount, recordedDistanceMetres, currentComponents, allocationGaps, spendingByCurrency, unknownCostRecordCount, maintenanceRecordCount, recentActivity and reminder. Spending items are `CurrencySpend(string Currency, decimal Amount)`; recent activity items contain kind, ID, title, instant, optional component ID and ride distance. Latest three rides/services sorted descending instant, then kind and ID for ties. Unnamed ride title=`Ride YYYY-MM-DD` using UTC date; clients may localize it.

- [x] **Step 1:** Write `SummaryIncludesAllPages`: 201 rides with 1_000m each => count 201 / distance 201_000 regardless page limit. `CostsStaySeparatedAndUnknownCostsVisible`: EUR24.90 + EUR0 => EUR24.90, USD10 => USD10, omitted cost => unknown count1. `RecentActivityOrdersTiesDeterministically`, `OverviewMatchesUsageAndReminder`, `FutureOpenPartsAreNotCurrent`, `OtherOwnerOverviewIs404`, `OverflowIsSanitized`, `ConcurrentReplacementProducesCoherentSnapshot`: overview must show either complete old state or complete new state, never mixed installation/usage/reminder IDs.
- [x] **Step 2:** Run `./scripts/dev.sh test --filter FullyQualifiedName~BikeOverviewTests`; expect absent-route failures.
- [x] **Step 3:** Compose overview inside one repeatable-read snapshot and one captured TimeProvider instant; reuse ReminderReader without another transaction. Recorded distance/count sum all stored rides, including valid future synthetic entries; current parts and reminder still use evaluation time. Keep estimates out of bike distance and currencies separate; sum distance with checked integer arithmetic and cost as decimal.
- [x] **Step 4:** Run targeted tests and full suite; require no failures. Check overview contract is complete enough for draft stats/activity/reminder without reading every paged collection.
- [x] **Step 5:** Review the task diff; commit only if authorized, suggested message `feat: add complete bike overview snapshot`.

### Task 8: Upgrade existing data, publish API contract and prove draft flows

**Files:** Create `src/Api/Development/ProjectionUpgrade.cs`, `scripts/acceptance-ui-backend.sh`, `tests/Integration.Tests/MilestoneUpgradeTests.cs`, `tests/Integration.Tests/UiBackendContractTests.cs`. Modify Program, `scripts/dev.sh`, existing acceptance script, `tests/Integration.Tests/HostTests.cs`, `docs/backend-workflows.md`, `README.md`, `docs/decisions/0001-local-backend.md`. Inspect all added migration files and model snapshot.

**Interfaces:** `ProjectionUpgrade.RebuildAllAsync(IServiceProvider services, CancellationToken ct) : Task`; explicit local `./scripts/dev.sh rebuild-usage` starts the guarded API executable in `--rebuild-usage` mode, enumerates distinct local owners and calls OwnerMutation(recalculate=true) per owner, then exits without serving HTTP. Each owner's history/projections commit atomically; a failed run is safely repeatable. No automatic migrate/rebuild at normal startup. Report aggregate counts only, never connection strings.

- [x] **Step 1:** Write `UpgradePreservesFoundationHistory`: migrate an isolated DB only through `20261001113713_InitialMaintenance`, seed legacy bikes, chains, rides, installations, generic/chain maintenance, then apply new migrations and run explicit rebuild. Assert unchanged IDs/history/costs, null optional metadata/names, zero estimates, disabled absent rules, correct legacy keyed chain lubrication and original 65_000/10_000 usage. Write `UpgradeRebuildIsRepeatableAndOwnerAtomic`, `OpenApiDescribesEveryNewRoute`, `RideDeleteAdvertises204`, `ApiOnlyDraftWorkflowReloadsWithoutFixtureIds`. Assert required fields, units, wire values, page envelopes and 200/201/204/400/404/409/500/503 statuses on their applicable operations.
- [x] **Step 2:** Run `./scripts/dev.sh test --filter 'FullyQualifiedName~MilestoneUpgradeTests|FullyQualifiedName~UiBackendContractTests'`; expect missing explicit upgrade/contract evidence to fail.
- [x] **Step 3:** Implement the explicit upgrade command and CLI mode under DevelopmentAccess checks. Correct DELETE metadata, document all contracts and changed new-bike requirements, pagination refresh limits, oil/wax semantics, synthetic-only scope and migration-compatible rollback. Preserve existing runtime host guards and test-database restrictions.
- [x] **Step 4:** Write the loopback-only HTTP acceptance script: create two metadata-rich bikes, four parts each, named rides, EUR maintenance, one rear-tyre replacement, estimates and oil/wax rules. Discover generated bikes/parts/rides through pages, including replaced parts; assert 65_000 then 10_000 allocation, 185_000 combined tyre estimate and oil/wax switch remaining distances. Seed relative-to-server-time rides for reminder proof; keep fixed timestamps for pure boundary tests. Use a unique synthetic run marker, no database clearing or personal data.
- [x] **Step 5:** Run `./scripts/dev.sh db-up`, `./scripts/dev.sh migrate`, `./scripts/dev.sh rebuild-usage`, `./scripts/dev.sh test --no-restore`, `./scripts/dev.sh lint`. Require all tests and formatter/analyzer checks pass. Start `./scripts/dev.sh run`, require readiness 200, run both `./scripts/acceptance.sh` and `./scripts/acceptance-ui-backend.sh`, and require every HTTP assertion passes. Repeat migration/rebuild to verify idempotence. Stop only task-started processes/container; preserve the named volume.
- [x] **Step 6:** Record actual commands, test counts, HTTP outcomes and limitations in backend workflows. Self-review the spec coverage table below, obtain the execution method's required whole-branch review, address findings, and run `git diff --check`. Commit only if authorized, suggested message `docs: verify UI backend contracts and migration workflow`.

## Spec coverage and execution handoff

| Approved requirement | Owning tasks |
| --- | --- |
| Discovery, pagination, component passports across bikes | 2, 8 |
| Bike metadata/name fallback and ride names | 1, 8 |
| Four positions, type compatibility, gaps and retained histories | 3, 4, 8 |
| Atomic complete replacement and failed/stale/concurrent rollback | 4, 8 |
| Separate estimates and overflow rollback | 5, 8 |
| Oil/wax selection, independent intervals, backend baseline/due state | 6, 7, 8 |
| Full stats, activity, currency separation and consistent read snapshots | 7, 8 |
| Existing-data upgrades, OpenAPI, guards and HTTP evidence | 1–8 |

No approved design requirement is intentionally omitted. New migration classes have generated timestamp filenames; the task-specific migration names above identify their purpose. All other file locations and interfaces are pinned here.

The owner approved this plan and selected Subagent-driven execution on 2026-10-02. Selection rationale: replacement, multi-part allocation and oil/wax baseline changes each warrant an independent task review before they are composed. Both methods work sequentially through shared interfaces; neither authorizes product/UI or cloud scope beyond this plan.

Execution completed on 2026-10-02 using subagent-driven development: eight task reviews, final whole-branch review and one scoped final fix review passed. Final full suite: 48 domain +143 integration tests; lint and both HTTP workflows passed. Migration/rebuild repeatability and existing-data preservation verified. The owner subsequently selected committing and local integration into `main` on 2026-10-02. No push or PR is authorized. Local task-started services stopped and named PostgreSQL volume retained. See [backend workflows](../../backend-workflows.md) for evidence and limitations.
