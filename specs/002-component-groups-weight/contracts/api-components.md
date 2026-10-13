# API Contract: Component Groups, Weights and Full Bike Positions

All routes are under `/api`, authenticated and owner-scoped as today. A record owned by someone else
returns 404. Validation errors return 400 problem details. Overlaps, maintenance-history conflicts and
stale versions return 409. Timestamps are UTC, and weights are whole grams. Every mutation rebuilds
usage in the same transaction (the existing `OwnerMutation`). The committed OpenAPI snapshot and the
generated TypeScript client are regenerated from the API.

## New endpoints

### `GET /component-catalog`

Returns the fixed catalog, so clients do not copy domain rules.

```json
{
  "groups": ["build", "groupset", "wheels"],
  "positions": [
    { "position": "front-brake", "type": "brake", "group": "groupset", "end": "front",
      "label": "Front brake", "exemption": null },
    { "position": "front-inner-tube", "type": "inner-tube", "group": "wheels", "end": "front",
      "label": "Front inner tube", "exemption": "tubeless" }
  ],
  "pairTypes": ["through-axle", "brake", "brake-lever", "rim", "tyre", "disc-rotor", "inner-tube"]
}
```

### `PUT /components/{id}`

Edits component details without touching history (spec US6-2).

Request: `{ "make": "…", "model": "…", "weightGrams": 245 | null, "expectedVersion": 3 }`.
Response: `ComponentResponse`. Type cannot be changed.

### `POST /installations/pair`

Creates two components and fits them front and rear, all or nothing (FR-012).

Request:
`{ "bikeId", "type": "brake", "make", "model", "weightGrams"?, "startUtc", "initialUsageEstimateMetres"? }`

Response 201: `{ "front": { component, installation }, "rear": { component, installation } }`.
The request is rejected with 400 if the type is not in `pairTypes`, and with 409 if either position
overlaps; in either case nothing is saved.

### `POST /installations/{id}/move`

Closes an open installation and fits the same component on another bike (or the same bike), all or
nothing.

Request: `{ "toBikeId", "toPosition"?, "movedAtUtc", "expectedInstallationVersion",
"expectedDestinationInstallationVersion"? }`. `toPosition` defaults to the current position and must be
compatible with the component's type. If the destination position has an open installation, the
destination version is required: that installation is ended at `movedAtUtc` and its part returns to the
garage. This is how "take a part from another bike" works (FR-018).

Response 200: `{ oldInstallation, newInstallation, displacedInstallation? }`. Errors: 400 for an incompatible position; 404 for a
bike that isn't the owner's; 409 for a stale or missing version (source or destination) or an overlap at the destination. On any error,
nothing changes.

### `POST /bikes/{bikeId}/position-exemptions`

Declares a position intentionally empty from a date. Any open installation in that position is ended at
`startUtc` in the same transaction.

Request: `{ "position": "rear-inner-tube" | "front-inner-tube" | "front-derailleur", "startUtc",
"expectedInstallationVersion"? }`. `expectedInstallationVersion` is required when an installation is open
in that position at `startUtc`, and it must match that installation's version. The API closes that
installation at `startUtc` in the same transaction.
The reason is implied by the catalog (`tubeless` or `none-fitted`).
Response 201: `PositionExemptionResponse`
`{ id, bikeId, position, reason, startUtc, endUtc, version }`.

The request is rejected with:

- 400 for a position that cannot be empty.
- 409 version conflict when an installation is open and the version is missing or stale.
- 409 `installation_overlap` when it overlaps an existing exemption, or a closed installation that runs
  past `startUtc`.

### `PUT /position-exemptions/{id}`

Corrects or ends an exemption. Ending one means "back to tubed" or "front derailleur fitted again".

Request: `{ "startUtc", "endUtc"?, "expectedVersion" }`. Same overlap rules.

### `GET /bikes/{bikeId}/position-exemptions`

Lists the bike's exemption history, newest first. This is the wheel setup history (US4-3).

## Changed contracts

| Contract | Change |
| --- | --- |
| `CreateComponent` | `type` accepts all 20 values. Adds optional `weightGrams` |
| `ComponentResponse`, `ComponentEstimateResponse`, collection items | Add `group` and `weightGrams` (nullable) |
| `CreateInstallation`, `InstallationResponse` | `position` accepts all 27 values. Compatibility comes from the catalog |
| `ReplaceWithService` | Adds optional `newWeightGrams`. Maintenance task is `"Replace " + label` (lower-case label) |
| `CreateBike`, `EditBike`, `BikeResponse` | Add optional `frameWeightGrams` |
| `BikeResponse` (bike list, bike detail, overview) | Adds `missingPositions: string[]` (FR-019, D12). Empty means complete |
| `BikeUsageResponse`, `BikeOverviewResponse` | Add `positionStatuses[]` (`{ position, state: fitted\|exempt\|missing\|not-recorded, componentId?, installationId?, exemptionId?, reason?, sinceUtc? }`) and `positionGaps[]` (`{ position, rideCount, firstRideStartUtc, lastRideStartUtc }`). `allocationGaps` is kept but omits exempt positions |
| `BikeOverviewResponse` | Adds `weights`: `{ groups: [{ group, grams, missingCount }], frameGrams, totalGrams, missingCount }` |

## Error codes

| Situation | Status | Code |
| --- | --- | --- |
| Type does not match position | 400 | validation (existing message) |
| Weight ≤ 0, > 20000 or non-integer | 400 | validation |
| Position cannot be empty | 400 | validation |
| Pair requested for a type without front/rear positions | 400 | validation |
| Inner tube fitted during a tubeless period, or any position overlap | 409 | `installation_overlap` |
| Exemption would orphan recorded maintenance | 409 | `maintenance_history_conflict` |
| Stale `expectedVersion` or `expectedInstallationVersion` | 409 | existing version conflict |
| Exemption requested while an installation is open, without `expectedInstallationVersion` | 409 | existing version conflict |
