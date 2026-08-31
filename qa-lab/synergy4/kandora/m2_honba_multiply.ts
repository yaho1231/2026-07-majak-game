/**
 * M2 — 본장 사냥꾼(본장 1개당 1,500) × 배수 3종.
 *
 * 같은 Multiply 단계인데 밑값 규약이 셋 다 다르다:
 *   let_it_ride    : min(winPoints, d) — 본장·공탁 제외 (주석 92-95)
 *   blood_contract : min(winPoints, d - pot - honba) — 본장·공탁 명시 제외 (주석 116-138)
 *   jackpot        : d - pot — **본장 포함** (주석 261-267)
 *
 * # 예측
 * 5본장 · 본장 사냥꾼 → 본장 가산 7,500. 손 8,000 론.
 *   jackpot 3배  : (8,000+7,500)×3 = 46,500  → 뱅크 발행 31,000 (본장분 15,000이 발행에 섞인다)
 *   let_it_ride 4배: 8,000×4 + 7,500 = 39,500 → 뱅크 발행 24,000
 * 즉 본장 사냥꾼이 jackpot의 뱅크 발행액만 키운다.
 */
import { blank, settle, show, win, winPayload, withAugs, roundScopedKey } from "./lib.js";
import type { GameState, PlayerId, RoundSettledPayload } from "./lib.js";
import { jackpot } from "../../../packages/content/src/augments/jackpot.js";
import { letItRide } from "../../../packages/content/src/augments/let_it_ride.js";
import { bloodContract } from "../../../packages/content/src/augments/blood_contract.js";
import { honbaHunter } from "../../../packages/content/src/augments/honba_hunter.js";

const H: PlayerId = "p0";
const HONBA = 5;
const PER = 1500; // honba_hunter가 켠 단가 (score.honbaPerStick)

function RON(g: ReturnType<typeof withAugs>, perStick: number): RoundSettledPayload {
  const hb = HONBA * perStick;
  return winPayload(g, { p0: 8000 + hb, p1: -(8000 + hb), p2: 0, p3: 0 }, [
    win({ winner: "p0", winType: "ron", from: "p1", points: 8000, han: 5, fu: 30,
      yaku: [{ id: "riichi", name: "리치", han: 1 }], honbaBonus: hb } as never),
  ], { honba: HONBA });
}

const merge = (...fs: ((s: GameState) => Record<string, unknown>)[]) => (s: GameState) =>
  Object.assign({}, ...fs.map((f) => f(s)));
const seedJack = (m: number) => (s: GameState) => ({ [roundScopedKey("jackpot", "mult", s, H)]: m });
const seedRide = (n: number) => () => ({ [`let_it_ride:streak:${H}`]: n });
const seedBlood = (s: GameState) => ({ [roundScopedKey("blood_contract", "yaku", s, H)]: "riichi" });

function R(label: string, spec: unknown[], extra: (s: GameState) => Record<string, unknown>, perStick: number) {
  const g = withAugs(blank(25000, 1), spec as never, extra);
  const out = settle(g, RON(g, perStick));
  show(label, out);
}

for (const [tag, perStick] of [["표준 본장(300)", 300], ["본장 사냥꾼(1500)", PER]] as [string, number][]) {
  console.log(`\n=== M2 ${tag} · ${HONBA}본장 · 손 8,000 론 (밑델타 ${8000 + HONBA * perStick}) ===`);
  const spec = perStick === PER ? [{ player: H, def: honbaHunter }] : [];
  R("배수 없음", spec, () => ({}), perStick);
  R("jackpot 3배", [...spec, { player: H, def: jackpot }], seedJack(3), perStick);
  R("let_it_ride 4배", [...spec, { player: H, def: letItRide }], seedRide(3), perStick);
  R("blood_contract 1.5배", [...spec, { player: H, def: bloodContract }], seedBlood, perStick);
  R("jackpot 0.5배", [...spec, { player: H, def: jackpot }], seedJack(0.5), perStick);
  R("jackpot3 + let4", [...spec, { player: H, def: jackpot }, { player: H, def: letItRide }],
    merge(seedJack(3), seedRide(3)), perStick);
}
console.log("\n본장분(=상대가 실제로 내는 돈)이 배수를 타면 그 차액은 전부 뱅크 발행이다.");
