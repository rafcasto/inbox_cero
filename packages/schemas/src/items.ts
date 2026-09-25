import { z } from 'zod';
import { Priority, TriageAction, ItemStatus, IsoDate } from './common';

export const ItemSource = z.object({
  type: z.enum(['email', 'reminder', 'whatsapp', 'manual']),
  integrationId: z.string().default('manual'),
  externalId: z.string(),
  threadId: z.string().optional(),
});

export const Triage = z.object({
  priority: Priority,
  action: TriageAction,
  suggestedProjectId: z.string().nullable().default(null),
  suggestedAreaId: z.string().nullable().default(null),
  dueAt: z.string().nullable().default(null),
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(400),
  isReceipt: z.boolean().default(false),
  isContentSeed: z.boolean().default(false),
  model: z.string().optional(),
  promptVersion: z.string().optional(),
});
export type Triage = z.infer<typeof Triage>;

export const Item = z.object({
  id: z.string(),
  userId: z.string(),
  source: ItemSource,
  dedupeKey: z.string(),
  receivedAt: IsoDate,
  ingestedAt: IsoDate,
  raw: z.object({
    subject: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
    snippet: z.string().default(''),
    storagePath: z.string().optional(),
  }),
  summary: z.string().default(''),
  triage: Triage.optional(),
  ruleHit: z.object({ ruleId: z.string(), effect: z.string() }).optional(),
  status: ItemStatus.default('new'),
  decision: z
    .object({
      action: TriageAction,
      projectId: z.string().optional(),
      priority: Priority.optional(),
      decidedAt: IsoDate,
      overrode: z.boolean(),
    })
    .optional(),
  linkedTaskId: z.string().optional(),
  linkedTransactionId: z.string().optional(),
  linkedContentId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  snoozedUntil: IsoDate.optional(),
});
export type Item = z.infer<typeof Item>;

/** Minimal shape the brain needs to triage one email. */
export const TriageInputItem = z.object({
  id: z.string(),
  from: z.string().default(''),
  to: z.string().default(''),
  subject: z.string().default(''),
  receivedAt: z.string(),
  snippet: z.string().max(4000),
  hasListUnsubscribe: z.boolean().default(false),
  source: z.enum(['email', 'reminder', 'whatsapp', 'manual']).default('email'),
});
export type TriageInputItem = z.infer<typeof TriageInputItem>;

export const TriageBatchOutput = z.object({
  results: z.array(Triage.extend({ id: z.string(), summary: z.string().max(300) })),
});
export type TriageBatchOutput = z.infer<typeof TriageBatchOutput>;

export const Feedback = z.object({
  itemId: z.string(),
  suggested: z.object({ priority: Priority, action: TriageAction, projectId: z.string().nullable() }),
  actual: z.object({ priority: Priority, action: TriageAction, projectId: z.string().nullable() }),
  features: z.object({
    fromDomain: z.string().default(''),
    fromEmail: z.string().default(''),
    subjectTerms: z.array(z.string()).default([]),
  }),
  createdAt: IsoDate,
});
export type Feedback = z.infer<typeof Feedback>;
