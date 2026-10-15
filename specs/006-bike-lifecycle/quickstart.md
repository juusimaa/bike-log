# Quickstart: Validate Bike Lifecycle and Ride Bike Choice

Validation runbook for [spec.md](spec.md). Contracts: [contracts/api-bike-lifecycle.md](contracts/api-bike-lifecycle.md).
Data rules: [data-model.md](data-model.md). Synthetic data only.

## Setup

From the repository root:

```sh
./scripts/dev.sh db-up
./scripts/dev.sh migrate
./scripts/dev.sh rebuild-usage
./scripts/dev.sh run
```

In a second terminal, from the repository root:

```sh
npm run api:check
npm run web:dev
```

Open `http://localhost:3000` and sign in to the synthetic owner. Create bikes **A** and **B**, each with a
chain, a pair of wheels and a saddle fitted from 2026-09-01.

## Automated gates

From the repository root:

```sh
./scripts/dev.sh lint
./scripts/dev.sh test
npm run web:lint
npm run web:typecheck
npm run web:test
npm run web:build
./scripts/web-e2e.sh
```

Expected: all pass. Playwright visual projects (desktop, tablet, mobile) also need a human review of the
paired screenshots, as `docs/web-workflows.md` describes.

## Scenarios

| # | Story | Steps | Expected | Result |
| --- | --- | --- | --- | --- |
| 1 | US1 | Viewing A, open Log ride. | Bike field shows A selected; title names A. | ✓ Pass |
| 2 | US1 | Choose B, save a 30 km ride dated today. | B and its chain gain 30 km; A unchanged. | ✓ Pass |
| 3 | US1 | Correct that ride, choose A, save. | B and its parts lose 30 km; A and its parts gain 30 km. | ✓ Pass |
| 4 | US1 | Open the same ride in two tabs; move it in one, then save a change in the other. | Second save shows the conflict panel with the current ride. | ✓ Pass |
| 5 | US2 | Open All rides. | Rides from A and B, newest first, each with a bike link that opens that bike. | ✓ Pass |
| 6 | US3 | Retire B. | B appears under Retired in the switcher; not offered in Log ride; its history unchanged. | ✓ Pass |
| 7 | US3 | With only A active, open Log ride. | No bike field; title names A. | ✓ Pass |
| 8 | US3 | On retired B, try to fit a part (API: `POST /installations`). | Rejected with `bike_retired`; removing a part from B works. | ✓ Pass |
| 9 | US3 | Reactivate B. | B is back among active bikes with identical totals. | ✓ Pass |
| 10 | US4 | Delete a spare part that was fitted to A in September. | Gone from spares and pickers; A shows a gap in that position for September. | ✓ Pass |
| 11 | US4 | Delete A's fitted saddle. | Confirmation names A and the saddle position; afterwards the position is empty. | ✓ Pass |
| 12 | US5 | Delete B, ticking only its wheels. | Wheels appear as spares with unchanged usage; chain deleted; B gone from the switcher. | ✓ Pass |
| 13 | US5 | Open All rides. | B's rides show "B" with a Deleted tag and no link. | ✓ Pass |
| 14 | US5 | Open a kept wheel's history. | Shows the period on B by name, without a link. | ✓ Pass |
| 15 | US5 | Open the delete dialog for A, fit a part to A in another tab, then confirm. | Rejected; dialog refreshes with the current parts. | ✓ Pass |
| 16 | US5 | Correct a ride of deleted B, moving it to A. | Ride moves; A and its parts gain the distance; the kept wheels lose it. | ✓ Pass |
| 17 | All | Repeat any new route with a second owner's session. | `404 not_found`. | ✓ Pass |

Record results and evidence in `docs/backend-workflows.md` and `docs/web-workflows.md`.

Verified on 2026-10-15 through automated runs against the local API and PostgreSQL; the evidence for each
scenario is in `docs/backend-workflows.md` ("Bike lifecycle and ride bike choice").
