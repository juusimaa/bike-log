# Quickstart: Validating Component Groups, Weights and Full Bike Positions

Use synthetic data only. Everything stays on loopback.

## Prerequisites

```bash
./scripts/dev.sh db-up
./scripts/dev.sh migrate          # applies ComponentGroupsWeight; a second run applies nothing
./scripts/dev.sh rebuild-usage    # explicit, never at startup
./scripts/dev.sh run              # API on 127.0.0.1:5080
npm run api:check                 # OpenAPI snapshot and generated client up to date
npm run web:dev
```

## Automated gates

```bash
./scripts/dev.sh lint
./scripts/dev.sh test             # domain and PostgreSQL integration suites
npm test                          # Vitest (web and api-client workspaces)
npm run web:lint && npm run web:typecheck
npm run web:e2e                   # Playwright, including visual-desktop/tablet/mobile
```

## Scenarios

Each scenario maps to the spec. Record the observed result under `docs/` (see the plan's Evidence
section).

| # | Spec | Steps | Expected |
| --- | --- | --- | --- |
| 1 | SC-003, US6 | Before migrating, note usage totals for an existing chain, cassette and tyres. Migrate and rebuild | Totals are identical. The parts appear under Groupset/Wheels with weight "not recorded" |
| 2 | US1-1 | Open a bike with no new parts | All 27 positions are listed under three groups. New positions show "not recorded" |
| 3 | US1-2, SC-002 | Fit a saddle (with a weight) from day 1. Log a 40 km ride on day 2 | Saddle shows 40 km. Components outside their period show nothing |
| 4 | US1-3, SC-006 | Mark the front derailleur "none fitted" | No gap notice for the front derailleur on later rides |
| 5 | US1-4 | Try to fit a saddle in the handlebar position (API) | 400 |
| 6 | US2-1, SC-004 | Replace handlebar tape that already has rides, then log a ride | The old tape's total is unchanged, and the new tape has only the new ride. Other parts are unchanged |
| 7 | US2-2 | End the pedals' installation on bike A and fit them on bike B. Ride B | Lifetime usage on the pedals continues |
| 8 | US3-1/2 | Fit a brake pair, then replace only the rear brake | Two components exist. The front brake's history is unchanged |
| 9 | FR-012 | Fit a rotor pair while the rear rotor position is occupied | 409. No component or installation is created |
| 10 | US4-1 | With a rear tube fitted, switch the rear wheel to tubeless on a date | The tube's installation ends on that date, and the position shows "tubeless" |
| 11 | US4-2 | Fit a front tube during a tubeless period | 409 `installation_overlap` |
| 12 | US4-3 | Switch the rear wheel back to tubed | The setup history shows both periods. The position shows "not recorded" |
| 13 | US5, SC-005 | Fit Build parts of 250, 300 and 95 g plus one without a weight. Set the frame weight | Build subtotal is 645 g with "1 part without weight". The total includes the frame |
| 14 | Edge | Enter weights 0, −5, 20001 and 12.5 | Each is rejected with a field message |
| 15 | FR-016 | As a second synthetic user, read or modify user A's exemption or component | 404 |
| 16 | FR-017 | Run `rebuild-usage` twice | Identical totals |

Check the bike workspace at 1440, 768 and 390 px wide. All three groups must be readable, and the
page must not scroll horizontally.
