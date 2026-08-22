/**
 * s02b — 지연 관전석이 실제로 몇 초 뒤처지는지 잰다 (s02의 근거).
 * 대국자와 관전자가 받은 «같은 뷰»(round.turnCount + turnSeat + 손패 장수)의
 * 도착 시각 차이를 본다.
 */
import { admin, botTable, sleep, autoPlay, signup, ok } from "./lib.js";

const DELAY = 10;
const P = await signup();
autoPlay(P.c);
const code = await botTable(P.c, "tonpuu");

const pStamp = new Map<string, number>();
P.c.onMsg = ((prev) => (m: any) => {
  prev?.(m);
  if (m.type === "view") {
    const r = m.view.round;
    const k = `${r.roundWind}-${r.dealerSeat}-${r.turnCount}-${r.turnSeat}-${m.view.zones["discards:p0"]?.tileIds.length}`;
    if (!pStamp.has(k)) pStamp.set(k, Date.now());
  }
})(P.c.onMsg);

const A = await admin();
const lags: number[] = [];
A.c.onMsg = (m: any) => {
  if (m.type === "view") {
    const r = m.view.round;
    const k = `${r.roundWind}-${r.dealerSeat}-${r.turnCount}-${r.turnSeat}-${m.view.zones["discards:p0"]?.tileIds.length}`;
    const t = pStamp.get(k);
    if (t !== undefined) lags.push(Date.now() - t);
  }
};
A.c.send({ type: "spectate", code, delaySeconds: DELAY });
await A.c.wait("spectateStarted", 8000);

await sleep(35000);
lags.sort((a, b) => a - b);
console.log(`짝지은 뷰 ${lags.length}개, 지연(ms):`, lags.slice(0, 3), "…", lags.slice(-3));
const med = lags[Math.floor(lags.length / 2)] ?? -1;
console.log("중앙값", med, "ms (설정", DELAY * 1000, "ms)");
ok(Math.abs(med - DELAY * 1000) < 1500, "관전석이 설정한 만큼 정확히 뒤처진다");

P.c.send({ type: "leaveRoom" });
P.c.close();
A.c.close();
await sleep(400);
process.exit(0);
