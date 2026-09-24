/**
 * 욕심 (greed, prism) — 방금 쯔모한 패를 다음 순에 한 장 더.
 *
 * (매 국 1회) 쯔모한 뒤 자기 순에 발동하면, **다음 내 쯔모가 방금 쯔모한 패와 같은 종류**로
 * 온다(2026-09-24 사용자 확정: "같은 패 한 장 더"). 방금 쯔모한 패는 평소처럼 손에 남고,
 * 버릴 패도 평소처럼 고른다.
 *
 * ## 구현
 * - 소환(`conjure_draw`)과 같은 배관이다. 예약 kind를 국 스코프에 두고, 보유자의 다음
 *   쯔모(영상패 포함)에서 그 한 장의 kind를 바꾼다(`tileKindChanged`, conjured 표식).
 *   난수를 쓰지 않고 손패 장수도 그대로다.
 * - 같은 한 장을 노리는 다른 쯔모 변형과는 `drawMutators.ts`의 우선순위로 조정한다.
 *   양보하면 예약이 남아 그다음 쯔모에 온다.
 * - 쯔모한 순에만 쓸 수 있다 — 후로 직후에는 «방금 쯔모한 패»가 없다.
 * - 발동과 종류는 전원 공개다(소환과 같다).
 */

import {
  TILE_DRAWN,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindKey,
  kindOf,
  playerAtSeat,
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileDrawnPayload,
} from "@majak/core";
import { flagOf, publishUsesLeft, roundViewKey } from "../util.js";
import { handKindsOf, kindCounts } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import {
  greedPendingKey,
  greedPendingKind,
  yieldsDrawTo,
} from "./drawMutators.js";
import { roundScopedKey } from "./roundScope.js";

const ID = "greed";
const ACTION = "greed_use";

/** 국당 1회 소진 표식 */
const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);

function reject(state: GameState, player: PlayerId): string | null {
  const me = state.players.find((p) => p.id === player);
  if (me === undefined || !me.augments.includes(ID)) return "no greed augment";
  if (state.round.phase !== "turn.act") return "not in act phase";
  if (playerAtSeat(state, state.round.turnSeat).id !== player)
    return "not your turn";
  if (flagOf(state, usedKey(state, player))) return "already used this round";
  if (greedPendingKind(state, player) !== null) return "greed already pending";
  const drawn = state.round.lastDrawnTile;
  if (drawn === null || !handIdsOf(state, player).includes(drawn))
    return "no drawn tile";
  return null;
}

const useAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => reject(state, req.player),
  toEvents: (req, { state }) => {
    const kind = kindOf(state, state.round.lastDrawnTile!);
    return [
      augmentDataSet(greedPendingKey(state, req.player), {
        suit: kind.suit,
        rank: kind.rank,
      }),
      augmentDataSet(usedKey(state, req.player), true),
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), kindKey(kind)),
    ];
  },
};

export const greed: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 1,
  name: "욕심",
  description: "(매 국 1회) 방금 쯔모한 패와 같은 패를 다음 순에 쯔모한다.",
  detail:
    "쯔모한 뒤 자기 순에 발동하면, 다음 쯔모가 방금 쯔모한 패와 같은 종류로 온다. 방금 쯔모한 패는 그대로 손에 남는다.\n\n깡의 영상패를 포함해 내가 다음에 뽑는 한 장이 대상이다. 발동과 패의 종류는 전원에게 공개된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    publishUsesLeft(
      ctx,
      (state) => ({
        left: flagOf(state, usedKey(state, holder)) ? 0 : 1,
        total: 1,
      }),
      "round",
    );

    if (!engine.actions.has(ACTION)) engine.actions.register(useAction);

    ctx.reaction(TILE_DRAWN, (event, rc) => {
      const p = event.payload as TileDrawnPayload;
      if (p.player !== holder) return;
      const target = greedPendingKind(rc.state, holder);
      if (target === null) return;
      // 더 센 쯔모 변형에 이 한 장을 양보한다 — 예약은 남긴다 (drawMutators.ts)
      if (
        yieldsDrawTo(
          ID,
          rc.state,
          engine.rules,
          holder,
          p.tileId,
          p.rinshan === true,
        )
      )
        return;
      rc.emit(
        tileKindChanged([
          { tileId: p.tileId, kind: target, attrs: { conjured: true } },
        ]),
      );
      rc.emit(augmentDataSet(greedPendingKey(rc.state, holder), null));
    });

    ctx.holderTurnOptions((state) =>
      reject(state, holder) === null ? [{ type: ACTION, payload: {} }] : [],
    );
  },
  /** 방금 쯔모한 패가 손에 한 장 더 있으면(대자) 다음 쯔모로 커쯔가 된다 — 그때만 쓴다 */
  bot: plan({
    intent: "advance",
    fleeting: true,
    pick: ({ options, view, holder, tenpai }) => {
      if (tenpai) return null;
      const opt = options.find((o) => o.type === ACTION);
      const drawn = view.round.myDrawnTile;
      if (opt === undefined || drawn === null) return null;
      const k = view.tiles[drawn]?.kind;
      if (k === undefined) return null;
      const count = kindCounts(handKindsOf(view, holder)).get(kindKey(k)) ?? 0;
      return count >= 2 ? opt : null;
    },
  }),
});
