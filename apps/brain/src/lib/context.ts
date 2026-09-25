import { getProfile, listDocs, userRef } from './firestore';
import type { Profile } from '@atlas/schemas';

/** Everything most prompts need about a user, fetched once per job. */
export type UserContext = {
  uid: string;
  profile: Profile;
  name: string;
  timezone: string;
  projects: Array<{ id: string; name: string; goal?: string; keyResultIds?: string[]; isMaintenance?: boolean; status?: string }>;
  areas: Array<{ id: string; name: string }>;
};

export const loadContext = async (uid: string): Promise<UserContext> => {
  const [profile, projects, areas, user] = await Promise.all([
    getProfile(uid),
    listDocs(uid, 'projects', (q) => q.where('status', 'in', ['active', 'paused'])),
    listDocs(uid, 'areas', (q) => q.where('archived', '==', false)),
    userRef(uid).get(),
  ]);
  const _unused = [

  ];
  return {
    uid,
    profile,
    name: profile.identity.name || 'the user',
    timezone: (user.data()?.timezone as string) || 'Pacific/Auckland',
    projects: projects.map((p) => ({ id: p.id, name: p.name, goal: p.goal, keyResultIds: p.keyResultIds, isMaintenance: p.isMaintenance, status: p.status })),
    areas: areas.map((a) => ({ id: a.id, name: a.name })),
  };
};

export const projectsLine = (ctx: UserContext) => ctx.projects.map((p) => `${p.id} → ${p.name}${p.goal ? ' — ' + p.goal : ''}`).join('\n') || '(none)';
export const areasLine = (ctx: UserContext) => ctx.areas.map((a) => `${a.id} → ${a.name}`).join('\n') || '(none)';
export const timezone = (ctx: UserContext) => ctx.timezone;

/** Local hour (0-23) and weekday (0-6) for the user right now. */
export const localNow = (ctx: UserContext) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: ctx.timezone, hour: 'numeric', hour12: false, weekday: 'short' }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0) % 24;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.find((p) => p.type === 'weekday')?.value ?? 'Mon');
  return { hour, day };
};
