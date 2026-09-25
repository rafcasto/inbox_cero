/** Usage: pnpm exec tsx scripts/run.ts <uid> <task> '<json payload>' — run any brain task locally. */
import { loadContext } from '../src/lib/context';
import { handlers } from '../src/tasks';
const [uid, task, json] = [process.argv[2], process.argv[3], process.argv[4] ?? '{}'];
if (!uid || !task || !handlers[task]) { console.error('usage: run.ts <uid> <task> [json]; tasks:', Object.keys(handlers).join(', ')); process.exit(1); }
console.log(JSON.stringify(await handlers[task]!(await loadContext(uid), JSON.parse(json)), null, 1));
process.exit(0);
