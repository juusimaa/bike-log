# syntax=docker/dockerfile:1
# Build context: repository root. Daily backup job (research D9): a pg_dump of the
# hosted database plus a snapshot manifest, uploaded as create-only blobs.
# Same pinned server image as compose.yaml, so pg_dump is client 18.6.
FROM postgres:18.6@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336
# Exact Debian 13 package versions: the build fails if one disappears, and
# updating them is a deliberate change.
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates=20250419 \
        curl=8.14.1-2+deb13u7 \
        jq=1.7.1-6+deb13u4 \
    && rm -rf /var/lib/apt/lists/*
COPY --chmod=755 images/backup/backup.sh /usr/local/bin/backup.sh
COPY --chmod=755 images/backup/manifest.sql /usr/local/share/bikelog/manifest.sql
USER postgres
WORKDIR /tmp
ENTRYPOINT ["/usr/local/bin/backup.sh"]
