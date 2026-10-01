#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || { echo 'Copy .env.example to .env and set a local password.' >&2; exit 1; }
set -a
source .env
set +a
sdk=${BIKELOG_DOTNET:-dotnet}
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export ASPNETCORE_ENVIRONMENT=Development
export LocalSyntheticMode=true
export ASPNETCORE_URLS=http://127.0.0.1:5080
export ConnectionStrings__Postgres="Host=127.0.0.1;Port=54329;Database=bikelog_dev;Username=$POSTGRES_USER;Password=$POSTGRES_PASSWORD"
export BIKELOG_TEST_ADMIN="Host=127.0.0.1;Port=54329;Database=postgres;Username=$POSTGRES_USER;Password=$POSTGRES_PASSWORD"
case "${1:-}" in
  db-up) docker compose up -d --wait ;;
  db-down) docker compose down ;;
  db-reset)
    [ "${2:-}" = --confirm-delete-local-data ] || { echo 'Refused: db-reset --confirm-delete-local-data permanently deletes all local database records.' >&2; exit 2; }
    echo 'Deleting the local PostgreSQL volume and its records.' >&2
    docker compose down --volumes ;;
  migrate) "$sdk" tool restore; "$sdk" ef database update --project src/Infrastructure --startup-project src/Api ;;
  run) "$sdk" run --project src/Api --no-launch-profile ;;
  test) shift; "$sdk" test BikeLog.slnx "$@" ;;
  *) echo 'Usage: scripts/dev.sh {db-up|db-down|db-reset --confirm-delete-local-data|migrate|run|test}' >&2; exit 2 ;;
esac
