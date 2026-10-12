# Bike Log Constitution

## Core Principles

### I. Trustworthy, Explainable Usage

Every distance, duration and reminder the app shows MUST be reproducible from recorded history
and explainable to the owner.

- Distances MUST be stored in metres, durations in seconds and timestamps in UTC; clients convert
  only for display.
- Installation periods MUST use half-open intervals `[start, end)`. A ride is allocated by its
  start timestamp until a documented rule replaces this.
- A component MUST NOT be installed in two places at once, and mutually exclusive positions on a
  bike MUST NOT overlap.
- Missing installation history MUST produce a visible allocation gap, never guessed usage.
  Estimated starting usage MUST be labelled as an estimate.
- Replacing a component MUST create a new component identity. Servicing MUST NOT erase lifetime
  usage; lifetime usage and usage since maintenance are tracked separately.
- Usage projections MUST be rebuildable deterministically from rides and installation history.
- Reminders prompt inspection or service only. The app MUST NOT claim to measure wear or certify
  that a bike is safe.

Rationale: the app is only useful if the owner can trust and audit each mileage total.

### II. Backend-Owned Domain Rules

The ASP.NET Core API is the single authority for domain rules. The Next.js and React Native
clients MUST NOT reimplement allocation, installation or reminder logic; they MAY share API
types and input validation. User-entered records and provider-derived data MUST remain
distinguishable for correction, deletion and retention. Stale edits MUST be rejected with an
actionable conflict response rather than silently overwritten.

Rationale: web and mobile must produce identical results for the same history.

### III. Evidence-Based Verification

Behaviour changes MUST be covered by tests aimed at the rules and failure modes that make the
app trustworthy: installation boundaries, historical corrections, moves and replacements,
cross-user authorization, and, as they are introduced, duplicate delivery, replay, offline
retry and provider lifecycle events. Persistence behaviour MUST be tested against PostgreSQL in
Docker, not an in-memory substitute. A successful build is not runtime evidence: user-facing
and deployment claims MUST be backed by an exercised workflow (acceptance script, end-to-end
run or recorded proof), and failures MUST be reported as observed.

Rationale: correctness under edits, retries and failure is the project's core value and its
portfolio demonstration.

### IV. Privacy, Ownership and Synthetic Data

- Development, tests, fixtures and demos MUST use synthetic data.
- Real personal records MUST NOT be entered, and the API or web app MUST NOT be exposed
  beyond loopback, until authentication and per-owner authorization are enforced and verified
  for that environment.
- Every owned resource access MUST be checked against the authenticated owner.
- Secrets and credentials MUST NOT be committed, logged or sent to the browser; local values
  live in ignored files and shareable templates hold placeholders only.
- External provider data (e.g. Strava) MUST NOT be stored or combined beyond what the provider's
  terms permit; such integrations proceed only after their feasibility decision is recorded.

Rationale: the app handles personal riding history and third-party data under strict terms.

### V. Incremental Simplicity

Start with the simplest design that satisfies the current phase of `PROJECT_PLAN.md`: a modular
API with one PostgreSQL database and synchronous calculation until the asynchronous milestone.
A new service, queue, framework or infrastructure component MUST be justified by a concrete
scaling, reliability, ownership or learning objective recorded in the plan or a decision
record. Deferred features (marketplace, payments, social, AI recommendations, Kubernetes,
multi-region, a second mobile framework) MUST NOT be built without amending the plan.

Rationale: scope and cost stay proportional to a personal tracker and a small private pilot.

## Technology and Operational Constraints

- Stack: ASP.NET Core and EF Core on .NET (SDK pinned in `global.json`), Next.js with React and
  TypeScript, React Native with Expo, PostgreSQL (Docker locally, Neon for hosted), and Azure
  for later cloud deployment. Changing a stack element requires a decision record.
- SDKs, packages, tools and container images MUST be pinned to explicit versions.
- Database migrations MUST be explicit commands, never applied automatically at API startup, and
  hosted migrations MUST be additive and rollback-compatible.
- Destructive local operations (such as deleting the database volume) MUST require an explicit
  confirmation flag; scripts MUST NOT touch data or processes they did not create.
- No cloud resource, paid tier or subscription upgrade may be provisioned without the owner's
  explicit approval and a current cost estimate. Backups and restoration MUST be documented and
  exercised before the hosted app is relied on for real history.

## Development Workflow and Quality Gates

- Before committing, `./scripts/dev.sh lint` MUST pass (CSharpier formatting, warnings as errors)
  and the relevant test suites MUST pass; web changes MUST pass their checks in
  `docs/web-workflows.md`.
- Generated migrations are excluded from formatting but MUST be reviewed.
- Significant architecture, identity, provider or infrastructure choices MUST be recorded in
  `docs/decisions/`; proofs and verification results are recorded under `docs/`.
- Feature work follows Spec Kit: specification, plan and tasks. Each plan MUST include a
  Constitution Check, and any violation MUST be justified in its Complexity Tracking section.
- Commits use Conventional Commit prefixes (`feat:`, `fix:`, `docs:`, `chore:` and similar).

## Governance

This constitution supersedes conflicting practices and guidance. `PROJECT_PLAN.md` defines scope
and phases; where the two conflict, the constitution governs until one of them is amended.

Amendments are made by the project owner through a documented change to this file that states
the reason, updates the version and dates, and notes any affected plans or templates.

Versioning follows semantic versioning: MAJOR for removing or redefining a principle, MINOR for
a new principle or materially expanded guidance, PATCH for clarifications and wording.

Compliance is checked at each Spec Kit plan's Constitution Check and during code review.
Unjustified violations block merging.

**Version**: 1.0.0 | **Ratified**: 2026-10-12 | **Last Amended**: 2026-10-12
