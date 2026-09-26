# Google Drive scoping (Phase 2)

- **Owner's parent folder** ("Open Cowork") is yours; it is shared with the Firebase service account (`firebase-adminsdk-fbsvc@…`) as *writer* and its ID is `ATLAS_DRIVE_PARENT_FOLDER_ID` on the Pi.
- **On signup** (`user.provision` → `drive.provision`): the service account creates `<parent>/<slug>/` and `<parent>/<slug>/inbox/` and shares `<slug>/` with the user's Google email (writer). IDs are stored on `users/{uid}.provisioning`. If Drive isn't enabled yet, Linux provisioning still succeeds and the Drive step is retried from Settings or `/admin`.
- **Scope enforcement:** the brain only ever addresses a user's own `driveFolderId` subtree; it never lists the parent for sync. (Tip: once every user folder is shared with the service account you may remove its access to the parent — provisioning then needs your OAuth token instead; ask and I'll wire it.)
- **Pull** every 15 min (`n8n/06-drive.json`): new/changed files (by md5) under `<slug>/<sub>/` → `~/projects/<sub>/`, `<slug>/inbox/` and loose files → `~/projects/inbox/`. A Drive subfolder becomes an Atlas project automatically. Google Docs/Sheets/Slides export as `.md`/`.csv`/`.pdf`. Files are written **as the user** via `atlas-run`, so ownership is theirs.
- **Push** hourly: files created or changed on the Pi in `projects/*` (≤ 25 MB, not dotfiles) upload to the matching Drive folder; unchanged files are skipped by md5. The map lives in `users/{uid}/driveFiles/{fileId}`.
- **Moving** a file between projects (Phase 3) updates both sides using this map.
