# syntax=docker/dockerfile:1
FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
RUN --mount=type=secret,id=proxy_ca \
    if [ -s /run/secrets/proxy_ca ]; then set -- -o Acquire::https::CaInfo=/run/secrets/proxy_ca; else set --; fi; \
    apt-get "$@" update && apt-get "$@" install -y --no-install-recommends python3 python3-gdal python3-shapely python3-numpy osmium-tool ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY scripts/downloads /app/scripts/downloads
COPY scripts/osm /app/scripts/osm
COPY scripts/elevation /app/scripts/elevation
RUN useradd --uid 1000 --create-home worker && mkdir -p /data/downloads && chown worker:worker /data/downloads
USER worker
ENV MAP_DOWNLOADS_DIR=/data/downloads PYTHONDONTWRITEBYTECODE=1
ENTRYPOINT ["/usr/bin/python3", "/app/scripts/downloads/worker.py"]
