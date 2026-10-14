#!/usr/bin/env bash
# Operator commands for the hosted environment (contracts/operations.md).
# Needs `az login` as the owner and .local/hosted.env. Never prints secret values.
#
#   hosted.sh status
#   hosted.sh provision-pilot-user --subject <auth0 sub> --email <address> [--dry-run]
#   hosted.sh disable-pilot-user --owner <uuid> [--dry-run]
#   hosted.sh enable-pilot-user --owner <uuid> [--dry-run]
#   hosted.sh backup-now [--dry-run]
#   hosted.sh backups
#   hosted.sh backup-verify-permissions [--dry-run]
#   hosted.sh cost
set -euo pipefail
cd "$(dirname "$0")/../.."

usage() {
  sed -n '5,12p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}
die() {
  echo "hosted.sh: $*" >&2
  exit 1
}

env_file=.local/hosted.env
[ -f "$env_file" ] || die "missing $env_file; copy scripts/hosted/hosted.env.example and fill it in"
if grep -Eq '^[A-Z0-9_]+=.*<' "$env_file"; then
  die "$env_file still has placeholder values: $(grep -E '^[A-Z0-9_]+=.*<' "$env_file" | cut -d= -f1 | tr '\n' ' ')"
fi
# shellcheck source=/dev/null
. "$env_file"
: "${AZURE_SUBSCRIPTION_ID:?set in $env_file}" "${AZURE_RESOURCE_GROUP:?set in $env_file}"
rg=$AZURE_RESOURCE_GROUP
sub=(--subscription "$AZURE_SUBSCRIPTION_ID")

[ $# -ge 1 ] || usage
command=$1
shift
dry_run=false
rest=()
for arg in "$@"; do
  if [ "$arg" = --dry-run ]; then dry_run=true; else rest+=("$arg"); fi
done
set -- ${rest[@]+"${rest[@]}"}

# Runs a changing az command, or only prints it with --dry-run.
run() {
  if $dry_run; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

# option NAME ARGS... -> the value after NAME; every option must appear exactly once.
option() {
  local name=$1 found='' count=0
  shift
  while [ $# -gt 0 ]; do
    if [ "$1" = "$name" ]; then
      [ $# -ge 2 ] || die "$name needs a value"
      found=$2
      count=$((count + 1))
      shift
    fi
    shift
  done
  [ "$count" = 1 ] || die "$name must be given once"
  printf '%s' "$found"
}

work=$(mktemp -d)
cleanup_actions=()
cleanup() {
  local action
  for action in ${cleanup_actions[@]+"${cleanup_actions[@]}"}; do eval "$action" || true; done
  rm -rf "$work"
}
trap cleanup EXIT

job_url() {
  printf 'https://management.azure.com/subscriptions/%s/resourceGroups/%s/providers/Microsoft.App/jobs/%s?api-version=2026-07-01' \
    "$AZURE_SUBSCRIPTION_ID" "$rg" "$1"
}

# Sets one container's arguments on the job definition and waits until it is applied.
# `az containerapp job update --args` cannot take values starting with "--", and
# `az containerapp job start --args` would replace the whole container for that
# execution, dropping its secrets and CA mount. So the template is read, only `args`
# is changed with jq, and it is patched back.
set_job_args() { # job container args...
  local job=$1 container=$2 state
  shift 2
  # NUL-separated input, because jq (like az) would parse "--" values as its own options.
  if [ $# -eq 0 ]; then
    echo '[]' > "$work/args.json"
  else
    printf '%s\0' "$@" | jq -Rs 'split("\u0000") | .[:-1]' > "$work/args.json"
  fi
  if $dry_run; then
    echo "+ set $job/$container args to $(jq -c . "$work/args.json") (az rest PATCH $(job_url "$job"))"
    return 0
  fi
  az rest --method get --url "$(job_url "$job")" -o json > "$work/job.json"
  jq --arg c "$container" --slurpfile a "$work/args.json" \
    '{properties: {template: (.properties.template | .containers |= map(if .name == $c then .args = $a[0] else . end))}}' \
    "$work/job.json" > "$work/patch.json"
  az rest --method patch --url "$(job_url "$job")" --body @"$work/patch.json" -o none
  for _ in $(seq 1 60); do
    state=$(az rest --method get --url "$(job_url "$job")" --query properties.provisioningState -o tsv)
    [ "$state" = Succeeded ] && return 0
    [ "$state" = Failed ] && die "updating $job failed"
    sleep 2
  done
  die "updating $job did not finish"
}

# Runs one execution of a job with the given arguments, waits for it and prints its
# status and console output. The job's default arguments are restored afterwards,
# and each deployment resets them too.
run_job() { # job container timeout-seconds default-args(empty or one word) args...
  local job=$1 container=$2 timeout=$3 default=$4 execution status logs
  shift 4
  if [ $# -gt 0 ]; then
    set_job_args "$job" "$container" "$@"
    if ! $dry_run; then
      if [ -n "$default" ]; then
        cleanup_actions+=("set_job_args '$job' '$container' '$default'")
      else
        cleanup_actions+=("set_job_args '$job' '$container'")
      fi
    fi
  fi
  if $dry_run; then
    run az containerapp job start "${sub[@]}" -g "$rg" -n "$job" --query name -o tsv
    return 0
  fi
  execution=$(az containerapp job start "${sub[@]}" -g "$rg" -n "$job" --query name -o tsv)
  echo "Started $execution"
  status=Running
  for _ in $(seq 1 $((timeout / 5 + 24))); do
    status=$(az containerapp job execution show "${sub[@]}" -g "$rg" -n "$job" \
      --job-execution-name "$execution" --query properties.status -o tsv)
    case "$status" in Succeeded | Failed | Stopped | Degraded) break ;; esac
    sleep 5
  done
  echo "Execution $execution: $status"
  # Console output reaches Log Analytics after a delay of up to a few minutes.
  # `az containerapp job logs show` is a preview command; fall back to the portal.
  logs=''
  for _ in 1 2 3 4 5 6; do
    logs=$(az containerapp job logs show "${sub[@]}" -g "$rg" -n "$job" --container "$container" \
      --execution "$execution" --format text --tail 100 --only-show-errors 2> /dev/null || true)
    [ -n "$logs" ] && break
    sleep 10
  done
  if [ -n "$logs" ]; then
    # A last line of defence: drop anything shaped like a credential.
    printf '%s\n' "$logs" | grep -viE 'password=|eyJ|sig=|bearer ' || true
  else
    echo "No console output yet; see the job's execution history in the portal."
  fi
  [ "$status" = Succeeded ]
}

job_env() { # job name -> the value of that environment variable in the job definition
  az containerapp job show "${sub[@]}" -g "$rg" -n "$1" \
    --query "properties.template.containers[0].env[?name=='$2'].value | [0]" -o tsv
}

require_uuid() {
  [[ "$1" =~ ^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$ ]] ||
    die "--owner must be a UUID in the form 00000000-0000-0000-0000-000000000000"
}

case "$command" in
  status)
    [ $# -eq 0 ] || usage
    az containerapp show "${sub[@]}" -g "$rg" -n ca-bikelog --query \
      "{fqdn: properties.configuration.ingress.fqdn, imageTag: tags.imageTag, latestRevision: properties.latestRevisionName, runningStatus: properties.runningStatus}" -o table
    revision=$(az containerapp show "${sub[@]}" -g "$rg" -n ca-bikelog --query properties.latestRevisionName -o tsv)
    az containerapp revision show "${sub[@]}" -g "$rg" -n ca-bikelog --revision "$revision" \
      --query "{revision: name, running: properties.runningState, health: properties.healthState, replicas: properties.replicas}" -o table
    for job in job-bikelog-migrate job-bikelog-ops job-bikelog-backup; do
      echo
      echo "$job (last three executions)"
      az containerapp job execution list "${sub[@]}" -g "$rg" -n "$job" --query \
        "sort_by(@, &properties.startTime)[-3:].{execution: name, status: properties.status, started: properties.startTime, ended: properties.endTime}" -o table
    done
    ;;

  provision-pilot-user)
    subject=$(option --subject "$@")
    email=$(option --email "$@")
    [ $# -eq 4 ] || usage
    [[ "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+$ ]] || die '--email must be an email address'
    if $dry_run; then
      issuer='<Auth__Issuer of job-bikelog-ops>'
    else
      issuer=$(job_env job-bikelog-ops Auth__Issuer)
      [ -n "$issuer" ] || die 'could not read Auth__Issuer from job-bikelog-ops'
    fi
    run_job job-bikelog-ops ops 120 --help \
      --provision-pilot-user --issuer "$issuer" --subject "$subject" --email "$email"
    ;;

  disable-pilot-user | enable-pilot-user)
    owner=$(option --owner "$@")
    [ $# -eq 2 ] || usage
    require_uuid "$owner"
    run_job job-bikelog-ops ops 120 --help "--$command" --owner "$owner"
    ;;

  backup-now)
    [ $# -eq 0 ] || usage
    run_job job-bikelog-backup backup 900 '' ||
      die 'the backup failed; see the output above'
    ;;

  backup-verify-permissions)
    [ $# -eq 0 ] || usage
    run_job job-bikelog-backup backup 120 '' --verify-permissions
    ;;

  backups)
    [ $# -eq 0 ] || usage
    : "${BACKUP_STORAGE_ACCOUNT:?set in $env_file}"
    since=$(date -u -v-35d +%Y-%m-%d 2> /dev/null || date -u -d '35 days ago' +%Y-%m-%d)
    az storage blob list "${sub[@]}" --auth-mode login --account-name "$BACKUP_STORAGE_ACCOUNT" \
      --container-name backups --num-results '*' --only-show-errors --query \
      "[?properties.creationTime >= '$since'].{name: name, bytes: properties.contentLength, created: properties.creationTime}" -o table
    ;;

  cost)
    [ $# -eq 0 ] || usage
    # Month-to-date actual spend for the resource group, as the budget tracks it.
    # Cost data lags by up to a day.
    az consumption budget show "${sub[@]}" -g "$rg" --budget-name budget-bikelog --query \
      "{budget: amount, currentSpend: currentSpend.amount, forecast: forecastSpend.amount, unit: currentSpend.unit}" -o table ||
      echo 'The CLI could not read the budget.'
    echo "Cost analysis: https://portal.azure.com/#@/resource/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/$rg/costanalysis"
    ;;

  *) usage ;;
esac
