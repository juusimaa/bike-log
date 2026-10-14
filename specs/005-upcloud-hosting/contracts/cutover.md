# Contract: Cutover from Azure

The order of the switch (FR-025 to FR-028, research D12). Each step's UTC time and outcome go into
`docs/hosting/upcloud-results.md`. At no point are both environments connected to the database.

## A. Prepare (no downtime, no database access from the server)

1. Server prerequisites checked and recorded (research D13).
2. `scripts/upcloud/install.sh` run on the server: account, sudoers, files, timer (disabled), Compose
   project defined but not started.
3. Secrets copied from Key Vault into `/srv/bikelog/secrets/` and into the owner's password manager.
4. Backup app registration and certificate created; `infra/backup.bicep` deployed with `backupPrincipalId`
   (it adds the new role assignment and the storage alert alongside the 004 resources, which stay until D).
5. Caddy site block added with the owner gate; certificate obtained for the hostname (**stop here** if no
   certificate is issued).
6. Auth0 hosted application: the new callback, logout and web origin URLs **added** beside the Azure ones.
7. GitHub `production` environment: `UPCLOUD_DEPLOY_SSH_KEY`, `UPCLOUD_HOST`, `UPCLOUD_SSH_KNOWN_HOSTS` set;
   the new `deploy.yml` merged but its trigger still disabled.

## B. Switch (downtime starts)

1. Disable the Azure deploy workflow (`gh workflow disable`).
2. Deactivate the active Azure revision of `ca-bikelog`; remove the Azure backup job's schedule.
3. In Aiven's console (Current queries): confirm that no client session remains. Record the count (must be
   0; Aiven's own maintenance sessions are excluded).
4. Aiven allow-list set to the server's address(es) only.
5. On the server: `bikelog-deploy deploy` with the digests of the current `main` (by hand, as the owner).
6. `bikelog-deploy db-connections`: only the server's address appears.

## C. Check (owner gate on)

Quickstart scenarios U1, U3 (gate on), U4 and U11 against the new address. Pass → D. Fail → fallback:

1. `docker compose -p bikelog down` on the server.
2. Aiven allow-list reopened to its previous value.
3. Reactivate the Azure revision; restore the backup job's schedule; re-enable the Azure deploy workflow.
4. Record what failed. Downtime ends; the Azure environment is unchanged.

## D. Finish (downtime ends at C; this part removes Azure)

1. Enable the new deploy workflow's trigger; confirm one automatic deploy (U6), then the failed-deploy and
   rollback rehearsal (U7) and the reboot check (U5).
2. Enable `bikelog-backup.timer`; run `bikelog-deploy backup` and `backup-verify-permissions` once (U8).
3. Delete in Azure: `ca-bikelog`, the three jobs, the environment, the log workspace, `alert-app-restarts`
   and `alert-backup-missing`, `id-bikelog-app`, `id-bikelog-deploy` and its federated credential, and the
   Key Vault. Then deploy `infra/backup.bicep` again from the updated repository; it must report no changes.
4. Rotate the Aiven `avnadmin` password; update `api.env`, `app.env`, `backup.env`; `bikelog-deploy restart`.
5. Auth0: remove the Azure URLs.
6. GitHub: remove the Azure variables (`AZURE_*`) and secrets (`INGRESS_ALLOW_CIDRS`, `AIVEN_DATABASE_HOST`
   if no longer used).
7. Open the Caddy owner gate after U3 passes; run U3's "other address" check from mobile data.
8. Restore rehearsal on a post-move backup (U9) before any real record is entered.
