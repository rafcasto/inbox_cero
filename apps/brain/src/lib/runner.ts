import type { ZodTypeAny, z } from 'zod';
import { AiModels, type AiTask } from '@atlas/schemas';
import { runClaude } from './claude';
import { getPrompt, render } from './prompts';
import { logUsage, audit } from './firestore';
import { cacheGet, cacheSet, rateLimitOk } from './upstash';
import { sha256 } from './crypto';
import { config } from '../config';
import type { UserContext } from './context';
import { log } from './log';

export const resolveModel = (ctx: UserContext, task: AiTask | string, override?: string) => {
  if (override) return override;
  const models = AiModels.parse(ctx.profile.ai?.models ?? {});
  return (models as Record<string, string>)[task] ?? config.defaultModel;
};

/**
 * Render a prompt file with vars, run it through Claude, validate, log usage + audit.
 * Cached by content hash (24h) so re-runs and retries cost nothing.
 */
export const runTask = async <S extends ZodTypeAny>(opts: {
  ctx: UserContext;
  task: string;
  vars: Record<string, unknown>;
  schema: S;
  model?: string;
  cacheTtl?: number;
  refId?: string;
}): Promise<{ output: z.infer<S>; model: string; promptVersion: string; cached: boolean; costUsd: number }> => {
  const prompt = getPrompt(opts.task);
  const model = resolveModel(opts.ctx, prompt.model, opts.model);
  const rendered = render(prompt.body, { profile: opts.ctx.profile, name: opts.ctx.name, ...opts.vars });
  const key = sha256(`${opts.ctx.uid}|${opts.task}|${prompt.version}|${model}|${rendered}`);
  const hit = await cacheGet(key);
  if (hit) {
    const parsed = opts.schema.safeParse(JSON.parse(hit));
    if (parsed.success) return { output: parsed.data, model, promptVersion: prompt.version, cached: true, costUsd: 0 };
  }
  if (!(await rateLimitOk(opts.ctx.uid, opts.ctx.profile.ai?.dailyCallBudget ?? 500))) {
    throw new Error(`daily Claude call budget exceeded for ${opts.ctx.uid}`);
  }
  if (config.dryRun) {
    log.warn('dry run: skipping Claude call', { task: opts.task, model });
    throw new Error('ATLAS_DRY_RUN=1');
  }
  const { output, usage } = await runClaude({ prompt: rendered, model, schema: opts.schema, task: opts.task });
  await cacheSet(key, output, opts.cacheTtl ?? 86400);
  await Promise.all([
    logUsage(opts.ctx.uid, { task: opts.task, model: usage.model, tokensIn: usage.tokensIn, tokensOut: usage.tokensOut, costUsd: usage.costUsd, refId: opts.refId }),
    audit(opts.ctx.uid, { actor: 'brain', action: `ran ${opts.task}`, promptVersion: prompt.version, model: usage.model, costUsd: usage.costUsd, reason: `${usage.tokensIn} in / ${usage.tokensOut} out in ${usage.durationMs}ms` }),
  ]);
  return { output, model: usage.model, promptVersion: prompt.version, cached: false, costUsd: usage.costUsd };
};
