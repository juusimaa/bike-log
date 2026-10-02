# Approved UI v1 — connected web client design

Date: 2026-10-02
Status: Owner approved the implementation plan and its referenced technical design on 2026-10-02, selected subagent-driven execution in a worktree, and authorized committing/merging the planning artifacts first. The visual draft is approved as version 1.0.
Baseline: local `main` at `a5aad25`; approved overall architecture and completed UI-backend-support milestone.
Visual authority: `docs/ui-design/versions/v1/index.html`, `styles.css`, `app.js`, and checksum manifest.

## Intent and approval boundaries

Build the first API-connected Next.js web client using the existing approved visual direction. The owner should be able to select bikes, understand usage/history, enter rides and service, replace parts, edit estimates and configure oil/wax reminders, then reload the browser and see persisted results. The user explicitly requested an implementation plan and approved the current draft as the first visual version. This authorizes documentation and baseline archiving, not product implementation or publication.

The overall architecture already selects Next.js and a shared OpenAPI-generated TypeScript client, with React Native as a separate application. This proposal fills in web-specific decisions. The plan may be written now as requested; its technical choices and additional states must be reviewed before execution. No new assets, dependencies, services or client code are installed by this planning work.

## Approaches and chosen proposal

Recommended: Next.js App Router application in `apps/web`, a generated/shared client in `packages/api-client`, and a same-origin local API adapter. React client components own interactions and TanStack Query owns remote-data lifecycles. Retain the draft's CSS tokens, hand-authored SVG and restrained layouts rather than introducing a UI kit. This fits the approved web/native architecture and gives independently testable flows.

Alternatives: connect the existing standalone JavaScript demo directly (least initial work, but maintains a second architecture and duplicated domain calculations); build React Native simultaneously (earlier cross-client evidence, but doubles the implementation and platform review scope). Neither is selected for this web milestone.

## Visual baseline and extensions

Preserve version 1.0 unchanged in its archive. Keep warm white/paper surfaces, green actions, muted text, rounded cards, sidebar/navigation, bike selector, illustrated hero, three statistics, reminder panel, component tables, activity, dialogs and passports. Keep the draft's headings and action copy where their meaning still fits. Use local system fonts and the inline bike SVG; no font download, icon service or external image dependency.

The four sections remain Overview, Components, Rides and Maintenance. Desktop sidebar becomes the compact navigation at 650 px; content/reminder panels stack by 950 px, with the 1150 px spacing adjustment retained. Every navigation item keeps an accessible name when its visible text is hidden. Reminder controls stay available at tablet/mobile widths. Table scrolling is limited to the table region; the page must not scroll horizontally at 390 px.

Necessary extensions to approved v1: bike creation/full metadata editing, initial fitting into vacant positions, editable starting estimate, oil/wax selection and both intervals, ride correction/deletion, persistence-related loading/empty/error/conflict states. Style these with existing cards/dialogs; do not redesign the four main screens. The draft's memory Reset button stays in the prototype only. The connected client shows a truthful “Local synthetic workspace” label, no fixture reset and no fabricated signed-in avatar/identity.

## Architecture and runtime

Use Node.js 24 LTS, Next.js 16 App Router, React 19, TypeScript strict mode, npm workspaces, plain CSS/CSS modules, openapi-typescript and openapi-fetch. Use TanStack Query 5 for reads, mutations and invalidation; Vitest/Testing Library for focused tests, Playwright for browser evidence, the Temporal polyfill for explicit timezone/DST conversion, ESLint and Prettier for TypeScript/CSS. Retain CSharpier as the C# formatting authority.

Resolve exact compatible patches when executing Task 1, verify current support/security notices, use `--save-exact`, and commit `package-lock.json`. Node major is pinned to 24; exact Node patch is recorded in `.nvmrc`. The currently observed Next.js documentation reports 16.3.8, but execution must check it rather than blindly reinstall a potentially stale patch.

Browser requests use same-origin `/api/...` on `http://127.0.0.1:3000`. A Node-runtime Next route handler forwards only the documented methods/paths to the fixed `http://127.0.0.1:5080/api/...` backend, with no cache and no redirects. No browser CORS exception, backend connection string or development owner credential is introduced. Proxy mutation requests require the expected same origin; route/path validation prevents arbitrary destinations. Upstream 204 stays bodyless, backend ProblemDetails/statuses pass through, and upstream transport/redirect failures become sanitized 502 `backend_unavailable`. Development and production-build smoke commands both bind to 127.0.0.1. This is a local synthetic app, not a hosted release.

The shared client consumes a checked-in OpenAPI snapshot generated from `/openapi/v1.json`; a reproducible generation command checks schema/type drift. It exports DTO aliases and typed API methods usable later from React Native. Query hooks, browser routing and styles stay out of that package. Endpoint wrappers fetch text and decode once, avoiding premature integer rounding. Use lossless-json to detect unsafe numeric tokens before conversion to generated `number` DTOs. Distances/seconds/versions must be safe integers; monetary values must have safe integer cents. Reject unsupported magnitudes with an explicit client-range error and prohibit editing/reposting that response; never silently round it. This documented first-web-client range restriction is narrower than backend int64/decimal ranges and needs owner review. Normal bicycle-scale values are unaffected.

URL `/?bike=<uuid>&view=overview|components|rides|maintenance` is the navigation source of truth. `/` discovers bikes and chooses the first ID-sorted bike only when no valid selection is supplied. Preserve deep links and back/forward. Unknown/inaccessible IDs show a recoverable missing-bike state without silently selecting another bike. No localStorage fixture/model store; reload reads the API. UI preferences and active query caches are ephemeral.

## Data contracts and read behavior

| View/action | Existing API source | Behavior |
| --- | --- | --- |
| Garage | GET /api/bikes, POST /api/bikes, PUT /api/bikes/{id} | Paged cards; custom name or server displayName; metadata edit with expectedVersion |
| Overview | GET /api/bikes/{id}/overview | Full recorded distance/count, current usage, three recent activities, grouped spending, reminder and gaps from one server snapshot |
| Components | GET /api/bikes/{id}/installations?status=current\|all | Paged `{installation,component}` rows; deduplicate passport identities while preserving every installation chapter |
| Passport | GET /api/components/{id}, /usage, /maintenance | Owner-wide installation and paged service history across bikes, estimates/lifetime/current chapter |
| Fit missing position | POST /api/components then POST /api/installations | Compatible type/position; explicit recovery for partial success; no claim of atomicity |
| Replacement | POST /api/installations/{id}/replacement-with-service | One atomic backend action, installation expected version, optional EUR cost |
| Estimate | PUT /api/components/{id}/estimate | Full nonnegative estimate plus component expectedVersion |
| Rides | GET /api/bikes/{id}/rides; POST /api/rides; PUT/DELETE /api/rides/{id} | Paged history, names/date fallback, integer quantities, versioned correction/deletion |
| Bike service | GET /api/bikes/{id}/maintenance; POST /api/maintenance | Existing unpaged array sorted newest-first in UI; preserve unknown cost vs zero |
| Reminder | GET/PUT /api/bikes/{id}/reminder | Enabled/method/both thresholds/ruleVersion; backend due/baseline state only |

Verify actual OpenAPI parameter spellings at generation; DELETE uses its existing `expectedVersion` query parameter. No invented maintenance edit/delete route or paged bike-maintenance response. No aggregate is calculated from a fetched page. Collection pages use size 50 and opaque nextCursor; Load more appends unique IDs, never guesses totals. Scope cursors by route/bike/component/filter. Invalidation after writes clears pages/cursors before refetch. Changing bike/filter never appends old responses; late reads may populate their own keyed cache but cannot change the active view.

Component identity/model is loaded from installation envelopes or detail reads; overview remains the source for usage totals. Current and historical details distinguish calculated lifetime, estimated starting mileage, combined total and current-installation mileage. An absent duration is “Not recorded”, and incomplete accumulated duration is labelled incomplete. Gaps identify the affected position(s), not only the chain. Mixed currencies are separate totals; unknown-cost count is visible. Future rides remain recorded distance but never produce client-side reminder recalculation.

## Forms and writes

Shared field conventions: English copy, en-GB display formatting, km to integer metres with at most three fractional digits, minutes to positive integer seconds, optional duration blank -> null, local date/time converted to an explicit UTC instant, and six-digit optional hex color. Reject invalid local dates and DST-skipped wall times; ambiguous fall-back wall times require choosing a displayed UTC offset before submission. Editing an untouched timestamp preserves its original seconds/microseconds rather than rounding to the datetime-local input. Display the selected timezone/offset near the field.

Bike create/edit requires trimmed make/model <=100, kind gravel/road/mountain/hybrid/other, year 1900–9999, optional name <=100 and optional color. Legacy metadata displays “Not recorded”; an edit collects missing required fields before allowing name clearing. Use server displayName after save. New bikes can be empty; no fixture components are auto-inserted.

Ride name is optional, max100, despite the prototype's required name. Distance positive, estimate nonnegative; no scientific notation or silent rounding in quantity inputs. Optional EUR costs permit blank/null or zero and at most two decimals, with matching currency. Show other stored currencies without converting them. Generic service uses whole bike or a component installed at the entered performed time; changing the date re-evaluates available associations from complete installation history. “Lubricate chain” sends taskKey=`chain-lubrication` and the chain valid at that instant; no chain means an explanatory form error. Other tasks keep null taskKey and do not reset lubrication.

Reminder settings include Enabled, Oil/Wax, Oil interval and Wax interval in km, valid range 1–10,000 km. No universal default; enabling requires an explicit method and both intervals. Saving disabled settings preserves supplied values. Switching methods does not log service or reset usage/baseline. Render disabled, no-current-chain, ready/not-due and due states using server values. Clearly label these as distance service prompts, not wear measurements.

Initial fitting is two existing calls, so if component creation succeeds but installation fails, show “Part created; fitting incomplete” with that component ID and retry only installation. Reload can select the already-created unfitted component from GET /api/components; never recreate it automatically. Model this separate from atomic replacement. No dedicated move command or assembly workflow is added.

Disable repeat submits while pending, close/show success only after a successful response, then invalidate affected bike overview, rides, installations, bike maintenance, components and open passport/reminder queries. Read-only requests may retry once; mutations never auto-retry. A network failure after submission has an uncertain outcome: retain input, offer Refresh/check history before any explicit resubmit. Stale-version 409 retains attempted values, loads the latest record separately and requires explicit reapplication with the fresh version. Other 409 history/overlap errors stay distinct. Cancelling/switching bike with dirty input requires a discard choice; submitted writes remain associated with the originally captured bike ID.

## Accessibility and verification

Use labelled controls, associated field errors, error summary focus, aria-live success status, semantic tables and keyboard-operable navigation. Dialogs trap focus, Escape cancels when safe, and return focus to the trigger; network updates do not steal focus. Honor prefers-reduced-motion. Untrusted task/name/notes are rendered as text, never HTML.

Component tests prove conversions, state transitions, stale data, conflicts and unavailable/error paths. Browser tests prove v1 geometry/copy at 1440x1000, 768x1024 and 390x844, keyboard dialogs and all four views. Compare stable synthetic fixtures to the archived baseline; approve intentional additive controls explicitly, rather than rewriting screenshots to hide regressions. A second suite exercises actual Next -> API -> PostgreSQL persistence, replacement and oil/wax semantics, followed by reload. Mocked evidence cannot substitute for this live workflow.

## Scope, approval and references

This milestone delivers local web UI only. Real personal data, authentication/provider selection, React Native, cloud hosting, offline queues, imports, attachments, notifications, component moves/assemblies and backups are later milestones. It does not reinterpret the approved requirement for a native client in the personal release. No new backend domain semantics or migrations are planned; any discovered API gap returns for a scoped design decision.

The requested planning work is complete when approved-v1 archive/checksums and a concrete file/task implementation plan are saved. Before execution, the owner reviews this proposal and the plan, then confirms an execution method. Previous backend subagent selection is recorded as a preference, not blanket authorization to execute this new milestone. Commits/push/PR require separate authorization.

Sources checked during planning: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [route handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route), [Node release support](https://nodejs.org/en/about/previous-releases), [OpenAPI TypeScript client](https://openapi-ts.dev/openapi-fetch/), [lossless JSON](https://raw.githubusercontent.com/josdejong/lossless-json/main/README.md), [Playwright server lifecycle](https://playwright.dev/docs/test-webserver). These support the tooling proposal; local API contracts are authoritative for Bike Log behavior.

Approval update: On 2026-10-02 the owner stated “I approve plan. Commit and merge plan first. Then use subagent-driven execution (superpower skill) using worktree (superpower skill).” This supersedes the pending-review statements above: execution is authorized after local planning-artifact integration. Remote publication and implementation integration remain separate decisions.
