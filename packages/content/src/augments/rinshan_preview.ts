/**
 * 영상 정찰 (rinshan_preview) — 다음 영상패를 미리 보고, 국당 1회 그 자리에서 끌어온다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b C (52차 버프)
 *
 * ① 열람(기존): visibility.deadWall 규칙에 Modifier를 얹어, 보유자가 볼 때만
 *    {mode:"peek",count:1}을 돌려준다. 왕패 맨 앞 1장이 곧 다음 깡의 보충 쯔모
 *    (sys.drawRinshan은 항상 deadWall[0]을 뽑는다)이므로 정보 우위를 준다.
 * ② 끌어오기(신규): 국당 1회, 자기 턴에 액션 `rinshan_pull`로 그 영상패를
 *    내 쯔모패와 즉시 맞바꾼다. **깡을 하지 않고도 영상패를 손에 넣는다.**
 *    - "깡할 때만" 열리는 절벽 위에 피어난 꽃(cliff_bloom)과도,
 *      왕패 14장을 전부 보는 왕패의 주인(dead_wall_master)과도,
 *      **패산** 밑을 보는 밑장빼기(bottom_deal)와도 겹치지 않는다.
 *
 * 왜 1장인가: 영상패는 뽑을 때마다 **소모되고 보충되지 않으므로**(2026-07-26 사용자 확정,
 * flowEvents TILE_DRAWN) 왕패 앞이 한 자리씩 빈다. 남은 영상패는 rinshanRemaining()으로
 * 세고 상한은 깡 4회 = 4장이다. 여러 장을 "영상패 순서"로 공개하면 그 사이에 다른 사람이
 * 깡을 쳐 순서가 당겨지는 순간 거짓 정보가 되므로, 매 깡 직전에 다시 보면 항상 정확한
 * 맨 앞 1장만 준다.
 *
 * ⚠ 왕패 장수 보존: 영상패를 빼낸 자리(index 0)에 쯔모패를 그대로 밀어 넣는다.
 *    lastDrawnTile도 새 패로 갱신해야 이어지는 버림(특히 리치 중 쯔모기리)이 정상 동작한다.
 *    (cliff_bloom의 bloom_pick 리듀서와 같은 구조.)
 */

import {
  DEAD_WALL,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  handZone,
  moveTiles,
  playerAtSeat,
  rinshanRemaining,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  VisibilityRule,
} from "@majak/core";
import { flagOf, roundKey } from "../util.js";

const ID = "rinshan_preview";
const ACTION_PULL = "rinshan_pull";
const RINSHAN_PULLED = "RinshanPulled";

/** 국당 1회 사용 플래그 (roundKey를 섞어 국마다 자동 만료) */
const usedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:used:${roundKey(state)}:${h}`;

interface RinshanPulledPayload {
  player: PlayerId;
  /** 손에서 왕패로 밀어 넣는 쯔모패 */
  drawnTileId: TileId;
  /** 왕패 맨 앞에서 가져오는 영상패 */
  takenTileId: TileId;
}

/** 지금 영상패를 끌어올 수 있는가 (쯔모패를 들고 있는 자기 턴) */
function canPull(state: GameState, h: PlayerId): boolean {
  if (flagOf(state, usedKey(state, h))) return false;
  const drawn = state.round.lastDrawnTile;
  if (drawn === null) return false;
  if (!handIdsOf(state, h).includes(drawn)) return false;
  // 남은 **영상패**로 판정한다 — 깡으로 뽑힌 자리는 보충되지 않으므로 배열 길이로 보면
  // 영상패가 다 떨어진 뒤에도 도라 표시패를 끌어오게 된다 (2026-07-26).
  return rinshanRemaining(state) > 0;
}

const rinshanPullAction: ActionDef<Record<string, never>> = {
  type: ACTION_PULL,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no rinshan_preview augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, usedKey(state, req.player))) return "already used this round";
    const drawn = state.round.lastDrawnTile;
    if (drawn === null) return "no drawn tile to trade";
    if (!handIdsOf(state, req.player).includes(drawn)) return "drawn tile not in hand";
    if (rinshanRemaining(state) === 0) return "no rinshan tiles left";
    return null;
  },
  toEvents: (req, { state }) => [
    {
      type: RINSHAN_PULLED,
      payload: {
        player: req.player,
        drawnTileId: state.round.lastDrawnTile as TileId,
        takenTileId: (state.zones[DEAD_WALL]?.tileIds ?? [])[0] as TileId,
      } satisfies RinshanPulledPayload,
    },
    augmentDataSet(usedKey(state, req.player), true),
  ],
};

export const rinshanPreview: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "info",
  name: "영상 정찰",
  description:
    "(상시 열람 · 매 국 1회 교환) 다음 깡에서 가져올 영상패(왕패 맨 앞 1장)를 항상 미리 보고, 자기 순에 깡을 하지 않고도 그 영상패를 내 쯔모패와 즉시 맞바꾼다.",
  detail:
    "(상시 열람 · 매 국 1회 교환) 왕패 맨 앞 1장, 곧 다음 영상패를 자신만 항상 볼 수 있다. 여기에 더해 자기 순에 국당 한 번, 그 영상패를 지금 막 쯔모한 패와 그 자리에서 맞바꾼다 — 깡을 할 필요가 없다. 바꿔 넣은 쯔모패가 왕패 맨 앞자리로 들어가므로 왕패 장수는 그대로이며, 다음 영상패는 방금 내가 넣은 그 패가 된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션·리듀서는 게임당 한 번만 등록 (여러 명이 같은 증강을 가질 수 있다)
    if (!engine.actions.has(ACTION_PULL)) {
      engine.actions.register(rinshanPullAction);
      engine.reducers.register(RINSHAN_PULLED, (state, event) => {
        const p = event.payload as RinshanPulledPayload;
        // 영상패를 손으로 → 비워진 맨 앞자리에 쯔모패를 밀어 넣는다 (왕패 장수 보존)
        let zones = moveTiles(state.zones, DEAD_WALL, handZone(p.player), [
          p.takenTileId,
        ]);
        zones = moveTiles(zones, handZone(p.player), DEAD_WALL, [p.drawnTileId], 0);
        return {
          ...state,
          zones,
          // 새 쯔모패는 끌어온 영상패 — 리치 중 쯔모기리도 이 패를 기준으로 판정된다
          round: { ...state.round, lastDrawnTile: p.takenTileId },
        };
      });
    }

    ctx.engine.rules.addModifier<VisibilityRule>("visibility.deadWall", {
      source: ctx.instanceId,
      layer: ctx.layer,
      // 보유자 시점에만 왕패 맨 앞 1장(다음 영상패)을 공개.
      // 영상패가 다 떨어졌으면 아무것도 열지 않는다 — 맨 앞이 도라 표시패가 되기 때문.
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state !== undefined && rinshanRemaining(state) === 0) return cur;
        return { mode: "peek", count: 1 };
      },
    });

    // 끌어올 수 있을 때만 버튼 노출 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) =>
      canPull(state, holder) ? [{ type: ACTION_PULL, payload: {} }] : [],
    );
  },
  // 깡 전 영상패를 미리 보는 순수 정보 이득 — 제시되면 항상 발동한다.
  bot: {
    choose({ options }) {
      return options.find((o) => o.type === ACTION_PULL) ?? null;
    },
  },
});
