# Local backend workflows

This milestone is synthetic-data development on loopback only. It is not authenticated personal use, a deployed Azure environment or proof of web/native behavior.

## Start and inspect

Follow README.md to select the pinned SDK, set local `.env` credentials, start Docker PostgreSQL, apply migrations and run the API. No migrations run automatically at API startup. `GET /health/ready` queries PostgreSQL. `GET /openapi/v1.json` describes the contracts and error responses.

The named `bikelog-local_postgres-data` volume survives `db-down`, restart and normal Docker shutdown. `db-reset --confirm-delete-local-data` deletes local records permanently. Test databases use unique `bikelog_test_*` names and are dropped independently of `bikelog_dev`.

## API contract

All routes start with `/api`. JSON uses camelCase. IDs are UUIDs; distances are integer metres, durations optional positive integer seconds, instants include an offset and are stored as UTC. Component and position values are `chain`; other parts follow later. Entity versions start at 1. Updates/replacement increment the edited entity version. A repeated creation POST creates another record; offline operation deduplication is deferred.

| Method / route | Request / result |
| --- | --- |
| POST `/bikes` | `{name}` → bike ID/name/version, 201 |
| GET `/bikes/{id}` | Bike ID/name/version |
| POST `/components` | `{type:"chain",model}` → chain identity/version, 201 |
| GET `/components/{id}` | Identity plus dated installation history |
| POST `/installations` | `{bikeId,componentId,position:"chain",startUtc,endUtc?}` → installation, 201 |
| GET `/installations/{id}` | Installation and version |
| PUT `/installations/{id}` | `{startUtc,endUtc?,expectedVersion}` → corrected dates/version |
| POST `/installations/{id}/replacement` | `{newComponentId,replacedAtUtc,expectedInstallationVersion}` → closed old/open new installations |
| POST `/rides` | `{bikeId,startUtc,distanceMetres,durationSeconds?}` → ride/version, 201 |
| GET `/rides/{id}` | Ride fields/version |
| PUT `/rides/{id}` | Creation fields plus `expectedVersion` → corrected ride/version |
| DELETE `/rides/{id}?expectedVersion=…` | Delete with version check; 204 |
| POST `/maintenance` | `{bikeId,componentId?,task,performedUtc,notes?,cost?,currency?}` → record, 201 |
| GET `/maintenance/{id}` | Maintenance record |
| GET `/bikes/{id}/maintenance` | Chronological work history |
| GET `/components/{id}/usage` | Lifetime and per-installation totals/history, duration completeness, zero initial estimate and calculation time |
| GET `/bikes/{id}/usage` | Chain fitted at current time, current-installation/lifetime totals, allocation-gap ride IDs and calculation time |

A component-specific maintenance record requires that component to be fitted to the selected bike at its performed instant. Cost/currency are supplied together: nonnegative decimal with at most two fractional digits (up to the database's 18-digit precision), and three uppercase currency letters. Bike-specific work need not name a component.

Errors use ProblemDetails: 400 invalid input; 404 absent or other-owner record; 409 overlap or stale version; 500 failed persistence/calculation; 503 database unavailable. Stale responses include `currentVersion` after owner checks. The caller should preserve attempted edits, reload and resubmit after reviewing differences. Secrets and exception internals are not included in responses.

## Mileage explanation

Installation intervals are `[start,end)`. Whole rides allocate at their start. A ride exactly at removal belongs to the new chain, while one microsecond before belongs to the old chain. Chain identity persists in history after replacement; a new chain has a new component ID.

Maintenance never resets lifetime totals. Missing installation history produces `unallocatedRideIds`, not guessed usage. Seconds sum only known ride durations; `hasUnknownDuration` indicates incomplete riding hours. Starting estimates are zero in this slice; future estimates will be separate and labelled. Components with no installation return zero usage and no calculation timestamp. A bike without installations likewise has no stored calculation timestamp, even if it has allocation gaps.

Mutations use one transaction and a per-owner PostgreSQL advisory lock, then deterministic rebuilding from authoritative history. A calculation failure rolls back both edits and projections. Usage reads use a repeatable-read snapshot. This deliberately favors simple correct rebuilding over incremental optimization for a small synthetic dataset.

## Acceptance and evidence

With the API running:

```sh
./scripts/acceptance.sh
./scripts/dev.sh test
```

Acceptance creates unique synthetic records without clearing the database. It proves: chain A receives 65,000 m; lubrication leaves that lifetime unchanged; replacement retains A's history; chain B receives the next 10,000 m. Use only an explicit loopback `BIKELOG_API_URL` if changing the default port.

Execution evidence is recorded below after running checks. Domain tests, actual PostgreSQL integration tests and HTTP acceptance are separate from cloud/client evidence.

## Later milestones and Strava next action

Sign-in and real ownership enforcement, web/native clients, individual moves, estimates and reminder baselines follow in Phase 2. Azure/Neon deployment, worker/outbox, offline entry, attachments and import lifecycle remain later work. Backups and restoration must be exercised before relying on hosted records.

Strava next action: perform a separately approved feasibility spike to clarify permitted maintenance calculations, derived storage, retention and deletion for this use case. No provider OAuth, data fetch or persistent integration was implemented here; synthetic fixtures do not establish provider permission.

### Local verification on 2026-10-01

- SDK 10.0.401 build: passed, zero warnings/errors.
- Domain suite: 17 passed; PostgreSQL/API suite: 38 passed, using migrated isolated test databases.
- Live `scripts/acceptance.sh`: passed against the loopback API and named-volume PostgreSQL, preserving the 65,000/10,000 m replacement workflow.
- Repeating `scripts/dev.sh migrate`: no migrations applied on the second run.
- Database stop: readiness returned 503. Restart with the same volume: readiness returned 200 and the acceptance bike's 10,000 m current-chain total persisted.
- `git diff --check`: passed.

No cloud resources, Neon project, authentication, personal records or mobile/web UI were created. This verifies the local foundation/backend milestone only.
