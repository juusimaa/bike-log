#!/usr/bin/env bash
# Sets up Bike Log on the owner's UpCloud server (spec 005, cutover step A2,
# contracts/server-layout.md). Run as root from a checkout of this repository on
# the server; safe to run again after these files change.
#
#   sudo scripts/upcloud/install.sh [--dry-run] [--caddy-on-host]
#
# Creates or updates only: /srv/bikelog (compose files, bin/bikelog-deploy, empty
# secrets/), the bikelog-deploy account, /etc/sudoers.d/bikelog-deploy and the
# bikelog-backup systemd units (timer left as it is; disabled on first install).
# Never touches settings.env, secrets/*, release*.env or authorized_keys contents,
# and nothing that belongs to the other apps on the server.
set -euo pipefail
cd "$(dirname "$0")/../.."

root=/srv/bikelog
marker=$root/.created-by-bikelog-install
account=bikelog-deploy
sudoers=/etc/sudoers.d/bikelog-deploy
units=(bikelog-backup.service bikelog-backup.timer)

dry_run=false
caddy_on_host=false
for arg in "$@"; do
  case "$arg" in
    --dry-run) dry_run=true ;;
    --caddy-on-host) caddy_on_host=true ;;
    *)
      sed -n '6p' "$0" | sed 's/^# \{0,1\}/usage: /' >&2
      exit 64
      ;;
  esac
done

say() { printf 'install: %s\n' "$*"; }
die() {
  printf 'install: %s\n' "$*" >&2
  exit 1
}
run() {
  if $dry_run; then
    printf '+'
    printf ' %q' "$@"
    printf '\n'
  else
    "$@"
  fi
}

# --- Checks (research D13) --------------------------------------------------------------

$dry_run || [ "$(id -u)" = 0 ] || die 'run as root (sudo), or with --dry-run to preview'
compose_version=$(docker compose version --short 2> /dev/null) ||
  die 'docker compose (the v2 plugin) is not available'
[[ "$compose_version" =~ ^v?([0-9]+)\. ]] && [ "${BASH_REMATCH[1]}" -ge 2 ] ||
  die "docker compose $compose_version is too old; v2 or later is required"
docker buildx version > /dev/null 2>&1 || die 'docker buildx is not available (bikelog-deploy reads image sizes with it)'
for tool in flock timeout visudo systemctl useradd; do
  command -v "$tool" > /dev/null || die "$tool is not available"
done
if [ -e "$root" ] && [ ! -e "$marker" ]; then
  die "$root exists but was not created by this script; refusing to change it"
fi
say "docker compose $compose_version, $(docker buildx version | awk '{ print $1, $2 }')"

# --- Files ------------------------------------------------------------------------------

run install -d -o root -g root -m 0755 "$root" "$root/bin"
run install -d -o root -g root -m 0700 "$root/secrets"
[ -e "$marker" ] || run touch "$marker"
run install -o root -g root -m 0644 deploy/upcloud/compose.yaml "$root/compose.yaml"
if $caddy_on_host; then
  run install -o root -g root -m 0644 deploy/upcloud/compose.host-caddy.yaml "$root/compose.host-caddy.yaml"
elif [ -e "$root/compose.host-caddy.yaml" ]; then
  run rm "$root/compose.host-caddy.yaml"
fi
run install -o root -g root -m 0644 deploy/upcloud/settings.env.example "$root/settings.env.example"
run install -o root -g root -m 0755 scripts/upcloud/bikelog-deploy "$root/bin/bikelog-deploy"

# --- Deploy account ---------------------------------------------------------------------

# No password (`*`, which still allows key sign-in) and not in the docker group:
# docker group membership is root-equivalent (research D4).
if ! id "$account" > /dev/null 2>&1; then
  run useradd --system --create-home --home-dir "/home/$account" --shell /bin/sh "$account"
fi
run usermod -p '*' "$account"
if id -nG "$account" 2> /dev/null | tr ' ' '\n' | grep -qx docker; then
  run gpasswd -d "$account" docker
fi
run install -d -o "$account" -g "$account" -m 0700 "/home/$account/.ssh"
if [ ! -e "/home/$account/.ssh/authorized_keys" ]; then
  run install -o "$account" -g "$account" -m 0600 /dev/null "/home/$account/.ssh/authorized_keys"
fi

# sudo would clear SSH_ORIGINAL_COMMAND, which carries the forced command's
# arguments; "" allows the script only without arguments.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cat > "$work/sudoers" << EOF
# Bike Log deploy key (spec 005, contracts/server-layout.md). Installed by
# scripts/upcloud/install.sh.
Defaults!$root/bin/bikelog-deploy env_keep += "SSH_ORIGINAL_COMMAND"
$account ALL=(root) NOPASSWD: $root/bin/bikelog-deploy ""
EOF
visudo -c -q -f "$work/sudoers" > /dev/null || die 'the generated sudoers file does not parse'
if $dry_run; then
  say "would write $sudoers:"
  cat "$work/sudoers"
fi
run install -o root -g root -m 0440 "$work/sudoers" "$sudoers"

# --- Backup timer -------------------------------------------------------------------------

first_install=false
[ -e /etc/systemd/system/bikelog-backup.timer ] || first_install=true
for unit in "${units[@]}"; do
  run install -o root -g root -m 0644 "deploy/upcloud/systemd/$unit" "/etc/systemd/system/$unit"
done
run systemctl daemon-reload
if $first_install; then
  run systemctl disable bikelog-backup.timer
fi

# --- What is left for the owner ----------------------------------------------------------

missing=()
for file in settings.env secrets/app.env secrets/api.env secrets/backup.env \
  secrets/aiven-ca-certificate secrets/backup-client.pem; do
  [ -e "$root/$file" ] || missing+=("$file")
done
echo
say "done$($dry_run && echo ' (dry run: nothing was changed)')."
if [ ${#missing[@]} -gt 0 ]; then
  say "still missing in $root: ${missing[*]}"
fi
cat << EOF
Remaining steps (docs/hosting/upcloud.md):
  1. Fill settings.env from settings.env.example, and the secrets/ files (cutover A3).
  2. Add the deploy key to /home/$account/.ssh/authorized_keys as:
     restrict,command="sudo $root/bin/bikelog-deploy" ssh-ed25519 <public key> bikelog-deploy
  3. Add the Caddy site block: sudo $root/bin/bikelog-deploy gate owner-only <your address>
  4. After the cutover checks: systemctl enable --now bikelog-backup.timer
EOF
