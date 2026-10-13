# Data Model: Component Groups, Weights and Full Bike Positions

**Feature**: [spec.md](spec.md) | **Decisions**: [research.md](research.md)

Changes to existing entities are marked **new** or **changed**. Unmarked fields are unchanged.

## Position catalog

This is fixed domain data (`ComponentCatalog`), not a table. It is the single source for type, group,
compatibility, empty-ability and labels (D1).

| Group | Position (wire) | Type (wire) | End | Can be empty |
| --- | --- | --- | --- | --- |
| build | `fork` | `fork` | – | no |
| build | `bottom-bracket` | `bottom-bracket` | – | no |
| build | `handlebar` | `handlebar` | – | no |
| build | `handlebar-tape` | `handlebar-tape` | – | no |
| build | `saddle` | `saddle` | – | no |
| build | `seatpost` | `seatpost` | – | no |
| build | `pedals` | `pedals` | – | no |
| build | `front-through-axle` | `through-axle` | front | no |
| build | `rear-through-axle` | `through-axle` | rear | no |
| groupset | `front-derailleur` | `front-derailleur` | – | yes: `none-fitted` |
| groupset | `rear-derailleur` | `rear-derailleur` | – | no |
| groupset | `shifters` | `shifters` | – | no |
| groupset | `cassette` | `cassette` | – | no |
| groupset | `chain` | `chain` | – | no |
| groupset | `front-brake` | `brake` | front | no |
| groupset | `rear-brake` | `brake` | rear | no |
| groupset | `front-brake-lever` | `brake-lever` | front | no |
| groupset | `rear-brake-lever` | `brake-lever` | rear | no |
| groupset | `crankset` | `crankset` | – | no |
| wheels | `front-rim` | `rim` | front | no |
| wheels | `rear-rim` | `rim` | rear | no |
| wheels | `front-tyre` | `tyre` | front | no |
| wheels | `rear-tyre` | `tyre` | rear | no |
| wheels | `front-disc-rotor` | `disc-rotor` | front | no |
| wheels | `rear-disc-rotor` | `disc-rotor` | rear | no |
| wheels | `front-inner-tube` | `inner-tube` | front | yes: `tubeless` |
| wheels | `rear-inner-tube` | `inner-tube` | rear | yes: `tubeless` |

There are 27 positions and 20 types. A component of type *T* may be installed only in a position whose
type is *T* (FR-004). Types with both a front and a rear position can be fitted as a pair (D7).

## Component (changed)

| Field | Type | Rules |
| --- | --- | --- |
| Type | enum (20 values) | **changed**: extended. Stored as the C# enum name, guarded by a widened check constraint |
| Group | build \| groupset \| wheels | **new**, derived from Type, not stored (D2) |
| Make, Model | text 1–100 | unchanged |
| WeightGrams | int? | **new**. Null means not recorded; otherwise 1–20000 (FR-001, FR-005). Check constraint |
| InitialUsageEstimateMetres | long | unchanged |
| Version | long | Incremented on a details edit |

Existing chains, cassettes and tyres keep their type and get `WeightGrams = null` (FR-015).

## Installation (changed)

| Field | Rules |
| --- | --- |
| Position | **changed**: 27 values. Existing values keep their names |

The existing rules are unchanged: `[StartUtc, EndUtc)`, no overlap per bike position, one place per
component at a time, and maintenance records must stay within their installation.

## PositionExemption (new)

A dated declaration that a position is intentionally empty (D5).

| Field | Type | Rules |
| --- | --- | --- |
| Id, OwnerId, Version | | Common entity fields. Owner-scoped like every resource |
| BikeId | guid | FK (OwnerId, BikeId) → Bike, restrict |
| Position | enum | Must be one of the catalog's empty-able positions |
| Reason | `NoneFitted` \| `Tubeless` | Must match the catalog entry for the position |
| StartUtc | timestamptz | |
| EndUtc | timestamptz? | `NULL` or `> StartUtc` (check constraint) |

**Invariants** (domain validation, tested against PostgreSQL):

- Within one bike position, exemptions and installations together must not overlap
  (`installation_overlap` conflict). Fitting an inner tube during a tubeless period is rejected
  (FR-011).
- A ride starting inside an exemption produces no allocation gap for that position (FR-009, SC-006).
- An exemption never receives usage.

**State transitions for a wheel's tube setup**:

```text
tubed ──switch-to-tubeless(T)──▶ tubeless      ends any open inner tube installation at T
                                                (requires its version; stale returns 409),
  ▲                                │            opens a Tubeless exemption [T, ∞)
  └────switch-to-tubed(T)──────────┘            ends the open exemption at T; the inner tube
                                                position is then `missing` (bike incomplete) until
                                                a tube is fitted
```

The front derailleur works the same way with `none-fitted`; ending "none fitted" makes the position
`missing` until a front derailleur is fitted. Marking it as none fitted ends any open
installation at T. The request must carry that installation's version as `expectedInstallationVersion`;
a missing or stale version returns 409 and nothing changes.

## Bike (changed)

| Field | Rules |
| --- | --- |
| Make, Model | unchanged; presented as the frame's make and model (FR-013) |
| FrameWeightGrams | **new**, int?, `NULL` or 1–20000 |

## Read models (not stored)

- **PositionStatus** (per bike position, at evaluation time): `fitted` (with component and installation),
  `exempt` (with reason and since when), `missing` (empty now and not exempt, and this bike either had a part in
  this position before or had an intentionally-empty period there that has ended; `sinceUtc` is the
  later of the last installation's end and the last exemption's end), or `not-recorded` (neither has
  ever happened on this bike).
  Display labels: `exempt` + `none-fitted` → "None fitted"; `exempt` + `tubeless` → "Not applicable
  (tubeless)"; `missing` → "Missing since …"; `not-recorded` → "Not recorded".
- **Bike completeness** (D12): `missingPositions` — the positions currently in the `missing` state. A bike
  with at least one is incomplete. It never blocks rides.
- **PositionGap** (D6): position, ride count without a recorded component, first and last such ride
  start.
- **WeightSummary** (D9): for each group, `grams` and `missingCount`; `frameGrams` (nullable);
  `totalGrams`; `missingCount` (parts plus frame).

## Projections

`ComponentUsageRow` and `InstallationUsageRow` are unchanged. A rebuild reads installations and
exemptions. Exemptions affect only gaps, which are computed on read, so stored totals depend only on
rides and installations and remain deterministic (FR-017).
