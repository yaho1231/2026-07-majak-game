/**
 * 등 떠밀기(push_riichi) × 누명(frame_up).
 *
 * 누명은 표준 discard를 거치지 않고 `TILE_DISCARDED`를 직접 내면서 `creditTo`로
 * **패의 명의를 남에게** 돌린다. 등 떠밀기의 인터셉터는 그 이벤트를 보고 강제 리치를
 * 얹는다 — 그 결과 **리치 선언패가 선언자의 바닥에 한 장도 없는 리치**가 생긴다.
 */
import { createStandardGameFromState, installAugment, discardsZone, handZone } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { pushRiichi } from "../../packages/content/src/augments/push_riichi.js";
import { frameUp } from "../../packages/content/src/augments/frame_up.js";

function withAug(state: GameState, map: Record<string, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) => (map[p.id] ? { ...p, augments: [...map[p.id]!] } : p)),
  };
}
const rk = (s: GameState): string =>
  `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;

const base = craft({
  // p1: 123m456m789m123p + 5z + 9p — 9p를 버리면 5z 단기 텐파이(멘젠)
  hands: { p0: "*", p1: "123m456m789m123p5z9p", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 1,
  drawnLastFor: "p1",
});
const seeded: GameState = {
  ...withAug(base, { p0: ["push_riichi"], p1: ["frame_up"] }),
  augmentData: {
    ...base.augmentData,
    [`push_riichi:brand:${rk(base)}:p0#round`]: "p1",
    [`push_riichi:used:${rk(base)}:p0#round`]: true,
    [`view:*:push_riichi:p0#round`]: "p1",
  },
};
const game = createStandardGameFromState(seeded, undefined, []);
installAugment(game.engine, pushRiichi, "p0", { yaku: game.yaku });
installAugment(game.engine, frameUp, "p1", { yaku: game.yaku });

const st0 = game.engine.state;
const hand = st0.zones[handZone("p1")]!.tileIds;
const nine = hand.find((id) => {
  const k = st0.tiles[id]!.kind;
  return k.suit === "pin" && k.rank === 9;
})!;
console.log("p1 점수:", st0.players.find((p) => p.id === "p1")!.score, " 손패", hand.length, "장");

const res = game.engine.submit({
  player: "p1" as PlayerId,
  type: "frame_discard",
  payload: { tileId: nine, target: "p2" as PlayerId },
});
console.log("누명 제출:", res.ok, res.ok ? "" : (res as { reason?: string }).reason);

const st = game.engine.state;
console.log("p1 리치 상태:", JSON.stringify(st.round.byPlayer["p1"]?.riichi));
console.log("p1 점수(리치봉 1000 차감?):", st.players.find((p) => p.id === "p1")!.score,
  " 공탁:", st.round.riichiPot);
console.log("p1 바닥:", st.zones[discardsZone("p1")]!.tileIds.length, "장",
  "  p2 바닥:", st.zones[discardsZone("p2")]!.tileIds.length, "장 (심긴 패)");
console.log("lastDiscard:", JSON.stringify(st.round.lastDiscard));
console.log("p1 discardedKinds:", JSON.stringify(st.round.byPlayer["p1"]?.discardedKinds),
  " p2 discardedKinds:", JSON.stringify(st.round.byPlayer["p2"]?.discardedKinds));
const riichi = st.round.byPlayer["p1"]?.riichi as { tileId?: number } | null | undefined;
if (riichi != null && typeof riichi === "object") {
  const tid = (riichi as Record<string, unknown>)["tileId"];
  console.log("리치 선언패 id:", tid, " — p1 바닥에 있는가:",
    st.zones[discardsZone("p1")]!.tileIds.includes(tid as never),
    " p2 바닥에 있는가:", st.zones[discardsZone("p2")]!.tileIds.includes(tid as never));
}
console.log("낙인 남았나:", JSON.stringify(st.augmentData[`push_riichi:brand:${rk(st)}:p0#round`]));
