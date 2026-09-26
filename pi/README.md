# Pi privileged layer

| Path (installed) | Role |
|---|---|
| `/usr/local/sbin/atlas-provision <uid> <slug> <email>` | creates `u-<slug>` (nologin, home 750, group `atlas-users`), `projects/inbox`, templated Claude config; grants the `atlas` service user ACLs on `projects/` only |
| `/usr/local/sbin/atlas-run <slug> <cwd> -- cmd…` | runs one command **as** that user, cwd pinned inside their `projects/`, clean env, subscription token injected from `/etc/atlas/env` |
| `/usr/local/sbin/atlas-deprovision <slug> [--purge]` | lock; purge archives the home to `/var/backups/atlas/deprovisioned` then deletes |
| `/usr/local/sbin/atlas-backup.sh` + `atlas-backup.timer` | 02:30 nightly: homes, `/etc/atlas`, Firestore JSON export; 7-day rotation; optional rclone |
| `/etc/sudoers.d/atlas` | `atlas` → exactly the three helpers, NOPASSWD, env stripped |
| `/etc/atlas/env` (root 0600) | `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, `ATLAS_DEFAULT_MODEL` |
| `/etc/atlas/templates/claude/` | settings.json, mcp.json, CLAUDE.md copied into new homes (no credentials) |
| `/opt/atlas` | production checkout owned by `atlas`; dev stays in your own home |

Isolation is kernel permissions: homes are `750`, the service user has `x` on the home and `rwx` (with default ACL) on `projects/` only. It cannot read `~/.claude` of any user.
