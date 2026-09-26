import { z } from 'zod';
import { IsoDate } from './common';

/** Intrinsic side-effect class of an action (mirrors OpenWorker's RiskClass ladder). */
export const RiskClass = z.enum(['read', 'egress', 'external', 'write_local']);
export type RiskClass = z.infer<typeof RiskClass>;
export const RISK_STRICTNESS: Record<RiskClass, number> = { read: 0, egress: 1, external: 2, write_local: 3 };

/** Human-only, in every mode. The brain has no handler for these and refuses them if enqueued. */
export const HARD_FLOORS = ['email.send', 'email.delete', 'content.publish', 'money.move', 'account.delete', 'integration.credentials'] as const;
export type HardFloor = (typeof HARD_FLOORS)[number];

/** Action classes the brain can take unattended, with their risk class. */
export const ACTION_RISK: Record<string, RiskClass> = {
  'mail.autoFile': 'external',   // moves a message to Atlas/Filed in your mailbox
  'mail.autoIgnore': 'external', // moves a message to Atlas/Ignored
  'mail.flag': 'external',
  'whatsapp.sendOwner': 'egress', // messages you (never third parties)
  'reminder.create': 'external',
  'reminder.complete': 'external',
  'task.create': 'write_local',
  'task.complete': 'write_local',
  'transaction.create': 'write_local',
  'kr.update': 'write_local',
  'content.draft': 'write_local',
  'item.triage': 'write_local',
  'knowledge.write': 'write_local',
};

export const PermissionMode = z.enum(['ask', 'reviewed-auto', 'auto']);
export type PermissionMode = z.infer<typeof PermissionMode>;

export const ApprovalProvenance = z.enum(['auto', 'reviewer', 'user', 'rule', 'floor', 'denied', 'paused']);
export type ApprovalProvenance = z.infer<typeof ApprovalProvenance>;

export const GovernanceSettings = z.object({
  mode: PermissionMode.default('reviewed-auto'),
  /** Below this triage confidence, auto-actions always go to the reviewer (reviewed-auto) or park (ask). */
  reviewThreshold: z.number().min(0).max(1).default(0.9),
  /** Circuit breaker: this many overrides of auto-actions within windowDays pauses autonomy. */
  breaker: z.object({ overrides: z.number().int().default(5), windowDays: z.number().int().default(7) }).default({}),
  paused: z.boolean().default(false),
  pausedReason: z.string().optional(),
  pausedAt: IsoDate.optional(),
  /** Standing allow rules, promoted from repeated approvals (earned autonomy). */
  allow: z.array(z.object({ id: z.string(), action: z.string(), match: z.record(z.string()), note: z.string().default(''), createdAt: IsoDate.optional() })).default([]),
  /** Optional guidance for the reviewer model: what is normal, what is out of bounds. */
  approvalGuidance: z.string().max(2400).default(''),
});
export type GovernanceSettings = z.infer<typeof GovernanceSettings>;

/** A parked decision for the human (unattended runs never self-approve). */
export const Ask = z.object({
  id: z.string(),
  kind: z.enum(['approveAction', 'promoteRule', 'resumeAutonomy', 'clarify', 'receiptAmount', 'vendorScope', 'krMatch', 'keepOrCancel']),
  question: z.string(),
  options: z.array(z.object({ key: z.string(), label: z.string() })).min(1),
  context: z.record(z.any()).default({}),
  /** The action to execute if approved (job type + payload), for approveAction. */
  pendingAction: z.object({ type: z.string(), payload: z.record(z.any()) }).optional(),
  riskClass: RiskClass.optional(),
  status: z.enum(['pending', 'answered', 'expired']).default('pending'),
  answer: z.string().optional(),
  answeredVia: z.enum(['portal', 'whatsapp']).optional(),
  createdAt: IsoDate,
  answeredAt: IsoDate.optional(),
  expiresAt: IsoDate.optional(),
});
export type Ask = z.infer<typeof Ask>;

export const ReviewerVerdict = z.object({
  verdicts: z.array(z.object({ id: z.string(), verdict: z.enum(['allow', 'deny', 'unsure']), reason: z.string().max(200) })),
});
export type ReviewerVerdict = z.infer<typeof ReviewerVerdict>;
