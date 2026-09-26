import type { UserContext } from '../lib/context';
import { emailPoll, emailAct } from './email';
import { triageItems } from './triage';
import { replyDraft } from './reply';
import { financeCategorize, financeReceipt, financeSnapshot, recurringDetect } from './finance';
import { contentDraft } from './content';
import { sessionPrep, sessionTurn, sessionStart } from './sessions';
import { whatsappInbound } from './whatsapp';
import { digestDaily, nudgeFinance, financeMonthly } from './digest';
import { krAutoUpdate, governanceFlags } from './governance';
import { knowledgeIndex } from './knowledge';
import { askAnswer } from './asks';
import { mailAsk, mailExpire } from './mail';
import { userProvision, userDeprovision } from './provision';
import { driveProvision, drivePull, drivePush } from './drive';
import { projectProvision, projectBackfill, projectFiles, projectRun, fileMove } from './projects';
import { checkBreaker } from '../lib/governance';

export type Handler = (ctx: UserContext, payload: any) => Promise<unknown>;

export const handlers: Record<string, Handler> = {
  'email.poll': emailPoll,
  'email.act': emailAct,
  'triage.items': triageItems,
  'reply.draft': replyDraft,
  'finance.categorize': financeCategorize,
  'finance.receipt': financeReceipt,
  'finance.snapshot': financeSnapshot,
  'recurring.detect': recurringDetect,
  'content.draft': contentDraft,
  'session.prep': sessionPrep,
  'session.turn': sessionTurn,
  'session.start': sessionStart,
  'whatsapp.inbound': whatsappInbound,
  'reminders.sync': (ctx, p) => triageItems(ctx, p),
  'knowledge.index': knowledgeIndex,
  'kr.autoupdate': krAutoUpdate,
  'governance.flags': governanceFlags,
  'nudge.finance': nudgeFinance,
  'finance.monthly': financeMonthly,
  'digest.daily': digestDaily,
  'ask.answer': askAnswer,
  'mail.ask': mailAsk,
  'mail.expire': mailExpire,
  'user.provision': userProvision,
  'user.deprovision': userDeprovision,
  'drive.provision': driveProvision,
  'drive.pull': drivePull,
  'drive.push': drivePush,
  'project.provision': projectProvision,
  'project.backfill': projectBackfill,
  'project.files': projectFiles,
  'project.run': projectRun,
  'file.move': fileMove,
  'governance.review': (ctx) => checkBreaker(ctx),
};
