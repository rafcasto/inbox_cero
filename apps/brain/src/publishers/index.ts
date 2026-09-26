import type { UserContext } from '../lib/context';

/** A channel Atlas can publish to. Adding a channel = one adapter here + a button. Nothing here is ever called by the agent. */
export type PublishResult = { channel: string; id: string; url?: string; status: 'draft' | 'published' };
export interface Publisher { channel: string; publish(ctx: UserContext, content: { id: string; title: string; body: string; platform: string }): Promise<PublishResult>; }
export const publishers: Record<string, Publisher> = {};
export const register = (p: Publisher) => { publishers[p.channel] = p; };
