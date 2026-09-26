import { z } from 'zod';
import { Priority, Scope, Platform } from './common';
import { GovernanceSettings } from './governance';

export const PriorityRule = z.object({
  id: z.string(),
  match: z.object({
    fromDomain: z.string().optional(),
    fromEmail: z.string().optional(),
    subjectContains: z.string().optional(),
    keyword: z.string().optional(),
  }),
  effect: z.object({
    priority: Priority.optional(),
    action: z.enum(['ignore', 'file', 'surface']).optional(),
  }),
  note: z.string().default(''),
});
export type PriorityRule = z.infer<typeof PriorityRule>;

export const AiModels = z.object({
  triage: z.string().default('claude-haiku-4-5'),
  drafting: z.string().default('claude-sonnet-4-5'),
  sessions: z.string().default('claude-sonnet-4-5'),
  summaries: z.string().default('claude-haiku-4-5'),
  finance: z.string().default('claude-haiku-4-5'),
});
export type AiTask = keyof z.infer<typeof AiModels>;

export const Profile = z.object({
  identity: z
    .object({
      name: z.string().default(''),
      roles: z.array(z.string()).default([]),
      bio: z.string().default(''),
      currentPriorities: z.array(z.string()).default([]),
    })
    .default({}),
  workingHours: z
    .object({
      start: z.string().default('08:00'),
      end: z.string().default('18:00'),
      days: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]),
    })
    .default({}),
  priorityRules: z.array(PriorityRule).default([]),
  noise: z
    .object({
      neverSurface: z.array(z.string()).default([]),
      alwaysSurface: z.array(z.string()).default([]),
    })
    .default({}),
  voice: z
    .object({
      tone: z.string().default(''),
      styleNotes: z.string().default(''),
      examples: z.array(z.object({ platform: Platform, text: z.string() })).default([]),
      avoidWords: z.array(z.string()).default([]),
    })
    .default({}),
  finance: z
    .object({
      currency: z.string().default('NZD'),
      gstRegistered: z.boolean().default(false),
      gstRate: z.number().default(0.15),
      defaultScope: Scope.default('business'),
      vendorDefaults: z.record(Scope).default({}),
      anomaly: z
        .object({
          categoryJumpPct: z.number().default(30),
          newVendorThreshold: z.number().default(200),
          duplicateWindowDays: z.number().default(3),
        })
        .default({}),
      nudges: z
        .object({
          receipts: z.enum(['weekly', 'off']).default('weekly'),
          income: z.enum(['monthly', 'off']).default('monthly'),
          unreviewed: z.enum(['weekly', 'off']).default('weekly'),
        })
        .default({}),
    })
    .default({}),
  okr: z
    .object({
      quarterStart: z.enum(['calendar', 'april']).default('calendar'),
      daily: z.object({ time: z.string().default('07:30'), enabled: z.boolean().default(true) }).default({}),
      weekly: z
        .object({ day: z.number().int().min(0).max(6).default(1), time: z.string().default('08:00') })
        .default({}),
      channel: z.enum(['whatsapp', 'portal']).default('whatsapp'),
      style: z.enum(['conversational', 'prefilled']).default('prefilled'),
    })
    .default({}),
  ai: z
    .object({
      models: AiModels.default({}),
      dailyCallBudget: z.number().int().default(500),
    })
    .default({}),
  whatsapp: z
    .object({
      number: z.string().default(''),
      quietHours: z.object({ start: z.string().default('21:00'), end: z.string().default('07:00') }).default({}),
    })
    .default({}),
  para: z.object({ defaultAreaId: z.string().optional() }).default({}),
  governance: GovernanceSettings.default({}),
  email: z
    .object({
      /** The agent only ever sees this window of mail. First sync, polling, Inbox and "ask" are all bounded by it. */
      lookbackHours: z.number().int().min(6).max(24 * 30).default(72),
      /** Off = non-destructive: Atlas never moves/flags mail; filing lives in Atlas only. On = mirror file/ignore into mailbox folders. */
      mirrorToMailbox: z.boolean().default(false),
      /** Privacy filter: `addr@x.com` exact or `@domain.com`. Matching mail is never ingested; only a count is audited. */
      neverShowAgents: z.array(z.string()).default([]),
      /** Inbox items older than the window are auto-filed (tag `expired`) so the Inbox is always ≤ window. */
      autoExpire: z.boolean().default(true),
    })
    .default({}),
});
export type Profile = z.infer<typeof Profile>;
export const defaultProfile = (): Profile => Profile.parse({});
