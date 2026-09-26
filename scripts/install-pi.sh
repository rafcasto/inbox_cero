#!/usr/bin/env bash
# Privileged Pi install (run with sudo). Idempotent. Creates the `atlas` service user, system-wide toolchain,
# the narrow sudo rule, /etc/atlas, the /opt/atlas production checkout and the systemd units.
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo"; exit 1; }
DEV_REPO="${DEV_REPO:-/home/rafcasto/Documents/atlas}"
DEV_USER="${SUDO_USER:-rafcasto}"
say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

say "system-wide Node 22 + pnpm + Claude Code CLI"
if [[ ! -x /usr/local/lib/node22/bin/node ]]; then
  SRC="/home/$DEV_USER/.local/opt/node"
  [[ -d "$SRC" ]] || { echo "expected Node at $SRC (run scripts/setup.sh first)"; exit 1; }
  rm -rf /usr/local/lib/node22 && cp -a "$SRC" /usr/local/lib/node22
fi
for b in node npm npx corepack; do ln -sf /usr/local/lib/node22/bin/$b /usr/local/bin/$b; done
export PATH=/usr/local/bin:$PATH
corepack enable --install-directory /usr/local/bin >/dev/null 2>&1 || true
corepack prepare pnpm@12.6.0 --activate >/dev/null 2>&1 || true
[[ -x /usr/local/bin/pnpm ]] || ln -sf "$(ls -d /root/.cache/node/corepack/v1/pnpm/*/bin/pnpm.cjs 2>/dev/null | tail -1)" /usr/local/bin/pnpm
[[ -x /usr/local/bin/claude ]] || npm i -g --prefix /usr/local @anthropic-ai/claude-code >/dev/null 2>&1
command -v acl >/dev/null 2>&1 || true; dpkg -s acl >/dev/null 2>&1 || apt-get install -y -qq acl >/dev/null
echo "node $(node -v) · pnpm $(pnpm -v) · claude $(claude --version 2>/dev/null | head -1)"

say "service user + group"
getent group atlas-users >/dev/null || groupadd atlas-users
id atlas >/dev/null 2>&1 || useradd --system --create-home --home-dir /home/atlas --shell /usr/sbin/nologin atlas
usermod -aG docker atlas 2>/dev/null || true
install -d -o atlas -g atlas -m 700 /home/atlas/.claude
chmod 750 /home/atlas

say "helpers, sudoers, /etc/atlas"
install -o root -g root -m 0755 "$DEV_REPO/pi/atlas-provision" "$DEV_REPO/pi/atlas-run" "$DEV_REPO/pi/atlas-deprovision" "$DEV_REPO/pi/atlas-backup.sh" /usr/local/sbin/
install -d -m 0755 /etc/atlas /etc/atlas/templates/claude
install -m 0644 "$DEV_REPO"/pi/templates/claude/* /etc/atlas/templates/claude/
if [[ ! -f /etc/atlas/env ]]; then
  printf 'ATLAS_DEFAULT_MODEL=claude-sonnet-4-5\n# from: claude setup-token   (subscription, long-lived)\nCLAUDE_CODE_OAUTH_TOKEN=\n' > /etc/atlas/env
fi
chmod 0600 /etc/atlas/env
install -m 0440 "$DEV_REPO/pi/sudoers" /etc/sudoers.d/atlas && visudo -cf /etc/sudoers.d/atlas >/dev/null && echo "sudoers ok"
if [[ -f "/home/$DEV_USER/.config/atlas/service-account.json" && ! -f /etc/atlas/service-account.json ]]; then
  install -o root -g atlas -m 0640 "/home/$DEV_USER/.config/atlas/service-account.json" /etc/atlas/service-account.json
fi

say "/opt/atlas production checkout"
if [[ ! -d /opt/atlas/.git ]]; then
  git clone -q https://github.com/rafcasto/inbox_cero.git /opt/atlas
else
  git -C /opt/atlas pull -q --ff-only || true
fi
if [[ ! -f /opt/atlas/.env && -f "$DEV_REPO/.env" ]]; then
  cp "$DEV_REPO/.env" /opt/atlas/.env
  sed -i "s|^FIREBASE_SERVICE_ACCOUNT_FILE=.*|FIREBASE_SERVICE_ACCOUNT_FILE=/etc/atlas/service-account.json|" /opt/atlas/.env
fi
chown -R atlas:atlas /opt/atlas
chmod 0600 /opt/atlas/.env
runuser -u atlas -- bash -lc 'cd /opt/atlas && export PATH=/usr/local/bin:$PATH && pnpm install --frozen-lockfile >/dev/null 2>&1 || pnpm install >/dev/null 2>&1; echo "deps installed"'

say "systemd"
install -m 0644 "$DEV_REPO"/pi/systemd/atlas-brain.service "$DEV_REPO"/pi/systemd/atlas-backup.service "$DEV_REPO"/pi/systemd/atlas-backup.timer /etc/systemd/system/
mkdir -p /var/backups/atlas && chmod 0700 /var/backups/atlas
systemctl daemon-reload
systemctl enable --now atlas-backup.timer >/dev/null
systemctl enable atlas-brain >/dev/null
systemctl restart atlas-brain
sleep 8
systemctl --no-pager status atlas-brain | grep -E "Active|Main PID" | head -2
curl -s localhost:8787/health || echo "(brain not answering yet)"
echo
say "done. Next: claude setup-token  →  paste into /etc/atlas/env  →  sudo systemctl restart atlas-brain"
