---

description: "Task list for component groups, weights and full bike positions"
---

# Tasks: Component Groups, Weights and Full Bike Positions

**Input**: Design documents from `specs/002-component-groups-weight/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/api-components.md](contracts/api-components.md),
[quickstart.md](quickstart.md)

**Tests**: Included. The constitution (III) requires tests for installation boundaries, corrections,
replacements, moves and cross-user authorization, with persistence tested against PostgreSQL. Write each
story's tests first and confirm that they fail before implementing.

**Organization**: Tasks are grouped by user story in priority order: US1, US2 and US6 (P1), then US3 and
US4 (P2), then US5 (P3). Decision IDs (D1–D11) refer to [research.md](research.md).

**Conventions for every task**:

- Domain rules live in the API (constitution II). The web app reads the catalog from
  `GET /api/component-catalog` and never hard-codes positions.
- Every new query filters by `owner.OwnerId` from `ICurrentOwner`. Every mutation goes through
  `OwnerMutation.ExecuteAsync(owner, …, true, ct)` so that usage rebuilds in the same transaction.
- Wire values are kebab-case. C# enum names are PascalCase and stored as strings. The existing names
  `Chain`, `Cassette`, `Tyre`, `FrontTyre` and `RearTyre` MUST NOT change (D10).
- Use synthetic data only. Before each commit, run `./scripts/dev.sh lint` and the relevant suites.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story from spec.md (US1–US6)

---

## Phase 1: Setup

**Purpose**: Establish a known-good baseline

- [ ] T001 Run the baseline gates from specs/002-component-groups-weight/quickstart.md "Automated gates" (`./scripts/dev.sh lint`, `./scripts/dev.sh test`, `npm test`, `npm run web:lint`, `npm run web:typecheck`, `npm run api:check`) on branch `002-component-groups-weight` and record the counts in your working notes. If anything fails, stop and report the failure as observed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The catalog, extended enums, weight fields, the exemption entity and the migration. Every
story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for the foundation

- [ ] T002 [P] Write tests/Domain.Tests/ComponentCatalogTests.cs. Assert exactly 27 positions and 20 types. Assert each position's type, group and end match the table in specs/002-component-groups-weight/data-model.md#position-catalog. Assert only `FrontDerailleur` (reason `NoneFitted`) and `FrontInnerTube`/`RearInnerTube` (reason `Tubeless`) can be empty. Assert the pair types are exactly `ThroughAxle, Brake, BrakeLever, Rim, Tyre, DiscRotor, InnerTube`. Assert every `ComponentType` maps to exactly one group and at least one position.
- [ ] T003 [P] Write tests/Domain.Tests/ComponentWeightTests.cs. `ComponentWeight.Validate(int?)` accepts null, 1 and 20000, and throws `DomainValidationException` for 0, −5 and 20001 (FR-005).

### Implementation

- [ ] T004 Extend `ComponentType` in src/Domain/Components/Component.cs to `Fork, BottomBracket, Handlebar, HandlebarTape, Saddle, Seatpost, Pedals, ThroughAxle, FrontDerailleur, RearDerailleur, Shifters, Cassette, Chain, Brake, BrakeLever, Crankset, Rim, Tyre, DiscRotor, InnerTube`, keeping the existing members' names. Add `public int? WeightGrams { get; set; }` and add `enum ComponentGroup { Build, Groupset, Wheels }`.
- [ ] T005 Extend `InstallationPosition` in src/Domain/Installations/Installation.cs to the 27 positions: `Fork, BottomBracket, Handlebar, HandlebarTape, Saddle, Seatpost, Pedals, FrontThroughAxle, RearThroughAxle, FrontDerailleur, RearDerailleur, Shifters, Cassette, Chain, FrontBrake, RearBrake, FrontBrakeLever, RearBrakeLever, Crankset, FrontRim, RearRim, FrontTyre, RearTyre, FrontDiscRotor, RearDiscRotor, FrontInnerTube, RearInnerTube`. Keep the existing member names.
- [ ] T006 Create src/Domain/Components/ComponentCatalog.cs, a static catalog (D1). It has one `PositionEntry(InstallationPosition Position, ComponentType Type, ComponentGroup Group, WheelEnd? End, ExemptionReason? Exemption, string Label)` per position, exactly as in data-model.md. It provides `Entries`, `Entry(position)`, `GroupOf(type)`, `PositionsFor(type)`, `PairTypes` (types with both a front and a rear position) and `FrontRearPositions(type)`. Labels are sentence case, for example "Front brake lever" and "Bottom bracket". Add `enum WheelEnd { Front, Rear }`. Make T002 pass.
- [ ] T007 Add `public ComponentGroup Group => ComponentCatalog.GroupOf(Type);` to `Component` in src/Domain/Components/Component.cs (D2; not persisted, so ignore it in EF in T012).
- [ ] T008 [P] Create src/Domain/Components/ComponentWeight.cs with `Validate(int? grams)`: "Null means not recorded; otherwise 1–20000". Throw `DomainValidationException("Weight must be a whole number of grams from 1 to 20000.")`. Make T003 pass.
- [ ] T009 Replace the switch in src/Domain/Installations/ComponentCompatibility.cs with `ComponentCatalog.Entry(position).Type == type`, keeping the existing error message.
- [ ] T010 Create src/Domain/Installations/PositionExemption.cs: `sealed class PositionExemption : Entity` with `Guid BikeId`, `InstallationPosition Position`, `ExemptionReason Reason`, `DateTimeOffset StartUtc` and `DateTimeOffset? EndUtc`, plus `enum ExemptionReason { NoneFitted, Tubeless }`.
- [ ] T011 Add `public int? FrameWeightGrams { get; set; }` to src/Domain/Bikes/Bike.cs.
- [ ] T012 Update persistence:
  - src/Infrastructure/Persistence/Configurations/ComponentConfiguration.cs: widen `CK_Component_Type` to all 20 enum names; add `CK_Component_Weight` = `"WeightGrams" IS NULL OR "WeightGrams" BETWEEN 1 AND 20000`; `b.Ignore(x => x.Group)`.
  - InstallationConfiguration.cs: widen `CK_Installation_Position` to all 27 names.
  - BikeConfiguration.cs: add `CK_Bike_FrameWeight` with the same rule as `CK_Component_Weight`.
  - New PositionExemptionConfiguration.cs: `EntityConfiguration.Common`, string conversions, composite FK `(OwnerId, BikeId)` → Bike with restrict, index `(OwnerId, BikeId, Position, StartUtc)`, check constraint `"EndUtc" IS NULL OR "EndUtc" > "StartUtc"`, and a check that `Position`/`Reason` is one of `('FrontDerailleur','NoneFitted')`, `('FrontInnerTube','Tubeless')`, `('RearInnerTube','Tubeless')`.
  - Add `DbSet<PositionExemption> PositionExemptions` to src/Infrastructure/Persistence/BikeLogDbContext.cs.
- [ ] T013 Run `dotnet tool restore` (or use `$BIKELOG_DOTNET`, as scripts/dev.sh does), then generate the migration with `dotnet ef migrations add ComponentGroupsWeight --project src/Infrastructure --startup-project src/Api` and review it. It must only add nullable columns, drop and re-add the widened check constraints, and create `PositionExemptions`, with no data updates (D10). Apply it with `./scripts/dev.sh migrate` twice; the second run must apply nothing.
- [ ] T014 Rewrite src/Api/Features/Components/ComponentValues.cs so that `ParseType`/`Type`/`ParsePosition`/`Position` cover all values using the wire strings in data-model.md (D11). Add `Group(ComponentGroup)` → `build|groupset|wheels`, `Reason(ExemptionReason)` → `none-fitted|tubeless`, and `End(WheelEnd?)` → `front|rear|null`. Add `Weight(int?)`, which calls `ComponentWeight.Validate`.
- [ ] T015 [P] Create src/Api/Features/Components/CatalogEndpoints.cs with `GET /component-catalog`, returning `{ groups, positions[{position,type,group,end,label,exemption}], pairTypes }` from `ComponentCatalog` (contracts/api-components.md). Map it in src/Api/Program.cs next to `MapComponents`.
- [ ] T016 Make src/Domain/Installations/InstallationRules.cs validate installations and exemptions together. Add an overload `Validate(IReadOnlyList<Installation>, IReadOnlyList<PositionExemption>)`: exemptions on the same owner, bike and position must not overlap each other or any installation (half-open). Throw the existing `installation_overlap` error. The exemption reason must equal `ComponentCatalog.Entry(position).Exemption`. Keep the existing single-argument overload calling it with an empty list.
- [ ] T017 Update `InstallationEndpoints.ValidateHistory` in src/Api/Features/Installations/InstallationEndpoints.cs to load the owner's `PositionExemptions` (or accept a proposed list) and call the new `InstallationRules.Validate` overload. Update every caller (InstallationEndpoints, ReplacementEndpoints).
- [ ] T018 Update existing tests whose assertions assume four positions or three types (for example gap counts in tests/Domain.Tests/UsageCalculatorTests.cs and tests/Domain.Tests/MultiComponentUsageTests.cs, wire enums in tests/Integration.Tests/UiBackendContractTests.cs and tests/Integration.Tests/InputContractTests.cs). Change expectations only where the new positions legitimately change them, and note each change in the commit message. Run `./scripts/dev.sh test`.

**Checkpoint**: The catalog, enums, weights and the exemption table exist. The existing suites pass.

---

## Phase 3: User Story 1 - Record the full set of parts on a bike (Priority: P1) 🎯 MVP

**Goal**: The bike shows all 27 positions grouped into Build, Groupset and Wheels. The owner can fit a
component with make, model and weight in any position; rides allocate usage to it; and the front
derailleur can be marked "none fitted".

**Independent Test**: Create a bike, fit one part in each group, and log a ride. Each fitted part shows
the ride's distance. Unfitted positions show "not recorded". Quickstart scenarios 2–5.

### Tests for User Story 1

- [ ] T019 [P] [US1] Extend tests/Domain.Tests/UsageCalculatorTests.cs:
  - A ride with a saddle fitted allocates its metres to the saddle.
  - A ride inside a `NoneFitted` exemption on `FrontDerailleur` produces no `AllocationGap` for that position, but still does for unrecorded positions.
  - `PositionGaps` reports one entry per gapped position with `RideCount`, `FirstRideStartUtc` and `LastRideStartUtc`.
- [ ] T020 [P] [US1] Write tests/Domain.Tests/ExemptionRulesTests.cs:
  - Overlapping `NoneFitted` exemptions are rejected.
  - An exemption overlapping an installation in the same position is rejected.
  - An adjacent exemption (`[a,b)` then `[b,…)`) is accepted.
  - A `Tubeless` reason on `FrontDerailleur` is rejected.
  - An exemption on a non-empty-able position (for example `Saddle`) is rejected.
- [ ] T021 [P] [US1] Write tests/Integration.Tests/FullPositionsApiTests.cs (PostgreSQL, `ApiScenario`):
  - `POST /api/components` accepts every type with an optional `weightGrams`, returning `group` and `weightGrams`.
  - Weights 0, −5, 20001 and 12.5 return 400.
  - Fitting a saddle in `handlebar` returns 400.
  - A second overlapping saddle returns 409 `installation_overlap`.
  - A 40 km ride after fitting shows 40 km on the saddle.
  - `GET /api/component-catalog` returns 27 positions.
  - `GET /api/bikes/{id}/usage` returns 27 `positionStatuses` with `not-recorded` for empty positions.
  - After a fitted saddle's installation is ended with nothing replacing it, the saddle status is `missing` with `sinceUtc` equal to the end instant, while never-fitted positions stay `not-recorded` and exempt positions stay `exempt`.
  - `POST /api/bikes/{id}/position-exemptions` with `front-derailleur` returns 201, and later rides show no front derailleur gap.
  - The same exemption call with `saddle` returns 400.
  - Marking the front derailleur none fitted while one is fitted, with a stale `expectedInstallationVersion`, returns 409 and leaves the installation open.

### Implementation for User Story 1

- [ ] T022 [US1] In src/Domain/Usage/UsageCalculator.cs and src/Domain/Usage/UsageCalculation.cs, add an `exemptions` parameter to `Calculate` (default empty) and do the following:
  - Skip gaps for a position when an exemption on that bike and position covers the ride's start.
  - Add `record PositionGap(Guid BikeId, InstallationPosition Position, int RideCount, DateTimeOffset FirstRideStartUtc, DateTimeOffset LastRideStartUtc)` and return `PositionGaps` ordered by catalog order.
  - Keep `UnallocatedRideIds` meaning chain gaps.
  - Update `IUsageCalculator` and src/Infrastructure/Persistence/UsageRebuilder.cs. The rebuilder loads exemptions for validation only; stored totals depend only on rides and installations (FR-017).
- [ ] T023 [US1] Update src/Api/Features/Components/ComponentContracts.cs and ComponentEndpoints.cs:
  - `CreateComponent` gains `int? WeightGrams`, validated with `ComponentValues.Weight`.
  - `ComponentResponse` and `ComponentEstimateResponse` gain `string Group` and `int? WeightGrams`.
  - Populate the new fields everywhere these responses are built, including src/Api/Features/Collections/CollectionEndpoints.cs and ComponentEstimateEndpoints.cs.
- [ ] T024 [US1] Create src/Api/Features/Exemptions/ExemptionContracts.cs and ExemptionEndpoints.cs:
  - `POST /bikes/{bikeId}/position-exemptions` with `{ position, startUtc, expectedInstallationVersion? }`: the reason comes from the catalog, and the request returns 400 if the position cannot be empty. In one `OwnerMutation`:
    - If an installation is open in that position, require `expectedInstallationVersion` and check it with `ApiInput.Version`. A missing or stale version returns 409, and nothing changes.
    - Close that installation at `startUtc`. Return 409 if it started at or after `startUtc`.
    - Add the exemption, then validate the history, including maintenance.
  - `PUT /position-exemptions/{id}` with `{ startUtc, endUtc?, expectedVersion }`.
  - `GET /bikes/{bikeId}/position-exemptions`, newest first.
  - Response: `{ id, bikeId, position, reason, startUtc, endUtc, version }`. Map the routes in src/Api/Program.cs.
- [ ] T025 [US1] Update src/Api/Features/Usage/UsageContracts.cs and BikeUsageReader.cs:
  - Pass exemptions to the calculator.
  - Add `PositionStatusResponse(string Position, string State, Guid? ComponentId, Guid? InstallationId, Guid? ExemptionId, string? Reason, DateTimeOffset? SinceUtc)`, where `State` is `fitted|exempt|missing|not-recorded` (`missing` = empty now, the bike had an installation in that position before, and no exemption covers `now`; `SinceUtc` = the latest ended installation's `EndUtc`) evaluated at `now` for all 27 positions in catalog order.
  - Add `PositionGapResponse(string Position, int RideCount, DateTimeOffset FirstRideStartUtc, DateTimeOffset LastRideStartUtc)`.
  - Add both to `BikeUsageResponse`.
- [ ] T026 [US1] Add `PositionStatuses` and `PositionGaps` to `BikeOverviewResponse` in src/Api/Features/Bikes/BikeOverviewContracts.cs and BikeOverviewEndpoints.cs, reusing the reader logic from T025.
- [ ] T027 [US1] Regenerate the client: run the API, then `npm run api:generate`. Update the hand-written unions in packages/api-client/src/dto.ts: `Position` (27 values), new `ComponentType` (20), `ComponentGroup`, `ExemptionReason` and `PositionState`. Run `npm run test --workspace @bikelog/api-client` and `npm run api:check`.
- [ ] T028 [P] [US1] Add a catalog query (`useComponentCatalog`, long `staleTime`) to apps/web/src/features/components/queries.ts, and an exemption mutation (`useCreateExemption`) to apps/web/src/features/components/mutations.ts that invalidates installations, overview and usage queries for the bike.
- [ ] T029 [US1] Rework apps/web/src/features/components/Components.tsx into a position board:
  - Three sections (Build, Groupset, Wheels) rendered from the catalog and `positionStatuses`.
  - Each row shows the label, the state (fitted part with make/model/weight and lifetime, "Not recorded", or "None fitted since …"), and actions (Fit, Replace, history).
  - Remove the hard-coded four-position vacant list and the chain/cassette/tyre icon switch.
  - Keep the "Include replaced parts" filter and "Other parts in your garage".
  - The front derailleur row offers "Mark none fitted" (date input). When a front derailleur is fitted, send its installation `version` as `expectedInstallationVersion`. On 409, show the existing apps/web/src/components/ConflictPanel.tsx and refetch.
- [ ] T030 [US1] Update apps/web/src/features/components/FitComponentForm.tsx and fit-replacement.tsx:
  - Derive the component type from the catalog entry for the destination position instead of the chain/cassette/tyre ternary.
  - Add an optional "Weight (g)" field using the existing `Field` component, with client-side whole-number and 1–20000 checks that mirror the API.
  - Title uses the catalog label ("Fit front brake").
  - The reuse list filters existing parts to the same type.
- [ ] T031 [US1] Replace the per-gap notices in apps/web/src/features/overview/Overview.tsx with one notice per `positionGaps` entry ("Saddle not recorded for 12 rides, 2026-01-03 – 2026-05-30"), using catalog labels. In apps/web/src/features/rides/Rides.tsx, replace the per-ride list of gap labels with a count ("3 positions not recorded"). The count is a disclosure button that lists the catalog labels; rides with no gaps show nothing. In the overview, collapse more than 3 gapped positions behind a "Show all" disclosure.
- [ ] T032 [P] [US1] Add Vitest coverage in apps/web/tests/components.test.tsx:
  - The board renders 27 rows in 3 groups from a mocked catalog.
  - The fit form sends `type` derived from position and `weightGrams`.
  - Weight 0 shows a field error.
  - Gap notices are summarised per position (apps/web/tests/garage.test.tsx or a new overview test).
  - A ride with 26 gaps renders one "26 positions not recorded" control, not 26 labels (apps/web/tests/rides.test.tsx).

**Checkpoint**: US1 is usable on its own. Quickstart scenarios 2–5 pass.

---

## Phase 4: User Story 2 - Replace or move any part (Priority: P1)

**Goal**: Replacement and moves work for every position; old parts keep their history and usage.

**Independent Test**: Replace the rear tyre (or handlebar tape) after rides, then log a ride. The old
part's total is unchanged and the new part has only the new ride. Move pedals between bikes and confirm
lifetime usage continues. Quickstart scenarios 6–7.

### Tests for User Story 2

- [ ] T033 [P] [US2] Write tests/Integration.Tests/AnyPositionReplacementTests.cs:
  - For one position in each group (`handlebar-tape`, `rear-derailleur`, `rear-tyre`), `POST /installations/{id}/replacement-with-service` with `newWeightGrams` ends the old installation, keeps its metres, and creates a maintenance task named `"Replace " + label.ToLowerInvariant()` (for example "Replace handlebar tape").
  - A subsequent ride counts only on the new part.
  - Every other fitted part's usage is unchanged (SC-004).
  - `POST /installations/{id}/replacement` with an unfitted spare saddle fits the spare, and the removed saddle stays available with its usage (US2-4). The same call with a part of the wrong type (pedals) returns 400; with a saddle currently fitted on another bike, it returns 409 `installation_overlap`.
- [ ] T034 [P] [US2] Write tests/Integration.Tests/MoveAndRefitTests.cs:
  - `POST /api/installations/{id}/move` moves pedals from bike A to bike B, and their lifetime usage continues.
  - Moving pedals into `saddle` returns 400.
  - A destination position that is occupied returns 409, and the source installation stays open.
  - A stale `expectedInstallationVersion` returns 409.
  - Take a part from another bike: with saddles fitted on bikes A and B, `POST /api/installations/{A's saddle installation}/move` to bike B with `expectedDestinationInstallationVersion` ends A's installation, ends B's old saddle installation (that saddle has no open installation and keeps its usage), and fits A's saddle on B, in one transaction. Without the destination version, or with a stale one, it returns 409 and nothing changes (FR-018).
  - Afterwards `GET /api/bikes/{A}` has `missingPositions: ["saddle"]` and bike B has none. `POST /api/rides` on bike A still returns 201, and the ride shows a saddle gap (FR-019).
  - A bike whose only empty positions were never recorded has `missingPositions: []`.
  - User B moving user A's installation returns 404.
  - Replace the cassette on bike A (`POST /installations/{id}/replacement-with-service`) after rides, then fit the old cassette to bike B's `cassette` position (`POST /installations`) and log a ride on each bike. The old cassette's lifetime is its bike A total plus the bike B ride, its history lists both installations, and the new cassette has only the bike A ride (US2-3).

### Implementation for User Story 2

- [ ] T035 [US2] Update src/Api/Features/Installations/ReplacementContracts.cs and ReplacementEndpoints.cs:
  - Add `int? NewWeightGrams`, validated via `ComponentValues.Weight` and set on the new component.
  - Replace the `Task` switch with `"Replace " + ComponentCatalog.Entry(old.Position).Label.ToLowerInvariant()`. Existing chain, cassette and tyre task strings must stay identical ("Replace chain", "Replace cassette", "Replace front tyre", "Replace rear tyre").
  - Include `group` and `weightGrams` in the returned `ComponentResponse`.
- [ ] T036 [US2] Add `PUT /components/{id}` to src/Api/Features/Components/ComponentEndpoints.cs, with `EditComponent(make, model, int? weightGrams, long expectedVersion)` in ComponentContracts.cs. It validates like creation, returns 409 on a stale version and increments `Version`. Type cannot change, and installations and usage are untouched (US6-2).
- [ ] T037 [US2] Create `POST /installations/{id}/move` in src/Api/Features/Installations/MoveEndpoints.cs with request `{ toBikeId, toPosition?, movedAtUtc, expectedInstallationVersion }` (contracts/api-components.md). In one `OwnerMutation`: check the version with `ApiInput.Version`, check the destination bike belongs to the owner (404 otherwise), check type compatibility with `ComponentCatalog` (`toPosition` defaults to the current position), close the old installation at `movedAtUtc`, add the new one, then run `ValidateHistory`. Response 200 `{ oldInstallation, newInstallation }`. Map the route in src/Api/Program.cs. If the destination position has an open installation, require `expectedDestinationInstallationVersion` (409 if missing or stale), end that installation at `movedAtUtc` too, and return it as `displacedInstallation`.
- [ ] T038 [US2] Add `string[] MissingPositions` to `BikeResponse` in src/Api/Features/Bikes/BikeContracts.cs, computed by a shared helper (for example `BikeCompleteness.MissingPositions(installations, exemptions, now)` in src/Domain/Bikes/BikeCompleteness.cs) using the `missing` rule from T025. Populate it in every place a `BikeResponse` is built: src/Api/Features/Bikes/BikeEndpoints.cs, the bike list in src/Api/Features/Collections/CollectionEndpoints.cs (one installations and exemptions query per page, not per bike) and src/Api/Features/Bikes/BikeOverviewEndpoints.cs.
- [ ] T039 [US2] Regenerate the client (`npm run api:generate`, `npm run api:check`).
- [ ] T040 [US2] Update apps/web/src/features/components/ReplacementForm.tsx: add the optional "Weight (g)" field (same validation as T030), use the catalog label in the title and help text, and send `newWeightGrams`. Add a choice between "New part" (the current fields plus weight), "Part from your garage" and "From another bike". The second option lists only parts whose `type` equals the replaced part's type and that have no open installation, and calls the existing `POST /installations/{id}/replacement` with `newComponentId`, `replacedAtUtc` and `expectedInstallationVersion`. "From another bike" lists same-type parts currently fitted on the owner's other bikes, labelled with the bike's display name, and calls `POST /installations/{source installation id}/move` with `toBikeId`, `toPosition`, the source version and this installation's version as `expectedDestinationInstallationVersion`. Warn before saving that the other bike will be marked incomplete. Add a `replaceWithExisting` mutation in apps/web/src/features/components/mutations.ts that invalidates the bike and both components. On 409, show `ConflictPanel`.
- [ ] T041 [US2] Add a "Move to another bike" action in apps/web/src/features/components/ComponentPassport.tsx for a currently fitted part. It takes a destination bike and a date and makes one call to `POST /installations/{id}/move` with the installation's `version` as `expectedInstallationVersion`, via a new `useMoveInstallation` mutation in apps/web/src/features/components/mutations.ts that invalidates both bikes' installation, overview and usage queries. On 409, show `ConflictPanel` and refetch.
- [ ] T042 [US2] Add a "Remove" action for a currently fitted part on the position board in apps/web/src/features/components/Components.tsx. It takes a date and calls `PUT /installations/{id}` with `endUtc` and `expectedVersion`. The part stays in "Other parts in your garage", and the position shows "Not recorded" from that date. On 409, show `ConflictPanel`.
- [ ] T043 [US2] Show incomplete bikes: in apps/web/src/features/garage/Garage.tsx and the bike hero in apps/web/src/features/overview/Overview.tsx, show "Incomplete: <labels> missing since <date>" when `missingPositions` is non-empty (labels from the catalog), linking to the position board. On the position board, `missing` rows show "Missing since …" with Fit as the primary action. In apps/web/src/features/rides/RideForm.tsx, when the selected bike is incomplete, show a non-blocking warning ("This bike is missing a saddle. The ride will be saved, and the saddle will show a gap."); saving is never disabled by it.
- [ ] T044 [P] [US2] Add Vitest cases in apps/web/tests/replacement.test.tsx: the replacement form sends `newWeightGrams` and shows the catalog label; replacing a saddle with "Part from your garage" lists only unfitted saddles (not pedals, not a saddle fitted elsewhere) and sends the chosen `newComponentId`; "From another bike" lists a saddle fitted on another bike with that bike's name and sends one move call with both versions; an incomplete bike shows the garage badge, and the ride form shows the warning while Save stays enabled; the move flow makes a single `POST /installations/{id}/move` call, and the remove action sends `endUtc` with `expectedVersion`.

**Checkpoint**: Quickstart scenarios 6, 7, 18, 19 and 20 pass.

---

## Phase 5: User Story 6 - Existing components carry over (Priority: P1)

**Goal**: Existing chains, cassettes and tyres keep their history and totals, and gain groups and an
editable weight.

**Independent Test**: Seed foundation-era data, apply the migration and rebuild, then compare totals.
Quickstart scenario 1.

### Tests for User Story 6

- [ ] T045 [P] [US6] Write tests/Integration.Tests/ComponentGroupsUpgradeTests.cs, following tests/Integration.Tests/MilestoneUpgradeTests.cs:
  - Migrate a fresh database to the migration before `ComponentGroupsWeight` (`20261009051928_AddAuthenticationOwnership`) using `IMigrator`.
  - Insert a bike, a chain, a cassette and two tyres with installations and rides via SQL, then run `ProjectionUpgrade.RebuildAllAsync` and capture totals.
  - Migrate to latest and rebuild again.
  - Assert identical `LifetimeMetres` and installation metres for every component (SC-003), unchanged maintenance task strings, `WeightGrams IS NULL`, and `group` of `groupset` for chain/cassette and `wheels` for tyres in `GET /api/components/{id}`.
  - A second rebuild yields identical totals (FR-017).
- [ ] T046 [P] [US6] Add a case to tests/Integration.Tests/ComponentMetadataTests.cs: `PUT /api/components/{id}` on an existing chain sets `weightGrams: 9` and keeps installations, usage and `initialUsageEstimateMetres` unchanged. A stale `expectedVersion` returns 409.

### Implementation for User Story 6

- [ ] T047 [US6] Add a weight display and an "Edit details" form (make, model, weight, using `PUT /components/{id}` from T036) to apps/web/src/features/components/ComponentPassport.tsx. Show "Weight not recorded" when null. On 409, use the existing apps/web/src/components/ConflictPanel.tsx pattern.
- [ ] T048 [US6] Append an "Explicit compatible upgrade (component groups)" note to docs/backend-workflows.md. It must say: migrate, then `rebuild-usage`; existing parts keep their totals; weight starts unrecorded; and rollback is compatible code, not a schema downgrade (D10).

**Checkpoint**: Quickstart scenario 1 passes.

---

## Phase 6: User Story 3 - Different front and rear brakes and levers (Priority: P2)

**Goal**: Fit matching front and rear parts in one step, as two independent components.

**Independent Test**: Fit a brake pair, then replace only the rear brake. The front brake is unchanged.
Quickstart scenarios 8–9.

### Tests for User Story 3

- [ ] T049 [P] [US3] Write tests/Integration.Tests/PairInstallationTests.cs:
  - `POST /api/installations/pair` with `type: "brake"` creates 2 components (same make, model and weight; different ids) at `front-brake` and `rear-brake`.
  - Replacing only the rear leaves the front installation and usage unchanged.
  - The same works for `brake-lever` and `disc-rotor`.
  - `type: "saddle"` returns 400.
  - With `rear-disc-rotor` already occupied for an overlapping period, the call returns 409, and the component and installation counts are unchanged (all-or-nothing, FR-012).
  - User B pairing on user A's bike returns 404.

### Implementation for User Story 3

- [ ] T050 [US3] Create src/Api/Features/Installations/PairContracts.cs and PairEndpoints.cs for `POST /installations/pair`:
  - Request: `{ bikeId, type, make, model, weightGrams?, startUtc, initialUsageEstimateMetres? }`.
  - 400 unless the type is in `ComponentCatalog.PairTypes`.
  - In one `OwnerMutation`: verify the bike belongs to the owner (404 otherwise), create two components, add installations at `FrontRearPositions(type)`, and run `ValidateHistory` over all proposed installations before adding anything.
  - Response 201: `{ front: { component, installation }, rear: { component, installation } }`.
  - Map the route in src/Api/Program.cs.
- [ ] T051 [US3] Regenerate the client (`npm run api:generate`, `npm run api:check`).
- [ ] T052 [US3] In apps/web/src/features/components/FitComponentForm.tsx, when the destination position's type is in `pairTypes` and the opposite position is "not recorded", offer a "Fit to front and rear" checkbox, checked by default for brake, brake-lever and disc-rotor. When checked, call a new `useFitPair` mutation in apps/web/src/features/components/mutations.ts. On 409, explain which position is occupied and that nothing was saved.
- [ ] T053 [P] [US3] Add a Vitest case in apps/web/tests/components.test.tsx: the pair checkbox appears for `front-brake` but not for `saddle`, and submitting it calls the pair endpoint once.

**Checkpoint**: Quickstart scenarios 8–9 pass.

---

## Phase 7: User Story 4 - Tubeless or tubed wheels (Priority: P2)

**Goal**: Per-wheel tubeless setup with dated history. While a wheel is tubeless, its inner tube position
is not applicable.

**Independent Test**: Switch the rear wheel to tubeless with a tube fitted. The tube's installation ends
and the position shows "tubeless". Fitting a front tube during a tubeless period is rejected. Quickstart
scenarios 10–12.

### Tests for User Story 4

- [ ] T054 [P] [US4] Write tests/Integration.Tests/TubelessTests.cs:
  - With a rear inner tube fitted, `POST /api/bikes/{id}/position-exemptions { position: "rear-inner-tube", startUtc: T }` returns 201 with `reason: "tubeless"`, ends the tube installation at T and keeps its metres.
  - `positionStatuses` shows `exempt` with reason `tubeless`.
  - Rides after T produce no `rear-inner-tube` gap.
  - Fitting an inner tube in `front-inner-tube` during a front tubeless period returns 409 `installation_overlap`.
  - Ending the exemption via `PUT /api/position-exemptions/{id}` with `endUtc` returns the position to `not-recorded` after that instant, and `GET /api/bikes/{id}/position-exemptions` lists the period.
  - A tube installation that started after T returns 409 on the exemption call.
  - Tube maintenance recorded after T returns 409 `maintenance_history_conflict`.
  - User B reading or changing user A's exemption returns 404.
  - An exemption request with a stale `expectedInstallationVersion` (the tube was replaced after the client read it) returns 409, and the new tube's installation stays open.
  - An exemption request without a version while a tube is open returns 409.

### Implementation for User Story 4

- [ ] T055 [US4] Make T054 pass for inner tubes in src/Api/Features/Exemptions/ExemptionEndpoints.cs: closing the open tube with a version check, the maintenance conflict, and the ownership 404. Then extend the cross-user matrix in tests/Integration.Tests/AuthenticatedOwnershipTests.cs with the exemption routes, `PUT /api/components/{id}`, `POST /api/installations/pair` with another user's `bikeId`, and `POST /api/installations/{id}/move` (including a destination installation owned by another user). Each returns 404 and changes nothing. User B's overview `weights` and `positionStatuses` never include user A's components.
- [ ] T056 [US4] Create apps/web/src/features/components/WheelSetup.tsx: for each wheel, show "Tubed" or "Tubeless since …", with a "Switch to tubeless" / "Switch to tubed" action that takes a date. Tubeless calls `useCreateExemption`; tubed calls a new `useEndExemption` mutation (`PUT /position-exemptions/{id}` with `endUtc` and `expectedVersion`). Show a collapsible history list from `GET /bikes/{id}/position-exemptions`. Render it at the top of the Wheels section in Components.tsx, and show the inner tube rows as "Not applicable (tubeless)" while exempt. When switching to tubeless with a tube fitted, send the tube installation's `version` as `expectedInstallationVersion`; on 409, show `ConflictPanel` and refetch.
- [ ] T057 [P] [US4] Add Vitest coverage in a new apps/web/tests/wheel-setup.test.tsx: switching to tubeless sends the correct position and date, a tubeless wheel hides "Fit" on its inner tube row, and the history lists both periods.

**Checkpoint**: Quickstart scenarios 10–12 pass.

---

## Phase 8: User Story 5 - Component weights and group totals (Priority: P3)

**Goal**: Frame weight, plus subtotals per group and for the whole bike that disclose missing weights.

**Independent Test**: Fit Build parts of 250, 300 and 95 g and one with no weight. The Build subtotal is
645 g with "1 part without weight". Quickstart scenario 13.

### Tests for User Story 5

- [ ] T058 [P] [US5] Write tests/Domain.Tests/WeightSummaryTests.cs: given currently fitted components across groups and a frame weight, the result has per-group `Grams` and `MissingCount`, `FrameGrams`, `TotalGrams` (frame plus parts) and `MissingCount` (parts plus 1 if the frame weight is null). A replaced (ended) installation is excluded. An empty bike gives 0 g with no parts missing.
- [ ] T059 [P] [US5] Extend tests/Integration.Tests/BikeOverviewTests.cs:
  - `POST/PUT /api/bikes` accepts `frameWeightGrams` (null, 1–20000; 0 returns 400).
  - The overview `weights` for the T058 scenario equals the expected JSON.
  - After replacing a part with a lighter one, the subtotal reflects only the new part.

### Implementation for User Story 5

- [ ] T060 [US5] Create src/Domain/Weights/WeightSummary.cs: `static WeightSummary Calculate(IEnumerable<Component> fitted, int? frameGrams)` returning `GroupWeight[] Groups` (always three, in catalog group order), `int? FrameGrams`, `int TotalGrams` and `int MissingCount` (D9).
- [ ] T061 [US5] Add `int? FrameWeightGrams` to `CreateBike`, `EditBike` and `BikeResponse` in src/Api/Features/Bikes/BikeContracts.cs, validated with `ComponentValues.Weight` in src/Api/Features/Bikes/BikeEndpoints.cs.
- [ ] T062 [US5] Add `Weights` (`{ groups: [{ group, grams, missingCount }], frameGrams, totalGrams, missingCount }`) to `BikeOverviewResponse` in src/Api/Features/Bikes/BikeOverviewContracts.cs, computed in BikeOverviewEndpoints.cs from installations current at `EvaluatedAtUtc`.
- [ ] T063 [US5] Regenerate the client (`npm run api:generate`, `npm run api:check`).
- [ ] T064 [US5] Add an optional "Frame weight (g)" field to apps/web/src/features/bikes/BikeForm.tsx, with help text explaining that make and model describe the frame and that a different frame means a new bike.
- [ ] T065 [US5] Show weights in the web app:
  - In apps/web/src/features/components/Components.tsx, a subtotal in each group heading.
  - In apps/web/src/features/overview/Stats.tsx, a bike total.
  - Group and bike totals are formatted in kg to two decimals; component weights are in grams. Add `formatGrams`/`formatKilograms` to apps/web/src/lib/format.ts.
  - When `missingCount > 0`, label the total as incomplete ("1 part without weight").
  - Add help text noting that integrated shift/brake levers recorded in both positions count twice.
- [ ] T066 [P] [US5] Add Vitest cases: apps/web/tests/units.test.ts covers `formatGrams`/`formatKilograms`; apps/web/tests/bikes.test.tsx covers frame weight validation; the overview test covers the incomplete label.

**Checkpoint**: Quickstart scenario 13 passes.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T067 [P] Extend apps/web/e2e/workflow.spec.ts with the following flow against the synthetic API: fit a saddle with weight, mark the front derailleur none fitted, fit a brake pair, switch the rear wheel to tubeless, log a ride, and see the saddle and brakes carry the ride with no front derailleur or rear tube gap.
- [ ] T068 [P] Update apps/web/e2e/visual.spec.ts so the grouped position board and the wheel setup appear in the `visual-desktop`, `visual-tablet` and `visual-mobile` projects. There must be no horizontal page scroll at 390 px. Update the baselines after review.
- [ ] T069 Update the `OpenAPI` contract assertions in tests/Integration.Tests/UiBackendContractTests.cs for the new routes, required fields, wire enums (20 types, 27 positions, 3 groups, 2 reasons) and nullable `weightGrams`/`frameWeightGrams`.
- [ ] T070 Run every gate in specs/002-component-groups-weight/quickstart.md "Automated gates", then walk scenarios 1–20 (including the timed SC-001 walkthrough) against `./scripts/dev.sh run` + `npm run web:dev` with synthetic data. Record a dated "Local verification" entry with test counts and per-scenario results in docs/backend-workflows.md under a new "Component groups and weights (2026-10)" section. Report any failure as observed, and turn it into a fix task.
- [ ] T071 Update apps/web/PRODUCT.md (and apps/web/DESIGN.md if the board introduces new patterns) to describe the grouped position board, weights and wheel setup.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)** comes first.
- **Foundational (Phase 2)** depends on Setup and blocks every story. T004–T007 come before T009; T010 comes before T012 and T016; T012 comes before T013; T016 comes before T017; T018 comes last.
- **US1 (Phase 3)** depends on Phase 2. It delivers the exemption endpoints and position statuses that US4 builds on.
- **US2 (Phase 4)** depends on Phase 2. Its API work is independent of US1, but its web tasks (T040–T043) assume the US1 board (T029), and T038 reuses the `missing` status rule from T025.
- **US6 (Phase 5)** depends on Phase 2 (migration). T046/T047 need `PUT /components/{id}` from US2 (T036).
- **US3 (Phase 6)** depends on Phase 2. The web task T052 extends the US1 fit form (T030).
- **US4 (Phase 7)** depends on US1 (T024 exemption endpoints, T029 board).
- **US5 (Phase 8)** depends on Phase 2. The web task T065 extends the US1 board.
- **Polish (Phase 9)** comes after all the stories you choose to ship.

### Story completion order

```text
Setup → Foundational → US1 (MVP) → US2 → US6 → US3 → US4 → US5 → Polish
                         └──── US3, US5 API work can start in parallel with US2 after Foundational
```

### Within each story

Tests come first and must fail. Then domain, then API endpoints, then client regeneration, then web UI,
then web tests.

## Parallel Examples

```text
# Foundational tests
T002 ComponentCatalogTests.cs   ‖   T003 ComponentWeightTests.cs   ‖   T008 ComponentWeight.cs

# US1 tests
T019 UsageCalculatorTests.cs   ‖   T020 ExemptionRulesTests.cs   ‖   T021 FullPositionsApiTests.cs

# After Foundational, separate API files
T033 AnyPositionReplacementTests ‖ T034 MoveAndRefitTests (US2)   ‖   T049 PairInstallationTests (US3)   ‖   T058 WeightSummaryTests (US5)

# Polish
T067 workflow.spec.ts   ‖   T068 visual.spec.ts
```

## Implementation Strategy

### MVP (User Story 1)

1. Complete Phases 1–2, then Phase 3.
2. Stop and validate with quickstart scenarios 2–5. Every position can be fitted and every ride is
   allocated.

### Incremental delivery

1. Add US2 and US6: replacement and moves everywhere, with existing data verified intact (all P1 stories
   complete).
2. Add US3: matching pairs.
3. Add US4: tubeless.
4. Add US5: weights.
5. Finish with Polish: e2e, visual checks and recorded evidence.

Commit after each task or logical group with Conventional Commit prefixes (`feat:`, `test:`, `docs:`).
Each checkpoint leaves `./scripts/dev.sh test` and `npm test` passing.
