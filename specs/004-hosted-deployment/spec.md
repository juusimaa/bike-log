# Feature Specification: Minimal Hosted Deployment

**Feature Branch**: `004-hosted-deployment`

**Created**: 2026-10-13

**Status**: Draft

**Input**: User description: "Minimal hosted deployment of Bike Log (PROJECT_PLAN.md Phase 3, first slice, taken ahead of the Phase 2 mobile app). Goal: the owner can use the existing Next.js web app and ASP.NET Core API from anywhere over HTTPS with real personal data, on Azure Container Apps (Consumption plan, within free grant) with an Aiven for PostgreSQL free-plan service in an EU region (decision 0003), using the existing container images (docs/containers.md) and Auth0 invite-only sign-in (decision 0002). In scope: repeatable infrastructure as code (Bicep) for the Azure resources, GitHub Actions build-and-deploy with workload identity federation (no long-lived cloud credentials), migrations run as a separate job before a new API version, secrets kept out of source (Key Vault / managed identity where it fits), health checks, connection pool capped under Aiven's 20-connection limit, a budget alert and agreed monthly budget before provisioning, documented backup and a restore that has been exercised before real data is relied on, rollback to the previous revision without incompatible schema changes, pilot user provisioning against the hosted database. Out of scope for this slice: Service Bus, transactional outbox, background worker, Blob Storage, Application Insights beyond basic logs if cost is a concern, mobile app, custom domain unless trivial. Also record that this reorders the plan: hosting comes before the Phase 2 mobile app so the owner can use the web app daily and the mobile proof later gets a real HTTPS endpoint."

## Overview

Bike Log runs only on the owner's own machine today. The web app, sign-in and per-owner data separation are
built and verified, but the app cannot be reached from a phone on the road or from another computer, and
the rules forbid real personal records until the app runs in a protected environment with tested backups.

This feature puts the existing web app and service online, reachable over HTTPS from anywhere, for the owner
and a few invited riders. It is the first slice of Phase 3 in `PROJECT_PLAN.md`: hosting, repeatable
deployment, secrets, health checks, cost control and a tested backup and restore. The asynchronous parts of
Phase 3 (message queue, outbox, background worker) follow in a later slice.

**Plan reordering**: this slice comes before the Phase 2 React Native app. Hosting first lets the owner use
the web app every day with real bikes, which is how the web UI is judged ready, and gives the later native
sign-in proof a real HTTPS endpoint instead of a temporary local-network setup. `PROJECT_PLAN.md` records
this change.

## Clarifications

### Session 2026-10-13

- Q: Where should the daily encrypted backups be stored, outside Aiven? → A: An Azure Storage account in the same subscription and region, written by a scheduled job that can write but not delete; lifecycle rules remove backups after 30 days.
- Q: What monthly budget should the Azure environment have, and when should the alert email the owner? → A: €10 a month; alerts at 50% and 80% of actual spend and at 100% of forecast spend.
- Q: How should Azure pull the container images that CI publishes? → A: Make the three GitHub Container Registry packages public, so no registry credential is needed.
- Q: Where should the restore rehearsal, and a real recovery, put the restored database? → A: Rehearsals restore into a fresh local Docker PostgreSQL on the owner's machine; a real recovery recreates the Aiven service and restores into it.
- Q: Which Azure region should host the app? → A: Azure Sweden Central; the Aiven database goes in the same Azure region if the free plan allows it, otherwise the nearest region the free plan offers, and the setup guide records the regions actually used.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Owner uses Bike Log from anywhere (Priority: P1)

The owner opens the Bike Log address on their phone over mobile data after a ride, signs in with the
emailed code, and logs the ride against their bike. Later, at home on a laptop, they see the same ride and
the updated component usage. Only invited, provisioned people can sign in; everyone else is turned away.

**Why this priority**: This is the reason for the feature. Without a reachable, protected app, nothing else
in this slice has a user.

**Independent Test**: With the app deployed, sign in from a phone on a mobile network, create a ride, then
sign in from a second device and see the same ride. Try an uninvited email address and a plain HTTP address
and confirm both are refused.

**Acceptance Scenarios**:

1. **Given** the app is deployed and the owner is provisioned, **When** the owner opens the public address
   on a phone outside their home network and signs in with an emailed code, **Then** they reach their own
   garage over an encrypted connection.
2. **Given** a signed-in owner, **When** they log a ride, **Then** the ride and the resulting component
   usage appear on any other device where they sign in.
3. **Given** an email address that has not been invited, **When** someone tries to sign in with it,
   **Then** no account is created and no garage data is shown.
4. **Given** the public address, **When** someone requests it over unencrypted HTTP, **Then** they are
   redirected to HTTPS or refused, and no data is served without encryption.
5. **Given** the hosted environment, **When** anyone tries to use the local synthetic access mode or reach
   the service directly without going through the web app's sign-in, **Then** the request is refused.
6. **Given** the app has been idle for several hours, **When** the owner opens it, **Then** it becomes
   usable within the start-up time in SC-002, showing a loading state rather than an error while it starts.

---

### User Story 2 - Owner trusts that hosted records can be recovered (Priority: P1)

Before entering real maintenance history, the owner wants proof that the records can be recovered if the
database is lost or damaged. Backups are taken automatically and kept outside the database provider, and a
restore has been rehearsed end to end, with the result recorded.

**Why this priority**: The project rules forbid relying on hosted records until backup and restoration are
documented and exercised. Without this story, User Story 1 can only be used with synthetic data.

**Independent Test**: Enter a known set of records, let a backup run, restore that backup into a separate
empty local database, and compare record counts and a sample of records. Record the date, duration and outcome.

**Acceptance Scenarios**:

1. **Given** the hosted app has records, **When** a scheduled backup runs, **Then** an encrypted copy of
   all records is stored outside the database provider and the run's success or failure is visible to the
   owner.
2. **Given** a backup, **When** the operator follows the documented restore procedure into a fresh local
   database, **Then** every bike, component, installation, ride, maintenance record, reminder and user record
   is present, and usage totals match the original.
3. **Given** a backup fails, **When** the owner next checks, **Then** they are notified of the failure
   within one day.
4. **Given** backups older than the retention period, **When** retention is applied, **Then** they are
   removed and the newer backups remain.

---

### User Story 3 - Owner deploys changes safely and repeatably (Priority: P2)

The owner merges a change to the main branch. The new version is built, the database changes are applied
first as a separate step, and the new version replaces the old one only after it reports itself healthy. If
the new version is broken, the owner returns to the previous version without losing data. The whole hosted
environment can be recreated from the repository and a short documented list of manual steps.

**Why this priority**: The owner can use the app without automated deployment for a while, but manual
deployments are error-prone and the learning objective of this phase is repeatable delivery.

**Independent Test**: Merge a harmless change and watch it go live without manual steps. Deploy a version
that fails its health check and confirm the previous version keeps serving. Roll back a healthy deployment
to the previous version and confirm the app still works with the current database.

**Acceptance Scenarios**:

1. **Given** a change merged to the main branch, **When** the delivery pipeline runs, **Then** it applies
   pending database changes first, then deploys the new version, and the new version serves traffic only
   after its health check passes.
2. **Given** a new version that fails its health check, **When** it is deployed, **Then** the previous
   version keeps serving and the pipeline reports the failure.
3. **Given** a database change that fails, **When** the pipeline runs, **Then** the new version is not
   deployed and the running version continues to work.
4. **Given** a deployed version with a problem, **When** the owner rolls back to the previous version,
   **Then** it works against the current database because database changes are additive only.
5. **Given** the repository and the setup guide, **When** the operator recreates the environment in an
   empty cloud resource group, **Then** the same app runs without hand-edited cloud settings beyond those
   the guide lists.
6. **Given** the delivery pipeline, **When** it authenticates to the cloud, **Then** it uses short-lived
   federated credentials and no stored long-lived cloud password or key.

---

### User Story 4 - Operator manages pilot riders on the hosted app (Priority: P2)

The operator invites a pilot rider: they create the person in the identity provider and provision the
matching local user against the hosted database, using the existing commands. Removing a rider disables
both. No database port or operator command is exposed to the internet to do this.

**Why this priority**: The owner is the first user; other riders come after the owner has used the app for
a while. The existing commands already work locally, so this story mostly confirms they work safely in the
hosted environment.

**Independent Test**: Provision a second test rider against the hosted database, sign in as that rider,
confirm their garage is empty and separate from the owner's, then disable them and confirm their next
request is refused.

**Acceptance Scenarios**:

1. **Given** an invited identity, **When** the operator runs the documented provisioning procedure against
   the hosted database, **Then** the rider can sign in and sees only their own, empty garage.
2. **Given** a provisioned rider, **When** the operator disables them, **Then** their next request is
   refused even if their sign-in session has not expired.
3. **Given** the provisioning procedure, **When** it runs, **Then** it uses the same secret store as the
   app, prints no secrets, and does not open any new public endpoint.

---

### User Story 5 - Owner keeps hosting cost within an agreed budget (Priority: P3)

Before anything is created in the cloud, the owner agrees a monthly budget based on a current cost estimate.
A budget alert warns them by email as spending approaches it. The app is sized to stay within the free
allowances of the hosting and database plans.

**Why this priority**: Required by the project rules before provisioning, but it is a one-time setup with a
small ongoing check.

**Independent Test**: Review the recorded cost estimate and budget, confirm the alert exists with the agreed
thresholds and recipient, and after a month compare actual spend with the estimate.

**Acceptance Scenarios**:

1. **Given** no cloud resources exist, **When** provisioning is about to start, **Then** a dated cost
   estimate and the owner's approved monthly budget are recorded in the repository.
2. **Given** the budget, **When** actual or forecast spending crosses the agreed thresholds, **Then** the
   owner receives an email alert.
3. **Given** the hosted environment, **When** it runs at the owner's normal usage, **Then** the database
   stays on its free plan and its connection limit, and no paid tier is enabled without a new estimate and
   approval.

---

### Edge Cases

- The database provider powers off a new free service that sees no use in its first hours: the setup guide
  says how to detect and restart it, and the app shows a plain "service unavailable" message meanwhile.
- The database is unreachable or at its connection limit: users see a retry message, and no request
  partially saves a record.
- The identity provider is down: sign-in fails with a plain message; already-signed-in users keep working
  until their session needs renewal; the service never falls back to weaker checks.
- A deployment starts while another is running: deployments run one at a time and the second waits or is
  cancelled.
- A database change succeeds but the new version then fails its health check: the previous version keeps
  running against the changed database, which works because changes are additive.
- A secret is rotated (database password, session key, identity provider secret): the app picks up the new
  value on its next revision without a code change, and the guide describes the order of steps.
- Several app instances start at once: the total number of database connections from all instances, the
  migration step and operator commands stays under the database's limit.
- A backup runs while the owner is editing: the backup is consistent as of one moment and does not block
  editing.
- The cloud provider's default address changes after recreating the environment: the identity provider's
  allowed callback and sign-out addresses and the web app's allowed origin are updated as listed steps in
  the guide.
- The free monthly compute allowance runs out: the budget alert fires before charges become significant.

## Requirements *(mandatory)*

### Functional Requirements

**Access and security**

- **FR-001**: The web app MUST be reachable from the public internet over HTTPS at a stable address; HTTP
  requests MUST be redirected to HTTPS or refused.
- **FR-002**: Only the web app MUST be publicly reachable. The service behind it and the database
  management interfaces MUST NOT accept requests directly from the internet, except the database's own
  protected endpoint, which requires credentials and an encrypted connection.
- **FR-003**: The hosted environment MUST run only in authenticated mode. The local synthetic access mode
  MUST be impossible to enable there, and the service MUST refuse to start if it is configured for it.
- **FR-004**: The web app MUST accept authenticated, state-changing requests only from its own hosted HTTPS
  origin (and the local development origin in development), and its session cookie MUST be marked secure.
- **FR-005**: Sign-in MUST keep the existing invite-only rules from spec 001: email code only, no public
  signup, unknown identities refused, and the local user check on every request.
- **FR-006**: Secrets (database credentials, session key, identity provider secret) MUST be held in a managed secret store and supplied to the app at run time. They MUST NOT appear in the
  repository, infrastructure parameters, pipeline logs, application logs or the browser.
- **FR-007**: Database connections MUST be encrypted and MUST verify the database server's certificate.
- **FR-007a**: The published container images MUST be publicly readable so the hosting platform pulls them
  without a registry credential. Images MUST contain no secrets, environment-specific settings or personal
  data; everything sensitive is supplied at run time.

**Deployment and operations**

- **FR-008**: All cloud resources for the environment MUST be defined as code in the repository. Steps that
  cannot be automated (database service creation, identity provider settings, initial secrets, budget
  approval) MUST be listed in a setup guide.
- **FR-009**: Merging to the main branch MUST build the container images, apply pending database changes as
  a separate step, and then deploy the new version, without manual commands.
- **FR-010**: The delivery pipeline MUST authenticate to the cloud with short-lived federated credentials,
  with permissions limited to this environment.
- **FR-011**: A new version MUST receive traffic only after its health check passes; a failed health check
  MUST leave the previous version serving.
- **FR-012**: If the database change step fails, the new version MUST NOT be deployed.
- **FR-013**: The operator MUST be able to return to the previous version with one documented action, and
  hosted database changes MUST be additive so the previous version keeps working.
- **FR-014**: Only one deployment MUST run at a time.
- **FR-015**: The combined database connections of all app instances, the migration step and operator
  commands MUST stay below the database plan's connection limit, with the instance count capped
  accordingly.
- **FR-016**: The health check MUST report readiness without exposing any record data.
- **FR-017**: Application logs MUST be retained for a bounded period, kept within the budget, and MUST NOT
  contain secrets, tokens or ride and maintenance contents.

**Backup and recovery**

- **FR-018**: All records MUST be backed up automatically at least once a day to encrypted storage held
  outside the database provider: a storage account in the same cloud subscription and region as the app,
  managed as code with the rest of the environment. The scheduled backup job MUST be able to write backups
  but not delete or overwrite them.
- **FR-019**: Backups MUST be kept for at least 30 days; older backups MUST be removed automatically by the
  storage's own retention rules, not by the backup job.
- **FR-020**: A failed or missed backup MUST alert the owner within one day.
- **FR-021**: A documented restore procedure MUST restore a chosen backup into a separate database, and
  MUST include a check that compares record counts and usage totals with the source. Rehearsals restore
  into a fresh local database on the owner's machine, kept apart from the development database and deleted
  after the check when it holds real records. A real recovery recreates the hosted database service and
  restores into it; the guide covers both paths.
- **FR-022**: The restore procedure MUST be rehearsed, with the date, duration and outcome recorded, before
  any real personal record is entered in the hosted app.

**Pilot riders**

- **FR-023**: The operator MUST be able to provision and disable riders against the hosted database with
  the existing commands, using credentials from the secret store, without opening a new public endpoint.

**Cost**

- **FR-024**: Before any cloud resource is created, a dated cost estimate MUST be recorded in the
  repository and show the environment fitting within the approved monthly budget of €10.
- **FR-025**: A budget alert MUST email the owner when actual spending reaches 50% and 80% of the monthly
  budget, and when forecast spending reaches 100%.
- **FR-026**: The environment MUST default to the free allowances: the database on its free plan and the
  app scaling down to zero instances when idle. Enabling any paid tier or always-on capacity MUST require a
  new estimate and the owner's approval.

**Plan and records**

- **FR-027**: `PROJECT_PLAN.md` MUST record that this slice comes before the Phase 2 mobile app and why.
- **FR-028**: The hosting setup, deployment, rollback, secret rotation, backup and restore procedures MUST
  be documented under `docs/`, and the first deployment and restore rehearsal results MUST be recorded there.

### Key Entities

- **Hosted environment**: the single cloud environment that runs the web app and service for real use,
  defined as code, with its public address, scaling limits and budget.
- **App version (revision)**: one deployed build of the web app and service, identified by its source
  commit; the current and previous versions are kept so the operator can return to the previous one.
- **Database change run**: one execution of pending database changes for a version, with outcome; it gates
  deployment of that version.
- **Backup**: an encrypted, dated copy of all records stored in the environment's backup storage, outside
  the database provider, with its outcome and expiry date.
- **Restore rehearsal record**: the date, backup used, duration, comparison result and any problems from a
  restore test.
- **Secret**: a named credential held in the secret store, with its rotation procedure; never stored in the
  repository.
- **Cost estimate and budget**: the dated estimate, the approved monthly amount (€10), the alert thresholds
  (50% and 80% actual, 100% forecast) and the recipient.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can sign in and log a ride from a phone on a mobile network in under 1 minute when
  the app is already running.
- **SC-002**: After the app has been idle, the first page becomes usable within 30 seconds; later page loads
  in the same session complete within 3 seconds.
- **SC-003**: 100% of attempts by uninvited addresses, unencrypted connections and direct requests to the
  service behind the web app are refused in an acceptance run.
- **SC-004**: A merged change is live within 20 minutes of merging, without manual steps.
- **SC-005**: In a rehearsal, a deployment that fails its health check causes no failed user requests for
  the version already serving, and a rollback restores the previous version within 5 minutes.
- **SC-006**: A restore rehearsal recovers 100% of records with matching usage totals and is completed by
  following the guide alone within 1 hour.
- **SC-007**: After 30 days of use, at least 28 daily backups exist and every missed or failed one produced
  an alert.
- **SC-008**: A search of the repository, pipeline logs and application logs finds zero secrets.
- **SC-009**: The environment can be recreated from the repository and the setup guide in under 2 hours.
- **SC-010**: Monthly hosting cost stays within the approved €10 budget for the first three months, and the
  database stays on its free plan.

## Assumptions

- Users are the owner and, later, a handful of invited pilot riders; the app is not public.
- The app uses the cloud provider's default HTTPS address. A custom domain is out of scope unless it needs
  no more than a DNS record and a managed certificate.
- Scaling to zero when idle is accepted to stay within the free compute allowance; the start-up delay in
  SC-002 is the trade-off. Always-on capacity needs a new cost decision.
- The app and its backup storage run in Azure Sweden Central. The database service is created by hand in
  the same region if its free plan allows, otherwise in the nearest EU region the free plan offers, as
  decision 0003 requires; the infrastructure code covers only the cloud provider's resources.
- The database provider's own backups are not counted as the tested recovery procedure, so a separate
  backup is kept outside it.
- The database plan allows only one free database service per organization, so rehearsals cannot restore
  into a second hosted service.
- The existing container images, invite-only sign-in, operator provisioning commands and data-free health
  endpoint are reused; only the configuration and small code changes hosting needs (allowed origin, refusing
  synthetic mode, secure cookies) are added.
- Basic platform logs are enough for this slice; richer telemetry and tracing come with the asynchronous
  slice and are added only if they fit the budget.
- The repository is public, so publishing its container images publicly reveals nothing beyond the source.
- The first deployment holds only synthetic or test records until the restore rehearsal passes (FR-022).

### Out of scope

Message queue, transactional outbox, background worker, file storage for photos and receipts (backup
storage is in scope), full telemetry and tracing,
the mobile app and native sign-in proof, a staging environment, multiple regions, and public signup.

### Dependencies

- Decision 0002 (Auth0 invite-only identity) and spec 001's web milestone.
- Decision 0003 (Aiven PostgreSQL and Azure Container Apps hosting).
- The container images and their deployment notes in `docs/containers.md`.
- The owner's approval of the cost estimate and budget before provisioning.
