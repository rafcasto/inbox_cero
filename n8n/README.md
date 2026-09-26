# n8n workflows

n8n owns **schedules and triggers**; every workflow here just enqueues a job on the Pi brain (`POST $ATLAS_BRAIN_URL/jobs`) with `userId: "*"`, which the brain fans out to every active user. No business logic lives in n8n.

## Import (automatic)
`sudo bash scripts/setup.sh --n8n` imports the credential and all workflows through the n8n CLI inside the Docker container (no API key needed) and activates them. The brain URL is `http://172.17.0.1:8787` (Docker bridge gateway → host); edit the HTTP nodes if your n8n runs elsewhere.

## Import (manual)
1. n8n → Credentials → new **Header Auth**: name `Atlas brain bearer`, header `Authorization`, value `Bearer <ATLAS_BRAIN_TOKEN>`.
2. Import each JSON (Workflows → Import from file), select that credential on the HTTP nodes if not auto-linked, **activate**.

| File | What | When (Pacific/Auckland) |
|---|---|---|
| 01-email-poll | IMAP poll → triage | every 2 min |
| 02-daily | finance snapshot, KR auto-update, governance flags, daily check-in, digest, mail expire (72 h window) | 06:15 / 06:30 / 06:35 / hourly (gated to each user's configured time) / 08:00 |
| 03-weekly | weekly truth session, receipts nudge, unreviewed nudge, recurring detect, renewals | hourly (gated to each user's day+time) / Fri 16:00 / Sun 18:00 / Sun 19:00 / daily 09:00 |
| 04-monthly | monthly finance summary, income nudge, monthly review, quarterly retro + planning | 1st 09:00 / 1st 10:00 / 1st 08:30 / quarter start |
| 05-health | brain heartbeat check | every 5 min |
| 06-drive | Drive pull / push | every 15 min / hourly |
| 07-automations | per-user automations tick (daily digest, custom jobs — Settings → Automations) | hourly at :02 |

Per-user times (daily/weekly check-in) are also stored in the profile; the brain skips users whose local time doesn't match within the hour, so one global cron serves everyone.
