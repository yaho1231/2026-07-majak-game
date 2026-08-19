/** 삼세 예지 × 패산을 건드리는 증강(미래를 보는 자) — 예고가 실제 쯔모와 어긋나는가 */
import type { PlayerId } from "@majak/core";
import { PERSONAS } from "../harness.js";
import { runSpyMatch } from "./spy.js";

const preset: Record<PlayerId, string[]> = {
  p0: ["triple_peek", "future_sight"],
  p1: ["triple_peek"], p2: ["triple_peek"], p3: ["triple_peek"],
};
const personas = { p0: PERSONAS.masher!, p1: PERSONAS.masher!, p2: PERSONAS.masher!, p3: PERSONAS.masher! };
let wrong = 0, rounds = 0;
const a = Number(process.argv[2] ?? 1), n = Number(process.argv[3] ?? 4);
for (let s = a; s < a + n; s++) {
  const r = await runSpyMatch({ seed: s, preset, personas, timeoutMs: 120000, noDraft: true });
  rounds += r.rounds;
  const kinds = new Map<string, number>();
  for (const l of r.leaks) kinds.set(l.kind, (kinds.get(l.kind) ?? 0) + 1);
  wrong += r.leaks.length;
  console.log(`seed=${s} rounds=${r.rounds} ${JSON.stringify([...kinds])} crash=${r.crash ?? "-"}`);
  const byViewer = new Map<string, number>();
  for (const l of r.leaks.filter((x) => x.kind === "TRIPLE_PEEK_STALE")) byViewer.set(l.viewer, (byViewer.get(l.viewer) ?? 0) + 1);
  console.log(`   STALE per viewer: ${JSON.stringify([...byViewer])}`);
  for (const l of r.leaks.filter((x) => x.kind === "TRIPLE_PEEK_STALE").slice(0, 2)) console.log(`   STALE ${l.viewer}@${l.round} ${l.detail.split("\n")[0]}`);
  for (const l of r.leaks.filter((x) => x.kind === "TRIPLE_PEEK_WRONG").slice(0, 1)) console.log(`   WRONG ${l.viewer}@${l.round} ${l.detail.split("\n")[0]}`);
}
console.log(`TOTAL rounds=${rounds} wrong=${wrong}`);
