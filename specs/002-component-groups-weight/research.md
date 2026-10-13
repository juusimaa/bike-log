# Research: Component Groups, Weights and Full Bike Positions

**Feature**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Date**: 2026-10-13

The stack is fixed by the constitution, so no technology research was needed. These decisions resolve
the design questions the spec leaves to planning. Each one is grounded in the current code.

## Starting point (as of `addc085`)

- `ComponentType` has three values (`Chain`, `Cassette`, `Tyre`) and `InstallationPosition` has four
  (`Chain`, `Cassette`, `FrontTyre`, `RearTyre`), in `src/Domain/Components/Component.cs` and
  `src/Domain/Installations/Installation.cs`.
- Type-to-position compatibility is a hand-written `switch` in `ComponentCompatibility.Validate`.
  Wire strings are mapped by hand in `src/Api/Features/Components/ComponentValues.cs`, and maintenance
  task names in `ReplacementEndpoints` (`"Replace chain"` and similar).
- Both enums are stored as strings, guarded by check constraints `CK_Component_Type` and
  `CK_Installation_Position`.
- `UsageCalculator` emits an `AllocationGap` for **every position that has no installation at each
  ride's start**. The overview and the rides list show one notice per gap.
- The web app hard-codes the four positions (`dto.ts` `Position` union, `Components.tsx` vacant list,
  `FitComponentForm` type mapping).

## D1. One position catalog drives types, groups and compatibility

- **Decision**: Add a domain `ComponentCatalog` with one entry per position: position, component type,
  group, wheel end (front/rear/none), whether it can be declared empty and why, and a display label.
  Groups and compatibility are looked up from the catalog. The `ComponentCompatibility` switch, the
  replacement task-name switch and the hard-coded web position list all derive from it. The web
  receives it through a `GET /api/component-catalog` endpoint.
- **Rationale**: With 20 types and 27 positions, four parallel switches would drift. The constitution
  (II) puts domain rules in the API, so the client should read the catalog rather than copy it.
- **Alternatives**: A database table for positions was rejected, because positions are fixed by the
  app (spec Assumptions) and a table adds migrations and seeding for no gain. Duplicating the list in
  TypeScript was rejected under constitution II.

## D2. Group is derived from type, not stored

- **Decision**: `Component.Group` is a computed property (`ComponentCatalog.GroupOf(Type)`), returned in
  responses but not persisted.
- **Rationale**: Spec FR-002 says the group follows from the type. Storing it would allow a
  contradiction between the two.
- **Alternatives**: A stored column with a check constraint was rejected as redundant.

## D3. Front and rear variants share one type

- **Decision**: Types are axle-neutral (`Brake`, `Rim`, `Tyre`, `ThroughAxle`, …) and positions carry the
  end (`FrontBrake`, `RearBrake`). This follows the existing `Tyre` → `FrontTyre`/`RearTyre` pattern.
- **Rationale**: FR-004 allows a front/rear variant in either matching position. A rotor moved from
  front to rear stays the same component, and its lifetime usage continues.

## D4. Weight is a nullable whole number of grams

- **Decision**: `Component.WeightGrams int?`, with check constraint `NULL OR 1..20000`. `Bike.FrameWeightGrams
  int?` uses the same rule. Weight is set on creation, on replacement and through a new versioned component
  details edit.
- **Rationale**: Clarification Q1 makes weight optional. Using a unit integer matches the constitution's
  pattern of storing metres and seconds. 20 kg is the spec's plausibility ceiling (FR-005).
- **Alternatives**: Decimal kilograms were rejected, because they give rounding ambiguity in totals.

## D5. Intentionally empty positions are dated "exemption" periods

- **Decision**: Add a `PositionExemption` entity: owner, bike, position, reason (`NoneFitted` or
  `Tubeless`), `[StartUtc, EndUtc)`. Allowed combinations come from the catalog: `FrontDerailleur`
  with `NoneFitted`, and `FrontInnerTube`/`RearInnerTube` with `Tubeless`. Tubeless is per wheel
  (clarification Q2), represented as an exemption on that wheel's inner tube position.
  - Exemptions on one bike position must not overlap each other or any installation there. This extends
    `InstallationRules` to one interval check over installations and exemptions together.
  - A ride whose start falls inside an exemption produces no gap for that position (FR-009, SC-006).
  - "Switch wheel to tubeless at T" is one atomic command. It ends any open inner tube installation at
    T and opens a `Tubeless` exemption from T. "Switch back to tubed at T" ends the exemption at T.
  - The wheel's setup history (FR-010) is the list of its tubeless exemptions.
- **Rationale**: One interval model reuses the existing half-open overlap rule, the existing gap logic
  and the existing correction pattern. A separate "wheel setup" table would need a second set of rules
  that say the same thing.
- **Alternatives**: A boolean `IsTubeless` on the bike was rejected, because it has no dated history,
  contradicts FR-010 and would retroactively change gaps. A placeholder "none" component was rejected
  because it would accumulate fake usage, which violates constitution I.

## D6. Gap explanations are summarised per position

- **Decision**: `UsageCalculator` skips exempted positions. The usage and overview responses gain
  `positionGaps`: per position, the number of rides without a recorded component, plus the first and
  last such ride start. The overview web UI shows the summary ("Saddle not recorded for 12 rides")
  and no longer shows one notice per ride per position. The per-ride `allocationGaps` list is kept in
  the response for audit and for the rides table.
- **Rationale**: With 27 positions, a bike that records only a chain would otherwise show 26 notices
  per ride. Gaps must stay visible (constitution I) without becoming noise. At personal scale
  (hundreds of rides), the full list remains an acceptable payload. Paging it is noted as a later
  optimisation.
- **Alternatives**: Treating "never recorded" positions as silent was rejected, because it hides
  missing history, which constitution I forbids.

## D7. Matching front/rear parts in one step

- **Decision**: Add `POST /api/installations/pair`. It creates two components of the same type, make, model
  and weight, and installs one at each end from the same instant, in one mutation transaction. It is
  available for every type that has front and rear positions. The spec requires it for brakes, brake
  levers and rotors, and allowing it for the other front/rear types costs nothing.
- **Rationale**: FR-012 requires an all-or-nothing operation. `OwnerMutation.ExecuteAsync` already wraps
  validation, persistence and the projection rebuild in one transaction.

## D7a. Moving a part is one atomic step

- **Decision**: Add `POST /installations/{id}/move`. It checks the installation's version and the
  destination's compatibility, closes the old installation and opens the new one in one transaction.
- **Rationale**: Two client calls could leave a part half-moved, and the sequencing is a domain rule that
  belongs in the API (constitution II).

## D8. Frame stays on the bike

- **Decision**: The bike's existing `Make`/`Model` are presented as the frame's. Add only
  `FrameWeightGrams` to `Bike`, through `CreateBike`/`EditBike` as an optional field.
- **Rationale**: FR-013 says the frame is not replaceable. The existing fields already describe it.

## D9. Weight summary is computed on read

- **Decision**: The overview gains `weights`: per group (grams of currently fitted components that have a
  weight, plus a count of those without), the frame (grams or null), and the total. Totals are computed
  from current installations at `EvaluatedAtUtc`. Nothing is stored.
- **Rationale**: The values derive from data the overview already reads. Storing them would add a
  projection to keep consistent.

## D10. Migration and compatibility

- **Decision**: One additive migration named `ComponentGroupsWeight`. It adds the nullable
  `Components.WeightGrams` and `Bikes.FrameWeightGrams` columns, widens the type and position check
  constraints, and adds the `PositionExemptions` table. Existing enum strings (`Chain`, `Cassette`,
  `Tyre`, `FrontTyre`, `RearTyre`) are unchanged, so existing rows need no data rewrite (FR-015). Run
  `rebuild-usage` after migrating to refresh projections. The totals must be identical (SC-003), and an
  upgrade test covers this.
- **Rollback**: As with earlier milestones, rollback means compatible application code. The previous build
  cannot interpret new type or position strings. Schema downgrade is not a preservation strategy.

## D11. Wire format

- **Decision**: Wire values are kebab-case, as today. Types: `fork`, `bottom-bracket`, `handlebar`,
  `handlebar-tape`, `saddle`, `seatpost`, `pedals`, `through-axle`, `front-derailleur`,
  `rear-derailleur`, `shifters`, `cassette`, `chain`, `brake`, `brake-lever`, `crankset`, `rim`,
  `tyre`, `disc-rotor`, `inner-tube`. Groups: `build`, `groupset`, `wheels`. Positions are listed in
  [data-model.md](data-model.md#position-catalog). Existing values keep their spelling.

## D12. Taking parts from another bike, and incomplete bikes

- **Decision**: Extend the move endpoint (D7a) to accept an occupied destination when the request carries
  the destination installation's version. One transaction ends the source installation, ends the
  destination's current installation (that part returns to the garage) and opens the new one. A bike is
  *incomplete* while any position is in the `missing` state: it is empty now and not exempt, and it
  either had a part on this bike before or had an exemption there that has ended (for example, the
  wheel was switched back from tubeless to tubed). `BikeResponse.missingPositions` lists them. Incomplete bikes are flagged in
  the garage and bike view, and ride entry warns but is never blocked.
- **Rationale**: The owner asked for "take the saddle from bike A" as one action, with bike A clearly
  marked until it gets a part. Separating `missing` from `not-recorded` stops bikes with unentered
  positions (for example through-axles) from being flagged forever. Warning instead of blocking keeps
  real rides and future imports recordable; the gap stays visible, as constitution I requires.
- **Alternatives**: Blocking ride entry on an incomplete bike was rejected by the owner, because real
  rides would become unrecordable and imports would need parking. A badge without a ride warning was
  rejected as too easy to miss.

## D13. The catalog will grow

- **Decision**: Treat the catalog as open-ended. Adding a group, type or position means: one catalog entry
  and enum member, an additive migration that widens the type/position check constraints, and a client
  regeneration. Nothing else should need to change:
  - The web renders whatever groups and positions `GET /component-catalog` returns, in its order, with its
    labels. It never switches over group, type or position names, and never hard-codes their counts.
  - The weight summary returns one entry per catalog group, not a fixed three.
  - A new position is `not-recorded` on every existing bike, so it creates gaps but never `missing`
    states; no existing bike becomes incomplete.
  - Wire values, once published, are never renamed, so stored rows and clients stay valid.
- **Rationale**: The owner plans more groups and component types. Keeping every rule in one catalog (D1)
  makes each addition a small, reviewable change.
- **Alternatives**: A database-driven or user-editable catalog was rejected for now: positions are still
  app-defined, and editable types would be a separate feature with its own migration and validation
  rules. Dropping the check constraints to avoid a migration per addition was rejected; the constraints
  guard stored data, and the migrations are explicit and additive (constitution).
