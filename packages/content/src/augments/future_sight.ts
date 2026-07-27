/**
 * future_sight (미래를 보는 자) — 자기 턴에 발동하는 패산 교환 (턴당 1회, 리치 중 불가).
 * 손패에서 **무작위 3장**이 뽑히고, 그중 **어느 것을 자기 바닥에 버릴지는 내가 고른다**
 * (나머지 2장은 패산 맨 밑으로). 그리고 패산 위 3장을 가져온다.
 *
 * 2026-07-22 (48차): 바닥으로 보낼 패를 `outIds[0]`으로 강제하던 것을 플레이어 선택으로
 * 바꿨다 — 후리텐 위험을 감수할 패를 스스로 고른다. 무작위 3장 선정은 유지(운의 폭발).
 *
 * 무작위 3장은 `state.prngState`에서 **결정적으로** 계산되므로 holderTurnOptions(후보 제시)와
 * toEvents(확정)가 같은 3장을 본다. 이번 국 동안 사용 횟수만큼 스택이 쌓이고,
 * 화료 시 **2스택당 +1판**을 추가로 얻는다 (스택 키에 roundKey가 들어가
 * 국이 바뀌면 자연 소멸 — 별도 리셋 불필요).
 * (2026-07-26: 구 "스택×1000점" → 확정 보상 단위를 판수로 통일(util.addWinHanBonus) →
 *  같은 날 스택당 1판이 지수적으로 과해 **2스택당 1판**으로 재조정.)
 *
 * 2026-07-22 (55차, 사용자 피드백): 두 가지를 고쳤다.
 * 1. **액티브 버튼을 눌러야 발동한다.** 예전엔 holderTurnOptions가 매 턴 교환 후보를
 *    바로 내서 턴이 시작되자마자 프롬프트가 떴다. 이제 발동이 2단계다 —
 *    `future_arm {}`(무장 선언)을 누른 뒤에야 `future_exchange {tileId}` 후보가 제시된다.
 *    무장 플래그는 국 단위 키이며, 그 턴에 버림이 일어나면 자동으로 풀린다
 *    (교환을 마쳐도 리듀서가 함께 내린다).
 * 2. **가져온 패가 보인다.** 교환으로 손에 들어온 3장의 tileId를 전원 공개 뷰 채널
 *    `future_sight:got:{player}`에 싣고, 같은 tileId를 `revealTiles:future`에도 실어
 *    클라이언트가 뒷면이 아니라 '진짜 패'로 그릴 수 있게 한다(PlayerView revealTiles 채널).
 */

import {
  ROUND_STARTED,
  TILE_DISCARDED,
  WALL,
  augmentDataSet,
  defineAugment,
  discardsZone,
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
  TileDiscardedPayload,
  TileId,
} from "@majak/core";
import {
  addWinHanBonus,
  counterOf,
  flagOf,
  roundKey,
  statePrng,
  viewKey,
} from "../util.js";

const ID = "future_sight";
const ACTION = "future_exchange";
/** 액티브 버튼 — 이걸 눌러야 교환 후보가 제시된다 */
const ARM_ACTION = "future_arm";
/** 이 증강이 만들어내는 이벤트 — id에서 파생시켜 충돌 방지 */
const FUTURE_SIGHT_EXCHANGED = "FutureSightExchanged";

/** 이번 국의 스택 카운터 키 — roundKey가 들어가 국이 바뀌면 자동 리셋 */
/** 화료 보너스 1판에 필요한 스택 수 (2026-07-26: 스택당 1판 → 2스택당 1판) */
const STACKS_PER_HAN = 2;

const stacksKey = (state: GameState, player: PlayerId): string =>
  `${ID}:stacks:${roundKey(state)}:${player}`;
/** 턴 사용 기록 키 (값 = 사용한 턴의 스탬프) */
const turnUsedKey = (player: PlayerId): string => `${ID}:turn_used:${player}`;
/** "이번 턴"을 식별하는 스탬프 (국 + 순) */
const turnStamp = (state: GameState): string =>
  `${roundKey(state)}#${state.round.turnCount}`;
/** 무장 플래그 키 (국 단위 — 국이 바뀌면 자동 소멸) */
const armedKey = (state: GameState, player: PlayerId): string =>
  `${ID}:armed:${roundKey(state)}:${player}`;
/** 교환으로 들어온 3장 — 전원 공개 */
const gotKey = (player: PlayerId): string =>
  viewKey("*", `${ID}:got:${player}`);
/** 위 tileId를 '진짜 패'로 그리게 하는 코어 공개 채널 */
const REVEAL_KEY = viewKey("*", "revealTiles:future");

/** 지금 무장되어 있는가 (액티브 버튼을 이미 눌렀는가) */
function isArmed(state: GameState, player: PlayerId): boolean {
  return flagOf(state, armedKey(state, player));
}

/** 이번 턴에 이미 교환했는가 */
function usedThisTurn(state: GameState, player: PlayerId): boolean {
  return state.augmentData[turnUsedKey(player)] === turnStamp(state);
}

/** 지금 발동(무장/교환)이 가능한 상황인가 — 두 액션의 공통 조건 */
function commonReject(state: GameState, player: PlayerId): string | null {
  const me = state.players.find((p) => p.id === player);
  if (me === undefined) return "unknown player";
  if (!me.augments.includes(ID)) return "no future_sight augment";
  if (state.round.phase !== "turn.act") return "not in act phase";
  if (playerAtSeat(state, state.round.turnSeat).id !== player) {
    return "not your turn";
  }
  if (state.round.byPlayer[player]?.riichi != null) {
    return "riichi: cannot see the future";
  }
  if ((state.zones[WALL]?.tileIds.length ?? 0) < 3) {
    return "not enough wall tiles";
  }
  if (handIdsOf(state, player).length < 4) return "not enough tiles in hand";
  if (usedThisTurn(state, player)) return "already used this turn";
  return null;
}

/** 무장 선언 — 이걸 눌러야 교환 후보(모달)가 열린다. 패는 전혀 움직이지 않는다. */
const futureArmAction: ActionDef<Record<string, never>> = {
  type: ARM_ACTION,
  validate: (req, { state }) => {
    const common = commonReject(state, req.player);
    if (common !== null) return common;
    if (isArmed(state, req.player)) return "already armed";
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(armedKey(state, req.player), true),
  ],
};

/**
 * 이번 발동에서 손을 떠날 무작위 3장 + 소비 후 PRNG 상태.
 * state가 같으면 항상 같은 결과 — 후보 제시와 확정이 어긋나지 않는다.
 */
function pickThree(
  state: GameState,
  player: PlayerId,
): { ids: TileId[]; prngState: number } {
  const prng = statePrng(state);
  const ids = prng.shuffle([...handIdsOf(state, player)]).slice(0, 3);
  return { ids, prngState: prng.getState() };
}

interface FutureSightExchangedPayload {
  player: PlayerId;
  /** 손에서 나가는 3장 — [0]은 내가 고른 '바닥에 버릴 패', [1]·[2]는 패산 맨 밑으로 */
  outIds: TileId[];
  /** 패산 위에서 들어오는 3장 — 마지막 장이 새 쯔모패가 된다 */
  inIds: TileId[];
  /** 난수 소비 후 전진된 PRNG 상태 (결정론 유지) */
  prngState: number;
}

const futureExchangeAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const common = commonReject(state, req.player);
    if (common !== null) return common;
    // 액티브 버튼(future_arm)을 누르지 않았으면 교환할 수 없다
    if (!isArmed(state, req.player)) return "not armed";
    // 바닥에 버릴 패는 이번에 뽑힌 무작위 3장 중 하나여야 한다
    if (!pickThree(state, req.player).ids.includes(req.payload.tileId)) {
      return "tile is not among the three";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const { ids, prngState } = pickThree(state, req.player);
    // 내가 고른 패를 맨 앞에 — 리듀서가 [0]을 바닥으로, 나머지를 패산 밑으로 보낸다
    const chosen = req.payload.tileId;
    const outIds = [chosen, ...ids.filter((id) => id !== chosen)];
    const inIds = (state.zones[WALL]?.tileIds ?? []).slice(0, 3);
    const payload: FutureSightExchangedPayload = {
      player: req.player,
      outIds,
      inIds,
      prngState,
    };
    return [{ type: FUTURE_SIGHT_EXCHANGED, payload }];
  },
};

export const futureSight: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  name: "미래를 보는 자",
  description:
    "(자기 순마다 1회) 액티브 버튼을 누르면 손패에서 무작위 3장이 뽑히고, 그중 바닥에 버릴 1장을 직접 고른 뒤(나머지 2장은 패산 맨 밑으로) 패산 위 3장을 가져온다. 이번 국에 두 번 쓸 때마다 화료 시 +1판을 얻는다.",
  detail:
    "(자기 순마다 1회) 자기 순에 액티브 버튼을 눌러야 발동한다. 버튼을 누른 뒤에야 손패에서 뽑힌 무작위 3장이 제시되고, 그중 버릴 1장을 직접 고르면 나머지 2장은 패산 맨 밑으로 들어가며 패산에서 3장을 새로 받는다. 새로 받은 3장은 전원에게 공개된다. 버튼을 누르지 않은 채 그냥 버리면 그 순의 발동 기회는 사라진다. 교환할 때마다 층이 1씩 쌓여 그 국에 화료하면 층 2개당 +1판을 얻으며(내림) 국이 바뀌면 초기화된다. 바닥으로 보낸 패에는 방총 위험이 그대로 걸리고, 리치 중에는 쓸 수 없다.",
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
        // 가져온 3장을 전원에게 보여준다 — 같은 tileId를 revealTiles 채널에도 실어야
        // 클라이언트가 뒷면이 아니라 진짜 패로 그린다. 여러 번 교환하면 누적된다.
        const prevReveal = state.augmentData[REVEAL_KEY];
        const reveal = [
          ...new Set([
            ...(Array.isArray(prevReveal) ? (prevReveal as TileId[]) : []),
            ...p.inIds,
          ]),
        ];
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
            // 교환이 끝나면 무장이 풀린다 (다시 쓰려면 버튼을 또 눌러야 한다)
            [armedKey(state, p.player)]: false,
            // 보유자 화면에 현재 스택 수 노출
            [viewKey(p.player, "future_stacks")]: stacks,
            [gotKey(p.player)]: [...p.inIds],
            [REVEAL_KEY]: reveal,
          },
        };
      });
    }
    if (!engine.actions.has(ACTION)) {
      engine.actions.register(futureExchangeAction);
    }
    if (!engine.actions.has(ARM_ACTION)) {
      engine.actions.register(futureArmAction);
    }

    // 무장한 채 그냥 버리면 무장이 풀린다 — 그 턴에만 유효한 선언이다.
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (p.player !== holder) return;
      if (!isArmed(rc.state, holder)) return;
      rc.emit(augmentDataSet(armedKey(rc.state, holder), false));
    });

    // 국이 바뀌면 지난 국 tileId가 새지 않게 공개 채널을 비운다
    // (무장·스택 키는 roundKey가 섞여 자동 소멸한다).
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const got = rc.state.augmentData[gotKey(holder)];
      if (Array.isArray(got) && got.length > 0) {
        rc.emit(augmentDataSet(gotKey(holder), []));
      }
      const reveal = rc.state.augmentData[REVEAL_KEY];
      if (Array.isArray(reveal) && reveal.length > 0) {
        rc.emit(augmentDataSet(REVEAL_KEY, []));
      }
    });

    // 화료 시 이번 국 **2스택당 +1판** (뱅크 지급 — 상대가 더 내지 않는다).
    // 스택당 1판은 판수의 지수 특성 때문에 5스택만 쌓여도 하네만급이 얹혔다 —
    // 2026-07-26 사용자 확정으로 2스택당 1판(내림)으로 낮췄다.
    addWinHanBonus(ctx, (state) =>
      Math.floor(counterOf(state, stacksKey(state, holder)) / STACKS_PER_HAN),
    );

    // 발동은 2단계다 — 무장 전에는 액티브 버튼(future_arm)만, 무장 후에야 교환 후보
    // (모달)가 뜬다. 예전처럼 턴 시작과 동시에 교환 프롬프트가 뜨지 않는다.
    // (같은 state → 같은 3장이므로 validate와 어긋나지 않는다. 최종 판정은 validate.)
    ctx.holderTurnOptions((state) => {
      if (handIdsOf(state, holder).length < 4) return [];
      if (!isArmed(state, holder)) return [{ type: ARM_ACTION, payload: {} }];
      return pickThree(state, holder).ids.map((tileId) => ({
        type: ACTION,
        payload: { tileId },
      }));
    });
  },
  // 봇 정책 없음 — 무장 후 3장을 교환하는 2단계 액션이고, 어떤 3장이 들어올지에 따라
  // 손이 좋아질 수도 나빠질 수도 있다. 순이득 여부를 값싼 휴리스틱으로 가릴 수 없어 둔다.
});
