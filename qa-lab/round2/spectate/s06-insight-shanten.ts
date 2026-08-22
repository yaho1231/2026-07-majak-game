/**
 * s06 — 중계 패널의 샹텐이 «한 장 버린 뒤의 최선»이 아니다.
 *
 * docs/36 §5(1차)는 "14장이면 한 장 버린 뒤의 최선"이라고 적고, 클라이언트의
 * 샹텐 뱃지(OpponentStrip)는 실제로 모든 버림 후보를 돌린다.
 * 그런데 서버가 만드는 중계 패널 값(spectateInsight)은 **배열의 마지막 한 장**을
 * 그냥 잘라 낸다:
 *   spectateInsight.ts:93  shantenOf(hand.length % 3 === 2 ? hand.slice(0, -1) : hand, meldCount)
 * 손패 배치(handOrder)에 따라 마지막 장은 아무 패나 될 수 있어, 같은 화면의
 * 두 숫자(패널 vs 좌석 뱃지)가 어긋난다.
 *
 * 이 스크립트는 관전 뷰를 그대로 받아 두 값을 직접 계산해 대조한다.
 */
import { admin, botTable, sleep, autoPlay, signup } from "./lib.js";
import { shantenOf, handZone, meldsZone } from "../../../packages/core/src/index.js";

const P = await signup();
autoPlay(P.c);
const code = await botTable(P.c, "tonpuu");
const A = await admin();

let checked = 0;
let mismatch = 0;
const samples: string[] = [];

A.c.onMsg = (m: any) => {
  if (m.type !== "view" || m.view.playerId !== "__spectator") return;
  const v = m.view;
  for (const p of v.players) {
    const ids: number[] = v.zones[handZone(p.id)]?.tileIds ?? [];
    const hand = ids.map((id: number) => v.tiles[id]?.kind).filter(Boolean);
    if (hand.length === 0 || hand.length % 3 !== 2) continue;
    const meldCount = v.round.byPlayer[p.id]?.meldCount ?? 0;
    const naive = shantenOf(hand.slice(0, -1) as any, meldCount); // 서버가 쓰는 셈
    let best = 99;
    for (let i = 0; i < hand.length; i++) {
      const s = shantenOf(hand.filter((_: any, j: number) => j !== i) as any, meldCount);
      if (s < best) best = s;
    }
    checked++;
    if (naive !== best) {
      mismatch++;
      if (samples.length < 5) {
        samples.push(
          `${p.id} 손 ${hand.map((k: any) => `${k.suit}${k.rank}`).join(" ")} → 패널 ${naive}샹텐 / 실제 최선 ${best}샹텐`,
        );
      }
    }
  }
};

A.c.send({ type: "spectate", code });
await A.c.wait("spectateStarted", 8000);
await sleep(60000);

console.log(`14장 시점 ${checked}건 검사 · 어긋남 ${mismatch}건 (${((mismatch / Math.max(1, checked)) * 100).toFixed(1)}%)`);
for (const s of samples) console.log("  " + s);

P.c.close();
A.c.close();
await sleep(300);
process.exit(0);
