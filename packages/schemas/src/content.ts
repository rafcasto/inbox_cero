import { z } from 'zod';
import { Platform, ContentStage, IsoDate } from './common';

export const Content = z.object({
  id: z.string(),
  platform: Platform,
  stage: ContentStage.default('idea'),
  title: z.string().default(''),
  body: z.string().default(''),
  seeds: z.array(z.object({ type: z.enum(['item', 'knowledge', 'reminder', 'manual']), refId: z.string(), note: z.string().optional() })).default([]),
  scheduledFor: IsoDate.optional(),
  publishedAt: IsoDate.optional(),
  publishedUrl: z.string().optional(),
  metrics: z
    .object({ impressions: z.number().optional(), likes: z.number().optional(), comments: z.number().optional(), shares: z.number().optional(), subscribers: z.number().optional() })
    .optional(),
  order: z.number().default(0),
  createdAt: IsoDate.optional(),
  updatedAt: IsoDate.optional(),
  /** Phase 6 */
  projectId: z.string().nullable().optional(),
  versions: z.array(z.object({ at: IsoDate, stage: ContentStage, title: z.string(), body: z.string(), note: z.string().optional() })).default([]),
  publishedTo: z.array(z.object({ channel: z.enum(['linkedin', 'kit', 'x', 'instagram', 'substack', 'other']), id: z.string(), url: z.string().optional(), at: IsoDate, status: z.enum(['draft', 'published']).default('published') })).default([]),
});
export type Content = z.infer<typeof Content>;

export const ContentMetric = z.object({
  id: z.string(),
  platform: Platform,
  date: z.string().date(),
  followers: z.number().optional(),
  impressions: z.number().optional(),
  engagement: z.number().optional(),
  source: z.enum(['manual', 'csv', 'api']).default('manual'),
  contentId: z.string().optional(),
  postUrn: z.string().optional(),
  reach: z.number().optional(),
  reactions: z.number().optional(),
  comments: z.number().optional(),
  reposts: z.number().optional(),
});
export type ContentMetric = z.infer<typeof ContentMetric>;

export const ContentDraftOutput = z.object({
  drafts: z.array(z.object({ platform: Platform, title: z.string(), body: z.string(), hook: z.string(), why: z.string() })),
});
export type ContentDraftOutput = z.infer<typeof ContentDraftOutput>;

export const Knowledge = z.object({
  id: z.string(),
  title: z.string(),
  tags: z.array(z.string()).default([]),
  source: z.enum(['repo', 'note', 'retro', 'notion']),
  date: z.string().optional(),
  path: z.string().optional(),
  contentHash: z.string(),
  excerpt: z.string().default(''),
  body: z.string(),
  updatedAt: IsoDate.optional(),
});
export type Knowledge = z.infer<typeof Knowledge>;
