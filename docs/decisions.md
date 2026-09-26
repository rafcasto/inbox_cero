# Architecture decisions (ADRs)

## ADR-001 — Claude Code CLI is the only reasoning engine
**Decision:** every AI call goes through `atlas-brain`, which shells out to `claude -p` in headless mode with `--output-format json`. Model is chosen per user per task in Settings → AI.
**Trade-offs accepted:** slower cold start (~1–3 s per call, mitigated by batching up to 25 items/call), JSON must be Zod-validated with one retry, and subscription-based auth is subject to plan rate limits. Switch to `ANTHROPIC_API_KEY` in the Pi `.env` at any time to bill per token instead.
**Rejected:** Anthropic SDK direct (user requirement), Ollama pre-filter (user requirement — deterministic rules replace it).

## ADR-002 — One IMAP code path; Gmail via OAuth (XOAUTH2), others via app password
Every mailbox is an IMAP integration. Gmail accounts connect with one click through Google OAuth (`https://mail.google.com/` scope) and authenticate to IMAP with XOAUTH2 using a refresh token the Pi exchanges for short-lived access tokens; other providers use app passwords. Gmail labels appear as folders, so "file" = move to `Atlas/Filed`.
**Trap avoided:** in Google's "Testing" publishing status refresh tokens expire after 7 days. The consent screen must be set to **In production** (unverified is fine: Google shows a warning and caps the app at 100 users — acceptable for invite-only). Full verification is only needed if sign-ups open.

## ADR-003 — Apple Reminders via iPhone Shortcut, not CalDAV
Upgraded iCloud Reminders (iOS 13+) are not served over CalDAV. No always-on Mac exists. A time-triggered Shortcut automation (every 30 min) does two-way sync against portal API routes. Accepted latency: ≤30 min.

## ADR-004 — WhatsApp Business Cloud API (Meta) directly
Meta Business account already exists. Nudges outside the 24-h window use approved templates. Twilio rejected (extra cost, no benefit).

## ADR-005 — Board cards are Tasks only
An Item that you decide to "do" becomes a Task (linked both ways). One card type keeps drag-and-drop, ordering and Reminders sync simple.

## ADR-006 — Atlas is the ledger of record; bank CSV is the feed
No external accounting tool today. Weekly CSV imports from NZ banks (per-bank column profiles) with idempotent dedupe. `categories.externalCode` reserved for a future Xero/Hnry mapping. Akahu feed is backlog.

## ADR-007 — No Cloud Functions in v1
Server-side logic lives in Next.js route handlers (Admin SDK) and the Pi. Fewer moving parts, no Blaze-plan cold-start surprises. No Cloud Storage at all: files belong in the user's Google Drive (ADR-011).

## ADR-008 — Keyword index instead of vectors (v1)
The Claude CLI does not produce embeddings, and the "all AI via Claude CLI" rule rules out a local embedding model. Each knowledge doc therefore gets brain-generated `keywords[]` + `excerpt` at index time; the portal searches title/tags/keywords/body client-side (fine to a few thousand notes). Firestore vector search stays the upgrade path if an embedding source is ever allowed.

## ADR-009 — Upstash Redis Streams as the Vercel ↔ Pi bus
The Pi is never publicly reachable. Vercel route handlers enqueue jobs on `atlas:jobs`; the brain consumes via REST `XREADGROUP` with a consumer group, ACK-after-write, 3 retries then DLQ. Also used for prompt-output cache, per-user rate limits and Pi heartbeat. Rejected: Cloudflare Tunnel / Tailscale Funnel (exposes the Pi, more to maintain), Firestore-as-queue (works but the user chose Upstash; kept as a fallback).

## Backlog (explicitly parked)
Voice notes / transcription · Akahu bank feed · Notion second-brain import (MCP is available) · Gmail OAuth · LinkedIn/X/Instagram API metrics · Cloud host for brain when a second user is real.

## ADR-010 — Email, the OpenWorker way: non-destructive, privacy-filtered, 72-hour window
Mirrors `andrewyng/openworker`'s email connector principles:
- **Non-destructive by default.** Mail is fetched with PEEK (unread flags never flip) and Atlas never moves, flags or deletes messages unless `profile.email.mirrorToMailbox` is switched on. Filing/ignoring is an Atlas status — reversible with one click — so it is `write_local`, not `external`, and needs no reviewer.
- **"Never show agents" filters.** `addr@x.com` (exact) or `@domain.com` (suffix) rules are enforced at ingestion: matching messages are never stored and never reach a prompt; the audit row records rule + count, never content.
- **Bounded window.** `profile.email.lookbackHours` (default **72**) bounds everything: the first sync (`SINCE`), polling, what the Inbox shows, what "Ask about my mail" can see, and a nightly `mail.expire` job that auto-files anything older still sitting in the Inbox (tag `expired`, findable under Filed). The agent never has a growing backlog to reason over.
- **Ask, don't browse.** `mail.ask` answers questions over the window with citations and *suggested* actions only — the coworker experience without the agent ever acting on mail by itself. Sending remains a hard floor.

## ADR-011 — Files live in Google Drive, never in Firebase Storage
Firebase holds structured data only. Every file (WhatsApp photos, receipts, documents the agent works on) lands in the user's own Drive folder (`<parent>/<slug>/…`, shared with them) and is mirrored into their Pi project directory. Removes the Blaze-plan dependency and keeps files where the user already manages them. Item/transaction records reference files as `drive:<fileId>`.
