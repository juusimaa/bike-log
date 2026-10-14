# Feature Specification: Bike Lifecycle and Ride Bike Choice

**Feature Branch**: `006-bike-lifecycle`

**Created**: 2026-10-14

**Status**: Draft

## Clarifications

### Session 2026-10-14

- Q: What happens to the rides of a deleted bike? → A: They are kept. The deleted bike is kept only as
  a name with a "deleted" marker so its rides can show it; it cannot be opened or restored. Ride lists
  link to a bike that exists and show the name with a "Deleted" tag otherwise. Kept parts' usage stays
  reproducible from those rides.
- Q: Can a fitted part be deleted directly? → A: Yes. The confirmation names the bike, and the position
  becomes empty.
- Q: Where can rides of a deleted bike be seen? → A: In a new All rides list across every bike.

**Input**: User description: "Bike lifecycle and ride bike choice. (1) Logging a ride lets the owner choose which bike it belongs to, defaulting to the currently selected bike; the picker is hidden when the owner has only one bike. Correcting a ride lets the owner move it to another bike; usage totals of both bikes and their components update. (2) A bike can be retired and reactivated. Retired is the only status besides active; there is no soft-delete/"removed" status. (3) A component can be deleted permanently. (4) A bike can be deleted permanently. Deleting a bike removes all parts from it; the owner ticks which parts to keep as spares, and the unticked parts are deleted with the bike. Removing a single part from a bike to keep as a spare already exists and stays as is (e.g. the owner sells only the frame and keeps the parts). There is no Strava integration and none is planned, so Strava mappings are out of scope. Open questions for clarify: what happens to rides of a deleted bike; whether a fitted component can be deleted directly or only a spare; whether retired bikes appear in the ride picker and bike switcher, and whether their past rides can still be corrected."

## Overview

Today a ride always goes to the bike the owner happens to be looking at, rides can only be seen bike by
bike, a bike can never leave the garage, and a component can never be thrown away. This feature covers
the rest of a bike's life:

- The owner chooses the bike when logging a ride, and can move a ride that went to the wrong bike.
- An **All rides** list shows every ride with the bike it belongs to.
- A bike the owner no longer rides can be **retired**. It keeps all its history and can be reactivated.
- A worn-out or sold part can be **deleted**.
- A bike that is sold or scrapped can be **deleted**. The owner ticks which of its parts to keep as
  spares; the rest go with the bike. Its rides are kept and show the bike as deleted.

Removing a single part from a bike to keep it as a spare already exists and is unchanged.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Choose or change the bike of a ride (Priority: P1)

When logging a ride, the owner sees which bike it will be saved to and can choose another of their
bikes. The bike they are currently looking at is preselected. When correcting a ride that was saved
to the wrong bike, the owner picks the right bike and the ride moves there; the distance moves from
the old bike's parts to the new bike's parts.

**Why this priority**: Today the owner cannot see which bike a ride goes to, and a ride on the wrong
bike can only be deleted and logged again. Wrong usage totals undermine the whole app.

**Independent Test**: With two bikes, log a ride to the bike that is not currently selected, then
move it back by correcting it, and check both bikes' totals after each step.

**Acceptance Scenarios**:

1. **Given** the owner has bikes A and B and is viewing A, **When** they open Log ride, **Then** the
   form shows a bike field with A selected.
2. **Given** the owner is viewing A, **When** they choose B in Log ride and save a 30 km ride,
   **Then** B and the parts fitted to B at the ride's start gain 30 km, and A is unchanged.
3. **Given** a 30 km ride on A, **When** the owner corrects it and chooses B, **Then** A and its
   parts lose 30 km and B and its parts gain 30 km.
4. **Given** the owner has only one active bike, **When** they open Log ride, **Then** no bike field
   is shown, and the dialog still names the bike the ride will be saved to.
5. **Given** the ride was changed elsewhere since the form opened, **When** the owner saves a move
   to another bike, **Then** the save is rejected as a conflict and the owner sees the current ride.

---

### User Story 2 - See all rides across bikes (Priority: P2)

The owner opens an All rides list showing every ride, newest first, from every bike, including
retired and deleted ones. Each ride shows its bike's name. For a bike that exists, the name links to
that bike; for a deleted bike, the name is shown with a "Deleted" tag and no link. Rides can be
corrected and deleted from this list.

**Why this priority**: It is the only place a deleted bike's rides can be seen, and it gives the
owner one overview of their riding. User Story 5 depends on it.

**Independent Test**: With rides on two bikes, open All rides and check that both bikes' rides
appear in date order with working bike links; correct one ride from the list.

**Acceptance Scenarios**:

1. **Given** rides on bikes A and B, **When** the owner opens All rides, **Then** all rides are
   listed newest first, each with its bike's name.
2. **Given** a ride on bike A, **When** the owner selects the bike name, **Then** bike A opens.
3. **Given** a ride whose bike was deleted, **When** it is listed, **Then** the bike name is shown
   with a "Deleted" tag and is not a link.
4. **Given** a ride on a retired bike, **When** it is listed, **Then** the bike name links to the
   bike and is marked as retired.
5. **Given** more rides than fit on one page, **When** the owner reaches the end of the list,
   **Then** they can load older rides.

---

### User Story 3 - Retire and reactivate a bike (Priority: P3)

The owner marks a bike they no longer ride as retired. It drops out of the everyday bike list and
the ride picker, and its reminders stop prompting, but its rides, parts and history stay intact and
can still be viewed. The owner can reactivate it at any time.

**Why this priority**: Owners keep old bikes for years. Retiring keeps the active garage tidy
without losing history, and it is the safe alternative to deletion.

**Independent Test**: Retire a bike with rides and parts, check that it no longer appears among
active bikes or in the ride picker while its history stays viewable, then reactivate it.

**Acceptance Scenarios**:

1. **Given** an active bike, **When** the owner retires it, **Then** it is shown as retired and
   listed apart from active bikes.
2. **Given** a retired bike, **When** the owner opens it, **Then** its rides, fitted parts, usage
   totals and maintenance history are shown unchanged.
3. **Given** a retired bike, **When** the owner logs a ride from another bike, **Then** the retired
   bike is not offered in the bike field.
4. **Given** a retired bike, **When** the owner reactivates it, **Then** it is active again and can
   receive rides.
5. **Given** a retired bike with a chain lubrication reminder that is due, **When** the owner views
   reminders, **Then** that reminder is not shown as due.

---

### User Story 4 - Delete a component (Priority: P4)

The owner permanently deletes a part they have thrown away or sold, whether it is a spare or fitted
to a bike, after a confirmation that shows what will be removed with it.

**Why this priority**: Spares that no longer exist clutter the spare-parts list and part pickers, and
a worn-out part should be binnable in one step.

**Independent Test**: Delete a spare part that has fitting history and a fitted part, and check that
both disappear from lists, pickers and bike histories, and that the bikes show gaps for their
periods.

**Acceptance Scenarios**:

1. **Given** a spare part, **When** the owner deletes it and confirms, **Then** it no longer
   appears anywhere in the app.
2. **Given** a part that was fitted to a bike from May to July, **When** it is deleted, **Then** that
   bike shows that position as having no recorded part for May to July.
3. **Given** the owner opens the delete confirmation, **When** they cancel, **Then** nothing changes.
4. **Given** a part that is currently fitted to bike A, **When** the owner deletes it, **Then** the
   confirmation names bike A and the position, and after confirming the position is empty.

---

### User Story 5 - Delete a bike and keep chosen parts (Priority: P5)

The owner permanently deletes a bike they sold or scrapped. Before confirming, they see every part
fitted to the bike, with a tick box for each. Ticked parts are removed from the bike and become
spares with their history and usage. Unticked parts are deleted with the bike. The bike's
maintenance records, reminders and position exemptions are deleted. Its rides are kept and from
then on show the bike as deleted.

**Why this priority**: Least frequent action and the most destructive. Retiring already covers the
"no longer ridden" case.

**Independent Test**: Delete a bike that has rides and five fitted parts, keeping two. Check that
the bike and the three unticked parts are gone, the two kept parts are spares with unchanged usage,
and the rides appear in All rides with a "Deleted" tag.

**Acceptance Scenarios**:

1. **Given** a bike with fitted parts, **When** the owner starts deleting it, **Then** every fitted
   part is listed with a tick box, all unticked by default, and the dialog says how many rides will
   be kept and how many maintenance records will be deleted.
2. **Given** the owner ticks the wheels and the saddle, **When** they confirm, **Then** the bike and
   all other parts are deleted, and the ticked parts appear as spares.
3. **Given** a kept wheel had 4 000 km before the deletion, **When** the deletion completes, **Then**
   the wheel still shows 4 000 km, and its history shows the period on the deleted bike by name,
   without a link.
4. **Given** a bike with rides, **When** it is deleted, **Then** its rides remain in All rides with
   the bike's name and a "Deleted" tag.
5. **Given** the bike was changed elsewhere since the dialog opened (for example, a part was
   fitted), **When** the owner confirms, **Then** the deletion is rejected as a conflict and the
   dialog shows the current parts.
6. **Given** the owner deletes their only bike, **When** the deletion completes, **Then** they see
   the empty-garage state, and All rides still lists the kept rides.

---

### Edge Cases

- A ride is moved to a bike that had no part fitted in some position at the ride's start: that
  position shows a gap for the ride, as when logging a new ride there.
- The ride being corrected belongs to a retired or deleted bike: the bike field shows that bike as
  its current value, along with the active bikes, so the ride can be corrected or moved off it. A
  ride cannot be moved onto a retired or deleted bike.
- A ride is moved to a different bike and its start time is changed in the same correction: the
  distance is allocated to the parts fitted to the new bike at the new start.
- A ride on a deleted bike is corrected: kept parts that were fitted at its start gain or lose usage
  accordingly; deleted parts are not affected because they no longer exist.
- The owner retires the bike they are viewing: the app switches to another active bike, or shows
  retired bikes if none are active.
- Every bike is retired or deleted: Log ride is unavailable, and the app explains that a bike must be
  reactivated or added first.
- A kept part was paired with another part on the deleted bike (for example brakes and levers
  fitted together): each part is kept or deleted on its own tick.
- A part that is fitted to a retired bike can still be removed and kept as a spare.
- A deleted part had maintenance records: the records remain on the bike's maintenance history but
  no longer name the part.
- A ride or part is opened after another device deleted it, or a bike link is followed after the
  bike was deleted: the owner sees that it no longer exists, not an error.

## Requirements *(mandatory)*

### Functional Requirements

**Ride bike choice**

- **FR-001**: Logging a ride MUST let the owner choose any of their active bikes, with the bike
  currently being viewed preselected.
- **FR-002**: When the owner has only one active bike, the bike field MUST be hidden; the ride
  dialog MUST always name the bike the ride will be saved to.
- **FR-003**: Correcting a ride MUST let the owner move it to any of their active bikes.
- **FR-004**: Moving a ride MUST remove its distance and duration from the old bike's usage and
  from the parts fitted there at the ride's start, and add them to the new bike and its parts, in a
  single change; no total may show the ride on both bikes or on neither.
- **FR-005**: A stale ride correction, including a move, MUST be rejected as a conflict.

**All rides**

- **FR-006**: The owner MUST be able to see all their rides across every bike, including retired
  and deleted bikes, newest first, loading older rides in pages.
- **FR-007**: Each ride in a ride list MUST show its bike's name. The name MUST link to the bike
  when the bike exists, MUST be marked when the bike is retired, and MUST be shown with a "Deleted"
  tag and no link when the bike is deleted.
- **FR-008**: Rides MUST be correctable and deletable from the All rides list.

**Retiring bikes**

- **FR-009**: Each bike MUST have a status of active or retired. New bikes are active.
- **FR-010**: The owner MUST be able to retire an active bike and reactivate a retired bike.
- **FR-011**: Retired bikes MUST be listed separately from active bikes and MUST NOT be offered as
  the destination of a new or moved ride.
- **FR-012**: Retiring a bike MUST NOT change its rides, fitted parts, usage totals or maintenance
  history, and these MUST remain viewable.
- **FR-013**: Reminders for a retired bike MUST NOT be shown as due; they resume on reactivation.
- **FR-014**: Existing rides on a retired bike MUST remain correctable and deletable.
- **FR-015**: Fitting a part to a retired bike MUST be rejected; removing a part from it MUST be
  allowed.

**Deleting components**

- **FR-016**: The owner MUST be able to permanently delete a component, spare or fitted, after a
  confirmation. For a fitted component, the confirmation MUST name the bike and position.
- **FR-017**: Deleting a component MUST delete its fitting history, so that each bike it was fitted
  to shows a gap in that position for those periods; a fitted component's position becomes empty.
- **FR-018**: Maintenance records that named a deleted component MUST be kept on their bike and no
  longer name the component.

**Deleting bikes**

- **FR-019**: The owner MUST be able to permanently delete a bike, whether active or retired.
- **FR-020**: Before confirming, the owner MUST see every part currently fitted to the bike, each
  with a tick box to keep it as a spare, unticked by default, plus how many rides will be kept and
  how many maintenance records will be deleted.
- **FR-021**: Ticked parts MUST end their fitting at the moment of deletion and become spares,
  keeping their full fitting history, including the period on the deleted bike, and their usage.
- **FR-022**: Unticked parts MUST be deleted together with the bike, as defined for component
  deletion.
- **FR-023**: The bike's maintenance records, reminder settings and position exemptions MUST be
  deleted with it.
- **FR-024**: The bike's rides MUST be kept. Only the bike's name and the fact that it was deleted
  MUST be kept for them; a deleted bike MUST NOT be openable, restorable, editable or selectable
  anywhere, and MUST NOT appear in bike lists.
- **FR-025**: Usage of every kept part MUST remain reproducible from recorded rides and fitting
  history after a bike deletion (constitution principle I).
- **FR-026**: Bike deletion MUST be all or nothing, and MUST be rejected as a conflict if the bike
  or its fitted parts changed after the dialog opened.

**General**

- **FR-027**: All of these actions MUST be restricted to the owner's own bikes, rides and
  components.
- **FR-028**: Deletions MUST NOT be reversible in the app; each confirmation MUST say so.

### Key Entities

- **Bike**: Gains a status, active or retired. A deleted bike leaves behind only its name and a
  deleted marker, so its rides can still name it.
- **Ride**: Belongs to one bike, which can now be changed by correcting the ride. Rides outlive a
  deleted bike.
- **Component**: Can now be deleted. A component exists independently of bikes; its fitting
  history links it to bikes for dated periods.
- **Fitting (installation)**: A dated period of a component in a position on a bike. Ended when a
  part is kept as a spare; deleted when its component is deleted. A kept part's fittings on a deleted
  bike remain.
- **Maintenance record**: Belongs to a bike and may name a component. Deleted with its bike;
  unlinked when its component is deleted.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can log a ride to a bike other than the one they are viewing in under
  30 seconds, without changing the selected bike first.
- **SC-002**: After any ride move or correction, every affected bike and component total matches a
  full recalculation from rides and fitting history.
- **SC-003**: After retiring and reactivating a bike, all of its totals and history are identical
  to before.
- **SC-004**: The owner can delete a bike and keep a chosen set of its parts in a single
  confirmation, and the kept parts show exactly the usage they had before the deletion.
- **SC-005**: Every ride that existed before a bike deletion still appears in All rides afterwards.
- **SC-006**: No deletion leaves a partial result: after a failed or rejected deletion, every
  record is unchanged.

## Assumptions

- Retired is the only bike status the owner sees besides active. The deleted marker is internal; it
  is not a status that can be chosen, reversed or browsed.
- Deletion is permanent within the app; recovery is only possible from server backups.
- Retired bikes are listed in their own group in the bike switcher and garage, below active bikes.
- Bike names do not have to be unique, so a deleted bike's name can be reused.
- Strava is out of scope; no Strava mappings exist or are planned.
- Removing a single part from a bike to keep it as a spare already exists and is unchanged.
- A ride's usage is still allocated by its start time to the parts fitted at that moment.
- The existing per-bike ride list is unchanged.
- The mobile app is out of scope; this feature covers the API and web app.
- Maintenance can still be logged on a retired bike (for example servicing it before a sale).
- All rides is a single newest-first list without filters; the per-bike ride list already covers
  viewing one bike's rides.
