/** 의심 2 재검증 — devils_advance 폭발 9,000점 소멸 + 결과 화면 근거 줄 */
import { devilsAdvance } from "../../packages/content/src/augments/devils_advance.js";
import { realWinPayload, scene, settle, sum, win } from "../score-a/settleRig.js";
import type { AugPointNote } from "@majak/core";

const g = scene({ augments: { p0: [devilsAdvance] } });
const payload = realWinPayload(g, {
  deltas: { p0: 8000, p1: 0, p2: -8000, p3: 0 },
  winInfos: [win({ winner: "p0", from: "p2", winType: "ron", points: 8000, limit: "mangan" } as never)],
});
const out = settle(g, payload);
console.log("deltas =", JSON.stringify(out.deltas));
console.log("합계변화 =", sum(out.deltas) - sum(payload.deltas));
console.log("augPoints =", JSON.stringify(out.augPoints));

/*
 * 결과 화면(App.tsx)의 두 렌더 경로를 그대로 재현한다.
 *  ① 화료자 블록  : App.tsx:19441  `.filter(a => a.player === w.winner && a.points !== 0)`
 *  ② 증감표 한 줄 : App.tsx:19730  `<AugDeltaNotes … skipWinners={winnerIds} />`
 *                   → App.tsx:19134 `if (skipWinners?.has(player)) return null;`
 */
const notes: readonly AugPointNote[] = out.augPoints ?? [];
const winnerIds = new Set((out.winInfos ?? []).map((w) => w.winner));
const winnerBlock = notes.filter((a) => winnerIds.has(a.player) && a.points !== 0);
const deltaRows = ["p0", "p1", "p2", "p3"].map((pid) => ({
  pid,
  delta: out.deltas[pid as "p0"] ?? 0,
  notes: winnerIds.has(pid) ? [] : notes.filter((a) => a.player === pid),
}));
console.log("① 화료자 블록에 뜨는 증강 줄 =", JSON.stringify(winnerBlock));
console.log("② 증감표:");
for (const r of deltaRows) console.log(`   ${r.pid} ${r.delta >= 0 ? "+" : ""}${r.delta}  근거=${r.notes.length === 0 ? "(없음)" : JSON.stringify(r.notes)}`);
