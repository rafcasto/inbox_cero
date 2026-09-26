import { z } from 'zod';
import { TriageInputItem } from './items';

/** Every job on the Upstash stream `atlas:jobs`. */
export const JobType = z.enum([
  'email.poll',
  'email.act',
  'triage.items',
  'reply.draft',
  'finance.categorize',
  'finance.receipt',
  'finance.snapshot',
  'content.draft',
  'session.prep',
  'session.turn',
  'whatsapp.inbound',
  'reminders.sync',
  'knowledge.index',
  'kr.autoupdate',
  'recurring.detect',
  'governance.flags',
  'nudge.finance',
  'finance.monthly',
  'session.start',
  'digest.daily',
  'ask.answer',
  'governance.review',
]);
export type JobType = z.infer<typeof JobType>;

export const Job = z.object({
  id: z.string().optional(),
  userId: z.string(),
  type: JobType,
  payload: z.record(z.any()).default({}),
  enqueuedAt: z.string(),
  idempotencyKey: z.string(),
  attempts: z.number().int().default(0),
  model: z.string().optional(),
});
export type Job = z.infer<typeof Job>;

export const BrainRunRequest = z.object({
  userId: z.string(),
  task: z.string(),
  input: z.record(z.any()).default({}),
  model: z.string().optional(),
  idempotencyKey: z.string().optional(),
});
export type BrainRunRequest = z.infer<typeof BrainRunRequest>;

export const BrainRunResponse = z.object({
  ok: z.boolean(),
  task: z.string(),
  model: z.string().optional(),
  output: z.any().optional(),
  error: z.string().optional(),
  usage: z.object({ tokensIn: z.number(), tokensOut: z.number(), costUsd: z.number(), durationMs: z.number() }).optional(),
  cached: z.boolean().default(false),
});
export type BrainRunResponse = z.infer<typeof BrainRunResponse>;

export const TriageJobPayload = z.object({ items: z.array(TriageInputItem).max(25) });

export const WhatsAppInbound = z.object({
  from: z.string(),
  messageId: z.string(),
  timestamp: z.string(),
  type: z.enum(['text', 'image', 'audio', 'document', 'interactive', 'button', 'unknown']),
  text: z.string().optional(),
  mediaId: z.string().optional(),
  mediaMime: z.string().optional(),
  caption: z.string().optional(),
});
export type WhatsAppInbound = z.infer<typeof WhatsAppInbound>;

export const WhatsAppCommandOutput = z.object({
  intent: z.enum(['kr_update', 'task_done', 'task_add', 'idea', 'receipt', 'today', 'status', 'session_reply', 'ask_reply', 'capture', 'unknown']),
  askOption: z.string().nullable().default(null),
  keyResultRef: z.string().nullable().default(null),
  value: z.number().nullable().default(null),
  confidence: z.number().int().min(0).max(10).nullable().default(null),
  text: z.string().nullable().default(null),
  reply: z.string(),
});
export type WhatsAppCommandOutput = z.infer<typeof WhatsAppCommandOutput>;

export const ReminderPush = z.object({
  token: z.string(),
  reminders: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      notes: z.string().optional().default(''),
      list: z.string().optional().default(''),
      dueDate: z.string().optional(),
      completed: z.boolean().default(false),
      modified: z.string().optional(),
    }),
  ),
});
export type ReminderPush = z.infer<typeof ReminderPush>;
