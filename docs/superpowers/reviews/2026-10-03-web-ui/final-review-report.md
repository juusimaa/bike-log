# Final whole-branch review

Reviewed 2026-10-03, baseline planning commit `5765b6a` / snapshot task-1-before through the uncommitted Task 9 package. Scope: the 100-file `task-1-whole-branch.diff`, approved design/plan, cross-task source paths, focused test assertions and retained evidence. Review was read-only except this report; no Git operations, services, dependency installation or broad test reruns. Source was read in passes (transport/contracts, recovery/forms, navigation/query ownership, components/maintenance/reminders, presentation, browser/lifecycle/dependencies). Generated schema and lockfile were checked as contracts/dependency artifacts rather than treating generated lines as hand-written logic.

## Strengths

- The local adapter pins its upstream, validates public Host and mutation Origin, forwards only documented routes/verbs and selected headers, preserves bodyless 204 and sanitizes transport failures. Development and built-server evidence exercise the actual adapter.
- Lossless JSON parsing and generated-contract validation reject unsafe values before consumer use. Exact string-to-integer unit conversion, captured resource identities, explicit stale-version reapplication and no automatic mutation retries are well separated.
- Overview totals and reminder evaluation remain server-owned. Collection cursors are keyed, mutation invalidation drops infinite pages, current/all filter revisits reset old cursors, and historical component identities survive replacement.
- Atomic replacement remains one composite call. Initial fitting correctly retains a created component after installation failure and invalidates its collection even on partial success. Maintenance reads complete installation history and keeps keyed lubrication separate from generic service.
- Real browser evidence is meaningfully distinct from mocked layout checks: retained logs show 27 visual cases, 16 live cases, 2 built-server cases, 122 web + 23 client tests, and 48 domain + 143 integration tests. Live cases verify persisted usage, replacement, costs, exact reminder baselines, correction/deletion and fresh-context discovery. I inspected final log tails and the actual browser test code; did not rerun these suites.
- Retained lifecycle evidence shows occupied-port refusal, owned-service cleanup, preserved PostgreSQL and unchanged archive hashes. Synthetic-only, native/auth/deployment and human visual-review limits are documented honestly.

## Critical

None identified.

## Important — should fix before integration

### I1. Clearing the fitting/replacement date crashes the rendered application

**File:** `apps/web/src/features/components/fit-replacement.tsx:25`.

`validOffsets(wall)` throws for an empty or incomplete wall value and is called unguarded during render. Clearing the native datetime-local control (including while editing an existing date) sets `wall=''`; this throws before either form's submit-time try/catch can run. The form and unsaved input can disappear into the Next error boundary. Both initial fitting and atomic replacement use this shared component.

**Fix:** catch invalid intermediate values in the rendered field, show an associated validation message, and keep the form mounted. Validate again on submit. Add a regression that clears the date in both flows, retains the model/cost and submits no writes.

### I2. Reopening an estimate can silently change an accepted integer

**File:** `apps/web/src/features/components/EstimateForm.tsx:31`.

The initial field uses floating-point division, `String(initialUsageEstimateMetres / 1000)`, despite accepting every safe-integer metre value. For `9007199254740991`, it displays `9007199254740.99`; saving unchanged posts `9007199254740990`, losing one metre. This was verified with a small standalone numeric probe, not a test-suite rerun. It violates the explicit no-rounding/reposting contract inside the documented supported range.

**Fix:** initialize using the existing exact `formatKilometres` helper. Add an unchanged-open/save test at the accepted range boundary and a nearby value.

### I3. Shared form and success-message classes are disconnected from the approved styles

**Files:** `apps/web/src/components/Field.tsx:25`, `apps/web/src/components/Toast.tsx:8`, `apps/web/src/app/globals.css:795`, `apps/web/src/app/globals.css:894`.

Every real field emits `form-field`, but the ported input layout, spacing, full-width controls and focus styles target `.field`. No `.form-field` styling exists. Likewise Toast emits `form-toast`, while positioning/appearance/visibility target `.toast` and `.toast.visible`. The result is default-styled controls and a success message in normal document flow after the entire workspace, potentially below the viewport, rather than the approved visible notification. Main-screen geometry tests do not cover these selectors or dialog visual fidelity.

**Fix:** connect the actual markup to styles, accounting for the new div/label/hint structure and checkbox sizing; ensure success remains visibly available and aria-live. Add desktop/mobile dialog and success-notification browser evidence rather than only main-screen captures.

### I4. Historical maintenance association truncates supported timestamp precision

**File:** `apps/web/src/features/maintenance/MaintenanceForm.tsx:87` and `:168`.

Initial selection and uncertain retry use `Date.parse`, which truncates microseconds. With a replacement boundary `2026-09-03T07:00:00.000500Z` and entered service instant `2026-09-03T07:00:00Z`, the old component is still installed, but both become the same millisecond and the picker selects the new component. Backend validation should reject the mismatched association, leaving a valid service entry unsavable through the picker. The same lossy comparison can reject or accept the wrong retry association. A standalone probe confirmed equal millisecond values for those distinct instants.

**Fix:** compare full-precision `Temporal.Instant`s for both initial and retry half-open boundaries. Test a boundary between two instants in the same millisecond, plus exact start/end equality. Use the same precise ordering when presenting service chronology where appropriate.

### I5. Initial fitting accepts model edits that it silently ignores

**File:** `apps/web/src/features/components/FitComponentForm.tsx:217` (creation only uses model at `:128`).

The Model field remains editable when an existing component is selected and after a new component has already been created but fitting failed. Retry uses only the retained ID/date; the newly edited model is never submitted. The form can report success while persisting a different model from the one the user sees. This is especially confusing in the explicitly promised partial-success recovery flow.

**Fix:** show the selected/retained component's authoritative model and ID as read-only once identity is fixed; only date/offset should remain editable for fitting. Clearly label the partial state “Part created; fitting incomplete.” Test create-success/fit-failure, editing the remaining date, and retry without a second create or misleading model change.

## Minor — explicit triage required

### M1. Ride-name and positive-duration input constraints are missing

**Files:** `apps/web/src/features/rides/RideForm.tsx:104`, `apps/web/src/features/rides/RideFields.tsx:56`, `apps/web/src/lib/units.ts:38`.

Ride names have neither maxLength nor trimmed <=100 validation. `parseMinutes('0')` accepts zero, and its unit test explicitly expects zero, contrary to the approved positive-seconds rule. The backend rejects invalid records, so this is not a persisted corruption finding, but users unnecessarily reach a server error and the client contract/test is wrong.

**Fix:** validate optional trimmed name <=100; reject nonblank zero duration while preserving blank=null and untouched existing seconds. Add 100/101-name and zero/blank-duration cases.

### M2. Date display does not follow en-GB and several forms hide the timezone

**Files:** `apps/web/src/features/overview/Activity.tsx:31`, `apps/web/src/features/maintenance/Maintenance.tsx:42`, `apps/web/src/features/components/fit-replacement.tsx:35`, `apps/web/src/features/maintenance/MaintenanceForm.tsx:258`, `apps/web/src/lib/dates.ts:70`.

Activity/maintenance call `toLocaleString()` without an explicit locale; rides/passports render the ISO-shaped input formatter. The approved display convention is en-GB, independently of browser-local timezone. Fitting/replacement/maintenance date fields also omit the selected zone and single valid offset; ride fields show the zone but only show offsets for overlaps. This makes entered/displayed local times less explainable and produces inconsistent dates on en-US browsers.

**Fix:** separate en-GB display formatting from datetime-local input formatting and always display the runtime zone/current valid offset near time fields. Keep full original instants in recovery details.

### M3. Repeated identical validation still fails to refocus in estimate/replacement

**Files:** `apps/web/src/components/FormError.tsx:6`, `apps/web/src/features/components/EstimateForm.tsx:69`, `apps/web/src/features/components/ReplacementForm.tsx:103`.

FormError focuses only when the joined message changes. These two callers lack the attempt key added to Bike/Ride/Fit/Maintenance/Reminder. Clearing and restoring the same error inside one batched submit leaves the same dependency; a second identical invalid submit leaves focus on the submit button. Task 9 proves only Bike/Fit repeat focus, so it does not close the original all-form concern.

**Fix:** give every validation attempt a consistent focus identity (including any repeated recovery validation) and cover estimate/replacement. Async errors that actually transition through an empty message do not need an artificial remount merely for style consistency.

### M4. Wire date validation accepts non-instants and normalized invalid dates

**File:** `packages/api-client/src/client.ts:79`.

The regex plus Date.parse accepts offsetless values and dates such as February 30 that Date normalizes. Some consumers later call Temporal.Instant.from and throw; others display a silently changed date. The fixed current backend emits valid timestamps, so this is a contract-hardening defect rather than an observed ordinary backend failure.

**Fix:** require explicit RFC3339 offset/Z and strictly valid calendar fields, retaining fractional precision. Test invalid date, missing offset, valid positive/negative offsets and nullable date fields. This closes the Task 1 deferred minor.

### M5. Late-response browser proof has a timing hole

**File:** `apps/web/e2e/visual.spec.ts:308`.

After releasing the old response, the test waits 100 ms and asserts existing B output. It can pass before the released handler/response has settled, so the statement “after late A” is not deterministic. Query-key isolation is sound on inspection and the unit test uses distinct totals; this is an evidence-quality finding, not evidence of a currently observed cross-bike bug.

**Fix:** await completion/settlement of the released response, including the valid cancelled-request case, then flush the relevant render and assert B's distinct values.

### M6. Production forms rarely associate their validation errors with fields

**Files:** `apps/web/src/components/Field.tsx:15`, `apps/web/src/features/bikes/BikeForm.tsx:231`, `apps/web/src/features/rides/RideFields.tsx:29` and analogous quantity fields.

Field supports aria-invalid/aria-describedby, but most production forms keep only a string-array summary and never pass per-field errors. The unit test proves the helper's capability, not its integration. Only maintenance date currently supplies an error. Summary focus helps, but a screen-reader user returning to an invalid make/distance/estimate/cost control is not told that control is invalid.

**Fix:** retain field-keyed validation alongside the summary and connect errors to their controls. Verify a representative required text, quantity and date field through actual forms.

### M7. Passport durations and recovery quantities lack unit labels

**Files:** `apps/web/src/features/components/ComponentPassport.tsx:116`, `apps/web/src/features/components/ComponentPassport.tsx:155`, `apps/web/src/features/rides/RideSummary.tsx:17`.

`formatMinutes(90)` returns `1.5`. Passport paragraphs therefore show “Recorded duration: 1.5” and recovery shows bare distance/duration numbers; there is no table header to supply units. Non-terminating fractions happen to include min/sec, making formatting inconsistent. Null duration is “Unknown” rather than the specified “Not recorded,” though its meaning is clear.

**Fix:** add explicit km and minutes/seconds units in prose summaries, preserve null versus zero and incomplete-duration wording, and keep input-only numeric formatting separate.

### M8. Tool color warnings remain evidence noise

**File:** `scripts/web-e2e.sh:3` / inherited process environment; retained Task 9 browser logs.

NO_COLOR/FORCE_COLOR conflicts produce tool warnings. They do not affect product behavior or invalidate passing assertions. Normalize only the wrapper's own logging environment if cleaning them up; this is optional and should not trigger another broad suite run by itself.

## Deferred-minor and ruling reconciliation

- Task 1 int32 numeric strings: fixed in validator and covered by client regression cases. Date strictness remains M4.
- Task 2 browser-local policy: resolved; default helpers consistently use the resolved runtime zone, with Helsinki/New York deterministic tests. Excess trailing-zero decimal precision is now rejected. Remaining focus integration is M3/M6.
- Task 3 distinct late totals: present in unit/browser fixtures; deterministic browser settlement remains M5. Back/Forward uses restoration traversal rather than pushing, and Task 9 exercises Keep editing/discard/forward. Nullable model and implementation-language overview copy were corrected in the overview/collection. Passport title still uses a nullable model directly; include “Model not provided” there when polishing labels.
- Task 4 pristine editor on clean traversal: corrected by onExitAccepted in the clean popstate path and actual browser coverage.
- Task 5 precise ride recovery time: corrected with explicit raw startUtc, even for named rides. Units are still M7.
- Task 6 current/all stale cursor: corrected by cancel/reset before changing observer; tests cover returning to all and late pages. Estimate recovery km labels are corrected. New estimate initialization precision issue is I2.
- Task 7 created-component collection invalidation: corrected immediately after successful create; retry preserves identity. Model presentation remains I5.
- Task 8 independent intervals, disabled/no-chain handling, taskKey and complete history: implemented. Precision of history comparisons is I4.
- Task 9 geometry, responsive containment, React key correction, statistics, real persisted workflows and lifecycle evidence are present. Missing dialog/success styling is I3. Color warning is M8.
- Owner visual/additive-controls approval remains an explicit handoff decision, not inferred from green geometry assertions or screenshot generation.
- No backend domain/migration change or implementation integration authorization was found in this package.

## Dependency-advisory ruling

The retained `npm-audit.json` contains five high entries propagating one advisory, GHSA-vfj7-8cjw-p6xm. `audit-tree.log`, package manifests and lockfile entries agree: eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces 3.0.3. All those lockfile packages are dev dependencies. The installed plugin's `get-root-dirs.js` invokes fast-glob for lint `settings.next.rootDir`; the checked-in ESLint config does not accept web/API input as such a pattern. This verifies a reachable lint-configuration/process-exhaustion risk, not a browser/API runtime route. Retained registry output lists 3.0.3 as latest with no compatible fix in that snapshot; audit's offered 14.2.35 is a major eslint-config-next downgrade.

I agree that this documented local-tooling exposure is not an integration blocker for the approved local-synthetic milestone. This is a reasoned classification, not an automatic waiver or claim that the advisory has been fixed. A later dependency refresh must recheck the current registry/advisory; I did not perform a new network audit.

## Declined to judge — executor must adjudicate each line

- Human approval of changed/additive visual controls: cannot substitute a code review or geometry assertions for the owner's explicitly required visual decision; retained paired screenshots are the handoff artifact.
- Physical iOS/Android/Safari-device behavior: this milestone's evidence is responsive headless Chromium and bundled WebKit, not physical-device proof.
- Authentication, real-data privacy, remote hosting, native client, backups and offline operation: explicitly later milestones; this review does not approve those uses.
- Scaling unpaged bike maintenance or arbitrarily large complete component history: the existing API boundary is explicitly accepted/documented here; changing it would be a scoped backend decision.
- Fresh external dependency availability after the retained registry snapshot: no new network lookup in this read-only review; audit classification above is tied to the retained artifact and installed tree.
- Exact pixel equivalence to the prototype: intentional data/controls differ and the approved verification uses geometry plus human paired-image review; this does not excuse the disconnected real form selectors identified in I3.
- Browser reload/tab-close/external-site dirty-input prompts: only in-app cancellation/navigation and same-document Back/Forward are specified/tested; no beforeunload protection is implemented. Decide whether to add that expectation now or explicitly defer it.
- Complete historical proof of every task's RED-before-GREEN chronology: retained reports distinguish behavioral failures from harness failures, but this review can validate only the saved artifacts, not reconstruct unsaved prior execution.

## Assessment

**Ready to merge? With fixes.** The architecture and main persisted workflows are strong, but ordinary date editing can crash forms and approved precision/presentation/recovery behavior still has concrete gaps. Resolve I1–I5, explicitly disposition the minors and declined items, and perform focused regression/browser checks for the resulting changes before any separately authorized integration. Human visual approval remains a separate owner handoff.
