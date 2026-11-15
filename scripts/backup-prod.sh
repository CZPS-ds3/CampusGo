#!/usr/bin/env bash
# Backup of the PRODUCTION stack on the Ubuntu server (docker-compose.prod.yml): a dump of the database and an
# archive of the uploaded pictures, both gzip-compressed, in BACKUP_DIR (default: backups/ in the repository,
# ignored by git). Backups older than KEEP_DAYS (default 14) are deleted. Run from anywhere:
#
#   bash scripts/backup-prod.sh
#
# Nightly at 03:15 (crontab -e on the server; the path is the clone of the repository):
#   15 3 * * * bash /srv/campus-city-quest/scripts/backup-prod.sh >> /var/log/campusgo-backup.log 2>&1
#
# The files hold personal data (e-mail addresses, names, pictures): they are readable by the owner only. Copy them
# to a second machine now and then; a backup on the same disk does not survive a broken disk. Restore: README.
set -euo pipefail
umask 077

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date -u +%Y-%m-%dT%H%M%SZ)"

compose() {
  docker compose --env-file "$ROOT/.env.production" -f "$ROOT/docker-compose.prod.yml" "$@"
}

[[ -f "$ROOT/.env.production" ]] || { echo "[backup] $ROOT/.env.production is missing" >&2; exit 1; }
[[ "$KEEP_DAYS" =~ ^[0-9]+$ ]] || { echo "[backup] KEEP_DAYS must be a whole number" >&2; exit 1; }
mkdir -p "$BACKUP_DIR"

db="$BACKUP_DIR/campusquest-db-$STAMP.sql.gz"
pictures="$BACKUP_DIR/campusquest-uploads-$STAMP.tar.gz"

# The root password stays inside the mysql container (its own environment); it never appears on a command line.
compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysqldump -uroot --single-transaction --routines --triggers --databases campusquest' \
  | gzip > "$db.part"
compose exec -T backend tar -C /app/backend/uploads -czf - . > "$pictures.part"

# A broken or empty file must never replace a good backup.
gzip -t "$db.part" && gzip -t "$pictures.part"
zcat "$db.part" | grep -q 'CREATE TABLE `students`' || { echo "[backup] the dump has no students table" >&2; exit 1; }
mv "$db.part" "$db"
mv "$pictures.part" "$pictures"

find "$BACKUP_DIR" -maxdepth 1 -name 'campusquest-*' -type f -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -maxdepth 1 -name 'campusquest-*.part' -type f -delete
echo "[backup] $(date -u +%FT%TZ) saved $(basename "$db") and $(basename "$pictures")"
