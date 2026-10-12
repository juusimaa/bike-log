# Research: Invite-Only Sign-In and Per-User Ownership

No open NEEDS CLARIFICATION items remain. Most decisions were made and proven in the source design and
its feasibility proof. This file consolidates them and records what Phase A must still produce.

## Decisions

### D1. Identity provider: Auth0 email passwordless

- **Decision**: Use Auth0's established email passwordless connection (code, not link) with Universal
  Login, public signup disabled and only the `email` connection enabled for the web app. Set the tenant
  authentication profile to **Identifier First**.
- **Rationale**: Proven on 2026-10-09 ([auth0-proof-results.md](../../docs/auth/auth0-proof-results.md)).
  Both pilot users reached a code prompt without a password, and uninvited addresses created no account.
  Free tier at $0.
- **Alternatives considered**: Microsoft Entra External ID was rejected because an admin-created customer
  hit a password prompt ([identity-proof-results.md](../../docs/auth/identity-proof-results.md)). Auth0
  database-connection OTP was rejected because its availability is uncertain. Passwords or open signup
  were rejected by the design.
- **Follow-up**: The constitution requires identity choices in `docs/decisions/`, and no record exists
  yet. Phase A writes `0002-auth0-invite-only-identity.md`.

### D2. API authorization: access token plus local user

- **Decision**: JWT bearer validation with one exact issuer, the custom API audience (string or array
  `aud`), RS256 through OIDC metadata, lifetime checks, and `BikeLog.Access` in the space-delimited
  `scope` claim. Then resolve `(iss, sub)` to an enabled `BikeLogUser` on every request.
- **Rationale**: ID tokens and other-audience tokens cannot authorize. Disabling a user takes effect on
  the next request. Email is never a key.
- **Alternatives considered**: Creating users on first login was rejected because it would break invite-only
  access. Email as the key was rejected because email is mutable.

### D3. Foreign records look absent

- **Decision**: Foreign-owner IDs return the same 404 as missing IDs, conflict bodies omit foreign
  versions, and list cursors are bound to their owner.
- **Rationale**: This prevents enumeration and leakage. It is covered by `AuthenticatedOwnershipTests`.

### D4. Web session: opaque cookie, server-held tokens

- **Decision**: OIDC authorization code with state, nonce and PKCE. Login transactions and sessions are
  stored in PostgreSQL, tokens are encrypted with AES-GCM, rotation uses compare-and-swap, and the
  `Secure` host cookie holds only the session ID. The integrated pilot runs on `localhost:3000` because
  Chromium accepts the `Secure` host cookie there.
- **Rationale**: The browser never holds API or refresh tokens, and the existing proxy and CSRF rules
  are kept.
- **Alternatives considered**: Storing tokens in browser storage was rejected by the constitution (IV).
  A separate session store such as Redis was rejected under constitution principle V.

### D5. Synthetic data disposal: guarded purge, not reassignment

- **Decision**: An operator command deletes only the fixed synthetic owner's rows in one transaction,
  under synthetic mode, the dedicated local database and an explicit confirmation flag.
- **Rationale**: This was the owner's choice. Real users start with empty garages.

### D6. Sequencing: mobile after web UI

- **Decision**: All mobile work (US5) waits until the web UI is ready. Phase B follows the existing
  [native-auth-proof plan](../../docs/superpowers/plans/2026-10-08-native-auth-proof.md) unchanged.
- **Rationale**: This was the owner's instruction on 2026-10-12.
- **Open at Phase B start**: Expo SDK and secure-storage package versions, and the target platform
  (iOS or Android). Pin them from current Expo documentation when Phase B begins, not now.

## Gap analysis (Phase A inputs)

| Gap | Why it matters | Resolution |
| --- | --- | --- |
| No recorded live 403 for an Auth0 identity not provisioned in Bike Log | The API plan required it; SC-003 needs live evidence beyond the tests | Create a third Auth0 user (or temporarily disable a pilot user's local row), call `/api/me` and the relay, and record the sanitized 403. |
| Purge never recorded against local data | US4 is only proven on an isolated test database | Rehearse on a copy of `bikelog_dev`, then run it on `bikelog_dev`, recording counts and a repeat run. |
| Auth screens' width checks not recorded | SC-009. `e2e/auth.spec.ts` checks only the entry screen at 1440/390/320 | Run the auth e2e suite. Add width checks for the expired, pilot-access and account-menu states if they are missing, then record the results. |
| No identity decision record | Constitution: workflow and quality gates | Write ADR 0002. |
| Source design says "pending owner review" | Stale status misleads readers | Update the status line and link this spec. |
