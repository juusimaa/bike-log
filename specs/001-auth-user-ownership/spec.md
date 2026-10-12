# Feature Specification: Invite-Only Sign-In and Per-User Ownership

**Feature Branch**: `001-auth-user-ownership`

**Created**: 2026-10-12

**Status**: Draft (converted from an existing design; web-first milestone implemented; native proof deferred until the web UI is ready)

**Input**: User description: "Convert docs/superpowers/specs/2026-10-08-authentication-ownership-design.md (Auth0 invite-only authentication and per-user ownership) into a feature specification, noting which parts are already implemented and verified."

**Source design**: [2026-10-08-authentication-ownership-design.md](../../docs/superpowers/specs/2026-10-08-authentication-ownership-design.md) and its plans in [docs/superpowers/plans/](../../docs/superpowers/plans/). See [Implementation Status](#implementation-status-as-of-2026-10-12) for what is already done.

## Overview

Bike Log currently serves one fixed synthetic owner on a loopback-only machine. This feature makes the
service safe for separate personal garages: first the project owner, then a small invite-only pilot. An
invited person signs in with a one-time code sent to their email. The service determines who owns each
record from a verified identity, and one person's records never appear in, or can be changed by, another
person's requests.

The work is split into two milestones:

1. **Web-first milestone**: invite-only web sign-in, per-owner isolation across the whole service,
   operator provisioning and revocation, and removal of the old synthetic records.
2. **Native proof**: show that the same service accepts a correctly scoped credential obtained on a mobile
   device through the native app shell, without building the full native app. **Deferred**: all mobile
   app work, including this proof, starts only after the web UI is ready.

Neither milestone includes public signup, passwords, social login, shared or household garages, offline
sync, the full mobile UI, or hosted deployment.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Invited rider signs in with an email code (Priority: P1)

An invited pilot rider opens Bike Log on the web, chooses to sign in, enters their email address on the
identity provider's page, receives a one-time code, enters it, and lands in their own garage. They never
create or type a password. When finished they sign out from the account menu.

**Why this priority**: Without sign-in, no one other than the synthetic owner can use the app, and real
records cannot be entered.

**Independent Test**: Create one invited identity, sign in from a browser using only the emailed code,
reach the garage, sign out, and confirm the garage is no longer reachable without signing in again.

**Acceptance Scenarios**:

1. **Given** an invited and provisioned rider, **When** they request a code and enter it, **Then** they
   reach their garage without seeing a password prompt.
2. **Given** a signed-in rider, **When** they choose Sign out, **Then** their session ends, garage data is
   cleared from the screen, and returning requires a new sign-in.
3. **Given** a rider whose session has expired, **When** they next act in the garage, **Then** they see a
   session-expired message and a way to sign in again, and any unsent form input remains visible but is
   not resubmitted automatically.
4. **Given** the identity provider or service is unavailable, **When** the rider tries to sign in or load
   data, **Then** they see a plain-language message with a retry option and no technical diagnostics.

---

### User Story 2 - Each rider sees and changes only their own garage (Priority: P1)

Two pilot riders use Bike Log at the same time. Each sees only their own bikes, components, rides,
maintenance, reminders and usage. Neither can read or change the other's records, even by guessing
identifiers or calling the service directly.

**Why this priority**: Ownership isolation is the safety condition for any real personal data
(Constitution IV).

**Independent Test**: With two provisioned riders and synthetic data, create a bike in each account,
then switch accounts and confirm each sees only their own bike; repeat with direct requests using the
other rider's identifiers for every kind of record.

**Acceptance Scenarios**:

1. **Given** rider A owns a bike, **When** rider B requests it by its identifier, **Then** B receives the
   same "not found" response as for a nonexistent record, with no version or content of A's record.
2. **Given** rider A's record identifiers, **When** rider B tries to install, replace, edit history, log
   maintenance or rides, or rebuild usage referencing them, **Then** each attempt fails as "not found" and
   A's data is unchanged.
3. **Given** rider A has a page position in a list, **When** rider B reuses that position, **Then** the
   request is rejected and exposes none of A's rows.
4. **Given** rider A is signed in, **When** a different person signs in on the same browser, **Then** none
   of A's data is visible at any moment.

---

### User Story 3 - Operator controls who has access (Priority: P2)

The operator invites a pilot rider by creating their identity with the provider and then provisioning
them in Bike Log through a restricted local command. The operator can disable a rider, which takes effect
on the rider's next request, and later re-enable them.

**Why this priority**: Invite-only access depends on an explicit operator step; revocation must be
immediate for a private pilot.

**Independent Test**: Provision a rider and confirm access; disable them and confirm the next request is
refused even though their sign-in is still valid; re-enable and confirm access returns.

**Acceptance Scenarios**:

1. **Given** a person with a valid provider identity who has not been provisioned in Bike Log, **When**
   they call the service, **Then** they are refused as "no pilot access" and no account is created.
2. **Given** an attempt to provision an identity that is already provisioned, **When** the command runs,
   **Then** it is rejected and nothing changes.
3. **Given** an enabled rider with a still-valid sign-in, **When** the operator disables them, **Then**
   their next request is refused.
4. **Given** an uninvited email address, **When** someone attempts sign-in with it, **Then** no account is
   created and no usable code is delivered.

---

### User Story 4 - Old synthetic records are removed safely (Priority: P2)

Before real use, the operator removes the fixed synthetic owner's records with an explicit, guarded
command, so real riders start with empty garages and nothing else is touched.

**Why this priority**: The owner chose to discard local synthetic data rather than reassign it to a real
identity.

**Independent Test**: On a copy of a database containing the synthetic owner and another owner, run the
purge, confirm only the synthetic owner's rows are gone, then run it again and confirm nothing changes.

**Acceptance Scenarios**:

1. **Given** the confirmation flag is missing, the mode is not synthetic, the database is not the
   dedicated local one, or the owner is not the fixed synthetic owner, **When** the purge runs, **Then**
   it refuses and deletes nothing.
2. **Given** a valid invocation, **When** the purge runs, **Then** it deletes only the synthetic owner's
   records in one all-or-nothing operation and reports counts; schema, migration history, pilot users and
   other owners remain.
3. **Given** the service starts or migrations are applied, **Then** the purge never runs.

---

### User Story 5 - Same sign-in works from a native mobile device (Priority: P3)

After the web UI is ready, an invited rider signs in from a native development build on one selected
device using the system browser and their email code, and the app reads their protected (empty) garage
from the same service. When the operator disables the rider, the next read is refused; signing out
clears stored credentials and cached data.

**Why this priority**: The mobile app is a required project milestone, but only the identity and service
contract must be proven here; full native screens are a later feature. This story is deferred: no
mobile work starts until the web UI is ready.

**Independent Test**: On one device, sign in, read the garage count over an encrypted connection to an
isolated service with synthetic data, disable the rider and confirm refusal, sign out and confirm
credentials are cleared.

**Acceptance Scenarios**:

1. **Given** an invited rider on the device, **When** they sign in with an email code, **Then** the app
   reads their garage successfully and public signup remains impossible.
2. **Given** a credential issued for another purpose (for example an identity-only token or one for a
   different service), **When** the device presents it, **Then** the service refuses it.
3. **Given** an interrupted or canceled sign-in, **Then** the app returns to a clean signed-out state.
4. **Given** sign-out or loss of access, **Then** stored credentials and cached garage data are removed.

### Edge Cases

- A rider's email address or display name changes at the provider: ownership must not change.
- A valid provider sign-in exists but the Bike Log user is disabled: every request is refused while the
  provider session lasts.
- Two refreshes of the same web session happen concurrently: exactly one succeeds and a newer credential
  is never overwritten by an older one.
- A sign-in callback is replayed, or arrives with a wrong state, nonce, verifier or return address: no
  session is created.
- A browser sends its own authorization header or a cross-origin change request: it is ignored or
  rejected; the user is determined only by the server-held session.
- An unsafe post-sign-in return address is supplied: the user is sent to a safe local page instead.
- An authenticated change request's outcome is uncertain when the session expires: it is never replayed
  automatically.
- The synthetic purge is run twice: the second run deletes nothing and succeeds.
- A provider signing-key or web-session protection-key rotation occurs: new credentials verify; sessions
  protected by a retired key require signing in again.

## Requirements *(mandatory)*

### Functional Requirements

**Sign-in and onboarding**

- **FR-001**: Riders MUST sign in with a one-time code sent to their email; the service MUST NOT collect,
  receive or store passwords or codes.
- **FR-002**: Public account creation MUST be disabled; an uninvited address MUST NOT gain an account or
  a usable code.
- **FR-003**: A provider identity alone MUST NOT grant access; access requires an operator-provisioned,
  enabled Bike Log user. No user is created automatically on sign-in.
- **FR-004**: Each Bike Log user MUST be keyed by the immutable pair (identity issuer, subject) and assigned
  a new internal owner identifier; email and display name are mutable profile snapshots only.
- **FR-005**: Provisioning MUST reject a duplicate external identity or reuse of an existing owner.
  Provisioning, disable and re-enable MUST be restricted local operator commands, not network endpoints.
- **FR-006**: Disabling a user MUST refuse that user's next request regardless of remaining sign-in
  validity.

**Service authorization and isolation**

- **FR-007**: Every protected request MUST present a valid access credential issued by the one configured
  issuer, for the Bike Log service, carrying the Bike Log access permission. Identity-only credentials,
  credentials for other services, and expired or wrongly signed credentials MUST be refused before any
  data handling.
- **FR-008**: The owner MUST be determined only from the verified credential's issuer and subject plus the
  local user record, on every request; never from email, display name, URL, body or client headers.
- **FR-009**: Every read and change across bikes, components, installations, replacements, rides,
  maintenance, reminders, usage and usage rebuilds, collections and conflict responses MUST be limited to
  the current owner.
- **FR-010**: A record owned by someone else MUST be indistinguishable from a nonexistent record; conflict
  responses MUST NOT reveal another owner's version or contents.
- **FR-011**: List page positions MUST be bound to the owner that created them.
- **FR-012**: Responses MUST distinguish: missing or invalid credentials (unauthenticated); valid identity
  without an enabled pilot user (forbidden); absent or foreign record (not found).
- **FR-013**: The service MUST expose a minimal "current user" profile (email, display name) under the same
  authorization rules.
- **FR-014**: Authenticated and synthetic modes MUST be explicit and mutually exclusive. Authenticated mode
  MUST refuse to start with missing issuer, audience or permission settings. Synthetic mode MUST keep its
  existing local-only, fixed-owner restrictions.
- **FR-015**: Health and service-description endpoints MUST NOT expose user data.

**Web session**

- **FR-016**: The web sign-in flow MUST protect against forgery and replay (state, nonce and
  proof-of-possession checks) and validate the return address.
- **FR-017**: The browser MUST hold only an opaque session identifier in a secure, script-inaccessible
  cookie; provider credentials MUST stay on the server, encrypted at rest, with expiry and single-winner
  rotation.
- **FR-018**: The web request relay MUST require a session, attach only the server-held credential,
  ignore browser-supplied authorization, and keep its route allowlist, method checks, no-store responses
  and same-origin protection for changes.
- **FR-019**: Sign-out MUST end the Bike Log session, end the provider session where supported, and clear
  cached garage data. Changing identity MUST cancel in-flight requests and clear cached data.
- **FR-020**: Session expiry MUST return the user to sign-in; forbidden access MUST show pilot-access
  recovery guidance; outages MUST offer retry. Messages MUST state cause and recovery in product language
  and contain no tokens, codes or raw provider errors.
- **FR-021**: The sign-in, account, expiry and error screens MUST follow the approved v2 visual language
  and omit signup, password, forgot-password and verify-email interactions.

**Data and operations**

- **FR-022**: User and session storage MUST be added without altering existing records or owner
  identifiers. The synthetic owner MUST NOT be reassigned to a real identity.
- **FR-023**: A guarded operator purge MUST delete only the fixed synthetic owner's records, as specified
  in User Story 4.
- **FR-024**: Operator documentation MUST cover provider configuration, signup-off verification,
  provisioning, disable/re-enable, key and session rotation, and outage recovery, with no secrets,
  addresses or tenant identifiers in tracked files.
- **FR-025**: Tokens, codes, secrets and raw provider errors MUST NOT appear in logs, responses or tracked
  files.

**Native proof** (deferred until the web UI is ready)

- **FR-026**: The native proof MUST use a separate public client with no secret, the system browser with
  proof-of-possession, platform secure storage for renewal credentials, and short-lived access credentials
  held in memory.
- **FR-027**: The shared service client MUST accept a caller-supplied credential source, fetch a fresh
  credential per request, refuse to send when none is available, and keep web behavior unchanged when no
  source is supplied.
- **FR-028**: The device proof MUST reach only an encrypted, network-isolated service instance containing
  synthetic data.

### Key Entities

- **Bike Log User**: an invited pilot rider. Internal owner identifier (unique), external identity pair
  (issuer, subject; unique, immutable), enabled/disabled state, optional email and display-name snapshots.
- **Web Session**: a signed-in browser. Hashed opaque identifier, encrypted provider credentials, the
  user's external identity, expiry, rotation version, timestamps.
- **Sign-in Transaction**: a pending web sign-in. Hashed state, encrypted nonce and verifier, safe return
  path, expiry; consumed once.
- **Owned records** (existing): bikes, components, installations, rides, maintenance, reminder rules and
  usage projections, each already carrying an owner identifier.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Both pilot riders, using separate inboxes, complete first-time sign-in with only an emailed
  code, with zero password prompts.
- **SC-002**: 100% of cross-owner attempts across every record type (direct reads, nested references,
  changes, historical edits, stale-version updates, list paging, usage rebuilds) return "not found" or
  rejection with zero leaked fields.
- **SC-003**: 0 accounts are created by uninvited addresses, and an unprovisioned identity is refused on
  every request.
- **SC-004**: A disabled rider is refused on their very next request.
- **SC-005**: After sign-out or account switching, 0 records from the previous rider are visible.
- **SC-006**: The synthetic purge removes 100% of the synthetic owner's records, 0 other rows, and a
  repeat run changes nothing.
- **SC-007**: 0 credentials, codes, secrets or pilot addresses appear in tracked files, logs or responses.
- **SC-008**: On one selected device, a rider signs in, reads their protected garage, is refused after
  being disabled, and has credentials cleared on sign-out.
- **SC-009**: Sign-in, account, expiry and error screens are usable without horizontal scrolling at
  desktop and narrow mobile widths (down to 320 px).

## Assumptions

- The identity provider is Auth0 using its established email passwordless connection, hosted login, a
  custom service audience and the `BikeLog.Access` permission, on the free tier. The earlier Entra attempt
  was abandoned because an invited user reached a password prompt.
- Pilot size is the owner plus a small number of invited riders; no paid plan, custom domain or production
  email service is in scope.
- All development, tests and demos use synthetic data (Constitution IV). Real records and general remote
  access remain forbidden until both milestones and the ordinary release gates pass.
- Account deletion and data export, hosted deployment, backups of real data and production monitoring
  belong to later milestones.
- Provider-hosted pages control their own layout; Bike Log only approximates the v2 branding there.
- All mobile app work (US5, FR-026–FR-028, SC-008) is sequenced after the web UI is ready. Planning and
  tasks for this feature cover web items first; native items are not scheduled until then.
- The native proof targets one selected device platform; the second platform is validated later.

## Implementation Status (as of 2026-10-12)

Derived from commits, plans and recorded evidence in [docs/auth/](../../docs/auth/).

| Area | Status | Evidence |
| --- | --- | --- |
| Provider feasibility gate (US1, US3 #4; FR-001–002) | **Done, verified 2026-10-09** | [auth0-proof-results.md](../../docs/auth/auth0-proof-results.md): both invited riders signed in by code, unknown addresses created no account, callback and credential checks passed, refresh credential available. Required switching the tenant to Identifier First. |
| Service credential boundary and modes (FR-007, FR-012, FR-014–015) | **Done** | Commit `51a3a5c`; `AuthBoundaryTests`. |
| User registry, owner resolution, current-user profile (FR-003–004, FR-008, FR-013, FR-022) | **Done** | Commit `3a9f573`; `UserAuthorizationTests`. |
| Owner isolation across all records (US2; FR-009–011) | **Done** | Commit `bc5b0e9`; `AuthenticatedOwnershipTests`. |
| Operator provisioning, disable/re-enable, synthetic purge (US3, US4; FR-005–006, FR-023–024) | **Done (code and tests)** | Commit `76f0d39`; `PilotUserCommandTests`, `SyntheticOwnerPurgeTests`; runbook in [auth0-pilot-setup.md](../../docs/auth/auth0-pilot-setup.md). |
| Web sign-in, encrypted sessions, relay, sign-out and auth UI (US1; FR-016–021) | **Done** | Commits `6488c8e`, `559d1c8`, `d9cfa13`; web auth unit tests and `e2e/auth.spec.ts`. |
| Integrated two-rider web check (SC-001, SC-005) | **Done, user-observed 2026-10-09** | Two provisioned riders each saw only their own bike after switching accounts; direct relay requests without a session returned 401. Full suite green on 2026-10-09 (167 web, 29 client, 9 probe, 48 domain, 186 integration tests). |
| Live 403 for an unprovisioned identity (SC-003) | **Done, user-observed 2026-10-12** | [auth0-proof-results.md](../../docs/auth/auth0-proof-results.md): a disabled pilot user saw the pilot-access screen and received 403 from `/api/me` with no user row created; re-enabling restored 200. Commit `5d7a09f`. |
| Running the purge on actual local development data | **Done 2026-10-12** | [auth0-pilot-setup.md](../../docs/auth/auth0-pilot-setup.md): after a backup, guard refusals held, the synthetic owner's rows were deleted, a repeat deleted 0, and pilot owners, users and migrations were unchanged. Commit `cea99ac`. |
| Auth UI at 1440/390/320 px (SC-009) | **Done 2026-10-12** | `e2e/auth.spec.ts` passed 13 of 13 in Chromium, covering entry, account menu, session-expired and pilot-access screens at each width without horizontal overflow; recorded in [auth0-pilot-setup.md](../../docs/auth/auth0-pilot-setup.md). Commit `f084e28`. |
| Native proof (US5; FR-026–028; SC-008) | **Deferred until the web UI is ready** | No `apps/mobile/`; all tasks in [native-auth-proof plan](../../docs/superpowers/plans/2026-10-08-native-auth-proof.md) are unchecked. |

**Remaining work**: the web-first milestone is complete. Only the native proof (US5) remains, and it is
deferred until the web UI is ready.
