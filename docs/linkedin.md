# LinkedIn, Kit & the publisher adapters (Phase 6)

## Principle
Publishing is a **human click**, always. The agent drafts in your voice; `content.publish` stays a hard floor for anything unattended. The buttons on a Review-stage piece enqueue `linkedin.publish` / `newsletter.publish` with `approval: user`.

## LinkedIn — one-time app setup
1. https://www.linkedin.com/developers/apps → **Create app** (needs a LinkedIn Page to associate; a personal one is fine).
2. **Products** tab → request **Share on LinkedIn** and **Sign In with LinkedIn using OpenID Connect** (both self-serve, instant). Optionally apply for **Community Management API** (approval process) — this unlocks post analytics.
3. **Auth** tab → Authorized redirect URL: `https://<your-portal>/api/oauth/linkedin/callback`. Copy **Client ID** and **Client Secret**.
4. Set `LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET` in Vercel **and** `/opt/atlas/.env` (restart `atlas-brain`). When analytics is approved, set `LINKEDIN_ANALYTICS_ENABLED=1` in both and reconnect once (adds the `r_member_postAnalytics` scope).

## Per user
Settings → Integrations → **Connect LinkedIn**. Tokens (access 60 d, refresh 365 d) are sealed in Firestore; the daily `linkedin.refresh` automation renews the access token from day 50 and parks a reminder ask 25 days before the yearly re-consent.

## Publishing
Content → open a Review/Scheduled piece → **Publish to LinkedIn** (platform = linkedin) or **Create Kit draft** (platform = newsletter). Each publish stores a version snapshot, the post URN/URL (`publishedTo`), moves the piece to Published, and writes a `content` event. A per-user counter enforces LinkedIn's ~100 calls/day.

## Analytics (feature-flagged)
`linkedin.analytics` (daily 06:00) pulls impressions, reach, reactions, comments, reposts per published post via `memberCreatorPostAnalytics` into `contentMetrics` and onto the piece (visible on Content and 360). Until approval, the job reports `skipped` and manual/CSV metrics remain.

## Kit
Settings → Integrations → paste your Kit v4 API key (sealed). `newsletter.publish` creates a **draft** broadcast (`public: false`, no `send_at`) — you review and send in Kit.

## Other channels
`apps/brain/src/publishers/` — one file per channel implementing `Publisher.publish()`; register it and add a button. X and Instagram are stubs by design (paid/gated APIs); Substack has no API — copy from the piece.
