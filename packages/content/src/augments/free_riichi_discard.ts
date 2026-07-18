/**
 * 자유 선언 (free_riichi_discard) — 리치 후에도 국당 3회까지,
 * 대기가 변하지 않는 손패를 쯔모패 대신 골라 버릴 수 있다.
 *
 * 구현 지점:
 * - 커스텀 액션 "free_discard" {tileId}: 리치 중 자기 턴에만, 대기 집합이
 *   쯔모패를 버렸을 때와 동일한 패만 허용. 표준 TILE_DISCARDED(riichi:false,
 *   riichiCost:0) + augmentData 카운터 증가로 처리 — 새 이벤트·Reducer 불필요.
 * - holderTurnOptions: 쯔모패를 제외한 손패 전부를 후보로 노출 (validate가 거른다).
 */

import {
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindKey,
  kindOf,
  meldCountOf,
  playerAtSeat,
  winningKinds,
  scoringOptionsOf,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
  TileId,
} from "@majak/core";
import { counterOf, roundKey } from "../util.js";

const AUGMENT_ID = "free_riichi_discard";
/** 국당 사용 가능 횟수 */
const MAX_USES_PER_ROUND = 3;

/** 국 단위 사용 횟수 카운터 키 */
const usedKey = (state: GameState, player: PlayerId): string =>
  `${AUGMENT_ID}:used:${roundKey(state)}:${player}`;

/** removed를 뺀 손패의 대기 kind 집합 (kindKey 기준) */
function waitSetWithout(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
  removed: TileId,
): Set<string> {
  const kinds = handIdsOf(state, player)
    .filter((id) => id !== removed)
    .map((id) => kindOf(state, id));
  return new Set(
    winningKinds(
      kinds,
      meldCountOf(state, player),
      undefined,
      scoringOptionsOf(state, rules, player),
    ).map(kindKey),
  );
}

const freeDiscardAction: ActionDef<{ tileId: TileId }> = {
  type: "free_discard",
  validate: (req, { state, rules }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(AUGMENT_ID)) {
      return "no free_riichi_discard augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.byPlayer[req.player]?.riichi == null) {
      return "not in riichi";
    }
    const drawn = state.round.lastDrawnTile;
    if (drawn === null) return "no drawn tile";
    if (req.payload.tileId === drawn) {
      return "drawn tile must use the normal discard";
    }
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    if (counterOf(state, usedKey(state, req.player)) >= MAX_USES_PER_ROUND) {
      return "free discard exhausted this round";
    }
    // 대기 보존: 이 패를 버린 결과와 쯔모패를 버린 결과의 대기 집합이 같아야 한다
    const after = waitSetWithout(state, rules, req.player, req.payload.tileId);
    const normal = waitSetWithout(state, rules, req.player, drawn);
    if (
      after.size !== normal.size ||
      ![...after].every((k) => normal.has(k))
    ) {
      return "discard would change waits";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    {
      type: TILE_DISCARDED,
      payload: {
        player: req.player,
        tileId: req.payload.tileId,
        riichi: false,
        riichiCost: 0,
      },
    },
    augmentDataSet(
      usedKey(state, req.player),
      counterOf(state, usedKey(state, req.player)) + 1,
    ),
  ],
};

export const freeRiichiDiscard: AugmentDef = defineAugment({
  id: AUGMENT_ID,
  tier: "gold",
  name: "자유 선언",
  description:
    "리치 후에도 국당 3회까지, 대기패는 변하지 않지만 손패에서 골라 버릴 수 있다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has("free_discard")) {
      engine.actions.register(freeDiscardAction);
    }

    // 리치 중 자기 턴에 쯔모패 이외의 손패를 후보로 노출 (합법성은 validate가 판정)
    ctx.holderTurnOptions((state) => {
      if (state.round.byPlayer[holder]?.riichi == null) return [];
      const drawn = state.round.lastDrawnTile;
      if (drawn === null) return [];
      return handIdsOf(state, holder)
        .filter((tileId) => tileId !== drawn)
        .map((tileId) => ({ type: "free_discard", payload: { tileId } }));
    });
  },
});
