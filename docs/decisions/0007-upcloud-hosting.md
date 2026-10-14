# Hosting on the owner's UpCloud server

Approved move of the hosted web app and API from Azure Container Apps to the owner's UpCloud server, which
already runs Gym Notebook and Subscription Tracker with Docker Compose behind Caddy ([spec 005](../../specs/005-upcloud-hosting/spec.md)).
The database stays on the Aiven free plan, so no records move. Recorded on 2026-10-14 from the plan's
decisions D1–D15 ([research](../../specs/005-upcloud-hosting/research.md)). This supersedes the hosting
parts of [decision 0003](0003-aiven-postgres-and-container-apps-hosting.md) and
[decision 0006](0006-hosted-deployment-architecture.md); 0003's choice of Aiven stands.

Context: the Azure deployment from spec 004 was live with test records only. Scaling to zero made the
first page after an idle period slow, and keeping a replica warm would cost more than the approved
estimate. The owner already runs and pays for a server with spare capacity, Docker Compose and Caddy, and
its default UpCloud hostname was unused.

Design:

- **One Compose project.** `bikelog` in `/srv/bikelog` runs the published `web` and `api` images by digest.
  The API shares the web container's network namespace and stays on loopback, as in Azure. Migrations,
  operator commands and backups are one-off services. Each container has 512 MB, 0.5 CPU and bounded logs.
- **Caddy.** One site block in the owner's Caddy serves the default UpCloud hostname over HTTPS. It
  starts owner-only, as the Azure ingress allow-list did, and pins no certificate issuer, because
  `upcloud.host` shares Let's Encrypt's per-domain limits with every UpCloud customer.
- **Forced-command deploys.** `deploy.yml` resolves the image digests and runs `bikelog-deploy` over SSH
  with a key limited to `deploy`, `rollback` and `status` (`restrict`, forced command, a sudoers rule
  without arguments, host key pinned). The script holds a lock, checks disk space, pulls, migrates, swaps
  containers behind the health check, puts the previous release back on failure and prunes old Bike Log
  images only.
- **Secrets as files.** Root-owned files in `/srv/bikelog/secrets/` and the owner's password manager replace
  Key Vault and the managed identities.
- **Backups from the server.** A systemd timer runs the existing backup image daily. It signs in to the
  existing Azure storage as an app registration with a certificate whose key stays on the server, and keeps
  the write-only role. A storage metric alert replaces the job alert. Aiven's allow-list then admits only the
  server.
- **Azure reduced to backups.** After a checked cutover, Azure keeps only the storage, its role
  assignments, the action group, the alert and the budget (`infra/backup.bicep`).

Alternatives rejected:

- Keeping Container Apps with a warm replica: idle charges around the clock.
- A pull-based timer on the server instead of SSH deploys: no inbound credential, but failures surface only
  by email, and rollback needs SSH anyway.
- A self-hosted GitHub runner on the shared server: it would run arbitrary workflow code next to two other
  apps.
- Keeping the Azure backup job: Aiven would have to stay open to every address.
- Azure Arc for a managed identity on the server, or a client secret: an agent on a shared server for one
  token, or a bearer secret that can be copied without a key file.
- UpCloud Object Storage for backups: rejected in the spec's clarifications.
- Zero-downtime switching through Caddy: more moving parts than a personal app needs; a deploy costs 10–20
  seconds.

Consequences:

- No cold start. One host and no failover: a server outage takes Bike Log down with the other apps.
- Caddy, Docker Engine and Compose, and the operating system belong to the shared server. Their versions are
  recorded at setup ([upcloud-results.md](../hosting/upcloud-results.md)), not pinned by this repository
  (constitution 1.0.2).
- Azure's app-restart alert is not replaced. Docker's restart policy covers crashes and the deploy gate
  covers bad versions; an external uptime check is to be revisited with the asynchronous slice's telemetry.
- Aiven is reachable from the server only; operator commands and recovery run there.
- Backups stay in Azure, so restore rehearsals and the 35-day retention are unchanged.
- Files under `deploy/upcloud/` and `scripts/upcloud/` reach the server through `install.sh`, not through the
  deploy workflow.

Future direction, not decided: the database could move to the server's shared PostgreSQL. That removes the
free plan's 20-connection and 1 GB limits and one provider. It also puts the database and the app on one
machine, in an instance shared with Gym Notebook and Subscription Tracker (with its own database and role at
least), and makes backups away from the server essential rather than a second copy. It would need its own
specification, cost and recovery review.
