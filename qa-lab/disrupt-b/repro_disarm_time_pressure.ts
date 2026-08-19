/**
 * 무장해제(disarm)가 초읽기(time_pressure)를 잠그지 못한다.
 *
 * 초읽기의 효과 전부는 **국 시작에 한 번 실리는 공개 채널 값**이다
 * (time_pressure.ts:51 armOnNextRound → `view:*:time_pressure#round` = 5).
 * 서버(HumanAgent)는 매 결정마다 그 값을 읽어 대기 시간을 5초로 줄인다.
 * 무장해제는 Modifier·Interceptor·Reaction·액티브 버튼만 게이트하므로,
 * **이미 실린 값**은 그대로 남아 잠근 국 내내 전원의 5초 제한이 계속된다.
 *
 * 눈먼 총알(blind_ron)도 같은 구조라, 효과(정산 인터셉터)는 잠기지만
 * "이 국의 론은 무작위로 날아간다"는 **공개 표시만 남는다**(잘못된 정보).
 */
import { createStandardGameFromState, installAugment, ROUND_STARTED } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { disarm } from "../../packages/content/src/augments/disarm.js";
import { timePressure } from "../../packages/content/src/augments/time_pressure.js";
import { blindRon } from "../../packages/content/src/augments/blind_ron.js";

function withAug(state: GameState, map: Record<string, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) => (map[p.id] ? { ...p, augments: [...map[p.id]!] } : p)),
  };
}

const s = withAug(
  craft({ hands: { p0: "*", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0 }),
  { p0: ["disarm"], p1: ["time_pressure", "blind_ron"] },
);
const game = createStandardGameFromState(s, undefined, []);
installAugment(game.engine, disarm, "p0", { yaku: game.yaku });
installAugment(game.engine, timePressure, "p1", { yaku: game.yaku });
installAugment(game.engine, blindRon, "p1", { yaku: game.yaku });

game.engine.actions.register({
  type: "__qa_emit",
  validate: () => null,
  toEvents: (req) => [req.payload as { type: string; payload: unknown }],
});
game.engine.submit({ player: "p0" as PlayerId, type: "__qa_emit", payload: { type: ROUND_STARTED, payload: {} } });

// ROUND_STARTED 리듀서가 phase를 되돌리므로, 그 결과 상태를 turn.act로 되돌려 이어 간다
const after: GameState = { ...game.engine.state, round: { ...game.engine.state.round, phase: "turn.act", turnSeat: 0 } };
const game2 = createStandardGameFromState(after, undefined, []);
installAugment(game2.engine, disarm, "p0", { yaku: game2.yaku });
installAugment(game2.engine, timePressure, "p1", { yaku: game2.yaku });
installAugment(game2.engine, blindRon, "p1", { yaku: game2.yaku });

const chan = (frag: string): [string, unknown] | undefined =>
  Object.entries(game2.engine.state.augmentData).find(([k]) => k.includes(frag));

console.log("국 시작 후 초읽기 채널:", JSON.stringify(chan("view:*:time_pressure")));
console.log("국 시작 후 눈먼 총알 채널:", JSON.stringify(chan("view:*:blind_ron")));

for (const id of ["time_pressure", "blind_ron"]) {
  const r = game2.engine.submit({
    player: "p0" as PlayerId,
    type: "disarm_lock",
    payload: { target: "p1" as PlayerId, augmentId: id },
  });
  console.log(`무장해제(${id}):`, r.ok, r.ok ? "" : (r as { reason?: string }).reason);
}
console.log("무장해제 목록:", JSON.stringify(game2.engine.state.augmentData["engine:disarmed#round"]));
console.log("잠근 뒤 초읽기 채널:", JSON.stringify(chan("view:*:time_pressure")), "  ← 5초 제한이 그대로 산다");
console.log("잠근 뒤 눈먼 총알 채널:", JSON.stringify(chan("view:*:blind_ron")), "  ← 효과는 죽었는데 표시는 산다");
