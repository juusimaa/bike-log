#!/usr/bin/env bash
# Backup and restore round trip against Docker PostgreSQL (quickstart A2).
# Synthetic data only. Creates its own uniquely named containers, volume, image tag
# and temporary directory, and removes only those.
# Needs Docker, the .NET SDK (for migrations and seeding through the API), curl,
# jq and python3.
set -euo pipefail
cd "$(dirname "$0")/../../.."
root=$PWD

pg_image=postgres:18.6@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336
run_id="bikelog-backup-test-$(date +%s)-$$"
backup_image="bikelog-backup:$run_id"
work=$(mktemp -d)
password=$(openssl rand -hex 16)
api_pid=

cleanup() {
  [ -z "$api_pid" ] || kill "$api_pid" 2> /dev/null || true
  docker rm -f "$run_id" "$run_id-backup" > /dev/null 2>&1 || true
  docker volume rm "$run_id" > /dev/null 2>&1 || true
  docker image rm "$backup_image" > /dev/null 2>&1 || true
  rm -rf "$work"
}
trap cleanup EXIT

step() { printf '\n== %s\n' "$*"; }
free_port() { python3 -c 'import socket; s = socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1])'; }
sql() { docker exec -i "$run_id" psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d bikelog_backup_test "$@"; }
expect_failure() { # description command...
  local description=$1
  shift
  if "$@" > "$work/expected-failure.log" 2>&1; then
    cat "$work/expected-failure.log"
    echo "FAIL: $description succeeded but should have failed." >&2
    exit 1
  fi
  grep -E "MISMATCH|does not match" "$work/expected-failure.log" > /dev/null ||
    { cat "$work/expected-failure.log"; echo "FAIL: $description failed for another reason." >&2; exit 1; }
  echo "ok: $description failed as expected"
}

step 'Source database'
docker volume create "$run_id" > /dev/null
docker run -d --name "$run_id" -v "$run_id:/var/lib/postgresql" -e POSTGRES_PASSWORD="$password" \
  -e POSTGRES_DB=bikelog_backup_test -p 127.0.0.1::5432 "$pg_image" > /dev/null
for _ in $(seq 1 60); do
  docker exec "$run_id" pg_isready -q -h 127.0.0.1 -U postgres && break
  sleep 1
done
pg_port=$(docker port "$run_id" 5432/tcp | head -1 | sed 's/.*://')
connection="Host=127.0.0.1;Port=$pg_port;Database=bikelog_backup_test;Username=postgres;Password=$password"

step 'Migrations'
export DOTNET_CLI_TELEMETRY_OPTOUT=1 AccessMode=Synthetic
dotnet tool restore > /dev/null
dotnet ef database update --project src/Infrastructure --startup-project src/Api \
  --connection "$connection" > "$work/migrate.log" 2>&1 || { cat "$work/migrate.log"; exit 1; }

step 'Synthetic records through the API'
api_port=$(free_port)
api="http://127.0.0.1:$api_port"
ASPNETCORE_ENVIRONMENT=Development LocalSyntheticMode=true ASPNETCORE_URLS="$api" \
  ConnectionStrings__Postgres="$connection" \
  dotnet run --project src/Api --no-launch-profile > "$work/api.log" 2>&1 &
api_pid=$!
for _ in $(seq 1 120); do
  curl -fsS "$api/health/ready" > /dev/null 2>&1 && break
  kill -0 "$api_pid" 2> /dev/null || { cat "$work/api.log"; exit 1; }
  sleep 1
done
post() { curl -fsS -X POST -H 'content-type: application/json' --data "$2" "$api/api/$1"; }
bike() { post bikes "{\"name\":\"Synthetic $1\",\"make\":\"Test\",\"model\":\"$1\",\"kind\":\"road\",\"year\":2024}" | jq -er .id; }
fit() { # bike type position
  local component
  component=$(post components "{\"type\":\"$2\",\"make\":\"Test\",\"model\":\"$2\"}" | jq -er .id)
  post installations "{\"bikeId\":\"$1\",\"componentId\":\"$component\",\"position\":\"$3\",\"startUtc\":\"2026-01-01T00:00:00Z\"}" > /dev/null
}
bike_one=$(bike One)
bike_two=$(bike Two)
fit "$bike_one" chain chain
fit "$bike_one" cassette cassette
fit "$bike_one" tyre front-tyre
fit "$bike_two" chain chain
fit "$bike_two" tyre rear-tyre
for i in 1 2 3 4 5; do
  for bike_id in "$bike_one" "$bike_two"; do
    post rides "{\"bikeId\":\"$bike_id\",\"name\":\"Synthetic ride $i\",\"startUtc\":\"2026-02-0${i}T08:00:00Z\",\"distanceMetres\":$((20000 + i * 1111)),\"durationSeconds\":$((3600 + i * 60))}" > /dev/null
  done
done
kill "$api_pid"
wait "$api_pid" 2> /dev/null || true
api_pid=
sql -c "INSERT INTO \"BikeLogUsers\" (\"OwnerId\", \"Issuer\", \"Subject\", \"Enabled\", \"Email\")
        VALUES (gen_random_uuid(), 'https://issuer.example.test/', 'email|synthetic-backup-test', true, 'rider@example.test')"
ASPNETCORE_ENVIRONMENT=Development LocalSyntheticMode=true ASPNETCORE_URLS="$api" \
  ConnectionStrings__Postgres="$connection" \
  dotnet run --project src/Api --no-launch-profile --no-build -- --rebuild-usage > "$work/rebuild.log" 2>&1 ||
  { cat "$work/rebuild.log"; exit 1; }
echo "rides: $(sql -c 'SELECT count(*) FROM "Rides"'), usage rows: $(sql -c 'SELECT count(*) FROM "ComponentUsages"')"

step 'Backup image'
docker build -q -f images/backup/Dockerfile -t "$backup_image" . > /dev/null

backup() { # output dir [extra docker args...]
  local out=$1 status
  shift
  mkdir -p "$out"
  # Shares the source container's network namespace, as the hosted job reaches Aiven.
  docker run --name "$run_id-backup" --network "container:$run_id" --user "$(id -u):$(id -g)" \
    -v "$out:/out" -e BACKUP_LOCAL_DIR=/out \
    -e BIKELOG_DATABASE_URL="postgresql://postgres:$password@127.0.0.1:5432/bikelog_backup_test" \
    "$@" "$backup_image" && status=0 || status=$?
  docker rm "$run_id-backup" > /dev/null
  return "$status"
}

step 'Backup and restore'
backup "$work/one" 2> "$work/backup-one.log" || { cat "$work/backup-one.log"; exit 1; }
cat "$work/backup-one.log"
if grep -q "$password" "$work/backup-one.log"; then echo 'FAIL: the backup log contains the password.' >&2; exit 1; fi
manifest=$(find "$work/one" -name '*.manifest.json')
jq -e '.formatVersion == 1 and .tables.Rides == 10 and .tables.BikeLogUsers == 1 and (.usage | length) == 5' "$manifest" > /dev/null ||
  { echo 'FAIL: unexpected manifest:' >&2; cat "$manifest" >&2; exit 1; }
if grep -q 'rider@example.test\|Synthetic ride' "$manifest"; then echo 'FAIL: the manifest contains personal data.' >&2; exit 1; fi
scripts/hosted/restore-rehearsal.sh --local "$work/one"

step 'Snapshot consistency: a ride deleted between snapshot and dump'
mkdir -p "$work/two"
backup "$work/two" -e BACKUP_TEST_PAUSE_AFTER_MANIFEST=1 2> "$work/backup-two.log" &
backup_pid=$!
for _ in $(seq 1 300); do [ -e "$work/two/.paused" ] && break; sleep 0.1; done
[ -e "$work/two/.paused" ] || { cat "$work/backup-two.log"; echo 'FAIL: the backup never paused.' >&2; exit 1; }
sql -c 'DELETE FROM "Rides" WHERE "Id" = (SELECT "Id" FROM "Rides" ORDER BY "Id" LIMIT 1)'
touch "$work/two/.resume"
wait "$backup_pid" || { cat "$work/backup-two.log"; exit 1; }
rm -f "$work/two/.paused" "$work/two/.resume"
[ "$(sql -c 'SELECT count(*) FROM "Rides"')" = 9 ] || { echo 'FAIL: the source ride was not deleted.' >&2; exit 1; }
jq -e '.tables.Rides == 10' "$(find "$work/two" -name '*.manifest.json')" > /dev/null ||
  { echo 'FAIL: the manifest did not come from the snapshot.' >&2; exit 1; }
scripts/hosted/restore-rehearsal.sh --local "$work/two"

step 'The comparison catches damage'
RESTORE_TEST_AFTER_RESTORE_SQL='DELETE FROM "Rides" WHERE "Id" = (SELECT "Id" FROM "Rides" ORDER BY "Id" LIMIT 1)' \
  expect_failure 'a restore missing one ride' scripts/hosted/restore-rehearsal.sh --local "$work/one"
RESTORE_TEST_AFTER_RESTORE_SQL='UPDATE "ComponentUsages" SET "LifetimeMetres" = "LifetimeMetres" + 1 WHERE "ComponentId" = (SELECT min("ComponentId"::text)::uuid FROM "ComponentUsages")' \
  expect_failure 'a restore with a changed usage total' scripts/hosted/restore-rehearsal.sh --local "$work/one"
RESTORE_TEST_AFTER_RESTORE_SQL='CREATE TABLE "Unexpected" (id int)' \
  expect_failure 'a restore with an extra table' scripts/hosted/restore-rehearsal.sh --local "$work/one"
cp -R "$work/one" "$work/tampered"
tampered=$(find "$work/tampered" -name '*.manifest.json')
jq '.dumpSha256 = ("0" * 64)' "$tampered" > "$work/m" && mv "$work/m" "$tampered"
expect_failure 'a dump that does not match its checksum' scripts/hosted/restore-rehearsal.sh --local "$work/tampered"

echo
echo "${root##*/}: backup and restore round trip passed."
