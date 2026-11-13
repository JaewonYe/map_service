# syntax=docker/dockerfile:1
FROM debian:bookworm-slim
# Optional trust for managed cloud proxies, never disable certificate checks.
RUN --mount=type=secret,id=proxy_ca \
    if [ -s /run/secrets/proxy_ca ]; then set -- -o Acquire::https::CaInfo=/run/secrets/proxy_ca; else set --; fi; \
    apt-get "$@" update && apt-get "$@" install -y --no-install-recommends ca-certificates python3 python3-gdal python3-numpy && \
    rm -rf /var/lib/apt/lists/*
WORKDIR /tools
COPY prepare.py ./prepare.py
ENTRYPOINT ["python3", "/tools/prepare.py"]
