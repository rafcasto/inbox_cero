/** Usage: pnpm exec tsx scripts/index-knowledge.ts <uid> <dir> — index a markdown repo into users/{uid}/knowledge. */
import { loadContext } from '../src/lib/context';
import { knowledgeIndex } from '../src/tasks/knowledge';
const [uid, dir] = [process.argv[2], process.argv[3]];
if (!uid || !dir) { console.error('usage: index-knowledge.ts <uid> <dir>'); process.exit(1); }
console.log(await knowledgeIndex(await loadContext(uid), { dir }));
process.exit(0);
