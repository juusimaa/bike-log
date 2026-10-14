#!/usr/bin/env bash
# Moves the backup image's Debian snapshot and package pins together
# (images/backup/Dockerfile). Changes only that file.
#
#   update-backup-pins.sh                    newest snapshot at least 12 hours old
#   update-backup-pins.sh --timestamp <T>    a given snapshot, e.g. 20261014T061051Z
#
# The candidate versions come from apt inside the pinned base image, pointed at
# the snapshot. Every package file must download for both image platforms before
# the Dockerfile is touched, so a half-imported snapshot is never pinned.
# Needs Docker, curl and jq.
set -euo pipefail
cd "$(dirname "$0")/../.."

dockerfile=images/backup/Dockerfile
packages=(ca-certificates curl jq)
platforms=(amd64 arm64)
base=$(sed -n 's/^FROM \(postgres:[^ ]*\)$/\1/p' "$dockerfile")
[ -n "$base" ] || { echo "No pinned FROM line in $dockerfile." >&2; exit 1; }

case "${1:-}" in
  --timestamp)
    [ $# -eq 2 ] || { echo 'Usage: update-backup-pins.sh [--timestamp <YYYYMMDDTHHMMSSZ>]' >&2; exit 2; }
    stamp=$2 ;;
  '')
    # The security archive changes most often; anything newer may still be importing.
    cutoff=$(date -u -d '12 hours ago' +%Y%m%dT%H%M%SZ 2> /dev/null || date -u -v-12H +%Y%m%dT%H%M%SZ)
    stamp=$(curl -fsS --retry 5 --max-time 120 'https://snapshot.debian.org/mr/timestamp/?archive=debian-security' |
      jq -r --arg cutoff "$cutoff" '[.result["debian-security"][] | select(. <= $cutoff)] | last')
    ;;
  *) echo 'Usage: update-backup-pins.sh [--timestamp <YYYYMMDDTHHMMSSZ>]' >&2; exit 2 ;;
esac
[[ "$stamp" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || { echo "Bad snapshot timestamp: $stamp" >&2; exit 1; }
echo "Snapshot $stamp, base $base"

# Inside the base image: read the candidates, then print each package file's URL for
# every platform. apt prints URLs only; nothing is installed.
result=$(docker run --rm -e STAMP="$stamp" -e PACKAGES="${packages[*]}" -e PLATFORMS="${platforms[*]}" \
  --entrypoint bash "$base" -c '
set -euo pipefail
mkdir /tmp/s
for archive in debian debian-security; do
  suites="trixie trixie-updates"; [ $archive = debian-security ] && suites=trixie-security
  printf "Types: deb\nURIs: http://snapshot.debian.org/archive/%s/%s\nSuites: %s\nComponents: main\nSigned-By: /usr/share/keyrings/debian-archive-keyring.gpg\n\n" \
    "$archive" "$STAMP" "$suites" >> /tmp/s/snapshot.sources
done
for p in $PLATFORMS; do dpkg --add-architecture "$p"; done
apt=(apt-get -qq -o Dir::Etc::SourceList=/dev/null -o Dir::Etc::SourceParts=/tmp/s -o Acquire::Check-Valid-Until=false -o Acquire::Retries=5)
"${apt[@]}" update > /dev/null
for pkg in $PACKAGES; do
  version=$(apt-cache -o Dir::Etc::SourceList=/dev/null -o Dir::Etc::SourceParts=/tmp/s policy "$pkg" | awk "/Candidate:/ {print \$2}")
  echo "pin $pkg=$version"
  for p in $PLATFORMS; do
    "${apt[@]}" install --print-uris --no-install-recommends -y "$pkg:$p=$version" 2> /dev/null | sed -n "s/^.\(http[^ ]*\). .*/url \1/p"
  done
done')
pins=$(sed -n 's/^pin //p' <<< "$result")
urls=$(sed -n 's/^url //p' <<< "$result" | sort -u)
[ "$(wc -l <<< "$pins" | tr -d ' ')" = "${#packages[@]}" ] || { echo "Could not resolve every package:" >&2; echo "$result" >&2; exit 1; }
if grep -q '=$' <<< "$pins"; then echo "A package has no candidate in $stamp:" >&2; echo "$pins" >&2; exit 1; fi

# Every file, including dependencies, must be served for both platforms.
missing=0
while read -r url; do
  [ -n "$url" ] || continue
  code=$(curl -sS -o /dev/null -w '%{http_code}' -I -L --retry 3 --max-time 60 "$url")
  [ "$code" = 200 ] || { echo "Not downloadable ($code): $url" >&2; missing=$((missing + 1)); }
done <<< "$urls"
[ "$missing" -eq 0 ] || { echo "$missing file(s) missing from snapshot $stamp; try an older --timestamp." >&2; exit 1; }
echo "All $(wc -l <<< "$urls" | tr -d ' ') package files download for ${platforms[*]}."

current=$(for pkg in "${packages[@]}"; do sed -n "s/^ *\($pkg=[^ ]*\) \\\\$/\1/p" "$dockerfile"; done)
if [ "$current" = "$pins" ]; then
  echo "The pinned versions are current; $dockerfile is unchanged."
  exit 0
fi
sed -i.bak "s/^ARG DEBIAN_SNAPSHOT=.*/ARG DEBIAN_SNAPSHOT=$stamp/" "$dockerfile"
while IFS='=' read -r pkg version; do
  sed -i.bak "s/^\( *\)$pkg=[^ ]* \\\\$/\1$pkg=$version \\\\/" "$dockerfile"
done <<< "$pins"
rm -f "$dockerfile.bak"
echo "$pins"
git --no-pager diff --stat -- "$dockerfile"
