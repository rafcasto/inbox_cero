# Accounts & credentials you need to create

Nothing below goes into git. `.env.example` lists every variable with a placeholder.

## Already have
| What | Status | Action |
|---|---|---|
| Firebase project `inboxcero-1b7a9` | exists | **Rotate** the service-account key that was pasted in chat (IAM → Service Accounts → `firebase-adminsdk-fbsvc` → Keys → delete `e72ef0a2…`, create new JSON). Enable **Blaze** plan (needed for Cloud Storage bucket). Enable Auth providers: Email/Password + Google. Enable Firestore (region `australia-southeast1`). |
| Upstash Redis `striking-eagle-299525` | exists | **Rotate** the REST token (it was pasted in chat). |
| GitHub `rafcasto/inbox_cero` | exists, public | Add a `.gitignore` before the first push (included). |
| Meta Business account + number | exists | Create a Meta App → add WhatsApp product → get `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, permanent System User token; set webhook URL to `https://<portal>/api/webhooks/whatsapp` with your own `WHATSAPP_VERIFY_TOKEN`. Submit 6 message templates (listed in `docs/architecture.md` §6). |
| n8n on the Pi | running | Create an n8n API key (Settings → API) so `setup.sh` can import workflows. |

## To create
| What | Where | Used for |
|---|---|---|
| Vercel project linked to the repo | vercel.com | portal hosting; all `NEXT_PUBLIC_*` + server vars |
| Claude Code auth on the Pi | `claude login` as user `atlas` **or** `ANTHROPIC_API_KEY` from console.anthropic.com | reasoning engine (ADR-001) |
| Gmail app passwords ×2 | Google Account → Security → 2-Step Verification → App passwords | IMAP for both Gmails |
| App/IMAP passwords for the other mailboxes | each provider | IMAP |
| Google OAuth client (Web) | Firebase console auto-creates when enabling Google sign-in | Google sign-in only (no Gmail scopes) |
| `ATLAS_MASTER_KEY` | `openssl rand -hex 32` on the Pi | encrypts per-user integration secrets in Firestore |
| `ATLAS_BRAIN_TOKEN` | `openssl rand -hex 32` | n8n → brain auth |
| `REMINDERS_SHORTCUT_TOKEN` | generated per user in Settings → Integrations | iPhone Shortcut → portal |
| `INVITE_ADMIN_UID` | your Firebase UID after first sign-up | sets the `admin` custom claim via `scripts/set-admin.ts` |

## Where each secret lives
| Secret | Pi `.env` | Vercel env | Firestore (encrypted) |
|---|---|---|---|
| Firebase service account JSON | ✔ (`FIREBASE_SERVICE_ACCOUNT` base64) | ✔ | |
| Upstash URL + token | ✔ | ✔ | |
| ATLAS_MASTER_KEY | ✔ | ✔ (portal encrypts on save) | |
| ANTHROPIC_API_KEY (optional) | ✔ | | |
| WhatsApp token / IDs | ✔ (n8n) | ✔ (webhook verify) | |
| Per-user IMAP passwords, WhatsApp number, Shortcut token | | | ✔ |
