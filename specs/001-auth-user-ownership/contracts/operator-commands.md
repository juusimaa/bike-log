# Contract: Operator Commands

Status: **implemented** (`src/Api/Operations/`). Run with
`dotnet run --project src/Api --no-launch-profile -- <arguments>`. None of these commands is an HTTP
endpoint, and none runs at startup or during migrations. Output contains only IDs, counts and status.

| Command | Preconditions | Effect |
| --- | --- | --- |
| `--provision-pilot-user --issuer <exact-issuer> --subject <auth0-user-id> --email <confirmed-address>` | Development, dedicated local database. The operator confirms the email and subject from Auth0 admin data. | Creates an enabled user with a new `OwnerId` and prints it. Rejects a duplicate `(issuer, subject)`. |
| `--disable-pilot-user --owner <owner-uuid>` | Same | `Enabled=false`. The next API request returns 403. Also block the account in Auth0. |
| `--enable-pilot-user --owner <owner-uuid>` | Same | `Enabled=true`. |
| `--purge-synthetic-owner --owner 11111111-1111-1111-1111-111111111111 --confirm-delete-synthetic` | **Synthetic** Development mode, the dedicated `127.0.0.1:54329` `bikelog_dev` database, no real user on the fixed owner. | Deletes only the synthetic owner's records in one transaction (order in [data-model.md](../data-model.md)) and prints counts per table. Running it again deletes 0 rows. Rejects a wrong owner, missing confirmation, authenticated mode or another database. |
| `--rebuild-usage` | Synthetic mode only | Unchanged existing command. |
