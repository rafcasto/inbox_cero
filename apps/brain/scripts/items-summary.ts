import { firestore } from "../src/lib/firestore";
const s = await firestore().collection("users").doc(process.argv[2]!).collection("items").get();
const rows = s.docs.map((d) => d.data()).filter((x: any) => x.source?.type === "email").sort((a: any, b: any) => (b.receivedAt ?? "").localeCompare(a.receivedAt ?? ""));
for (const x of rows.slice(0, 20)) console.log(`${(x.status ?? "").padEnd(8)} ${(x.triage?.priority ?? "--").padEnd(3)} ${(x.triage?.action ?? "--").padEnd(8)} ${(x.triage?.model === "rules" ? "rule" : "brain").padEnd(5)} | ${String(x.raw?.from ?? "").replace(/<.*/, "").trim().slice(0, 26).padEnd(26)} | ${String(x.summary ?? x.raw?.subject ?? "").slice(0, 70)}`);
console.log(`\n${rows.length} email items total`);
process.exit(0);
