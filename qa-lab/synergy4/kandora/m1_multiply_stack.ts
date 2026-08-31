/**
 * M1 — Multiply 단계 배수 카드끼리의 곱/합 순서.
 *
 * 대상: let_it_ride(연승 최대 4배) · jackpot(룰렛 0.5~3배) · blood_contract(계약 1.5배)
 * 셋 다 SETTLE_STAGE.Multiply. 같은 사람이 들면 순서는 idFraction으로만 갈린다:
 *   let_it_ride 0.354 → jackpot 0.463 → blood_contract 0.814
 *
 * # 예측 (문구·주석 근거)
 * 손 8,000 쯔모(본장 0·공탁 0), p0 보유.
 *  - 단독 let_it_ride 4배  : 8,000 → 32,000  (뱅크 +24,000)
 *  - 단독 jackpot 3배      : 8,000 → 24,000  (뱅크 +16,000)
 *  - 단독 blood_contract   : 8,000 → 12,000  (뱅크 +4,000)
 *
 * let_it_ride:96-99 와 blood_contract:129-138 은 **밑값을 winInfos[].points(손의 화료점)로
 * 고정**한다고 명시한다 — "앞 단계가 얹은 몫에는 손대지 않는다". 그 규약대로면
 *  - let + blood      = 8,000 + 24,000 + 4,000 = 36,000 (4.5배)
 *  - let + jackpot    = 8,000 + 24,000 + 16,000 = 48,000 (6배)
 *  - 셋 전부          = 52,000 (6.5배)
 *
 * 그런데 jackpot:266-270 만 밑값이 `d - pot` = **현재 델타**다. 이 예측이 틀리면
 * jackpot이 앞 카드의 뱅크 발행분까지 다시 곱한 것이다 (지수 폭발).
 */
import { blank, settle, show, sum, win, winPayload, withAugs, roundScopedKey, roundKey } from "./lib.js";
import type { GameState, PlayerId } from "./lib.js";
import { letItRide } from "../../../packages/content/src/augments/let_it_ride.js";
import { jackpot } from "../../../packages/content/src/augments/jackpot.js";
import { bloodContract } from "../../../packages/content/src/augments/blood_contract.js";

const H: PlayerId = "p0";

/** 손 8,000 쯔모 — 자 8,000 (오야 2,000 + 자 각 2,000 은 픽스처에서 단순화) */
const TSUMO_8K = (g: ReturnType<typeof withAugs>, honba = 0, pot = 0) =>
  winPayload(
    g,
    { p0: 8000 + honba * 300 + pot, p1: -2000 - honba * 100, p2: -2000 - honba * 100, p3: -4000 - honba * 100 },
    [
      win({
        winner: "p0", winType: "tsumo", points: 8000, han: 5, fu: 30,
        yaku: [{ id: "riichi", name: "리치", han: 1 }],
        ...(honba > 0 ? { honbaBonus: honba * 300 } : {}),
        ...(pot > 0 ? { riichiPotGain: pot } : {}),
      } as never),
    ],
    { honba },
  );

function seedJackpot(mult: number) {
  return (s: GameState) => ({ [roundScopedKey("jackpot", "mult", s, H)]: mult });
}
function seedBlood(s: GameState) {
  return { [roundScopedKey("blood_contract", "yaku", s, H)]: "riichi" };
}
function seedRide(streak: number) {
  return () => ({ [`let_it_ride:streak:${H}`]: streak });
}

const merge = (...fs: ((s: GameState) => Record<string, unknown>)[]) => (s: GameState) =>
  Object.assign({}, ...fs.map((f) => f(s)));

function run(label: string, defs: { player: PlayerId; def: never }[], extra: (s: GameState) => Record<string, unknown>): number {
  const g = withAugs(blank(), defs as never, extra);
  const out = settle(g, TSUMO_8K(g));
  show(label, out);
  return out.deltas[H] ?? 0;
}

console.log("=== M1: Multiply 단계 배수 겹침 (손 8,000 쯔모, 본장0 공탁0) ===");
const base = run("기준(증강 없음)", [{ player: H, def: letItRide as never }], seedRide(0));
const only = { ride: 0, jack: 0, blood: 0 };
only.ride = run("단독 let_it_ride (연승3→4배)", [{ player: H, def: letItRide as never }], seedRide(3));
only.jack = run("단독 jackpot (3배)", [{ player: H, def: jackpot as never }], seedJackpot(3));
only.blood = run("단독 blood_contract (1.5배)", [{ player: H, def: bloodContract as never }], seedBlood);

const rj = run("let_it_ride + jackpot",
  [{ player: H, def: letItRide as never }, { player: H, def: jackpot as never }],
  merge(seedRide(3), seedJackpot(3)));
const rb = run("let_it_ride + blood_contract",
  [{ player: H, def: letItRide as never }, { player: H, def: bloodContract as never }],
  merge(seedRide(3), seedBlood));
const jb = run("jackpot + blood_contract",
  [{ player: H, def: jackpot as never }, { player: H, def: bloodContract as never }],
  merge(seedJackpot(3), seedBlood));
const all3 = run("셋 전부",
  [{ player: H, def: letItRide as never }, { player: H, def: jackpot as never }, { player: H, def: bloodContract as never }],
  merge(seedRide(3), seedJackpot(3), seedBlood));

console.log("\n--- 가산 규약(밑값=손의 화료점) 기대치와 대조 ---");
const addBonus = (v: number) => v - base;
const t = (label: string, actual: number, expected: number) =>
  console.log(`${label.padEnd(30)} 기대 ${String(expected).padStart(7)}  실측 ${String(actual).padStart(7)}  ${actual === expected ? "OK" : `### 불일치 (배율 ${(actual / expected).toFixed(2)})`}`);
t("let + jackpot", rj, base + addBonus(only.ride) + addBonus(only.jack));
t("let + blood", rb, base + addBonus(only.ride) + addBonus(only.blood));
t("jackpot + blood", jb, base + addBonus(only.jack) + addBonus(only.blood));
t("셋 전부", all3, base + addBonus(only.ride) + addBonus(only.jack) + addBonus(only.blood));

console.log("\n--- 0.5배(축소) 룰렛이 앞 카드의 발행분까지 깎는가 ---");
const half = run("단독 jackpot (0.5배)", [{ player: H, def: jackpot as never }], seedJackpot(0.5));
const rideHalf = run("let_it_ride(4배) + jackpot(0.5배)",
  [{ player: H, def: letItRide as never }, { player: H, def: jackpot as never }],
  merge(seedRide(3), seedJackpot(0.5)));
console.log(`가산 규약 기대: ${base + addBonus(only.ride) + addBonus(half)}  실측: ${rideHalf}`);

console.log("\n--- 본장·공탁이 배수 밖인가 (3본장 + 공탁 2,000) ---");
for (const [label, defs, extra] of [
  ["단독 jackpot(3배)", [{ player: H, def: jackpot }], seedJackpot(3)],
  ["단독 let_it_ride(4배)", [{ player: H, def: letItRide }], seedRide(3)],
] as never[]) {
  const g = withAugs(blank(), defs as never, extra as never);
  const p = TSUMO_8K(g, 3, 2000);
  const before = p.deltas[H];
  const out = settle(g, p);
  show(`${label} 본장3+공탁2000 (전 ${before})`, out);
}
console.log(`\n(총합 0이 아닌 부분은 전부 뱅크 발행이다 — 지불자 금액은 변하지 않는다)`);
void sum;
void roundKey;
