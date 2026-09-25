#!/usr/bin/env bash
# Atlas Pi setup — idempotent. Run as your normal user; it asks for sudo where needed.
#   bash scripts/setup.sh            # full setup
#   bash scripts/setup.sh --n8n      # only (re)import n8n workflows
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NODE_DIR="$HOME/.local/opt/node"
export PATH="$NODE_DIR/bin:$HOME/.local/bin:$PATH"

say() { printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }

if [[ "${1:-}" != "--n8n" ]]; then
  say "Node 22 (user-local)"
  if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
    mkdir -p "$HOME/.local/opt" && cd "$HOME/.local/opt"
    VER=$(curl -sL https://nodejs.org/dist/index.json | python3 -c "import sys,json;print([v['version'] for v in json.load(sys.stdin) if v['version'].startswith('v22.')][0])")
    curl -sL "https://nodejs.org/dist/${VER}/node-${VER}-linux-arm64.tar.xz" | tar -xJ && rm -rf node && mv "node-${VER}-linux-arm64" node
    cd "$ROOT"
  fi
  node -v

  say "pnpm + Claude Code CLI"
  mkdir -p "$HOME/.local/bin"
  corepack enable --install-directory "$HOME/.local/bin" >/dev/null 2>&1 || true
  corepack prepare pnpm@12.6.0 --activate >/dev/null
  npm config set prefix "$HOME/.local" >/dev/null
  command -v claude >/dev/null || npm i -g @anthropic-ai/claude-code >/dev/null
  claude --version

  say "Java (Firebase emulator, tests only)"
  command -v java >/dev/null || sudo apt-get install -y -qq openjdk-21-jre-headless

  say "Dependencies"
  cd "$ROOT" && pnpm install --frozen-lockfile 2>/dev/null || pnpm install

  say ".env"
  if [[ ! -f "$ROOT/.env" ]]; then
    cp "$ROOT/.env.example" "$ROOT/.env"
    sed -i "s|^ATLAS_MASTER_KEY=.*|ATLAS_MASTER_KEY=$(openssl rand -hex 32)|; s|^ATLAS_BRAIN_TOKEN=.*|ATLAS_BRAIN_TOKEN=$(openssl rand -hex 32)|" "$ROOT/.env"
    echo "Created $ROOT/.env with fresh ATLAS_MASTER_KEY and ATLAS_BRAIN_TOKEN. Fill in FIREBASE_SERVICE_ACCOUNT_B64 and UPSTASH_*."
  else
    echo ".env exists — leaving it alone"
  fi

  say "Claude auth"
  if ! claude -p 'say ok' --output-format json --max-turns 1 --tools '' --strict-mcp-config >/dev/null 2>&1; then
    echo "Claude CLI is not authenticated. Run:  claude login   (or set ANTHROPIC_API_KEY in .env)"
  else echo "Claude CLI authenticated"; fi

  say "systemd service (atlas-brain)"
  UNIT=/etc/systemd/system/atlas-brain.service
  sudo tee "$UNIT" >/dev/null <<UNIT
[Unit]
Description=Atlas brain (Claude Code CLI + Upstash worker)
After=network-online.target docker.service
Wants=network-online.target
ConditionPathExists=$ROOT/.env

[Service]
Type=simple
User=$USER
WorkingDirectory=$ROOT/apps/brain
EnvironmentFile=$ROOT/.env
Environment=PATH=$NODE_DIR/bin:$HOME/.local/bin:/usr/local/bin:/usr/bin:/bin
Environment=HOME=$HOME
ExecStart=$HOME/.local/bin/pnpm start
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT
  sudo systemctl daemon-reload
  sudo systemctl enable --now atlas-brain
  sleep 3; systemctl --no-pager --lines=5 status atlas-brain || true
  curl -s localhost:8787/health || echo "(brain not answering yet — check: journalctl -u atlas-brain -f)"
fi

say "n8n workflows"
N8N_URL="${N8N_URL:-http://localhost:5678}"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
if [[ -z "${N8N_API_KEY:-}" ]]; then
  echo "N8N_API_KEY not set in .env — import n8n/*.json manually (see n8n/README.md)"
else
  for f in "$ROOT"/n8n/0*.json; do
    name=$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['name'])" "$f")
    body=$(python3 -c "import json,sys;d=json.load(open(sys.argv[1]));print(json.dumps({k:d[k] for k in ('name','nodes','connections','settings')}))" "$f")
    code=$(curl -s -o /tmp/n8n-import.json -w '%{http_code}' -X POST "$N8N_URL/api/v1/workflows" -H "X-N8N-API-KEY: $N8N_API_KEY" -H 'Content-Type: application/json' -d "$body")
    echo "  $name → HTTP $code"
  done
  echo "Now in n8n: add variable ATLAS_BRAIN_URL, credential 'Atlas brain bearer', then activate each workflow."
fi

say "Done"
cat <<'MSG'
Next:
  1. Fill .env (FIREBASE_SERVICE_ACCOUNT_B64, UPSTASH_*, WHATSAPP_*), then: sudo systemctl restart atlas-brain
  2. Deploy rules:   cd firebase && firebase login && pnpm deploy:rules
  3. First invite:   cd apps/brain && pnpm exec tsx scripts/invite.ts you@example.com
  4. Admin claim:    cd apps/brain && pnpm exec tsx scripts/set-admin.ts you@example.com
MSG
