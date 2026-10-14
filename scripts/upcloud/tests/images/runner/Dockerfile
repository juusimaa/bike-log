# Runs scripts/upcloud/tests/run.sh: Debian like the server (bash, flock, timeout,
# df) with the pinned Docker CLI, Compose and Buildx. Node parses JSON in the tests.
# The CA bundle comes from the CLI image: Buildx fetches registry tokens client-side.
FROM docker:29.8.2-cli@sha256:35cfcf893c20f2931f4909151b5407aaaeab711277de7ce8b8f521f095d54c32 AS docker
FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66
COPY --from=docker /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker /usr/local/libexec/docker/cli-plugins/ /usr/local/libexec/docker/cli-plugins/
COPY --from=docker /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
