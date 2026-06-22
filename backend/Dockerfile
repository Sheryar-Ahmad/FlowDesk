FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends openjdk-17-jdk-headless nodejs \
    && rm -rf /var/lib/apt/lists/*

RUN groupadd --system flowdesk \
    && useradd --system --gid flowdesk --create-home flowdesk

COPY requirements.txt .
RUN python -m pip install --upgrade pip \
    && python -m pip install --requirement requirements.txt

COPY . .
RUN chmod +x /app/entrypoint.sh \
    && chown -R flowdesk:flowdesk /app

USER flowdesk

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen(f'http://127.0.0.1:{os.getenv(\"PORT\", \"8000\")}/health', timeout=4)"

ENTRYPOINT ["/app/entrypoint.sh"]
