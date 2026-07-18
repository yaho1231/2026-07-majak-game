/**
 * future_sight (미래를 보는 자) — 자기 턴에 발동하는 패산 교환 (턴당 1회, 리치 중 불가).
 * 손패 무작위 3장을 내보내고(1장은 자기 버림더미, 2장은 패산 맨 밑)
 * 패산 위 3장을 가져온다. 이번 국 동안 사용 횟수만큼 스택이 쌓이고,
 * 화료 시 스택×500점을 추가로 얻는다 (스택 키에 roundKey가 들어가
 * 국이 바뀌면 자연 소멸 — 별도 리셋 불필요).
 */

import {
  WALL,
  WIN_DECLARED,
  defineAugment,
  discardsZone,
  handIdsOf,
  handZone,
  moveTiles,
  playerAtSeat,
  scoreChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileId,
  WinDeclaredPayload,
} from "@majak/core";
import { counterOf, roundKey, statePrng, viewKey } from "../util.js";

const ID = "future_sight";
const ACTION = "future_exchange";
/** 이 증강이 만들어내는 이벤트 — id에서 파생시켜 충돌 방지 */
const FUTURE_SIGHT_EXCHANGED = "FutureSightExchanged";

/** 이번 국의 스택 카운터 키 — roundKey가 들어가 국이 바뀌면 자동 리셋 */
const stacksKey = (state: GameState, player: PlayerId): string =>
  `${ID}:stacks:${roundKey(state)}:${player}`;
/** 턴 사용 기록 키 (값 = 사용한 턴의 스탬프) */
const turnUsedKey = (player: PlayerId): string => `${ID}:turn_used:${player}`;
/** "이번 턴"을 식별하는 스탬프 (국 + 순) */
const turnStamp = (state: GameState): string =>
  `${roundKey(state)}#${state.round.turnCount}`;

interface FutureSightExchangedPayload {
  player: PlayerId;
  /** 손에서 나가는 3장 — [0]은 버림더미로, [1]·[2]는 패산 맨 밑으로 */
  outIds: TileId[];
  /** 패산 위에서 들어오는 3장 — 마지막 장이 새 쯔모패가 된다 */
  inIds: TileId[];
  /** 난수 소비 후 전진된 PRNG 상태 (결정론 유지) */
  prngState: number;
}

const futureExchangeAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes(ID)) return "no future_sight augment";
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.byPlayer[req.player]?.riichi != null) {
      return "riichi: cannot see the future";
    }
    if ((state.zones[WALL]?.tileIds.length ?? 0) < 3) {
      return "not enough wall tiles";
    }
    if (handIdsOf(state, req.player).length < 4) {
      return "not enough tiles in hand";
    }
    if (state.augmentData[turnUsedKey(req.player)] === turnStamp(state)) {
      return "already used this turn";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const prng = statePrng(state);
    // 손패에서 무작위 3장 — 셔플 후 앞 3장 (결정적)
    const outIds = prng.shuffle([...handIdsOf(state, req.player)]).slice(0, 3);
    const inIds = (state.zones[WALL]?.tileIds ?? []).slice(0, 3);
    const payload: FutureSightExchangedPayload = {
      player: req.player,
      outIds,
      inIds,
      prngState: prng.getState(),
    };
    return [{ type: FUTURE_SIGHT_EXCHANGED, payload }];
  },
};

export const futureSight: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  name: "미래를 보는 자",
  description:
    "턴에 한 번, 손패 무작위 3장을 내보내고(1장은 버림, 2장은 패산 맨 밑) " +
    "패산 위 3장을 가져온다 (리치 중 불가). 이번 국에 사용한 횟수만큼 " +
    "화료 시 500점씩 추가로 얻는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(FUTURE_SIGHT_EXCHANGED)) {
      engine.reducers.register(FUTURE_SIGHT_EXCHANGED, (state, event) => {
        const p = event.payload as FutureSightExchangedPayload;
        const [toDiscards, toWallA, toWallB] = p.outIds;
        const newDrawn = p.inIds[p.inIds.length - 1];
        if (
          toDiscards === undefined ||
          toWallA === undefined ||
          toWallB === undefined ||
          newDrawn === undefined
        ) {
          throw new Error("future_sight: malformed exchange payload");
        }
        // 1장은 자기 버림더미로 (버림 흐름과 무관 — lastDiscard는 건드리지 않는다)
        let zones = moveTiles(
          state.zones,
          handZone(p.player),
          discardsZone(p.player),
          [toDiscards],
        );
        // 2장은 패산 맨 밑(배열 끝)으로 — 앞쪽(다음 쯔모) 순서는 유지된다
        zones = moveTiles(zones, handZone(p.player), WALL, [toWallA, toWallB]);
        // 패산 위(앞) 3장을 손으로
        zones = moveTiles(zones, WALL, handZone(p.player), p.inIds);
        const sKey = stacksKey(state, p.player);
        const stacks = counterOf(state, sKey) + 1;
        return {
          ...state,
          zones,
          prngState: p.prngState,
          // 마지막으로 들어온 패를 쯔모패로 — 이어지는 버림·리치 흐름 유지
          round: { ...state.round, lastDrawnTile: newDrawn },
          augmentData: {
            ...state.augmentData,
            [sKey]: stacks,
            [turnUsedKey(p.player)]: turnStamp(state),
            // 보유자 화면에 현재 스택 수 노출
            [viewKey(p.player, "future_stacks")]: stacks,
          },
        };
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(futureExchangeAction);
    }

    // 화료 시 이번 국 스택 × 500점 보너스
    ctx.reaction(WIN_DECLARED, (event, rc) => {
      const p = event.payload as WinDeclaredPayload;
      if (p.winner !== holder) return;
      const stacks = counterOf(rc.state, stacksKey(rc.state, holder));
      if (stacks > 0) rc.emit(scoreChanged(holder, stacks * 500, ID));
    });

    // 보유자 턴에 발동 후보 노출 — 합법성은 validate가 최종 판정
    ctx.holderTurnOptions(() => [{ type: ACTION, payload: {} }]);
  },
});
