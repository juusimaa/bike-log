# UI draft backend support — next milestone design

Date: 2026-10-02
Status: Design approved by the owner on 2026-10-02; implementation plan review remains required.
Baseline: `14061ee` and the approved overall bicycle-maintenance design.

## Intent and success

Extend the validated chain foundation so a future client can persist and reload
every domain flow shown in `docs/ui-design`: multiple bikes, named rides, fitted
and replaced parts, component passports, maintenance costs, starting estimates,
and chain-lubrication reminders. This milestone produces backend capabilities and
HTTP evidence. Building or connecting a UI is a separate milestone.

The request is to cover the gaps identified in the backend-versus-draft review.
The owner approved the detailed semantics below on 2026-10-02, including the
requested oil/wax choice and separate editable reminder distances.

Keep the modular synchronous ASP.NET Core API, Docker PostgreSQL, owner-scoped
queries, per-owner mutation lock, transactional recalculation, integer metres,
optional integer seconds, UTC instants and half-open installation intervals.
Continue using synthetic records and the existing loopback development guard.

## Approach and boundaries

Recommended: one backend milestone with ordered, independently testable work
packages. Discovery and identity changes come first, then multiple component
positions, complete replacement, estimates, reminders and end-to-end acceptance.
This covers the draft while preserving the current architecture.

Alternatives considered:

- Split discovery/identity and component/reminder support into separate delivery
  milestones. This gives a smaller first delivery, but leaves the draft partly
  unsupported and requires another design/acceptance cycle.
- Build the client alongside the backend. This gives earlier visual integration
  feedback, but expands the requested backend scope and couples API decisions to
  unfinished client work.

Authentication, web/native implementation, cloud deployment, Strava, offline
queues, attachments, worker/outbox, notifications, wheelset assemblies and
trainer configuration remain later work. Individual component moves remain a
requirement of the overall personal release, but a dedicated move command is
outside this draft-support milestone. Existing dated installation history must
continue to preserve component identity across separate installations.

## Garage, identities and collection reads

Add owner-scoped collection reads for bikes, bike rides, bike installations and
components, including previously fitted components. Add component maintenance
history across all of its owner's bikes, so passports do not depend on filtering
only the selected bike's maintenance. Unknown and other-owner parents return 404.

Proposed routes: `GET /api/bikes`, `GET /api/bikes/{id}/rides`,
`GET /api/bikes/{id}/installations`, `GET /api/components`, and
`GET /api/components/{id}/maintenance`. Bike installations support current/all
filtering and include enough component identity to render the component table.
Current means `startUtc <= now < endUtc`, with no upper bound when end is absent;
an open future installation is not currently fitted.

Collection responses use opaque cursors, default page size 50 and maximum 200.
Sort bikes/components by ID, rides by descending start/ID, maintenance by
descending performed time/ID, and installations by descending start/ID.
Invalid cursors or page sizes return 400. Pagination is deterministic for an
unchanged dataset; concurrent edits require refresh and do not promise a snapshot
across multiple HTTP requests.

Add a bike overview read for complete ride count and recorded distance, current
component usage, recent activity and maintenance spending grouped by currency.
Calculate it within one database read snapshot rather than summing only a page.
Do not convert or sum different currencies together. An omitted maintenance cost
remains unknown, distinct from an explicitly entered zero cost.

Bike fields: optional custom `name`, make, model, bike kind, year and optional
display colour. Display name is the custom name when nonblank, otherwise make +
model. Proposed bike kinds are gravel, road, mountain, hybrid and other. Year is
an integer from 1900 through 9999; colour, when present, is a six-digit hex value.
Make/model/name have a maximum of 100 characters after trimming.

Use a versioned bike edit contract. A name may be cleared only when make and model
are populated. Preserve existing bikes and their names during migration; legacy
metadata may remain absent until edited. New bikes require make and model.
Return the resolved display name separately from the optional custom name.

Add optional ride `name` to create/correct/read/list contracts, maximum 100
characters after trimming. Existing unnamed rides remain readable; clients may
show a date-based label. A supplied blank name normalizes to absent. The draft
can still require a name in its form without making old records invalid.

## Multiple individual components

Support component types chain, cassette and tyre; installation positions chain,
cassette, front tyre and rear tyre. The serialized position spelling follows the
draft: `chain`, `cassette`, `front-tyre`, `rear-tyre`.

Enforce type/position compatibility. A tyre can occupy either tyre position.
A component cannot overlap itself on any bike or position. Installations cannot
overlap at the same bike position; different positions may overlap.

Allocate a whole ride to every component fitted at its start. Preserve separate
lifetime and installation totals and duration-completeness flags. A missing
installation at one position must not suppress allocation to other fitted parts.
Return allocation gaps by ride and position, scoped to these four supported
positions. Preserve the existing chain-gap field for compatibility.

Return all current components from bike usage, with explicit position and IDs;
keep the current-chain field available for existing consumers. Historical edits
and replacement rebuild every affected component's usage atomically. Replacement
creates a new identity; the old component and its history remain queryable.

## Complete replacement action

Keep the existing installation replacement endpoint for callers that already
have a new component ID. Add a composite replacement command for the draft form:
installation ID, expected installation version, new model, replacement instant,
and optional cost/currency. Infer type and position from the replaced part.

In one transaction: validate ownership/version/interval and maintenance history;
create the new component; close the old installation; open the new installation;
record replacement maintenance on the new component; rebuild usage; commit.
Return the new component, both installations and maintenance record. Maintenance
at the exact replacement instant belongs to the new component. The new estimate
starts at zero. No cost requires both cost and currency to be absent; otherwise
retain the existing paired decimal/currency validation.

Reject a stale retry without creating another component or maintenance record.
Any validation, persistence or calculation failure rolls back the entire action.
General create-operation deduplication remains deferred; this command's expected
installation version prevents repeating a successful replacement on the old ID.

## Starting usage estimates

Persist a nonnegative integer initial estimate in metres on each component,
default zero, editable with the component's expected version. It represents usage
before the application's recorded history and follows the component identity.

Expose calculated lifetime, initial estimate and combined lifetime separately.
Never add the estimate to installation mileage, recorded bike distance, or
distance since service. Combined-total overflow must return a sanitized error
and leave the edit uncommitted. Changing an estimate does not rewrite ride or
maintenance history and cannot reset calculated lifetime usage.

## Chain-lubrication reminders

Use one distance-based chain-lubrication rule per bike: enabled state, selected
lubrication method (`oil` or `wax`), and separate oil and wax thresholds in metres,
editable with its expected version. The selected method describes the current
chain's lubrication setup and selects the threshold used to evaluate its reminder.
Both thresholds persist independently, so switching methods never overwrites the
other method's chosen interval. The future client must expose method selection
and editing of each method's reminder distance.

New rules default to disabled until configured. Enabling requires an explicitly
selected method and both user-defined thresholds; there is no recommended or
universal oil/wax interval. Draft fixtures may explicitly configure oil thresholds
of 150,000 m and 200,000 m, with separate synthetic wax intervals. Both thresholds
range from 1,000 to 10,000,000 m. Unknown methods are rejected.

Changing the method or either threshold re-evaluates the reminder immediately
without changing the lubrication baseline or lifetime usage. A method change is
a configuration edit, not evidence that lubrication was performed; actual service
is recorded through maintenance. The reminder distance is determined by the
configured method rather than inferred from free-text notes.

Introduce stable maintenance task keys, initially `chain-lubrication`, while
retaining the user-facing task text and generic maintenance tasks. Recognize the
existing exact legacy task `Lubricate chain` during migration. The keyed task
requires a chain association valid at its performed time. General inspection or
drivetrain cleaning does not reset the lubrication baseline.

For a reminder evaluated at server time, find the current chain installation and
the latest lubrication on that bike/component within this installation and no
later than evaluation time. The baseline is that service instant, or the current
installation start if no such service exists. Sum rides assigned to the current
installation whose start is at or after the baseline and no later than evaluation
time. Equality includes the ride. Future synthetic records do not make a reminder
due early. Replacement starts a fresh baseline; the bike's selected method and
both thresholds persist and can be changed for the replacement chain.

Return rule/version, evaluation time, component/installation IDs, baseline kind
and instant, distance since baseline, selected method, both configured thresholds,
the active threshold, remaining metres and due state. Due means distance >= active
threshold; remaining distance is clamped at zero. Distinguish
disabled and no-current-chain states, rather than returning misleading zero-use
success. The backend owns these calculations. Service, ride corrections/deletion,
installation corrections and rule edits are reflected on the next snapshot read.
Estimates never contribute to reminder distance or reset lifetime mileage.

## API, persistence and compatibility

Keep existing owner checks, sanitized ProblemDetails and stale-version behavior.
Add expected versions to bike, component-estimate and reminder mutations. Keep
the existing timestamp precision rules and missing-duration semantics.

Use additive migrations preserving current identities, history, names and usage.
Rebuild expanded projections explicitly as part of the migration/upgrade workflow;
do not silently migrate at startup or clear the development database. Verify
upgrade from the current schema with existing synthetic records. After applying
the new schema, rollback is to compatible application code; do not assume that
old code understands newly introduced component types or nullable custom names.

Document every route, field, unit, pagination rule, success status and error in
OpenAPI and backend workflow documentation. Correct the existing ride DELETE 204
metadata before using OpenAPI to generate clients. Preserve old route meanings;
document the tightened new-bike metadata requirement as a contract change.

## Delivery packages and acceptance

1. Discovery reads, bike overview, bike metadata/name editing and ride names.
2. Multi-position installation validation, allocation, usage and history.
3. Composite replacement including component identity and maintenance/cost.
4. Separate persisted estimates and versioned estimate edits.
5. Persisted oil/wax reminder settings, stable task keys and backend due calculations.
6. Migration upgrade checks, OpenAPI/workflow updates and HTTP acceptance.

Each package includes focused domain tests where rules exist and actual
PostgreSQL/API integration tests for reads, writes, owner isolation and rollback.
The detailed file-level implementation plan follows approval of this design.

Acceptance must prove:

- Recreate the two-bike draft fixture entirely through the API, then rediscover
  it through collection reads without fixture IDs or client memory.
- Rename a bike, clear its custom name to make/model fallback, and round-trip
  named rides, absent durations, maintenance notes and optional EUR costs.
- Fit chain, cassette and both tyres. A 65,000 m ride increments all four;
  replacing only the rear tyre makes the following 10,000 m accrue to its new
  identity while the other three components retain both rides.
- The exact replacement boundary allocates to the new component; one microsecond
  earlier allocates to the old one. Old passports retain installation/service
  history and are discoverable after replacement.
- A 120,000 m tyre estimate plus 65,000 m recorded usage returns 185,000 m combined
  lifetime, 65,000 m calculated lifetime and 65,000 m installation usage.
- With oil selected and a 150,000 m threshold, 149,000 m is not due and another 1,000 m
  makes it due. Lubrication changes the baseline without resetting lifetime.
  Backdated service, ride corrections, replacement and future records obey the
  defined baseline rules.
- Configure oil at 150,000 m and wax at 300,000 m. At 160,000 m since lubrication,
  oil is due; selecting wax returns not due with 140,000 m remaining and the same
  baseline/lifetime. These are synthetic test intervals, not service advice.
  Editing wax to 200,000 m returns 40,000 m remaining without changing oil's
  150,000 m interval. Switching back to oil restores its due state. Threshold
  equality, stale edits, invalid methods and invalid distances are tested.
- A missing chain installation returns a chain gap while fitted tyres still
  accrue usage. Historical overlap and maintenance-history conflicts are rejected.
- Failed composite replacement leaves no new component, installation, service or
  changed totals. Concurrent/stale commands cannot duplicate successful work.
- Every new route rejects other-owner access; pagination, empty collections,
  absent current parts and currency-separated spending remain explainable.
- Migrating existing foundation data preserves history and passes both the
  original regression suite and the new milestone acceptance scenarios.

## Approval record and next step

The owner explicitly stated "I approve design" on 2026-10-02 after requesting
oil/wax selection and separate editable reminder distances. This approves the
written backend-only design, including naming, replacement, estimate and reminder
semantics, and authorizes writing its implementation plan.

Write the implementation plan with the Superpowers writing-plans skill. The plan
still requires owner review and selection of an execution method before product
changes. Design approval does not authorize implementation, commits, push or PR.
