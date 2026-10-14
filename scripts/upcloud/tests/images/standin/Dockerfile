# Stand-ins for the four published images (scripts/upcloud/tests/run.sh). ROLE picks
# the behaviour; VARIANT only changes the digest.
FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66
ARG ROLE
ARG VARIANT=1
LABEL bikelog.test.role=${ROLE} bikelog.test.variant=${VARIANT}
ENV STANDIN_ROLE=${ROLE}
COPY standin.js /standin.js
ENTRYPOINT ["node", "/standin.js"]
