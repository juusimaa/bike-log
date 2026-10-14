# deploy/upcloud

Bike Log's files for the owner's UpCloud server (spec 005). `scripts/upcloud/install.sh` copies them to
`/srv/bikelog`, and `scripts/upcloud/bikelog-deploy` runs the Compose project from there. Real settings and
secrets live only on the server (`settings.env`, `secrets/`) and in the owner's password manager; the
`*.example` files here hold placeholders. Setup, deploys, backups and the cutover from Azure are described in
[docs/hosting/upcloud.md](../../docs/hosting/upcloud.md).
