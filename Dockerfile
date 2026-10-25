# syntax=docker/dockerfile:1
# Pinned base: node 24.22.1 on Debian bookworm (update the digest deliberately, with a rebuild and test).
ARG NODE_IMAGE=node:24-bookworm-slim@sha256:55fb5f5a527ea2c5c4a95f963e48ef90aa38c7b346054fdc8ee9957a2b55d205

FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Behind a TLS-intercepting proxy, pass its CA as a build secret (never stored in a layer):
#   docker build --secret id=extra_ca,src=/path/to/ca.pem .
RUN --mount=type=secret,id=extra_ca,required=false \
    if [ -f /run/secrets/extra_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/extra_ca; fi; \
    npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM ${NODE_IMAGE}
ENV NODE_ENV=production \
    APP_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    DATABASE_PATH=/data/scope.db \
    BACKUP_DIR=/backups \
    OUTBOX_DIR=/data/outbox \
    MIGRATIONS_DIR=/app/server/migrations
WORKDIR /app
RUN mkdir -p /data /backups && chown node:node /data /backups
COPY --from=build --chown=root:root /app/dist ./dist
COPY --from=build --chown=root:root /app/node_modules ./node_modules
COPY --from=build --chown=root:root /app/server/migrations ./server/migrations
COPY --from=build --chown=root:root /app/package.json ./package.json
COPY --chown=root:root deploy/entrypoint.sh /usr/local/bin/scope-entrypoint
# Application code is root-owned and read-only to the runtime user; only /data and /backups are writable.
USER node
VOLUME ["/data", "/backups"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["scope-entrypoint"]
