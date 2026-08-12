/**
 * future_sight (미래를 보는 자) — 자기 턴에 발동하는 패산 교환 (**3순에 1회**, 리치 중 불가).
 * 손패에서 **무작위 3장**이 뽑히고, 그중 **어느 것을 자기 바닥에 버릴지는 내가 고른다**
 * (나머지 2장은 패산 맨 밑으로). 그리고 패산 위 3장을 가져온다.
 *
 * 2026-07-22 (48차): 바닥으로 보낼 패를 `outIds[0]`으로 강제하던 것을 플레이어 선택으로
 * 바꿨다 — 후리텐 위험을 감수할 패를 스스로 고른다. 무작위 3장 선정은 유지(운의 폭발).
 *
 * 무작위 3장은 `state.prngState`에서 **결정적으로** 계산되므로 holderTurnOptions(후보 제시)와
 * toEvents(확정)가 같은 3장을 본다. 이번 국 동안 사용 횟수만큼 스택이 쌓이고,
 * 화료 시 **스택당 +1판**을 추가로 얻는다 (스택 키에 roundKey가 들어가
 * 국이 바뀌면 자연 소멸 — 별도 리셋 불필요).
 *
 * ## 2026-08-02 (사용자 지시) — 매 순 1회 → **3순에 1회**, 대신 스택당 1판
 *
 * 빈도를 낮추고 한 번의 값을 올렸다. 매 순 쓸 수 있던 시절엔 "2스택당 1판"으로도
 * 한 국에 판이 계속 붙어 억제 장치가 스택 환율뿐이었다. 이제 쿨다운이 억제를 맡고
 * (내 순이 세 번 지나야 다시 열린다 — take_back과 같은 규칙), 발동 하나하나가
 * 확실히 +1판이 된다. 쌓인 판수는 이름표 증강 pill(`future_sight:{holder}` 채널)에
 * 상시로 뜬다 — "지금 몇 판이 붙어 있는지"가 안 보인다는 피드백 대응.
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
  kindKey,
  moveTiles,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  PlayerRoundState,
  TileDiscardedPayload,
  TileId,
} from "@majak/core";
import {
  addWinHanBonus,
  counterOf,
  flagOf,
  replaceDrawnTile,
  roundKey,
  roundViewKey,
  statePrng,
} from "../util.js";
import { plan } from "./botPlan.js";
import { handKindsOf, usefulIn } from "./botHelpers.js";

const ID = "future_sight";
const ACTION = "future_exchange";
/** 액티브 버튼 — 이걸 눌러야 교환 후보가 제시된다 */
const ARM_ACTION = "future_arm";
/** 이 증강이 만들어내는 이벤트 — id에서 파생시켜 충돌 방지 */
const FUTURE_SIGHT_EXCHANGED = "FutureSightExchanged";

/** 화료 보너스 1판에 필요한 스택 수 (2026-08-02: 3순 쿨다운을 넣으며 스택당 1판으로) */
const STACKS_PER_HAN = 1;
/** 쿨다운 — 한 번 쓰면 내 순이 이만큼 지나야 다시 열린다 */
const COOLDOWN_TURNS = 3;

/** 이번 국의 스택 카운터 키 — roundKey가 들어가 국이 바뀌면 자동 리셋 */
const stacksKey = (state: GameState, player: PlayerId): string =>
  `${ID}:stacks:${roundKey(state)}:${player}`;
/**
 * 이번 국에서 **내가 버린 횟수** = 내 순 번호 (국 스코프).
 *
 * ⚠ 순을 `state.round.turnCount`나 버림 이력 길이로 세면 안 된다.
 * 전자는 **오야가 쯔모할 때마다** 올라 깡 한 번에 같은 순이 두 순으로 갈렸고
 * (2026-08-01 사용자 보고: "깡 치면 한 번 더 사용 가능해지는 듯"), 후자는 이 증강이
 * 교환할 때 바닥에 놓는 한 장까지 세어 **발동하자마자 순이 넘어간 것처럼** 보인다.
 * 그래서 보유자의 실제 버림(TILE_DISCARDED)만 직접 센다.
 */
const turnsKey = (state: GameState, player: PlayerId): string =>
  `${ID}:turns:${roundKey(state)}:${player}`;
/** 마지막으로 교환한 순 번호 (쿨다운 기준점) */
const lastUsedKey = (state: GameState, player: PlayerId): string =>
  `${ID}:last:${roundKey(state)}:${player}`;
/** 무장 플래그 키 (국 단위 — 국이 바뀌면 자동 소멸) */
const armedKey = (state: GameState, player: PlayerId): string =>
  `${ID}:armed:${roundKey(state)}:${player}`;
/** 쌓인 스택 — 전원 공개(이름표 pill이 "+N판"으로 띄운다). 국이 바뀌면 사라진다 */
const stacksViewKey = (player: PlayerId): string =>
  roundViewKey("*", `${ID}:${player}`);
/** 교환으로 들어온 3장 — 전원 공개 */
const gotKey = (player: PlayerId): string =>
  roundViewKey("*", `${ID}:got:${player}`);
/** 위 tileId를 '진짜 패'로 그리게 하는 코어 공개 채널 */
const REVEAL_KEY = roundViewKey("*", "revealTiles:future");

/** 지금 무장되어 있는가 (액티브 버튼을 이미 눌렀는가) */
function isArmed(state: GameState, player: PlayerId): boolean {
  return flagOf(state, armedKey(state, player));
}

/** 이번 국에서 내가 몇 순째인가 (= 내가 버린 횟수) */
function turnNo(state: GameState, player: PlayerId): number {
  return counterOf(state, turnsKey(state, player));
}

/**
 * 쿨다운 중인가 — 마지막 교환 이후 내 순이 3번 지나지 않았다.
 * 같은 순의 재발동은 순 번호가 그대로라 여기서 자동으로 막힌다(깡을 쳐도 마찬가지).
 */
function onCooldown(state: GameState, player: PlayerId): boolean {
  const last = state.augmentData[lastUsedKey(state, player)];
  if (typeof last !== "number") return false; // 이 국에 아직 안 썼다
  return turnNo(state, player) - last < COOLDOWN_TURNS;
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
  if (onCooldown(state, player)) return "future sight is on cooldown";
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
  complexity: 2,
  name: "미래를 보는 자",
  description:
    "(3순에 1회) 액티브 버튼을 누르면 손패에서 무작위 3장이 뽑히고, 그중 바닥에 버릴 1장을 직접 고른 뒤(나머지 2장은 패산 맨 밑으로) 패산 위 3장을 가져온다. ⚠ 이렇게 가져온 3장은 상대에게도 공개된다. 쓸 때마다 층이 쌓여 그 국에 화료하면 층 하나당 +1판을 얻는다.",
  detail:
    "(3순에 1회) 자기 순에 버튼을 누르면 손패에서 뽑힌 무작위 3장이 제시된다. 그중 버릴 1장을 고르면 나머지 2장은 패산 맨 밑으로 들어가고 패산에서 3장을 새로 받는다. 한 번 누르면 취소할 수 없고, 고르지 않으면 무작위로 한 장이 버려진다.\n\n⚠ **가져온 3장은 상대에게도 그대로 공개된다** — 쓸수록 내 손이 읽힌다.\n\n교환할 때마다 층이 1씩 쌓여 그 국에 화료하면 층 하나당 +1판을 얻고, 층은 국이 바뀌면 초기화된다. 버린 패는 내 바닥에 쌓여 후리텐을 만들지만 다른 사람의 론·후로 대상은 되지 않는다. 한 번 쓰면 내 순이 세 번 지나야 다시 열린다. 리치 중에는 쓸 수 없다.",
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
        // 1장은 자기 버림더미로. 버림 **흐름**과는 무관하다 — lastDiscard를 건드리지 않으므로
        // 남의 론·후로 반응은 열리지 않는다(턴 중간에 리액션을 열면 순서가 깨진다).
        // 다만 내 바닥에 실제로 쌓이므로 **내 후리텐 근거로는 남겨야 한다** — 예전에는
        // discardedKinds에 새기지 않아 "내가 바닥에 버린 패로 내가 론하는" 상태가 됐다
        // (2026-07-29 감사).
        let zones = moveTiles(
          state.zones,
          handZone(p.player),
          discardsZone(p.player),
          [toDiscards],
        );
        const discardedKind = state.tiles[toDiscards]?.kind;
        const byPlayer =
          discardedKind === undefined
            ? state.round.byPlayer
            : {
                ...state.round.byPlayer,
                [p.player]: {
                  ...(state.round.byPlayer[p.player] as PlayerRoundState),
                  discardedKinds: [
                    ...(state.round.byPlayer[p.player]?.discardedKinds ?? []),
                    kindKey(discardedKind),
                  ],
                },
              };
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
          round: { ...replaceDrawnTile(state.round, newDrawn), byPlayer },
          augmentData: {
            ...state.augmentData,
            [sKey]: stacks,
            // 지금 이 순을 쿨다운 기준점으로 — 내 순이 3번 지나야 다시 열린다
            // (같은 순의 재발동은 순 번호가 그대로라 여기서 함께 막힌다)
            [lastUsedKey(state, p.player)]: turnNo(state, p.player),
            // 교환이 끝나면 무장이 풀린다 (다시 쓰려면 버튼을 또 눌러야 한다)
            [armedKey(state, p.player)]: false,
            // 쌓인 판수를 전원에게 — 이름표 증강 pill이 "+N판"으로 띄운다
            [stacksViewKey(p.player)]: stacks,
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

    // 내가 버리면 내 순이 끝난 것이다 — 순 카운터를 올리고(쿨다운 기준) 무장을 내린다.
    // 순 경계를 '내 버림'으로 잡으면 깡·영상 쯔모가 몇 번 끼어도 순은 한 번만 넘어간다.
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (p.player !== holder) return;
      rc.emit(
        augmentDataSet(turnsKey(rc.state, holder), turnNo(rc.state, holder) + 1),
      );
      if (isArmed(rc.state, holder)) {
        rc.emit(augmentDataSet(armedKey(rc.state, holder), false));
      }
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

    // 화료 시 이번 국 **스택당 +1판** (뱅크 지급 — 상대가 더 내지 않는다).
    // 2026-07-26엔 매 순 발동이라 스택당 1판이 과해 2스택당 1판으로 낮췄었다.
    // 2026-08-02 사용자 지시로 발동을 3순에 1회로 조이면서 환율을 되돌렸다 —
    // 억제는 쿨다운이 맡고, 한 번의 발동은 확실히 1판이 된다.
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
  /**
   * 봇 — **두 단계가 서로 다른 질문**이라는 것을 알면 판단이 선다.
   *
   * "2단계라 조율할 수 없다"고 두었던 자리인데, 정책은 프롬프트마다 다시 불리므로
   * 각 단계를 그 단계의 질문으로 답하면 된다.
   *
   * **1단계(무장)** — 손을 새로 고칠까. 들어올 3장은 모르지만 잃는 것도 모르는 3장이라
   * 교환 자체는 대략 중립이고, **확실한 이득이 따로 있다**: 발동 하나당 화료 시 +1판.
   * 그래서 "고쳐서 손해가 나는 손"만 피하면 된다 — 텐파이와 1샹텐이다(다 된 손을
   * 흩는 것은 명백한 손해). 2샹텐부터는 고칠수록 이득이다.
   *
   * **2단계(교환)** — 뽑힌 3장 중 **무엇을 바닥에 버릴까.** 세 장 다 손을 떠나므로
   * 손패 가치는 이미 정해졌고, 남은 변수는 **그 한 장이 바닥에 놓인다**는 것뿐이다.
   * 즉 이건 손패 문제가 아니라 **안전패 문제**다 — 가장 안전한 것을 버린다.
   * (같은 안전도면 손에 덜 쓸모 있는 쪽.) 이 단계는 미룰 수 없으므로 적기를 안 따진다.
   */
  bot: plan({
    intent: "advance",
    // 무장까지 마친 뒤라면 교환은 **지금 아니면 없다** — 그때만 적기 판단을 건너뛴다.
    fleeting: ({ options }) => options.some((o) => o.type === ACTION),
    pick: (ctx) => {
      const { options, view, holder, tenpai, shanten, safety } = ctx;
      const exchange = options.filter((o) => o.type === ACTION);
      if (exchange.length > 0) {
        const rest = handKindsOf(view, holder);
        let best = exchange[0] ?? null;
        let bestScore = -Infinity;
        for (const o of exchange) {
          const tileId = (o.payload as { tileId?: number }).tileId;
          const k = tileId === undefined ? undefined : view.tiles[tileId]?.kind;
          if (k === undefined) continue;
          // 안전이 먼저, 그다음이 손패 쓸모 (안전도가 같을 때만 갈린다)
          const score = safety(k) * 10 + (usefulIn(rest, k) ? 0 : 1);
          if (score > bestScore) {
            bestScore = score;
            best = o;
          }
        }
        return best;
      }
      // 아직 무장 전 — 다 된 손을 흩지 않는다
      if (tenpai || shanten <= 1) return null;
      return options.find((o) => o.type === ARM_ACTION) ?? null;
    },
  }),
});
