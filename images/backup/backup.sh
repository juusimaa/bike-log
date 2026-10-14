#!/usr/bin/env bash
# Daily backup of the hosted database (research D9, contracts/backup-format.md).
#
#   backup.sh                       dump + manifest, uploaded as create-only blobs
#   backup.sh --verify-permissions  prove this identity cannot overwrite or delete
#
# Settings: BIKELOG_DATABASE_URL (libpq URI), and either BACKUP_ACCOUNT_URL,
# BACKUP_CONTAINER and AZURE_CLIENT_ID (Container Apps managed identity), or
# BACKUP_LOCAL_DIR for local tests. Never logs the database password or a token.
set -euo pipefail
umask 077

log() { printf '%s backup: %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2; }
fail() {
  log "FAILED: $*"
  exit 1
}

trap 'log "FAILED at line $LINENO"' ERR

mode=backup
case "$#:${1:-}" in
  0:) ;;
  1:--verify-permissions) mode=verify ;;
  *) fail 'usage: backup.sh [--verify-permissions]' ;;
esac

manifest_sql=${BACKUP_MANIFEST_SQL:-/usr/local/share/bikelog/manifest.sql}
local_dir=${BACKUP_LOCAL_DIR:-}
[ -n "${BIKELOG_DATABASE_URL:-}" ] || fail 'BIKELOG_DATABASE_URL is not set'
if [ -z "$local_dir" ]; then
  for name in BACKUP_ACCOUNT_URL BACKUP_CONTAINER AZURE_CLIENT_ID IDENTITY_ENDPOINT IDENTITY_HEADER; do
    [ -n "${!name:-}" ] || fail "$name is not set"
  done
fi
if [ -n "${BACKUP_TEST_PAUSE_AFTER_MANIFEST:-}" ] && [ -z "$local_dir" ]; then
  fail 'BACKUP_TEST_PAUSE_AFTER_MANIFEST is for local tests only'
fi
# Pinned Blob service REST version.
blob_api_version=2025-05-05

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

# --- Azure Blob Storage, as the job's user-assigned managed identity ----------

blob_auth() {
  # The token goes to a header file, so it never appears in a process list or log.
  local token
  token=$(curl -fsS --max-time 30 -H "X-IDENTITY-HEADER: $IDENTITY_HEADER" \
    "$IDENTITY_ENDPOINT?resource=https://storage.azure.com/&api-version=2019-08-01&client_id=$AZURE_CLIENT_ID" |
    jq -er .access_token) || fail 'could not get a storage token from the managed identity endpoint'
  printf 'Authorization: Bearer %s\nx-ms-version: %s\n' "$token" "$blob_api_version" > "$work/auth"
}

# blob_request METHOD BLOB [curl args...] -> prints the HTTP status
blob_request() {
  local method=$1 blob=$2
  shift 2
  curl -sS --max-time 600 -o "$work/response" -D "$work/headers" -w '%{http_code}' \
    -X "$method" -H @"$work/auth" "$@" "$BACKUP_ACCOUNT_URL/$BACKUP_CONTAINER/$blob"
}

upload() {
  local file=$1 blob=$2 status
  if [ -n "$local_dir" ]; then
    mkdir -p "$local_dir/$(dirname "$blob")"
    [ ! -e "$local_dir/$blob" ] || fail "$blob already exists"
    cp "$file" "$local_dir/$blob"
    return
  fi
  # Single-shot Put Blob, create-only: an existing name is never overwritten.
  status=$(blob_request PUT "$blob" -H 'x-ms-blob-type: BlockBlob' -H 'If-None-Match: *' \
    -H 'Content-Type: application/octet-stream' --data-binary @"$file") ||
    fail "upload of $blob did not complete"
  [ "$status" = 201 ] || fail "upload of $blob returned HTTP $status"
}

# --- Verify-permissions mode --------------------------------------------------

if [ "$mode" = verify ]; then
  [ -z "$local_dir" ] || fail '--verify-permissions needs Azure storage'
  blob_auth
  status=$(curl -sS --max-time 60 -o "$work/list" -w '%{http_code}' -H @"$work/auth" \
    "$BACKUP_ACCOUNT_URL/$BACKUP_CONTAINER?restype=container&comp=list") || fail 'listing failed'
  [ "$status" = 200 ] || fail "listing returned HTTP $status"
  latest=$(grep -o '<Name>[^<]*\.dump</Name>' "$work/list" | sed 's/<[^>]*>//g' | sort | tail -1)
  [ -n "$latest" ] || fail 'no dump to test against'
  etag() {
    blob_request HEAD "$latest" -I > /dev/null
    tr -d '\r' < "$work/headers" | awk 'tolower($1) == "etag:" { print $2 }'
  }
  before=$(etag)
  # A deliberately wrong If-Match: authorization is checked first, so a refused
  # identity gets 403. Were it ever authorized, the precondition (412) would stop the
  # change, so this test can never damage the backup it probes.
  put=$(blob_request PUT "$latest" -H 'x-ms-blob-type: BlockBlob' -H 'If-Match: "0x0"' \
    -H 'Content-Type: application/octet-stream' --data-binary 'overwrite-test')
  delete=$(blob_request DELETE "$latest" -H 'If-Match: "0x0"')
  after=$(etag)
  log "overwrite attempt on $latest: HTTP $put; delete attempt: HTTP $delete"
  refused() { [ "$1" = 403 ] || [ "$1" = 409 ]; }
  if refused "$put" && refused "$delete" && [ -n "$before" ] && [ "$before" = "$after" ]; then
    log 'permissions verified: overwrite and delete are refused and the blob is unchanged'
    exit 0
  fi
  fail 'the backup identity was not refused, or the blob changed'
fi

# --- Backup mode --------------------------------------------------------------

now=$(date -u +%s)
started=$(date -u -d "@$now" +%Y%m%dT%H%M%SZ)
day=$(date -u -d "@$now" +%Y-%m-%d)
blob="$day/bikelog-$started"
log "starting $blob"

# Network round trip to the database (quickstart C2): median of ten SELECT 1.
queries=$(printf '%s\n' '\timing on'; for _ in $(seq 10); do printf 'SELECT 1;\n'; done)
median=$(psql "$BIKELOG_DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1 <<< "$queries" |
  awk '/^Time: / { print $2 }' | sort -n |
  awk '{ a[NR] = $1 } END { if (NR) print (NR % 2 ? a[(NR + 1) / 2] : (a[NR / 2] + a[NR / 2 + 1]) / 2) }') ||
  fail 'cannot connect to the database'
[ -n "$median" ] || fail 'cannot connect to the database'
log "database round trip median: $median ms"

# Hold a repeatable-read transaction open and export its snapshot. The manifest
# facts and pg_dump both read that snapshot, so they describe the same moment.
coproc SNAPSHOT { exec psql "$BIKELOG_DATABASE_URL" -X -q -At -v ON_ERROR_STOP=1; }
exec {to_snapshot}>&"${SNAPSHOT[1]}" {from_snapshot}<&"${SNAPSHOT[0]}"
printf '%s\n' 'BEGIN ISOLATION LEVEL REPEATABLE READ, READ ONLY;' 'SELECT pg_export_snapshot();' >&"$to_snapshot"
IFS= read -r -t 60 snapshot <&"$from_snapshot" || fail 'could not export a snapshot'
[[ "$snapshot" =~ ^[0-9A-F-]+$ ]] || fail 'unexpected snapshot id'
# One line: strip the file's -- comments, then join.
sed 's/--.*$//' "$manifest_sql" | tr '\n' ' ' >&"$to_snapshot"
printf '\n' >&"$to_snapshot"
IFS= read -r -t 300 facts <&"$from_snapshot" || fail 'could not read the manifest facts'
jq -e '.tables and .usage and .migration' <<< "$facts" > /dev/null || fail 'incomplete manifest facts'

if [ -n "${BACKUP_TEST_PAUSE_AFTER_MANIFEST:-}" ]; then
  # Test hook: let the test change the source between snapshot and dump.
  touch "$local_dir/.paused"
  for _ in $(seq 1 600); do [ -e "$local_dir/.resume" ] && break; sleep 0.1; done
  [ -e "$local_dir/.resume" ] || fail 'test pause timed out'
fi

pg_dump --dbname="$BIKELOG_DATABASE_URL" --format=custom --snapshot="$snapshot" \
  --no-owner --no-privileges --file="$work/dump" || fail 'pg_dump failed'
printf '%s\n' 'COMMIT;' '\q' >&"$to_snapshot"
exec {to_snapshot}>&-
wait "$SNAPSHOT_PID" || fail 'the snapshot session ended with an error'

bytes=$(wc -c < "$work/dump" | tr -d ' ')
sha=$(sha256sum "$work/dump" | awk '{ print $1 }')
jq -n --argjson facts "$facts" \
  --arg created "$(date -u -d "@$now" +%Y-%m-%dT%H:%M:%SZ)" \
  --arg snapshot "$snapshot" \
  --arg pgdump "$(pg_dump --version | awk '{ print $3 }')" \
  --arg blob "backups/$blob.dump" --argjson bytes "$bytes" --arg sha "$sha" \
  '{formatVersion: 1, createdUtc: $created, snapshotId: $snapshot,
    serverVersion: $facts.serverVersion, pgDumpVersion: $pgdump,
    dumpBlob: $blob, dumpBytes: $bytes, dumpSha256: $sha,
    migration: $facts.migration, tables: $facts.tables, usage: $facts.usage}' > "$work/manifest"

if [ -z "$local_dir" ]; then blob_auth; fi
# The manifest goes last: a backup without one is incomplete by definition.
upload "$work/dump" "$blob.dump"
upload "$work/manifest" "$blob.manifest.json"
log "backup complete: backups/$blob.dump ($bytes bytes, $(jq '.tables | add' "$work/manifest") rows)"
