import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';
import { PROMPTS_DIR } from '../config';

export type PromptFile = { task: string; version: string; model: string; body: string; file: string };

const cache = new Map<string, PromptFile>();

const parse = (file: string): PromptFile => {
  const raw = readFileSync(join(PROMPTS_DIR, file), 'utf8');
  const m = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!m) throw new Error(`prompt ${file} has no frontmatter`);
  const fm = YAML.parse(m[1]!) as Record<string, string>;
  return { task: String(fm.task), version: String(fm.version ?? '1'), model: String(fm.model ?? 'summaries'), body: m[2]!.trim(), file };
};

export const loadPrompts = () => {
  cache.clear();
  for (const f of readdirSync(PROMPTS_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md')) {
    const p = parse(f);
    cache.set(p.task, p);
  }
  return cache;
};

export const getPrompt = (task: string): PromptFile => {
  if (!cache.size) loadPrompts();
  const p = cache.get(task);
  if (!p) throw new Error(`no prompt for task ${task}`);
  return p;
};

/** Replace {{key}} with values; objects are JSON-stringified; missing keys become "(none)". */
export const render = (body: string, vars: Record<string, unknown>) =>
  body.replace(/\{\{(\w+)\}\}/g, (_, k: string) => {
    const v = vars[k];
    if (v === undefined || v === null || v === '') return '(none)';
    return typeof v === 'string' ? v : JSON.stringify(v, null, 1);
  });
