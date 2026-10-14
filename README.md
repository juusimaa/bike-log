<h1><img src="apps/web/src/app/icon.svg" width="40" height="40" alt="" align="top"> Bike Log</h1>

An interactive, predefined-data [UI design preview](docs/ui-design/index.html)
is available under `docs/ui-design`. Open it directly in your browser; see the
[preview guide](docs/ui-design/README.md) for the supported demo flows.

Bike Log has a .NET API, a connected web UI, invite-only sign-in through Auth0
and a minimal hosted deployment on Azure Container Apps with Aiven PostgreSQL
(see [Hosted deployment](#hosted-deployment)). The React Native app comes later.

The local development stack below runs in synthetic mode without sign-in. Do not
enter personal records in it or expose the local API/web remotely.

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

API: http://127.0.0.1:5080; OpenAPI: `/openapi/v1.json`; readiness: `/health/ready`. PostgreSQL: 127.0.0.1:54329. `dev.sh run` starts the API in explicit synthetic Development mode on loopback.

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
Run `lint` before committing.

## Continuous integration

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every pull request
to `main` and on every push to `main` (i.e. after merge). The `dotnet` job runs
`./scripts/dev.sh lint` and `./scripts/dev.sh test`; the `web` job runs `npm ci`,
web lint, typecheck, all workspace tests and `web:build`. Both jobs use a
throwaway PostgreSQL service container (same pinned image as `compose.yaml`) on
loopback port 54329 with a CI-only synthetic `.env`. Browser e2e and OpenAPI drift checks remain
local (see [web workflows](docs/web-workflows.md)).

[`.github/workflows/containers.yml`](.github/workflows/containers.yml) builds the
`api`, `migrations` and `web` images for amd64 and arm64, and publishes them to
GitHub Container Registry from `main` and `v*` tags. Run the same images locally
with `./scripts/dev.sh app-up` (see [container images](docs/containers.md)).

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) deploys each
commit that Containers publishes from `main` to the hosted environment, running
migrations first. Run it by hand with a previous image tag to roll back.
[`.github/workflows/backup-pins.yml`](.github/workflows/backup-pins.yml) checks
weekly for newer Debian package versions for the backup image and opens an issue
when there are some.

`main` is protected: changes land only through pull requests, and both `dotnet`
and `web` checks must pass on an up-to-date branch before merging. Direct pushes
and force pushes are blocked, including for admins.

## Hosted deployment

The hosted environment runs the published images on Azure Container Apps with
Aiven PostgreSQL. Riders sign in with an Auth0 email one-time code, and only
invited riders can sign in.

- [Setup](docs/hosting/setup.md) and [setup results](docs/hosting/setup-results.md)
  cover creating the environment, gated on the [cost estimate](docs/hosting/cost-estimate.md).
- [Operations](docs/hosting/operations.md) covers deploy, rollback, backups and
  `scripts/hosted/hosted.sh`.
- [Auth0 pilot setup](docs/auth/auth0-pilot-setup.md) covers adding and removing riders.
- [Decision records](docs/decisions/) explain the identity, hosting and import choices.

## License

Copyright (C) 2026 Jouni Uusimaa

Bike Log is licensed under the [GNU Affero General Public License v3.0](LICENSE).
If you run a modified version as a network service, you must make your modified
source code available to its users. Versions committed before the license
change were released under the MIT License.
