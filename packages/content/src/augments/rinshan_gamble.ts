/**
 * rinshan_gamble (도박사의 손) — 게임당 1회 발동하는 도박.
 * 발동하면 이후 자신의 타패 5회가 손패의 무작위 패로 대체된다.
 * 5회를 모두 치르면 원하는 영상패(왕패 앞 4장 중 하나)를
 * 쯔모패와 맞바꿔 가져올 수 있다.
 *
 * 구현 지점:
 * - gamble_start 액션: 카운터 5 + 사용 플래그 기록 (augmentDataSet).
 * - TILE_DISCARDED Interceptor: 카운터>0이면 버림패를 결정적 무작위 패로 교체.
 * - TILE_DISCARDED Reaction: 카운터 차감, 0이 되면 영상패 교환(pick) 개방.
 * - take_rinshan 액션: 쯔모패 ↔ 왕패[index] 교환 (왕패 장수 보존).
 */

import {
  DEAD_WALL,
  Prng,
  TILE_DISCARDED,
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
  PlayerId,
  TileDiscardedPayload,
  TileId,
} from "@majak/core";
import { counterOf } from "../util.js";

const ID = "rinshan_gamble";
const ACTION_START = "gamble_start";
const ACTION_TAKE = "take_rinshan";
/** 이 증강이 만들어내는 이벤트 — id에서 파생시켜 충돌 방지 */
const RINSHAN_GAMBLE_TAKEN = "RinshanGambleTaken";

/** 남은 대체 타패 횟수 카운터 키 */
const counterKey = (player: PlayerId): string => `${ID}:${player}`;
/** 5회를 마쳐 영상패 교환이 열렸는가 */
const pickKey = (player: PlayerId): string => `${ID}:pick:${player}`;
/** 게임당 1회 발동 플래그 */
const usedKey = (player: PlayerId): string => `${ID}:used:${player}`;

interface RinshanGambleTakenPayload {
  player: PlayerId;
  /** 가져올 영상패의 왕패 인덱스 (0~3) */
  index: number;
  /** 왕패로 내보내는 쯔모패 */
  drawnTileId: TileId;
  /** 손으로 가져오는 영상패 */
  takenTileId: TileId;
}

const gambleStartAction: ActionDef<Record<string, never>> = {
  type: ACTION_START,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no rinshan_gamble augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.augmentData[usedKey(req.player)] === true) {
      return "gamble already used";
    }
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: cannot gamble";
    }
    return null;
  },
  toEvents: (req) => [
    augmentDataSet(counterKey(req.player), 5),
    augmentDataSet(usedKey(req.player), true),
  ],
};

const takeRinshanAction: ActionDef<{ index: number }> = {
  type: ACTION_TAKE,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no rinshan_gamble augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.augmentData[pickKey(req.player)] !== true) {
      return "no rinshan pick available";
    }
    const idx = req.payload.index;
    if (!Number.isInteger(idx) || idx < 0 || idx > 3) {
      return "invalid rinshan index";
    }
    if ((state.zones[DEAD_WALL]?.tileIds ?? [])[idx] === undefined) {
      return "no tile at that index";
    }
    const drawn = state.round.lastDrawnTile;
    if (drawn === null) return "no drawn tile to trade";
    if (!handIdsOf(state, req.player).includes(drawn)) {
      return "drawn tile not in hand";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const payload: RinshanGambleTakenPayload = {
      player: req.player,
      index: req.payload.index,
      drawnTileId: state.round.lastDrawnTile as TileId,
      takenTileId: (state.zones[DEAD_WALL]?.tileIds ?? [])[
        req.payload.index
      ] as TileId,
    };
    return [{ type: RINSHAN_GAMBLE_TAKEN, payload }];
  },
};

export const rinshanGamble: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  name: "도박사의 손",
  description:
    "게임당 1회 발동: 이후 자신의 타패 5회가 무작위 패로 대체된다. " +
    "5회를 견뎌내면 원하는 영상패 하나를 쯔모패와 맞바꿔 가져올 수 있다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(RINSHAN_GAMBLE_TAKEN)) {
      engine.reducers.register(RINSHAN_GAMBLE_TAKEN, (state, event) => {
        const p = event.payload as RinshanGambleTakenPayload;
        // 영상패를 손으로 → 비워진 자리(index)에 쯔모패를 밀어 넣는다 (왕패 장수 보존)
        let zones = moveTiles(state.zones, DEAD_WALL, handZone(p.player), [
          p.takenTileId,
        ]);
        zones = moveTiles(
          zones,
          handZone(p.player),
          DEAD_WALL,
          [p.drawnTileId],
          p.index,
        );
        return {
          ...state,
          zones,
          // 가져온 영상패가 새 쯔모패 — 이어지는 버림 흐름 유지
          round: { ...state.round, lastDrawnTile: p.takenTileId },
          augmentData: { ...state.augmentData, [pickKey(p.player)]: false },
        };
      });
    }
    if (!engine.actions.has(ACTION_START)) {
      engine.actions.register(gambleStartAction);
    }
    if (!engine.actions.has(ACTION_TAKE)) {
      engine.actions.register(takeRinshanAction);
    }

    // 대체 타패: 남은 횟수가 있으면 버림패를 손패의 결정적 무작위 패로 교체.
    // 리치 선언 타패(payload.riichi)는 대체하지 않는다 — 텐파이 판정을 깨지 않기 위함.
    ctx.interceptor(TILE_DISCARDED, (event, ic) => {
      const p = event.payload as TileDiscardedPayload;
      if (p.player !== holder || p.riichi) return event;
      if (counterOf(ic.state, counterKey(holder)) <= 0) return event;
      const hand = handIdsOf(ic.state, holder);
      if (hand.length === 0) return event;
      // prngState는 소비하지 않는다 — 리플레이는 확정 이벤트만 재적용하므로,
      // 상태에서 유도한 일회용 시드로 충분히 결정적이다.
      const seed =
        (ic.state.prngState ^ (ic.state.lastEventSeq * 2654435761)) >>> 0;
      const replacement = new Prng(seed).pick(hand);
      if (replacement === p.tileId) return event;
      return { type: event.type, payload: { ...p, tileId: replacement } };
    });

    // 타패가 확정될 때마다 남은 횟수 차감 — 0이 되면 영상패 교환(pick)이 열린다
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (p.player !== holder) return;
      const remaining = counterOf(rc.state, counterKey(holder));
      if (remaining <= 0) return;
      rc.emit(augmentDataSet(counterKey(holder), remaining - 1));
      if (remaining - 1 === 0) rc.emit(augmentDataSet(pickKey(holder), true));
    });

    // 보유자 턴 후보: 발동 + 영상패 교환(인덱스 0~3) — 합법성은 validate가 최종 판정
    ctx.holderTurnOptions(() => [
      { type: ACTION_START, payload: {} },
      { type: ACTION_TAKE, payload: { index: 0 } },
      { type: ACTION_TAKE, payload: { index: 1 } },
      { type: ACTION_TAKE, payload: { index: 2 } },
      { type: ACTION_TAKE, payload: { index: 3 } },
    ]);
  },
});
