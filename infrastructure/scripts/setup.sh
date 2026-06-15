#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR"

command -v docker >/dev/null 2>&1 || {
  echo "Docker is required." >&2
  exit 1
}

if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env from .env.example. Add provider keys when needed."
fi

docker compose up --build --detach
docker compose ps
