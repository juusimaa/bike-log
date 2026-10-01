# Bicycle maintenance tracker — overall design

Date: 2026-10-01
Status: Written specification approved by the owner on 2026-10-01.
Working name: BikeCare; final name remains a later choice.

## Intent and success

Build a bicycle maintenance tracker the owner can use for real riding, while demonstrating .NET, React/Next.js, React Native and Azure engineering. Usefulness guides scope; distributed processing is a deliberate later learning milestone.

Success means the owner can identify fitted parts, explain their accumulated usage, retain replacement and maintenance history, and enter rides and maintenance from both web and native mobile. Mileage must remain correct after component moves and historical corrections.

Confirmed constraints: backend first; React Native is required; local PostgreSQL runs in Docker; hosted PostgreSQL uses Neon; the first useful release tracks individual parts. Detailed UI design follows validated backend workflows.

## Architecture and boundaries

Use one repository, one modular ASP.NET Core API and one PostgreSQL database. Next.js and React Native/Expo are separate applications that consume a TypeScript client generated from OpenAPI. Clients present results and collect input; the backend owns allocation, maintenance and reminder rules.

Keep backend responsibilities distinct:

| Boundary | Responsibility | Dependencies |
| --- | --- | --- |
| Bikes/components | Bike and component identity, owner and starting estimates | Persistence, ownership checks |
| Installation history | Dated placement, moves, replacement and overlap validation | Bikes/components, persistence |
| Rides/usage | Ride records and deterministic usage calculation | Installation history, persistence |
| Maintenance/reminders | Work history, task baselines and user-defined due thresholds | Components, calculated usage |
| Infrastructure | EF Core persistence, migrations and later messaging adapters | PostgreSQL and later Azure services |

Start with synchronous calculation through a backend interface reusable by the later worker. Authoritative ride and installation history can rebuild calculated totals. The initial synchronous milestone must save relevant edits and resulting totals atomically; failed calculation must not leave apparently current but inconsistent totals.

The initial development slice uses synthetic records locally. Before real personal data or remote exposure, enforce authentication and owner checks on every resource. Use standards-based OIDC; validate the selected provider against both web and native sign-in before committing to it. Entra External ID remains a candidate, not an approved provider choice.

## Core model and behavior

Persist users, bikes, components, installations, rides, maintenance records, reminder rules and calculated usage. Add outbox and processed-event records only in the asynchronous milestone.

- A component retains its identity when moved. Replacement creates a new identity and closes the previous installation; old history remains available.
- Installations use half-open intervals `[start, end)`. A component cannot be installed in multiple places simultaneously, and mutually exclusive bike positions cannot overlap.
- A ride records bike, start timestamp, distance and optional duration. Allocate the whole ride to components fitted at its start. This is an explicit first-release simplification.
- Store distances in metres, durations in seconds and timestamps in UTC; display local time.
- Historical ride or installation edits recalculate affected usage. Missing installation history produces a visible allocation gap; do not invent component usage.
- User-entered starting usage is separate from calculated usage and labelled as estimated. Preserve lifetime and current-installation usage separately.
- Maintenance records retain task, performed time, notes and optional cost/currency, associated with a bike or component. Service does not reset lifetime usage.
- Component/task baselines support reminders such as distance since lubrication. Reminder thresholds are user-defined inspection/service prompts, not measurements of wear or guarantees of safety.
- Reject stale edits with actionable version conflicts and preserve the user's attempted input for correction in the eventual client design.

Individual chain, cassette and tyre changes are in scope. Wheelset assemblies, moving assemblies as a unit and explicit indoor equipment configurations are later work. The first release does not claim correct allocation for trainer setups using different equipment.

## Delivery boundaries

### Foundation and first backend slice

Create the backend solution, Docker PostgreSQL setup and developer commands. Use a named Docker volume; document startup, migrations and an explicitly destructive reset command. Test with synthetic data.

Prove one bike and chain: installation, a 65 km manual ride, maintenance, chain replacement and another ride. Verify that old chain history remains intact and only the new chain receives subsequent usage. Include boundary and historical-correction integration tests. Describe workflows and API contracts before detailed screen design.

### First useful personal release

Add multiple bikes, individual component moves, starting estimates, maintenance baselines, user-defined reminders and visible allocation gaps. Build Next.js and React Native clients for ride and maintenance entry and history views. Validate sign-in, strict ownership and records appearing across both clients before actual personal use. Verify native behavior on at least one selected mobile platform.

### Azure and asynchronous processing

Host web, API and a separate worker on Azure Container Apps. Use a dedicated Neon project for this application's hosted database. Select region, service tiers and a measured budget before provisioning. Bicep manages Azure infrastructure; document Neon setup separately. Use managed identities for compatible Azure services and protected secrets for Neon database credentials.

Move usage recalculation into the worker only after the core workflow is reliable. Persist each edit and its outbox event in one database transaction. Publish through Service Bus with at-least-once delivery. Use transactional consumer deduplication and source-version checks so replay or older work cannot overwrite newer totals. Rebuild from authoritative history rather than repeatedly incrementing totals.

Run the outbox publisher with scheduled, bounded polling; avoid a continuously active database polling loop. Service Bus drives recalculation execution. Select the polling interval and runtime arrangement during this milestone's design, explicitly balancing update delay against Neon compute usage.

Expose pending, completed and failed calculation state plus last successful processing time to clients. Add bounded retries, dead-letter inspection, controlled replay and correlation across API, outbox and worker. Keep credentials and sensitive record payloads out of telemetry.

### Later increments

Offline mobile entry, SQLite operation queues and explicit conflict resolution; scoped photos/receipts and cleanup; wheelset assemblies and indoor configurations; optional push notifications; eligible activity imports; export/deletion and a small private pilot.

Strava remains conditional on clarification of permitted calculation, storage and retention. Core development uses independently entered rides and synthetic fixtures. Resolve integration feasibility in its own spike before persistent implementation.

## Error handling and validation

Return actionable validation errors for overlap, invalid references and invalid ride quantities. Reject cross-user access consistently without exposing another owner's records. Surface allocation gaps, estimate labels and stale-edit conflicts in both clients.

Use focused domain tests for allocation, replacement, moves, maintenance baselines and reminders. Docker PostgreSQL integration tests verify real constraints, transactions, migrations and historical corrections. Check web/native sign-in, ownership rejection and cross-client persistence separately from builds.

During the asynchronous milestone, verify saved work survives worker downtime, duplicate delivery does not double usage, stale work cannot replace current totals, publication failure recovers, and dead-letter replay is controlled. Verify hosted behavior separately from local tests, including Neon reconnection after inactivity. Deployment rollback must remain compatible with database changes; use additive migrations and an explicit migration step.

Before relying on the hosted application for maintenance history, document backups and exercise restoration. Free-tier provider restore features alone do not constitute a tested application recovery procedure.

## Cost and unresolved choices

Neon Free is the starting hosted database plan; account eligibility, quotas, region availability and actual usage must be checked before deployment. Monitor storage, compute and network transfer. No automatic paid upgrade is authorized. Budget alerts do not cap Azure spending.

Framework versions, identity provider, first mobile platform/device, project name, Azure/Neon regions, exact cloud tiers, polling interval and budget are milestone-specific decisions. They do not block approval of this overall architecture. No cloud resources or product code are created by this specification.

## Approval record and next stage

The owner approved the balanced priority, individual-parts scope, modular synchronous API approach, core model, web/native release boundary, Docker PostgreSQL, Neon hosted PostgreSQL and final validation/recovery section in conversation on 2026-10-01.

The owner explicitly approved this written specification on 2026-10-01. Create the implementation plan for foundation and the first backend slice using the writing-plans skill. The implementation plan still requires review and selection of an execution method before implementation. Later milestones receive their own detailed design and plan before implementation.
