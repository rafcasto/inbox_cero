# Atlas — Phased roadmap

Each phase ends with: changelog, "what to test", known gaps. Nothing is auto-published or auto-sent to third parties without your approval in the portal.

## Phase 0 — Foundations (this week)
- Monorepo: `apps/web` (Next.js 15, App Router, TS, Tailwind, shadcn-style primitives), `apps/brain` (Fastify + TS on the Pi), `packages/schemas` (Zod), `firebase/` (rules + emulator tests), `n8n/` (exports), `prompts/`, `docs/`, `scripts/setup.sh`.
- Pi: install Node 22, pnpm, Claude Code CLI as the `atlas` user, `atlas-brain` as a systemd service, Docker network shared with n8n.
- **You get:** a repo that builds, a Pi that answers `POST /run` with a Claude response, rules tests green.

## Phase 1 — Accounts, portal skeleton, email triage
- Firestore rules + emulator test suite (cross-user isolation proven).
- `/register` (invite code + email/password + Google), `/login`, `/reset-password`, email verification gate, onboarding (3 screens: who you are · priorities · connect a mailbox).
- Settings → Profile / Priority rules / AI models / Integrations (IMAP mailboxes, encrypted).
- n8n: per-mailbox IMAP poll (2 min) → normalise → dedupe → rules → enqueue `triage.email` → brain → Item.
- Inbox view: one-tap confirm/override (keyboard `1-5` for actions, `j/k` navigation), feedback signals stored, IMAP move on file/ignore.
- Audit feed.
- **You get:** the daily Inbox with noise gone. Success metric: Inbox Zero achievable in <10 min/day.

## Phase 2 — Projects, Board, Today, OKR model, Reminders
- Areas + Projects (PARA), Kanban board (dnd-kit), Task creation from Items.
- OKR data model + OKR view (objectives, KR progress bars, confidence sparkline), project↔KR linking, governance flag for unlinked projects.
- Today view: top 3–5, blockers, waiting-on, quarter-health strip.
- Apple Reminders Shortcut bridge (two-way, 30 min).
- **You get:** every task connected to an objective; phone reminders flow in.

## Phase 3 — WhatsApp, Finance ledger, check-ins
- Meta Cloud API webhook → Upstash → brain; outbound templates via n8n; quiet hours.
- Finance: bank CSV import (ANZ/ASB/BNZ/Kiwibank/Westpac profiles), categorisation by brain + vendor memory, business/personal toggle views, receipt emails → transactions, recurring-cost detection, burn view, renewals 7 days ahead, nudges.
- OKR sessions: **daily check-in** (≤1 min: "one thing today" + any KR moves) and **weekly truth session** (actual vs target per KR, confidence, slipping KRs, 3 needle-movers → Today). Quarterly planning + retro facilitated flows.
- **You get:** pocket channel + a live burn number + honest weekly accountability.

## Phase 4 — Knowledge, Content, P&L, anomalies
- Knowledge repo ingest with frontmatter, Firestore vector search, portal library + notes. Notion import (optional, MCP available).
- Content engine: seeds → drafts in your voice → Content Kanban (Idea → Draft → Review → Scheduled → Published), Substack newsletter drafts, manual/CSV metrics for LinkedIn/X/Instagram/Substack.
- Finance: monthly/quarterly P&L, anomaly flags (>30 % category jump, new vendor over threshold, duplicates), monthly WhatsApp finance summary on the 1st, `financeSnapshots`.
- **You get:** content pipeline with a voice profile you build up over time, and a P&L.

## Phase 5 — Polish, learning, self-tracking, admin
- Keyboard shortcuts everywhere, optimistic UI audit, dark mode polish.
- Override-learning tuned (feedback → few-shot), governance flags in Today.
- Usage/cost self-tracking (`usageLogs` → "AI/API costs" category), `/admin` (users, usage, Pi heartbeat, DLQ).
- Data export (JSON + CSV), delete account.
- Multi-user readiness: brain runs per-user loops; plan to move brain + n8n to a VPS documented.

## Backlog
Voice notes (Whisper) · Akahu · Gmail OAuth · Social API connectors · Cloud host migration.
