/**
 * 날치기 (pond_snatch, prism).
 * 게임에서 3회, 자기 턴에 쯔모하는 대신 상대가 **최근에 버린 3장** 중 1장을 주워 손에
 * 넣는다. 후로로 치지 않아 멘젠이 유지되며(리치도 가능), 원래 주인의 바닥 기록은
 * 그대로 남아 그 상대의 후리텐 판정은 유지된다.
 *
 * # 버프 (2026-07-31 사용자 지시)
 *
 * 예전에는 **각자의 마지막 한 장**만 대상이라, 발동 가능한 순에 쓸모 있는 패가 깔려
 * 있을 확률이 낮았다. 쯔모 한 번을 통째로 내주는 비용에 비해 건질 것이 없어 3회를
 * 다 쓰지 못하고 게임이 끝나기 일쑤였다. 이제 **각 상대의 최근 3장**까지 손이 닿는다 —
 * 같은 값이면 지금 필요한 패를 고를 수 있어 "쯔모를 포기할 만한가"가 실제 판단이 된다.
 *
 * 구현: 자기 턴(이미 쯔모한 상태)에서 쯔모패를 패산 맨 밑으로 되돌리고(take_back과
 * 동일) 상대의 최근 버림패를 손으로 가져와 lastDrawnTile로 삼는 커스텀 이벤트.
 * byPlayer.discardedKinds(후리텐 근거)는 건드리지 않아 원주인 후리텐이 보존된다.
 */

import {
  WALL,
  augmentDataSet,
  defineAugment,
  discardsZone,
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
import {
  counterOf,
  replaceDrawnTile,
} from "../util.js";
import { handKindsOf, hasNeighbor } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "pond_snatch";
const ACTION = "pond_snatch";
const EVENT = "PondSnatchPerformed";
const MAX_USES = 3;
/** 손이 닿는 깊이 — 각 상대의 **최근 SNATCH_DEPTH장** (2026-07-31 버프: 1 → 3) */
const SNATCH_DEPTH = 3;
const usedKey = (h: PlayerId): string => `${ID}:used:${h}`;
const wallLen = (state: GameState): number =>
  state.zones[WALL]?.tileIds.length ?? 0;

interface PondSnatchPayload {
  holder: PlayerId;
  drawnId: TileId;
  snatchId: TileId;
  fromPlayer: PlayerId;
}

/** 각 상대의 최근 버림패 SNATCH_DEPTH장 (바닥 맨 끝부터) */
function recentDiscards(
  state: GameState,
  holder: PlayerId,
): { fromPlayer: PlayerId; snatchId: TileId }[] {
  const out: { fromPlayer: PlayerId; snatchId: TileId }[] = [];
  for (const p of state.players) {
    if (p.id === holder) continue;
    const ids = state.zones[discardsZone(p.id)]?.tileIds ?? [];
    for (const snatchId of ids.slice(-SNATCH_DEPTH)) {
      out.push({ fromPlayer: p.id, snatchId });
    }
  }
  return out;
}

const pondSnatchAction: ActionDef<{ snatchId: TileId; fromPlayer: PlayerId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no pond_snatch augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: cannot snatch";
    }
    if (counterOf(state, usedKey(req.player)) >= MAX_USES) return "no uses left";
    if (state.round.lastDrawnTile == null) return "no drawn tile";
    if (state.round.lastDrawRinshan) return "cannot snatch after a rinshan draw";
    if (wallLen(state) === 0) return "wall is empty";
    if (req.payload.fromPlayer === req.player) return "cannot snatch your own pond";
    const pond = state.zones[discardsZone(req.payload.fromPlayer)]?.tileIds ?? [];
    if (!pond.slice(-SNATCH_DEPTH).includes(req.payload.snatchId)) {
      return "not among the recent discards";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const payload: PondSnatchPayload = {
      holder: req.player,
      drawnId: state.round.lastDrawnTile as TileId,
      snatchId: req.payload.snatchId,
      fromPlayer: req.payload.fromPlayer,
    };
    return [{ type: EVENT, payload }];
  },
};

export const pondSnatch: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  name: "날치기",
  description:
    "(게임 내 3회) 자기 순에 쯔모하는 대신 상대가 최근에 버린 3장 중 1장을 주워 손에 넣는다. 후로로 치지 않아 멘젠·리치가 유지된다.",
  detail:
    "(게임 내 3회) 자기 순에 그 순의 쯔모패를 패산 맨 밑으로 되돌리고, 대신 상대 세 명이 각각 최근에 버린 3장(최대 9장) 중 1장을 골라 손에 넣는다. 후로로 치지 않으므로 멘젠이 유지되고 리치도 그대로 걸 수 있다. 원주인의 바닥 기록은 남아 그 상대의 후리텐 판정도 유지된다. 리치 중이거나 영상패를 잡은 순, 패산이 바닥난 국에는 쓸 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.reducers.has(EVENT)) {
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as PondSnatchPayload;
        // 쯔모패를 패산 맨 밑으로 되돌리고
        let zones = moveTiles(state.zones, handZone(p.holder), WALL, [p.drawnId]);
        // 상대 바닥의 최근 버림패를 손으로 (바닥 기록 discardedKinds는 유지 → 후리텐 보존)
        zones = moveTiles(
          zones,
          discardsZone(p.fromPlayer),
          handZone(p.holder),
          [p.snatchId],
        );
        return {
          ...state,
          zones,
          round: replaceDrawnTile(state.round, p.snatchId),
          augmentData: {
            ...state.augmentData,
            [usedKey(p.holder)]: counterOf(state, usedKey(p.holder)) + 1,
          },
        };
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(pondSnatchAction);
    }

    ctx.holderTurnOptions((state) => {
      if (counterOf(state, usedKey(holder)) >= MAX_USES) return [];
      if (state.round.lastDrawnTile == null) return [];
      return recentDiscards(state, holder).map((d) => ({
        type: ACTION,
        payload: { snatchId: d.snatchId, fromPlayer: d.fromPlayer },
      }));
    });
  },
  // 쯔모 대신 상대 버림패를 줍는다(게임 3회) — 쯔모 기회를 쓰는 만큼, 주운 패가
  // 확실히 손을 진전시킬 때만(짝을 만들거나 슌쯔로 이어질 때) 발동한다. 텐파이면
  // 그냥 오름패를 노리는 게 나으므로 발동하지 않는다.
  bot: plan({
    intent: "advance",
    // 게임 내 3회뿐이다 — 회수할 순목이 남아 있을 때만 태운다.
    pick: ({ options, view, holder, tenpai }) => {
      if (tenpai) return null;
      const kinds = handKindsOf(view, holder);
      for (const o of options) {
        if (o.type !== ACTION) continue;
        const snatchId = (o.payload as { snatchId?: number }).snatchId;
        const k = snatchId !== undefined ? view.tiles[snatchId]?.kind : undefined;
        if (k === undefined) continue;
        if (kinds.some((x) => x.suit === k.suit && x.rank === k.rank) || hasNeighbor(kinds, k)) {
          return o;
        }
      }
      return null;
    },
  }),
});
