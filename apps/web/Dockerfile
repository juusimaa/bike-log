# syntax=docker/dockerfile:1
# Build context: repository root.
# The build stage runs on the build platform; the output is platform-neutral
# JavaScript. The app does not use next/image, so sharp's native binary is
# never loaded at runtime.
FROM --platform=$BUILDPLATFORM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66 AS build
WORKDIR /repo
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
RUN npm ci --workspace @bikelog/web --include-workspace-root=false --ignore-scripts
COPY packages/api-client packages/api-client
COPY apps/web apps/web
RUN BIKELOG_STANDALONE=1 npm run build --workspace @bikelog/web \
    && cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static \
    && cp -r apps/web/public apps/web/.next/standalone/apps/web/public

FROM node:24.21.0-trixie-slim@sha256:173f125896c3b47ddf056734c7ea789d04595a6a08769a8f78e0df642781fb66
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
USER node
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
