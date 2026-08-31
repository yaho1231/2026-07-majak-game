/**
 * H2 — counter(직격 +3판)가 `hanSoFar`를 안 받는다 (소스: counter.ts:368-374).
 *
 * 2026-08-23 라운드는 "+N판이 겹치면 덧셈이 되어야 한다"를 `addWinPointBonus`에
 * hanSoFar를 흘려 넣어 고쳤다(util.ts:820-823). 그런데 counter는 그 래퍼를 쓰지 않고
 * `winPointsWithExtraHan(...)`을 **직접** 부르면서 마지막 인자(hanSoFar)를 넘기지 않는다.
 *
 * # 예측
 * 3판 30부 자 론(3,900). blame_shift(+2판, BankTopUp id소수 0.107)가 counter(0.612)보다
 * 먼저 돈다.
 *   blame 단독      : 3판→5판 = 8,000  → 뱅크 +4,100
 *   counter 단독    : 3판→6판 = 8,000  → 뱅크 +4,100  (+ 선리치자 손 강탈분 X)
 *   둘 다 (덧셈이면): 3판→8판 = 16,000 → 뱅크 +12,100 (counter 몫은 8,000이어야 한다)
 * counter가 hanSoFar를 무시하면 counter 몫이 단독일 때와 같은 4,100에 머문다.
 *
 * 강탈분 X는 두 조건에서 같으므로, **counter의 augPoint 차이**로 판정한다.
 */
import { blank, settle, show, win, winPayload, withAugs } from "./lib.js";
import type { PlayerId, RoundSettledPayload } from "./lib.js";
import { blameShift } from "../../../packages/content/src/augments/blame_shift.js";
import { counter as counterAug } from "../../../packages/content/src/augments/counter.js";
import { scapegoat } from "../../../packages/content/src/augments/scapegoat.js";
import { roundScopedKey } from "./lib.js";
import { calculateScore } from "@majak/core";

const H: PlayerId = "p0";
const seedCounter = () => ({ [`counter:struck:${H}`]: true, [`counter:prev:${H}`]: "p1" });

const S = (h: number, dealer = false, t: "ron" | "tsumo" = "ron") =>
  calculateScore({ han: h, fu: 30, yakumanCount: 0, isDealer: dealer, winType: t }).total;

function RON(g: ReturnType<typeof withAugs>, han: number): RoundSettledPayload {
  const pts = S(han);
  return winPayload(g, { p0: pts, p1: -pts, p2: 0, p3: 0 }, [
    win({ winner: "p0", winType: "ron", from: "p1", points: pts, han, fu: 30 }),
  ]);
}
function TSUMO(g: ReturnType<typeof withAugs>, han: number): RoundSettledPayload {
  const t = S(han, false, "tsumo");
  const d = Math.round(t / 4) * 2, e = Math.round((t - d) / 2);
  return winPayload(g, { p0: t, p1: -d, p2: -e, p3: -e }, [
    win({ winner: "p0", winType: "tsumo", from: null, points: t, han, fu: 30 }),
  ]);
}

function run(label: string, spec: unknown[], extra: (s: never) => Record<string, unknown>, han: number, mk = RON) {
  const g = withAugs(blank(25000, 1), spec as never, extra as never);
  const out = settle(g, mk(g, han));
  show(label, out);
  const pts = (id: string) =>
    ((out.augPoints ?? []) as { augId: string; player: string; points: number }[])
      .filter((n) => n.augId === id && n.player === H)
      .reduce((a, n) => a + n.points, 0);
  return { out, counter: pts("counter"), blame: pts("blame_shift"), scape: pts("scapegoat") };
}

console.log("=== H2: counter(+3판) × blame_shift(+2판) — 3판30부 자 론 (3,900) ===");
console.log(`  표준: 3판=${S(3)} 5판=${S(5)} 6판=${S(6)} 8판=${S(8)}`);
const only = run("counter 단독", [{ player: H, def: counterAug }], seedCounter, 3);
const bl = run("blame_shift 단독", [{ player: H, def: blameShift }], () => ({}), 3);
const both = run("blame_shift + counter", [{ player: H, def: blameShift }, { player: H, def: counterAug }], seedCounter, 3);
console.log(`\n  counter 몫  단독=${only.counter}  함께=${both.counter}  (증가 ${both.counter - only.counter})`);
console.log(`  기대(덧셈): counter 몫이 단독보다 ${S(8) - S(5) - (S(6) - S(3))} 만큼 커야 한다 → 함께=${only.counter + (S(8) - S(5)) - (S(6) - S(3))}`);
console.log(`  blame 몫    단독=${bl.blame}  함께=${both.blame}`);
console.log(`  → 총 뱅크 발행: 단독합=${only.counter + bl.blame}  함께=${both.counter + both.blame}  ` +
  `기대(3판→8판 한 번)=${only.counter - (S(6) - S(3)) + (S(8) - S(3))}`);

console.log("\n=== H2b: counter(+3판) × scapegoat(쯔모 +2판) — 3판30부 자 쯔모 ===");
const seedScape = (s: never) => ({ [roundScopedKey("scapegoat", "target", s, H)]: "p1" });
const sOnly = run("counter 단독(쯔모)", [{ player: H, def: counterAug }], seedCounter, 3, TSUMO);
const sBoth = run("scapegoat + counter(쯔모)", [{ player: H, def: scapegoat }, { player: H, def: counterAug }],
  ((s: never) => ({ ...seedCounter(), ...seedScape(s) })) as never, 3, TSUMO);
console.log(`  counter 몫  단독=${sOnly.counter}  함께=${sBoth.counter}  scapegoat 몫=${sBoth.scape}`);
console.log(`  (scapegoat은 addWinHanBonus라 hanSoFar를 받는다 — counter만 못 받으면 여기서 갈린다)`);
