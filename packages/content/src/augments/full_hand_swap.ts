/**
 * full_hand_swap (통째로 바꾸기) — 게임당 1회, 국의 첫 순(turnCount<=1)에
 * 상대와 손패 전체(쯔모패 제외 13장)를 맞바꾼다.
 */

import {
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  moveTiles,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
} from "@majak/core";

const ID = "full_hand_swap";
const ACTION = "hand_swap";
/** 이 증강이 만들어내는 이벤트 — id에서 파생시켜 충돌 방지 */
const FULL_HAND_SWAP_PERFORMED = "FullHandSwapPerformed";
const usedKey = (player: PlayerId): string => `${ID}:used:${player}`;

interface FullHandSwapPayload {
  holder: PlayerId;
  target: PlayerId;
  /** 보유자 → 상대에게 넘어가는 손패 (쯔모패 제외) */
  give: TileId[];
  /** 상대 → 보유자에게 넘어오는 손패 전체 */
  take: TileId[];
}

const handSwapAction: ActionDef<{ target: PlayerId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no full_hand_swap augment";
    if (state.augmentData[usedKey(req.player)] === true) {
      return "hand_swap already used";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.turnCount > 1) return "only on the first turn";
    const target = state.players.find((p) => p.id === req.payload.target);
    if (target === undefined) return "unknown target";
    if (target.id === req.player) return "cannot target yourself";
    if (state.round.byPlayer[target.id]?.riichi != null) {
      return "target is in riichi";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const drawn = state.round.lastDrawnTile;
    const payload: FullHandSwapPayload = {
      holder: req.player,
      target: req.payload.target,
      give: handIdsOf(state, req.player).filter((id) => id !== drawn),
      take: [...handIdsOf(state, req.payload.target)],
    };
    return [{ type: FULL_HAND_SWAP_PERFORMED, payload }];
  },
};

export const fullHandSwap: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  name: "통째로 바꾸기",
  description:
    "게임당 1회, 국의 첫 순에 상대를 지정해 손패 전체(쯔모패 제외)를 통째로 맞바꾼다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(FULL_HAND_SWAP_PERFORMED)) {
      engine.reducers.register(FULL_HAND_SWAP_PERFORMED, (state, event) => {
        const p = event.payload as FullHandSwapPayload;
        let zones = moveTiles(
          state.zones,
          handZone(p.holder),
          handZone(p.target),
          p.give,
        );
        zones = moveTiles(zones, handZone(p.target), handZone(p.holder), p.take);
        const next: GameState = {
          ...state,
          zones,
          augmentData: { ...state.augmentData, [usedKey(p.holder)]: true },
        };
        return next;
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(handSwapAction);
    }

    // 보유자 턴에 상대마다 후보 노출 — 합법성은 validate가 최종 판정
    ctx.holderTurnOptions((state) =>
      state.players
        .filter((p) => p.id !== holder)
        .map((p) => ({ type: ACTION, payload: { target: p.id } })),
    );
  },
});
