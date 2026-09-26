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
  'mail.ask',
  'mail.expire',
  'user.provision',
  'user.deprovision',
  'drive.provision',
  'drive.pull',
  'drive.push',
  'project.provision',
  'project.backfill',
  'project.files',
  'project.run',
  'file.move',
  'automations.tick',
  'digest.compose',
  'email.sendSelf',
  'project.chat',
  'file.put',
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

export const MailAskOutput = z.object({
  answer: z.string(),
  citations: z.array(z.object({ itemId: z.string(), why: z.string().max(120) })).default([]),
  suggestedActions: z.array(z.object({ itemId: z.string(), action: z.enum(['reply', 'do', 'delegate', 'file', 'ignore']), why: z.string().max(120) })).default([]),
});
export type MailAskOutput = z.infer<typeof MailAskOutput>;

/** Result of the privileged provisioning job, stored on users/{uid}.provisioning. */
export const Provisioning = z.object({
  status: z.enum(['pending', 'ok', 'error']),
  slug: z.string(),
  linuxUser: z.string().optional(),
  home: z.string().optional(),
  projectsPath: z.string().optional(),
  inboxPath: z.string().optional(),
  driveFolderId: z.string().optional(),
  driveInboxFolderId: z.string().optional(),
  driveError: z.string().optional(),
  driveLastPullAt: z.string().optional(),
  error: z.string().optional(),
  at: z.string(),
});
export type Provisioning = z.infer<typeof Provisioning>;

/** Deterministic, filesystem-safe slug from an email + uid. */
export const userSlug = (email: string, uid: string) => {
  const local = email.split('@')[0]!.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 16) || 'user';
  return `${local}-${uid.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6)}`;
};

/** Every automated action, file move and job run (the "events table"; stored in users/{uid}/audit). */
export const ActionType = z.enum(['agent.run', 'file.move', 'file.pull', 'file.push', 'job.run', 'triage', 'provision', 'governance', 'finance', 'session', 'content', 'system']);
export type ActionType = z.infer<typeof ActionType>;

export const ProjectRun = z.object({
  id: z.string(),
  projectId: z.string(),
  prompt: z.string(),
  result: z.string().default(''),
  sessionId: z.string().optional(),
  model: z.string().optional(),
  costUsd: z.number().default(0),
  durationMs: z.number().default(0),
  status: z.enum(['running', 'ok', 'error']),
  error: z.string().optional(),
  at: z.string(),
  filesChanged: z.array(z.string()).default([]),
});
export type ProjectRun = z.infer<typeof ProjectRun>;

/** A scheduled, non-interactive job owned by a user — configuration, not code. */
export const AutomationType = z.enum(['daily.digest', 'weekly.finance', 'weekly.truth', 'daily.checkin', 'content.ideas', 'kr.nudge', 'drive.sync', 'custom.prompt']);
export type AutomationType = z.infer<typeof AutomationType>;
export const Automation = z.object({
  id: z.string(),
  type: AutomationType,
  name: z.string(),
  enabled: z.boolean().default(true),
  /** "HH:MM" local time; runs once in that hour. */
  time: z.string().default('07:00'),
  /** 0-6 (Sun-Sat); empty = every day. */
  days: z.array(z.number().int().min(0).max(6)).default([]),
  channels: z.array(z.enum(['inbox', 'email', 'whatsapp', 'drive'])).default(['inbox', 'email']),
  config: z.record(z.any()).default({}),
  lastRunAt: z.string().optional(),
  lastResult: z.string().optional(),
  lastStatus: z.enum(['ok', 'error']).optional(),
});
export type Automation = z.infer<typeof Automation>;

export const DigestPlan = z.object({
  headline: z.string().max(120),
  needsAttention: z.array(z.object({ id: z.string(), why: z.string().max(100) })).max(8),
  requestBodies: z.array(z.string()).max(5),
  noiseCount: z.number().int(),
});
export type DigestPlan = z.infer<typeof DigestPlan>;
export const DigestOutput = z.object({
  markdown: z.string(),
  oneLiner: z.string().max(200),
  actions: z.array(z.object({ title: z.string(), itemId: z.string().nullable(), due: z.string().nullable() })).max(6),
});
export type DigestOutput = z.infer<typeof DigestOutput>;

/** Interactive per-project chat. chats/{chatId} + chats/{chatId}/messages/{id}; the brain streams into message docs. */
export const Chat = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string().default('New conversation'),
  sessionId: z.string().nullable().default(null),
  status: z.enum(['idle', 'running', 'error']).default('idle'),
  createdAt: z.string(),
  updatedAt: z.string(),
  turns: z.number().int().default(0),
  costUsd: z.number().default(0),
});
export type Chat = z.infer<typeof Chat>;
export const ChatMessage = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant', 'tool', 'system']),
  content: z.string().default(''),
  status: z.enum(['streaming', 'done', 'error']).default('done'),
  seq: z.number(),
  at: z.string(),
  toolName: z.string().optional(),
  toolInput: z.string().optional(),
  toolResult: z.string().optional(),
  toolOk: z.boolean().optional(),
  costUsd: z.number().optional(),
  durationMs: z.number().optional(),
  model: z.string().optional(),
});
export type ChatMessage = z.infer<typeof ChatMessage>;
