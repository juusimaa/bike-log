#!/usr/bin/env bash
# Tests scripts/upcloud/bikelog-deploy against Docker (quickstart L2).
#
# Runs on a private Docker daemon (docker:dind) so the stand-in registry on
# 127.0.0.1 is reachable from the daemon on macOS as well as Linux, and nothing
# outside the test touches the host's Docker. The script under test runs in a
# Debian runner container that shares the daemon's network namespace and a work
# volume. On exit the daemon, its volumes, the work volume and the runner image are
# removed, and nothing else. Synthetic values only.
# Needs Docker with privileged containers (Docker Desktop or a Linux host).
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../../.." && pwd)

dind_image=docker:29.8.2-dind@sha256:1e08cdb63405ca788aea94ef35b792d1e299607c667d33d7bcbcae1fd2611ced
registry_image=registry:3.0.0@sha256:6c5666b861f3505b116bb9aa9b25175e71210414bd010d92035ff64018f9457e
node_image=node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66
pg_image=postgres:18.6@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336

if [ "${BIKELOG_TEST_INSIDE:-}" != 1 ]; then
  run_id="bikelog-upcloud-test-$(date +%s)-$$"
  runner_image="bikelog-upcloud-runner:$run_id"
  socket=unix:///run/dind/docker.sock
  # shellcheck disable=SC2329 # called by the EXIT trap
  cleanup() {
    docker rm -f -v "$run_id-dind" > /dev/null 2>&1 || true
    docker volume rm "$run_id-socket" "$run_id-work" > /dev/null 2>&1 || true
    docker image rm "$runner_image" > /dev/null 2>&1 || true
  }
  trap cleanup EXIT
  echo "== Private Docker daemon ($run_id)"
  docker build -q -t "$runner_image" "$here/images/runner" > /dev/null
  docker volume create "$run_id-socket" > /dev/null
  docker volume create "$run_id-work" > /dev/null
  docker run -d --privileged --name "$run_id-dind" \
    -v "$run_id-socket:/run/dind" -v "$run_id-work:/work" \
    "$dind_image" dockerd --host="$socket" > /dev/null
  ready=false
  for _ in $(seq 1 60); do
    if docker exec "$run_id-dind" docker -H "$socket" info > /dev/null 2>&1; then
      ready=true
      break
    fi
    sleep 1
  done
  $ready || { docker logs "$run_id-dind" | tail -20; echo 'FAIL: the test daemon did not start.' >&2; exit 1; }
  docker run --rm --network "container:$run_id-dind" \
    -v "$run_id-socket:/run/dind" -v "$run_id-work:/work" -v "$repo:/repo:ro" \
    -e DOCKER_HOST="$socket" -e BIKELOG_TEST_INSIDE=1 \
    "$runner_image" bash /repo/scripts/upcloud/tests/run.sh
  exit
fi

# --- Inside the runner ----------------------------------------------------------------

shopt -s inherit_errexit
# shellcheck source=scripts/upcloud/tests/lib.sh
. "$here/lib.sh"
work=/work
root=$work/root
project=bikelog-test
script=/repo/scripts/upcloud/bikelog-deploy
: > "$work/all.log"
platform=$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}')

step 'Registry and stand-in images'
docker run -d --name registry -p 127.0.0.1::5000 "$registry_image" > /dev/null
port=$(docker port registry 5000/tcp | head -1 | sed 's/.*://')
prefix=127.0.0.1:$port/bike-log

# push REF -> the pushed reference by digest; the local tag is removed, so only the
# registry holds the image, as on a fresh server.
push() {
  local ref=$1 digest
  docker push -q --platform "$platform" "$ref" > /dev/null
  digest=$(docker buildx imagetools inspect "$ref" --format '{{json .Manifest}}' | json_field digest)
  docker image rm "$ref" > /dev/null
  echo "${ref%:*}@$digest"
}
standin() { # repository role variant
  local ref="$prefix/$1:$2-$3"
  docker build -q --build-arg ROLE="$2" --build-arg VARIANT="$3" -t "$ref" "$here/images/standin" > /dev/null
  push "$ref"
}
web1=$(standin web web-ok 1)
web2=$(standin web web-ok 2)
web3=$(standin web web-ok 3)
web_bad=$(standin web web-bad 1)
api=$(standin api api 1)
migrate_ok=$(standin migrations migrate-ok 1)
migrate_fail=$(standin migrations migrate-fail 1)
backup=$(standin backup backup 1)
docker pull -q --platform "$platform" "$pg_image" > /dev/null
docker tag "$pg_image" "$prefix/backup:postgres"
backup_pg=$(push "$prefix/backup:postgres")
# Unrelated images that pruning must leave alone: one tagged for the same registry,
# and the base images pulled from elsewhere.
docker pull -q "$node_image" > /dev/null
docker tag "$node_image" "127.0.0.1:$port/other/unrelated:keep"
echo "pushed to $prefix"

step 'Temporary server root'
mkdir -p "$root/secrets"
cp /repo/deploy/upcloud/compose.yaml "$root/"
pg_password=test-pg-$RANDOM$RANDOM
cat > "$root/settings.env" << EOF
WEB_PUBLIC_ORIGIN=https://bikelog.example.test
AUTH0_ISSUER=https://issuer.example.test/
AUTH0_AUDIENCE=https://api.example.test
AUTH0_CLIENT_ID=test-client-id
Operator__HostedDatabaseHost=db.example.test
CADDY_NETWORK=$project-caddy
EOF
printf '%s\n' 'AUTH0_CLIENT_SECRET=test-client-secret-value' 'BIKELOG_WEB_DATABASE_URL=postgresql://u:test-db-password@db.example.test/d' \
  'BIKELOG_SESSION_KEY=test-session-key-value' > "$root/secrets/app.env"
printf '%s\n' 'ConnectionStrings__Postgres=Host=db.example.test;Password=test-db-password' 'STANDIN_MARKER=default' > "$root/secrets/api.env"
printf '%s\n' 'ConnectionStrings__Postgres=Host=db.example.test;Password=test-db-password' 'STANDIN_MARKER=alt' > "$root/secrets/api.alt.env"
printf '%s\n' "BIKELOG_DATABASE_URL=postgresql://postgres:$pg_password@testdb:5432/postgres" > "$root/secrets/backup.env"
echo 'not a real certificate' > "$root/secrets/aiven-ca-certificate"
echo 'not a real key' > "$root/secrets/backup-client.pem"
docker network create "$project-caddy" > /dev/null
secret_values=(test-client-secret-value test-db-password test-session-key-value "$pg_password")

tag1=sha-1111111 tag2=sha-2222222 tag3=sha-3333333 tag_bad=sha-badbad0 tag_pg=sha-4444444

step 'Settings: test overrides are refused outside test mode'
code=0
BIKELOG_ROOT=$root "$script" status > "$work/out" 2>&1 || code=$?
[ "$code" = 64 ] || fail "BIKELOG_ROOT without test mode: exit $code"
pass 'BIKELOG_ROOT without test mode (exit 64)'
code=0
BIKELOG_DEPLOY_TEST=1 BIKELOG_ROOT=/srv/bikelog "$script" status > "$work/out" 2>&1 || code=$?
[ "$code" = 64 ] || fail "test mode with /srv/bikelog: exit $code"
pass 'test mode with the production root (exit 64)'

step 'A valid deploy (T007)'
expect 0 'first deploy' -- deploy "$tag1" "$web1" "$api" "$migrate_ok" "$backup"
output_has "result=ok tag=$tag1 previous=none"
output_has STANDIN-MIGRATE-RAN
[ "$(release_value release.env IMAGE_TAG)" = "$tag1" ] || fail 'release.env does not name the new tag'
[ "$(release_value release.env WEB_IMAGE)" = "$web1" ] || fail 'release.env does not name the new web image'
[ -n "$(release_value release.env DEPLOYED_UTC)" ] || fail 'release.env has no DEPLOYED_UTC'
[ ! -e "$root/release.previous.env" ] || fail 'a first deploy wrote release.previous.env'
[ "$(web_health)" = healthy ] || fail 'web is not healthy'
api_container=$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=api)
[ "$(docker inspect --format '{{.HostConfig.NetworkMode}}' "$api_container")" = "container:$(docker inspect --format '{{.Id}}' "$(web_container)")" ] ||
  fail 'api does not share the web container network namespace'
[ -z "$(docker port "$(web_container)")" ] || fail 'web publishes a port'
pass 'release.env written; web healthy; api in web namespace; no published port'

step 'Argument validation happens before Docker (T007)'
# A daemon that does not exist: any Docker call would fail with 1, not 64.
nodocker=DOCKER_HOST=unix:///nonexistent.sock
expect 64 'a malformed image reference' "$nodocker" -- deploy "$tag2" "$prefix/web@sha256:abc" "$api" "$migrate_ok" "$backup"
expect 64 'an image name in the wrong position' "$nodocker" -- deploy "$tag2" "$api" "$web1" "$migrate_ok" "$backup"
expect 64 'an image from another registry' "$nodocker" -- deploy "$tag2" "ghcr.io/other/web@${web1#*@}" "$api" "$migrate_ok" "$backup"
expect 64 'an extra argument' "$nodocker" -- deploy "$tag2" "$web1" "$api" "$migrate_ok" "$backup" extra
expect 64 'a malformed tag' "$nodocker" -- deploy sha-12 "$web1" "$api" "$migrate_ok" "$backup"
expect 64 'a ; in an argument' "$nodocker" -- deploy "$tag2;ls" "$web1" "$api" "$migrate_ok" "$backup"
# shellcheck disable=SC2016 # the $() is the literal text under test
expect 64 'a $() in an argument' "$nodocker" -- deploy "\$(id)" "$web1" "$api" "$migrate_ok" "$backup"
expect 64 'an unknown command' "$nodocker" -- shell
expect 64 'no command' "$nodocker" --
[ "$(release_value release.env IMAGE_TAG)" = "$tag1" ] || fail 'validation changed release.env'

step 'A failing migration leaves everything unchanged (T007)'
before=$(cat "$root/release.env")
web_before=$(web_container)
expect 1 'deploy with a failing migration' -- deploy "$tag_bad" "$web2" "$api" "$migrate_fail" "$backup"
output_has "result=failed tag=$tag_bad previous=$tag1"
[ "$(cat "$root/release.env")" = "$before" ] || fail 'release.env changed'
[ ! -e "$root/release.previous.env" ] || fail 'release.previous.env was written'
[ "$(web_container)" = "$web_before" ] || fail 'the web container was replaced'
pass 'release files and containers unchanged'

step 'An unhealthy web container brings back the previous release (T007)'
expect 1 'deploy of an unhealthy web image' -- deploy "$tag_bad" "$web_bad" "$api" "$migrate_ok" "$backup"
output_has "result=failed tag=$tag_bad previous=$tag1"
[ "$(cat "$root/release.env")" = "$before" ] || fail 'release.env was not restored'
[ ! -e "$root/release.previous.env" ] || fail 'release.previous.env was not restored'
[ "$(web_image)" = "$web1" ] || fail "web runs $(web_image), not the previous release"
[ "$(web_health)" = healthy ] || fail 'the previous release is not healthy'
pass 'previous release serving and healthy'

step 'The lock (T007)'
flock "$root/deploy.lock" sleep 4 &
holder=$!
sleep 0.5
expect 75 'a second caller while the lock is held' BIKELOG_LOCK_WAIT=1 -- status
started=$(date +%s)
expect 0 'a second caller that waits for the lock' BIKELOG_LOCK_WAIT=30 -- status
[ $(($(date +%s) - started)) -ge 2 ] || fail 'status did not wait for the lock'
wait "$holder"
output_has "current:  $tag1"

step 'gate (T012)'
expect 0 'gate owner-only with an IPv4 address' "$nodocker" -- gate owner-only 203.0.113.7
output_has 'bikelog.example.test {'
output_has '@not_owner not remote_ip 203.0.113.7'
output_has 'reverse_proxy bikelog-web:3000'
expect 0 'gate owner-only with an IPv6 range' "$nodocker" -- gate owner-only 2001:db8::/48
output_has 'remote_ip 2001:db8::/48'
expect 0 'gate open' "$nodocker" -- gate open
output_lacks remote_ip
output_has 'reverse_proxy bikelog-web:3000'
expect 64 'gate with an invalid address' "$nodocker" -- gate owner-only 203.0.113.300
expect 64 'gate with a CIDR prefix out of range' "$nodocker" -- gate owner-only 203.0.113.0/33
expect 64 'gate with text instead of an address' "$nodocker" -- gate owner-only 'any; reverse_proxy x'
expect 64 'gate without an address' "$nodocker" -- gate owner-only

step 'Backups and the timer caller (T027)'
expect 0 'backup by the owner' -- backup
output_has 'STANDIN-BACKUP-RAN []'
expect 0 'backup-verify-permissions by the owner' -- backup-verify-permissions
output_has 'STANDIN-BACKUP-RAN ["--verify-permissions"]'
expect 0 'backup by the timer' BIKELOG_CALLER=timer -- backup
for command in status deploy rollback restart backup-verify-permissions db-connections; do
  expect 64 "$command by the timer" BIKELOG_CALLER=timer "$nodocker" -- "$command"
done

step 'Operator commands (T040)'
expect 0 'provision-pilot-user' -- provision-pilot-user --subject 'auth0|abc' --email a@example.test
output_has 'STANDIN-OPS ["--provision-pilot-user","--issuer","https://issuer.example.test/","--subject","auth0|abc","--email","a@example.test"]'
owner=0f8fad5b-d9cb-469f-a165-70867728950e
expect 0 'disable-pilot-user' -- disable-pilot-user --owner "$owner"
output_has "STANDIN-OPS [\"--disable-pilot-user\",\"--owner\",\"$owner\"]"
expect 0 'enable-pilot-user' -- enable-pilot-user --owner "$owner"
output_has "STANDIN-OPS [\"--enable-pilot-user\",\"--owner\",\"$owner\"]"
expect 64 'a subject from another provider' "$nodocker" -- provision-pilot-user --subject 'google|abc' --email a@example.test
expect 64 'a subject with a space' "$nodocker" -- provision-pilot-user --subject 'auth0|a b' --email a@example.test
expect 64 'an address with a space' "$nodocker" -- provision-pilot-user --subject 'auth0|abc' --email 'a b@example.test'
expect 64 'an address with a quote' "$nodocker" -- provision-pilot-user --subject 'auth0|abc' --email "a'b@example.test"
expect 64 'a missing option' "$nodocker" -- provision-pilot-user --subject 'auth0|abc'
expect 64 'a repeated option' "$nodocker" -- provision-pilot-user --subject 'auth0|abc' --subject 'auth0|abc'
expect 64 'a non-UUID owner' "$nodocker" -- disable-pilot-user --owner 123
expect 64 'a repeated owner' "$nodocker" -- enable-pilot-user --owner "$owner" --owner "$owner"
key=(SUDO_USER=bikelog-deploy)
expect 64 'provision-pilot-user by the deploy key' "${key[@]}" "$nodocker" \
  "SSH_ORIGINAL_COMMAND=provision-pilot-user --subject auth0|abc --email a@example.test" --

step 'The deploy key caller (T033)'
expect 0 'status by the deploy key, positional arguments ignored' "${key[@]}" SSH_ORIGINAL_COMMAND=status -- restart
output_has "current:  $tag1"
output_has 'web: running healthy'
for command in restart backup backup-verify-permissions db-connections 'gate open'; do
  expect 64 "$command by the deploy key" "${key[@]}" "$nodocker" "SSH_ORIGINAL_COMMAND=$command" --
done
expect 64 'an empty forced command' "${key[@]}" "$nodocker" SSH_ORIGINAL_COMMAND= -- status
expect 64 'a forced command with ;' "${key[@]}" "$nodocker" 'SSH_ORIGINAL_COMMAND=status; id' --
# shellcheck disable=SC2016 # the $() is the literal text under test
expect 64 'a forced command with $()' "${key[@]}" "$nodocker" "SSH_ORIGINAL_COMMAND=status \$(id)" --
expect 64 'a forced command with a newline' "${key[@]}" "$nodocker" "SSH_ORIGINAL_COMMAND=status
id" --
expect 64 '--api-env by the deploy key' "${key[@]}" "$nodocker" \
  "SSH_ORIGINAL_COMMAND=deploy $tag1 $web1 $api $migrate_ok $backup --api-env api.alt.env" --

step 'The failed-deploy rehearsal option (T038)'
expect 64 '--api-env outside secrets/' "$nodocker" -- deploy "$tag1" "$web1" "$api" "$migrate_ok" "$backup" --api-env ../settings.env
expect 64 '--api-env with an absolute path' "$nodocker" -- deploy "$tag1" "$web1" "$api" "$migrate_ok" "$backup" --api-env /etc/passwd
expect 64 '--api-env with a missing file' "$nodocker" -- deploy "$tag1" "$web1" "$api" "$migrate_ok" "$backup" --api-env missing.env
expect 64 '--api-env without a file' "$nodocker" -- deploy "$tag1" "$web1" "$api" "$migrate_ok" "$backup" --api-env
expect 0 'redeploy of the current tag with --api-env' -- deploy "$tag1" "$web1" "$api" "$migrate_ok" "$backup" --api-env api.alt.env
api_env() { docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' \
  "$(docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=api)"; }
api_env | grep -qx STANDIN_MARKER=alt || fail 'api did not get the --api-env file'
! grep -q API_ENV_FILE "$root/release.env" || fail 'release.env records the --api-env option'
expect 0 'restart after the rehearsal' -- restart
api_env | grep -qx STANDIN_MARKER=default || fail 'restart did not go back to api.env'
pass 'the option applies to that deploy only'

step 'Rollback (T033)'
expect 0 'deploy of a second version' -- deploy "$tag2" "$web2" "$api" "$migrate_ok" "$backup"
output_has "result=ok tag=$tag2 previous=$tag1"
expect 0 'rollback by the deploy key' "${key[@]}" SSH_ORIGINAL_COMMAND=rollback --
output_has "result=ok tag=$tag1 previous=$tag2"
output_lacks STANDIN-MIGRATE-RAN
[ "$(web_image)" = "$web1" ] || fail 'rollback did not start the previous web image'
[ "$(release_value release.previous.env IMAGE_TAG)" = "$tag2" ] || fail 'rollback did not swap the release files'
expect 0 'rollback again' -- rollback
output_has "result=ok tag=$tag2 previous=$tag1"
[ "$(web_image)" = "$web2" ] || fail 'the second rollback did not start web2'
mv "$root/release.previous.env" "$work/held.env"
expect 64 'rollback with no previous release' -- rollback
mv "$work/held.env" "$root/release.previous.env"

step 'Disk check (T033)'
expect 73 'deploy with under 3 GB left after the pull' BIKELOG_TEST_FREE_BYTES=$((3 * 1024 * 1024 * 1024 + 1)) -- \
  deploy "$tag3" "$web3" "$api" "$migrate_ok" "$backup"
output_has 'not enough disk'
! docker image inspect "$web3" > /dev/null 2>&1 || fail 'the disk check pulled the image'
[ "$(release_value release.env IMAGE_TAG)" = "$tag2" ] || fail 'the disk check changed release.env'

step 'Pruning (T033)'
expect 0 'third successful deploy' -- deploy "$tag3" "$web3" "$api" "$migrate_ok" "$backup"
output_has "result=ok tag=$tag3 previous=$tag2"
present=$(docker images --digests --format '{{.Repository}}@{{.Digest}}' | grep "^$prefix/" | sort -u)
expected=$(printf '%s\n' "$web2" "$web3" "$api" "$migrate_ok" "$backup" | sort -u)
[ "$present" = "$expected" ] || fail "Bike Log images after pruning:
$present
expected:
$expected"
docker image inspect "127.0.0.1:$port/other/unrelated:keep" > /dev/null || fail 'pruning removed an unrelated image'
docker image inspect "$node_image" > /dev/null || fail 'pruning removed the node base image'
docker image inspect "$registry_image" > /dev/null || fail 'pruning removed the registry image'
pass 'only the current and previous Bike Log digests remain; other images untouched'

step 'db-connections against PostgreSQL 18.6 (T018)'
expect 0 'deploy with the PostgreSQL client as the backup image' -- deploy "$tag_pg" "$web3" "$api" "$migrate_ok" "$backup_pg"
docker run -d --name "$project-testdb" --network "${project}_default" --network-alias testdb \
  -e POSTGRES_PASSWORD="$pg_password" "$pg_image" > /dev/null
for _ in $(seq 1 60); do
  docker exec "$project-testdb" pg_isready -q -h 127.0.0.1 -U postgres && break
  sleep 1
done
docker exec -d -e PGPASSWORD="$pg_password" "$project-testdb" psql -h 127.0.0.1 -U postgres -c 'SELECT pg_sleep(60)'
sleep 2
expect 0 'db-connections' -- db-connections
output_has '127.0.0.x 1'
output_lacks '127.0.0.1'
output_lacks pg_sleep
docker rm -f "$project-testdb" > /dev/null

step 'No secret value in any output (FR-012)'
for value in "${secret_values[@]}"; do
  ! grep -qF -- "$value" "$work/all.log" || fail "a secret value appeared in the output"
done
pass "searched $(wc -l < "$work/all.log") lines of output"

docker compose --project-name "$project" --project-directory "$root" -f "$root/compose.yaml" \
  --env-file "$root/settings.env" --env-file "$root/release.env" down > /dev/null 2>&1 || true
echo
echo 'bikelog-deploy tests passed.'
