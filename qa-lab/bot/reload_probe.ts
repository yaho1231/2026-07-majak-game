/**
 * 재장전(reload) — 정책이 **언제 제안하는가**를 격자로 찍는다.
 *
 * 아레나 220판에서 재장전은 기회 37회 · 제안 0회 · 발동 0회였다.
 * 원인은 `plan({ intent: "setup", oneShot: true })`의 적기 문턱이다:
 *   bar = MIN_READINESS.setup(0.25) + ONE_SHOT_BAR(0.2) = 0.45
 *   readiness(setup) = allLast ? 0 : clamp01(1 - turn/12) * clamp01(wallLeft/40)
 * 그런데 재장전의 액션은 **다른 증강을 이미 써 버린 뒤에야** 제시된다 = 대개 중후반.
 *
 *   tsx qa-lab/bot/reload_probe.ts
 */
import { reload } from "../../packages/content/src/augments/reload.js";
import type { BotDecisionContext } from "@majak/core";

const option = { type: "reload_use", payload: { augmentId: "jackpot" } };

function ctxAt(turn: number, wallLeft: number, allLast: boolean): BotDecisionContext {
  return {
    view: { players: [{ id: "p0", augments: ["reload", "jackpot"] }] } as never,
    options: [option] as never,
    holder: "p0",
    rng: { int: () => 0 } as never,
    tenpai: false,
    shanten: 2,
    waits: [],
    turn,
    wallLeft,
    threat: 0,
    remaining: () => 4,
    safety: () => 0.5,
    placement: { rank: 2, allLast, riskAppetite: 0 },
    handPoints: 3900,
    flags: new Set() as never,
  } as never;
}

console.log("순(turn) × 패산잔량 격자 — o = 제안함, · = 제안하지 않음 (allLast=false)");
process.stdout.write("       ");
for (const w of [60, 50, 40, 30, 20, 10]) process.stdout.write(`w${String(w).padEnd(4)}`);
console.log();
for (let t = 1; t <= 14; t++) {
  process.stdout.write(`turn ${String(t).padStart(2)} `);
  for (const w of [60, 50, 40, 30, 20, 10]) {
    const out = reload.bot?.choose(ctxAt(t, w, false)) ?? null;
    process.stdout.write(`  ${out === null ? "·" : "o"}   `);
  }
  console.log();
}
const last = reload.bot?.choose(ctxAt(2, 60, true)) ?? null;
console.log(`\n올라스(allLast=true, 2순, 패산 60): ${last === null ? "제안 안 함" : "제안"}`);
console.log(
  "\n※ 재장전의 액션은 '이미 쓴 증강'이 있어야 제시된다 — 그 시점은 대개 6순 이후이고,\n" +
    "  동풍전 동4국·반장전 남4국은 통째로 allLast라 적기가 0이다.",
);
