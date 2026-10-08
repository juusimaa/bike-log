# Web Sign-In and Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let invited customers sign in through Auth0 email code, use the existing web garage through a secure server-held API token, and sign out without retaining another user's data.

**Architecture:** Next.js App Router handles OIDC code exchange and an opaque cookie. A PostgreSQL session row stores encrypted provider tokens and renewal metadata; the existing same-origin `/api/[...path]` proxy resolves the session, refreshes access when needed, and forwards only the server-held API bearer token. The garage remains a client component behind a server-side session gate.

**Tech Stack:** Next.js 16.3.8, React 19.3.0, Node 24, PostgreSQL, a pinned maintained OIDC client chosen against current Auth0/Next docs, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-08-authentication-ownership-design.md`

## Global Constraints

- The web feasibility and API plans must pass first. Use the Auth0 confidential web application and custom API audience/`BikeLog.Access` scope; native registration belongs to the later native proof plan.
- Browser cookies contain only an opaque session identifier with `Secure`, `HttpOnly`, and suitable `SameSite`; provider tokens remain encrypted at rest on the server, never in browser JavaScript storage.
- Preserve proxy route allowlist, method checks, no-store responses, same-origin mutation checks, and manual redirect handling. Browser-supplied bearer headers never determine the user.
- Auth0 Universal Login collects email and code. Preserve v2 sage/forest entry, account, expiration, and retry visuals where practical; omit mock signup, password, forgot-password, and verify-email interactions.
- Use product-language errors with cause and recovery. Never expose token/code/raw provider diagnostics; never replay a mutation automatically after authentication.
- Read `apps/web/AGENTS.md` and the installed `apps/web/node_modules/next/dist/docs/` guidance relevant to changed App Router APIs before coding.

## Review Focus

- A callback with wrong/missing state, nonce, PKCE verifier, or redirect URI must create no session.
- Concurrent refreshes for one session must rotate credentials once and never persist a stale refresh token over a newer one.
- A browser `Authorization` header must be ignored even when a valid session exists; a missing session must never reach the upstream API.
- A forged cross-origin mutation or unsafe return path must be rejected before redirect or upstream fetch.
- Signing out or switching identity must cancel requests and clear all TanStack Query data so the prior garage never flashes.

---

## File map and task order

`apps/web/src/lib/auth/` owns Auth0 config, OIDC flow, encrypted PostgreSQL session repository, and cookie helpers. `apps/web/src/app/auth/` owns start/callback/logout routes. `apps/web/src/lib/proxy.ts` remains the allowlisted transport; `apps/web/src/app/page.tsx` gains the session gate. `apps/web/src/components/` and `globals.css` hold v2-derived UI. The API plan's additive `WebSessions` migration supplies storage. Each task closes with focused tests and a commit.

### Task 1: Session storage and OIDC callback

**Files:** Create `apps/web/src/lib/auth/config.ts`, `oidc.ts`, `session-store.ts`, `cookies.ts`, `apps/web/src/app/auth/start/route.ts`, `apps/web/src/app/auth/callback/route.ts`; modify `apps/web/package.json`, `package-lock.json`; add `apps/web/tests/auth-callback.test.ts`, `session-store.test.ts`. Consume the API plan's `WebSessions` migration.

**Interfaces:** `startLogin(returnTo: string): Promise<Response>` creates one-use server-side state/nonce/PKCE transaction and requests `openid profile email offline_access BikeLog.Access` with the configured API `audience` and `connection=email`; `completeLogin(request: Request): Promise<Response>` validates it and exchanges code server-side; `SessionStore.create(identity: { issuer: string; subject: string }, tokens: TokenEnvelope): Promise<string>` returns a random opaque ID; `SessionStore.get(id: string): Promise<SessionRecord | null>`; `SessionStore.rotate(id: string, expectedVersion: number, tokens: TokenEnvelope): Promise<boolean>` uses compare-and-swap; `SessionStore.delete(id: string): Promise<void>`. PostgreSQL `WebSessions` stores a hash of ID, encrypted token envelope, subject key, expiry, rotation version, and timestamps. AES-GCM protection key comes from secret configuration, not source.

- [ ] **Step 1: Write failing tests.** Assert invalid state/nonce/verifier/redirect, callback replay, missing settings, random opaque ID, encrypted DB payload, Secure/HttpOnly/SameSite cookie, and one winner in concurrent rotation.
- [ ] **Step 2: Run the focused tests.** `npm run test --workspace @bikelog/web -- tests/auth-callback.test.ts tests/session-store.test.ts`; expected: red on absent auth modules.
- [ ] **Step 3: Implement callback and storage.** Use the pinned OIDC client and `pg`, secure connection handling, encrypted tokens and login transactions, atomic one-use state, and compare-and-swap token rotation. A failed callback writes no session.
- [ ] **Step 4: Run the tests.** Run the focused command, `npm run web:typecheck`, and `npm run web:lint`; expected: green. With the disposable Auth0 tenant, verify an invited callback sets only an opaque cookie and a locally unprovisioned identity is denied by `/api/me`. Check refresh-token issuance or document a bounded session that returns to sign-in on expiry.
- [ ] **Step 5: Commit.** `git commit -m "feat: add Auth0 web login and encrypted sessions"` with only this task's files.

### Task 2: Session-aware API proxy and renewal

**Files:** Create `apps/web/src/lib/auth/access-token.ts`; modify `apps/web/src/lib/proxy.ts`, `apps/web/src/app/api/[...path]/route.ts`; extend `apps/web/tests/proxy.test.ts`; create `apps/web/tests/access-token.test.ts`.

**Interfaces:** `getApiAccessToken(request: Request): Promise<string | null>` resolves/renews the cookie session and returns an API-scoped access token or null; `forwardApi(request: Request, path: string[], accessToken: string | null): Promise<Response>` retains allowlist and origin rules, forwards `Authorization: Bearer ${accessToken}` only from the server, and returns sanitized 401 on no session. Configure public origin/upstream from validated server settings; use exact origin matching rather than hard-coded localhost in authenticated mode. Local synthetic mode keeps existing fixed-loopback behavior during transition.

- [ ] **Step 1: Write failing tests.** Assert missing/expired/revoked cookie → 401 with zero upstream fetches; valid session → server token only; browser bearer/cookie/host/forwarded headers omitted; wrong Origin → 403; existing route/method/JSON/no-store/redirect checks retained; failed refresh deletes session and returns 401.
- [ ] **Step 2: Run the focused tests.** `npm run test --workspace @bikelog/web -- tests/proxy.test.ts tests/access-token.test.ts`; expected: red on absent session wiring.
- [ ] **Step 3: Implement the proxy.** Add access-token retrieval, expiry margin, serialized refresh/compare-and-swap, invalidation, and proxy wiring. Never retry writes after 401 or uncertain outcomes.
- [ ] **Step 4: Run the tests.** Run the focused command, `npm run web:test`, `npm run web:typecheck`, and `npm run web:lint`; expected: green.
- [ ] **Step 5: Commit.** `git commit -m "feat: proxy API requests with server-held bearer token"` with only this task's files.

### Task 3: Garage gate, sign-out, and auth UI

**Files:** Create `apps/web/src/app/auth/logout/route.ts`, `apps/web/src/components/SignIn.tsx`, `SessionExpired.tsx`; modify `apps/web/src/app/page.tsx`, `apps/web/src/features/garage/Workspace.tsx`, `apps/web/src/components/AppShell.tsx`, `apps/web/src/lib/query.ts`, `apps/web/src/lib/mutation.ts`, `apps/web/src/app/globals.css`; add `apps/web/tests/auth-ui.test.tsx`, `apps/web/e2e/auth.spec.ts`.

**Interfaces:** `getWebSession(): Promise<SessionRecord | null>` backs the server page, which renders `SignIn` or a keyed garage provider for the current `(issuer,subject)`; `signOut(): Promise<Response>` deletes session, clears cookie, invokes provider logout when supported, and yields a safe local redirect. A 401 from the proxy triggers session-expired UI and cache removal; 403 shows pilot-access recovery. Keep unsent form input until user chooses to leave, but never resubmit automatically.

- [ ] **Step 1: Write failing tests.** Assert signed-out gate, safe return path, menu sign-out, query cancellation/clear on identity change, 401/403/outage copy, unsent edit retention, and no automatic write replay. Add Playwright entry/menu/expiry/retry checks at 1440px, 390px, and 320px.
- [ ] **Step 2: Run the focused tests.** `npm run test --workspace @bikelog/web -- tests/auth-ui.test.tsx`; expected: red on absent UI/session gate.
- [ ] **Step 3: Implement the UI.** Use the v2 visual source for the Bike Log entry/account states and redirect to Auth0-hosted credential fields; omit mock password/signup/recovery controls; wire sign-out, expiry, and account state without changing garage workflows.
- [ ] **Step 4: Run the tests.** Run `npm run web:test`, `npm run web:typecheck`, `npm run web:lint`, `npm run web:build`, and the managed `npm run web:e2e -- auth.spec.ts`; expected: green. With two invited identities and synthetic rows, verify separated garages, sign-out, expiry, and direct browser requests.
- [ ] **Step 5: Commit.** `git commit -m "feat: add invite-only web sign-in experience"` with only this task's files.
