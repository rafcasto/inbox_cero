import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(here, '../../..');
export const PROMPTS_DIR = resolve(REPO_ROOT, 'prompts');

// Load .env from repo root or apps/brain if present (no dotenv dependency)
for (const p of [resolve(REPO_ROOT, '.env'), resolve(here, '../.env')]) {
  if (existsSync(p)) {
    for (const line of readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && m[1] && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2]!.replace(/^["']|["']$/g, '').replace(/\s+#.*$/, '');
      }
    }
  }
}

const env = (k: string, d = '') => process.env[k] ?? d;

const fileJson = (() => { const f = process.env.FIREBASE_SERVICE_ACCOUNT_FILE; try { return f && existsSync(f) ? readFileSync(f, 'utf8') : ''; } catch { return ''; } })();

export const config = {
  port: Number(env('ATLAS_BRAIN_PORT', '8787')),
  token: env('ATLAS_BRAIN_TOKEN'),
  masterKey: env('ATLAS_MASTER_KEY'),
  defaultModel: env('ATLAS_DEFAULT_MODEL', 'claude-sonnet-4-5'),
  claudeBin: env('CLAUDE_BIN', 'claude'),
  pollMs: Number(env('ATLAS_POLL_MS', '5000')),
  maxBudgetUsd: Number(env('ATLAS_MAX_BUDGET_PER_CALL_USD', '0.50')),
  upstashUrl: env('UPSTASH_REDIS_REST_URL'),
  upstashToken: env('UPSTASH_REDIS_REST_TOKEN'),
  serviceAccountB64: env('FIREBASE_SERVICE_ACCOUNT_B64'),
  serviceAccountJson: env('FIREBASE_SERVICE_ACCOUNT_JSON') || fileJson,
  serviceAccountFile: env('FIREBASE_SERVICE_ACCOUNT_FILE'),
  projectId: env('FIREBASE_PROJECT_ID', 'inboxcero-1b7a9'),
  n8nUrl: env('N8N_URL', 'http://localhost:5678'),
  n8nApiKey: env('N8N_API_KEY'),
  whatsapp: {
    phoneNumberId: env('WHATSAPP_PHONE_NUMBER_ID'),
    accessToken: env('WHATSAPP_ACCESS_TOKEN'),
  },
  dryRun: env('ATLAS_DRY_RUN') === '1',
};
