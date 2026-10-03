# Local connected web workflows

This milestone connects the approved [v1 preview](ui-design/versions/v1/README.md) to the existing API and PostgreSQL. Use synthetic records only. Authentication, React Native, physical-device testing and remote deployment remain future work. The original draft and approved archive remain immutable; the browser suite verifies the manifest SHA-256 hashes before comparing them.

## Start and stop

Requires Node 24, .NET SDK 10.0.401, Python 3, Docker Desktop and the existing dedicated local PostgreSQL container. Use the pinned SDK through `BIKELOG_DOTNET` if `dotnet` is not on PATH. From the repository root:

```sh
cp .env.example .env  # only when no .env already exists
chmod 600 .env
# Set a local, shell-safe POSTGRES_PASSWORD without publishing it.
BIKELOG_DOTNET=/usr/local/share/dotnet/dotnet ./scripts/dev.sh db-up
BIKELOG_DOTNET=/usr/local/share/dotnet/dotnet ./scripts/dev.sh migrate
BIKELOG_DOTNET=/usr/local/share/dotnet/dotnet ./scripts/dev.sh rebuild-usage
BIKELOG_DOTNET=/usr/local/share/dotnet/dotnet ./scripts/dev.sh run
```

In a second terminal, select Node 24 using your normal version manager, then:

```sh
npm ci
npm run api:check
npm run web:dev
```

If using the milestone's ignored local Node installation, set `export PATH="$PWD/.local/tooling/node_modules/node/bin:$PATH"` before every npm invocation. Web: `http://127.0.0.1:3000`; API: `http://127.0.0.1:5080`; PostgreSQL: loopback port 54329. Requests use same-origin `/api` and a fixed server-side loopback adapter; production hosting and alternate upstream URLs are outside this milestone. Stop your own API/web terminal processes with Ctrl-C. `scripts/dev.sh db-down` preserves the named volume. Never reset an existing database to run web checks.

Migrations and owner-atomic usage rebuilds are explicit. Stop writers while migrating/rebuilding, preserve the named volume, and rebuild usage after upgrades before resuming writes. See [backend workflows](backend-workflows.md). No automatic migration occurs at API or web startup.

For a built-server smoke:

```sh
npm run web:build
npm run web:start
```

## Authoritative workflows and recovery

Create two bikes and use the garage buttons/URL selection. A blank bike name uses make and model; legacy missing metadata is explicit. The four sections remain Overview, Components, Rides and Maintenance. Deep links use `?bike=<uuid>&view=<section>`; reload reads the API. Browser Back/Forward retain both history branches. Dirty forms offer Keep editing or Discard changes; clean navigation closes an editor. Saving temporarily locks navigation.

Fit the chain, cassette, front tyre and rear tyre using the entered date. Create-and-fit uses two operations: if fitting fails, the created component is retained and only fitting is retried. Owner-wide component discovery can find retained unused parts. Replacement is one atomic backend operation; previous identity/usage/history remain inspectable through All installations and the old passport. Estimates are displayed separately from calculated usage.

A 65 km ride gives 65000 recorded metres to each fitted position. A rear-tyre starting estimate of 120 km gives a combined lifetime of 185000 metres. Replacing it then recording 10 km gives old rear 65000, new rear 10000 and other parts 75000 calculated metres. Maintenance creates service history without resetting lifetime. Blank EUR cost means null/unknown; zero means known zero EUR. Unknown duration remains null, rather than zero.

Reminder settings have independent oil/wax thresholds. For 160000 metres since baseline, oil 150 km is due; wax 300 km has 140000 remaining, then wax 200 km has 40000 remaining. Switching method changes neither baseline nor component lifetime. Log lubrication to create actual keyed maintenance and establish a new baseline. Disabled/no-chain/unavailable states stay explicit.

Forms use browser-local time (the browser suites use Europe/Helsinki). Invalid DST gaps are rejected and overlapping times require an offset choice. An untouched existing timestamp preserves its original exact instant, including seconds and sub-minute precision. Allocation uses half-open installation intervals `[start,end)`.

Client distances accept up to three decimal kilometres, costs up to two decimal EUR places and duration only values convertible to whole seconds. The shared client rejects unsafe integers beyond `Number.MAX_SAFE_INTEGER` (9007199254740991), non-exact monetary cents and unsupported numeric representations instead of silently rounding or reposting them. Backend int64/decimal ranges are wider; this first-client limit is deliberate.

Mutations never retry automatically. Validation/not-found responses preserve fields. A stale-version conflict loads current data separately and requires explicit reapply. A server failure or lost response says the outcome is uncertain: refresh/check current records or history before explicitly resubmitting. A successful write may already exist even if its response was lost; creating again can duplicate records. Refresh is read-only and is not proof that a write did not occur.

Bikes/rides/installations/components/passport maintenance use opaque cursors and Load more controls. Overview totals come from the complete backend snapshot, never sums of visible pages. Bike maintenance is currently unpaged: large histories can be slow and this remains an API scalability limitation.

## Browser verification and lifecycle

```sh
# Install only the required local browser engines.
./node_modules/.bin/playwright install chromium webkit
npm run web:e2e -- --project=visual-desktop
npm run web:e2e -- --project=visual-tablet
npm run web:e2e -- --project=visual-mobile
./scripts/web-e2e.sh
# Optional acceptance checks share only this invocation's owned API/web:
BIKELOG_E2E_ACCEPTANCE=1 ./scripts/web-e2e.sh
# Test real built Next server after web:build:
BIKELOG_E2E_WEB_MODE=start ./scripts/web-e2e.sh --grep 'separate 160km'
```

Visual projects run at 1440×1000, 768×1024 and 390×844. They serve immutable archive bytes through test routing and deterministic API responses for the connected side, capturing all four views on both sides. Sidebar/topbar bounds, main padding, heading fonts/copy, overview column geometry, page width, table-only horizontal overflow, reminder visibility, actual dialog Tab/Shift-Tab/Escape/return focus and repeated validation focus have assertions. A literal `<script>` note must render as text. Paired geometry JSON and PNGs are retained; there is no blindly updated pixel golden. Human review of the paired screenshots is still required.

Intentional connected additions: Create bike/full metadata controls; fit controls and retained owner-wide discovery; exact current/all installation chapters; starting estimate editor; ride correction/deletion/refresh/paging; explicit duration/currency/unknown values; keyed and historical maintenance association; independent oil/wax method controls; conflict/uncertain recovery; missing-data/read-error states; local synthetic labeling. Reminder cards remain visible when stacked below 950 px, although the archived prototype hides them there. The approved tokens, bike SVG, 1150/950/650 px layout breakpoints and four-section navigation remain the visual foundation. Deterministic connected data includes security and unknown-value cases; row contents/counts can differ from archive demo data and those differences are recorded rather than asserted as pixel identity.

The lifecycle wrapper refuses occupied 3000/5080 ports before starting anything, targets only fixed loopback URLs, starts dedicated API/web process groups, waits for responses, checks OpenAPI drift, and cleans up only its own process groups on exit. It does not start/stop PostgreSQL, clear records, delete databases or remove volumes. Each live run uses a unique `web-e2e-*` marker and retains its synthetic records. Browser discovery traverses the rendered garage and installation pages after opening a fresh browser context; no localStorage store or posted fixture ID substitutes for discovery.

Live projects exercise Chromium and WebKit through the real Next adapter/API/PostgreSQL. Error tests inject 400/404/stale 409/500/503 at the same-origin adapter response boundary. The dropped-success case lets the real write complete, then drops its response, checks retained input/history and verifies exactly one persisted write without automatic duplicate submission.

Evidence is retained under ignored `.local/evidence/task9/`: command logs, timestamped browser results (all paired PNGs/geometry attachments and failed traces), HTML report, dependency audit and browser versions. Exact final counts and commands are recorded in `.superpowers/sdd/2026-10-02-web-ui/task-9-report.md`. These are headless responsive-browser checks, not physical iOS/Android device or user authentication proof. No production deployment or personal records were used.

## Dependency audit caveat

The clean install reports five high-severity entries stemming from one development-only advisory, [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm): deeply nested glob patterns can exhaust the braces parser stack. The path is `eslint-config-next → @next/eslint-plugin-next → fast-glob → micromatch → braces`. These packages are used by lint tooling; browser/API inputs do not reach that parser. Registry latest `braces` was 3.0.3 at verification, with no compatible fixed version. npm proposes downgrading `eslint-config-next` from 16.3.8 to incompatible 14.2.35. The controller approved retaining the compatible pinned lint toolchain and recording the caveat; no automatic force fix or major downgrade was applied. Saved audit/tree/version outputs support final review. Recheck for a patched compatible release before processing untrusted lint configuration.
