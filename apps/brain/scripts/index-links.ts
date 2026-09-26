/** Run each composite query once and harvest the console's one-click "create index" links from the FAILED_PRECONDITION errors. */
import { firestore } from '../src/lib/firestore';
const db = firestore();
const uid = process.argv[2] ?? 'JM6Gir66RTg6ELcyMq9akKiRHhZ2';
const u = db.collection('users').doc(uid);
const queries: Array<[string, FirebaseFirestore.Query]> = [
  ['items status+receivedAt desc', u.collection('items').where('status', '==', 'triaged').orderBy('receivedAt', 'desc').limit(1)],
  ['items status+receivedAt asc', u.collection('items').where('status', 'in', ['new', 'triaged']).where('receivedAt', '<', '2030').limit(1)],
  ['asks status+createdAt desc', u.collection('asks').where('status', '==', 'pending').orderBy('createdAt', 'desc').limit(1)],
  ['feedback overrodeAuto+createdAt', u.collection('feedback').where('overrodeAuto', '==', true).where('createdAt', '>=', '2020').limit(1)],
  ['sessions status+completedAt desc', u.collection('sessions').where('status', '==', 'done').orderBy('completedAt', 'desc').limit(1)],
  ['sessions status+scheduledFor', u.collection('sessions').where('status', '==', 'scheduled').orderBy('scheduledFor').limit(1)],
  ['tasks column+order', u.collection('tasks').where('column', '==', 'backlog').orderBy('order').limit(1)],
  ['tasks projectId+column', u.collection('tasks').where('projectId', '==', 'x').orderBy('column').limit(1)],
  ['transactions categoryId+date', u.collection('transactions').where('categoryId', '==', 'x').orderBy('date', 'desc').limit(1)],
  ['transactions reviewed+date', u.collection('transactions').where('reviewed', '==', false).orderBy('date', 'desc').limit(1)],
  ['transactions scope+date', u.collection('transactions').where('scope', '==', 'business').orderBy('date', 'desc').limit(1)],
  ['content stage+updatedAt', u.collection('content').where('stage', '==', 'draft').orderBy('updatedAt', 'desc').limit(1)],
  ['keyResults objectiveId+updatedAt', u.collection('keyResults').where('objectiveId', '==', 'x').orderBy('updatedAt', 'desc').limit(1)],
];
for (const [name, q] of queries) {
  try { await q.get(); console.log(`OK   ${name}`); }
  catch (e) { const m = String(e).match(/https:\/\/console\.firebase\.google\.com\S+/); console.log(`NEED ${name}\n     ${m ? m[0] : String(e).slice(0, 120)}`); }
}
process.exit(0);
