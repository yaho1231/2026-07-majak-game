/** 의심 1 재검증 — Multiply 단계 연쇄. 각 증강의 detail이 약속한 배수 대상과 대조한다. */
import { jackpot } from "../../packages/content/src/augments/jackpot.js";
import { letItRide } from "../../packages/content/src/augments/let_it_ride.js";
import { bloodContract } from "../../packages/content/src/augments/blood_contract.js";
import { roundKey } from "../../packages/content/src/util.js";
import { roundScopedKey } from "../../packages/content/src/augments/roundScope.js";
import { craft } from "../../packages/content/test/helpers.js";
import { realWinPayload, scene, settle, sum, win } from "../score-a/settleRig.js";

const base = craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" } });
const rk = roundKey(base);
const HAND = 8000;
const BC_KEY = roundScopedKey("blood_contract", "yaku", base, "p0");

function run(label: string, opts: { mult?: number; streak?: number; contract?: boolean; pot?: number; honba?: number }) {
  const defs = [
    ...(opts.mult !== undefined ? [jackpot] : []),
    ...(opts.streak !== undefined ? [letItRide] : []),
    ...(opts.contract === true ? [bloodContract] : []),
  ];
  const data: Record<string, unknown> = {};
  if (opts.mult !== undefined) data[roundScopedKey("jackpot", "mult", base, "p0")] = opts.mult;
  if (opts.streak !== undefined) data[`let_it_ride:streak:p0`] = opts.streak;
  if (opts.contract === true) data[BC_KEY] = "tanyao";
  const g = scene({ augments: { p0: defs }, data, potBefore: opts.pot ?? 0 });
  const pot = opts.pot ?? 0;
  const honba = opts.honba ?? 0;
  const gain = HAND + pot + honba;
  const payload = realWinPayload(g, {
    deltas: { p0: gain, p1: 0, p2: -(HAND + honba), p3: 0 },
    winInfos: [win({
      winner: "p0", from: "p2", winType: "ron", points: HAND, han: 4, fu: 40,
      yaku: [{ id: "tanyao", name: "탕야오", han: 1 }],
      riichiPotGain: pot, honbaBonus: honba,
    } as never)],
  });
  const out = settle(g, payload);
  console.log(`${label}\n  p0 ${gain} -> ${out.deltas["p0"]}  (뱅크발행 ${sum(out.deltas) - sum(payload.deltas)})  notes=${JSON.stringify(out.augPoints)}`);
  return out.deltas["p0"] ?? 0;
}

console.log("=== A. 단독 (기준선) ===");
run("jackpot 3배만", { mult: 3 });
run("let_it_ride 4배만(streak3)", { streak: 3 });
run("blood_contract 1.5배만", { contract: true });

console.log("\n=== B. 두 개 조합 — 각자의 detail이 약속한 값과 대조 ===");
{
  const a = run("let_it_ride(4배) + blood_contract(1.5배)", { streak: 3, contract: true });
  // detail: let_it_ride = 손 화료점만 ×4 → +24000 ; blood_contract = 손의 화료점뿐 ×1.5 → +4000
  console.log(`  기대(각 detail대로, 손 8000에만 각각 적용) = ${8000 + 24000 + 4000}   실제 = ${a}   차 = ${a - 36000}`);
}
{
  const a = run("jackpot(3배) + blood_contract(1.5배)", { mult: 3, contract: true });
  console.log(`  jackpot detail = 획득분 전체 ×3 → 24000 ; blood_contract detail = 손 화료점뿐 ×1.5 → +4000`);
  console.log(`  기대 = 28000   실제 = ${a}   차 = ${a - 28000}`);
}
{
  const a = run("jackpot(3배) + let_it_ride(4배)", { mult: 3, streak: 3 });
  console.log(`  기대(jackpot=획득분 ×3, ride=손 ×4 선적용) = ${(8000 + 24000) * 3}   실제 = ${a}`);
}

console.log("\n=== C. 셋 다 + 공탁 3000 + 3본장 900 ===");
run("셋 다", { mult: 3, streak: 3, contract: true, pot: 3000, honba: 900 });
console.log(`  손 8000·공탁 3000·본장 900. blood_contract/let_it_ride detail상 공탁·본장은 배수 제외.`);
