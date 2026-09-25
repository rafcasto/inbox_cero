import { z } from 'zod';

export const Priority = z.enum(['P0', 'P1', 'P2', 'P3']);
export type Priority = z.infer<typeof Priority>;

export const TriageAction = z.enum(['reply', 'do', 'delegate', 'file', 'ignore']);
export type TriageAction = z.infer<typeof TriageAction>;

export const Scope = z.enum(['business', 'personal']);
export type Scope = z.infer<typeof Scope>;

export const Platform = z.enum(['linkedin', 'x', 'instagram', 'newsletter']);
export type Platform = z.infer<typeof Platform>;

export const BoardColumn = z.enum(['backlog', 'thisWeek', 'inProgress', 'waitingOn', 'done']);
export type BoardColumn = z.infer<typeof BoardColumn>;

export const ContentStage = z.enum(['idea', 'draft', 'review', 'scheduled', 'published']);
export type ContentStage = z.infer<typeof ContentStage>;

export const ItemStatus = z.enum(['new', 'triaged', 'confirmed', 'done', 'filed', 'ignored', 'snoozed']);
export type ItemStatus = z.infer<typeof ItemStatus>;

export const SessionType = z.enum(['daily', 'weekly', 'monthly', 'quarterlyPlan', 'retro']);
export type SessionType = z.infer<typeof SessionType>;

/** ISO-8601 string; Firestore Timestamps are converted at the boundary. */
export const IsoDate = z.string().datetime({ offset: true }).or(z.string().date());
