# Helpers for scripts/upcloud/tests/run.sh (sourced inside the runner container).
# shellcheck shell=bash
# work, root, prefix, project and script are set by run.sh before it sources this.
# shellcheck disable=SC2154

step() { printf '\n== %s\n' "$*"; }
pass() { printf 'ok: %s\n' "$*"; }
fail() {
  printf 'FAIL: %s\n' "$*" >&2
  if [ -f "$work/out" ]; then
    echo '--- output of the last command:' >&2
    cat "$work/out" >&2
  fi
  exit 1
}

# json_field FIELD < json -> the value of a top-level field.
json_field() {
  node -e 'let s = ""; process.stdin.on("data", d => (s += d)).on("end", () => console.log(JSON.parse(s)[process.argv[1]]))' "$1"
}

# bd [VAR=value...] -- ARGS... : runs bikelog-deploy in test mode against the
# temporary root; output goes to $work/out and the exit code to $code.
bd() {
  local extra=()
  while [ "$1" != -- ]; do
    extra+=("$1")
    shift
  done
  shift
  code=0
  env BIKELOG_DEPLOY_TEST=1 BIKELOG_ROOT="$root" BIKELOG_IMAGE_PREFIX="$prefix" \
    BIKELOG_COMPOSE_PROJECT="$project" BIKELOG_TEST_FREE_BYTES=1000000000000 \
    ${extra[@]+"${extra[@]}"} "$script" "$@" > "$work/out" 2>&1 || code=$?
  cat "$work/out" >> "$work/all.log"
}

# expect CODE DESCRIPTION [VAR=value...] -- ARGS...
expect() {
  local want=$1 description=$2
  shift 2
  bd "$@"
  [ "$code" = "$want" ] || fail "$description: exit $code, expected $want"
  pass "$description (exit $want)"
}

output_has() { grep -qF -- "$1" "$work/out" || fail "output lacks: $1"; }
output_lacks() { ! grep -qF -- "$1" "$work/out" || fail "output contains: $1"; }

release_value() { sed -n "s/^$2=//p" "$root/$1"; }

web_container() { docker ps -q --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=web; }
web_health() { docker inspect --format '{{.State.Health.Status}}' "$(web_container)"; }
web_image() { docker inspect --format '{{.Config.Image}}' "$(web_container)"; }
