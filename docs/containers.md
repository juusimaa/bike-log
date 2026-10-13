# Container images

Three images are built from this repository. Each is published as a multi-platform image for `linux/amd64` (Azure Container Apps) and `linux/arm64` (Apple silicon).

| Image | Dockerfile (target) | Runs |
| --- | --- | --- |
| `api` | `src/Api/Dockerfile` (`api`) | The ASP.NET Core API on port 5080. The same image runs operator commands such as `--rebuild-usage`. |
| `migrations` | `src/Api/Dockerfile` (`migrations`) | A self-contained EF Core migration bundle. It reads `ConnectionStrings__Postgres`, applies pending migrations and exits. |
| `web` | `apps/web/Dockerfile` | The Next.js standalone server on port 3000. |

All three run as non-root users, and the base images are pinned by digest. Migrations never run at API startup. Run the `migrations` image as a separate step before starting a new API version.

## Run locally

```sh
./scripts/dev.sh app-up    # build the images and start the stack
./scripts/dev.sh app-down  # stop it; the data volume is kept
```

Open http://127.0.0.1:3000. The stack uses synthetic access mode and the credentials from `.env`. It runs as its own Compose project, `bikelog-app`, with its own database volume, so the development database from `db-up` is untouched. Port 3000 is shared with `npm run web:dev`, so run only one of them at a time.

The services in [`compose.app.yaml`](../compose.app.yaml) share one network namespace, as containers in a single Azure Container App share `localhost`. Synthetic mode accepts only loopback callers and a loopback database, and the web proxy expects the API at `http://127.0.0.1:5080`.

To run the images published by CI instead of building them:

```sh
BIKELOG_IMAGE_PREFIX=ghcr.io/juusimaa/bike-log BIKELOG_IMAGE_TAG=main \
  docker compose -f compose.app.yaml up --no-build --wait
```

Use `latest`, `main`, `sha-<commit>` or a release version as the tag. GitHub Container Registry packages are private by default, so run `docker login ghcr.io` with a personal access token that has `read:packages` first.

## CI

[`.github/workflows/containers.yml`](../.github/workflows/containers.yml) builds all three images for both platforms on every pull request without pushing them. Pushes to `main` publish to `ghcr.io/juusimaa/bike-log/<image>` with tags `sha-<commit>`, `main` and `latest`. `v*` tags also publish the version, for example `1.2.0`. Images carry SBOM and provenance attestations. The .NET and web build stages run on the runner's own platform and cross-compile, so no CPU emulation is needed.

## Before deploying to Azure

The images are ready for Container Apps, but a hosted deployment still has open steps:

- **Proxy origins.** The web proxy accepts authenticated traffic only from `http://localhost:3000` (the pilot limit in `apps/web/src/lib/proxy.ts`). Allowing the hosted HTTPS origin is a code change that belongs with the hosted-release gates.
- **Layout.** Deploy `web` and `api` as two containers in one container app, so the proxy reaches the API at `127.0.0.1:5080`, and expose only the web port through ingress. Run `migrations` as a Container Apps job.
- **Registry access.** Give the container app a registry credential for `ghcr.io` (a token with `read:packages`), or make the packages public.
- **Settings.** The API needs `AccessMode=Authenticated`, `Auth__Issuer`, `Auth__Audience`, `Auth__Scope=BikeLog.Access` and `ConnectionStrings__Postgres`. The web app needs `BIKELOG_WEB_ACCESS_MODE=Authenticated`, `WEB_PUBLIC_ORIGIN`, `BIKELOG_API_ORIGIN`, the `AUTH0_*` settings, `BIKELOG_WEB_DATABASE_URL` and `BIKELOG_SESSION_KEY`. Keep the secrets in Key Vault ([decision 0003](decisions/0003-aiven-postgres-and-container-apps-hosting.md)).
- **Database connection.** Add `SSL Mode=VerifyFull` for Aiven, and `GSS Encryption Mode=Disable`, because the slim .NET images ship no Kerberos library.
