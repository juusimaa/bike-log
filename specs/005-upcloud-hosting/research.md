# Research: Hosting on UpCloud

Decisions for [spec 005](spec.md). They reuse spec 004's images, backup format, restore rehearsal and app
configuration wherever possible ([decision 0006](../../docs/decisions/0006-hosted-deployment-architecture.md),
[004 research](../004-hosted-deployment/research.md)). Items marked **verify** are checked on the server
during setup and recorded in `docs/hosting/upcloud-results.md`.

Owner answers on 2026-10-14, in addition to the spec's clarifications:

- The daily backup job runs **on the UpCloud server** and still writes to the existing Azure backup storage,
  so Aiven's allow-list can be limited to the server's address. This refines clarification 2 (the storage
  stays in Azure; the job moves).
- The server already runs Gym Notebook and Subscription Tracker with **Docker Compose behind Caddy**.
- Neither of those apps uses the server's UpCloud hostname, so Bike Log can have it.

## D1. Runtime: one Compose project next to the other apps

- **Decision**: Bike Log runs as its own Docker Compose project, `bikelog`, from `/srv/bikelog` on the
  server. The `web` container serves port 3000. The `api` container shares `web`'s network namespace
  (`network_mode: service:web`) and keeps binding to `127.0.0.1:5080`, exactly as in Azure and
  `compose.app.yaml`, so the API is unreachable from anything but the web proxy. `migrate`, `ops` and
  `backup` are one-off services in Compose profiles, so `docker compose up` never starts them.
- **Rationale**: matches the owner's existing pattern and needs no change to the images or to the
  loopback rule the API and web app already enforce. One project per app keeps names, networks and cleanup
  separate.
- **Alternatives**: one Compose file shared with the other apps (couples three apps' deployments);
  systemd units running `docker run` (re-implements Compose); a container orchestrator (out of scope by the
  constitution).

## D2. HTTPS: join the existing Caddy

- **Decision**: Bike Log adds one site block to the owner's Caddy, for the server's UpCloud hostname,
  proxying to `bikelog-web:3000` over a shared Docker network (`caddy`, external to the Bike Log project).
  If Caddy runs on the host instead of in a container, `web` publishes `127.0.0.1:3100:3000` and the site
  proxies to that; setup records which case applies (**verify**). The block sets no `header_up` overrides:
  Caddy already passes the original `Host` and sets `X-Forwarded-Proto: https`, which is what the web app's
  origin rules expect (decision 0006, "Public origin from configuration"). HTTP is redirected to HTTPS by
  Caddy's automatic HTTPS.
- **Owner gate**: until the refusal checks pass on the new address (constitution IV), the site block
  admits only the owner's address with a `remote_ip` matcher and answers 403 to everyone else, as the
  Azure ingress allow-list did.
- **Rationale**: Caddy already obtains and renews certificates for the other apps. No new proxy, no port
  other than 80/443 opened.
- **Alternatives**: a second proxy for Bike Log (port clash on 80/443); publishing the web app directly
  (no TLS).

## D3. Address and certificate

- **Decision**: `WEB_PUBLIC_ORIGIN` is `https://<server hostname>`, where the hostname is the default
  reverse DNS name UpCloud gave the server's public IPv4 address, of the form
  `<ip-with-dashes>.<zone>.upcloud.host` (UpCloud gives every public IP a default reverse DNS name; the exact
  IPv4 form is read from the control panel at setup, **verify**). Setup also confirms that the name
  resolves forward to the same address, because certificate validation needs it.
- **Certificate risk**: `upcloud.host` is not on the Public Suffix List (checked 2026-10-14), so Let's
  Encrypt's limit of 50 new certificates per registered domain per week is shared by every UpCloud customer
  using such a name. Caddy's default issuer list falls back to ZeroSSL when Let's Encrypt refuses, so the
  site block must not pin a single issuer. If neither issues a certificate, setup stops for the owner to
  choose another address (spec edge case); the app is never served over HTTP.
- **Changing it later**: the address appears in four places only: `WEB_PUBLIC_ORIGIN` in `app.env`, the
  Caddy site name, and the Auth0 application's callback, logout and origin URLs. The setup guide lists them.

## D4. Delivery: push over SSH to a forced command

- **Decision**: after Containers publishes a push to `main`, a rewritten `deploy.yml` resolves the four
  image digests (unchanged step), then runs `ssh bikelog-deploy@<server> deploy <web> <api> <migrations>
  <backup>` with the digests. The key in `bikelog-deploy`'s `authorized_keys` carries
  `restrict,command="sudo /srv/bikelog/bin/bikelog-deploy"`. The forced command reads
  `SSH_ORIGINAL_COMMAND`, accepts only `deploy` with four `ghcr.io/juusimaa/bike-log/<name>@sha256:<64 hex>`
  references, `rollback`, or `status`, and refuses anything else. `restrict` disables port, agent and X11
  forwarding and the PTY, so the key cannot open a shell. `sudoers` lets `bikelog-deploy` run only that
  script, as root, with no arguments.
- **Secrets**: the private key is the `UPCLOUD_DEPLOY_SSH_KEY` environment secret of the `production`
  GitHub environment; the server's host key is pinned in the `UPCLOUD_SSH_KNOWN_HOSTS` variable, so the
  runner never trusts on first use. The server address is a secret only so the public logs mask it, as in
  004. Rotation: add the new public key, update the secret, remove the old key; revocation: delete the line.
- **Rationale**: keeps deploy results and the rollback dispatch in GitHub Actions, as in 004. The forced
  command is the narrowest credential SSH offers, and it satisfies FR-017.
- **Alternatives**: a pull-based timer on the server that polls GHCR (no inbound credential, but failures
  surface only by email and rollback needs SSH anyway); a self-hosted GitHub runner on the shared server
  (runs arbitrary workflow code there); third-party SSH actions (unneeded; `ssh` is on the runner).
- **Note**: membership of the `docker` group is root-equivalent, so `bikelog-deploy` is not in it. Only the
  root-owned deploy script talks to Docker.

## D5. Deployment steps and the health gate

- **Decision**: `bikelog-deploy deploy` runs under an exclusive `flock` (FR-016) and:
  1. checks that at least 3 GB would remain on Docker's data disk after the pull, using the images'
     compressed sizes plus a margin, and stops otherwise (FR-018);
  2. pulls the four images by digest while the current version keeps serving;
  3. runs `migrate` (one-off, 10-minute timeout); on failure, stops with the app unchanged (FR-013);
  4. writes the new digests to `release.env`, keeping the previous file as `release.previous.env`;
  5. `docker compose up -d web api`, then waits up to 90 s for `web`'s health check (`/healthz`, which
     succeeds only when the API's readiness does);
  6. if unhealthy, restores `release.previous.env`, starts the previous version, waits for it to be
     healthy, and exits non-zero (FR-014);
  7. on success, removes Bike Log images that are neither current nor previous (D7).
  `rollback` swaps `release.env` and `release.previous.env` and runs steps 5–6 without migrations
  (FR-015, additive migrations as in 004).
- **Downtime**: replacing the containers on one host costs a short gap (container stop plus start, about
  10–20 s), within SC-005's 1 minute for a failed deploy. Zero-downtime blue/green switching through Caddy
  was rejected as more moving parts than a personal app needs.
- **Health check**: the web image has Node, so the Compose health check runs
  `node -e "fetch('http://127.0.0.1:3000/healthz')…"`; no tool is added to the image.

## D6. Resource limits and restarts

- **Decision**: `web` and `api` each get `mem_limit: 512m` and `cpus: 0.5`, the same sizes as in Azure;
  one-off jobs get 512 MB and 0.5 CPU. All long-running services use `restart: unless-stopped`, and Docker
  starts at boot (FR-006, FR-007). Setup records the server's total and free memory before and after
  (**verify** that about 1 GB is free, spec assumption).
- **Alternatives**: no limits (FR-006 forbids); cgroup slices by hand (Compose already sets them).

## D7. Disk: image pruning and bounded logs

- **Decision**: after a successful deploy, the script deletes images whose repository is
  `ghcr.io/juusimaa/bike-log/*` and whose digest is in neither `release.env` nor `release.previous.env`.
  It never runs `docker image prune -a` or `docker system prune`, which would delete the other apps' unused
  images (constitution: scripts must not touch what they did not create). Logs use the `local` driver with
  `max-size: 10m`, `max-file: 3` per container, so `web`, `api` and the jobs stay well under 100 MB
  (FR-019).
- **Expected size**: four images, current and previous, about 2–2.5 GB with shared layers, plus logs:
  within SC-009's 3 GB.

## D8. Secrets on the server

- **Decision**: `/srv/bikelog/secrets/` (root, mode 0700) holds `app.env`, `api.env`, `backup.env`, the
  Aiven CA certificate and the backup credential (D10), each mode 0600. Compose reads them with `env_file`
  and mounts the CA at `/mnt/secrets/aiven-ca-certificate`, the path the Azure connection strings already
  use, so the values copy over unchanged from Key Vault. Nothing in `/srv/bikelog` except `secrets/` holds a
  secret, and the deploy script never prints environment values (FR-012).
- **Source of record**: the server files plus the owner's password manager. Key Vault is deleted with the
  Azure app (D12), after the owner has copied each value.
- **Rotation**: change the file, `bikelog-deploy restart` (or a deploy), then revoke the old value; order per
  secret in `docs/hosting/upcloud.md`.
- **Alternatives**: keep Key Vault and fetch at start (needs an Azure credential with secret read on the
  server, a bigger blast radius than the write-only backup credential); Docker secrets (Swarm only).

## D9. Database: allow-list, connections, TLS

- **Decision**: Aiven's IP allow-list (`ip_filter`) becomes the server's public IPv4 address `/32` only,
  set in the Aiven console at cutover (FR-009). Docker containers leave the server through that address
  (**verify**: no IPv6 egress to Aiven; if the server has IPv6, add its `/128` too). The connection budget
  of 004 D11 is kept: the API pool and the web session pool keep their caps from the Azure secrets; the
  migration, operator and backup jobs run one at a time under the same lock as deploys. All connections keep
  `VerifyFull` / `verify-full` with the Aiven CA.
- **Database location stays a setting** (FR-011): the host appears only in the connection strings in
  `secrets/`, and in `Operator__HostedDatabaseHost`.

## D10. Backups from the server to the existing Azure storage

- **Decision**: a systemd timer (`bikelog-backup.timer`, daily at 02:30 UTC, `Persistent=true`) runs
  `bikelog-deploy backup`, which runs the existing `backup` image as a one-off Compose service under the
  lock. The job authenticates to Azure as a dedicated Entra app registration, **Bike Log backup (UpCloud)**,
  with a certificate credential whose private key stays on the server. The certificate is created on the
  server with `openssl`, and only its public part is uploaded to the app registration.
  `infra/backup.bicep` (D12) assigns the existing **Bike Log Backup Writer** custom role (add and read blobs, no
  overwrite or delete) to the app registration's service principal on the `backups` container (new
  parameter `backupPrincipalId`). Backup format, blob names, the manifest and the 35-day lifecycle rule are
  unchanged.
- **Code change**: `backup.sh` gains a second sign-in path: when `AZURE_TENANT_ID`, `AZURE_CLIENT_ID` and
  `AZURE_CLIENT_CERTIFICATE_FILE` are set, it builds a client-assertion JWT (RS256, signed with `openssl`)
  and exchanges it at the Entra token endpoint for a `https://storage.azure.com/.default` token. The managed
  identity path stays for the Azure job until it is deleted, and the local-directory path for tests. The
  backup image adds a pinned `openssl` package (**verify** whether the base image already has the CLI).
  `--verify-permissions` works unchanged with the new identity.
- **Missed-backup alert** (FR-023): the job metric alert is replaced by a metric alert on the storage
  account's blob service: `Transactions` with `ApiName = PutBlob` and `ResponseType = Success`, total over
  one day, less than 2 (a complete backup is two successful puts: dump and manifest). Refused writes from
  the permission check are not successes and do not count. It emails the existing action group. Same cost as
  before (about €0.10 a month).
- **Certificate lifetime**: one year; the setup guide records the expiry date, and renewal is a documented
  step (create a new key and certificate, upload, switch, remove the old one).
- **Rationale**: Aiven can then be limited to the server, and the storage, retention, write-only role,
  restore rehearsal and owner access from 004 stay as they are.
- **Alternatives**: keeping the Azure job (rejected by the owner: Aiven would stay open to every address);
  Azure Arc for a managed identity on the server (an agent on a shared server for one token); a client
  secret instead of a certificate (a bearer secret that can be copied without the key file); GitHub Actions
  as the backup runner (no fixed IP, same allow-list problem); UpCloud Object Storage (rejected in
  clarification 2).

## D11. Operator commands

- **Decision**: `scripts/upcloud/bikelog-deploy` also offers `provision-pilot-user`, `disable-pilot-user`,
  `enable-pilot-user`, `backup`, `backup-verify-permissions` and `db-connections`. They run the `ops`
  (API image in operator mode, with `Operator__HostedDatabaseHost`) or `backup` services under the lock.
  The owner runs them over their normal admin SSH session with `sudo`; the deploy key's forced command
  allows only `deploy`, `rollback` and `status`. `hosted.sh` keeps only the commands that still apply in
  Azure (`backups` listing and `cost`) and points to the new script for the rest.
- **Rationale**: no new endpoint; the API's hosted-target guard from 004 applies unchanged.

## D12. Cutover and Azure removal

- **Decision**: the order in [contracts/cutover.md](contracts/cutover.md):
  prepare the server without database access; add the new address to Auth0; disable the Azure deploy
  workflow; deactivate the Azure revision and remove the Azure backup job's schedule; confirm in
  `pg_stat_activity` that Azure holds no connection; set Aiven's allow-list to the server; deploy on the
  server; run the checks. On failure: stop the server project, reopen Aiven's allow-list, reactivate the
  Azure revision and re-enable the workflow (FR-026). On success: delete the Azure app, jobs, environment,
  log workspace, app-restart and job-backup alerts, app identity, Key Vault and the GitHub deploy identity;
  rotate the Aiven password (the old one was in Key Vault); remove the Azure URLs from Auth0; open the Caddy
  owner gate.
- **What stays in Azure**: the resource group with the storage account, `backups` container, lifecycle
  rule, Bike Log Backup Writer role and its two assignments (server backup principal; owner reader), the
  action group, the new storage alert and the €10 budget. These move from `bootstrap.bicep` and
  `main.bicep` into one owner-run template, `infra/backup.bicep`; `main.bicep` and its modules are deleted
  (history keeps them, FR-027).
- **Expected Azure cost**: under €0.50 a month (storage of a few MB, two alerts' worth of metric rules is
  now one, a few thousand storage transactions). `docs/hosting/cost-estimate.md` gets a dated addendum.

## D13. Server-level prerequisites (owner's existing setup)

- **Verify** at setup and record: Docker Engine and Compose v2 versions (Compose must support
  `network_mode: service:`, profiles and `--wait`); Caddy version, whether it runs in a container and on
  which network; that the firewall already allows 80/443 and SSH; that SSH accepts only keys; free disk
  and memory; the server's IPv4 (and IPv6) addresses and default hostname; that `/srv/bikelog` does not
  exist yet.
- The server's operating system updates, Caddy upgrades and firewall stay the owner's responsibility for
  the shared server. The repository contains only Bike Log's files and a Caddy snippet.

## D14. Records

- **Decision**: decision record `0007-upcloud-hosting.md` (supersedes the hosting parts of 0003 and 0006;
  0003's Aiven choice stands); constitution amendment 1.0.2 changes the stack line from "Azure Container
  Apps for later cloud deployment" to "the owner's UpCloud server with Docker Compose behind Caddy, and Azure
  Blob Storage for backups"; `PROJECT_PLAN.md` Phase 3 names the new host and keeps the asynchronous part's
  platform open. The decision record states the future option of moving the database to the server's shared
  PostgreSQL (FR-031): no free-plan limits and one provider fewer, but database and app on one machine, a
  shared instance with Gym Notebook and Subscription Tracker (separate database and role at least), and
  backups away from the server become essential.

## D15. Monitoring that is not replaced

- The Azure `alert-app-restarts` rule goes with the app. Its replacement on the server would be an external
  uptime check, which the spec does not require; Docker's restart policy covers crashes and the deploy gate
  covers bad versions. Recorded as a known gap in the decision record, to revisit with the asynchronous
  slice's telemetry.

## Sources

- UpCloud DNS documentation, default reverse DNS for every public IP:
  https://upcloud.com/docs/products/networking/features/dns/
- UpCloud API, IP addresses (PTR record format `….v6.zone.upcloud.host`):
  https://developers.upcloud.com/10-ip-addresses/
- Public Suffix List, checked 2026-10-14 for `upcloud`: https://publicsuffix.org/list/public_suffix_list.dat
