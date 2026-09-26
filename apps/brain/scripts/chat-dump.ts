import { firestore } from "../src/lib/firestore";
const db = firestore(); const uid = process.argv[2]!;
const chats = await db.collection("users").doc(uid).collection("chats").orderBy("updatedAt", "desc").limit(1).get();
for (const c of chats.docs) { const x = c.data(); console.log(`chat ${c.id} | ${x.title} | status ${x.status} | session ${x.sessionId} | turns ${x.turns} | $${(x.costUsd ?? 0).toFixed(3)}`);
  const m = await c.ref.collection("messages").orderBy("seq").get();
  for (const d of m.docs) { const y = d.data(); console.log(`  [${y.seq}] ${y.role.padEnd(9)} ${y.status.padEnd(9)} ${y.role === "tool" ? `${y.toolName} ${String(y.toolInput ?? "").slice(0, 80)} → ${y.toolOk === false ? "ERR " : ""}${String(y.toolResult ?? "").slice(0, 60).replace(/\n/g, " ")}` : String(y.content).slice(0, 160).replace(/\n/g, " ")}`); } }
process.exit(0);
