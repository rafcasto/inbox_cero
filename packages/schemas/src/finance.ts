import { z } from 'zod';
import { Scope, IsoDate } from './common';

export const BankProfile = z.enum(['anz', 'asb', 'bnz', 'kiwibank', 'westpac', 'generic']);
export type BankProfile = z.infer<typeof BankProfile>;

export const Category = z.object({
  id: z.string(),
  name: z.string().min(1),
  parentId: z.string().optional(),
  defaultScope: Scope.default('business'),
  order: z.number().default(0),
  externalCode: z.string().optional(),
});
export type Category = z.infer<typeof Category>;

export const DEFAULT_CATEGORIES: Array<Pick<Category, 'id' | 'name' | 'defaultScope'>> = [
  { id: 'software', name: 'Software & subscriptions', defaultScope: 'business' },
  { id: 'hosting', name: 'Hosting & infrastructure', defaultScope: 'business' },
  { id: 'ai-api', name: 'AI / API costs', defaultScope: 'business' },
  { id: 'contractors', name: 'Contractors', defaultScope: 'business' },
  { id: 'marketing', name: 'Marketing & ads', defaultScope: 'business' },
  { id: 'equipment', name: 'Equipment', defaultScope: 'business' },
  { id: 'professional', name: 'Professional services', defaultScope: 'business' },
  { id: 'banking', name: 'Banking & fees', defaultScope: 'business' },
  { id: 'travel', name: 'Travel', defaultScope: 'business' },
  { id: 'education', name: 'Education', defaultScope: 'business' },
  { id: 'income', name: 'Income', defaultScope: 'business' },
  { id: 'groceries', name: 'Groceries', defaultScope: 'personal' },
  { id: 'housing', name: 'Housing & utilities', defaultScope: 'personal' },
  { id: 'transport', name: 'Transport', defaultScope: 'personal' },
  { id: 'health', name: 'Health', defaultScope: 'personal' },
  { id: 'eating-out', name: 'Eating out', defaultScope: 'personal' },
  { id: 'transfer', name: 'Transfers (ignore)', defaultScope: 'personal' },
  { id: 'other', name: 'Other', defaultScope: 'business' },
];

export const Transaction = z.object({
  id: z.string(),
  date: z.string().date(),
  amount: z.number(),
  currency: z.string().default('NZD'),
  amountNzd: z.number(),
  fxRate: z.number().default(1),
  vendor: z.string().default(''),
  vendorNormalized: z.string().default(''),
  description: z.string().default(''),
  categoryId: z.string().optional(),
  scope: Scope,
  projectId: z.string().optional(),
  gst: z
    .object({ treatment: z.enum(['inclusive', 'exclusive', 'none']).default('inclusive'), amount: z.number().default(0) })
    .default({}),
  receiptPath: z.string().optional(),
  source: z.object({
    type: z.enum(['bankImport', 'receiptEmail', 'whatsapp', 'manual']),
    importId: z.string().optional(),
    itemId: z.string().optional(),
    bankAccountId: z.string().optional(),
  }),
  dedupeKey: z.string(),
  reviewed: z.boolean().default(false),
  recurringCostId: z.string().optional(),
  tags: z.array(z.string()).default([]),
  categorizedBy: z.enum(['brain', 'vendorMemory', 'user', 'rule']).optional(),
});
export type Transaction = z.infer<typeof Transaction>;

export const RecurringCost = z.object({
  id: z.string(),
  vendor: z.string(),
  amount: z.number(),
  currency: z.string().default('NZD'),
  cycle: z.enum(['weekly', 'monthly', 'annual']),
  nextRenewalAt: z.string().date(),
  categoryId: z.string().optional(),
  projectId: z.string().optional(),
  status: z.enum(['candidate', 'active', 'cancelled']).default('candidate'),
  lastSeenAt: z.string().date().optional(),
  evidenceTransactionIds: z.array(z.string()).default([]),
  usageFlag: z.enum(['unused60d']).optional(),
});
export type RecurringCost = z.infer<typeof RecurringCost>;

export const FinanceSnapshot = z.object({
  id: z.string(), // yyyy-MM
  income: z.number(),
  spend: z.number(),
  net: z.number(),
  byCategory: z.record(z.number()),
  byProject: z.record(z.number()),
  byScope: z.record(z.number()),
  runRate: z.number(),
  trailing3: z.number(),
  trailing12: z.number(),
  anomalies: z.array(z.object({ type: z.enum(['categoryJump', 'newVendor', 'duplicate']), detail: z.string(), amount: z.number() })),
  computedAt: IsoDate,
});
export type FinanceSnapshot = z.infer<typeof FinanceSnapshot>;

export const UsageLog = z.object({
  id: z.string(),
  at: IsoDate,
  service: z.enum(['claude', 'whatsapp', 'vercel', 'firebase', 'upstash', 'other']),
  model: z.string().optional(),
  task: z.string(),
  tokensIn: z.number().default(0),
  tokensOut: z.number().default(0),
  costUsd: z.number().default(0),
  refId: z.string().optional(),
});
export type UsageLog = z.infer<typeof UsageLog>;

/** Brain output for categorising a batch of transactions. */
export const CategorizeOutput = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      categoryId: z.string(),
      scope: Scope,
      vendorNormalized: z.string(),
      isRecurringCandidate: z.boolean().default(false),
      confidence: z.number().min(0).max(1),
    }),
  ),
});
export type CategorizeOutput = z.infer<typeof CategorizeOutput>;

export const ReceiptExtractOutput = z.object({
  vendor: z.string(),
  date: z.string().date().nullable(),
  amount: z.number().nullable(),
  currency: z.string().default('NZD'),
  gstInclusive: z.boolean().default(true),
  categoryId: z.string().nullable(),
  scope: Scope.default('business'),
  confidence: z.number().min(0).max(1),
});
export type ReceiptExtractOutput = z.infer<typeof ReceiptExtractOutput>;
