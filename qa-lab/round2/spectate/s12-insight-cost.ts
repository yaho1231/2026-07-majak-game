/**
 * s12 — 중계 보조값의 원가. `buildSpectateInsight`는 **관전석 하나마다** 다시 돈다
 * (RoomManager.spectate 의 sink.sendView 안). 뷰는 한 번 만들어 공유하는데
 * 보조값만 N번이다 — 중계석·감독석·관리자 여럿이 붙는 대회에서 곱해진다.
 */
import { admin, botTable, sleep, autoPlay, signup } from "./lib.js";
import { buildSpectateInsight } from "../../../packages/server/src/spectateInsight.js";

const P = await signup();
autoPlay(P.c);
const code = await botTable(P.c, "tonpuu");
const A = await admin();
const views: any[] = [];
A.c.onMsg = (m: any) => {
  if (m.type === "view" && m.view.playerId === "__spectator") views.push(m.view);
};
A.c.send({ type: "spectate", code });
await A.c.wait("spectateStarted", 8000);
await sleep(25000);
console.log("표본 뷰", views.length, "장");

let worst = 0;
let total = 0;
let n = 0;
for (const v of views) {
  const t0 = performance.now();
  for (let i = 0; i < 20; i++) buildSpectateInsight(v);
  const dt = (performance.now() - t0) / 20;
  total += dt;
  n++;
  if (dt > worst) worst = dt;
}
console.log(`buildSpectateInsight 1회 평균 ${(total / n).toFixed(2)}ms · 최악 ${worst.toFixed(2)}ms`);
console.log(`관전석 6개 × 뷰 1장 = ${((total / n) * 6).toFixed(1)}ms (이벤트 루프를 그만큼 막는다)`);

P.c.close();
A.c.close();
await sleep(300);
process.exit(0);
