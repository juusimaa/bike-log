# Quickstart: Validating Invite-Only Sign-In and Ownership

This is a validation runbook. Phase A sections close the evidence gaps on the implemented web-first
milestone. Record only sanitized results; addresses, subjects, codes, tokens and secrets stay in ignored
`.local/`. Contracts: [api-auth](contracts/api-auth.md), [web routes](contracts/web-auth-routes.md),
[operator commands](contracts/operator-commands.md).

## Prerequisites

- Docker PostgreSQL running (`docker compose up -d postgres`), with `.env` from `.env.example`.
- The auth migration applied to `bikelog_dev` (explicit `dotnet ef database update`, never at startup).
- Ignored Auth0 config in `.local/identity-proof/` and the API/web settings from
  [auth0-pilot-setup.md](../../docs/auth/auth0-pilot-setup.md#local-api-and-pilot-user-operations).
- The two pilot users provisioned and enabled.

## A0. Regression baseline

```bash
./scripts/dev.sh test   # integration fixture refuses a bare `dotnet test`
npm run web:test && npm run web:typecheck && npm run web:lint && npm run web:build
npm run test --workspace @bikelog/api-client
./scripts/dev.sh lint
```

Expected: everything green, with counts at or above the 2026-10-09 baseline (186 integration, 48 domain,
167 web, 29 client).

## A1. Live 403 for an unprovisioned identity (SC-003)

1. Use an Auth0 identity in the `email` connection that has **no** `BikeLogUser` row. Either create a third
   approved test identity administratively, or disable one pilot user locally with
   `--disable-pilot-user`.
2. Start the API in authenticated mode and the web app on `localhost:3000`, then sign in with that
   identity.
3. Expected: Auth0 sign-in succeeds, the web app shows the pilot-access screen, and the relay's `/api/me`
   returns 403. No user row is created (check `BikeLogUsers` row count before and after).
4. If you used a disabled user, re-enable them with `--enable-pilot-user` and confirm 200.
5. Record the result as a new dated row in
   [auth0-proof-results.md](../../docs/auth/auth0-proof-results.md).

## A2. Synthetic purge on local data (US4, SC-006)

1. Take a safety backup into ignored storage:
   `docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -Fc bikelog_dev > .local/backups/bikelog_dev-pre-purge.dump`.
2. Record per-owner row counts for bikes, components, installations, rides, maintenance, reminder rules
   and usage projections.
3. In **synthetic** Development mode, run
   `--purge-synthetic-owner --owner 11111111-1111-1111-1111-111111111111 --confirm-delete-synthetic`.
4. Expected: only the synthetic owner's counts drop to 0. Pilot users' rows, `BikeLogUsers`,
   `__EFMigrationsHistory` and the schema are unchanged.
5. Run it again. Expected: 0 rows deleted, success.
6. Confirm the guards: the same command without `--confirm-delete-synthetic`, or in authenticated mode,
   is refused.
7. Record the dated counts in [auth0-pilot-setup.md](../../docs/auth/auth0-pilot-setup.md).

## A3. Auth screens at three widths (SC-009)

```bash
./scripts/web-e2e.sh --grep auth   # or: npm run web:e2e -- auth.spec.ts
```

Expected: the entry screen fits at 1440, 390 and 320 px, and the sign-out, session-expired and
pilot-access tests pass. If the expired, pilot-access or account-menu states lack width checks, add them to
`apps/web/e2e/auth.spec.ts` first. Record dated results in
[auth0-pilot-setup.md](../../docs/auth/auth0-pilot-setup.md).

## A4. Documentation closure

- `docs/decisions/0002-auth0-invite-only-identity.md` exists and records D1 from
  [research.md](research.md), including why Entra was rejected.
- The source design's status line says the web-first milestone is implemented and links to this spec.
- The spec's status table shows every row except the native proof as Done.

## Phase B outline (deferred until the web UI is ready)

Follow the [native-auth-proof plan](../../docs/superpowers/plans/2026-10-08-native-auth-proof.md). Expected
end state, recorded in `docs/auth/native-proof-results.md`:

- On the selected device, an invited user signs in by email code with signup off.
- The isolated TLS API returns 401 without a token and 401 with a wrong-audience token.
- A signed-in read of the empty garage returns 200. After `--disable-pilot-user`, the next read returns
  403.
- Sign-out clears secure storage and cached data.
