---

description: "Task list for bike lifecycle and ride bike choice"
---

# Tasks: Bike Lifecycle and Ride Bike Choice

**Input**: Design documents from `specs/006-bike-lifecycle/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/api-bike-lifecycle.md](contracts/api-bike-lifecycle.md),
[quickstart.md](quickstart.md)

**Tests**: Included. The constitution (III) requires tests for historical corrections, moves, atomicity and
cross-user authorization, with persistence tested against PostgreSQL. Write each story's tests first and
confirm that they fail before implementing.

**Organization**: Tasks are grouped by user story in priority order US1–US5. Decision IDs (D1–D11) refer to
[research.md](research.md).

**Conventions for every task**:

- **UI design**: no mock. Reuse existing patterns (`Dialog`, `ConflictPanel`, `FormError`, list rows, the
  V4 `BikeSwitcher`) and follow `apps/web/DESIGN.md`. Record each new pattern in `apps/web/DESIGN.md`.
- Domain rules live in the API (constitution II). The web presents choices and API errors; it never
  decides whether a bike is selectable beyond reading `status`.
- Every query filters by `owner.OwnerId` from `ICurrentOwner`. Every mutation goes through
  `OwnerMutation.ExecuteAsync(owner.OwnerId, …, true, ct)` so usage rebuilds in the same transaction.
- Wire values are kebab-case lower strings (`active`, `retired`, `deleted`, `paused`). C# enums are
  PascalCase and stored as strings.
- Every new route or method is added to the relay allowlist in `apps/web/src/lib/proxy.ts` with a case in
  `apps/web/tests/proxy.test.ts`.
- Use synthetic data only. Before each commit, run `./scripts/dev.sh lint` and the relevant suites.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: User story from spec.md (US1–US5)

---

## Phase 1: Setup

**Purpose**: Establish a known-good baseline

- [ ] T001 Run the baseline gates from specs/006-bike-lifecycle/quickstart.md "Automated gates" (`./scripts/dev.sh lint`, `./scripts/dev.sh test`, `npm run api:check`, `npm run web:lint`, `npm run web:typecheck`, `npm run web:test`) on branch `006-bike-lifecycle` and record the pass counts in your working notes. If anything fails, stop and report the failure as observed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Bike status, the deleted tombstone, the global query filter with its opt-outs, the migration
and shared read models. Every story depends on these.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for the foundation

- [ ] T002 [P] Write tests/Domain.Tests/BikeLifecycleTests.cs. A new `Bike` has `Status == BikeStatus.Active` and `DeletedUtc == null`. `Retire()` and `Reactivate()` switch status. `MarkDeleted(DateTimeOffset now)` sets `DeletedUtc`, sets `Name` to the display name from `BikeNaming.DisplayName` (make + model when the name is blank), and clears `Make`, `Model`, `Kind`, `Year`, `Color`, `FrameWeightGrams`. Calling `Retire()`, `Reactivate()` or `MarkDeleted` on a deleted bike throws `DomainValidationException`.
- [ ] T003 [P] Write tests/Integration.Tests/BikeLifecycleUpgradeTests.cs following the pattern of tests/Integration.Tests/ComponentGroupsUpgradeTests.cs: seed bikes, rides and fittings on the previous migration `20261013073652_ComponentGroupsWeight`, migrate to `BikeLifecycle`, then assert every bike has `status: "active"`, no bike is deleted, and every bike and component usage total is identical before and after.
- [ ] T004 [P] Write tests/Integration.Tests/DeletedBikeVisibilityTests.cs. Seed a bike with rides and a kept part's closed fitting, then set its `DeletedUtc` directly through the DbContext. Assert: `GET /bikes` omits it; `GET /bikes/{id}`, `GET /bikes/{id}/overview`, `POST /installations` and `POST /rides` targeting it return `404 not_found`; `GET /rides/{rideId}` still returns the ride; `PUT /rides/{rideId}` keeping that `bikeId` succeeds; `./scripts/dev.sh rebuild-usage`'s code path (`UsageRebuilder.RebuildAsync`) still allocates its rides to the kept part; `SyntheticOwnerPurge` removes it.

### Implementation for the foundation

- [ ] T005 [P] Create src/Domain/Bikes/BikeStatus.cs with `public enum BikeStatus { Active, Retired }`.
- [ ] T006 Add to src/Domain/Bikes/Bike.cs: `BikeStatus Status { get; private set; } = BikeStatus.Active`, `DateTimeOffset? DeletedUtc { get; private set; }`, `bool IsDeleted => DeletedUtc is not null`, and the methods `Retire()`, `Reactivate()` and `MarkDeleted(DateTimeOffset now)` exactly as T002 specifies. Keep setters for EF private.
- [ ] T007 Update src/Infrastructure/Persistence/Configurations/BikeConfiguration.cs: store `Status` as a string with check constraint `"Status" IN ('Active','Retired')` (match the casing convention used by other enum check constraints in the configurations folder), default `Active`, non-null; map `DeletedUtc` as nullable `timestamptz`; add `HasQueryFilter(b => b.DeletedUtc == null)` (D3). If EF Core raises the warning for a required relationship whose principal has a query filter (`CoreEventId.PossibleIncorrectRequiredNavigationWithQueryFilterInteraction`), which fails the build under warnings-as-errors, either add the same filter to the dependent or configure that relationship as optional in the model only; do not suppress the warning globally. Document the choice in a code comment.
- [ ] T008 Add the opt-outs with `IgnoreQueryFilters()` and a one-line comment naming D3, in: src/Infrastructure/Persistence/UsageRebuilder.cs (all loads); src/Api/Operations/SyntheticOwnerPurge.cs (bike loads and deletes); src/Api/Features/Rides/RideEndpoints.cs (`GET /rides/{id}` and the current-bike lookup in `PUT /rides/{id}`, only when the requested `bikeId` equals the ride's current `BikeId`). Leave every other bike lookup filtered.
- [ ] T009 Create the migration with `dotnet ef migrations add BikeLifecycle --project src/Infrastructure --startup-project src/Api`. Review it: it must only add `Bikes.Status` (`text not null default 'Active'` plus the check constraint) and `Bikes.DeletedUtc` (`timestamptz null`). Inspect the existing ride indexes in src/Infrastructure/Persistence/Configurations/RideConfiguration.cs; if none starts with `(OwnerId, StartUtc, Id)`, add that index in the configuration before generating. No data rewrite.
- [ ] T010 Add `BikeRef(Guid Id, string DisplayName, string State)` to src/Api/Features/Bikes/BikeContracts.cs with a factory `BikeRef.From(Bike b)` returning state `deleted` when `IsDeleted`, otherwise `active` or `retired`. Add `string Status` (`"active"` | `"retired"`) to `BikeResponse` and map it in `BikeResponse.From`.
- [ ] T011 Add the domain error codes `bike_retired` and `bike_parts_changed` to the 409 list in src/Api/Features/Errors/ApiProblemMapping.cs (next to `installation_overlap`). Create src/Api/Features/Bikes/BikeGuards.cs with `static void RequireActive(Bike bike)` that throws `DomainValidationException("bike_retired", "This bike is retired. Reactivate it first.")` when `bike.Status == BikeStatus.Retired`.
- [ ] T012 Run `./scripts/dev.sh migrate`, start the API with `./scripts/dev.sh run`, then run `npm run api:generate`. Add `status` to the bike DTO and a `BikeRef` type in packages/api-client/src/dto.ts and its codec in packages/api-client/src/codec.ts, with cases in packages/api-client/tests/codec.test.ts.

**Checkpoint**: T002–T004 pass; existing suites unchanged.

---

## Phase 3: User Story 1 - Choose or change the bike of a ride (Priority: P1) 🎯 MVP

**Goal**: The owner sees and chooses the bike when logging a ride, and moves a ride by correcting it.

**Independent Test**: With two bikes, log a ride to the bike not currently selected, move it back by
correcting it, and check both bikes' totals after each step (quickstart scenarios 1–4).

### Tests for User Story 1

- [ ] T013 [P] [US1] Write tests/Integration.Tests/RideMoveTests.cs. Bikes A and B each with a chain fitted from 2026-09-01. Create a 30 000 m ride on A; correct it to B; assert A's chain and A lose 30 000 m and B's chain and B gain it. Move with a changed `startUtc` in the same request; assert allocation uses B's fitting at the new start. Move onto a bike with no chain at that time; assert a gap is reported. Stale `expectedVersion` returns `409 stale_version` and changes nothing. Another owner's `bikeId` returns `404 not_found`.
- [ ] T014 [P] [US1] Add cases to apps/web/tests/rides.test.tsx: with two active bikes, Log ride shows a "Bike" select preselected to the viewed bike and saves the chosen `bikeId`; with one active bike there is no select and the dialog title reads "Log ride on ‹bike name›"; correcting a ride to another bike sends the new `bikeId` and refreshes both bikes (both ids in `affectedBikeIds`).

### Implementation for User Story 1

- [ ] T015 [US1] In src/Api/Features/Rides/RideEndpoints.cs: on `POST /rides` and on `PUT /rides/{id}` when `request.BikeId != ride.BikeId`, load the target bike with the normal (filtered) query so a deleted bike returns `404 not_found`, then call `BikeGuards.RequireActive`. When `request.BikeId == ride.BikeId`, skip the guard (D1).
- [ ] T016 [US1] In apps/web/src/features/rides/RideForm.tsx: add a `bikeId` value to the form state, initialised from the `bikeId` prop (log) or the ride's `bikeId` (correct). Read bikes with `useAllBikes` from apps/web/src/features/garage/queries.ts. Options are active bikes; when correcting a ride whose bike is retired, also include that bike. Render the select through apps/web/src/components/Field.tsx above the existing fields, hidden when there is exactly one option. Title: "Log ride on ‹name›" / "Correct ride on ‹name›" for the selected bike. Send the chosen `bikeId` in `CreateRide`/`CorrectRide`; on a move pass `affectedBikeIds: [oldBikeId, newBikeId]`. The missing-parts notice uses the selected bike (`useBike(selectedBikeId)`).
- [ ] T017 [US1] In apps/web/src/features/rides/mutations.ts and apps/web/src/lib/query.ts, make sure a ride save invalidates the rides, overview, components and stats queries of every id in `affectedBikeIds`.
- [ ] T018 [US1] In apps/web/src/features/garage/Workspace.tsx, when every bike is retired, disable Log ride and show the notice "Reactivate a bike or add one to log rides." instead of opening the form.

**Checkpoint**: Quickstart scenarios 1–4 pass; US1 deliverable on its own.

---

## Phase 4: User Story 2 - See all rides across bikes (Priority: P2)

**Goal**: One newest-first list of every ride with its bike's name, link or Deleted tag.

**Independent Test**: With rides on two bikes, open All rides and check order and bike links; correct one ride from the list (quickstart scenario 5).

### Tests for User Story 2

- [ ] T019 [P] [US2] Write tests/Integration.Tests/AllRidesApiTests.cs. Rides on bikes A, B and a deleted bike C (set `DeletedUtc` directly). `GET /rides?pageSize=2` pages through all rides ordered by `startUtc` desc then `id` desc with a stable cursor; each item carries `bike` with `state` `active`, `retired` or `deleted` and C's display name. A cursor from `GET /bikes/{id}/rides` is rejected. `pageSize` 0 and 201 return `400 invalid_input`. Another owner sees none of these rides.
- [ ] T020 [P] [US2] Add apps/web/tests/all-rides.test.tsx: rows show the bike name as a link to `?bike=<id>&view=overview` for active and retired bikes, with a "Retired" tag for retired; a deleted bike shows the name and a "Deleted" tag and no link; "Load more" fetches the next cursor; Correct and Delete open the existing dialogs.

### Implementation for User Story 2

- [ ] T021 [US2] Add `RideListItem` (all `RideResponse` fields plus `BikeRef Bike`) to src/Api/Features/Rides/RideContracts.cs.
- [ ] T022 [US2] Add `GET /rides` to src/Api/Features/Collections/CollectionEndpoints.cs modelled on `GET /bikes/{id}/rides` (lines ~206–251): same RepeatableRead snapshot, `pageSize` 1–200 default 50, `PageCursor` scope `rides:owner:{owner}`, order `StartUtc` desc then `Id` desc, joining bikes with `IgnoreQueryFilters()` to build `BikeRef`. Add the D3 comment on the opt-out.
- [ ] T023 [US2] Add `listAllRides({ pageSize, cursor })` to packages/api-client/src/client.ts with DTO and codec, plus a test in packages/api-client/tests/client.test.ts. Allow `GET rides` in apps/web/src/lib/proxy.ts with a case in apps/web/tests/proxy.test.ts.
- [ ] T024 [US2] Add the `all-rides` view: extend `View` handling in apps/web/src/features/garage/navigation.ts (`readSelection` accepts `all-rides`; `selectionUrl` keeps working without a bike), add a navigation entry next to the per-bike views in apps/web/src/features/garage/Workspace.tsx, and create apps/web/src/features/rides/AllRides.tsx with an infinite query in apps/web/src/features/rides/queries.ts (key in apps/web/src/lib/query.ts). Reuse the row layout from apps/web/src/features/rides/Rides.tsx and add the bike cell. Correct and Delete open `RideForm` (with the ride's bike) and `DeleteRideDialog` through the existing editor state.
- [ ] T025 [US2] Invalidate the all-rides query after every ride create, correct and delete in apps/web/src/features/rides/mutations.ts.

**Checkpoint**: Quickstart scenario 5 passes.

---

## Phase 5: User Story 3 - Retire and reactivate a bike (Priority: P3)

**Goal**: Retired bikes leave the active list and the ride picker, keep their history, pause reminders, and can be reactivated.

**Independent Test**: Retire a bike with rides and parts, check it is not offered for rides while its history is viewable, then reactivate it (quickstart scenarios 6–9).

### Tests for User Story 3

- [ ] T026 [P] [US3] Write tests/Integration.Tests/BikeStatusTests.cs. `PUT /bikes/{id}/status` retires and reactivates, increments `version`, and returns `409 stale_version` on a stale version. On a retired bike: `POST /rides` → `409 bike_retired`; moving a ride onto it → `409 bike_retired`; `POST /installations`, `/installations/pair`, `/installations/{id}/move` to it, `/installations/{id}/replacement` and `/installations/{id}/replacement-with-service` → `409 bike_retired`; ending a fitting with `PUT /installations/{id}`, correcting and deleting its rides, and `POST /maintenance` succeed. Usage totals and overview are identical before retiring and after reactivating. The reminder reads `state: "paused"`, `due: false` while retired and returns to its previous evaluation on reactivation.
- [ ] T027 [P] [US3] Add cases to apps/web/tests/garage.test.tsx and apps/web/tests/bikes.test.tsx: the switcher lists retired bikes under a "Retired" heading after active bikes; the overview of a retired bike shows a "Retired" tag and a Reactivate action; Retire asks for confirmation and sends `expectedVersion`; retiring the viewed bike switches to another active bike.

### Implementation for User Story 3

- [ ] T028 [US3] Create src/Api/Features/Bikes/BikeLifecycleEndpoints.cs with `PUT /bikes/{id}/status` taking `{ status: "active" | "retired", expectedVersion }` (contract in specs/006-bike-lifecycle/contracts/api-bike-lifecycle.md). Use `OwnerMutation` with `recalculate: false`, `ApiInput.Version`, then `Retire()`/`Reactivate()`; same status is a no-op after the version check. Register it where the other bike endpoints are mapped.
- [ ] T029 [US3] Call `BikeGuards.RequireActive` on the destination bike in src/Api/Features/Installations/InstallationEndpoints.cs (`POST /installations`, `POST /installations/{id}/replacement`), src/Api/Features/Installations/PairEndpoints.cs, src/Api/Features/Installations/MoveEndpoints.cs (destination bike only) and src/Api/Features/Installations/ReplacementEndpoints.cs. Do not guard `PUT /installations/{id}`.
- [ ] T030 [US3] In src/Api/Features/Reminders/ReminderReader.cs return the evaluation with `State = "paused"` and `Due = false` when the bike is retired, keeping the rule fields (D5).
- [ ] T031 [US3] Add `setBikeStatus(id, { status, expectedVersion })` to packages/api-client/src/client.ts with a test; allow `PUT bikes/{id}/status` in apps/web/src/lib/proxy.ts with a proxy test case.
- [ ] T032 [US3] Create apps/web/src/features/bikes/RetireBikeDialog.tsx (confirm retire or reactivate, show `ConflictPanel` on 409) and its mutation in apps/web/src/features/bikes/mutations.ts invalidating bikes, the bike, overview and reminders. Add Retire/Reactivate to the bike overview actions in apps/web/src/features/overview/Overview.tsx and the "Retired" tag next to the bike name.
- [ ] T033 [US3] In apps/web/src/components/BikeSwitcher.tsx and apps/web/src/features/garage/Garage.tsx group retired bikes under a "Retired" heading after active bikes (search still matches them; recently viewed may include them). When the viewed bike is retired by the owner, select the first active bike, or stay on it if none is active. In the reminder UI (apps/web/src/features/reminders/ReminderCard.tsx) show "Paused while retired" for state `paused`.

**Checkpoint**: Quickstart scenarios 6–9 pass.

---

## Phase 6: User Story 4 - Delete a component (Priority: P4)

**Goal**: The owner permanently deletes a spare or fitted part.

**Independent Test**: Delete a spare with past fittings and a fitted part; check they vanish and the bikes show gaps (quickstart scenarios 10–11).

### Tests for User Story 4

- [ ] T034 [P] [US4] Write tests/Integration.Tests/ComponentDeletionTests.cs. Deleting a spare with a September fitting on bike A removes the component, its installations and usage rows, and A's overview reports a gap for that position in September. Deleting a fitted saddle leaves the position empty. A maintenance record naming the component survives with `componentId: null`. Stale `expectedVersion` → `409 stale_version` with nothing changed. Another owner → `404 not_found`. `ComponentResponse.bikes` lists one `BikeRef` per bike in its installations, including a deleted bike with `state: "deleted"`.
- [ ] T035 [P] [US4] Add cases to apps/web/tests/components.test.tsx: the passport shows "Delete part…"; for a fitted part the confirmation names the bike and position; the confirmation says deletion cannot be undone; after deleting, the passport closes and the parts list refreshes; history rows for a deleted bike show "‹name› (deleted)" without a link.

### Implementation for User Story 4

- [ ] T036 [US4] Add `DELETE /components/{id}?expectedVersion=` to src/Api/Features/Components/ComponentEndpoints.cs (D8): in one `OwnerMutation` with `recalculate: true`, check the version, set `ComponentId = null` on the owner's maintenance records for it, delete its installations, delete the component; return `204`. Put the deletion steps in a reusable static method (for example `ComponentDeletion.DeleteAsync(db, ownerId, componentId, ct)` in src/Api/Features/Components/ComponentDeletion.cs) for US5.
- [ ] T037 [US4] Add `IReadOnlyList<BikeRef> Bikes` to `ComponentResponse` in src/Api/Features/Components/ComponentContracts.cs, filled from the bikes its installations reference using `IgnoreQueryFilters()` (D6), in every endpoint that returns `ComponentResponse` (including `GET /components` in src/Api/Features/Collections/CollectionEndpoints.cs).
- [ ] T038 [US4] Add `deleteComponent(id, expectedVersion)` to packages/api-client/src/client.ts and `bikes` to the component DTO/codec, with tests; allow `DELETE components/{id}` in apps/web/src/lib/proxy.ts with a proxy test case.
- [ ] T039 [US4] Create apps/web/src/features/components/DeleteComponentDialog.tsx and its mutation in apps/web/src/features/components/mutations.ts (invalidate components, the affected bikes' overview and components). Add "Delete part…" to apps/web/src/features/components/ComponentPassport.tsx. Name history bikes from `component.bikes`, linking active and retired bikes and showing "‹name› (deleted)" without a link for deleted ones.

**Checkpoint**: Quickstart scenarios 10–11 pass.

---

## Phase 7: User Story 5 - Delete a bike and keep chosen parts (Priority: P5)

**Goal**: The owner deletes a bike in one confirmation, keeping ticked parts as spares; its rides stay with a Deleted tag.

**Independent Test**: Delete a bike with rides and five fitted parts, keeping two; check the bike and three parts are gone, the two are spares with unchanged usage, and the rides show "Deleted" in All rides (quickstart scenarios 12–16).

### Tests for User Story 5

- [ ] T040 [P] [US5] Write tests/Integration.Tests/BikeDeletionTests.cs. `GET /bikes/{id}/deletion-preview` returns the bike version, the open fittings, the ride count and maintenance count. `POST /bikes/{id}/delete` keeping two of five parts: the kept parts' fittings end at the request time, they are spares with lifetime usage identical to before; the other three components are gone; the bike's maintenance records, reminder rule and exemptions are gone; its rides remain and `GET /rides` shows the bike with `state: "deleted"` and its former display name; `GET /bikes` omits it. Stale bike version → `409 stale_version`; a part fitted after the preview → `409 bike_parts_changed` with a fresh preview, and nothing changed; a `keepComponentIds` entry that is not fitted → `400 invalid_input`. A bike with no rides and no remaining fittings is removed entirely. Correcting a ride of the deleted bike onto bike A moves its usage from the kept parts to A's parts. A retired bike can be deleted. Another owner → `404 not_found`.
- [ ] T041 [P] [US5] Add apps/web/tests/delete-bike.test.tsx: the dialog lists every fitted part with an unticked box, states how many rides will be kept and how many maintenance records deleted, and says it cannot be undone; confirming sends the preview's version, installation ids and ticked component ids; `bike_parts_changed` refreshes the list and keeps the ticks for parts still present; after success the app selects another bike or shows the empty garage.

### Implementation for User Story 5

- [ ] T042 [US5] Add `BikeDeletionPreview`, `FittedPartPreview` and `DeleteBike(long ExpectedVersion, IReadOnlyList<Guid> FittedInstallationIds, IReadOnlyList<Guid> KeepComponentIds)` to src/Api/Features/Bikes/BikeContracts.cs as in specs/006-bike-lifecycle/data-model.md.
- [ ] T043 [US5] In src/Api/Features/Bikes/BikeLifecycleEndpoints.cs add `GET /bikes/{id}/deletion-preview` and `POST /bikes/{id}/delete` following D9 steps 1–5 in one `OwnerMutation` with `recalculate: true`: version check; compare the open fitting ids as a set and throw `DomainValidationException("bike_parts_changed", …)` carrying a fresh preview in the problem extensions; end kept fittings at the request instant; delete other fitted components with `ComponentDeletion.DeleteAsync`; delete the bike's maintenance records, `ChainLubricationRule` and `PositionExemption` rows; then `MarkDeleted(now)`, or remove the bike row when no ride or installation references it. Return `204`.
- [ ] T044 [US5] Add `getBikeDeletionPreview(id)` and `deleteBike(id, body)` to packages/api-client/src/client.ts with DTOs, codecs and tests; allow `GET bikes/{id}/deletion-preview` and `POST bikes/{id}/delete` in apps/web/src/lib/proxy.ts with proxy test cases.
- [ ] T045 [US5] Create apps/web/src/features/bikes/DeleteBikeDialog.tsx: load the preview, list parts (type label from the catalog, make, model, position) with tick boxes, show counts and the irreversible warning, and submit; on `bike_parts_changed` reload the preview and keep ticks by component id. Add "Delete bike…" to the overview actions in apps/web/src/features/overview/Overview.tsx. After success invalidate bikes, components and all rides, and select the first active bike, else the first retired bike, else the empty garage, in apps/web/src/features/garage/Workspace.tsx.

**Checkpoint**: Quickstart scenarios 12–17 pass.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T046 [P] Add every new route (`GET /rides`, `PUT /bikes/{id}/status`, `GET /bikes/{id}/deletion-preview`, `POST /bikes/{id}/delete`, `DELETE /components/{id}`) to tests/Integration.Tests/AuthenticatedOwnershipTests.cs, asserting `404 not_found` across owners and `401` without a session.
- [ ] T047 [P] Add a live workflow to apps/web/e2e/workflow.spec.ts covering quickstart scenarios 2, 3, 6, 12 and 13, and add visual cases for the ride bike field, All rides, the retired switcher group and the delete-bike dialog to apps/web/e2e/visual.spec.ts at desktop, tablet and mobile.
- [ ] T048 [P] Document the ride bike field, All rides, the Retired tag and switcher group, and the delete dialogs in apps/web/DESIGN.md.
- [ ] T049 [P] Add the new and changed routes, the `bike_retired` and `bike_parts_changed` codes, and the `BikeLifecycle` upgrade note (run `./scripts/dev.sh migrate`, no `rebuild-usage` needed) to docs/backend-workflows.md.
- [ ] T050 Run all gates from specs/006-bike-lifecycle/quickstart.md "Automated gates" and walk scenarios 1–17 in the running app. Review the Playwright screenshots in pairs. Record the results and counts, as observed, in docs/backend-workflows.md and docs/web-workflows.md, and tick the scenarios in specs/006-bike-lifecycle/quickstart.md.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)** → **Foundational (Phase 2)** → user stories → **Polish (Phase 8)**.
- **US1** (Phase 3) depends only on Phase 2.
- **US2** (Phase 4) depends only on Phase 2. Its All rides Correct action reuses US1's `RideForm`; without US1 it still works with the ride's own bike.
- **US3** (Phase 5) depends only on Phase 2. US1's picker reads `status`, so retired bikes drop out of it automatically once US3 lands.
- **US4** (Phase 6) depends only on Phase 2.
- **US5** (Phase 7) depends on US4 (`ComponentDeletion.DeleteAsync`, `ComponentResponse.bikes`) and on US2 for viewing deleted bikes' rides.

### Within each story

Tests first and failing → contracts/DTOs → endpoints → client and relay → web UI → checkpoint.

### Parallel opportunities

- T002, T003, T004 in parallel; T005 in parallel with them.
- After Phase 2, US1, US2, US3 and US4 can proceed in parallel; US5 follows US4.
- Within each story, the API test task and the web test task ([P]) run in parallel.
- T046–T049 in parallel.

## Parallel Example: User Story 1

```text
Task: "T013 [P] [US1] Write tests/Integration.Tests/RideMoveTests.cs"
Task: "T014 [P] [US1] Add cases to apps/web/tests/rides.test.tsx"
```

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 and Phase 2.
2. Phase 3 (US1).
3. Stop and validate quickstart scenarios 1–4; this alone fixes the reported problem.

### Incremental delivery

1. Foundation → US1 (MVP, choose and move rides).
2. US2 → All rides.
3. US3 → retire and reactivate.
4. US4 → delete parts.
5. US5 → delete bikes.
6. Polish and evidence.

Each story ends at a checkpoint with all suites passing, so the branch can be reviewed or merged after any of them.
