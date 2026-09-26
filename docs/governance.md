# Governance — how Atlas decides what it may do on its own

Modelled on OpenWorker's "governed by design" (andrewyng/openworker): governance is the architecture, not a prompt. The brain cannot grant itself new permissions, and no message can talk it past a gate.

## 1. Hard floors (human-only, in every mode)
`email.send` · `email.delete` · `content.publish` · `money.move` · `account.delete` · `integration.credentials`
The brain has **no handler** for these. `runJob` refuses them even if something enqueues them, and logs `approval: floor`. Mail is only ever *moved* into `Atlas/Filed` or `Atlas/Ignored` — never deleted. Content leaves the Content Kanban only when you copy it out.

## 2. Risk classes
Every unattended action carries a class: `read` < `egress` (messages *you*) < `external` (touches your mailbox / phone reminders) < `write_local` (creates Atlas data you'll see and can undo). Only `external` actions are gated; `write_local` and `egress`-to-owner are always allowed because you are the audience.

## 3. Permission modes (Settings → Governance)
| mode | external actions (auto-file / auto-ignore mail) |
|---|---|
| `ask` | never executed unattended — every one becomes an **Ask** |
| `reviewed-auto` (default) | high-confidence (≥ `reviewThreshold`) + standing rule → executed; otherwise a **reviewer model** judges each proposal `allow / deny / unsure`; `unsure` and `deny` park an Ask |
| `auto` | executed when confidence ≥ threshold or a standing rule matches; below threshold → reviewer |

The reviewer is a separate, cheaper Claude call with your *approval guidance* (what's normal, what's out of bounds) and your standing rules. Its verdicts are judgments, not guarantees — the floors and the audit trail are the backstop.

## 4. Ladder of earned autonomy
one-off approval → standing rule → allowlist
- Approving the same action for the same sender domain 3 times makes Atlas **propose a standing rule** (an Ask: "Always auto-file receipts from vercel.com?").
- Standing rules live in `profile.governance.allow` and are visible/revocable in Settings.

## 5. Circuit breaker
If you override ≥ `breaker.overrides` auto-actions within `breaker.windowDays` (restoring filed/ignored mail to the Inbox), autonomy **pauses**: nothing external runs unattended until you answer the "resume autonomy?" Ask. Pause state is visible on Today and in Settings.

## 6. Asks — unattended runs never self-approve
Anything the brain isn't allowed to decide becomes an `asks/{id}` doc with numbered options. They surface as **Needs your decision** on Today and as a WhatsApp message (`1`, `2`… replies answer them). Answering executes the parked action (`ask.answer` job) and records `approval: user`.

## 7. Audit with provenance
Every `audit` row now carries `riskClass`, `approval` (`auto | reviewer | user | rule | floor | denied | paused`) and, for reviewer decisions, its reason. The Today feed shows the badge; `/admin` shows denials and floor hits per user.
