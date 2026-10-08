# Invite-Only Auth0 Web Feasibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that two administrator-created Auth0 passwordless customers can sign in by email code with public signup disabled and receive Bike Log API access tokens through a web redirect.

**Architecture:** Configure a disposable Auth0 tenant with an established email passwordless connection, one confidential web application, and one custom API. Adapt the existing local OIDC redirect probe, retain the failed Entra evidence as history, and record a separate sanitized Auth0 result. This gate must pass before API or web product work; native proof follows the working web milestone.

**Tech Stack:** Auth0 Universal Login and Management API, OIDC authorization code with PKCE, Node 24, `openid-client` 6.8.8, `jose` 6.2.12.

**Spec:** `docs/superpowers/specs/2026-10-08-authentication-ownership-design.md`

## Global Constraints

- Public signup remains disabled on the passwordless email connection. Do not use the newer database-connection OTP feature, passwords, or an open-signup workaround.
- The web client requests the custom Bike Log API audience and `BikeLog.Access` scope; an ID token cannot stand in for its access token.
- Use only the two approved pilot inboxes and a synthetic unknown address. Keep addresses, codes, tokens, and secrets in ignored local configuration or inboxes, never Git or screenshots.
- Verify Auth0's current free-tier and test-email limits before creating the disposable tenant. No paid plan, custom domain, or production email service is authorized by this plan.
- Keep `docs/auth/entra-pilot-setup.md` and `docs/auth/identity-proof-results.md` as sanitized evidence of the failed Entra proof.

## Review Focus

- An unknown address must not create an Auth0 user or receive a usable code with signup disabled; Task 3 records the observed outcome.
- Both precreated customers must reach an email-code prompt on first sign-in without a password prompt; Task 3 checks each separately.
- A newly created passwordless user may receive an unexpected verification or welcome email; Task 1 records its behavior before the sign-in test.
- The access token may have a string or array `aud` and uses `scope` rather than Entra's `scp`; Task 2 tests both audience forms and the exact scope member.
- Wrong state, nonce, redirect, signature, or replay must yield no successful proof result; Task 2 tests each case.

---

## File map and task order

`docs/auth/auth0-pilot-setup.md` holds dated provider configuration guidance, while `docs/auth/auth0-proof-results.md` holds only sanitized observations. The worktree currently has uncommitted Entra proof files and a local `probes/identity/web/` harness; inspect and preserve them before adaptation. `probe.mjs` owns one-use callback checks and claim-summary logic; `server.mjs` owns Auth0 discovery, authorization, code exchange, verified access-token inspection, and response redaction. Their tests live in `probes/identity/web/tests/probe.test.mjs`. Actual tenant IDs, client credentials, and pilot addresses stay under ignored `.local/identity-proof/`.

### Task 1: Disposable Auth0 configuration and account behavior

**Files:** Create `docs/auth/auth0-pilot-setup.md`, `docs/auth/auth0-proof-results.md`; keep existing Entra docs unchanged.

**Interfaces:** Provide exact nonsecret configuration keys for the probe: `issuer`, `apiAudience`, `apiScope`, `webClientId`, and `redirectUri`. Store their actual values, plus a confidential client credential, only in ignored local files. Use the established passwordless email connection named `email` and one custom API permission named `BikeLog.Access`.

- [ ] **Step 1: Check provider requirements.** Verify dated official Auth0 pricing, built-in email sender limits, passwordless signup-off behavior, Management API user creation, Universal Login connection selection, refresh-token/offline-access settings, and localhost redirect rules. Record URLs and free-only configuration in `auth0-pilot-setup.md`.
- [ ] **Step 2: Create proof configuration.** Configure the disposable tenant, custom API with RS256 and `BikeLog.Access`, confidential web application with Authorization Code and Allow Offline Access checked, exact `http://127.0.0.1:3000/auth/callback` redirect, and passwordless email connection. Disable signups, enable only the intended connection for the web app, and read back settings. Record actual nonsecret IDs privately.
- [ ] **Step 3: Create the two approved customers.** Use the Management API or dashboard to create each user in the `email` connection. Inspect whether creation sends a verification/welcome email; record only sanitized behavior. Do not mark an address verified as an operator assertion without recording that choice; the sign-in code must prove inbox control.
- [ ] **Step 4: Prepare results.** Create separate rows in `auth0-proof-results.md` for configuration, account-creation email, both first sign-ins, unknown-address denial, callback checks, token issuer/audience/scope/signature, refresh-token availability, and no leaked credential material. Expected: no row is called Pass before direct observation.

### Task 2: Adapt and verify the local web redirect probe

**Files:** Modify `probes/identity/web/probe.mjs`, `server.mjs`, `package.json`, `tests/probe.test.mjs`; modify root `package-lock.json` for the pinned `jose` dependency if needed.

**Interfaces:** `completeCallback({ url, sessionId, store, redirectUri, exchange }): Promise<{ issuer: string; audienceMatches: boolean; scopeMatches: boolean; hasSubject: boolean }>` consumes a transaction once. The `exchange` function performs the OIDC code exchange and verifies the returned JWT access token against the Auth0 issuer's JWKS, expected issuer, API audience, expiration, and scope. The HTTP response prints only booleans and safe claim presence, never IDs, addresses, code, or token text.

- [ ] **Step 1: Write failing tests.** In `probe.test.mjs`, assert wrong state/nonce/redirect, reused callback, missing code, invalid JWT signature, wrong issuer/audience/scope, string and array audiences, and sanitized output. Test `scope` as a space-delimited claim, not `scp`.
- [ ] **Step 2: Run red.** Run `npm run test --workspace @bikelog/identity-web-probe`; expected: the Auth0 claim and verification cases fail against the existing Entra-specific probe.
- [ ] **Step 3: Implement the adaptation.** Read Auth0 `issuer`, audience, scope, and client settings from ignored configuration; send `connection=email`, `audience`, `scope` (`openid profile email offline_access BikeLog.Access`), state, nonce, and PKCE in `/authorize`. Keep the one-use callback store; use `jose` JWKS verification and report only sanitized booleans. Never persist tokens.
- [ ] **Step 4: Run green.** Run the focused probe tests and `git diff --check`; expected: all probe cases pass and no credential text appears in tracked changes.
- [ ] **Step 5: Commit the reusable probe.** Stage only the probe and lockfile; commit `test: adapt identity redirect probe for Auth0`. Leave provider results for Task 3.

### Task 3: Execute and record the Auth0 gate

**Files:** Modify `docs/auth/auth0-proof-results.md`, `docs/auth/auth0-pilot-setup.md` with sanitized observations.

**Interfaces:** A Pass requires both approved existing customers to complete first-time email-code sign-in, the unknown address to create no account, a one-use callback, and a verified access token whose issuer, API audience, and `BikeLog.Access` scope match the configured values. Record whether `offline_access` yields a refresh token; if absent, the web plan must use a bounded session and return to sign-in at access-token expiry.

- [ ] **Step 1: Exercise both existing accounts.** Complete the hosted email-code flow separately for each approved inbox through the local probe. Inspect the callback summary and check the Auth0 connection/user IDs privately; do not save codes or token contents.
- [ ] **Step 2: Exercise denial and callback checks.** Try one synthetic unknown address, verify no new user was created, and run state/nonce/replay rejection checks. Observe whether the hosted page reveals account existence and record that usability/security behavior without saving the address.
- [ ] **Step 3: Record a dated gate result.** Mark each `auth0-proof-results.md` row Pass/Fail with sanitized evidence and describe any account-creation email. If any required row fails, stop before API/web implementation and return to the owner with the observation.
- [ ] **Step 4: Verify and commit a passing proof.** Run `npm run test --workspace @bikelog/identity-web-probe` and `git diff --check`; inspect `git diff --cached` for private data. Commit only sanitized Auth0 setup/results as `docs: record Auth0 invite-only web proof` after the gate passes.

**Gate:** The API plan later verifies 403 for a valid Auth0 identity without local Bike Log provisioning. The separate native plan repeats the signup-off code and API-token proof on an Expo device after the web milestone.
