# syntax=docker/dockerfile:1
# Build context: repository root. Daily backup job (research D9): a pg_dump of the
# hosted database plus a snapshot manifest, uploaded as create-only blobs.
# Same pinned server image as compose.yaml, so pg_dump is client 18.6.
FROM postgres:18.6@sha256:74935e72241653ca55e0414067e6d8763aceb8a810eb51b452253ec3dcfc4336
# Exact Debian 13 package versions, installed from a fixed snapshot.debian.org
# timestamp instead of the live archive. The live archive drops a version as soon
# as a security update replaces it, which would break every build; the snapshot
# keeps it. Moving the timestamp and the versions is a deliberate change, made by
# scripts/hosted/update-backup-pins.sh and the monthly "Backup image pins" workflow.
# Plain http is expected: apt verifies the snapshot's signed Release files with the
# image's Debian keyring, and ca-certificates is not installed yet.
ARG DEBIAN_SNAPSHOT=20261013T073402Z
RUN printf '%s\n' \
        'Types: deb' \
        "URIs: http://snapshot.debian.org/archive/debian/${DEBIAN_SNAPSHOT}" \
        'Suites: trixie trixie-updates' \
        'Components: main' \
        'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
        '' \
        'Types: deb' \
        "URIs: http://snapshot.debian.org/archive/debian-security/${DEBIAN_SNAPSHOT}" \
        'Suites: trixie-security' \
        'Components: main' \
        'Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg' \
        > /tmp/snapshot.sources \
    && mkdir /tmp/snapshot.d && mv /tmp/snapshot.sources /tmp/snapshot.d/ \
    && apt-get \
        -o Dir::Etc::SourceList=/dev/null \
        -o Dir::Etc::SourceParts=/tmp/snapshot.d \
        -o Acquire::Check-Valid-Until=false \
        -o Acquire::Retries=5 \
        update \
    && apt-get \
        -o Dir::Etc::SourceList=/dev/null \
        -o Dir::Etc::SourceParts=/tmp/snapshot.d \
        -o Acquire::Retries=5 \
        install -y --no-install-recommends \
        ca-certificates=20250419 \
        curl=8.14.1-2+deb13u5 \
        jq=1.7.1-6+deb13u4 \
    && rm -rf /var/lib/apt/lists/* /tmp/snapshot.d
COPY --chmod=755 images/backup/backup.sh /usr/local/bin/backup.sh
COPY --chmod=755 images/backup/manifest.sql /usr/local/share/bikelog/manifest.sql
USER postgres
WORKDIR /tmp
ENTRYPOINT ["/usr/local/bin/backup.sh"]
