import nodemailer from 'nodemailer';
import { googleAccounts } from './google-user';
import { gaudit } from './governance';

/**
 * The single carve-out from the `email.send` hard floor: send a message to the user THEMSELVES, from their own Gmail,
 * over SMTP XOAUTH2. The recipient is forced to the sending account; no other address is ever possible here.
 */
export const sendToSelf = async (uid: string, subject: string, text: string, html?: string) => {
  const accounts = await googleAccounts(uid);
  const a = accounts[0]; if (!a) return { skipped: 'no Google mailbox connected' };
  const accessToken = await a.token();
  const transport = nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { type: 'OAuth2', user: a.email, accessToken } });
  const info = await transport.sendMail({ from: `Atlas <${a.email}>`, to: a.email, subject, text, html });
  await gaudit(uid, { action: `emailed digest to self (${a.email})`, approval: 'auto', riskClass: 'egress', reason: subject.slice(0, 80) });
  return { sent: true, to: a.email, id: info.messageId };
};
