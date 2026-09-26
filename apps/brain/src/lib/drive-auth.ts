import { googleAccounts } from './google-user';
import { userRef } from './firestore';

export type TokenGetter = () => Promise<string>;

/** A user's own Google account that granted the Drive scope (their files, their quota). */
export const userDriveToken = async (uid: string): Promise<{ token: TokenGetter; email: string } | null> => {
  const accts = await googleAccounts(uid);
  const a = accts.find((x) => x.drive); return a ? { token: a.token, email: a.email } : null;
};

/**
 * The owner's Google account — creates `<parent>/<slug>/` folders and shares them. Resolved from ATLAS_DRIVE_OWNER_UID
 * (falls back to the requesting user, which is right for the owner themselves).
 */
export const ownerDriveToken = async (fallbackUid: string): Promise<{ token: TokenGetter; email: string; uid: string }> => {
  const ownerUid = process.env.ATLAS_DRIVE_OWNER_UID || fallbackUid;
  const t = await userDriveToken(ownerUid);
  if (!t) throw new Error(`The Drive owner account (${ownerUid === fallbackUid ? 'you' : 'user ' + ownerUid}) has no Google connection with Drive access — reconnect Gmail in Settings → Integrations to grant it`);
  return { ...t, uid: ownerUid };
};

export const userEmail = async (uid: string) => String(((await userRef(uid).get()).data() ?? {}).email ?? '');
