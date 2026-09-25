# Architecture decisions (ADRs)

## ADR-001 — Claude Code CLI is the only reasoning engine
**Decision:** every AI call goes through `atlas-brain`, which shells out to `claude -p` in headless mode with `--output-format json`. Model is chosen per user per task in Settings → AI.
**Trade-offs accepted:** slower cold start (~1–3 s per call, mitigated by batching up to 25 items/call), JSON must be Zod-validated with one retry, and subscription-based auth is subject to plan rate limits. Switch to `ANTHROPIC_API_KEY` in the Pi `.env` at any time to bill per token instead.
**Rejected:** Anthropic SDK direct (user requirement), Ollama pre-filter (user requirement — deterministic rules replace it).

## ADR-002 — IMAP + app passwords for all mailboxes in v1
Both Gmail accounts and the other IMAP accounts use one code path (IMAP, app passwords). Gmail labels appear as folders, so "file" = move to `Atlas/Filed`. Gmail OAuth is deferred: in Google's "Testing" publishing status refresh tokens expire every 7 days, and verification for `gmail.modify` is a multi-week process only worth doing when opening sign-ups.

## ADR-003 — Apple Reminders via iPhone Shortcut, not CalDAV
Upgraded iCloud Reminders (iOS 13+) are not served over CalDAV. No always-on Mac exists. A time-triggered Shortcut automation (every 30 min) does two-way sync against portal API routes. Accepted latency: ≤30 min.

## ADR-004 — WhatsApp Business Cloud API (Meta) directly
Meta Business account already exists. Nudges outside the 24-h window use approved templates. Twilio rejected (extra cost, no benefit).

## ADR-005 — Board cards are Tasks only
An Item that you decide to "do" becomes a Task (linked both ways). One card type keeps drag-and-drop, ordering and Reminders sync simple.

## ADR-006 — Atlas is the ledger of record; bank CSV is the feed
No external accounting tool today. Weekly CSV imports from NZ banks (per-bank column profiles) with idempotent dedupe. `categories.externalCode` reserved for a future Xero/Hnry mapping. Akahu feed is backlog.

## ADR-007 — No Cloud Functions in v1
Server-side logic lives in Next.js route handlers (Admin SDK) and the Pi. Fewer moving parts, no Blaze-plan cold-start surprises. Blaze is still required for Cloud Storage default bucket on new projects.

## ADR-008 — Keyword index instead of vectors (v1)
The Claude CLI does not produce embeddings, and the "all AI via Claude CLI" rule rules out a local embedding model. Each knowledge doc therefore gets brain-generated `keywords[]` + `excerpt` at index time; the portal searches title/tags/keywords/body client-side (fine to a few thousand notes). Firestore vector search stays the upgrade path if an embedding source is ever allowed.

## ADR-009 — Upstash Redis Streams as the Vercel ↔ Pi bus
The Pi is never publicly reachable. Vercel route handlers enqueue jobs on `atlas:jobs`; the brain consumes via REST `XREADGROUP` with a consumer group, ACK-after-write, 3 retries then DLQ. Also used for prompt-output cache, per-user rate limits and Pi heartbeat. Rejected: Cloudflare Tunnel / Tailscale Funnel (exposes the Pi, more to maintain), Firestore-as-queue (works but the user chose Upstash; kept as a fallback).

## Backlog (explicitly parked)
Voice notes / transcription · Akahu bank feed · Notion second-brain import (MCP is available) · Gmail OAuth · LinkedIn/X/Instagram API metrics · Cloud host for brain when a second user is real.
