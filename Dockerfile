# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
# Optional CA for managed cloud proxies; normal builds use system trust.
RUN --mount=type=secret,id=proxy_ca \
    if [ -s /run/secrets/proxy_ca ]; then export NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca; fi; \
    npm ci --strict-ssl=true

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
RUN npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3001 BUILDINGS_DIR=/data/buildings OSM_EDITS_DIR=/data/osm-edits MAP_DOWNLOADS_DIR=/data/downloads
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
# Local Korean labels for the offline OSM renderer; no font/CDN runtime requests.
RUN --mount=type=secret,id=proxy_ca \
    if [ -s /run/secrets/proxy_ca ]; then set -- -o Acquire::https::CaInfo=/run/secrets/proxy_ca; else set --; fi; \
    apt-get "$@" update && apt-get "$@" install -y --no-install-recommends fonts-noto-cjk fontconfig && \
    rm -rf /var/lib/apt/lists/*
RUN mkdir -p /cache /data/buildings /data/osm-edits /data/downloads && chown node:node /cache /data/buildings /data/osm-edits /data/downloads
USER node
EXPOSE 3001
CMD ["node", "server.js"]
