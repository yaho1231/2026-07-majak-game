/**
 * D1 — 깡 계열 3~4장이 겹쳤을 때의 실판(score.extraHan) 합산과 최종 타점.
 *
 * snake_kan(연속 4장 깡) · cliff_bloom(깡 2회 → 즉시 만개 화료, 영상개화 4판 취급)
 * · ankan_dora(안깡 묶음당 +4판) · north_trader(北 장당 +1판) 은 전부 안깡/실판 축이다.
 *
 * # 예측
 * snake_kan은 `kan_closed` 멜드를 만든다(standardActions:540-545) → ankan_dora의
 * `ankanMelds`(kind === "kan_closed")에 그대로 잡힌다. 그러면
 *   snake 2연깡 + bloom  : extraHan = 3 (만개 영상개화 +3)
 *   + ankan_dora         : extraHan = 3 + 4×2 = **11**
 * 이어야 하고, 역만이 서는 손에서는 코어가 extraHan을 통째로 0으로 만든다
 * (standardActions:936-940 — 의도된 동작).
 *
 * 그리고 그 판수가 뚫린 천장(uncapped 곡선)까지 그대로 흘러야 한다.
 */
import { craft, setup, evalWin, extraHan, table, FlowController } from "../../synergy3/kandora/lib.js";
import type { TileId } from "../../synergy3/kandora/lib.js";
import { snakeKan } from "../../../packages/content/src/augments/snake_kan.js";
import { cliffBloom } from "../../../packages/content/src/augments/cliff_bloom.js";
import { ankanDora } from "../../../packages/content/src/augments/ankan_dora.js";
import { aotenjouCeiling } from "../../../packages/content/src/augments/aotenjou_ceiling.js";
import { calculateScore } from "@majak/core";

/* eslint-disable @typescript-eslint/no-explicit-any */

function run(hand: string, augs: any[]) {
  const st = craft({ hands: { p0: hand, p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
  const game = setup(st, augs);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  let kans = 0;
  for (let i = 0; i < 8; i++) {
    if (status.kind !== "awaiting") break;
    const pr = status.prompts.find((x: any) => x.player === "p0");
    if (!pr) { const q = status.prompts[0]; status = flow.submit(q.player, q.options.find((o: any) => o.type === "pass") ?? q.options[0]); continue; }
    const o = pr.options.find((x: any) => x.type === "ankan");
    if (!o) break;
    status = flow.submit("p0", o);
    kans++;
  }
  const s = game.engine.state;
  const ev = s.round.lastDrawnTile === null ? null : evalWin(game, "p0", "tsumo", s.round.lastDrawnTile as TileId);
  const eh = extraHan(game, "p0");
  const baseHan = ev?.han ?? 0;
  const ym = ev?.yakumanCount ?? 0;
  const totalHan = ym > 0 ? baseHan : baseHan + eh;
  const std = calculateScore({ han: totalHan, fu: ev?.fu ?? 30, yakumanCount: ym, isDealer: false, winType: "tsumo" }).total;
  const unc = calculateScore({ han: totalHan, fu: ev?.fu ?? 30, yakumanCount: ym, isDealer: false, winType: "tsumo", uncapped: true }).total;
  return {
    손패: hand, 깡: kans, 화료: ev?.ok ?? false, 역만: ym,
    "역han": baseHan, extraHan: eh, "총han": totalHan,
    "표준점수": std, "천장뚫음": unc, "천장차": unc - std,
  };
}

const A = { snake: { def: snakeKan, holder: "p0" as const }, bloom: { def: cliffBloom, holder: "p0" as const },
  ankan: { def: ankanDora, holder: "p0" as const }, aoten: { def: aotenjouCeiling, holder: "p0" as const } };

// 역만이 서지 않는 손을 고른다(위 K표 6~9행)
const HANDS = ["2345m4567p123s999s", "3456m2345s123p999s", "1234m6789p258s777z"];

for (const h of HANDS) {
  table(`D1: ${h}`, [
    { 조합: "snake만", ...run(h, [A.snake]) },
    { 조합: "snake+ankan_dora", ...run(h, [A.snake, A.ankan]) },
    { 조합: "snake+bloom", ...run(h, [A.snake, A.bloom]) },
    { 조합: "snake+bloom+ankan_dora", ...run(h, [A.snake, A.bloom, A.ankan]) },
    { 조합: "snake+bloom+ankan+aoten", ...run(h, [A.snake, A.bloom, A.ankan, A.aoten]) },
  ]);
}

console.log("\n판정 기준: extraHan(snake+bloom+ankan) = 3(만개) + 4×깡수 이어야 합산이 성립한다.");
console.log("           역만이 선 손은 코어가 extraHan을 0으로 만든다(의도).");
