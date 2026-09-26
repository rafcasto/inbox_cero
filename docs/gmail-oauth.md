# Connect Gmail with one click (OAuth)

## One-time: create the Google OAuth client (≈5 minutes)
1. https://console.cloud.google.com/apis/credentials?project=inboxcero-1b7a9 → **Create credentials → OAuth client ID**. If asked, configure the consent screen first:
   - User type **External**, app name *Atlas*, your support email, developer email.
   - Scopes → *Add or remove scopes* → paste `https://mail.google.com/` → Update. Save.
   - **Publishing status → Publish app** (this is the important bit: "Testing" expires refresh tokens after 7 days). Skip verification; Google will show "unverified app" on consent — click *Advanced → Go to Atlas*.
2. Application type **Web application**, name *Atlas portal*.
   Authorised redirect URI: `https://<your-vercel-domain>/api/oauth/google/callback` (and `http://localhost:3000/api/oauth/google/callback` for local dev).
3. Copy the **Client ID** and **Client secret** into:
   - Vercel env vars `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` (mark secret as sensitive) → redeploy
   - Pi `.env` (same names) → `sudo systemctl restart atlas-brain`
4. Enable the Gmail API for the project (only needed for the consent flow): https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=inboxcero-1b7a9

## Every account
Settings → Integrations → **Connect a Gmail account** → pick the account → allow. Repeat per Gmail. Each becomes an IMAP/XOAUTH2 mailbox; the refresh token is AES-encrypted in Firestore and only the Pi can use it. Revoke any time at https://myaccount.google.com/permissions.

## Non-Gmail mailboxes
Settings → Integrations → *Other mailbox* → host, user, app password.
