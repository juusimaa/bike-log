# Implementation Plan: Invite-Only Sign-In and Per-User Ownership

**Branch**: `001-auth-user-ownership` | **Date**: 2026-10-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-auth-user-ownership/spec.md`

## Summary

Invited pilot riders sign in with an Auth0 email one-time code. The ASP.NET Core API accepts only
correctly scoped Auth0 access tokens for enabled, operator-provisioned users and limits every read and
change to that user's internal owner ID. The Next.js web app holds tokens server-side behind an opaque
session cookie and forwards them through its existing same-origin proxy.

**Most of this feature is already built** (see [spec status](spec.md#implementation-status-as-of-2026-10-12)
and [research.md](research.md)). This plan therefore has two parts:

- **Phase A, now**: close the verification and documentation gaps on the implemented web-first
  milestone. These are a live 403 record for an unprovisioned identity, the synthetic purge rehearsal and
  run on local data, recorded auth screen checks at 1440/390/320 px, an identity decision record
  required by the constitution, and a status update to the source design. No new product code is
  expected; any defect these checks find becomes a fix task.
- **Phase B, deferred until the web UI is ready**: the native proof (US5) as specified in
  [native-auth-proof plan](../../docs/superpowers/plans/2026-10-08-native-auth-proof.md). It covers an Expo
  development build, a caller-supplied bearer token in the shared API client, an isolated TLS endpoint,
  and a secure native session with one protected read.

## Technical Context

**Language/Version**: C# on .NET SDK 10.0.401 (ASP.NET Core 10); TypeScript on Node 24 (Next.js 16.3.8,
React 19.3.0). Phase B: Expo/React Native, versions pinned when Phase B starts.

**Primary Dependencies**: Microsoft.AspNetCore.Authentication.JwtBearer 10.0.12, EF Core 10.0.12,
Npgsql EF provider 10.0.3; `openid-client` 6.8.8, `pg` 8.23.0; Auth0 (free tier, email passwordless
connection, custom API with `BikeLog.Access`).

**Storage**: PostgreSQL in Docker (dedicated loopback `127.0.0.1:54329`, `bikelog_dev`). Auth tables
come from migration `20261009051928_AddAuthenticationOwnership`.

**Testing**: xUnit integration tests against PostgreSQL (`tests/Integration.Tests`), Vitest
(`apps/web/tests`), Playwright (`apps/web/e2e`), probe tests (`probes/identity/web`).

**Target Platform**: Loopback-only local development (API on 5080, web on `localhost:3000`). Phase B
adds one selected mobile device on an isolated LAN with TLS.

**Project Type**: Web service and web application monorepo. Phase B adds a minimal mobile app.

**Performance Goals**: Not a driver. The pilot has a handful of users, and auth adds one local user lookup
per request.

**Constraints**: Synthetic data only. No exposure beyond loopback. No secrets, addresses, codes or tokens in
tracked files. Mobile work waits until the web UI is ready.

**Scale/Scope**: The owner plus two to a few invited pilot users.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / constraint | Status | Notes |
| --- | --- | --- |
| I. Trustworthy, explainable usage | Pass | Ownership adds no change to usage rules. Usage rebuilds stay owner-scoped. |
| II. Backend-owned domain rules | Pass | Authorization and owner resolution live in the API. The web app only relays a server-held token, and Phase B's client gets a token callback with no domain logic. |
| III. Evidence-based verification | Pass with open items | Code is tested against PostgreSQL. Phase A tasks supply the missing runtime evidence (live 403, purge run, screen checks). |
| IV. Privacy, ownership, synthetic data | Pass | Per-owner checks are enforced and tested across all resources. Secrets stay in ignored `.local/`. Real records stay forbidden until Phase B and the release gates pass. |
| V. Incremental simplicity | Pass | No new service or queue. Sessions live in the existing PostgreSQL database, and the auth provider is external. |
| Migrations explicit, never at startup | Pass | The auth migration is additive, and the purge and operator commands never run at startup. |
| Destructive local operations need a confirmation flag | Pass | The purge requires `--confirm-delete-synthetic` plus mode, database and owner guards. |
| No paid tier without approval | Pass | Auth0 free tier, with the dashboard showing $0. |
| Identity choices recorded in `docs/decisions/` | **Gap** | Only `0001-local-backend.md` exists. The Auth0 choice and the abandoned Entra attempt need a decision record. Phase A task, so no Complexity Tracking entry is needed. |
| Pinned versions | Pass | Server and web packages are pinned. Phase B pins Expo when it starts. |

**Post-design re-check**: unchanged. The design artifacts add no new components, and the one gap is
scheduled as a Phase A task.

## Project Structure

### Documentation (this feature)

```text
specs/001-auth-user-ownership/
├── plan.md              # This file
├── research.md          # Decisions (mostly already made) and gap analysis
├── data-model.md        # Auth entities as implemented
├── quickstart.md        # Validation runbook for Phase A (and Phase B outline)
├── contracts/
│   ├── api-auth.md      # API authorization and status-code contract
│   ├── web-auth-routes.md
│   └── operator-commands.md
└── tasks.md             # /speckit-tasks output
```

### Source Code (repository root)

```text
src/
├── Api/
│   ├── Auth/              # AccessMode, AuthSettings, AuthSetup, ICurrentOwner, CurrentOwner,
│   │                      # LocalUserAuthorization, MeResponse            [done]
│   ├── Operations/        # OperatorCommandLine, PilotUserCommands, SyntheticOwnerPurge,
│   │                      # LocalDatabaseGuard                            [done]
│   ├── Features/**        # owner-scoped endpoints via ICurrentOwner      [done]
│   └── Program.cs         # mode selection, /api authorization, GET /api/me
└── Infrastructure/Persistence/
    ├── BikeLogUser.cs, WebSession.cs, OidcLoginTransaction.cs + Configurations/   [done]
    └── Migrations/20261009051928_AddAuthenticationOwnership.cs                     [done]

tests/Integration.Tests/
    AuthBoundaryTests, UserAuthorizationTests, AuthenticatedOwnershipTests,
    PilotUserCommandTests, SyntheticOwnerPurgeTests                               [done]

apps/web/
├── src/lib/auth/          # config, oidc, session-store, cookies, access-token, current-session [done]
├── src/app/auth/          # start (GET), callback (GET), logout (POST)       [done]
├── src/lib/proxy.ts       # session-aware allowlisted proxy                  [done]
├── tests/                 # auth-callback, auth-logout, auth-ui, session-store, proxy, access-token
└── e2e/auth.spec.ts       # entry widths, sign-out, expiry, pilot-access     [done]

probes/identity/web/       # Auth0 redirect probe                             [done]

docs/
├── auth/                  # auth0-pilot-setup.md, auth0-proof-results.md     [Phase A: append evidence]
├── decisions/0002-auth0-invite-only-identity.md                              [Phase A: new]
└── superpowers/specs/2026-10-08-authentication-ownership-design.md          [Phase A: status line]

# Phase B (deferred until the web UI is ready)
apps/mobile/               # minimal Expo development build: auth/, App.tsx, tests/
packages/api-client/src/client.ts   # optional getAccessToken callback
docs/auth/native-redirect-results.md, native-proof-results.md
```

**Structure Decision**: Keep the existing monorepo layout (`src/` .NET API, `apps/web`, `packages/`,
`tests/`). Phase A changes only `docs/`, unless a check finds a defect. Phase B adds `apps/mobile/` as
`PROJECT_PLAN.md` already anticipates.

## Phasing and Gates

1. **Phase A**: run [quickstart.md](quickstart.md) sections A1–A4 and record the evidence. Then write ADR
   0002 and update the source design's status. Exit when every row in the spec status table except the
   native proof reads Done.
2. **Gate: web UI ready** (owner's call, outside this feature). Nothing in Phase B starts before it.
3. **Phase B**: follow the native-auth-proof plan's Tasks 1–4 in order, stopping on any failed provider or
   TLS proof. Exit at the native gate described in that plan.

## Complexity Tracking

No violations require justification.
