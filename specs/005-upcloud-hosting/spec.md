# Feature Specification: Hosting on UpCloud

**Feature Branch**: `005-upcloud-hosting`

**Created**: 2026-10-14

**Status**: Draft

**Input**: User description: "Host Bike Log on the owner's existing UpCloud server instead of Azure Container Apps. The web and API containers (and the migrations job) run on the UpCloud server using the published container images; the database stays in Aiven PostgreSQL (free plan) for this feature. The server has about 13 GB free disk, which is enough for the app images (~1–2 GB including the backup image). Must account for: Aiven IP allowlist/connection limit (20, free plan), pruning old images after updates, bounded container logs, daily backups continuing to work, and not running the Azure deployment against the same database at the same time. Out of scope but to be noted as a future direction: moving the database from Aiven to the PostgreSQL instance already running on the same UpCloud server, which is shared with the owner's Gym Notebook and Subscription Tracker apps and currently uses only about 7% of its disk."

## Overview

Spec 004 put Bike Log online on Azure Container Apps with an Aiven PostgreSQL database. It works, but it
scales to zero when idle, so the first page after a pause takes 20–30 seconds or more. It also adds a cloud
subscription, a budget and a set of Azure-specific scripts for one small app.

The owner already runs a server on UpCloud for two other personal apps, Gym Notebook and Subscription
Tracker, with plenty of free disk. This feature moves the web app and its service to that server. The
database stays in Aiven, so no records move. Once the server version is verified, the Azure app environment
is removed; only the backup storage and its alerts stay in Azure, written to daily from the server.

Spec 004's hosted environment holds only test records (real records are not yet allowed, see
`docs/hosting/setup-results.md`), so the move does not put real history at risk. The protections from
spec 004 still apply on the new host: invite-only sign-in, HTTPS only, secrets kept out of the repository,
health-gated deployment, additive database changes, daily backups outside the database provider, and a
rehearsed restore before real records are entered.

**Future direction (out of scope)**: the database could later move from Aiven to the PostgreSQL instance
already running on the same server, which Gym Notebook and Subscription Tracker share and which uses about
7% of its disk. That would remove the 20-connection and 1 GB limits of the free plan and the dependency on
a second provider, but it would put the app and its database on one machine, so backups kept away from that
server would become more important. This feature should not make that move harder: the database location
stays a setting, not something built into the deployment.

## Clarifications

### Session 2026-10-14

- Q: Which public address should the app use? → A: The server's own UpCloud hostname (the name UpCloud gives its public IP address), with no custom domain.
- Q: Where should backups go after the move? → A: Keep the existing Azure backup job and backup storage; remove everything else in Azure.
- Q: Where should the backup job run, given that Azure's jobs have no fixed address for the database's allow-list? → A: On the UpCloud server, still writing to the existing Azure backup storage (refines the previous answer; recorded during planning).
- Q: What happens to the Azure environment after cutover? → A: Remove it as soon as the server version passes its checks, apart from the backup parts kept above; the way back is recreating it from code.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Owner uses Bike Log from the UpCloud server (Priority: P1)

The owner opens the Bike Log address on a phone or laptop, signs in with the emailed code, and works with
their garage as before. The app responds straight away, even after hours without use. Only invited,
provisioned people can sign in. The other apps on the server keep working as before.

**Why this priority**: This is the move itself. Without it nothing else in this feature has a purpose.

**Independent Test**: With the app running on the server, sign in from a phone on mobile data and from a
laptop, create a ride, and see it on both. Leave the app idle for several hours, then open it and time the
first page. Repeat the spec 004 refusal checks against the new address. Open Gym Notebook and Subscription
Tracker and confirm they still work.

**Acceptance Scenarios**:

1. **Given** the app runs on the server and the owner is provisioned, **When** the owner opens the public
   address and signs in with an emailed code, **Then** they reach their own garage over an encrypted
   connection.
2. **Given** the app has been idle for several hours, **When** the owner opens it, **Then** the first page
   is usable within the time in SC-002, with no start-up delay.
3. **Given** an uninvited email address, an unencrypted HTTP request, a foreign origin, or a direct request
   to the service behind the web app, **When** each is tried against the new address, **Then** each is
   refused as it was on the Azure environment.
4. **Given** Bike Log is running and busy, **When** the owner uses Gym Notebook or Subscription Tracker,
   **Then** they work as before, because Bike Log stays within its memory and CPU limits.

---

### User Story 2 - Owner switches over from Azure without two apps sharing the database (Priority: P1)

The owner switches the app from Azure to the server in a fixed order: the Azure app stops serving and stops
using the database, the server version starts against the same database, the checks pass, and then the
Azure environment is removed. At no point do both environments use the database at once.

**Why this priority**: Two environments against one database could change records under each other and
would exceed the database's connection limit. The cutover must be safe even though the data is test data,
because the same procedure would be followed if real records existed.

**Independent Test**: Follow the cutover procedure. Confirm that Azure no longer connects to the database
before the server version starts, that the server version shows the existing test records, and that the
database's connection count stays within its limit throughout.

**Acceptance Scenarios**:

1. **Given** the Azure environment is serving, **When** the cutover starts, **Then** the Azure app, its
   scheduled jobs and its delivery pipeline are stopped before the server version connects to the database.
2. **Given** the cutover is complete, **When** the owner signs in on the new address, **Then** the records
   created on Azure are all there.
3. **Given** the server version fails its checks during cutover, **When** the owner follows the fallback
   step, **Then** the server version stops and the Azure app can be started again against the same
   database, with no records lost.
4. **Given** the server version has passed its checks, **When** the Azure app environment is removed,
   **Then** nothing in Azure keeps running or charging except the backup storage and its alerts
   (FR-021, FR-027).

---

### User Story 3 - Owner trusts that records can be recovered (Priority: P1)

Backups keep running daily after the move, are stored outside the database provider, and a restore has
been rehearsed against a backup taken after the move before any real record is entered.

**Why this priority**: The project rules forbid relying on hosted records until backup and restoration are
documented and exercised. Moving the app must not leave a gap in backups.

**Independent Test**: Let a scheduled backup run after the move, restore it into a fresh local database
with the existing restore procedure, and compare record counts and usage totals. Stop a backup on purpose
and confirm the owner is alerted within one day.

**Acceptance Scenarios**:

1. **Given** the app runs on the server, **When** a day passes, **Then** a new backup of all records exists
   outside the database provider and outside the server's own disk.
2. **Given** a backup from after the move, **When** the owner follows the restore procedure into a fresh
   local database, **Then** every record is present and usage totals match.
3. **Given** a backup fails or does not run, **When** the owner next checks, **Then** they were alerted
   within one day.

---

### User Story 4 - Owner deploys changes safely and repeatably (Priority: P2)

The owner merges a change to the main branch. The new version is delivered to the server, database changes
are applied first as a separate step, and the new version replaces the old one only after it reports itself
healthy. If it does not, the previous version is back in service. Old versions are cleaned up so the disk
does not fill.

**Why this priority**: The owner can deploy by hand for a while, but repeatable delivery is the learning
objective of this phase, and unattended disk growth would eventually break all three apps on the server.

**Independent Test**: Merge a harmless change and watch it go live without manual steps. Deploy a version
that fails its health check and confirm the previous version is serving again. Roll back to the previous
version with one documented action. After several deployments, confirm that only the current and previous
versions remain on disk and that log files stay below their limit.

**Acceptance Scenarios**:

1. **Given** a change merged to the main branch, **When** delivery runs, **Then** pending database changes
   are applied first, then the new version starts and serves traffic only after its health check passes.
2. **Given** a new version that fails its health check, **When** it is deployed, **Then** the previous
   version is serving again within the time in SC-005 and delivery reports the failure.
3. **Given** a database change that fails, **When** delivery runs, **Then** the new version is not started
   and the running version keeps serving.
4. **Given** a deployed version with a problem, **When** the owner runs the documented rollback, **Then**
   the previous version serves again and works with the current database.
5. **Given** ten deployments in a row, **When** the owner checks the server, **Then** only the current and
   previous versions' images remain and Bike Log's logs are within their size limit.
6. **Given** the delivery pipeline, **When** it reaches the server, **Then** it uses a credential that can
   only deploy Bike Log and cannot open a general shell or touch the other apps.

---

### User Story 5 - Operator manages pilot riders on the server (Priority: P3)

The operator provisions and disables riders against the hosted database with the existing commands, now run
on the server, with no new public endpoint and no secret printed.

**Why this priority**: The owner is the first user and is already provisioned; other riders come later.

**Independent Test**: Provision a test rider through the documented procedure on the server, sign in as
that rider and see an empty, separate garage, then disable them and confirm their next request is refused.

**Acceptance Scenarios**:

1. **Given** an invited identity, **When** the operator runs the provisioning procedure on the server,
   **Then** the rider can sign in and sees only their own garage.
2. **Given** a provisioned rider, **When** the operator disables them, **Then** their next request is
   refused even with a valid session.

---

### Edge Cases

- The server reboots (maintenance or a crash): Bike Log starts again on its own and is usable without
  manual steps once the server is up.
- The database is unreachable or at its connection limit: users see a retry message and no request
  partially saves a record.
- The server's public IP address changes: its UpCloud hostname changes with it, so the guide lists the
  steps to update the app's public address, the certificate, the identity provider's addresses and the
  database's allow-list; until then the app reports the database as unavailable rather than failing silently.
- The certificate authority refuses or rate-limits certificates for the shared UpCloud hostname domain:
  setup stops and the owner decides on another address; the app is not served over plain HTTP meanwhile.
- The disk fills up, for example after a failed cleanup: delivery checks free space before pulling new
  images and stops with a clear message instead of leaving a half-deployed version.
- A deployment starts while another is running: only one runs at a time.
- A database change succeeds but the new version then fails its health check: the previous version runs
  against the changed database, which works because changes are additive.
- The Azure app is started again by mistake after cutover: it must not be able to connect to the database,
  because its address is no longer on the database's allow-list.
- The identity provider still lists the old Azure callback address: the old address is removed so sign-in
  only returns to the new one.
- Bike Log misbehaves and uses too much memory: its own limit stops it, and the other apps on the server keep
  running.
- A secret is rotated: the app picks up the new value on its next restart, and the guide gives the order of
  steps.

## Requirements *(mandatory)*

### Functional Requirements

**Hosting and access**

- **FR-001**: The web app and its service MUST run on the owner's existing UpCloud server from the
  published container images, without building images on the server.
- **FR-002**: The web app MUST be reachable from the public internet over HTTPS at the server's own
  UpCloud hostname (the name UpCloud gives the server's public IP address), with a publicly trusted
  certificate that renews automatically. No custom domain is bought. HTTP requests MUST be redirected to
  HTTPS or refused. The address MUST be defined in one app setting, the proxy's site name and the identity
  provider's addresses, and nowhere else, so a custom domain can replace it later by changing those three.
- **FR-003**: Only the web app MUST be publicly reachable. The service behind it MUST accept requests only
  from the web app on the same server, and Bike Log MUST NOT open any other port to the internet.
- **FR-004**: The hosted environment MUST run only in authenticated mode, and the service MUST refuse to
  start if configured for the local synthetic mode, as in spec 004.
- **FR-005**: The existing sign-in rules (spec 001, spec 004 FR-004 and FR-005) MUST hold unchanged on the
  new address: invite-only email code, secure cookies, own-origin state changes, and the local user check on
  every request.
- **FR-006**: Bike Log MUST run with memory and CPU limits so that it cannot starve Gym Notebook,
  Subscription Tracker or the shared database on the same server.
- **FR-007**: Bike Log MUST start again automatically after a server reboot or a crash.

**Database**

- **FR-008**: The database MUST stay in the existing Aiven free-plan service. Connections MUST be encrypted
  and verify the server certificate.
- **FR-009**: The database's allow-list MUST contain the UpCloud server's address and, after cutover, MUST
  NOT contain any Azure address.
- **FR-010**: The combined connections of the app, the migration step, the backup job and operator commands
  MUST stay below the database plan's limit of 20, within the same budget as spec 004 (15 for Bike Log).
- **FR-011**: The database location MUST be a setting supplied at run time, so a later move to another
  PostgreSQL server needs only a data move and a configuration change.

**Secrets**

- **FR-012**: Secrets (database credentials, session key, identity provider secret) MUST be stored on the
  server outside the repository, readable only by the account that runs Bike Log, and supplied at run time.
  They MUST NOT appear in the repository, pipeline logs, application logs, images or the browser.

**Deployment and operations**

- **FR-013**: Merging to the main branch MUST deliver the new version to the server without manual
  commands: pending database changes are applied first as a separate step, and the new version starts only
  if that step succeeds.
- **FR-014**: A new version MUST serve traffic only after its health check passes. If it fails, the
  previous version MUST be put back in service automatically.
- **FR-015**: The operator MUST be able to return to the previous version with one documented action.
  Hosted database changes MUST remain additive.
- **FR-016**: Only one deployment MUST run at a time.
- **FR-017**: The delivery pipeline MUST reach the server with a dedicated credential that can only run the
  Bike Log deployment, cannot open a general shell and cannot affect the other apps. The credential MUST be
  stored only as a protected pipeline secret, and the guide MUST describe how to rotate and revoke it.
- **FR-018**: After each successful deployment, Bike Log images other than the current and previous
  versions MUST be removed. Delivery MUST check free disk space before pulling and stop if less than 3 GB
  would remain.
- **FR-019**: Bike Log's logs MUST be bounded in size (no more than 100 MB in total) and MUST NOT contain
  secrets, tokens or ride and maintenance contents.
- **FR-020**: The health check MUST report readiness without exposing record data.

**Backup and recovery**

- **FR-021**: All records MUST continue to be backed up at least once a day into the existing Azure backup
  storage, kept with its retention rule, missed-backup alert and budget alert and still defined as code. The
  backup job runs on the UpCloud server, so the database's allow-list can stay limited to the server
  (FR-009), and signs in to the storage with a dedicated credential that can write backups but not delete or
  overwrite them. Backups are therefore outside the database provider and outside the UpCloud server.
- **FR-022**: Backups MUST be kept for at least 30 days and removed afterwards by the storage's own
  retention rules, not by the backup job.
- **FR-023**: A failed or missed backup MUST alert the owner by email within one day.
- **FR-024**: The existing restore procedure (restore into a fresh local database and compare counts and
  usage totals) MUST work with backups from the new location, and MUST be rehearsed on a backup taken after
  the move, with date, duration and outcome recorded, before any real record is entered.

**Cutover from Azure**

- **FR-025**: The cutover MUST follow a documented order: stop the Azure app, its jobs and its delivery
  workflow; confirm Azure holds no database connection; start the server version; run the checks. At no
  point MUST both environments be connected to the database.
- **FR-026**: Until the server version passes its checks, the owner MUST be able to fall back to Azure by
  stopping the server version and starting the Azure app again.
- **FR-027**: As soon as the server version passes its checks, the Azure app, its jobs (including the
  Azure backup job), their logs and alerts, the secret store and the deploy identity MUST be removed,
  keeping only what FR-021 needs. The Azure delivery workflow MUST no longer deploy anything to Azure. The way back to Azure hosting is recreating it from the spec 004 code,
  which stays in the repository history.
- **FR-028**: The identity provider's allowed callback, sign-out and origin addresses MUST be changed to
  the new address, and the Azure addresses removed once Azure no longer serves.

**Records and documentation**

- **FR-029**: A decision record MUST state why hosting moves from Azure Container Apps to the UpCloud server
  and that the database stays in Aiven. The constitution's stack constraint and `PROJECT_PLAN.md` Phase 3,
  which name Azure Container Apps, MUST be amended accordingly.
- **FR-030**: Setup, deployment, rollback, secret rotation, backup, restore and cutover procedures for the
  server MUST be documented under `docs/hosting/`, and the cutover and verification results recorded there.
  Azure-specific documents MUST be marked as historical rather than deleted.
- **FR-031**: The decision record MUST note the future option of moving the database to the shared
  PostgreSQL instance on the same server, with its trade-offs (no free-plan limits; database and app on one
  machine; impact on Gym Notebook and Subscription Tracker), without deciding it.

### Key Entities

- **Server environment**: Bike Log's part of the UpCloud server: its containers, settings, secrets file,
  resource limits, public address and logs, kept apart from the other apps.
- **App version**: one deployed build of the web app and service, identified by its source commit; the
  current and previous versions are kept on the server.
- **Database change run**: one execution of pending database changes for a version, with outcome; it gates
  the version.
- **Backup**: a dated copy of all records stored outside the database provider and the server, with outcome
  and expiry.
- **Cutover record**: the date, steps taken, checks run and outcome of the switch from Azure, including when
  Azure was stopped and removed.
- **Deploy credential**: the dedicated, restricted credential the pipeline uses to reach the server, with
  its rotation and revocation steps.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The owner can sign in and log a ride from a phone on a mobile network in under 1 minute.
- **SC-002**: The first page after several hours idle is usable within 3 seconds, the same as later page
  loads.
- **SC-003**: 100% of attempts by uninvited addresses, unencrypted connections, foreign origins and direct
  requests to the service behind the web app are refused in an acceptance run on the new address.
- **SC-004**: A merged change is live within 15 minutes of merging, without manual steps.
- **SC-005**: A deployment that fails its health check leaves the app unavailable for at most 1 minute
  before the previous version serves again; a manual rollback completes within 5 minutes.
- **SC-006**: The cutover takes under 2 hours, during which the app is unavailable for at most 30 minutes,
  and both environments are never connected to the database at the same time.
- **SC-007**: A restore rehearsal of a post-move backup recovers 100% of records with matching usage totals
  and is completed from the guide alone within 1 hour.
- **SC-008**: After 30 days, at least 28 daily backups exist and every missed or failed one produced an
  alert.
- **SC-009**: After 30 days of normal use and deployments, Bike Log uses no more than 3 GB of the server's
  disk, and Gym Notebook and Subscription Tracker had no outage caused by Bike Log.
- **SC-010**: A search of the repository, pipeline logs, application logs and images finds zero secrets.
- **SC-011**: After cutover, Azure costs for Bike Log are only the backup storage and alerts kept by
  FR-021, under €1 a month.

## Assumptions

- The UpCloud server already runs the owner's other apps with containers and a reverse proxy that
  terminates HTTPS; Bike Log joins that setup rather than bringing its own. If no such proxy exists, the
  plan adds one shared by all apps.
- The server has about 13 GB free disk and enough free memory for Bike Log's web app and service (about
  1 GB); the plan confirms the memory figure before setup.
- Running on an existing server adds no new monthly cost. The €10 Azure budget and its alerts stay in place
  to watch the remaining backup storage; any new paid service still needs a cost estimate and the owner's
  approval.
- The server's UpCloud hostname is not already the address of Gym Notebook or Subscription Tracker. If it
  is, the plan resolves how Bike Log gets its own address before setup, without serving it under a path of
  another app.
- Server-level administration (operating system updates, firewall, SSH access, the reverse proxy) is the
  owner's existing responsibility for the shared server; this feature documents only what Bike Log needs.
- The app no longer scales to zero; it runs all the time, which removes the start-up delay from spec 004.
- One instance of the app is enough; there is no failover to a second server.
- Users are the owner and, later, a handful of invited pilot riders.
- The existing container images, invite-only sign-in, operator commands, backup image and restore
  procedure are reused; only configuration and the delivery path change.
- The Azure environment holds only test records, so no record migration is needed; the database itself
  does not move.

### Out of scope

Moving the database to the server's shared PostgreSQL instance (recorded as a future direction), a staging
environment, a second server or failover, the message queue, outbox and background worker, file storage for
photos, the mobile app, and changes to the other apps on the server beyond adding Bike Log to the shared
reverse proxy.

### Dependencies

- Spec 004 and decision 0006 (the hosted deployment this replaces), and decision 0003 (Aiven).
- Decision 0002 (Auth0 invite-only identity).
- The published container images in `docs/containers.md`.
- The owner's access to the UpCloud server, the Aiven console, the Auth0 tenant and the DNS for the chosen
  address.
