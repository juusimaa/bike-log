# Bike Log

Local synthetic-data backend milestone. Sign-in, web/mobile clients and cloud deployment follow later. Do not enter personal records or expose this API remotely.

Requires .NET SDK 10.0.401, Docker Desktop and Docker Compose. The SDK is pinned in global.json; packages and PostgreSQL image are pinned. Install the SDK from https://dotnet.microsoft.com/download/dotnet/10.0 or set `BIKELOG_DOTNET` to a compatible SDK's dotnet executable.

```sh
cp .env.example .env
# Set POSTGRES_PASSWORD in .env to a local password (shell-safe alphanumeric).
./scripts/dev.sh db-up
./scripts/dev.sh migrate
./scripts/dev.sh run
```

API: http://127.0.0.1:5080; OpenAPI: `/openapi/v1.json`; readiness: `/health/ready`. PostgreSQL: 127.0.0.1:54329. The API only starts in explicit synthetic Development mode on loopback.

```sh
./scripts/dev.sh test
./scripts/dev.sh db-down
```

`db-down` preserves the named Docker volume. `db-reset --confirm-delete-local-data` permanently deletes it. Tests create uniquely named `bikelog_test_*` databases on this dedicated container and drop only those databases. Migrations are explicit, never automatic at API startup. See [backend workflows](docs/backend-workflows.md) for the API contract, acceptance script and verification evidence.

With the API running, run `./scripts/acceptance.sh` to exercise the 65 km ride, maintenance and chain-replacement workflow. This also requires Python 3.
