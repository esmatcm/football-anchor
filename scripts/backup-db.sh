#!/bin/bash
DB_PATH=/srv/football-anchor/data/data.db
BACKUP_DIR=/srv/football-anchor/data/backup
MAX_BACKUPS=7

mkdir -p $BACKUP_DIR
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/data-$TIMESTAMP.db"

sqlite3 "$DB_PATH" ".backup '$BACKUP_FILE'"

if [ $? -eq 0 ]; then
  echo "[$(date)] Backup success: $BACKUP_FILE"
  # Keep only the latest MAX_BACKUPS
  cd $BACKUP_DIR && ls -t data-*.db 2>/dev/null | tail -n +$(($MAX_BACKUPS + 1)) | xargs -r rm -f
else
  echo "[$(date)] Backup FAILED" >&2
fi
