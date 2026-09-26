import { firestore } from '../src/lib/firestore';
const db = firestore(); const [uid, name, goal] = [process.argv[2]!, process.argv[3]!, process.argv[4] ?? ''];
const ref = await db.collection('users').doc(uid).collection('projects').add({ name, goal, status: 'active', keyResultIds: [], isMaintenance: true, order: Date.now(), createdAt: new Date().toISOString() });
console.log(ref.id); process.exit(0);
