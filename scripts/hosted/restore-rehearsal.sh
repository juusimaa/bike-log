#!/usr/bin/env bash
# Restore rehearsal (research D14, contracts/backup-format.md "Restore comparison").
#
#   restore-rehearsal.sh <blob name>             a backup from Azure Storage
#   restore-rehearsal.sh --local <dir> [--keep]  the newest backup in <dir> (tests)
#
# Restores into a fresh, uniquely named PostgreSQL 18.6 container and compares it
# with the backup's manifest. It touches nothing it did not create, and removes
# its container and volume afterwards (--keep, for test runs only, leaves them).
set -euo pipefail
cd "$(dirname "$0")/../.."

image=postgres:18.6@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336
usage() {
  echo 'Usage: restore-rehearsal.sh <blob name> | --local <dir> [--keep]' >&2
  exit 2
}

source_kind=azure keep=false blob='' dir=''
case "${1:-}" in
  --local)
    [ $# -ge 2 ] || usage
    source_kind=local dir=$2
    shift 2
    if [ "${1:-}" = --keep ]; then keep=true; shift; fi
    [ $# -eq 0 ] || usage
    ;;
  -* | '') usage ;;
  *)
    [ $# -eq 1 ] || usage
    blob=$1
    ;;
esac
if [ -n "${RESTORE_TEST_AFTER_RESTORE_SQL:-}" ] && [ "$source_kind" != local ]; then
  echo 'RESTORE_TEST_AFTER_RESTORE_SQL is for local tests only.' >&2
  exit 2
fi

started=$(date +%s)
work=$(mktemp -d)
name="bikelog-restore-$(date -u +%Y%m%d%H%M%S)-$$"
created=false
cleanup() {
  if $created && ! $keep; then
    docker rm -f "$name" > /dev/null 2>&1 || true
    docker volume rm "$name" > /dev/null 2>&1 || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT

# --- Fetch the backup ---------------------------------------------------------

if [ "$source_kind" = azure ]; then
  env_file=.local/hosted.env
  [ -f "$env_file" ] || { echo "Missing $env_file (copy scripts/hosted/hosted.env.example)." >&2; exit 1; }
  # shellcheck source=/dev/null
  . "$env_file"
  case "${BACKUP_STORAGE_ACCOUNT:-<}" in *'<'*) echo "Set BACKUP_STORAGE_ACCOUNT in $env_file." >&2; exit 1 ;; esac
  base=${blob#backups/}
  base=${base%.dump}
  base=${base%.manifest.json}
  for suffix in .dump .manifest.json; do
    az storage blob download --auth-mode login --account-name "$BACKUP_STORAGE_ACCOUNT" \
      --container-name backups --name "$base$suffix" --file "$work/backup$suffix" \
      --only-show-errors -o none
  done
else
  manifest=$(find "$dir" -name '*.manifest.json' | sort | tail -1)
  [ -n "$manifest" ] || { echo "No manifest under $dir." >&2; exit 1; }
  base=${manifest#"$dir"/}
  base=${base%.manifest.json}
  cp "$manifest" "$work/backup.manifest.json"
  cp "${manifest%.manifest.json}.dump" "$work/backup.dump"
fi
chmod 644 "$work"/backup.*
chmod 755 "$work"
echo "Rehearsing restore of backups/$base.dump"

failures=0
row() { printf '%-34s %-22s %-22s %s\n' "$1" "$2" "$3" "$4"; }
check() { # name expected actual
  if [ "$2" = "$3" ]; then row "$1" "$2" "$3" ok; else row "$1" "$2" "$3" MISMATCH; failures=$((failures + 1)); fi
}
row check expected actual result

# 1. Checksum.
expected_sha=$(jq -r .dumpSha256 "$work/backup.manifest.json")
if command -v sha256sum > /dev/null; then
  actual_sha=$(sha256sum "$work/backup.dump" | awk '{ print $1 }')
else
  actual_sha=$(shasum -a 256 "$work/backup.dump" | awk '{ print $1 }')
fi
check 'dump sha256' "${expected_sha:0:16}…" "${actual_sha:0:16}…"
if [ "$expected_sha" != "$actual_sha" ]; then
  echo 'The dump does not match its manifest; not restoring it.' >&2
  exit 1
fi

# 2. Restore into an empty database in a container of our own.
docker volume create "$name" > /dev/null
created=true
docker run -d --name "$name" -v "$name:/var/lib/postgresql" -v "$work:/backup:ro" \
  -e POSTGRES_PASSWORD="$(openssl rand -hex 24)" -e POSTGRES_DB=restore \
  -p 127.0.0.1::5432 "$image" > /dev/null
# The image's init server listens only on its socket; TCP answers once it is final.
for _ in $(seq 1 60); do
  docker exec "$name" pg_isready -q -h 127.0.0.1 -U postgres -d restore && break
  sleep 1
done
docker exec "$name" pg_isready -q -h 127.0.0.1 -U postgres -d restore || { echo 'PostgreSQL did not start.' >&2; exit 1; }
if docker exec "$name" pg_restore --no-owner --exit-on-error -U postgres -d restore /backup/backup.dump; then
  check 'pg_restore exit' 0 0
else
  check 'pg_restore exit' 0 failed
  exit 1
fi
if [ -n "${RESTORE_TEST_AFTER_RESTORE_SQL:-}" ]; then
  docker exec "$name" psql -X -q -U postgres -d restore -v ON_ERROR_STOP=1 -c "$RESTORE_TEST_AFTER_RESTORE_SQL" > /dev/null
fi

# 3–5. The same facts the backup recorded, read from the restored copy.
sed 's/--.*$//' images/backup/manifest.sql | tr '\n' ' ' |
  docker exec -i "$name" psql -X -q -At -v ON_ERROR_STOP=1 -U postgres -d restore > "$work/restored.json"
expected="$work/backup.manifest.json" actual="$work/restored.json"

for table in $(jq -r '[(.tables | keys[])] | unique[]' "$expected" "$actual" | sort -u); do
  check "rows $table" "$(jq -r --arg t "$table" '.tables[$t] // "missing"' "$expected")" \
    "$(jq -r --arg t "$table" '.tables[$t] // "missing"' "$actual")"
done
check 'usage entries' "$(jq '.usage | length' "$expected")" "$(jq '.usage | length' "$actual")"
usage_diff=$(jq -n --slurpfile e "$expected" --slurpfile a "$actual" \
  '[$e[0].usage, $a[0].usage] | (.[0] - .[1]) + (.[1] - .[0]) | length')
check 'usage totals differing' 0 "$usage_diff"
check 'latest migration' "$(jq -r .migration "$expected")" "$(jq -r .migration "$actual")"

duration=$(($(date +%s) - started))
echo "Duration: ${duration}s"
if $keep; then
  echo "Kept container $name on 127.0.0.1:$(docker port "$name" 5432/tcp | head -1 | sed 's/.*://')"
fi
if [ "$failures" -gt 0 ]; then
  echo "Restore rehearsal FAILED: $failures check(s) did not match." >&2
  exit 1
fi
echo 'Restore rehearsal passed.'
