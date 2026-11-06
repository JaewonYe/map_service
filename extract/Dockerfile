FROM python:3.12-slim-bookworm
RUN apt-get update \
    && apt-get install -y --no-install-recommends osmium-tool ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY extract/ /app/
ENTRYPOINT ["python", "/app/extract.py"]
