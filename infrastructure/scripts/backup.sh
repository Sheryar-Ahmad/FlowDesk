#!/usr/bin/env sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
BACKUP_DIR=${BACKUP_DIR:-"$ROOT_DIR/backups"}
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
OUTPUT_FILE="$BACKUP_DIR/flowdesk-$TIMESTAMP.sql"

mkdir -p "$BACKUP_DIR"
cd "$ROOT_DIR"

docker compose exec -T database \
  pg_dump --clean --if-exists --no-owner --username flowdesk --dbname flowdesk \
  > "$OUTPUT_FILE"

echo "Database backup written to $OUTPUT_FILE"
