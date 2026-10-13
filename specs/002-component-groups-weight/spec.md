# Feature Specification: Component Groups, Weights and Full Bike Positions

**Feature Branch**: `002-component-groups-weight`

**Created**: 2026-10-13

**Status**: Draft

## Clarifications

### Session 2026-10-13

- Q: Is weight mandatory when fitting a new component? → A: No, optional; it can be left unknown and filled in later.
- Q: Is tubeless recorded per wheel or per bike? → A: Per wheel; front and rear can differ.

**Input**: User description: "Component improvements. Each component must also have weight in addition to make and model. Component also must have a group (build, groupset or wheels). Following replaceable components must be tracked with bike and user can change. Build group: fork, bottom bracket, handlebar, handlebar tape, saddle, seatpost, pedals, through-axle front, through-axle rear. Groupset group: front derailleur (can be empty), rear derailleur, shifters, cassette, chain, brakes (usually the same make and model front and rear, but it should be possible to have different ones), brake levers (same as brakes), crankset. Wheels group: front rim, rear rim, front tyre, rear tyre, front disc rotor, rear disc rotor, inner tube (can be empty for a tubeless setup), is tubeless or not. Not replaceable: frame — a changed frame is a different bike."

## Overview

Today a bike can only carry a chain, a cassette and two tyres, and a component is described only by
make and model. This feature lets the owner record the complete set of replaceable parts on a bike,
organised into three groups (Build, Groupset, Wheels), and record each component's weight. Every new
position behaves like the existing ones: parts are fitted, replaced and moved with dated history, and
rides accumulate usage on whatever is fitted at the ride's start.

A component exists on its own, not as part of a bike. A bike is only where a component is fitted for a
dated period. A component can be fitted to any of the owner's bikes, or kept unfitted (removed, or bought
as a spare), and its usage follows it from bike to bike.

The frame is not a replaceable component. It is part of the bike's identity: a different frame means a
different bike.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record the full set of parts on a bike (Priority: P1)

The owner opens a bike and sees every position the app tracks, grouped under Build, Groupset and
Wheels. For each position they can fit a component (make, model, weight, fitted date and optional
starting usage), or see that nothing is recorded yet. Positions that may legitimately be absent (front
derailleur, inner tubes) can be marked as "none fitted".

**Why this priority**: Without the positions, none of the other value (weights, usage per part,
replacement history) exists. This alone turns the app from a chain/tyre tracker into a whole-bike log.

**Independent Test**: Create a bike, fit a component in at least one position of each group, log a ride,
and confirm each fitted component shows that ride's distance.

**Acceptance Scenarios**:

1. **Given** a bike with no components, **When** the owner opens it, **Then** they see all positions
   listed under Build, Groupset and Wheels, each shown as not recorded.
2. **Given** the owner fits a saddle (make, model, weight) from 2026-05-01, **When** a 40 km ride
   starting 2026-05-02 is logged, **Then** the saddle shows 40 km of usage.
3. **Given** a 1x drivetrain, **When** the owner marks the front derailleur as "none fitted",
   **Then** the position shows as intentionally empty and is no longer shown as missing history.
4. **Given** the owner tries to fit a saddle in the handlebar position, **When** they save, **Then**
   the app rejects it because the component type does not belong to that position.
5. **Given** a position already has a component fitted for a period, **When** the owner fits another
   component there with an overlapping period, **Then** the app rejects it as an overlap.

---

### User Story 2 - Replace or move any part (Priority: P1)

The owner replaces a worn part in any position (for example new handlebar tape, a new rear tyre or a
new crankset). The old component's installation ends, its history and usage are kept, and the new
component starts accumulating from the replacement date. The owner can also move a component (for
example pedals) from one bike to another.

**Why this priority**: Replacement is the core repeated action on a bike and must work identically for
every position, not just the chain.

**Independent Test**: Replace the rear tyre on a bike with recorded rides, then log a new ride and verify
the old tyre's total is unchanged and the new tyre carries only the new ride.

**Acceptance Scenarios**:

1. **Given** handlebar tape fitted since 2026-01-01 with 1,200 km, **When** the owner replaces it on
   2026-06-01, **Then** the old tape keeps 1,200 km and its history, and rides after 2026-06-01 count
   only on the new tape.
2. **Given** pedals fitted on bike A, **When** the owner moves them to bike B on a date, **Then**
   rides on bike B after that date accumulate on the same pedals and their lifetime usage continues.
3. **Given** a cassette with 4,000 km on bike A, **When** the owner replaces it on bike A with a new
   cassette and later fits the old cassette to bike B, **Then** the old cassette keeps its 4,000 km and
   its bike A history, rides on bike B after the fit date add to the old cassette, and rides on bike A
   add only to the new cassette.
4. **Given** the owner wants to change the frame, **When** they look for a frame position, **Then**
   none exists; the frame is edited as bike details, and a new frame is recorded by creating a new bike.

---

### User Story 3 - Different front and rear brakes and levers (Priority: P2)

Most bikes use the same brake model front and rear, so the owner can fit the same make and model to both
positions in one step. When they differ (for example a different rear caliper), each position is
recorded and replaced independently.

**Why this priority**: Saves repetitive entry in the common case while keeping per-position accuracy.

**Independent Test**: Fit matching brakes front and rear in one step, then replace only the rear brake and
confirm the front brake's history is unaffected.

**Acceptance Scenarios**:

1. **Given** a bike with no brakes recorded, **When** the owner fits a brake model "for both front and
   rear", **Then** two separate components exist, one per position, with the same make, model and
   weight.
2. **Given** matching brakes front and rear, **When** the owner replaces only the rear brake, **Then**
   the front brake's installation and usage are unchanged.
3. The same two scenarios apply to brake levers and to disc rotors.

---

### User Story 4 - Tubeless or tubed wheels (Priority: P2)

The owner records whether each wheel is set up tubeless. A tubeless wheel has no inner tube; a tubed wheel
has an inner tube position that can be fitted and replaced like any other part.

**Why this priority**: Tubes are a frequently replaced part for tubed setups and irrelevant for tubeless
ones; recording the setup avoids false "missing" positions.

**Independent Test**: Mark the rear wheel tubeless from a date and confirm the rear inner tube position is
shown as not applicable and cannot be fitted while tubeless.

**Acceptance Scenarios**:

1. **Given** a tubed rear wheel with an inner tube fitted, **When** the owner switches the rear wheel
   to tubeless on 2026-07-01, **Then** the inner tube's installation ends on that date (with its
   history kept) and the position shows as not applicable from then on.
2. **Given** a tubeless front wheel, **When** the owner tries to fit a front inner tube during the
   tubeless period, **Then** the app rejects it.
3. **Given** a wheel switched from tubed to tubeless, **When** the owner views the wheel's history,
   **Then** they can see when the setup changed.

---

### User Story 5 - Component weights and group totals (Priority: P3)

The owner sees each component's weight, and a weight subtotal for each group and the bike, based on
currently fitted components plus the frame weight if recorded. Unknown weights are shown as unknown and
the totals say how many parts are missing a weight.

**Why this priority**: Useful insight, but depends on Stories 1–2 and is not needed to track usage.

**Independent Test**: Fit three Build components with known weights and one without; confirm the Build
subtotal equals the sum of the three and notes one unknown weight.

**Acceptance Scenarios**:

1. **Given** fitted components with weights 250 g, 300 g and 95 g in Build, **When** the owner views
   the bike, **Then** the Build subtotal shows 645 g.
2. **Given** one fitted Build component without a recorded weight, **When** the owner views the
   subtotal, **Then** it is labelled as incomplete with "1 part without weight".
3. **Given** a component is replaced with a lighter one, **When** the owner views the bike, **Then**
   the subtotals reflect only currently fitted components.

---

### User Story 6 - Existing components carry over (Priority: P1)

Chains, cassettes and tyres already recorded keep their history, usage and installations, and are
shown in their groups (chain and cassette in Groupset, tyres in Wheels) with weight not yet recorded.

**Why this priority**: The constitution forbids losing or guessing usage history; existing data must
remain trustworthy.

**Independent Test**: With existing chain, cassette and tyre records, apply the change and confirm all
usage totals are identical before and after.

**Acceptance Scenarios**:

1. **Given** an existing chain with 3,400 km of usage, **When** this feature is released, **Then** the
   chain still shows 3,400 km, appears in the Groupset group, and has weight shown as not recorded.
2. **Given** an existing component, **When** the owner edits it, **Then** they can add its weight
   without changing its history.

---

### Edge Cases

- A position with no recorded installation for part of a ride's date range shows an allocation gap for
  that period, as existing positions do; it is not filled with guessed usage.
- A position marked "none fitted" (front derailleur, inner tube on a tubeless wheel) shows no gap and
  receives no usage.
- Switching a wheel from tubeless back to tubed reopens the inner tube position from that date; the
  period before it remains not applicable.
- Fitting matching front and rear parts in one step where one of the two positions is already occupied
  for an overlapping period is rejected as a whole; nothing is partially saved.
- A weight of zero or a negative weight is rejected; an implausibly large weight (above 20 kg for a
  single component) is rejected as a likely entry mistake.
- Integrated road shift/brake levers: the owner records the unit in Shifters and in Brake levers as they
  see fit; the app does not model integrated units specially in this feature.
- Rim-brake or quick-release bikes: disc rotor and through-axle positions simply remain not recorded; see
  Assumptions.
- A component moved between bikes keeps its weight and type, and must go into a matching position.
- Editing the frame's make, model or weight changes bike details only; it never creates usage history.

## Requirements *(mandatory)*

### Functional Requirements

**Component details**

- **FR-001**: Every component MUST have a type, make, model and a weight field; weight is recorded in
  grams as a positive whole number. Weight is optional: it may be left unknown when a component is
  recorded and filled in later without affecting the component's history.
- **FR-002**: Every component MUST belong to exactly one group — Build, Groupset or Wheels — determined by
  its type (the owner chooses the type, the group follows from it).
- **FR-003**: The system MUST support these component types and positions:
  - Build: fork; bottom bracket; handlebar; handlebar tape; saddle; seatpost; pedals; through-axle
    (front and rear positions).
  - Groupset: front derailleur; rear derailleur; shifters; cassette; chain; brake (front and rear
    positions); brake lever (front and rear positions); crankset.
  - Wheels: rim (front and rear positions); tyre (front and rear positions); disc rotor (front and rear
    positions); inner tube (front and rear positions).
- **FR-004**: The system MUST reject fitting a component into a position that does not match its type
  (for example a saddle in the handlebar position). Front/rear variants of a type MUST be accepted in
  either matching position.
- **FR-005**: Weight MUST be rejected if zero, negative, non-numeric or greater than 20,000 g.

**Positions and history**

- **FR-006**: Each bike MUST show all positions in FR-003 grouped by Build, Groupset and Wheels, with each
  position's state: fitted (with the component), not recorded, or none fitted / not applicable.
- **FR-007**: Fitting, replacing, moving and removing components MUST work for every position with the
  same dated-history rules that already apply to chain, cassette and tyres: half-open installation
  periods, no overlap in a position, a component in only one place at a time, and replacement creating a
  new component identity while the old one keeps its history and usage. A removed or replaced component
  MUST remain available to fit again, on the same or another bike.
- **FR-008**: Rides MUST allocate usage to every component fitted at the ride's start time, in every
  position.
- **FR-009**: The owner MUST be able to mark the front derailleur position as "none fitted" from a date;
  during that period the position receives no usage and is not shown as missing history.
- **FR-010**: The owner MUST be able to record, per wheel (front, rear), whether it is set up tubeless,
  effective from a date, with the change kept in history. Front and rear may differ.
- **FR-011**: While a wheel is tubeless, its inner tube position MUST be not applicable: fitting an inner
  tube there for an overlapping period MUST be rejected, and switching a wheel to tubeless MUST end any
  inner tube installation at the switch date.
- **FR-012**: For any component type with front and rear positions, the owner MUST be able to fit the same
  make, model and weight to front and rear in one action (offered by default for brakes, brake levers and
  disc rotors), which creates two independent components; either can
  later be replaced on its own. The action MUST succeed or fail as a whole.

**Frame**

- **FR-013**: The frame MUST NOT be a replaceable component. The bike's details MUST allow recording frame
  make, model and weight (all optional); editing them MUST NOT create or alter usage history.
  The bike's existing make and model are treated as the frame's make and model.

**Weights**

- **FR-014**: The bike view MUST show a weight subtotal per group and for the whole bike (frame plus
  currently fitted components), and MUST state how many fitted parts (and whether the frame) lack a
  recorded weight.

**Existing data and access**

- **FR-015**: Existing chains, cassettes and tyres and their installations, rides and usage MUST be carried
  over unchanged, assigned to their groups, with weight not recorded.
- **FR-016**: All new data (components, weights, position states, tubeless setup) MUST be visible to and
  changeable by only its owner, as for existing records.
- **FR-017**: Usage totals for every position MUST be rebuildable from rides and installation history, and
  give the same result before and after a rebuild.

### Key Entities

- **Component**: An individual physical part owned by a user. Type, group (derived from type), make,
  model, weight in grams (may be unrecorded), starting usage estimate, lifetime usage. Not tied to a
  bike: it is linked to bikes only through its installations, and may currently be unfitted.
- **Component group**: Build, Groupset or Wheels. A fixed classification used for display and weight
  subtotals.
- **Position**: A place on a bike where one component of a matching type can be fitted at a time (for
  example rear brake, front rim, handlebar tape).
- **Installation**: A component fitted in a position on a bike for a dated period; unchanged in meaning.
- **Intentionally empty period**: A dated declaration that a position on a bike is empty on purpose.
  There are two reasons. *None fitted* applies to the front derailleur. *Tubeless* applies to a wheel's
  inner tube position, front or rear. A wheel's tubeless history is the list of its tubeless periods.
- **Bike (frame)**: The bike identity, now including optional frame make, model and weight. Changing the
  frame means creating a new bike.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An owner can record all 27 positions on a typical road or gravel bike (a matching front/rear
  pair entered in one step) in under 15 minutes.
- **SC-002**: For a bike with components in every group, a logged ride's distance appears on 100% of the
  components fitted at the ride's start, and on no component outside its installation period.
- **SC-003**: After release, 100% of pre-existing component usage totals are identical to their values
  before release.
- **SC-004**: Replacing any single part leaves the usage and history of every other part on the bike
  unchanged, verified for at least one position in each group.
- **SC-005**: Group and bike weight subtotals equal the sum of the recorded weights of currently fitted
  parts in every tested case, and always disclose missing weights.
- **SC-006**: No position marked "none fitted" or "not applicable" is ever shown as missing installation
  history.

## Assumptions

- Positions are a fixed list defined by the app; owners cannot add custom positions in this feature.
- Pairs that are normally bought as a set (pedals, shifters, handlebar tape, crankset) are tracked as a
  single component and position.
- Inner tubes are tracked per wheel (front and rear) even though the description lists "inner tube" once,
  because front and rear tubes are replaced independently.
- Only the front derailleur and inner tubes can be declared intentionally empty. Other positions that do
  not exist on some bikes (disc rotors on rim-brake bikes, through-axles on quick-release bikes) simply
  remain not recorded; adding "none fitted" for them is a small later extension.
- Not recording a position is allowed: the owner is not forced to fill every position before logging
  rides. Unrecorded periods show as allocation gaps, as the constitution requires.
- Weight is displayed in grams for components and in kilograms (to two decimals) for group and bike
  totals.
- Hubs, spokes, cables, housing, brake pads, sealant, bar-end plugs and other small parts are out of scope.
- Wheelset assemblies (moving a whole wheel with its rim, tyre, rotor and tube together) remain a later
  milestone per `PROJECT_PLAN.md`; in this feature each part is fitted and moved individually.
- Existing reminders (chain lubrication) are unchanged; reminders for new component types are out of scope.
- Web is the target client for this feature; mobile follows after the web UI, per the project's ordering.
