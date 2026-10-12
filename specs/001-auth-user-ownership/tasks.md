---

description: "Task list for invite-only sign-in and per-user ownership"
---

# Tasks: Invite-Only Sign-In and Per-User Ownership

**Input**: Design documents from `specs/001-auth-user-ownership/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Included where new code is written. The constitution (III) and the source plans require tests
first; the new tests are the e2e width checks and the Phase B tests.

**Organization**: Tasks are grouped by user story. Work that is **already done** is listed as `[x]` with
the commit that delivered it, so `/speckit-implement` skips it and the history stays traceable.

**Sequencing rule**: Phase 8 (US5, mobile) MUST NOT start until the owner declares the web UI ready.

**Owner action**: Tasks marked 👤 need the project owner, for example to receive an email code in a
pilot inbox or to use a physical device. An agent prepares the step and records the sanitized result.

**Privacy rule for every task**: Never write addresses, Auth0 subjects, tenant IDs, codes, tokens or
secrets to tracked files; private values stay in ignored `.local/`. Run `git diff --cached` and inspect
it before each commit.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: User story from spec.md (US1–US5)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Provider configuration and a known-good baseline

- [x] T001 Configure the disposable Auth0 tenant (email passwordless connection with signup off, Identifier First profile, custom API with `BikeLog.Access`, confidential web app) and pass the invite-only feasibility proof, recorded in docs/auth/auth0-proof-results.md (commits `17f8353`, `6fea22b`, `d82a9fe`)
- [x] T002 Run the regression baseline from specs/001-auth-user-ownership/quickstart.md §A0 (`./scripts/dev.sh test`, `npm run web:test`, `npm run web:typecheck`, `npm run web:lint`, `npm run web:build`, `npm run test --workspace @bikelog/api-client`, `./scripts/dev.sh lint`) and append a dated pass/fail line with test counts to the "Integrated pilot" notes in docs/auth/auth0-pilot-setup.md. If anything fails, stop and report the failure as observed.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: API authentication boundary and owner resolution that every story depends on

- [x] T003 Add explicit `Synthetic | Authenticated` access modes and JWT bearer validation (exact issuer, string or array audience, RS256, lifetime, `BikeLog.Access` in `scope`) in src/Api/Auth/AuthSetup.cs, covered by tests/Integration.Tests/AuthBoundaryTests.cs (commit `51a3a5c`)
- [x] T004 Add `BikeLogUser`, `WebSession` and `OidcLoginTransaction` with additive migration src/Infrastructure/Persistence/Migrations/20261009051928_AddAuthenticationOwnership.cs, request-scoped `ICurrentOwner` resolution in src/Api/Auth/LocalUserAuthorization.cs, and `GET /api/me`, covered by tests/Integration.Tests/UserAuthorizationTests.cs (commit `3a9f573`)

**Checkpoint**: Foundation done.

---

## Phase 3: User Story 1 - Invited rider signs in with an email code (Priority: P1) 🎯 MVP

**Goal**: An invited rider signs in on the web with an emailed code, uses their garage and signs out.

**Independent Test**: Sign in with one provisioned pilot identity, reach the garage, sign out, and
confirm the garage needs a new sign-in. The auth screens fit at 1440/390/320 px.

### Implementation for User Story 1 (done)

- [x] T005 [US1] OIDC start/callback routes and encrypted PostgreSQL session store in apps/web/src/lib/auth/session-store.ts and apps/web/src/app/auth/ (commit `6488c8e`)
- [x] T006 [US1] Session-aware proxy forwarding only the server-held bearer token in apps/web/src/lib/proxy.ts (commit `559d1c8`)
- [x] T007 [US1] Sign-in, account-menu sign-out, session-expired and pilot-access UI in apps/web/src/components/ and apps/web/src/app/auth/logout/route.ts (commit `d9cfa13`)

### Remaining verification for User Story 1 (SC-009)

- [x] T008 [US1] Read apps/web/e2e/auth.spec.ts and add width checks for 1440, 390 and 320 px to the session-expired, pilot-access (unprovisioned) and account-menu tests, matching the existing entry-screen pattern (`page.setViewportSize({ width, height: 900 })` and `document.documentElement.scrollWidth <= width`). Do not change product code unless a check fails, and report any failure as a defect.
- [x] T009 [US1] Run `npm run web:e2e -- auth.spec.ts` (or `./scripts/web-e2e.sh --grep auth`) and append a dated, sanitized result (tests passed per width) to docs/auth/auth0-pilot-setup.md. Commit T008 and T009 as `test: check auth screens at three widths`.

**Checkpoint**: US1 is fully verified.

---

## Phase 4: User Story 2 - Each rider sees and changes only their own garage (Priority: P1)

**Goal**: Complete owner isolation across every resource.

**Independent Test**: Two provisioned riders each see only their own bike, and direct cross-owner
requests return 404.

- [x] T010 [US2] Replace every `IDevelopmentOwner` use with `ICurrentOwner` across src/Api/Features/, bind list cursors to the owner in src/Api/Features/Collections/PageCursor.cs, and cover all resource types in tests/Integration.Tests/AuthenticatedOwnershipTests.cs (commit `bc5b0e9`)
- [x] T011 [US2] Record the user-observed two-account web separation check in docs/auth/auth0-pilot-setup.md (commit `5c01d02`)

**Checkpoint**: US2 complete; no open tasks.

---

## Phase 5: User Story 3 - Operator controls who has access (Priority: P2)

**Goal**: Only provisioned and enabled users have access, and disabling takes effect immediately.

**Independent Test**: An unprovisioned identity gets 403. A disabled user gets 403 on the next request,
and re-enabling restores 200.

- [x] T012 [US3] Provision, disable and enable operator commands in src/Api/Operations/PilotUserCommands.cs, covered by tests/Integration.Tests/PilotUserCommandTests.cs and documented in docs/auth/auth0-pilot-setup.md (commit `76f0d39`)
- [x] T013 👤 [US3] Run specs/001-auth-user-ownership/quickstart.md §A1. Before and after, count `BikeLogUsers` rows. With an Auth0 identity that has no enabled Bike Log user (a third administrator-created test identity, or a pilot user temporarily disabled with `--disable-pilot-user --owner <uuid>`), sign in on `localhost:3000`. Confirm the pilot-access screen and a 403 from `/api/me`, and confirm the row count is unchanged. If a user was disabled, re-enable them and confirm 200. Add a dated row "Unprovisioned or disabled identity is refused by the product API" with sanitized evidence to docs/auth/auth0-proof-results.md and commit it as `docs: record live pilot-access refusal`.

**Checkpoint**: US3 is fully verified.

---

## Phase 6: User Story 4 - Old synthetic records are removed safely (Priority: P2)

**Goal**: The fixed synthetic owner's local records are gone, and nothing else changed.

**Independent Test**: Per-owner counts before and after show only the synthetic owner's rows removed,
and a repeat run deletes 0 rows.

- [x] T014 [US4] Guarded purge command in src/Api/Operations/SyntheticOwnerPurge.cs with src/Api/Operations/LocalDatabaseGuard.cs, covered by tests/Integration.Tests/SyntheticOwnerPurgeTests.cs (commit `76f0d39`)
- [x] T015 [US4] Create `.local/backups/` and take a safety backup with `docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc bikelog_dev > .local/backups/bikelog_dev-pre-purge.dump`. Confirm the file is non-empty and ignored by Git (`git check-ignore`). Then record per-owner row counts (owner UUIDs abbreviated, with pilot owners labeled "pilot A/B") for bikes, components, installations, rides, maintenance, reminder rules and usage projections in a scratch note under `.local/`.
- [x] T016 [US4] Following specs/001-auth-user-ownership/contracts/operator-commands.md, run the purge in synthetic Development mode against `bikelog_dev`. First confirm it is refused without `--confirm-delete-synthetic` and in authenticated mode, then run it with the flag and save the printed counts. Run it again and confirm 0 rows deleted. Re-count and confirm only the synthetic owner's rows fell to 0, and that `BikeLogUsers`, `__EFMigrationsHistory` and the pilot owners' rows are unchanged. If any other row changed, restore from the T015 backup and stop.
- [x] T017 [US4] Append a dated, sanitized purge result (per-table counts deleted, repeat = 0, guard refusals, other owners unchanged) to the synthetic purge section of docs/auth/auth0-pilot-setup.md and commit it as `docs: record local synthetic purge`.

**Checkpoint**: US4 is fully verified.

---

## Phase 7: Web-First Milestone Closure (Cross-Cutting)

**Purpose**: Constitution compliance and accurate status. Completes the web-first milestone.

- [x] T018 [P] Write docs/decisions/0002-auth0-invite-only-identity.md in the style of docs/decisions/0001-local-backend.md. It records the decision (Auth0 email passwordless, signup off, Identifier First, custom API audience and `BikeLog.Access`, free tier), context (the Entra attempt failed per docs/auth/identity-proof-results.md), alternatives (Entra External ID, Auth0 database OTP, passwords or open signup) and consequences (operator provisioning, provider dependency, and native proof still pending), using research.md D1–D4.
- [x] T019 [P] Update the `Status:` line of docs/superpowers/specs/2026-10-08-authentication-ownership-design.md to say that the web-first milestone was implemented and verified on 2026-10-09, that the native proof is deferred until the web UI is ready, and that the spec is tracked in specs/001-auth-user-ownership/spec.md.
- [x] T020 Update the "Implementation Status" table in specs/001-auth-user-ownership/spec.md so the live 403, purge and width rows read Done with the evidence links from T009, T013 and T017, and change the "Remaining work" paragraph to name only the deferred native proof (depends on T009, T013, T017).
- [x] T021 Run `./scripts/dev.sh lint` and `git diff --check`, and scan the staged changes for addresses, Auth0 `user_id` values, tenant domains, tokens and secrets. Commit T018–T020 as `docs: close web-first authentication milestone`.

**Checkpoint**: The web-first milestone is complete, and every spec status row except the native proof
reads Done.

---

## Phase 8: User Story 5 - Same sign-in works from a native mobile device (Priority: P3) ⏸ DEFERRED

**⚠️ GATE**: Do not start until the owner declares the web UI ready. The detailed steps are in
docs/superpowers/plans/2026-10-08-native-auth-proof.md; follow its interfaces exactly.

**Goal**: Prove on one selected device that an invited rider gets a Bike Log API token, reads their
protected empty garage, loses access when disabled, and clears credentials on sign-out.

**Independent Test**: specs/001-auth-user-ownership/quickstart.md "Phase B outline" passes on the device.

### Native registration and redirect proof

- [ ] T022 [US5] Choose the target platform (iOS or Android) with the owner. From current Expo documentation, pin the Expo SDK, `expo-auth-session`/`expo-web-browser` and secure-storage versions, and record them under D6 in specs/001-auth-user-ownership/research.md.
- [ ] T023 [US5] Scaffold the minimal Expo development build in apps/mobile/ (workspace `@bikelog/mobile` with `test` and `typecheck` scripts; root package.json and package-lock.json updated). Register a separate Auth0 **public native** application with no secret, the custom API audience, `BikeLog.Access` and the app redirect. Document the nonsecret setup in docs/auth/auth0-pilot-setup.md.
- [ ] T024 [US5] Write failing tests in apps/mobile/tests/pilot-redirect.test.ts for wrong state, nonce or redirect, replay rejection, canceled-browser recovery, and no token or code logging. Confirm red with `npm run test --workspace @bikelog/mobile`.
- [ ] T025 [US5] Implement `beginPilotSignIn(): Promise<{ accessToken: string; expiresAt: number }>` in apps/mobile/src/auth/pilot-redirect.ts. It uses the system browser with PKCE, `connection=email` and the API audience, and keeps the token in memory only, with no web cookie, webview or client secret. Make T024 green and run `npm run typecheck --workspace @bikelog/mobile`.
- [ ] T026 👤 [US5] On the device, complete first-time email-code sign-in for an administrator-created rider with signup off, and confirm that an unknown address is denied. Show only sanitized issuer, audience and scope booleans, and record them in docs/auth/native-redirect-results.md. **Stop and revise the design with the owner if this fails.** Commit as `test: prove invite-only native redirect`.

### Shared client bearer mechanism

- [ ] T027 [P] [US5] Write failing tests in packages/api-client/tests/client.test.ts: a fresh token per request, a null token rejected before fetch, omitted callback preserving web behavior (no Authorization header), no provider or session data in the URL or body, and no stale header after an identity switch.
- [ ] T028 [US5] Extend `createApiClient(baseUrl, fetchImpl?, getAccessToken?: () => Promise<string | null>)` in packages/api-client/src/client.ts and export it from packages/api-client/src/index.ts. Make T027 green, run `npm run typecheck --workspace @bikelog/api-client`, and commit as `feat: allow caller-supplied API bearer tokens`.

### Isolated device endpoint

- [ ] T029 [P] [US5] Add a temporary device-endpoint runbook to docs/auth/auth0-pilot-setup.md. It covers creating a disposable synthetic database, a development TLS certificate trusted on the device, authenticated Kestrel on the LAN only, firewall limits, and removal afterwards. Keep addresses and secrets out.
- [ ] T030 👤 [US5] From the device, confirm the TLS endpoint returns 401 without a token and 401 with a wrong-audience token, that only synthetic rows exist, and that there is no public internet route. Record the results in docs/auth/native-proof-results.md and stop if TLS trust or isolation fails.

### Secure native session and protected read

- [ ] T031 [US5] Write failing tests in apps/mobile/tests/native-session.test.ts and apps/mobile/tests/protected-read.test.ts: PKCE success, interrupted or wrong state, secure-store failure, refresh rotation, API 401 and 403, cache cleared on sign-out or lost access, and no client secret.
- [ ] T032 [US5] Implement `NativeSession` (`signIn`, `getAccessToken` with renewal before expiry, `signOut`) in apps/mobile/src/auth/native-session.ts, secure storage in apps/mobile/src/auth/secure-credentials.ts, `createNativeApi` and `readEmptyGarage()` (`listBikes({ pageSize: 1 })`, showing a count only) in apps/mobile/src/api.ts, and a minimal sign-in/read/sign-out/error screen in apps/mobile/src/App.tsx. Refresh credentials go only in secure storage; access tokens stay in memory and are never logged. Make T031 green.
- [ ] T033 👤 [US5] Device proof: sign in, read the empty garage over TLS (200), run `--disable-pilot-user` and confirm 403 on the next read, then sign out and confirm credentials and cache are cleared. Record the dated platform, HTTP outcomes and sanitized screenshots in docs/auth/native-proof-results.md. Commit as `test: prove native Bike Log authorization`.

**Checkpoint**: US5 complete; the native gate in the native-auth-proof plan is satisfied.

---

## Phase 9: Polish & Final Closure

- [ ] T034 Run the mobile, api-client and API ownership test suites with typechecks, `./scripts/dev.sh lint` and `git diff --check`. Then set the native-proof row in specs/001-auth-user-ownership/spec.md to Done with links to docs/auth/native-redirect-results.md and docs/auth/native-proof-results.md (depends on T033).
- [ ] T035 Update the consequences section of docs/decisions/0002-auth0-invite-only-identity.md and the Status line of docs/superpowers/specs/2026-10-08-authentication-ownership-design.md to say the native proof passed, and note that real-data use still requires the ordinary release gates.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1**: T001 done; T002 first, because it is the baseline for everything open.
- **Phase 2**: done.
- **Phases 3–6 (US1, US3, US4 open items)**: depend only on T002 and are independent of each other.
- **Phase 7**: T018 and T019 can run any time. T020 depends on T009, T013 and T017. T021 is last in the
  phase.
- **Phase 8 (US5)**: blocked by the **web UI ready** gate and by Phase 7. Inside it: T022 → T023 → T024 →
  T025 → T026 (a hard stop on failure); T027 → T028; T029 → T030; T031 → T032 → T033, which needs T026,
  T028 and T030.
- **Phase 9**: after T033.

### User Story Dependencies

- US1, US2, US3 and US4 are implemented, and their open items are independent verification tasks.
- US5 depends on the web-first milestone (Phase 7) and the owner's web-UI-ready gate.

### Parallel Opportunities

- Once T002 passes, T008/T009 (US1), T013 (US3), T015–T017 (US4), T018 and T019 can proceed in
  parallel. T013 and T016 both use `bikelog_dev`, so don't run them at the same moment.
- In Phase 8, the client track (T027–T028) and the endpoint track (T029–T030) can run alongside the
  redirect track (T022–T026).

---

## Parallel Example: Phase A (now)

```bash
Task: "T008 Add width checks to apps/web/e2e/auth.spec.ts"
Task: "T018 Write docs/decisions/0002-auth0-invite-only-identity.md"
Task: "T019 Update status line in docs/superpowers/specs/2026-10-08-authentication-ownership-design.md"
Task: "T015 Back up bikelog_dev to .local/backups/ and record per-owner counts"
```

## Parallel Example: User Story 5 (after the gate)

```bash
Task: "T027 Failing token-callback tests in packages/api-client/tests/client.test.ts"
Task: "T029 Device-endpoint runbook in docs/auth/auth0-pilot-setup.md"
Task: "T024 Failing redirect tests in apps/mobile/tests/pilot-redirect.test.ts"
```

---

## Implementation Strategy

### MVP (already delivered)

US1 and US2 are implemented and user-verified: invite-only web sign-in with isolated garages.

### Now: close the web-first milestone

1. T002 baseline.
2. T008–T009, T013, T015–T017 for the evidence gaps.
3. T018–T021 for the decision record, status updates and commit.
4. **Stop**: the web-first milestone is complete. Continue other web UI work outside this feature.

### Later: native proof

When the owner declares the web UI ready, run Phase 8 in order, honoring the hard stops at T026 and
T030, then Phase 9.

---

## Notes

- `[x]` = delivered before this task list was generated; the commit hash is evidence.
- 👤 = needs the owner (inbox or device), and the agent records sanitized results.
- Commit after each logical group with Conventional Commit prefixes.
- Never run the purge or operator commands at startup or against any database other than `bikelog_dev`.
