# Native Authentication Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove on one selected device/platform that an invited customer can obtain a Bike Log API token, read their protected empty garage, and lose access when disabled.

**Architecture:** After the web sign-in milestone works, create a small Expo development build and prove the invite-only redirect with a separate native public client registration. Then add a protected API read using the system browser, authorization code with PKCE, platform secure storage for refresh credentials, and the shared API client with a caller-supplied bearer token. This is a device/API contract proof; full native screens are a later milestone.

**Tech Stack:** Expo/React Native versions pinned at execution from current supported docs, platform secure storage, `@bikelog/api-client`, selected iOS or Android development build, authenticated TLS endpoint with synthetic test data.

**Spec:** `docs/superpowers/specs/2026-10-08-authentication-ownership-design.md`

## Global Constraints

- Run only after the feasibility, API, and web-session plans pass. Register the native public client and prove signup-off email-code sign-in on an Expo development build before native API integration; use no client secret or web cookie.
- System browser and PKCE are required. Store refresh credentials only in platform secure storage; keep short-lived access tokens in memory.
- Device calls use an authenticated TLS API endpoint containing only synthetic test data; no general remote access or real personal records.
- Clear credentials and cached garage data on sign-out, disabled account, or lost access. Do not build full React Native garage screens in this milestone.

## Review Focus

- A web ID token or access token for another audience must not authenticate a native API request; an API-scoped access token may be used by either registered client.
- Secure-storage read failure or missing/rotated refresh credentials must return to sign-in and clear cached data.
- A disabled local user must receive 403 on the next protected request despite an unexpired Auth0 token.
- An interrupted system-browser redirect must not leave a half-authenticated state.
- The shared client must never attach a stale token or owner ID after identity changes.

---

## File map and task order

`apps/mobile/` is created in this plan after the working web flow. `apps/mobile/src/auth/` owns PKCE redirect, token renewal, secure storage, and sign-out; `apps/mobile/src/App.tsx` shows sign-in, connection result, and one read. `packages/api-client/src/client.ts` accepts an optional caller-supplied token source while retaining web proxy behavior. A temporary LAN-only HTTPS API with a device-trusted development certificate and synthetic database supports the proof. Tests live in `apps/mobile/tests/` and `packages/api-client/tests/`.

### Task 1: Native registration and invite-only redirect proof

**Files:** Create `apps/mobile/` with a minimal Expo development-build shell, `apps/mobile/src/auth/pilot-redirect.ts`, `apps/mobile/tests/pilot-redirect.test.ts`, and `docs/auth/native-redirect-results.md`; modify root `package.json`, `package-lock.json`, `docs/auth/auth0-pilot-setup.md`.

**Interfaces:** Register a distinct Auth0 public native application with the Bike Log custom API audience, `BikeLog.Access` scope, and the selected app redirect. `beginPilotSignIn(): Promise<{ accessToken: string; expiresAt: number }>` uses the system browser and PKCE, requests `connection=email` and the API audience, and validates state/nonce/redirect, and holds the access token only in memory. The probe displays sanitized verified issuer/audience/scope presence, never token text.

- [ ] **Step 1: Write failing tests.** In `pilot-redirect.test.ts`, assert wrong state/nonce/redirect and replay rejection, canceled browser recovery, and absence of token/code logging.
- [ ] **Step 2: Run the probe tests.** `npm run test --workspace @bikelog/mobile`; expected: red on missing redirect handler.
- [ ] **Step 3: Implement the probe.** Pin current Expo dependencies, register the native client/redirect, and use the system browser with authorization code and PKCE; no web cookie, embedded webview, or client secret.
- [ ] **Step 4: Run the probe tests.** Expected: green; also run `npm run typecheck --workspace @bikelog/mobile`.
- [ ] **Step 5: Perform the provider proof.** On the selected device, complete first-time email-code sign-in for an administrator-created customer while public signup is disabled; confirm unknown-account denial, app redirect, verified API issuer/audience/`BikeLog.Access` scope, and sanitized results in `native-redirect-results.md`. If this fails, stop native integration and revise the design with the owner.
- [ ] **Step 6: Commit.** `git commit -m "test: prove invite-only native redirect"` with only the scaffold and sanitized evidence.

### Task 2: Shared client bearer mechanism

**Files:** Modify `packages/api-client/src/client.ts`, `packages/api-client/src/index.ts`; extend `packages/api-client/tests/client.test.ts`.

**Interfaces:** Extend `createApiClient(baseUrl: string, fetchImpl?: typeof fetch, getAccessToken?: () => Promise<string | null>)`. When supplied, obtain a fresh token before each request and attach `Authorization: Bearer`; when omitted, send no Authorization header, preserving the web same-origin proxy. No provider logic, owner ID, or refresh credential enters this package.

- [ ] **Step 1: Write failing tests.** Assert fresh token per request, null token rejected before fetch, omitted callback preserving web behavior, no provider/session data in URL/body, and no stale header after identity switch.
- [ ] **Step 2: Run the client tests.** `npm run test --workspace @bikelog/api-client`; expected: red on missing token callback.
- [ ] **Step 3: Implement the interface.** Add the optional token callback at the single transport boundary.
- [ ] **Step 4: Run the tests.** Run the client tests and `npm run typecheck --workspace @bikelog/api-client`; expected: green.
- [ ] **Step 5: Commit.** `git commit -m "feat: allow caller-supplied API bearer tokens"` with only this task's files.

### Task 3: Isolated device API endpoint

**Files:** Create `docs/auth/native-proof-results.md`; modify `docs/auth/auth0-pilot-setup.md` with a temporary-device-endpoint runbook.

**Interfaces:** The development build receives a configured `https://` API base URL reachable on the selected local network. Kestrel runs in authenticated mode against a dedicated synthetic PostgreSQL database; a development certificate trusted on the selected device supplies TLS. Firewall/network rules limit access to that device/LAN. The API still requires an API-scoped bearer token; OpenAPI and health expose no user records.

- [ ] **Step 1: Document setup.** Record how to create the disposable database, issue/trust the development certificate on the selected device, start authenticated Kestrel on the LAN, and remove certificate/binding after the proof. Keep actual addresses and secrets out of tracked docs.
- [ ] **Step 2: Verify connectivity.** From the device, call the TLS endpoint without a token; expected: valid TLS connection and 401. With a wrong-audience token, expected: 401. Confirm the database has only synthetic rows and no public internet route.
- [ ] **Step 3: Record evidence.** Add dated platform, certificate trust, reachability, and 401 results to `native-proof-results.md`. Stop if TLS trust or network isolation fails.

### Task 4: Secure native session and protected read

**Files:** Modify `apps/mobile/src/App.tsx` from Task 1; create `apps/mobile/src/auth/native-session.ts`, `secure-credentials.ts`, `api.ts`; add `apps/mobile/tests/native-session.test.ts`, `protected-read.test.ts`; modify `apps/mobile/package.json`, root `package-lock.json`.

**Interfaces:** `NativeSession.signIn(): Promise<void>` invokes system-browser PKCE flow; `NativeSession.getAccessToken(): Promise<string | null>` renews before expiry; `NativeSession.signOut(): Promise<void>` clears secure storage and in-memory cache. `createNativeApi(session: NativeSession)` calls shared `createApiClient` with the token callback. `readEmptyGarage()` invokes `listBikes({ pageSize: 1 })` and displays a count only; no full garage UI.

- [ ] **Step 1: Write failing tests.** Assert successful PKCE result, interrupted/wrong-state result, secure-store failure, refresh rotation, API 401/403, cache clearing on sign-out/lost access, and no client secret.
- [ ] **Step 2: Run mobile tests.** Use the `test` script established in the feasibility scaffold: `npm run test --workspace @bikelog/mobile`; expected: red on missing session layer.
- [ ] **Step 3: Implement native session.** Use current Expo-supported secure storage and token renewal; access tokens remain in memory, never AsyncStorage or logs. Add the minimal sign-in/read/sign-out/error screen.
- [ ] **Step 4: Run focused tests.** Run mobile tests and `npm run typecheck --workspace @bikelog/mobile`; expected: green.
- [ ] **Step 5: Perform the device proof.** On the selected development build, sign in, read the protected empty garage over TLS, disable the local user and confirm 403 on the next read, then sign out and confirm credentials/cache cleared. Record dated device/platform, nonsecret configuration, HTTP outcomes, and sanitized screenshots in `docs/auth/native-proof-results.md`.
- [ ] **Step 6: Verify and commit.** Run mobile and shared-client tests/typechecks, API ownership tests, and `git diff --check`; expected: green. Commit `test: prove native Bike Log authorization` with only this task's files and sanitized evidence.

**Native gate:** Review the distinct native signup-off redirect proof, protected device read, and revocation evidence. The web milestone is already complete before this plan begins. Real-data consideration still requires the combined web/API/native evidence and ordinary release gates; deployment, backup recovery, and full native UI have later gates.
