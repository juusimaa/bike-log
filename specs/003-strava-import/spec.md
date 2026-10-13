# Feature Specification: Strava Ride Import and Bike Matching

**Feature Branch**: `003-strava-import`

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "Strava import: connect a Strava account and import rides into bike-log, matching each ride to a bike via Strava gear_id. First sync with no bikes: confirm list of Strava bikes; unticked bikes remembered as ignored. First sync with existing bikes: manual mapping (map to existing with suggestions, create new, or ignore); one Strava bike maps to at most one bike-log bike. Later syncs: rides with an unknown Strava bike import immediately as 'pending bike' and the owner chooses create, map to a bike without a Strava link, or ignore. Rides without a bike: leave unassigned, use a default bike, or pick per ride. Wrong mappings: remap or unmap later, and choose whether already-imported rides move. Strava does not report bike changes on existing rides; Strava has no component data; rate limits apply; Strava's bike total distance is not bike-log usage. A new UI mock is required."

**UI mock**: [V5 draft](../../docs/ui-design/versions/v5/README.md) · [Open V5 mock](../../docs/ui-design/versions/v5/index.html)

## Overview

Today every ride in Bike Log is entered by hand. This feature lets the owner connect their Strava account
so that rides recorded in Strava are imported automatically and counted against the right bike's fitted
components.

Strava knows which of the owner's Strava bikes a ride was recorded on, but it knows nothing about Bike
Log's bikes or components. The core of this feature is therefore a **bike link**: a one-to-one link
between a Strava bike and a Bike Log bike, set up once by the owner and kept up to date as bikes are added
in Strava. Every imported ride is then assigned to a Bike Log bike through that link, and component usage
follows from the assignment by the existing allocation rules.

The owner is always the one who decides how a Strava bike relates to their garage. The app suggests, but
never silently creates bikes or links them.

**Precondition.** The project plan (`PROJECT_PLAN.md`, section 5) and the constitution (principle IV)
require a recorded Strava feasibility decision before a persistent integration is built: what Strava's
API terms permit for storing imported rides and calculating component totals from them, and for how
long. This specification describes the desired behaviour. Any requirement found to conflict with the
recorded decision MUST be narrowed by amending this specification before planning; see Dependencies.

## Clarifications

### Session 2026-10-13

- Q: When the owner has no bikes, are all Strava bikes created automatically? → A: No. A confirm list is
  shown; the owner unticks bikes they do not want (retired, sold, borrowed), and unticked bikes are
  remembered as ignored.
- Q: Are rides from a newly seen Strava bike held back until the owner decides? → A: No. They are
  imported immediately as "pending bike" and assigned once the owner decides.
- Q: When a link is changed, do already-imported rides move? → A: The owner chooses each time.
- Q: How should new Strava rides reach Bike Log in the first release? → A: Strava notifies Bike Log of
  new, changed and deleted rides as they happen; **Sync now** remains as a manual fallback.
- Q: When the owner disconnects Strava, or access is revoked, what happens to rides already imported?
  → A: To follow Strava's terms, all data obtained from Strava is deleted, including imported rides and
  everything derived from them, so component totals drop by the imported distance. Before an owner-initiated
  disconnect, a warning shows exactly what will be lost.
- Q: Should indoor virtual rides from trainer apps be imported? → A: Off by default; the owner can turn them
  on, and then they count on all fitted parts like any other ride.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect Strava and set up bikes on an empty garage (Priority: P1)

A new owner with no bikes connects their Strava account. Bike Log lists the bikes in their Strava
profile, all ticked, each showing its Strava name, brand, model and type, with retired bikes marked. The
owner unticks the ones they don't want (a sold bike, a partner's bike), confirms, and the ticked bikes are
created in their garage, each linked to its Strava bike. Rides are then imported and assigned to those
bikes.

**Why this priority**: This is the fastest way to a populated garage with real riding history. Without
it a new owner has to type in every bike and every ride.

**Independent Test**: With an empty garage and a synthetic Strava account holding three bikes and rides on
each, connect, untick one bike, confirm, and verify that two bikes exist, each holding only its own rides,
and that rides on the unticked bike are not imported.

**Acceptance Scenarios**:

1. **Given** an owner with no bikes and a Strava account with bikes "Grizl", "Old Allez" (retired) and
   "Partner's MTB", **When** they connect Strava, **Then** a confirm list shows all three, ticked by
   default except retired bikes, which are shown unticked with a "Retired in Strava" label.
2. **Given** the confirm list, **When** the owner unticks "Partner's MTB" and confirms, **Then** "Grizl"
   is created with name, make, model and kind taken from Strava and linked to its Strava bike, and
   "Partner's MTB" is remembered as ignored.
3. **Given** bikes created from Strava, **When** the import runs, **Then** each imported ride appears on
   the bike its Strava bike is linked to, and no ride from an ignored bike is imported.
4. **Given** a bike created from Strava, **When** the owner views it, **Then** no usage is shown from
   Strava's own lifetime distance for that bike; only imported and manually logged rides count.
5. **Given** an ignored Strava bike, **When** later syncs run, **Then** the owner is not asked about it
   again.

---

### User Story 2 - Link Strava bikes to an existing garage (Priority: P1)

An owner who has already recorded bikes and components connects Strava. For each Strava bike, Bike Log
offers three choices: **link to an existing bike**, **create a new bike**, or **ignore**. Where a Strava
bike's name, brand or model resembles an existing bike, that bike is pre-selected as a suggestion. The
owner reviews the list and confirms; only then are rides imported.

**Why this priority**: Existing owners already have component history that is worth more than the
rides. Linking must be correct before any ride lands on a bike, or the usage totals become wrong.

**Independent Test**: With two existing bikes (one whose name matches a Strava bike) and a Strava account
holding three bikes, connect, accept the suggested link, create one new bike, ignore one, and verify each
imported ride lands on the expected bike or is not imported.

**Acceptance Scenarios**:

1. **Given** an existing bike "Canyon Grizl" and a Strava bike "Grizl CF SL 8" from brand Canyon,
   **When** the mapping screen opens, **Then** "Link to Canyon Grizl" is pre-selected for that Strava
   bike, marked as a suggestion.
2. **Given** a Strava bike with no likely match, **When** the mapping screen opens, **Then** no choice
   is pre-selected and the owner must choose before confirming.
3. **Given** existing bike A already chosen as the link for one Strava bike, **When** the owner tries
   to link a second Strava bike to bike A, **Then** bike A is not offered (or is shown as already
   taken), because a bike can be linked to only one Strava bike.
4. **Given** all Strava bikes have a choice, **When** the owner confirms, **Then** links are saved, new
   bikes are created and ignored bikes remembered in one step, and rides are imported after that.
5. **Given** the owner leaves the mapping screen without confirming, **When** they come back, **Then**
   no rides have been imported and the mapping screen is shown again.

---

### User Story 3 - Rides import automatically (Priority: P1)

Once set up, new rides recorded in Strava appear in Bike Log shortly after they are uploaded, on the
linked bike, without the owner doing anything. On first connection, past rides are imported from a start
date the owner chooses. The owner can also start a sync by hand and see when the last sync happened.

**Why this priority**: Automatic import is the reason to connect Strava at all.

**Independent Test**: After setup, add a synthetic ride on a linked Strava bike and verify that it appears on
the linked Bike Log bike and that every component fitted at the ride's start shows the ride's distance.

**Acceptance Scenarios**:

1. **Given** a linked Strava bike, **When** a new ride is recorded on it in Strava, **Then** the ride
   appears in Bike Log on the linked bike within 15 minutes, labelled as imported from Strava, with a
   "View on Strava" link.
2. **Given** an imported ride, **When** the owner views the components fitted at the ride's start,
   **Then** each shows the ride's distance, by the same allocation rules as a manually logged ride.
3. **Given** first connection, **When** the owner picks an import start date, **Then** only cycling
   rides starting on or after that date are imported; running, walking and other non-cycling activities
   are never imported.
4. **Given** a large history being imported, **When** the import is slowed by Strava's request limits,
   **Then** the owner sees progress (for example "Imported 640 of about 1,200 rides") and the import
   finishes on its own later without the owner restarting it.
5. **Given** a ride is deleted in Strava, **When** Bike Log learns of it, **Then** the imported ride is
   removed and the affected component totals are recalculated.
6. **Given** a ride's type is changed in Strava from a cycling type to a non-cycling type, **When** Bike
   Log learns of it, **Then** the imported ride is removed as in scenario 5.
7. **Given** the same Strava ride is delivered twice, **When** it is processed, **Then** it exists once
   in Bike Log.

---

### User Story 4 - A new bike appears in Strava (Priority: P2)

The owner adds a new bike in Strava and rides it. On the next sync, Bike Log sees a Strava bike it has no
link for. The rides are imported straight away as **pending bike**, and the owner gets a prompt: create a
new bike from it, link it to an existing bike that has no Strava link yet, or ignore it. When they decide,
the pending rides are assigned (or, if ignored, removed).

**Why this priority**: Without this, rides on new bikes are silently lost or land on the wrong bike. It
happens rarely, so it ranks after the core setup.

**Independent Test**: After setup, add a new synthetic Strava bike with two rides, sync, verify that the two
rides show as pending and count toward no component, then create a bike from the prompt and verify
that both rides move onto it.

**Acceptance Scenarios**:

1. **Given** a ride on a Strava bike with no link and not ignored, **When** it is imported, **Then** it
   is shown as "pending bike" with the Strava bike's name, and it adds usage to no component.
2. **Given** pending rides exist, **When** the owner opens Bike Log, **Then** a notice says how many
   rides are waiting and on which Strava bike, with the three choices.
3. **Given** the owner chooses "Link to existing bike", **When** they pick one, **Then** only bikes
   without a Strava link are offered, and on confirm all pending rides for that Strava bike are assigned
   to it.
4. **Given** the owner chooses "Create a new bike", **When** they confirm the pre-filled details,
   **Then** the bike is created, linked, and the pending rides are assigned to it.
5. **Given** the owner chooses "Ignore", **When** they confirm, **Then** the pending rides for that
   Strava bike are removed and future rides on it are not imported.

---

### User Story 5 - Rides without a bike in Strava (Priority: P2)

Some Strava rides have no bike set, either because the owner never chose one or because the bike was
removed in Strava. These rides are imported to an **Unassigned rides** list. For each one the owner can
pick a bike, or leave it unassigned. The owner can also choose a **default bike** that rides without a
Strava bike are assigned to automatically from then on.

**Why this priority**: Common for owners who don't set bikes in Strava, but the rides are not lost
while unassigned, so it can follow the core flows.

**Independent Test**: Import three synthetic rides without a Strava bike, assign one by hand, set a default
bike, and verify that a fourth ride without a bike lands on the default bike while the remaining two stay
unassigned.

**Acceptance Scenarios**:

1. **Given** a Strava ride without a bike and no default bike set, **When** it is imported, **Then** it
   appears under Unassigned rides and adds usage to no component.
2. **Given** an unassigned ride, **When** the owner picks a bike for it, **Then** the ride moves to that
   bike and its fitted components show the distance.
3. **Given** the owner sets bike A as the default for rides without a bike, **When** the owner confirms,
   **Then** they are asked whether to also assign the rides currently unassigned to bike A, and future
   rides without a Strava bike are assigned to bike A automatically.
4. **Given** a default bike is set, **When** the owner clears it, **Then** future rides without a bike go
   to Unassigned rides again, and rides already assigned stay where they are.
5. **Given** several unassigned rides, **When** the owner selects several and picks a bike, **Then** all
   selected rides are assigned in one step.

---

### User Story 6 - Fix a wrong link (Priority: P2)

The owner notices that a Strava bike is linked to the wrong Bike Log bike, or should not be linked at all.
From the bike's settings or the Strava connection page, they can **change the link** to another bike or
**remove the link**. Each time, they choose what happens to rides already imported through that link:
**move them** to the new bike (or back to pending), or **keep them** where they are and apply the change
only to future rides.

**Why this priority**: Mistakes in setup must be fixable without losing history, but this is a correction
path, not the main flow.

**Independent Test**: Link a Strava bike to bike A, import rides, change the link to bike B choosing "move
rides", and verify that the rides and their component usage now belong to bike B; repeat with "keep rides"
and verify that only new rides land on bike B.

**Acceptance Scenarios**:

1. **Given** a Strava bike linked to bike A with 30 imported rides, **When** the owner changes the link
   to bike B and chooses "Move the 30 rides", **Then** all 30 rides are assigned to bike B and the usage
   on bike A's and bike B's components is recalculated.
2. **Given** the same setup, **When** the owner chooses "Keep them on bike A", **Then** the 30 rides stay
   on bike A and only rides imported after the change go to bike B.
3. **Given** a linked Strava bike, **When** the owner removes the link and chooses whether the Strava
   bike is to be asked about again or ignored, **Then** future rides follow that choice (pending bike or
   not imported).
4. **Given** the owner removes a link and chooses to move already-imported rides, **Then** those rides
   become pending bike (if the Strava bike will be asked about again) or are removed (if it is ignored);
   choosing "keep" leaves them on their bike.
5. **Given** the change dialog, **When** the owner reviews it before confirming, **Then** it shows how
   many rides and how much distance will move, and which bikes' components are affected.
6. **Given** a previously ignored Strava bike, **When** the owner chooses to stop ignoring it, **Then**
   it becomes available to link or create, and its past rides from the import start date are imported.
7. **Given** a bike is linked to a Strava bike, **When** the owner tries to change the link to a bike
   that is already linked to a different Strava bike, **Then** the change is rejected with a message
   naming the other link.

---

### User Story 7 - Correct a single ride's bike (Priority: P3)

The owner can change the bike of an individual imported ride in Bike Log, for example when they forgot to
change the bike in Strava. This correction is kept even if Strava later reports a different bike for that
ride.

**Why this priority**: Occasional correction; the link handles the common case.

**Independent Test**: Reassign one imported ride from bike A to bike B, run a sync, and verify that the ride
stays on bike B and the components' usage reflects that.

**Acceptance Scenarios**:

1. **Given** an imported ride on bike A, **When** the owner changes its bike to B, **Then** the ride is
   on bike B, marked "bike changed in Bike Log", and usage is recalculated on both bikes.
2. **Given** a ride corrected in Bike Log, **When** a later sync sees a different bike for it in Strava,
   **Then** the correction is kept.
3. **Given** a corrected ride, **When** the owner chooses "Follow Strava again", **Then** the
   correction is removed and the ride is assigned by its Strava bike.

---

### User Story 8 - Disconnect Strava (Priority: P3)

The owner can disconnect Strava from Bike Log, or revoke access from Strava's side. To follow Strava's
terms, all data obtained from Strava is then deleted: imported rides, Strava bike details and links, and
the usage those rides added to components. Component totals therefore drop to what manually logged rides
and starting estimates support. Because this cannot be undone, the owner is warned before disconnecting,
with the rides, kilometres and parts affected. Bikes, components and manual rides stay.

**Why this priority**: Required for trust and for provider terms, but used rarely.

**Independent Test**: With imported and manual rides, disconnect, and verify that no Strava data remains,
that component totals equal those rebuilt from manual rides and starting estimates only, and that bikes and
components are unchanged.

**Acceptance Scenarios**:

1. **Given** a connected account, **When** the owner chooses Disconnect, **Then** a warning states that
   all Strava data will be deleted and cannot be recovered in Bike Log, how many imported rides and
   kilometres will be deleted, how much each affected bike's total drops, and which parts will have a
   service reminder change; and that bikes, components and manual rides stay.
2. **Given** the warning, **When** the owner confirms by typing or explicitly choosing "Delete Strava data
   and disconnect", **Then** imported rides, Strava bike details, bike links, ignored-bike choices and the
   default bike setting are deleted, and a chain with 3,400 km (2,900 km from imported rides) now shows
   500 km.
3. **Given** the warning, **When** the owner cancels, **Then** nothing changes.
4. **Given** the owner revokes access from Strava's side, **When** Bike Log learns of it, **Then** the
   same deletion as scenario 2 happens without a prior warning, and on their next visit the owner sees a
   notice that Strava access was revoked, that Strava data was deleted, and how much each bike's total
   dropped.
5. **Given** a disconnected owner, **When** they connect again, **Then** setup starts again as in User
   Story 2 (their bikes still exist), and rides from the chosen start date are imported again, restoring
   the usage they carry.

---

### Edge Cases

- **Strava bike renamed**: the link is kept. The new Strava name is shown on the connection page; the
  Bike Log bike name is not changed.
- **Strava bike retired**: the link is kept and rides already on it stay. Retired bikes are labelled and
  unticked by default on the first-sync confirm list.
- **Strava bike deleted**: Strava then reports its rides as having no bike, so new deliveries of those
  rides follow the "no bike" path. Rides already imported keep their assignment.
- **Bike changed in Strava after import**: Strava does not report this. Each manual sync re-checks rides
  from the last 30 days and updates the bike of any ride not corrected in Bike Log (User Story 7). Older
  rides keep their assignment unless the owner changes them.
- **Linked Bike Log bike deleted**: the link is removed with it, and the Strava bike is asked about again
  on the next sync. Rides follow the existing bike-deletion rules.
- **Duplicate of a manual ride**: an imported ride on the same bike starting within 10 minutes of a
  manually logged ride, with distance within 5%, is flagged as a likely duplicate. The owner chooses which
  one to keep. Neither is removed automatically, and both count until the owner decides.
- **Ride before any component installation**: allocation gaps are shown exactly as for manual rides; the
  import never fills gaps with guessed usage.
- **Ride with zero distance** (for example a trainer ride with no distance recorded): imported, counts
  toward duration but adds no distance.
- **Virtual rides** (indoor trainer apps): not imported by default. The owner can turn them on in
  connection settings; when on, they go to their bike like any other ride.
- **E-bike rides**: imported like other rides.
- **Shoes and other non-bike gear**: never offered for linking.
- **Request limits reached**: syncing pauses and resumes on its own. The connection page shows "Paused
  until about 14:15 because of Strava limits", and no ride is lost or imported twice.
- **Strava unavailable or access expired**: the connection page shows the problem and what to do
  (retry later, or reconnect). Already imported rides stay.
- **Two Strava bikes both suggested for the same Bike Log bike**: the suggestion is made for the closest
  match only; the other has no suggestion.
- **Owner changes the import start date later**: moving it earlier imports the missing older rides;
  moving it later removes imported rides before the new date after confirmation.
- **Disconnect and maintenance**: usage since a component's last maintenance drops by the deleted rides'
  distance too, so a service reminder that was due may stop being due. The warning names those parts.
- **Disconnect during an import**: the import stops, and rides already imported are deleted with the rest.
- **Imported ride edited in Bike Log**: only its bike can be changed. Distance, time and date come from
  Strava and are read-only; manual rides are unaffected.

## Requirements *(mandatory)*

### Functional Requirements

**Connection**

- **FR-001**: The owner MUST be able to connect one Strava account to their Bike Log account, granting read
  access to their profile (including bikes) and activities, including activities visible only to them.
- **FR-002**: A Strava account MUST be connected to at most one Bike Log account at a time.
- **FR-003**: The connection page MUST show the connection state (connected, syncing, paused, needs
  reconnect, disconnected), the time of the last successful sync, the import start date and import
  progress while a backfill is running.
- **FR-004**: The owner MUST be able to start a sync manually. A manual sync MUST also re-check the bike of
  rides from the last 30 days (see FR-027).

**Bike links**

- **FR-005**: A Strava bike MUST be in exactly one of these states for an owner: **linked** to one Bike Log
  bike, **ignored**, or **unresolved**. A Bike Log bike MUST be linked to at most one Strava bike.
- **FR-006**: On first sync with no bikes in Bike Log, the system MUST show a confirm list of the owner's
  Strava bikes, ticked by default except bikes marked retired in Strava. On confirm, each ticked bike MUST
  be created in Bike Log (name, make, model and kind pre-filled from Strava, editable before confirming)
  and linked; each unticked bike MUST become ignored.
- **FR-007**: On first sync with one or more bikes in Bike Log, the system MUST show a mapping screen where
  the owner chooses, for each Strava bike: link to an existing bike, create a new bike, or ignore. The
  system MUST pre-select a link when a Strava bike's name, brand or model closely matches exactly one
  unlinked Bike Log bike, and label it as a suggestion. Confirming MUST require a choice for every Strava
  bike.
- **FR-008**: Applying the confirm list or the mapping screen MUST succeed or fail as a whole. No ride MUST
  be imported until it is applied.
- **FR-009**: The system MUST NOT create bikes or links without the owner's confirmation.
- **FR-010**: The system MUST NOT treat Strava's lifetime distance for a bike as Bike Log usage.

**Importing rides**

- **FR-011**: The system MUST import the owner's cycling activities (including gravel, mountain bike and
  e-bike rides) that start on or after the import start date. Non-cycling activities MUST NOT be imported.
  Virtual rides MUST be imported only if the owner has turned them on.
- **FR-012**: On first connection the owner MUST choose the import start date. The default MUST be the
  earliest component installation date in their garage, or 1 January of the current year if they have
  none.
- **FR-013**: New rides MUST be imported automatically when Strava notifies Bike Log that a ride was created,
  changed or deleted; 95% of them MUST appear within 15 minutes. Bike Log MUST NOT poll Strava on a timer
  for new rides; a manual sync (FR-004) is the fallback when a notification is missed.
- **FR-014**: Each imported ride MUST keep its Strava start time, distance, moving time, name and type, be
  labelled as imported from Strava, and link to the ride on Strava. These values MUST be read-only in Bike
  Log.
- **FR-015**: An imported ride MUST be assigned to a bike by the first matching rule:
  1. a bike set by the owner for this ride in Bike Log (FR-028);
  2. the bike linked to the ride's Strava bike;
  3. if the Strava bike is unresolved: **pending bike**, with no bike;
  4. if the ride has no Strava bike and a default bike is set: the default bike;
  5. otherwise: **unassigned**, with no bike.

  Rides on an ignored Strava bike MUST NOT be imported.
- **FR-016**: Rides assigned to a bike MUST allocate usage to that bike's components by the existing
  allocation rules. Pending and unassigned rides MUST NOT allocate usage to any component.
- **FR-017**: Each Strava ride MUST exist at most once in Bike Log, however many times it is delivered or
  re-read.
- **FR-018**: When a ride is deleted in Strava, or its type changes to one that is not imported, the
  imported ride MUST be removed and affected usage recalculated.
- **FR-019**: Syncing MUST stay within Strava's request limits, pause and resume on its own when they are
  reached, and never lose or duplicate rides because of a pause.

**New Strava bikes**

- **FR-020**: When a sync finds a ride on a Strava bike that is neither linked nor ignored, the system MUST
  import the ride as pending bike and show the owner a notice with the Strava bike's name, the number of
  waiting rides, and the choices: create a new bike, link to an existing bike that has no Strava link, or
  ignore.
- **FR-021**: Resolving an unresolved Strava bike MUST assign all its pending rides in one step (create or
  link), or remove them (ignore).

**Rides without a Strava bike**

- **FR-022**: Unassigned rides MUST be listed together. The owner MUST be able to assign one or several of
  them to a bike in one step.
- **FR-023**: The owner MUST be able to set, change or clear a default bike for rides without a Strava bike.
  Setting it MUST offer to assign the currently unassigned rides as well; it MUST apply automatically to
  later imports.

**Changing links**

- **FR-024**: The owner MUST be able to change a link to another unlinked bike, remove a link, or stop
  ignoring a Strava bike, from the bike's settings and from the connection page.
- **FR-025**: When changing or removing a link, the owner MUST choose whether rides already imported through
  that link move (to the new bike; or to pending or removed when unlinking) or stay. Before confirming, the
  system MUST show the number of rides and the total distance that would move. Rides individually set by
  the owner (FR-028) MUST NOT move.
- **FR-026**: Stopping ignoring a Strava bike MUST make it unresolved and import its rides from the import
  start date as pending bike.

**Ride-level correction and reconciliation**

- **FR-027**: Because Strava does not report bike changes on existing rides, each manual sync MUST re-read
  rides from the last 30 days and update the assignment of any whose Strava bike changed, unless the owner
  set the bike in Bike Log.
- **FR-028**: The owner MUST be able to set the bike of an individual imported ride, overriding its Strava
  bike, and later remove the override ("Follow Strava again"). An override MUST survive later syncs.
- **FR-029**: The system MUST flag an imported ride as a likely duplicate of a manual ride when both are on
  the same bike, start within 10 minutes of each other and differ in distance by at most 5%, and let the
  owner keep one. Nothing MUST be removed without the owner's choice.

**Disconnecting, ownership and provider data**

- **FR-030**: The owner MUST be able to disconnect Strava. Disconnecting, or revocation of access from
  Strava's side, MUST stop imports and remove imported rides, bike links, ignored-bike choices and the
  default bike setting. Bikes, components and manual rides MUST stay.
- **FR-030a**: On disconnect, all data obtained from Strava MUST be deleted, including anything derived
  from it: imported rides, Strava bike details and identifiers, links, and the usage imported rides added to
  components. Component totals MUST then equal those rebuilt from the remaining manual rides, installations
  and starting estimates. No Strava-derived total, summary or backup copy may be kept.
- **FR-030b**: Before an owner-initiated disconnect, the system MUST show a warning that the deletion
  cannot be undone, with the number of imported rides and kilometres to be deleted, the drop in each
  affected bike's total, and the parts whose service reminders change. Disconnecting MUST require an
  explicit confirmation separate from a plain "OK".
- **FR-030c**: When access is revoked from Strava's side, the same deletion MUST happen promptly without a
  prior warning, and the owner MUST see a notice afterwards explaining what was deleted.
- **FR-030d**: The connect page MUST tell the owner, before they connect, that disconnecting later deletes
  imported rides and the usage they added.
- **FR-031**: Imported rides MUST remain distinguishable from manual rides everywhere they are shown and in
  data export.
- **FR-032**: Strava data and links MUST be visible to and changeable by only their owner. Strava access
  credentials MUST never be shown in the browser.
- **FR-033**: Storage and retention of Strava-derived data MUST follow the recorded Strava feasibility
  decision (see Dependencies).
- **FR-034**: Strava attribution MUST follow Strava's brand guidelines wherever imported data is shown.
- **FR-035**: Every link change, override, default bike change and disconnect MUST leave component totals
  that can be rebuilt from rides and installation history with the same result.

### Key Entities

- **Strava connection**: The owner's link to one Strava account. State, connected time, last successful
  sync, import start date, whether virtual rides are imported, backfill progress.
- **Strava bike**: A bike from the owner's Strava profile. Strava identifier, name, brand, model, type,
  retired flag, and its state for this owner: linked (to one Bike Log bike), ignored or unresolved.
- **Bike link**: The one-to-one link between a Strava bike and a Bike Log bike.
- **Imported ride**: A ride read from Strava. Strava identifier, start time (UTC), distance (metres),
  moving time (seconds), name, type, the Strava bike it was recorded on (or none), its assignment state
  (assigned, pending bike, unassigned), and whether the bike was set by the owner in Bike Log. Distinct
  from a manually logged ride.
- **Default bike**: The owner's optional choice of bike for imported rides without a Strava bike.
- **Duplicate flag**: A pairing of an imported ride and a manual ride that look like the same ride,
  awaiting the owner's choice.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner with an empty garage can connect Strava and have their bikes created and their rides
  of the past year imported, with no typing beyond the confirm list, in under 5 minutes of their own time
  (background import time excluded).
- **SC-002**: An owner with up to 10 existing bikes can complete the mapping screen in under 3 minutes, and
  suggestions are correct for at least 80% of Strava bikes whose name, brand or model matches an existing
  bike.
- **SC-003**: 100% of imported rides end up on the bike given by the assignment rules, or visibly pending or
  unassigned. No ride is silently dropped, duplicated or placed on a bike the owner did not link.
- **SC-004**: 95% of new Strava rides appear in Bike Log within 15 minutes of being uploaded.
- **SC-005**: A backfill of 2,000 rides completes without manual restarts, and its final ride count matches
  the number of eligible Strava rides.
- **SC-006**: After any link change, override, default bike change or disconnect, every component total
  equals the total rebuilt from rides and installation history.
- **SC-007**: After disconnection, no Strava-derived data remains stored for the owner (rides, bike details,
  identifiers or derived totals), and component totals equal those had Strava never been connected.
- **SC-008**: In testing, 100% of owners shown the disconnect warning can correctly state, before
  confirming, that their part totals will drop.

## Assumptions

- A Bike Log account connects to one Strava account; multiple Strava accounts per owner are out of scope.
- "Cycling activities" means Strava's ride types: road, gravel, mountain bike, e-bike, e-mountain bike,
  handcycle and velomobile. Virtual rides are off by default because trainer rides wear drivetrains but not
  tyres or rims, and owners often use a separate trainer setup. Counting virtual rides only on drivetrain positions is out of scope for this
  feature and can be added later.
- The import start date defaults to the earliest installation date so that rides before any recorded
  components are not imported only to show gaps.
- Bikes created from Strava bike details become the owner's own records once confirmed (they can be
  edited like any bike), so they stay after disconnect with their Strava identifiers removed. This is to
  be confirmed by the feasibility decision.
- Only the ride's bike can be changed in Bike Log. Distance and time corrections are made in Strava.
- The 30-day re-check window on manual sync matches typical correction behaviour and keeps request use
  modest. Older bike changes in Strava need a per-ride correction in Bike Log.
- Duplicate thresholds (10 minutes, 5%) are starting values to be tuned with real use.
- Name matching for suggestions compares case-insensitive words of the Strava bike's name, brand and model
  with the Bike Log bike's name, make and model; the exact method is decided in planning.
- Strava's per-app athlete limit (initially the developer only, later up to ten athletes after upgrade)
  bounds who can use this feature in the private pilot.
- Automatic import needs Strava to be able to reach Bike Log, so it works only in a hosted environment.
  In local development, rides arrive through **Sync now** and synthetic notification fixtures.
- Web is the target client for this feature. Mobile follows after the web UI, per the project's ordering.
- Importing from other providers (Garmin, Wahoo, files) is out of scope.

## Dependencies

- **Strava feasibility decision (blocking for planning)**: `PROJECT_PLAN.md` section 5 requires a recorded
  decision in `docs/decisions/` on what Strava's API terms permit: how long imported rides may be stored,
  and whether component totals may be calculated and kept from them. If it limits storage (for example to a
  short cache), FR-014, FR-015, FR-016, FR-030, FR-035 and the success criteria MUST be revised before
  `/speckit-plan`. The decision MUST also confirm whether bikes the owner created from Strava bike details
  (FR-006) may stay after disconnect as the owner's own records, with all Strava identifiers removed, as this
  specification assumes.
- Strava developer application settings and athlete capacity (PROJECT_PLAN.md section 5, spike step 1).
- Feature 002 (component groups): imported rides allocate to all positions defined there.
- Existing authentication and per-owner authorization (feature 001).
