# Implementation Plan: Component Groups, Weights and Full Bike Positions

**Branch**: `002-component-groups-weight` | **Date**: 2026-10-13 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/002-component-groups-weight/spec.md`

## Summary

This feature extends a bike from 4 tracked positions (chain, cassette, two tyres) to 27, in three groups
(Build, Groupset, Wheels). It also adds an optional weight in grams to every component and to the frame.

The design is anchored on one domain `ComponentCatalog`. It drives type-to-position compatibility,
groups, labels and which positions may be intentionally empty, and the web reads it from the API. Front
derailleur "none fitted" and per-wheel "tubeless" are dated `PositionExemption` periods. They share the
existing half-open overlap rule with installations and suppress allocation gaps. A new pair endpoint
fits matching front and rear parts atomically. The overview gains per-position status, a gap summary
per position and weight subtotals.

Existing chains, cassettes and tyres keep their stored values. The single migration is additive. See
[research.md](research.md) for decisions D1–D11.

## Technical Context

**Language/Version**: C# on .NET SDK 10.0.401 (ASP.NET Core 10); TypeScript 5.9.3 on Node 24 (Next.js
16.3.8, React 19.3.0)

**Primary Dependencies**: EF Core 10.0.12 with Npgsql 10.0.3; `openapi-typescript` 7.13.0 and `openapi-fetch`
0.17.0 for the generated client; TanStack Query in the web app. No new dependencies.

**Storage**: PostgreSQL in Docker (`127.0.0.1:54329`). One additive migration, `ComponentGroupsWeight`.

**Testing**: xUnit domain tests (`tests/Domain.Tests`) and PostgreSQL integration tests
(`tests/Integration.Tests`); Vitest (`apps/web/tests`, `packages/api-client/tests`); Playwright
(`apps/web/e2e`)

**Target Platform**: Loopback-only local development; web client only. Mobile follows after the web UI.

**Project Type**: Web service and web application monorepo

**Performance Goals**: Not a driver at personal scale (a few bikes, hundreds of rides). Gap calculation is
O(rides × 27) in memory per bike read, which is acceptable at this scale.

**Constraints**: Synthetic data only. No usage may be guessed. Existing totals must be identical after
upgrade. No migration at startup.

**Scale/Scope**: 20 component types, 27 positions, 1 new entity, 7 new endpoints, about 6 changed contracts,
and a reworked bike components view in the web app.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / constraint | Status | Notes |
| --- | --- | --- |
| I. Trustworthy, explainable usage | Pass | Every new position uses the existing `[start, end)` installation rules. Exemptions are explicit, dated user declarations, never inferred, and they suppress gaps only inside their period. Unrecorded positions still produce visible gaps, now summarised per position (D6). Replacement keeps creating new identities. Totals are rebuildable, and exemptions do not affect stored totals. |
| II. Backend-owned domain rules | Pass | The catalog, compatibility, exemption overlap, the tubeless switch and weight totals all live in the API. The web reads `GET /component-catalog` and does not copy the position list (D1). |
| III. Evidence-based verification | Pass (planned) | Domain tests cover the catalog, exemption overlap and gap suppression. PostgreSQL integration tests cover the migration upgrade with identical totals, pair atomicity, the tubeless switch, cross-user 404 and weight validation. Playwright and the quickstart scenarios provide runtime evidence. |
| IV. Privacy, ownership, synthetic data | Pass | `PositionExemption` is owner-scoped with composite owner foreign keys, like `Installation`. Every new route resolves `ICurrentOwner`. Only synthetic fixtures are used. |
| V. Incremental simplicity | Pass | No new service, queue or library. The catalog is code, not a table. Wheelset assemblies and reminders for new types stay deferred, as `PROJECT_PLAN.md` requires. |
| Migrations explicit and additive | Pass | Nullable columns, widened check constraints and a new table. No data rewrite. `rebuild-usage` stays explicit. |
| Pinned versions | Pass | No new packages. |
| Decisions recorded | Pass | Nothing here is an architecture, identity, provider or infrastructure choice. Domain decisions are recorded in `research.md`. |
| Web checks per `docs/web-workflows.md` | Planned | Lint, typecheck, Vitest, and Playwright visual projects at desktop, tablet and mobile. |

**Post-design re-check**: Pass. The design adds one entity and no new infrastructure. Gap visibility
is preserved through the per-position summary, so no Complexity Tracking entry is needed.

## Project Structure

### Documentation (this feature)

```text
specs/002-component-groups-weight/
├── plan.md                    # This file
├── research.md                # Decisions D1–D11
├── data-model.md              # Catalog, Component/Installation changes, PositionExemption
├── quickstart.md              # Validation runbook (16 scenarios)
├── contracts/api-components.md
├── checklists/requirements.md
└── tasks.md                   # /speckit-tasks output
```

### Source Code (repository root)

```text
src/Domain/
├── Components/Component.cs            # ComponentType extended; WeightGrams; Group (derived)
├── Components/ComponentCatalog.cs     # NEW: positions, types, groups, ends, exemptions, labels
├── Components/ComponentWeight.cs      # NEW: 1..20000 g validation (shared with frame)
├── Installations/Installation.cs      # InstallationPosition extended to 27
├── Installations/ComponentCompatibility.cs   # delegates to catalog
├── Installations/InstallationRules.cs # overlap over installations + exemptions
├── Installations/PositionExemption.cs # NEW entity + ExemptionReason
├── Bikes/Bike.cs                      # FrameWeightGrams
├── Usage/UsageCalculator.cs           # skip exempt positions; per-position gap summary
└── Weights/WeightSummary.cs           # NEW: group/frame/total from current parts

src/Infrastructure/Persistence/
├── BikeLogDbContext.cs                # PositionExemptions set
├── Configurations/{Component,Installation,Bike}Configuration.cs   # widened checks, weights
├── Configurations/PositionExemptionConfiguration.cs              # NEW
├── UsageRebuilder.cs                  # passes exemptions to validation only
└── Migrations/<ts>_ComponentGroupsWeight.cs                        # NEW (additive)

src/Api/Features/
├── Components/ComponentValues.cs      # wire mapping via catalog
├── Components/ComponentEndpoints.cs   # weight on create; PUT /components/{id}
├── Components/CatalogEndpoints.cs     # NEW: GET /component-catalog
├── Installations/PairEndpoints.cs     # NEW: POST /installations/pair
├── Installations/MoveEndpoints.cs     # NEW: POST /installations/{id}/move (atomic)
├── Installations/ReplacementEndpoints.cs  # newWeightGrams; task label from catalog
├── Installations/InstallationEndpoints.cs # ValidateHistory includes exemptions
├── Exemptions/ExemptionEndpoints.cs   # NEW: create/correct/list exemptions
├── Bikes/*                            # frameWeightGrams; overview statuses, gaps, weights
└── Usage/BikeUsageReader.cs           # positionStatuses, positionGaps

tests/Domain.Tests/        ComponentCatalogTests, ExemptionRulesTests, UsageCalculator gap cases
tests/Integration.Tests/   ComponentGroupsUpgradeTests, PairInstallationTests, TubelessTests,
                           ComponentWeightTests, exemption ownership cases in AuthenticatedOwnershipTests

packages/api-client/       openapi.json + generated types regenerated; dto.ts Position/Type unions
apps/web/src/features/components/
├── Components.tsx         # grouped Build/Groupset/Wheels position board from catalog
├── FitComponentForm.tsx   # type from position, weight field, "fit front and rear" option
├── ComponentPassport.tsx  # weight display + details edit
├── WheelSetup.tsx         # NEW: per-wheel tubeless switch + history
└── queries.ts / mutations.ts  # catalog query; pair, exemption, details mutations
apps/web/src/features/bikes/BikeForm.tsx   # frame weight
apps/web/src/features/overview/            # gap summary per position; weight subtotals
apps/web/tests, apps/web/e2e               # new unit and workflow/visual cases
docs/backend-workflows.md                  # contract additions + upgrade note + evidence
```

**Structure Decision**: Keep the existing monorepo layout and the per-feature folders in the API and web
app. The only new folder is `src/Api/Features/Exemptions/`, for the new resource.

## Delivery Order

The order follows the user story priorities. Each step leaves the suite passing.

1. **Foundation**: catalog, extended enums, weight fields, `PositionExemption`, migration and upgrade test.
   Existing behaviour must be unchanged (US6).
2. **US1 and US2 (API)**: create/fit/replace for all positions, component details edit, gap summary and
   position statuses.
3. **US3 and US4 (API)**: pair endpoint; exemption endpoints with the tubeless switch.
4. **US5 (API)**: frame weight and overview weight summary.
5. **Client**: regenerate the OpenAPI client, then build the grouped position board, fit/pair form,
   wheel setup, front derailleur none-fitted, weights and the gap summary.
6. **Evidence**: run the quickstart scenarios and visual checks, and record results in
   `docs/backend-workflows.md`.

## Risks

- **Gap volume**: positions that are never recorded produce gaps on every ride. D6 summarises them in the
  UI. If payloads become a problem, page `allocationGaps` later.
- **Integrated road levers**: an owner may record the same unit in Shifters and Brake levers. This is
  accepted per the spec's edge cases, and the weight total may double-count it. Note this in the UI help
  text.
- **Rollback**: previous builds cannot read new enum strings. Rollback is compatible code, not a schema
  downgrade (same as earlier milestones).

## Complexity Tracking

No violations require justification.
