# n8n workflows

n8n owns **schedules and triggers**; every workflow here just enqueues a job on the Pi brain (`POST $ATLAS_BRAIN_URL/jobs`) with `userId: "*"`, which the brain fans out to every active user. No business logic lives in n8n.

## Import
1. n8n → Settings → Variables: add `ATLAS_BRAIN_URL` = `http://172.17.0.1:8787` (Docker bridge gateway → host). If n8n runs on the host, use `http://localhost:8787`.
2. n8n → Credentials → new **Header Auth**: name `Atlas brain bearer`, header `Authorization`, value `Bearer <ATLAS_BRAIN_TOKEN>`.
3. Import each JSON (Workflows → Import from file), open, select that credential on the HTTP nodes if not auto-linked, **activate**.
   Or run `scripts/setup.sh` which imports them through the n8n API.

| File | What | When (Pacific/Auckland) |
|---|---|---|
| 01-email-poll | IMAP poll → triage | every 2 min |
| 02-daily | finance snapshot, KR auto-update, governance flags, daily check-in, digest | 06:15 / 06:30 / 06:35 / hourly (gated to each user's configured time) / 08:00 |
| 03-weekly | weekly truth session, receipts nudge, unreviewed nudge, recurring detect, renewals | hourly (gated to each user's day+time) / Fri 16:00 / Sun 18:00 / Sun 19:00 / daily 09:00 |
| 04-monthly | monthly finance summary, income nudge, monthly review, quarterly retro + planning | 1st 09:00 / 1st 10:00 / 1st 08:30 / quarter start |
| 05-health | brain heartbeat check | every 5 min |

Per-user times (daily/weekly check-in) are also stored in the profile; the brain skips users whose local time doesn't match within the hour, so one global cron serves everyone.
