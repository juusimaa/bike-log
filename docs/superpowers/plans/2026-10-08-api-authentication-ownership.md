# API Authentication and Ownership Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Accept only correctly scoped Auth0 access tokens for active, provisioned Bike Log users and enforce their internal owner ID across every API read and mutation.

**Architecture:** Keep explicit synthetic and authenticated modes. Add an additive user/session schema, validate bearer tokens at the `/api` boundary, resolve `(issuer, sub)` to a local active user for each request, and inject an `ICurrentOwner` into existing endpoints. Preserve composite owner relationships and per-owner mutation locks; use a separate guarded command to remove only local synthetic-owner rows.

**Tech Stack:** .NET SDK 10.0.401, ASP.NET Core 10, EF Core 10, Npgsql/PostgreSQL, xUnit integration tests, Auth0 OIDC discovery and JWKS metadata.

**Spec:** `docs/superpowers/specs/2026-10-08-authentication-ownership-design.md`

## Global Constraints

- Start only after `2026-10-08-auth0-identity-feasibility.md` passes; never enable public signup as a workaround.
- API authorization accepts an access token for the Bike Log custom API audience and `BikeLog.Access` scope from one exact Auth0 issuer. ID tokens and tokens for other audiences fail.
- Ownership comes only from the validated token's issuer and `sub` and an active local user; email and display name are snapshots, never keys.
- Missing/invalid credentials return 401; valid identities without an active Bike Log user return 403; absent and foreign resources return the same 404 shape.
- Synthetic mode retains Development, explicit loopback HTTP binding, local PostgreSQL, `LocalSyntheticMode=true`, and fixed owner `11111111-1111-1111-1111-111111111111` restrictions. The modes are mutually exclusive.
- The API and web plans deliver the web-first milestone with synthetic data. No real records or general remote access until the later native proof and ordinary release gates pass. Operator commands never run at startup or during generic migrations.

## Review Focus

- A token with a valid signature but another audience, issuer, scope, or expired lifetime must receive 401 before a handler runs.
- A valid token for an unprovisioned or disabled local user must receive 403 even if another user owns matching IDs.
- A foreign ID in a nested write or stale-version update must receive 404 with no version or contents in the body.
- A cursor or usage rebuild created for one owner must not expose another owner's rows when reused or guessed.
- The purge must reject a wrong database/mode/owner flag, and repeat safely while preserving unrelated rows and migration history.

---

## File map and task order

Authentication: `src/Api/Auth/` owns mode validation, JWT configuration, local-user resolution, and `ICurrentOwner`. `src/Infrastructure/Persistence/BikeLogUser.cs` and `Configurations/BikeLogUserConfiguration.cs` own the user row and unique external key. `src/Infrastructure/Persistence/Migrations/` owns additive schema, including `WebSessions` and `OidcLoginTransactions` for the web plan. `src/Api/Operations/` owns provisioning, disabling, and purge commands. Existing `src/Api/Features/**/**Endpoints.cs` retain route behavior and replace the owner dependency. Test fixtures live in `tests/Integration.Tests/Fixtures/`; focused auth/ownership tests live beside existing integration tests. Complete each task and commit before the next.

### Task 1: Explicit mode and bearer boundary

**Files:** Create `src/Api/Auth/AccessMode.cs`, `AuthSettings.cs`, `AuthSetup.cs`; modify `src/Api/Program.cs`, `src/Api/BikeLog.Api.csproj`, `Directory.Packages.props`, `src/Api/Development/DevelopmentAccess.cs`; test `tests/Integration.Tests/HostTests.cs`, create `tests/Integration.Tests/AuthBoundaryTests.cs`.

**Interfaces:** `AccessMode` is `Synthetic | Authenticated`; `AuthSettings` contains `Issuer`, `Audience`, `Scope` (`BikeLog.Access`); `AuthSetup.AddBikeLogAuthentication(IServiceCollection, IConfiguration, IHostEnvironment)` configures JWT bearer only for authenticated mode. `Program` applies `RequireAuthorization("BikeLogAccess")` to `/api` only in authenticated mode; synthetic mode keeps its existing local route behavior. The current unconditional loopback guard becomes synthetic-only; authenticated network exposure still requires a separately approved TLS endpoint and release gate. `/health/ready` stays data-free. Use the proof's observed claim names and exact scope; validate issuer, audience (including array-valued `aud`), signature, lifetime, nonempty `sub`, and space-delimited `scope` membership. Until Task 2 supplies local-user authorization, every otherwise valid authenticated request fails closed with 403.

- [ ] **Step 1: Write failing tests.** In `AuthBoundaryTests`, assert no token → 401; wrong signature/issuer/audience/expired/scope and ID-token-only → 401; valid string and array `aud` accepted only when the API audience is a member; valid token before local-user registry → 403; missing authenticated settings and mixed modes → startup error; synthetic mode rejects nonloopback/nonlocal DB; health/OpenAPI contain no user data. Use a local test JWKS/issuer, never an authentication-handler bypass.
- [ ] **Step 2: Run the focused tests.** `dotnet test tests/Integration.Tests --filter FullyQualifiedName~AuthBoundaryTests`; expected: red on missing auth mode/boundary.
- [ ] **Step 3: Implement the boundary.** Add mode parsing, fail-closed settings, compatible pinned JWT bearer package, test metadata override, conditional `/api` authorization, and explicit health/OpenAPI exposure.
- [ ] **Step 4: Run the tests.** Run the focused command and `dotnet test tests/Integration.Tests --filter FullyQualifiedName~HostTests`; expected: green, including existing synthetic mode.
- [ ] **Step 5: Commit.** `git commit -m "feat: require Bike Log API access tokens"` with only this task's files.

### Task 2: Local user registry and owner resolution

**Files:** Create `src/Infrastructure/Persistence/BikeLogUser.cs`, `Configurations/BikeLogUserConfiguration.cs`, `WebSession.cs`, `Configurations/WebSessionConfiguration.cs`, `OidcLoginTransaction.cs`, `Configurations/OidcLoginTransactionConfiguration.cs`, new EF migration; modify `BikeLogDbContext.cs`; create `src/Api/Auth/ICurrentOwner.cs`, `CurrentOwner.cs`, `LocalUserAuthorization.cs`; modify `Program.cs`, `packages/api-client/openapi.json`, `packages/api-client/src/generated/schema.d.ts`; create `tests/Integration.Tests/UserAuthorizationTests.cs`.

**Interfaces:** `BikeLogUser { Guid OwnerId; string Issuer; string Subject; bool Enabled; string? Email; string? DisplayName }` with unique `(Issuer,Subject)` and unique `OwnerId`. `WebSession` has hashed session ID as primary key, encrypted token envelope, `(Issuer,Subject)`, expiry, integer rotation version, created/updated timestamps; web code owns its contents. `OidcLoginTransaction` has hashed state as primary key, encrypted nonce/PKCE verifier, safe return path, and expiry; web callback consumes it atomically. `ICurrentOwner.OwnerId: Guid` is request scoped. `LocalUserAuthorization` resolves validated `iss`/`sub` on every request and supplies the owner; no create-on-login. Synthetic implementation returns the fixed owner. Add `GET /api/me` returning only a minimal safe profile (`email`, `displayName`) for client state; it shares the same authorization gate.

- [ ] **Step 1: Write failing tests.** In `UserAuthorizationTests`, add `ActivePilotUserResolvesOwner`, `UnprovisionedOrDisabledUserIsForbidden`, `MutableEmailDoesNotChangeOwner`, `MalformedExternalIdentityIsUnauthorized`, `ApiAudienceArrayIsAccepted`, and `AuthenticationMigrationIsAdditive`. Assert both unique keys, web session/transaction tables, active `/api/me` 200, unprovisioned/disabled 403, email-change owner stability, and missing or malformed `iss`/`sub` 401.
- [ ] **Step 2: Run the focused tests.** `dotnet test tests/Integration.Tests --filter FullyQualifiedName~UserAuthorizationTests`; expected: red on missing registry/migration.
- [ ] **Step 3: Implement owner resolution.** Add entities, EF configuration/migration, scoped owner, local lookup, and `/api/me`; make valid but unprovisioned access 403. Before provisioning the second pilot identity locally, call `/api/me` with its valid token and record a sanitized 403; then provision it and confirm 200.
- [ ] **Step 4: Run the tests.** Run the focused command, `dotnet test tests/Integration.Tests`, `npm run api:generate` against the updated local API, and `npm run api:check`; expected: green with `/api/me` in the generated contract.
- [ ] **Step 5: Commit.** `git commit -m "feat: resolve provisioned Bike Log owner"` with only this task's files.

### Task 3: Owner isolation for all API resources

**Files:** Modify all files returned by `rg -l 'IDevelopmentOwner' src/Api/Features --glob '*.cs'`, plus `src/Api/Features/Collections/PageCursor.cs` if cursor binding needs strengthening; create `tests/Integration.Tests/AuthenticatedOwnershipTests.cs`; extend `tests/Integration.Tests/Fixtures/ApiFactory.cs` with authenticated test issuer/client helpers.

**Interfaces:** Every endpoint consumes `ICurrentOwner` instead of `IDevelopmentOwner`; existing `OwnerMutation.RunAsync(Guid ownerId, ...)`, owner-filtered readers, and composite `(OwnerId,Id)` relationships remain. Bind collection cursors to current owner as well as collection scope so a cursor from user A cannot page user B's collection.

- [ ] **Step 1: Write failing tests.** In `AuthenticatedOwnershipTests`, use two owners across bikes, overview, components, usage/estimate, installations, replacement, maintenance, rides, reminders, rebuilds, and collections. Assert own access succeeds; foreign detail/nested read/write/guessed relation/historical edit/stale version → 404 without `currentVersion` or foreign fields; collections omit foreign rows; cross-owner cursor reuse → 400.
- [ ] **Step 2: Run the focused tests.** `dotnet test tests/Integration.Tests --filter FullyQualifiedName~AuthenticatedOwnershipTests`; expected: red on synthetic-owner injection.
- [ ] **Step 3: Implement owner isolation.** Replace all 11 feature-file owner injections, audit queries and writes for `(OwnerId,Id)` checks before loads/conflicts, and bind collection cursors to owner.
- [ ] **Step 4: Run the tests.** Run the focused command, `rg -n 'IDevelopmentOwner' src/Api/Features` (expected: no matches), and `dotnet test BikeLog.slnx` (expected: green).
- [ ] **Step 5: Commit.** `git commit -m "feat: isolate all API resources by authenticated owner"` with only this task's files.

### Task 4: Operator provisioning, disable, and synthetic purge

**Files:** Create `src/Api/Operations/PilotUserCommands.cs`, `SyntheticOwnerPurge.cs`; modify `src/Api/Program.cs`, `docs/auth/auth0-pilot-setup.md`; create `tests/Integration.Tests/PilotUserCommandTests.cs`, `SyntheticOwnerPurgeTests.cs`.

**Interfaces:** Restricted local commands `--provision-pilot-user` with trusted exact `--issuer`, `--subject`, confirmed `--email`, and a newly generated internal owner UUID; `--disable-pilot-user` and `--enable-pilot-user` by internal owner UUID; `--purge-synthetic-owner --confirm-delete-synthetic` with exact fixed owner and local DB validation. Commands use EF transactions, reject duplicate external keys/reused owner, and print only row counts/IDs; none is an HTTP endpoint. Blocking the Auth0 account through provider administration is an accompanying operator action, while local disable takes effect on the next API request.

- [ ] **Step 1: Write failing tests.** In the two command test files, assert duplicate key/owner rejection, disable → immediate 403, re-enable, confirmation/wrong-mode/wrong-DB/wrong-owner rejection, copied-database purge and repeat, unrelated rows/schema/history preserved, and restricted `--rebuild-usage`.
- [ ] **Step 2: Run the focused tests.** `dotnet test tests/Integration.Tests --filter 'FullyQualifiedName~PilotUserCommandTests|FullyQualifiedName~SyntheticOwnerPurgeTests'`; expected: red on absent commands.
- [ ] **Step 3: Implement commands.** Use one transaction and dependency order: usage projections, maintenance, installations, rides, reminder rules, components, bikes. Filter every delete by fixed owner. Verify local target; do not run purge at startup/migration. Document first user, provider/local disable, re-enable, key rotation, outage, and copied-database rehearsal.
- [ ] **Step 4: Run the tests.** Run the focused command, `dotnet test BikeLog.slnx`, `dotnet ef migrations has-pending-model-changes --project src/Infrastructure --startup-project src/Api`, and `git diff --check`; expected: all clean.
- [ ] **Step 5: Commit.** `git commit -m "feat: add guarded pilot ownership operations"` with only this task's files.
