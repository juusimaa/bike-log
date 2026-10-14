# Contract: Server layout

What Bike Log puts on the UpCloud server, and the only places it touches outside `/srv/bikelog`. Sources
in the repository live in `deploy/upcloud/` and are copied by `scripts/upcloud/install.sh` (run once by the
owner, and again when these files change).

## Files

```text
/srv/bikelog/                      root:root 0755
├── compose.yaml                   from deploy/upcloud/compose.yaml
├── settings.env                   non-secret settings (0644)
├── release.env                    current images (written by bikelog-deploy)
├── release.previous.env           previous images (written by bikelog-deploy)
├── bin/bikelog-deploy             from scripts/upcloud/bikelog-deploy (root 0755)
├── secrets/                       root 0700; files 0600 (see data-model.md)
└── deploy.lock                    flock target for deploys, jobs and operator commands
```

Outside `/srv/bikelog`:

| Path | Purpose |
| --- | --- |
| `/etc/sudoers.d/bikelog-deploy` | `Defaults!/srv/bikelog/bin/bikelog-deploy env_keep += "SSH_ORIGINAL_COMMAND"` and `bikelog-deploy ALL=(root) NOPASSWD: /srv/bikelog/bin/bikelog-deploy ""` (no arguments allowed through sudo; the script reads `SSH_ORIGINAL_COMMAND`, which sudo would otherwise clear) |
| `/home/bikelog-deploy/.ssh/authorized_keys` | the deploy key with `restrict,command=…` |
| `/etc/systemd/system/bikelog-backup.{service,timer}` | daily backup |
| Caddy configuration | one site block (below), imported into the owner's Caddyfile |

## Compose services

All images come from `release.env` by digest. Every service: `logging: {driver: local, options: {max-size: 10m, max-file: "3"}}`,
`mem_limit: 512m`, `cpus: 0.5`, `read_only` where the image allows (**verify** for `web`), no published ports
unless Caddy runs on the host (D2).

| Service | Image | Network | Restart | Notes |
| --- | --- | --- | --- | --- |
| `web` | `WEB_IMAGE` | `caddy` (external), alias `bikelog-web` | `unless-stopped` | Settings as in Azure's `containerApp.bicep`: Authenticated mode, `WEB_PUBLIC_ORIGIN`, API at `http://127.0.0.1:5080`, CA at `/mnt/secrets/aiven-ca-certificate`. Health check: `/healthz` via `node -e fetch(...)`, every 10 s |
| `api` | `API_IMAGE` | `network_mode: service:web` | `unless-stopped` | Production, Authenticated, `ASPNETCORE_URLS=http://127.0.0.1:5080`, Auth0 settings, `api.env` |
| `migrate` | `MIGRATIONS_IMAGE` | default | `no` | profile `jobs`; `api.env` |
| `ops` | `API_IMAGE` | default | `no` | profile `jobs`; as `api` plus `Operator__HostedDatabaseHost`; arguments from the operator command |
| `backup` | `BACKUP_IMAGE` | default | `no` | profile `jobs`; `backup.env`, CA and `backup-client.pem` mounted read-only |

The API stays bound to loopback inside `web`'s namespace, so nothing but the web proxy reaches it (FR-003).
Only `web` joins the `caddy` network.

## Caddy site block

```caddyfile
# Bike Log (spec 005). Address: the server's default UpCloud hostname.
<server hostname> {
	# Owner gate: remove this block after the refusal checks pass (quickstart U3).
	@not_owner not remote_ip <owner address>
	respond @not_owner 403

	reverse_proxy bikelog-web:3000
}
```

Rules: no `tls` issuer pin (Caddy falls back from Let's Encrypt to ZeroSSL, research D3); no `header_up`
for `Host` or `X-Forwarded-*` (Caddy's defaults are what the web app expects); Bike Log adds nothing else to
the global Caddy configuration.

## Systemd timer

`bikelog-backup.timer`: `OnCalendar=*-*-* 02:30:00 UTC`, `Persistent=true`, `RandomizedDelaySec=10m`.
`bikelog-backup.service`: `Type=oneshot`, `ExecStart=/srv/bikelog/bin/bikelog-deploy backup`.
