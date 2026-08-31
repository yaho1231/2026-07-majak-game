/**
 * H3 — "+N판" 겹침을 밑값 판수 1~12판 전 구간에서 훑는다.
 *
 * 두 가지 가설을 한 번에 잰다.
 *  (가) counter는 `winPointsWithExtraHan`을 직접 부르며 hanSoFar를 넘기지 않는다
 *       (counter.ts:368-374). → 앞 카드의 판을 못 보고 원본 info.han에서 다시 센다.
 *  (나) `addWinPointBonus`는 환산액이 0이면 augPoint 줄 자체를 남기지 않는다
 *       (util.ts:825-826). 만관 밴드 안에서 "+2판"이 0원이 되는 국에서는 그 **판수도
 *       사라져**, 뒤에 오는 "+N판" 카드의 밑값이 2판 낮아진다.
 *
 * 기대(설계 문서 docs/40 §1-3): 어떤 밑값에서도
 *   blame(+2) + counter(+3) 의 뱅크 발행 합 = S(base+5) - S(base)
 * 이어야 한다("순서와 무관하게 정확히 덧셈").
 */
import { blank, settle, win, winPayload, withAugs } from "./lib.js";
import type { PlayerId, RoundSettledPayload } from "./lib.js";
import { blameShift } from "../../../packages/content/src/augments/blame_shift.js";
import { counter as counterAug } from "../../../packages/content/src/augments/counter.js";
import { calculateScore } from "@majak/core";

const H: PlayerId = "p0";
const seedCounter = () => ({ [`counter:struck:${H}`]: true, [`counter:prev:${H}`]: "p1" });
const S = (h: number) => calculateScore({ han: h, fu: 30, yakumanCount: 0, isDealer: false, winType: "ron" }).total;

function RON(g: ReturnType<typeof withAugs>, han: number): RoundSettledPayload {
  const pts = S(han);
  return winPayload(g, { p0: pts, p1: -pts, p2: 0, p3: 0 }, [
    win({ winner: "p0", winType: "ron", from: "p1", points: pts, han, fu: 30 }),
  ]);
}
function bank(spec: unknown[], extra: () => Record<string, unknown>, han: number) {
  const g = withAugs(blank(25000, 1), spec as never, extra as never);
  const out = settle(g, RON(g, han));
  const notes = (out.augPoints ?? []) as { augId: string; player: string; points: number; han?: number }[];
  const pick = (id: string) => notes.filter((n) => n.augId === id && n.player === H);
  return {
    counter: pick("counter").reduce((a, n) => a + n.points, 0),
    counterHan: pick("counter").map((n) => n.han ?? "-").join(","),
    blame: pick("blame_shift").filter((n) => n.player === H).reduce((a, n) => a + n.points, 0),
    blameHan: pick("blame_shift").map((n) => n.han ?? "-").join(","),
  };
}

console.log("=== H3: blame_shift(+2판) × counter(직격 +3판) — 30부 자 론, 밑값 판수 스캔 ===");
console.log("base  S(b)   S(b+5)  기대합    blame단독  counter순증  실측합   판정");
for (let b = 1; b <= 12; b++) {
  const bl = bank([{ player: H, def: blameShift }], () => ({}), b).blame;
  const co = bank([{ player: H, def: counterAug }], seedCounter, b).counter; // 강탈분 포함
  const bo = bank([{ player: H, def: blameShift }, { player: H, def: counterAug }], seedCounter, b);
  const counterDelta = bo.counter - (co - 0); // 강탈분은 두 조건에서 같다 → 차이는 판수분
  const actual = bl + (bo.counter - co) + co; // 표시는 아래에서 판수분만 본다
  const wantSum = S(b + 5) - S(b);
  // 판수분만: counter 단독의 판수분 = co - 강탈분. 강탈분은 미지수이므로 **차이**로 판정한다.
  // 기대: counter의 몫이 (blame이 앞서 +2판을 얹은 만큼) 단독보다 S(b+5)-S(b+2) - (S(b+3)-S(b)) 만큼 달라야 한다.
  const wantShift = (S(b + 5) - S(b + 2)) - (S(b + 3) - S(b));
  const gotShift = bo.counter - co;
  console.log(
    `${String(b).padStart(3)}  ${String(S(b)).padStart(6)} ${String(S(b + 5)).padStart(7)}  ` +
      `${String(wantSum).padStart(7)}  ${String(bl).padStart(8)}  ` +
      `기대Δ${String(wantShift).padStart(6)} 실측Δ${String(gotShift).padStart(6)}  ` +
      `${wantShift === gotShift ? "OK" : "### 불일치 " + String(gotShift - wantShift)}` +
      `  [blame판=${bo.blameHan || "없음"}]`,
  );
  void actual; void counterDelta;
}
console.log("\n(blame판='없음' 인 줄 = 환산액이 0이라 augPoint 줄이 안 남은 국 → hanSoFar가 2판 낮아진다)");
