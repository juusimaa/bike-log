# Research: Bike Lifecycle and Ride Bike Choice

**Feature**: [spec.md](spec.md) · **Date**: 2026-10-14

The Technical Context had no open unknowns: the stack, storage and test tooling are unchanged. This file
records the design decisions, each checked against the current code.

## D1: Moving a ride reuses the existing correction

**Decision**: Keep `PUT /rides/{id}` as the only way to move a ride. It already accepts `bikeId`
(`src/Api/Features/Rides/RideEndpoints.cs:92-103`). Add one rule: the destination must be an active,
not deleted bike, unless it is the ride's current bike.

**Rationale**: Every ride write runs in `OwnerMutation` with `recalculate: true`. That rebuilds all of the
owner's usage projections in the same transaction (`src/Infrastructure/Persistence/UsageRebuilder.cs`).
The old and new bikes are therefore both correct after a move, and a total can never count a ride on both
bikes or on neither (FR-004). The gap is a missing integration test, not missing behaviour.

**Alternatives considered**: A dedicated `POST /rides/{id}/move` endpoint was rejected; it would duplicate
the correction's validation and conflict handling for no gain.

## D2: Bike status is a column, deletion is a tombstone timestamp

**Decision**: Add `Bike.Status` (`active` | `retired`, default `active`) and `Bike.DeletedUtc` (nullable).
Deleting a bike sets `DeletedUtc`, fixes its display name into `Name`, and clears every other descriptive
field (make, model, kind, year, colour, frame weight). The row stays so rides and kept parts' fittings
keep a valid bike reference and a name.

**Rationale**: Rides and installations reference bikes through composite `Restrict` foreign keys. Keeping the
row avoids nullable `BikeId` columns, keeps the foreign keys intact, and keeps usage reproducible: the
usage calculator matches a ride to fittings by `BikeId` and time, and that still works for a deleted bike.
Clearing the other fields keeps only what the spec allows (FR-024).

**Alternatives considered**:
- Hard delete with rides moved to `BikeId = null` and a copied bike name on each ride. Rejected: it makes
  `Ride.BikeId` nullable and breaks the allocation join for kept parts' fittings on the deleted bike.
- A `deleted` value in `Status`. Rejected: status is user-visible and reversible; deletion is neither.

## D3: Deleted bikes are hidden by a global query filter

**Decision**: Add an EF Core global query filter on `Bike` that excludes rows with `DeletedUtc` set. The few
reads that must still see a deleted bike call `IgnoreQueryFilters()` explicitly: the ride reads and
correction (current bike only), the all-rides list, component history, the usage rebuild, and the
synthetic-owner purge.

**Rationale**: Many endpoints look a bike up by id (fit, pair, move, replace, exemptions, reminders,
maintenance, overview, rides). With the filter, each of them returns the existing `404 not_found` for a
deleted bike with no code change, which matches the "no longer exists" edge case. An opt-out list of six
known places is easier to review than an opt-in check in twenty.

**Alternatives considered**: An explicit `DeletedUtc == null` check in every lookup. Rejected: one missed
lookup would let the owner fit parts to, or log rides on, a deleted bike.

## D4: Retired bikes are guarded at write endpoints

**Decision**: A new domain error `bike_retired` (409) is raised when a write would add to a retired bike:
creating a ride, moving a ride onto it, and fitting, pairing, moving or replacing a part onto it. Ending a
fitting, correcting or deleting existing rides, and logging maintenance stay allowed (FR-014, FR-015,
spec assumption). Retiring or reactivating is `PUT /bikes/{id}/status` with `expectedVersion`.

**Rationale**: It is the smallest set of checks that enforces FR-011 and FR-015. A separate status route
keeps `PUT /bikes/{id}` (`EditBike`) unchanged for existing clients.

**Alternatives considered**: Adding `status` to `EditBike`. Rejected: retiring is a deliberate action with
its own confirmation, and old clients would send the field back unchanged.

## D5: Reminders of a retired bike are paused, not deleted

**Decision**: `ReminderReader` returns `state: "paused"` with `due: false` for a retired bike. The rule is
untouched, so it resumes on reactivation.

**Rationale**: `ReminderEvaluation.State` is already a string the web switches on; one new value meets
FR-013 without a schema change.

## D6: One `BikeRef` shape names bikes, whatever their state

**Decision**: Add `BikeRef(Id, DisplayName, State)` with `State` = `active` | `retired` | `deleted`. It is
returned by the new all-rides list (per ride) and by `ComponentResponse` (one entry per bike its
fittings reference).

**Rationale**: The web cannot look up a deleted bike's name, because deleted bikes are not in
`GET /bikes`. Shipping the name with the data that needs it keeps FR-007 and the "fitted to Canyon
(deleted)" history server-owned. The per-bike ride list and `RideResponse` stay unchanged.

## D7: All rides is a new cursor-paged collection

**Decision**: `GET /rides?pageSize&cursor` returns `PageResponse<RideListItem>` across all of the owner's
bikes, deleted ones included, ordered by `StartUtc` desc then `Id` desc. It reuses `PageCursor` with the
scope `rides:owner:{owner}` and the same RepeatableRead snapshot as `GET /bikes/{id}/rides`.

**Rationale**: It mirrors the existing per-bike list (`CollectionEndpoints.cs:206-251`), so pagination,
cursor validation and client "Load more" handling are reused.

## D8: Component deletion

**Decision**: `DELETE /components/{id}?expectedVersion=` in one `OwnerMutation` with recalculation:
unlink maintenance records (`ComponentId = null`), delete the component's installations, then delete the
component. The usage projection rows cascade.

**Rationale**: Unlinking first avoids `maintenance_history_conflict` on the remaining history (FR-018). The
rebuild then shows gaps where the fittings were (FR-017). The component's version is the conflict check,
matching every other component write.

## D9: Bike deletion is one request with an explicit view of the parts

**Decision**: `POST /bikes/{id}/delete` with body `{ expectedVersion, fittedInstallationIds, keepComponentIds }`.
In one `OwnerMutation` with recalculation:

1. Check the bike version, and that `fittedInstallationIds` equals the bike's current open fittings;
   otherwise return 409 `bike_parts_changed` with the current list (FR-026).
2. End the fittings of kept components at the request time.
3. Delete every other currently fitted component as in D8.
4. Delete the bike's maintenance records, reminder rule and position exemptions.
5. Turn the bike into a tombstone (D2).

If nothing references the bike afterwards (no rides and no remaining fittings), its row is removed
instead of kept as a tombstone.

Rides and the closed fittings of other components stay. The client gets the counts it shows in the dialog
(rides kept, maintenance records deleted) from a preview `GET /bikes/{id}/deletion-preview`.

**Rationale**: The bike's version does not change when parts are fitted, so the fitted set itself is the
concurrency check for "a part was fitted elsewhere". `POST …/delete` is used because a DELETE with a body
is poorly supported by fetch intermediaries, and the relay allowlist is method-specific.

**Alternatives considered**: Several client calls (remove parts, then delete). Rejected: not atomic
(SC-006).

## D10: Web structure

**Decision**:
- **Ride form**: a bike `<select>` of active bikes from `useAllBikes`, plus the ride's current bike if it
  is retired or deleted. Hidden with one active bike; the dialog title names the bike. A move passes both
  bike ids as `affectedBikeIds`.
- **All rides**: a garage-level view `?view=all-rides`, reusing the ride row and the correct/delete
  dialogs.
- **Retire/reactivate and delete bike**: actions on the bike overview; the delete dialog lists fitted parts
  with tick boxes.
- **Bike switcher and garage**: retired bikes in their own group below active bikes.
- **Component passport**: *Delete part…*, with the bike and position named when fitted.
- **Relay allowlist** (`apps/web/src/lib/proxy.ts`): add `GET rides`, `PUT bikes/{id}/status`,
  `GET bikes/{id}/deletion-preview`, `POST bikes/{id}/delete` and `DELETE components/{id}`.

**Rationale**: It reuses the existing dialogs, conflict panel and paging, and follows `apps/web/DESIGN.md`.
The V4 switcher gains one group, not a new control.

## D11: Migration and rollback

**Decision**: One additive migration, `BikeLifecycle`. It adds `Status` (non-null, default `'active'`, check
constraint) and `DeletedUtc` (nullable) to `Bikes`, and an index on `(OwnerId, StartUtc, Id)` for rides if
the existing index does not cover the cross-bike ordering.

**Rationale**: Hosted migrations must be additive and rollback-compatible. Rolling back the code leaves
retired bikes looking active and tombstones visible as bikes with only a name; no data is lost. That
trade-off is noted in the plan's risks.
