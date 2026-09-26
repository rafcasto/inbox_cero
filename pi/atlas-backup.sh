#!/usr/bin/env bash
# Nightly backup: user homes (projects + Claude history), /etc/atlas, the service env, and a per-user Firestore JSON export.
# Keeps 7 days in /var/backups/atlas; set ATLAS_BACKUP_RCLONE_DEST (e.g. gdrive:atlas-backups) to also copy off-device.
set -euo pipefail
DEST=/var/backups/atlas; STAMP=$(date +%Y%m%d-%H%M); mkdir -p "$DEST"
tar --exclude='*/node_modules' --exclude='*/.cache' --exclude='*/.npm' -czf "$DEST/homes-$STAMP.tgz" -C /home $(ls /home | grep '^u-' || true) 2>/dev/null || true
tar -czf "$DEST/etc-$STAMP.tgz" /etc/atlas /etc/sudoers.d/atlas /etc/systemd/system/atlas-*.service /etc/systemd/system/atlas-*.timer 2>/dev/null || true
if [[ -d /opt/atlas/apps/brain ]]; then
  ( cd /opt/atlas/apps/brain && set -a && source /opt/atlas/.env && set +a && sudo -u atlas -E ./node_modules/.bin/tsx scripts/export-all.ts "$DEST/firestore-$STAMP" ) || echo "firestore export failed" >&2
  tar -czf "$DEST/firestore-$STAMP.tgz" -C "$DEST" "firestore-$STAMP" && rm -rf "$DEST/firestore-$STAMP"
fi
find "$DEST" -name '*.tgz' -mtime +7 -delete
chmod 600 "$DEST"/*.tgz
[[ -n "${ATLAS_BACKUP_RCLONE_DEST:-}" ]] && command -v rclone >/dev/null && rclone copy "$DEST" "$ATLAS_BACKUP_RCLONE_DEST" --include '*.tgz' || true
echo "backup ok: $(ls "$DEST" | wc -l) archives"
