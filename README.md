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
pnpm test            # rules test suite in the emulator (10 tests: tenant isolation, verification gate, server-only collections, admin)
pnpm deploy:rules    # firestore.rules + indexes + storage.rules → inboxcero-1b7a9
```
Console: Blaze plan, Firestore (australia-southeast1), Storage, Auth providers Email/Password + Google.

## Portal (Vercel)
Project root directory: `apps/web`. Env vars: see `.env.example` (portal section). First deploy, then:
```bash
cd apps/brain
pnpm exec tsx scripts/invite.ts you@example.com     # invite code for the first account
pnpm exec tsx scripts/set-admin.ts you@example.com  # after you've registered
```

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
