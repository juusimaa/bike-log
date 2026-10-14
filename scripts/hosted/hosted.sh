#!/usr/bin/env bash
# Azure commands that still apply after the move to UpCloud (spec 005): the backup
# storage and the budget. Needs `az login` as the owner and .local/hosted.env.
# Never prints secret values.
#
#   hosted.sh backups
#   hosted.sh cost
#
# Status, deploys, pilot riders and backup runs moved to bikelog-deploy on the
# server (docs/hosting/upcloud.md).
set -euo pipefail
cd "$(dirname "$0")/../.."

usage() {
  sed -n '6,7p' "$0" | sed 's/^# \{0,1\}//' >&2
  exit 2
}
die() {
  echo "hosted.sh: $*" >&2
  exit 1
}

[ $# -ge 1 ] || usage
case "$1" in
  status | provision-pilot-user | disable-pilot-user | enable-pilot-user | backup-now | backup-verify-permissions)
    echo "hosted.sh: $1 moved to bikelog-deploy on the server (docs/hosting/upcloud.md)." >&2
    exit 2
    ;;
esac

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

command=$1
shift

case "$command" in
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
