/**
 * "+N판" 보상이 역만 화료에서 어떻게 되는가.
 *
 * haitei_lord detail: "그대로 해저로월 쯔모로 화료할 수 있고 **+3판을 얻는다**." — 예외 없음.
 * cliff_bloom detail: "만개한 국의 화료에서는 영상개화가 1판이 아니라 **4판으로 계산**된다." — 예외 없음.
 * (대조) avenger·true_dragon detail은 같은 보상에 **"(역만에는 미적용)"** 을 명시한다.
 */
import { calculateScore, createStandardGameFromState } from "@majak/core";
import type { WinInfo } from "@majak/core";
import { winPointsWithExtraHan } from "../../../packages/content/src/util.js";
import { craft } from "../../../packages/content/test/helpers.js";

const st = craft({
  hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 1, // p0은 자 (dealerSeat=0)
});
const game = createStandardGameFromState(st);

function info(han: number, fu: number, ym: number): WinInfo {
  const points = calculateScore({
    han,
    fu,
    yakumanCount: ym,
    isDealer: false,
    winType: "tsumo",
  }).total;
  return {
    winner: "p1",
    winType: "tsumo",
    han,
    fu,
    yakumanCount: ym,
    points,
  } as unknown as WinInfo;
}

for (const [label, wi] of [
  ["평범한 손 (3판 40부 자 쯔모)", info(3, 40, 0)],
  ["만관 직전 (4판 40부)", info(4, 40, 0)],
  ["역만 1 (스안커 등, 해저로월 동반)", info(0, 40, 1)],
  ["더블 역만", info(0, 40, 2)],
] as const) {
  const bonus = winPointsWithExtraHan(game.engine.state, "p1", wi, 3, game.engine.rules);
  console.log(
    `${label}\n  기본 ${wi.points}점 → +3판 보너스 = ${bonus}점  ${bonus === 0 ? "  ← 한 푼도 안 붙는다" : ""}`,
  );
}

console.log("\n=== score.extraHan 경로(cliff_bloom·avenger·true_dragon)도 같은가 ===");
for (const ym of [0, 1]) {
  const a = calculateScore({ han: 3, fu: 40, yakumanCount: ym, isDealer: false, winType: "tsumo" }).total;
  const b = calculateScore({ han: 3 + 3, fu: 40, yakumanCount: ym, isDealer: false, winType: "tsumo" }).total;
  console.log(`  yakumanCount=${ym}: han 3 → ${a}점 / han 6 → ${b}점  (차이 ${b - a})`);
}
