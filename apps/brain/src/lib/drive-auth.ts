import { googleAccounts } from './google-user';
import { userRef } from './firestore';
import { saAccessToken, DRIVE_SCOPE } from './google-sa';

/** ATLAS_DRIVE_AUTH=service_account → every Drive call uses the service account (requires a Shared Drive: service accounts have no My Drive quota). Default: users' OAuth. */
export const serviceAccountMode = () => process.env.ATLAS_DRIVE_AUTH === 'service_account';
const saToken: TokenGetter = () => saAccessToken([DRIVE_SCOPE]);

export type TokenGetter = () => Promise<string>;

/** A user's own Google account that granted the Drive scope (their files, their quota). */
export const userDriveToken = async (uid: string): Promise<{ token: TokenGetter; email: string } | null> => {
  if (serviceAccountMode()) return { token: saToken, email: 'service-account' };
  const accts = await googleAccounts(uid);
  const a = accts.find((x) => x.drive); return a ? { token: a.token, email: a.email } : null;
};

/**
 * The owner's Google account — creates `<parent>/<slug>/` folders and shares them. Resolved from ATLAS_DRIVE_OWNER_UID
 * (falls back to the requesting user, which is right for the owner themselves).
 */
export const ownerDriveToken = async (fallbackUid: string): Promise<{ token: TokenGetter; email: string; uid: string }> => {
  const ownerUid = process.env.ATLAS_DRIVE_OWNER_UID || fallbackUid;
  if (serviceAccountMode()) return { token: saToken, email: 'service-account', uid: ownerUid };
  const wantEmail = (process.env.ATLAS_DRIVE_OWNER_EMAIL ?? '').toLowerCase();
  const accts = (await googleAccounts(ownerUid)).filter((a) => a.drive);
  const a = wantEmail ? accts.find((x) => x.email.toLowerCase() === wantEmail) : accts[0];
  if (!a) throw new Error(wantEmail
    ? `The Drive owner account ${wantEmail} is not connected with Drive access — Settings → Integrations → Connect a Gmail account → pick ${wantEmail}`
    : `No Google connection with Drive access for the owner — reconnect Gmail in Settings → Integrations`);
  return { token: a.token, email: a.email, uid: ownerUid };
};

export const userEmail = async (uid: string) => String(((await userRef(uid).get()).data() ?? {}).email ?? '');
