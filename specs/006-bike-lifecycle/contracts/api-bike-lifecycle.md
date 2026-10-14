# API Contract: Bike Lifecycle and Ride Bike Choice

All routes require an authenticated owner and act only on that owner's records; another owner's id
returns `404 not_found`. Stale `expectedVersion` returns `409 stale_version` with the current version.
Every new route and method is added to the web relay allowlist (`apps/web/src/lib/proxy.ts`).

## Changed

### `PUT /rides/{id}` (correct ride)

- Body unchanged (`CorrectRide`: `bikeId`, `startUtc`, `distanceMetres`, `durationSeconds`, `name`,
  `expectedVersion`).
- `bikeId` different from the current bike: the target must exist (`404 not_found` if missing or deleted)
  and be active (`409 bike_retired`).
- `bikeId` equal to the current bike: allowed whatever that bike's state is.

### `POST /rides`

- `409 bike_retired` when `bikeId` is retired; `404 not_found` when deleted.

### `GET /bikes`, `GET /bikes/{id}` and `BikeResponse`

- `BikeResponse` gains `status: "active" | "retired"`.
- Deleted bikes are never listed; `GET /bikes/{id}` returns `404 not_found` for them.

### `ComponentResponse`

- Gains `bikes: BikeRef[]`, one entry per distinct bike in its `installations`, including deleted bikes.

### Reminder evaluation (`GET /bikes/{id}/reminder`, overview)

- `state: "paused"` and `due: false` when the bike is retired.

### Fit, pair, move, replacement (`POST /installations`, `/installations/pair`, `/installations/{id}/move`, `/installations/{id}/replacement`, `/installations/{id}/replacement-with-service`)

- `409 bike_retired` when the destination bike is retired.

## New

### `GET /rides?pageSize=1..200&cursor=`

Returns `PageResponse<RideListItem>`: all of the owner's rides across bikes, deleted bikes included, ordered
by `startUtc` desc, then `id` desc. The cursor scope is `rides:owner:{owner}`.

```json
{
  "items": [
    {
      "id": "…", "bikeId": "…", "startUtc": "2026-10-12T06:30:00Z", "distanceMetres": 42000,
      "durationSeconds": 5400, "version": 1, "name": "Commute",
      "bike": { "id": "…", "displayName": "Canyon Grail", "state": "deleted" }
    }
  ],
  "nextCursor": null
}
```

### `PUT /bikes/{id}/status`

Body `{ "status": "active" | "retired", "expectedVersion": 3 }`. Returns `BikeResponse`. Setting the
current status again is a no-op that still checks the version.

### `GET /bikes/{id}/deletion-preview`

Returns `BikeDeletionPreview`: the bike version, its currently fitted parts (installation id, component id,
type, make, model, position), the ride count that will be kept, and the maintenance record count that will
be deleted.

### `POST /bikes/{id}/delete`

```json
{
  "expectedVersion": 3,
  "fittedInstallationIds": ["…", "…"],
  "keepComponentIds": ["…"]
}
```

- `409 stale_version` if the bike changed.
- `409 bike_parts_changed` if `fittedInstallationIds` differs from the bike's open fittings; the response
  carries a fresh `BikeDeletionPreview`.
- `400 invalid_input` if a kept component is not among the fitted parts.
- `204 No Content` on success. Everything happens in one transaction with a usage rebuild.

### `DELETE /components/{id}?expectedVersion=`

- `204 No Content` on success; works for spare and fitted parts.
- Deletes its fittings, unlinks its maintenance records, then deletes it, in one transaction with a usage
  rebuild.
