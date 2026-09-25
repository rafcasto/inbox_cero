import { z } from 'zod';
import { BoardColumn, Priority, IsoDate, SessionType } from './common';

export const Area = z.object({
  id: z.string(),
  name: z.string().min(1),
  description: z.string().default(''),
  isMaintenance: z.boolean().default(false),
  order: z.number().default(0),
  archived: z.boolean().default(false),
});
export type Area = z.infer<typeof Area>;

export const Project = z.object({
  id: z.string(),
  name: z.string().min(1),
  goal: z.string().default(''),
  areaId: z.string().optional(),
  status: z.enum(['active', 'paused', 'done', 'archived']).default('active'),
  nextAction: z.string().default(''),
  keyResultIds: z.array(z.string()).default([]),
  isMaintenance: z.boolean().default(false),
  notes: z.string().default(''),
  trackCosts: z.boolean().default(false),
  order: z.number().default(0),
  createdAt: IsoDate.optional(),
  completedAt: IsoDate.optional(),
});
export type Project = z.infer<typeof Project>;

export const Task = z.object({
  id: z.string(),
  title: z.string().min(1),
  projectId: z.string().optional(),
  column: BoardColumn.default('backlog'),
  order: z.number().default(0),
  priority: Priority.default('P2'),
  dueAt: IsoDate.optional(),
  waitingOn: z.string().optional(),
  sourceItemId: z.string().optional(),
  sessionId: z.string().optional(),
  syncToReminders: z.boolean().default(false),
  reminderExternalId: z.string().optional(),
  completedAt: IsoDate.optional(),
  createdAt: IsoDate.optional(),
  updatedAt: IsoDate.optional(),
});
export type Task = z.infer<typeof Task>;

export const Objective = z.object({
  id: z.string(),
  title: z.string().min(1),
  quarter: z.string().regex(/^\d{4}-Q[1-4]$/),
  description: z.string().default(''),
  order: z.number().default(0),
  status: z.enum(['active', 'done', 'dropped']).default('active'),
  grade: z.number().min(0).max(1).optional(),
  retroNotes: z.string().optional(),
});
export type Objective = z.infer<typeof Objective>;

export const KrAutoSource = z.object({
  type: z.enum(['ledgerCategoryTotal', 'tasksCompleted', 'contentPublished', 'manual']),
  config: z.record(z.any()).default({}),
});

export const KeyResult = z.object({
  id: z.string(),
  objectiveId: z.string(),
  title: z.string().min(1),
  metric: z.string().default(''),
  unit: z.string().default(''),
  baseline: z.number().default(0),
  target: z.number(),
  current: z.number().default(0),
  direction: z.enum(['up', 'down']).default('up'),
  confidence: z.number().int().min(0).max(10).default(5),
  autoSource: KrAutoSource.optional(),
  updatedAt: IsoDate.optional(),
});
export type KeyResult = z.infer<typeof KeyResult>;

export const krProgress = (kr: Pick<KeyResult, 'baseline' | 'target' | 'current'>) => {
  const span = kr.target - kr.baseline;
  if (span === 0) return kr.current >= kr.target ? 1 : 0;
  return Math.max(0, Math.min(1, (kr.current - kr.baseline) / span));
};

export const KrUpdate = z.object({
  id: z.string(),
  keyResultId: z.string(),
  value: z.number(),
  confidence: z.number().int().min(0).max(10).optional(),
  source: z.enum(['manual', 'whatsapp', 'auto', 'session']),
  note: z.string().default(''),
  at: IsoDate,
});
export type KrUpdate = z.infer<typeof KrUpdate>;

export const SessionTurn = z.object({
  role: z.enum(['coach', 'user']),
  content: z.string(),
  at: IsoDate,
});

export const Session = z.object({
  id: z.string(),
  type: SessionType,
  scheduledFor: IsoDate,
  startedAt: IsoDate.optional(),
  completedAt: IsoDate.optional(),
  channel: z.enum(['whatsapp', 'portal']),
  prep: z.string().default(''),
  transcript: z.array(SessionTurn).default([]),
  decisions: z.array(z.string()).default([]),
  actionsCreated: z.array(z.object({ taskId: z.string(), title: z.string() })).default([]),
  summary: z.string().default(''),
  status: z.enum(['scheduled', 'prepared', 'inProgress', 'done', 'skipped']).default('scheduled'),
});
export type Session = z.infer<typeof Session>;

/** Brain output for a session prep. */
export const SessionPrepOutput = z.object({
  headline: z.string().max(200),
  brief: z.string().max(2000),
  questions: z.array(z.string()).max(5),
  proposedFocus: z.array(z.object({ title: z.string(), keyResultId: z.string().nullable(), why: z.string() })).max(5),
  slippingKrs: z.array(z.object({ keyResultId: z.string(), why: z.string() })).default([]),
});
export type SessionPrepOutput = z.infer<typeof SessionPrepOutput>;

export const SessionTurnOutput = z.object({
  reply: z.string(),
  krUpdates: z.array(z.object({ keyResultId: z.string(), value: z.number().nullable(), confidence: z.number().int().min(0).max(10).nullable() })).default([]),
  tasks: z.array(z.object({ title: z.string(), projectId: z.string().nullable(), column: BoardColumn.default('thisWeek') })).default([]),
  decisions: z.array(z.string()).default([]),
  done: z.boolean().default(false),
  summary: z.string().nullable().default(null),
});
export type SessionTurnOutput = z.infer<typeof SessionTurnOutput>;
