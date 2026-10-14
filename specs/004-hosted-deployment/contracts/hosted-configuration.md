# Contract: Hosted Configuration

Settings for each container and job in the hosted environment. "Secret" means a Key Vault reference
through `id-bikelog-app`. Every other value is a plain setting from `infra/main.bicepparam` or a GitHub
environment variable. None of them may contain credentials.

## `ca-bikelog` / `web` (port 3000, external ingress)

| Setting | Value |
| --- | --- |
| `NODE_ENV` | `production` (image default) |
| `BIKELOG_WEB_ACCESS_MODE` | `Authenticated` |
| `WEB_PUBLIC_ORIGIN` | `https://ca-bikelog.<environment default domain>`, computed in Bicep |
| `BIKELOG_API_ORIGIN` | `http://127.0.0.1:5080` |
| `AUTH0_ISSUER` | `https://<tenant>/` (trailing slash) |
| `AUTH0_AUDIENCE` | Bike Log API identifier |
| `AUTH0_CLIENT_ID` | Hosted application client ID |
| `AUTH0_CLIENT_SECRET` | Secret `auth0-client-secret` |
| `BIKELOG_WEB_DATABASE_URL` | Secret `web-database-url` |
| `BIKELOG_DATABASE_CA_FILE` | `/mnt/secrets/aiven-ca-certificate` |
| `BIKELOG_SESSION_KEY` | Secret `web-session-key` |

**Startup rules** (fail closed, D5):

- `WEB_PUBLIC_ORIGIN` must be an exact origin, either `https:` or exactly `http://localhost:3000`.
- `BIKELOG_API_ORIGIN` must be exactly `http://127.0.0.1:5080`.
- A non-loopback database host needs `BIKELOG_DATABASE_CA_FILE` and verifies the server certificate.
- With `NODE_ENV=production`, Synthetic mode and a non-loopback public origin together are an error.

**Request rules**:

- The `Host` header must equal the public origin's host.
- `X-Forwarded-Proto`, when present, must be `https` for an https origin.
- The OIDC callback, logout and proxy all use the configured origin, never `request.url`.
- The session cookie stays `__Host-bikelog_session` (`Secure`, `HttpOnly`, `SameSite=Lax`).

**Response headers**:

- `Strict-Transport-Security: max-age=31536000` (https origin only)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: same-origin`
- `X-Frame-Options: DENY`

## `ca-bikelog` / `api` (loopback only, no ingress)

| Setting | Value |
| --- | --- |
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `ASPNETCORE_URLS` | `http://127.0.0.1:5080` |
| `AccessMode` | `Authenticated` |
| `LocalSyntheticMode` | `false` |
| `Auth__Issuer`, `Auth__Audience` | As the web settings |
| `Auth__Scope` | `BikeLog.Access` |
| `ConnectionStrings__Postgres` | Secret `api-postgres-connection` |

The connection string must contain:

- `SSL Mode=VerifyFull`
- `Root Certificate=/mnt/secrets/aiven-ca-certificate`
- `GSS Encryption Mode=Disable`
- `Maximum Pool Size=3`
- `Timeout=15`

OpenAPI is not mapped outside `Development`.

## `job-bikelog-migrate`

Image `migrations@<digest>`; `ConnectionStrings__Postgres` from the secret; CA mount. No other settings.

## `job-bikelog-ops`

Image `api@<digest>`, with the same settings as the `api` container plus `Operator__HostedDatabaseHost`
(the Aiven host name, from a GitHub environment variable). Arguments are supplied per execution (see
[operations.md](operations.md)).

**Operator target rules** (D6). A hosted target is allowed only when all of these hold:

- `ASPNETCORE_ENVIRONMENT=Production`;
- `AccessMode=Authenticated` and `LocalSyntheticMode=false`;
- SSL mode is `VerifyFull` and a root certificate is set;
- the connection host equals `Operator__HostedDatabaseHost`;
- `--issuer` equals `Auth__Issuer`.

The local development rule is unchanged. Anything else is refused before the database is touched.

## `job-bikelog-backup`

| Setting | Value |
| --- | --- |
| `BIKELOG_DATABASE_URL` | Secret `backup-database-url` |
| `BACKUP_ACCOUNT_URL` | `https://<storage account>.blob.core.windows.net` |
| `BACKUP_CONTAINER` | `backups` |
| `AZURE_CLIENT_ID` | Client ID of `id-bikelog-app` (selects the user-assigned identity) |

## Secret volume

Every container and job mounts a secret volume at `/mnt/secrets` that holds only `aiven-ca-certificate`.
Other secrets are passed as environment variables, never as files.

## Scaling and probes

| Item | Value |
| --- | --- |
| Ingress allow-list | `allowedIngressCidrs` parameter from GitHub environment secret `INGRESS_ALLOW_CIDRS` (comma-separated). Non-empty: one `Allow` rule per range in `ingress.ipSecurityRestrictions`, all other addresses refused. Empty: open. |
| Replicas | min 0, max 1; HTTP scale rule |
| Resources | `web` 0.25 vCPU / 0.5 GiB; `api` 0.25 vCPU / 0.5 GiB |
| `api` probes | None: the API binds to `127.0.0.1`, which platform probes (sent to the replica IP) cannot reach. `web`'s `/healthz` checks `/health/ready` over loopback instead. |
| `web` probes | Startup `GET /healthz` (every 5 s, failure threshold 12); readiness `GET /healthz`; liveness TCP 3000 |
