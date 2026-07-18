/**
 * red_five_touch (붉은 손길) — 게임당 1회, 자기 턴에 손패의 모든 5를
 * 적도라로 만든다.
 */

import {
  augmentDataSet,
  defineAugment,
  handIdsOf,
  isNumberSuit,
  kindOf,
  playerAtSeat,
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileKindChangedPayload,
} from "@majak/core";

const ID = "red_five_touch";
const ACTION = "red_touch";
const usedKey = (player: PlayerId): string => `${ID}:used:${player}`;

/** 손패에서 적도라로 바꿀 수 있는 수패 5의 id 목록 */
function fiveIdsOf(state: GameState, player: PlayerId): number[] {
  return handIdsOf(state, player).filter((id) => {
    const kind = kindOf(state, id);
    return isNumberSuit(kind) && kind.rank === 5;
  });
}

const redTouchAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no red_five_touch augment";
    if (state.augmentData[usedKey(req.player)] === true) {
      return "red_touch already used";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (fiveIdsOf(state, req.player).length === 0) return "no fives in hand";
    return null;
  },
  toEvents: (req, { state }) => {
    const changes: TileKindChangedPayload["changes"] = fiveIdsOf(
      state,
      req.player,
    ).map((tileId) => ({ tileId, attrs: { red: true } }));
    return [tileKindChanged(changes), augmentDataSet(usedKey(req.player), true)];
  },
};

export const redFiveTouch: AugmentDef = defineAugment({
  id: ID,
  tier: "silver",
  name: "붉은 손길",
  description: "게임당 1회, 자기 턴에 손패의 모든 5를 적도라로 만든다.",
  install(ctx) {
    const { engine } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(redTouchAction);
    }

    // 보유자 턴에 후보 노출 — 합법성은 validate가 최종 판정
    ctx.holderTurnOptions(() => [{ type: ACTION, payload: {} }]);
  },
});
