# Implementation Plan: Bike Lifecycle and Ride Bike Choice

**Branch**: `006-bike-lifecycle` | **Date**: 2026-10-14 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/006-bike-lifecycle/spec.md`

## Summary

The owner can choose the bike when logging a ride, move a ride by correcting it, see every ride in an
All rides list, retire and reactivate bikes, delete parts, and delete bikes while keeping chosen parts as
spares.

Moving a ride needs no new backend logic. `PUT /rides/{id}` already accepts `bikeId`, and every ride write
rebuilds the owner's usage in the same transaction, so both bikes come out right. The work there is a
destination guard, tests and the web bike field.

A bike gains a `Status` (active, retired) and a `DeletedUtc` tombstone. A deleted bike keeps only its
name, so its rides and kept parts' fittings stay valid and usage stays reproducible from history. An EF
Core global query filter hides deleted bikes from every existing lookup. Six reads opt out explicitly.

Bike deletion is one atomic request that checks the fitted parts the owner saw, ends the kept parts'
fittings, deletes the rest, and removes the bike's maintenance, reminder rule and exemptions. See
[research.md](research.md) for decisions D1–D11.

## Technical Context

**Language/Version**: C# on .NET SDK 10.0.401 (ASP.NET Core 10); TypeScript 5.9.3 on Node 24 (Next.js
16.3.8, React 19.3.0)

**Primary Dependencies**: EF Core 10.0.12 with Npgsql 10.0.3; `openapi-typescript` 7.13.0 and `openapi-fetch`
0.17.0 for the generated client; TanStack Query in the web app. No new dependencies.

**Storage**: PostgreSQL (Docker locally on `127.0.0.1:54329`, Aiven hosted). One additive migration,
`BikeLifecycle`.

**Testing**: xUnit domain tests (`tests/Domain.Tests`) and PostgreSQL integration tests
(`tests/Integration.Tests`, run via `./scripts/dev.sh test`); Vitest (`apps/web/tests`,
`packages/api-client/tests`); Playwright (`apps/web/e2e`)

**Target Platform**: Web app and API, local and hosted on UpCloud. Mobile is out of scope.

**Project Type**: Web service and web application monorepo

**Performance Goals**: Not a driver at personal scale. The existing full per-owner usage rebuild on every
ride and installation write stays acceptable; bike and component deletion add one rebuild each.

**Constraints**: Synthetic data only in development. No guessed usage. Totals unchanged by the
migration. Hosted migration additive and rollback-compatible. No migration at startup.

**Scale/Scope**: 2 new bike columns, 0 new tables, 5 new endpoints, about 8 changed endpoints or
contracts, 1 new web view and 4 new dialogs.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / constraint | Status | Notes |
| --- | --- | --- |
| I. Trustworthy, explainable usage | Pass | Moves rebuild all usage atomically (D1). A deleted bike's rides and kept parts' fittings remain, so kept usage stays reproducible (D2, FR-025). Deleting a part removes its fittings, producing visible gaps rather than reassigned usage (D8). |
| II. Backend-owned domain rules | Pass | Retire guards, the deletion steps, the parts concurrency check and bike naming for deleted bikes live in the API (D4, D6, D9). The web only presents choices. Stale writes return 409 (`stale_version`, `bike_parts_changed`). |
| III. Evidence-based verification | Pass (planned) | Integration tests against PostgreSQL for ride moves, retire guards, component and bike deletion atomicity, the parts conflict, tombstone visibility, migration upgrade with identical totals, and cross-owner 404 on new routes. Playwright and the quickstart provide runtime evidence. |
| IV. Privacy, ownership, synthetic data | Pass | All routes resolve `ICurrentOwner`; the global filter is in addition to owner scoping. A tombstone keeps only the bike name. Deletion is a real delete of parts, maintenance and settings. |
| V. Incremental simplicity | Pass | No new service, table or library. Reuses `OwnerMutation`, `PageCursor`, the conflict panel and existing dialogs. |
| Migrations explicit and additive | Pass | Two columns with a default, optionally one index; no data rewrite (D11). |
| Pinned versions | Pass | No new packages. |
| Decisions recorded | Pass | Domain decisions in `research.md`; nothing here is an architecture, identity, provider or infrastructure choice. |
| Web checks per `docs/web-workflows.md` | Planned | Lint, typecheck, Vitest, build, Playwright visual projects and live runs. |

**Post-design re-check**: Pass. The global query filter (D3) is a cross-cutting rule, but it narrows
access rather than adding infrastructure. No Complexity Tracking entry is needed.

## Project Structure

### Documentation (this feature)

```text
specs/006-bike-lifecycle/
├── plan.md                          # This file
├── research.md                      # Decisions D1–D11
├── data-model.md                    # Bike status and tombstone, deletion effects, read models
├── quickstart.md                    # Validation runbook (17 scenarios)
├── contracts/api-bike-lifecycle.md
├── checklists/requirements.md
└── tasks.md                         # /speckit-tasks output
```

### Source Code (repository root)

```text
src/Domain/
├── Bikes/Bike.cs                         # Status, DeletedUtc, Retire/Reactivate/MarkDeleted
└── Bikes/BikeStatus.cs                   # NEW enum

src/Infrastructure/Persistence/
├── Configurations/BikeConfiguration.cs   # Status check, DeletedUtc, global query filter
├── UsageRebuilder.cs                     # IgnoreQueryFilters for deleted bikes' rides
└── Migrations/<ts>_BikeLifecycle.cs      # NEW (additive)

src/Api/Features/
├── Bikes/BikeContracts.cs                # status on BikeResponse; BikeRef; deletion preview/request
├── Bikes/BikeLifecycleEndpoints.cs       # NEW: status, deletion-preview, delete
├── Bikes/BikeGuards.cs                   # NEW: active-bike check raising bike_retired
├── Rides/RideEndpoints.cs                # destination guard on create/correct
├── Rides/RideContracts.cs                # RideListItem
├── Collections/CollectionEndpoints.cs    # NEW GET /rides
├── Components/ComponentEndpoints.cs      # DELETE /components/{id}
├── Components/ComponentContracts.cs      # bikes: BikeRef[]
├── Installations/*Endpoints.cs           # bike_retired guard on fit, pair, move, replacement
├── Reminders/ReminderReader.cs           # paused state for retired bikes
└── Errors/ApiProblemMapping.cs           # bike_retired, bike_parts_changed → 409

src/Api/Operations/SyntheticOwnerPurge.cs  # IgnoreQueryFilters so tombstones are purged

tests/Domain.Tests/        BikeLifecycleTests
tests/Integration.Tests/   RideMoveTests, AllRidesApiTests, BikeStatusTests, ComponentDeletionTests,
                           BikeDeletionTests, BikeLifecycleUpgradeTests, new routes in
                           AuthenticatedOwnershipTests

packages/api-client/       openapi.json and generated types regenerated; listAllRides, setBikeStatus,
                           getBikeDeletionPreview, deleteBike, deleteComponent in client.ts
apps/web/src/lib/proxy.ts  allowlist for the new routes
apps/web/src/features/rides/      RideForm bike field; AllRides.tsx (NEW); bike name/tag on rows
apps/web/src/features/bikes/      RetireBikeDialog.tsx, DeleteBikeDialog.tsx (NEW)
apps/web/src/features/components/ ComponentPassport delete action and deleted-bike history label;
                                  DeleteComponentDialog.tsx (NEW)
apps/web/src/features/garage/     all-rides view; retired group; Log ride disabled with no active bike
apps/web/src/components/BikeSwitcher.tsx   retired group
apps/web/src/lib/query.ts         invalidation for all-rides, bikes and components after these writes
apps/web/tests, apps/web/e2e      unit, workflow and visual cases
apps/web/DESIGN.md                new dialogs, All rides view, retired group
docs/backend-workflows.md         contract additions, upgrade note, evidence
```

**UI design**: no new clickable mock is planned. The new UI reuses existing patterns (ride dialog, list
rows, confirmation dialogs, the V4 switcher), and the result is reviewed in the running app and recorded in
`apps/web/DESIGN.md`, as V4 was. If the owner wants a V6 mock first, it becomes a gate before the web
tasks.

**Structure Decision**: Keep the existing monorepo layout and per-feature folders. No new top-level folders.

## Delivery Order

Follows the story priorities; each step leaves the suite passing.

1. **Foundation**: `BikeStatus`, `DeletedUtc`, global query filter with its opt-outs, migration and upgrade
   test. Existing behaviour unchanged.
2. **US1**: destination guard and move tests (API); relay allowlist; ride form bike field (web).
3. **US2**: `GET /rides` with `BikeRef`; All rides view.
4. **US3**: status endpoint, `bike_retired` guards, paused reminders; retire dialog and retired group.
5. **US4**: `DELETE /components/{id}`; `ComponentResponse.bikes`; delete part dialog and history labels.
6. **US5**: deletion preview and delete endpoints; delete bike dialog with tick boxes.
7. **Evidence**: quickstart scenarios, visual review, results recorded in `docs/`.

## Risks

- **Missed opt-out**: a read that must see a deleted bike but lacks `IgnoreQueryFilters()` would 404 or
  drop data, for example a ride whose bike was deleted. Mitigation: integration tests read, correct and
  list rides of a deleted bike, and rebuild usage with one.
- **Rollback**: older builds ignore the new columns, so retired bikes look active and tombstones appear as
  name-only bikes. No data is lost; rollback is compatible code, not a schema downgrade.
- **Permanent deletion**: there is no undo in the app. The confirmations say so, and server backups are
  the only recovery path.
- **Full rebuild cost**: deletion triggers one owner-wide usage rebuild, the same cost as a ride write
  today.

## Complexity Tracking

No violations require justification.
