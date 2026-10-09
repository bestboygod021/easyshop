# syntax=docker/dockerfile:1.7
# Use a Node 22 patch release. Pin the resolved base-image digest before a
# production promotion (the tag alone is not an immutable supply-chain input).
ARG NODE_BASE_IMAGE=node:22.22.3-bookworm-slim

FROM ${NODE_BASE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY . .
RUN npm run build

FROM ${NODE_BASE_IMAGE} AS runtime
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=4000 \
    DATA_DIR=/app/server/data \
    UPLOAD_DIR=/app/server/data/uploads \
    BACKUP_DIR=/var/lib/easyshop-backups
WORKDIR /app

COPY package.json package-lock.json ./
COPY server/package.json server/package.json
COPY web/package.json web/package.json
RUN npm ci --omit=dev --workspace @easyshop/server --include-workspace-root=false \
    && mkdir -p /app/server/data/uploads /var/lib/easyshop-backups \
    && chown -R 10001:10001 /app/server/data /var/lib/easyshop-backups

COPY --from=build --chown=10001:10001 /app/server/src ./server/src
COPY --from=build --chown=10001:10001 /app/web/dist ./web/dist

USER 10001:10001
EXPOSE 4000
CMD ["node", "server/src/index.js"]
