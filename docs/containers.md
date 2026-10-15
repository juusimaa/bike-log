# Container images

Four images are built from this repository. Each is published as a multi-platform image for `linux/amd64` (the UpCloud server) and `linux/arm64` (Apple silicon).

| Image | Dockerfile (target) | Runs |
| --- | --- | --- |
| `api` | `src/Api/Dockerfile` (`api`) | The ASP.NET Core API on port 5080. The same image runs operator commands such as `--rebuild-usage`. |
| `migrations` | `src/Api/Dockerfile` (`migrations`) | A self-contained EF Core migration bundle. It reads `ConnectionStrings__Postgres`, applies pending migrations and exits. |
| `web` | `apps/web/Dockerfile` | The Next.js standalone server on port 3000. |
| `backup` | `images/backup/Dockerfile` | The daily hosted backup job: `pg_dump` plus a snapshot manifest, uploaded as create-only blobs ([backups](hosting/upcloud.md#backups)). |

All four run as non-root users, and the base images are pinned by digest. Migrations never run at API startup. Run the `migrations` image as a separate step before starting a new API version.

## Run locally

```sh
./scripts/dev.sh app-up    # build the images and start the stack
./scripts/dev.sh app-down  # stop it; the data volume is kept
```

Open http://127.0.0.1:3000. The stack uses synthetic access mode and the credentials from `.env`. It runs as its own Compose project, `bikelog-app`, with its own database volume, so the development database from `db-up` is untouched. Port 3000 is shared with `npm run web:dev`, so run only one of them at a time.

The services in [`compose.app.yaml`](../compose.app.yaml) share one network namespace, as `api` shares `web`'s on the server ([deploy/upcloud/compose.yaml](../deploy/upcloud/compose.yaml)). Synthetic mode accepts only loopback callers and a loopback database, and the web proxy expects the API at `http://127.0.0.1:5080`.

To run the images published by CI instead of building them:

```sh
BIKELOG_IMAGE_PREFIX=ghcr.io/juusimaa/bike-log BIKELOG_IMAGE_TAG=main \
  docker compose -f compose.app.yaml up --no-build --wait
```

Use `latest`, `main`, `sha-<commit>` or a release version as the tag. The server pulls the packages anonymously, so they are public. If a package is private, run `docker login ghcr.io` with a personal access token that has `read:packages` first.

## CI

[`.github/workflows/containers.yml`](../.github/workflows/containers.yml) builds all four images for both platforms on every pull request without pushing them. Pushes to `main` publish to `ghcr.io/juusimaa/bike-log/<image>` with tags `sha-<commit>`, `main` and `latest`. `v*` tags also publish the version, for example `1.2.0`. Images carry SBOM and provenance attestations. The .NET and web build stages run on the runner's own platform and cross-compile, so no CPU emulation is needed.

## Hosted deployment

The owner's UpCloud server runs these images with Docker Compose behind Caddy. The server's files are in
[`deploy/upcloud/`](../deploy/upcloud/), setup and operations in [hosting/upcloud.md](hosting/upcloud.md),
and the design in [decision 0007](decisions/0007-upcloud-hosting.md). The earlier Azure Container Apps
deployment ([decision 0006](decisions/0006-hosted-deployment-architecture.md)) is historical.
