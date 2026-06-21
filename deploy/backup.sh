#!/bin/sh
# Резервная копия SQLite. Запуск: ./deploy/backup.sh
set -e
DATA_DIR="${DATA_DIR:-./server/data}"
DB="${DB_PATH:-$DATA_DIR/zynqo.db}"
STAMP=$(date +%Y%m%d-%H%M%S)
OUT="${1:-./backups/zynqo-$STAMP.db}"

mkdir -p "$(dirname "$OUT")"
if [ ! -f "$DB" ]; then
  echo "База не найдена: $DB" >&2
  exit 1
fi
sqlite3 "$DB" ".backup '$OUT'"
echo "OK: $OUT"
