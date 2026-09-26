# Atlas — Personal AI Chief of Staff

Triage → projects → OKRs → finance → content. Raspberry Pi brain (n8n + **Claude Code CLI**), Firebase backend, Next.js portal on Vercel, WhatsApp channel, Upstash Redis as the Vercel↔Pi bus. Multi-tenant, invite-only.

**Docs:** [Architecture](docs/architecture.md) · [Data model](docs/data-model.md) · [Decisions](docs/decisions.md) · [Roadmap](docs/roadmap.md) · [Credentials](docs/credentials.md) · [Reminders Shortcut](docs/reminders-shortcut.md) · [n8n](n8n/README.md) · [Prompts](prompts/README.md)

## Layout
```
apps/web        Next.js 15 portal (Vercel)           apps/brain   Pi service: Claude CLI runner + Upstash worker
packages/schemas Zod schemas shared everywhere        firebase/    rules, indexes, emulator tests
prompts/        versioned prompt files (data)        n8n/         workflow exports (schedules only)
scripts/setup.sh Pi setup                            docs/        architecture, data model, ADRs
```

## Pi setup
```bash
git clone https://github.com/rafcasto/inbox_cero.git atlas && cd atlas
bash scripts/setup.sh          # Node 22, pnpm, Claude CLI, Java, deps, .env, systemd service, n8n import
claude login                   # once, if not already authenticated (or put ANTHROPIC_API_KEY in .env)
nano .env                      # FIREBASE_SERVICE_ACCOUNT_B64, UPSTASH_*, WHATSAPP_*, N8N_API_KEY
sudo systemctl restart atlas-brain && curl localhost:8787/health
```

## Firebase
```bash
cd firebase && firebase login
pnpm test:rules      # rules test suite in the emulator (10 tests: tenant isolation, verification gate, server-only collections, admin)
pnpm deploy:rules    # firestore.rules + indexes → inboxcero-1b7a9  (files live in Google Drive; no Firebase Storage)
```
Console: Firestore (australia-southeast1), Auth providers Email/Password + Google. No Storage, no Blaze plan needed.

## Portal (Vercel)
Project root directory: `apps/web`. Env vars: see `.env.example` (portal section). First deploy, then:
```bash
cd apps/brain
pnpm exec tsx scripts/invite.ts you@example.com     # invite code for the first account
pnpm exec tsx scripts/set-admin.ts you@example.com  # after you've registered
```

## Users & provisioning (Phase 1)
Every account gets an isolated Linux user on the Pi, created automatically at signup — nobody runs anything by hand.

- **Flow:** invite consumed → `user.provision` job → the brain (service user `atlas`) calls `sudo /usr/local/sbin/atlas-provision` → `u-<slug>` with home `750`, `projects/inbox/`, templated Claude config (no credentials) → result stored on `users/{uid}.provisioning` → audit row. `/admin` shows the Pi user per account and can re-run it.
- **Isolation is the kernel's job:** the service user has `x` on a home (traverse only) and `rwx` + default ACL on `projects/` only; it cannot read anyone's `~/.claude`. Users cannot see each other's homes.
- **Running as a user:** `atlas-run <slug> <cwd> -- cmd…` is the only path; cwd must be inside that user's `projects/`, the environment is rebuilt from scratch, and the Claude **subscription token** (`claude setup-token` → `/etc/atlas/env`, root-only) is injected per process. No secrets ever live in user homes.
- **Backups:** `atlas-backup.timer` at 02:30 — user homes, `/etc/atlas`, units, and a per-user Firestore JSON export → `/var/backups/atlas` (7 days). Set `ATLAS_BACKUP_RCLONE_DEST` to copy off the SD card.
- **Install/upgrade the privileged layer:** `sudo bash scripts/install-pi.sh` (idempotent; also refreshes the `/opt/atlas` production checkout and restarts the service). Details: [pi/README.md](pi/README.md).

## Projects, files & the 360 view (Phase 3)
- A **project** exists in three places at once: Firestore (`projects/{id}`), the user's Pi workspace (`~/projects/<dir>`), and their Drive space (`<slug>/<name>/`). Creating one (Board or Projects page) provisions all three; "Provision missing" back-fills older projects.
- **Files**: the Projects page lists a project's files straight from the Pi and moves them between projects/inbox on **both** sides (Pi `mv` as the user + Drive `addParents/removeParents` via the `driveFiles` map). Anything without a project lands in `inbox/`.
- **Run Claude in a project**: one prompt → `claude -p … --resume <session>` executed *as the user* with cwd = the project dir, so context and history are per project and live in the user's own home. Results, cost and changed files are stored in `projectRuns`; Phase 5 turns this into streaming chat.
- **Events**: `audit` is the events table — every agent action, file move and job run carries `actionType`, `projectId`, `ref`, `jobId`. The **360** page queries it across projects (filters by project/action/day, cost per project, per-day activity).

## Day-to-day
- **Today** — what needs you, quarter health, waiting-on, governance flags, activity feed.
- **Inbox** — one keystroke per decision (`1-5`, `y` accept, `j/k`, `s` snooze). Overrides become feedback for future triage.
- **Board** — Backlog → This week → In progress → Waiting on → Done. Projects must serve a KR or be maintenance.
- **OKRs** — objectives, KR progress + confidence sparkline, daily check-in, weekly truth session, monthly review, quarterly plan/retro (portal or WhatsApp).
- **Finance** — import bank CSV weekly (ANZ/ASB/BNZ/Kiwibank/Westpac auto-detected), burn number, categories, recurring register, P&L, GST export.
- **Content** — ideas → drafts in your voice → review → scheduled → published. Never auto-published.
- **WhatsApp** — `kr2 40%`, `done …`, `add …`, `idea …`, `receipt` + photo, `today`, `status`, or just answer the check-in.

## Development
```bash
pnpm install
pnpm --filter @atlas/web dev                 # portal at :3000 (needs apps/web/.env.local)
pnpm --filter @atlas/brain dev               # brain at :8787
cd apps/brain && pnpm exec tsx scripts/run.ts <uid> triage.items '{"items":[...]}'   # run any task locally
cd firebase && firebase emulators:exec --only firestore "cd ../apps/brain && pnpm exec tsx scripts/smoke.ts"  # e2e smoke
```
