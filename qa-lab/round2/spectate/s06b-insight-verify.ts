/**
 * s06b — **서버가 실제로 보내는** 중계 패널 값이 좌석 뱃지와 같은가 (확정 2·3 회귀).
 *
 * s06/s10 은 «옛 셈과 옳은 셈이 얼마나 다른가»를 보여 주는 계측이라, 서버를 고쳐도
 * 숫자가 그대로다(둘 다 로컬에서 두 공식을 돌릴 뿐 `spectateInsight` 메시지를 읽지
 * 않는다). 이 스크립트는 **서버가 보낸 `spectateInsight.seats[].shanten`** 을 받아
 * 좌석 뱃지와 같은 셈(모든 버림 후보의 최소값 · 그 좌석의 화료형 옵션)과 대조한다.
 *
 * 실행: ./qa-lab/round2/spectate/run.sh qa-lab/round2/spectate/s06b-insight-verify.ts
 */
import { admin, botTable, sleep, autoPlay, signup } from "./lib.js";
import { shantenOf, handZone } from "../../../packages/core/src/index.js";

const P = await signup();
autoPlay(P.c);
const code = await botTable(P.c, "tonpuu");
const A = await admin();

let lastView: any = null;
let checked = 0;
let mismatch = 0;
let seatOptSeen = 0;
const samples: string[] = [];

A.c.onMsg = (m: any) => {
  if (m.type === "view" && m.view.playerId === "__spectator") {
    lastView = m.view;
    return;
  }
  if (m.type !== "spectateInsight" || lastView === null) return;
  const v = lastView;
  if (v.seatScoringOptions !== undefined) seatOptSeen++;
  for (const s of m.seats) {
    const ids: number[] = v.zones[handZone(s.id)]?.tileIds ?? [];
    const hand = ids.map((id: number) => v.tiles[id]?.kind).filter(Boolean);
    if (hand.length === 0) continue;
    const meldCount = v.round.byPlayer[s.id]?.meldCount ?? 0;
    const opts = v.seatScoringOptions?.[s.id];
    // 좌석 뱃지와 같은 셈 — 14장이면 모든 버림 후보의 최소값.
    let want: number;
    if (hand.length % 3 === 2) {
      want = 99;
      for (let i = 0; i < hand.length; i++) {
        const x = shantenOf(hand.filter((_: any, j: number) => j !== i) as any, meldCount, opts);
        if (x < want) want = x;
      }
    } else {
      want = shantenOf(hand as any, meldCount, opts);
    }
    checked++;
    if (s.shanten !== want) {
      mismatch++;
      if (samples.length < 5) {
        samples.push(
          `${s.id} 손 ${hand.map((k: any) => `${k.suit}${k.rank}`).join(" ")} → 서버 ${s.shanten} / 뱃지 ${want}`,
        );
      }
    }
  }
};

A.c.send({ type: "spectate", code });
await A.c.wait("spectateStarted", 8000);
await sleep(60000);

console.log(`서버 spectateInsight ${checked}건 대조 · 어긋남 ${mismatch}건`);
console.log(`좌석별 화료형 옵션(seatScoringOptions)이 실린 뷰: ${seatOptSeen > 0 ? "있다" : "없다"}`);
for (const s of samples) console.log("  " + s);
console.log(
  mismatch === 0 && checked > 0
    ? "  ok   중계 패널과 좌석 뱃지가 같은 값을 말한다"
    : `  FAIL 두 숫자가 갈린다 (${mismatch}/${checked})`,
);

P.c.close();
A.c.close();
await sleep(300);
process.exit(mismatch === 0 && checked > 0 ? 0 : 1);
