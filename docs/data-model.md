# Atlas — Firestore data model

All user data is nested under `users/{uid}`. Field types are the Zod schemas in `packages/schemas` (single source of truth for portal, brain, n8n payloads). Timestamps are Firestore `Timestamp`. IDs are auto-IDs unless stated.

## Top-level

### `users/{uid}`
| field | type | notes |
|---|---|---|
| email, displayName, photoURL | string | from Auth |
| createdAt, lastSeenAt | ts | |
| timezone | string | default `Pacific/Auckland`, browser-detected at signup |
| onboardingComplete | bool | |
| invitedBy, inviteCode | string | |
| status | `active` \| `disabled` | |

### `invites/{code}`
`email?`, `createdBy`, `createdAt`, `expiresAt`, `usedBy?`, `usedAt?`. Readable by signed-in users only for their own code lookup (via server route), writable by admin.

## Per-user subcollections (`users/{uid}/...`)

### `profile/main` (single doc, injected into every prompt)
```ts
{
  identity: { name, roles: string[], bio, currentPriorities: string[] },
  workingHours: { start: "08:00", end: "18:00", days: [1,2,3,4,5] },
  priorityRules: [{ id, match: { fromDomain?|fromEmail?|subjectContains?|keyword? },
                    effect: { priority?: "P0"|"P1"|"P2"|"P3", action?: "ignore"|"file"|"surface" }, note }],
  noise: { neverSurface: string[], alwaysSurface: string[] },     // free-text seeds
  voice: { tone, styleNotes, examples: [{ platform, text }], avoidWords: string[] },
  finance: { currency: "NZD", gstRegistered: bool, gstRate: 0.15, defaultScope: "business"|"personal",
             vendorDefaults: { [vendorNormalized]: "business"|"personal" },
             anomaly: { categoryJumpPct: 30, newVendorThreshold: 200, duplicateWindowDays: 3 },
             nudges: { receipts: "weekly"|"off", income: "monthly"|"off", unreviewed: "weekly"|"off" } },
  okr: { quarterStart: "calendar"|"april", daily: { time: "07:30" }, weekly: { day: 1, time: "08:00" },
         channel: "whatsapp"|"portal", style: "conversational"|"prefilled" },
  ai: { models: { triage: "claude-haiku-4-5", drafting: "...", sessions: "...", summaries: "..." },
        dailyCallBudget: 500 },
  whatsapp: { number, quietHours: { start: "21:00", end: "07:00" } },
  para: { defaultAreaId }
}
```

### `integrations/{id}`
`type` (`imap` | `reminders` | `whatsapp` | `substack` | `x` | `linkedin` | `instagram`), `label`, `enabled`, `config` (host, port, user, folders, pollFolder, filedFolder — nothing secret), **`secret`** (AES-256-GCM ciphertext + iv + tag; key = `ATLAS_MASTER_KEY` on the Pi, never in Firestore), `cursor` (last UID / last sync), `lastSyncAt`, `lastError`, `createdAt`.

### `items/{id}` — the universal inbox record
| field | type |
|---|---|
| source | `{ type: "email"\|"reminder"\|"whatsapp"\|"manual", integrationId, externalId, threadId? }` |
| dedupeKey | sha256(uid + source.type + integrationId + externalId) — also used as doc ID |
| receivedAt, ingestedAt | ts |
| raw | `{ subject?, from?, to?, snippet, body?, storagePath? }` (body inline, capped; attachments referenced as `drive:<fileId>`) |
| summary | string (brain) |
| triage | `{ priority: "P0".."P3", action: "reply"\|"do"\|"delegate"\|"file"\|"ignore", suggestedProjectId?, suggestedAreaId?, dueAt?, confidence: 0..1, model, promptVersion, reasoning }` |
| ruleHit | `{ ruleId, effect }` when a deterministic rule decided instead of the brain |
| status | `new` \| `triaged` \| `confirmed` \| `done` \| `filed` \| `ignored` \| `snoozed` |
| decision | `{ action, projectId?, priority?, decidedAt, overrode: bool }` |
| linkedTaskId, linkedTransactionId, linkedContentId | string? |
| tags | string[] |
| snoozedUntil | ts? |

### `feedback/{id}` — learning from overrides
`itemId`, `suggested: {priority, action, projectId}`, `actual: {...}`, `features: { fromDomain, fromEmail, subjectTerms[] }`, `createdAt`. The brain injects the last 30 relevant signals (same domain/sender first) into triage prompts.

### PARA
- `areas/{id}`: `name`, `description`, `isMaintenance`, `order`, `archived`.
- `projects/{id}`: `name`, `goal`, `areaId`, `status` (`active`\|`paused`\|`done`\|`archived`), `nextAction`, `keyResultIds[]`, `isMaintenance`, `notes`, `trackCosts`, `order`, `createdAt`, `completedAt?`.
  Governance flag when `keyResultIds` is empty and `!isMaintenance`.
- `tasks/{id}` — Board cards: `title`, `projectId?`, `column` (`backlog`\|`thisWeek`\|`inProgress`\|`waitingOn`\|`done`), `order`, `priority`, `dueAt?`, `waitingOn?` (person), `sourceItemId?`, `sessionId?`, `syncToReminders`, `reminderExternalId?`, `completedAt?`.
  *Simplification vs brief:* Board shows Tasks only; an Item's "do" decision creates a Task linked back to it. Avoids two card types.

### OKRs
- `objectives/{id}`: `title`, `quarter` (`"2026-Q4"`), `description`, `order`, `status` (`active`\|`done`\|`dropped`), `grade?` (0–1), `retroNotes?`.
- `keyResults/{id}`: `objectiveId`, `title`, `metric`, `unit`, `baseline`, `target`, `current`, `direction` (`up`\|`down`), `confidence` (0–10), `autoSource?` (`{ type: "ledgerCategoryTotal"\|"tasksCompleted"\|"contentPublished"\|"manual", config }`), `updatedAt`.
- `krUpdates/{id}`: `keyResultId`, `value`, `confidence`, `source` (`manual`\|`whatsapp`\|`auto`\|`session`), `note`, `at`.
- `sessions/{id}`: `type` (`daily`\|`weekly`\|`monthly`\|`quarterlyPlan`\|`retro`), `scheduledFor`, `startedAt`, `completedAt`, `channel`, `prep` (brain-generated brief), `transcript[] {role, content, at}`, `decisions[]`, `actionsCreated[] {taskId}`, `summary`, `status`.

### Finance
- `categories/{id}`: `name`, `parentId?`, `defaultScope`, `order`, `externalCode?` (for a future Xero/Hnry mapping).
- `transactions/{id}`: `date`, `amount` (signed, negative = spend), `currency`, `amountNzd`, `fxRate`, `vendor`, `vendorNormalized`, `description`, `categoryId?`, `scope` (`business`\|`personal`), `projectId?`, `gst { treatment: "inclusive"\|"exclusive"\|"none", amount }`, `receiptPath?`, `source { type: "bankImport"\|"receiptEmail"\|"whatsapp"\|"manual", importId?, itemId? }`, `dedupeKey` (sha256 account+date+amount+description → doc ID), `reviewed`, `recurringCostId?`, `tags[]`.
- `bankAccounts/{id}`: `bankProfile` (`anz`\|`asb`\|`bnz`\|`kiwibank`\|`westpac`\|`generic`), `label`, `scope`, `last4`.
- `bankImports/{id}`: `bankAccountId`, `fileName`, `storagePath`, `rows`, `imported`, `duplicates`, `importedAt`.
- `recurringCosts/{id}`: `vendor`, `amount`, `currency`, `cycle` (`monthly`\|`annual`\|`weekly`), `nextRenewalAt`, `categoryId`, `projectId?`, `status` (`candidate`\|`active`\|`cancelled`), `lastSeenAt`, `evidenceTransactionIds[]`, `usageFlag?` (`unused60d`).
- `financeSnapshots/{yyyy-MM}`: `income`, `spend`, `net`, `byCategory {id: amount}`, `byProject`, `byScope`, `runRate`, `trailing3`, `trailing12`, `anomalies[]`, `computedAt`.
- `usageLogs/{id}`: `at`, `service` (`claude`\|`whatsapp`\|`vercel`\|…), `model?`, `task`, `tokensIn`, `tokensOut`, `costUsd`, `refId?`. Aggregated daily into `financeSnapshots` under the "AI/API costs" category.

### Content
- `content/{id}`: `platform` (`linkedin`\|`x`\|`instagram`\|`newsletter`), `stage` (`idea`\|`draft`\|`review`\|`scheduled`\|`published`), `title`, `body`, `seeds[] { type: "item"\|"knowledge"\|"reminder", refId }`, `scheduledFor?`, `publishedAt?`, `publishedUrl?`, `metrics? { impressions, likes, comments, shares, subscribers }`.
- `contentMetrics/{id}`: `platform`, `date`, `followers`, `impressions`, `engagement`, `source` (`manual`\|`csv`\|`api`). Weekly manual/CSV until API connectors exist.

### Knowledge
- `knowledge/{id}`: `title`, `tags[]`, `source` (`repo`\|`note`\|`retro`\|`notion`), `date`, `path?`, `contentHash`, `excerpt`, `body`, `embedding` (Firestore vector field, 768-d), `updatedAt`.

### `audit/{id}`
`at`, `actor` (`brain`\|`n8n`\|`portal`\|`user`), `action`, `target { collection, id }`, `reason`, `promptVersion?`, `model?`, `costUsd?`. Rendered in the portal as the activity feed. Never deleted by the app.

## Security rules (summary — full text in `firebase/firestore.rules`)
```
match /users/{uid} {
  allow read, update: if isOwner(uid);
  allow create: if isOwner(uid) && validNewUser();
  match /{sub}/{doc=**} { allow read, write: if isOwner(uid) && verified(); }
  // exceptions: audit and usageLogs are read-only for the owner (server writes only)
  match /audit/{id}     { allow read: if isOwner(uid); allow write: if false; }
  match /usageLogs/{id} { allow read: if isOwner(uid); allow write: if false; }
}
match /invites/{code} { allow read, write: if isAdmin(); }
match /{document=**}  { allow read, write: if false; }
function isOwner(uid) { return request.auth != null && request.auth.uid == uid; }
function verified()   { return request.auth.token.email_verified == true; }
function isAdmin()    { return request.auth.token.admin == true; }
```
There is no Firebase Storage: files live in each user's Google Drive folder (shared only with them and the service account) and in their Pi project directory.

Emulator tests (`firebase/tests/rules.test.ts`) prove: user A cannot read/list/write any doc under `users/B`; unverified users cannot read subcollections; nobody can write `audit`/`usageLogs` from the client; anonymous gets nothing.

## Indexes (initial)
- `items`: `(status, receivedAt desc)`, `(status, triage.priority, receivedAt desc)`
- `tasks`: `(column, order)`, `(projectId, column)`
- `transactions`: `(date desc)`, `(categoryId, date)`, `(reviewed, date)`, `(scope, date)`
- `content`: `(stage, updatedAt desc)`
- `knowledge`: vector index on `embedding`
