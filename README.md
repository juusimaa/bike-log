# Bike Log

An interactive, predefined-data [UI design preview](docs/ui-design/index.html)
is available under `docs/ui-design`. Open it directly in your browser; see the
[preview guide](docs/ui-design/README.md) for the supported demo flows.

Local synthetic-data API and connected web milestone. Authentication, React Native and cloud deployment follow later. Do not enter personal records or expose the API/web remotely.

The connected web UI runs at http://127.0.0.1:3000 with Node 24: run `npm ci` then `npm run web:dev` in a second terminal after starting the API below. See [web workflows](docs/web-workflows.md) for exact units/time handling, recovery, production-build smoke and Chromium/WebKit verification. `./scripts/web-e2e.sh` starts only its own API/web processes, refuses occupied ports and preserves every database record/volume.

Requires .NET SDK 10.0.401, Docker Desktop and Docker Compose. The SDK is pinned in global.json; packages and PostgreSQL image are pinned. Install the SDK from https://dotnet.microsoft.com/download/dotnet/10.0 or set `BIKELOG_DOTNET` to a compatible SDK's dotnet executable.

```sh
cp .env.example .env
# Set POSTGRES_PASSWORD in .env to a local password (shell-safe alphanumeric).
./scripts/dev.sh db-up
./scripts/dev.sh migrate
./scripts/dev.sh rebuild-usage
./scripts/dev.sh run
```

API: http://127.0.0.1:5080; OpenAPI: `/openapi/v1.json`; readiness: `/health/ready`. PostgreSQL: 127.0.0.1:54329. The API only starts in explicit synthetic Development mode on loopback.

```sh
./scripts/dev.sh test
./scripts/dev.sh db-down
```

`db-down` preserves the named Docker volume. `db-reset --confirm-delete-local-data` permanently deletes it. Tests create uniquely named `bikelog_test_*` databases on this dedicated container and drop only those databases. Migrations and owner-atomic usage rebuilds are explicit, never automatic at API startup. Re-run `rebuild-usage` after upgrades; preserve the named volume. See [backend workflows](docs/backend-workflows.md) for the API contract, acceptance script and verification evidence.

With the API running, run `./scripts/acceptance.sh` to exercise the 65 km ride, maintenance and chain-replacement workflow. Run `./scripts/acceptance-ui-backend.sh` for paginated two-bike/four-position, replacement, estimate and oil/wax coverage. Both require Python 3 and retain uniquely marked synthetic records.

## Formatting and static analysis

Use the pinned CSharpier local tool for formatting and .NET SDK analyzers for
static analysis:

```sh
dotnet tool restore
./scripts/dev.sh format  # Apply CSharpier formatting.
./scripts/dev.sh lint    # Check CSharpier formatting; build with warnings as errors.
```

Both commands work without `.env` or PostgreSQL and respect `BIKELOG_DOTNET`.
CSharpier owns C# and supported XML formatting. `.csharpierignore` excludes
generated EF migrations. SDK analyzers and code-style checks run during builds;
`lint` treats warnings as failures. `.editorconfig` retains syntax preferences
and unused-import suggestions for compatible editors. CSharpier does not apply
those semantic fixes or remove unused imports. The language version continues
to follow the target framework.

To enable automatic formatting of staged C# files before committing:

```sh
brew install pre-commit
pre-commit install
```

The hook uses the pinned local CSharpier tool and excludes generated migrations.
If it changes files, review and stage those changes, then retry the commit.
Each developer enables the hook after cloning.
Run `lint` before committing; when CI is added, use the same command there.
