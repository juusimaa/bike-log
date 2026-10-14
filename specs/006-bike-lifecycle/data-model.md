# Data Model: Bike Lifecycle and Ride Bike Choice

**Feature**: [spec.md](spec.md) · **Decisions**: [research.md](research.md)

Only changed entities are listed. All entities stay owner-scoped with composite `(OwnerId, Id)` keys.

## Bike (changed)

| Field | Type | Rule |
| --- | --- | --- |
| `Status` | `active` \| `retired` | Required, default `active`. Check constraint. Changed only through `PUT /bikes/{id}/status`, which increments `Version`. |
| `DeletedUtc` | timestamp, nullable | Set once by bike deletion; never cleared. |

**State transitions**

```text
          retire                 delete
 active ─────────▶ retired ─────────────▶ deleted (tombstone or removed row)
   ▲  ◀─────────     │
   │   reactivate    │
   └──────── delete ─┴──▶ deleted
```

- `deleted` is not a `Status` value; it is `DeletedUtc != null`. No transition leaves it.
- On deletion: `Name` := current display name; `Make`, `Model`, `Kind`, `Year`, `Color`, `FrameWeightGrams`
  := null; `Version` incremented. The row is removed instead when no ride or fitting references it.
- A global query filter hides deleted bikes. Explicit opt-outs (D3): ride read/correct (current bike),
  all-rides list, component history, usage rebuild, synthetic-owner purge.

**Write guards** (`bike_retired`, 409): new ride, ride moved onto the bike, fit, pair, move or replacement
onto the bike. Allowed on a retired bike: ending a fitting, correcting or deleting its rides, maintenance,
reminder settings, editing bike details, deletion.

## Ride (unchanged schema)

- `BikeId` can now point to a retired or deleted bike.
- Correction may change `BikeId` to an active bike. Keeping the current `BikeId` is always allowed, even
  when that bike is retired or deleted.

## Component (unchanged schema)

- Deletion removes its installations and the component; `ComponentUsageRow` and `InstallationUsageRow`
  cascade. Maintenance records referencing it get `ComponentId = null`.

## Installation (unchanged schema)

- Fittings of kept parts on a deleted bike remain and still allocate that bike's rides.
- Bike deletion ends kept parts' open fittings at the request time (`EndUtc` = request instant).

## Maintenance record, chain lubrication rule, position exemption (unchanged schema)

- Deleted with their bike.
- A maintenance record whose component is deleted stays, with `ComponentId = null`.

## Read models (new)

- **BikeRef**: `{ id, displayName, state: active | retired | deleted }`.
- **RideListItem**: `RideResponse` fields plus `bike: BikeRef`.
- **BikeDeletionPreview**: `{ bikeVersion, fittedParts: [{ installationId, componentId, type, make, model, position }], rideCount, maintenanceCount }`.

## Migration `BikeLifecycle` (additive)

- `Bikes.Status text not null default 'active'` with check `Status in ('active','retired')`.
- `Bikes.DeletedUtc timestamptz null`.
- A rides index on `(OwnerId, StartUtc desc, Id desc)` if the existing indexes do not cover the
  all-rides ordering.
- No data rewrite. Totals are unchanged by the upgrade (tested like `ComponentGroupsUpgradeTests`).
