/**
 * s08 — 리플레이 재구성이 «관전으로 본 판»과 일치하는가 (docs/36 §1 마지막 줄).
 *
 * 동풍전 한 판을 관전자로 끝까지 지켜보며 국별 정산(roundOver.settle.deltas)과
 * 마지막 관전 뷰의 손패를 적어 둔 뒤, 같은 판의 리플레이를 받아
 * replayRebuild 로 되살려 대조한다.
 */
import { admin, botTable, ok, sleep, autoPlay, signup } from "./lib.js";
import { rebuildReplay, replaySettlements, replayViewAt } from "../../../packages/client/src/replayRebuild.js";

const P = await signup();
autoPlay(P.c);
const code = await botTable(P.c, "tonpuu");
const A = await admin();

const liveSettles: any[] = [];
const specViews: any[] = [];
A.c.onMsg = (m: any) => {
  if (m.type === "roundOver") liveSettles.push(m.settle ?? m.result?.settle ?? null);
  if (m.type === "view" && m.view.playerId === "__spectator") specViews.push(m.view);
};
A.c.send({ type: "spectate", code });
await A.c.wait("spectateStarted", 8000);

console.log("동풍전 완주를 기다린다…");
await A.c.wait("spectateEnded", 400000);
console.log("관전 종료:", JSON.stringify(A.c.last("spectateEnded")));
console.log(`관전 중 roundOver ${liveSettles.length}건 · 관전 뷰 ${specViews.length}장`);
await sleep(1500);

// 리플레이를 받아 되살린다
A.c.send({ type: "replayList" });
const list = await A.c.wait("replayList", 10000);
const g = (list["games"] as any[]).find((x) => x.code === code);
ok(g !== undefined, "리플레이 목록에 이 판이 있다", g);
if (g === undefined) process.exit(0);
A.c.send({ type: "replayGet", gameId: g.gameId });
const data = await A.c.wait("replayData", 15000);
const lines = data["lines"] as string[];
console.log("리플레이 줄 수", lines.length);

const rb = rebuildReplay(lines);
const st = replaySettlements(rb);
console.log(`재구성 국 수 ${st.length} / 관전으로 본 국 수 ${liveSettles.filter(Boolean).length}`);

for (let i = 0; i < Math.min(st.length, liveSettles.length); i++) {
  const live = liveSettles[i];
  if (live === null || live === undefined) continue;
  const a = JSON.stringify(live.deltas ?? live);
  const b = JSON.stringify((st[i] as any).result?.settle?.deltas ?? (st[i] as any).settle?.deltas);
  ok(a === b, `국 ${i + 1} 점수 이동 일치`, { live: a, replay: b });
}

// 마지막 관전 뷰의 손패 vs 리플레이 마지막 시점 뷰
const lastLive = specViews.at(-1);
const lastRep = replayViewAt(rb, rb.states.length - 1);
const handOf = (v: any, pid: string) =>
  (v.zones[`hand:${pid}`]?.tileIds ?? [])
    .filter((t: number) => t >= 0)
    .map((t: number) => v.tiles[t]?.kind)
    .map((k: any) => (k ? `${k.suit}${k.rank}` : "?"))
    .sort()
    .join(",");
for (const p of lastRep.players) {
  const a = handOf(lastLive, p.id);
  const b = handOf(lastRep, p.id);
  ok(a === b, `마지막 시점 ${p.id} 손패 일치`, { live: a, replay: b });
}
console.log(
  "재구성 뷰에 있는 것:",
  Object.keys(lastRep.round.byPlayer["p0"] ?? {}).join(","),
);
console.log(
  "관전 뷰에 있는 것 :",
  Object.keys(lastLive?.round.byPlayer["p0"] ?? {}).join(","),
);

P.c.close();
A.c.close();
await sleep(400);
process.exit(0);
