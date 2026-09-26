import { userSlug } from '@atlas/schemas';
import { userRef, now, audit } from '../lib/firestore';
import { provisionLinuxUser, deprovisionLinuxUser } from '../lib/runas';
import { park } from '../lib/governance';
import { driveProvision } from './drive';
import type { UserContext } from '../lib/context';

/** user.provision — Linux user + home + inbox (Phase 1). Drive folders are attached by Phase 2's hook when configured. */
export const userProvision = async (ctx: UserContext, payload: { force?: boolean }) => {
  const u = (await userRef(ctx.uid).get()).data() ?? {};
  const email = String(u.email ?? '');
  if (!email) throw new Error('user has no email');
  if (u.provisioning?.status === 'ok' && !payload.force) return { skipped: 'already provisioned', slug: u.provisioning.slug };
  const slug = u.provisioning?.slug ?? userSlug(email, ctx.uid);
  await userRef(ctx.uid).set({ provisioning: { status: 'pending', slug, at: now() } }, { merge: true });
  const r = await provisionLinuxUser(ctx.uid, slug, email);
  if (!r.ok) {
    await userRef(ctx.uid).set({ provisioning: { status: 'error', slug, error: r.error ?? 'unknown', at: now() } }, { merge: true });
    await audit(ctx.uid, { actor: 'brain', action: 'provisioning failed', reason: r.error });
    throw new Error(`provisioning failed: ${r.error}`);
  }
  const prov = { status: 'ok' as const, slug, linuxUser: r.linuxUser, home: r.home, projectsPath: r.projectsPath, inboxPath: r.inboxPath, at: now() };
  await userRef(ctx.uid).set({ provisioning: prov }, { merge: true });
  await audit(ctx.uid, { actor: 'brain', action: `${r.created ? 'provisioned' : 're-checked'} Linux user ${r.linuxUser}`, reason: r.home });
  let driveNote = '';
  try { const d = await driveProvision(ctx, { force: payload.force }); driveNote = 'driveFolderId' in d ? 'drive ok' : `drive: ${(d as any).skipped}`; }
  catch (e) { driveNote = `drive failed: ${String(e).slice(0, 160)}`; await userRef(ctx.uid).set({ provisioning: { driveError: driveNote } }, { merge: true }); await audit(ctx.uid, { actor: 'brain', action: 'Drive provisioning failed (Linux user is fine)', reason: driveNote }); }
  return { ...prov, driveNote };
};

/** user.deprovision — locks immediately; purging the home always asks the human first. */
export const userDeprovision = async (ctx: UserContext, payload: { purge?: boolean; confirmed?: boolean }) => {
  const u = (await userRef(ctx.uid).get()).data() ?? {};
  const slug = u.provisioning?.slug; if (!slug) return { skipped: 'not provisioned' };
  if (payload.purge && !payload.confirmed) {
    await park(ctx, { kind: 'approveAction', question: `Permanently delete the Pi home directory for ${u.email} (${slug})? An archive is kept in /var/backups/atlas.`, options: [{ key: '1', label: 'Delete it' }, { key: '2', label: 'Keep (lock only)' }], context: { action: 'user.purge' }, pendingAction: { type: 'user.deprovision', payload: { purge: true, confirmed: true } }, riskClass: 'write_local', dedupe: `purge:${slug}` });
    const out = await deprovisionLinuxUser(slug, false);
    return { locked: true, askedToPurge: true, out };
  }
  const out = await deprovisionLinuxUser(slug, Boolean(payload.purge));
  await userRef(ctx.uid).set({ provisioning: { ...u.provisioning, status: 'error', error: payload.purge ? 'purged' : 'locked', at: now() } }, { merge: true });
  await audit(ctx.uid, { actor: 'brain', action: payload.purge ? `purged Linux user u-${slug}` : `locked Linux user u-${slug}`, reason: out });
  return { out };
};
