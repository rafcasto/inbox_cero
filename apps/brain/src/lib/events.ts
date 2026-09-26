import type { ActionType } from '@atlas/schemas';
import { col, now } from './firestore';

/** The events table: one row per agent action, file move or job run. Lives in users/{uid}/audit so the existing feed and governance provenance stay in one place. */
export const event = (uid: string, e: { actionType: ActionType; action: string; projectId?: string | null; ref?: string; jobId?: string; reason?: string; costUsd?: number; model?: string; approval?: string; meta?: Record<string, unknown> }) =>
  col(uid, 'audit').add({ at: now(), actor: 'brain', ...e, projectId: e.projectId ?? null }).catch(() => {});
