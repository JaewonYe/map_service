# syntax=docker/dockerfile:1
# Multi-platform base pinned; APT repositories remain mutable (see README).
FROM debian:bookworm-slim@sha256:734a72b3d6142a71993b4bc580ca01d8ca687f77a2c422d96a961d3376b179bc
RUN --mount=type=secret,id=proxy_ca \
    if [ -s /run/secrets/proxy_ca ]; then set -- -o Acquire::https::CaInfo=/run/secrets/proxy_ca; else set --; fi; \
    apt-get "$@" update && apt-get "$@" install -y --no-install-recommends python3 python3-gdal python3-shapely ca-certificates && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /tools
COPY --chmod=0644 prepare.py schema.sql ./
ENTRYPOINT ["python3", "/tools/prepare.py"]
