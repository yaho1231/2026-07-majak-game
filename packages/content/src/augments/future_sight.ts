/**
 * future_sight (미래를 보는 자) — 자기 턴에 발동하는 패산 교환 (**3순에 1회**, 리치 중 불가).
 * **내가 고른 손패 3장**이 패산 맨 밑으로 들어가고, 패산 위 3장이 손에 들어온다.
 * 발동할 때마다 층이 쌓여 그 국에 화료하면 **층 하나당 +1판**을 얻는다.
 *
 * ## 2026-08-15 (사용자 지시) — "무작위 3장 + 한 장은 바닥으로" → **임의의 3장, 순수 교환**
 *
 * 예전에는 손패에서 **무작위** 3장이 뽑히고 그중 한 장을 **자기 바닥에 버려야** 했다
 * (나머지 둘만 패산 밑으로). 뽑히는 3장을 고를 수 없는 데다 버린 한 장이 후리텐을
 * 만들어, "미래를 본다"는 이름과 달리 발동 자체가 도박이었다. 지금은 셋 다 내가 고르고
 * 바닥에 놓이는 패도 없다 — **손패 3장 ↔ 패산 위 3장의 순수 교환**이다.
 * (그래서 이 증강은 더 이상 난수를 쓰지 않는다 — prngState를 건드리지 않는다.)
 *
 * 억제는 두 가지가 그대로 맡는다: **3순 쿨다운**과 **가져온 3장의 전원 공개**.
 *
 * ## 2026-08-02 (사용자 지시) — 매 순 1회 → **3순에 1회**, 대신 스택당 1판
 *
 * 빈도를 낮추고 한 번의 값을 올렸다. 매 순 쓸 수 있던 시절엔 "2스택당 1판"으로도
 * 한 국에 판이 계속 붙어 억제 장치가 스택 환율뿐이었다. 이제 쿨다운이 억제를 맡고
 * (내 순이 세 번 지나야 다시 열린다 — take_back과 같은 규칙), 발동 하나하나가
 * 확실히 +1판이 된다. 쌓인 판수는 이름표 증강 pill(`future_sight:{holder}` 채널)에
 * 상시로 뜬다 — "지금 몇 판이 붙어 있는지"가 안 보인다는 피드백 대응.
 *
 * ## 발동은 4단계다 (액티브 버튼 1 + 패 선택 3)
 *
 * `future_arm {}`(무장 선언)을 누른 뒤에야 `future_exchange {tileId}` 후보가 제시되고,
 * 그 후보를 **세 번** 골라야 교환이 일어난다(고른 패는 다음 후보에서 빠진다).
 * 무장·선택 상태는 국 단위 키이며, 그 턴에 버림이 일어나면 자동으로 풀린다.
 * 이렇게 한 장씩 고르는 이유는 클라이언트가 쓰는 선택 모달이 **한 번에 한 장**을 고르는
 * 표면이기 때문이다 — 같은 모달을 세 번 띄우면 다중 선택 UI 없이 3장을 고를 수 있다.
 *
 * 2026-07-22 (55차, 사용자 피드백): 교환으로 손에 들어온 3장의 tileId를 전원 공개 뷰 채널
 * `future_sight:got:{player}`에 싣고, 같은 tileId를 `revealTiles:future`에도 실어
 * 클라이언트가 뒷면이 아니라 '진짜 패'로 그릴 수 있게 한다(PlayerView revealTiles 채널).
 */

import {
  ROUND_STARTED,
  TILE_DISCARDED,
  WALL,
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
  TileDiscardedPayload,
  TileId,
} from "@majak/core";
import {
  addWinHanBonus,
  cooldownTurnsViewKey,
  counterOf,
  flagOf,
  replaceDrawnTile,
  roundKey,
  roundViewKey,
} from "../util.js";
import { plan } from "./botPlan.js";
import { pickIsolatedDiscard } from "./botHelpers.js";

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
/** 한 번의 발동으로 갈아 끼우는 장수 (손패 → 패산 밑 / 패산 위 → 손패) */
const SWAP_COUNT = 3;

/** 이번 국의 스택 카운터 키 — roundKey가 들어가 국이 바뀌면 자동 리셋 */
const stacksKey = (state: GameState, player: PlayerId): string =>
  `${ID}:stacks:${roundKey(state)}:${player}`;
/**
 * 이번 국에서 **내가 버린 횟수** = 내 순 번호 (국 스코프).
 *
 * ⚠ 순을 `state.round.turnCount`나 버림 이력 길이로 세면 안 된다.
 * 전자는 **오야가 쯔모할 때마다** 올라 깡 한 번에 같은 순이 두 순으로 갈렸고
 * (2026-08-01 사용자 보고: "깡 치면 한 번 더 사용 가능해지는 듯"), 후자는 이 증강이
 * 만드는 버림까지 세는 문제가 있었다. 그래서 보유자의 실제 버림(TILE_DISCARDED)만 센다.
 */
const turnsKey = (state: GameState, player: PlayerId): string =>
  `${ID}:turns:${roundKey(state)}:${player}`;
/** 마지막으로 교환한 순 번호 (쿨다운 기준점) */
const lastUsedKey = (state: GameState, player: PlayerId): string =>
  `${ID}:last:${roundKey(state)}:${player}`;
/** 무장 플래그 키 (국 단위 — 국이 바뀌면 자동 소멸) */
const armedKey = (state: GameState, player: PlayerId): string =>
  `${ID}:armed:${roundKey(state)}:${player}`;
/** 이번 발동에서 지금까지 고른 손패 tileId 목록 (국 단위 — 3장이 차면 비워진다) */
const pickedKey = (state: GameState, player: PlayerId): string =>
  `${ID}:picked:${roundKey(state)}:${player}`;
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

/** 이번 발동에서 지금까지 고른 패들 (아직 하나도 안 골랐으면 빈 배열) */
function pickedIds(state: GameState, player: PlayerId): TileId[] {
  const v = state.augmentData[pickedKey(state, player)];
  return Array.isArray(v) ? (v as TileId[]) : [];
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
  if ((state.zones[WALL]?.tileIds.length ?? 0) < SWAP_COUNT) {
    return "not enough wall tiles";
  }
  if (handIdsOf(state, player).length < SWAP_COUNT + 1) {
    return "not enough tiles in hand";
  }
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
    // 지난 발동의 선택이 남아 있을 이유는 없지만, 무장할 때 확실히 비우고 시작한다
    augmentDataSet(pickedKey(state, req.player), []),
  ],
};

interface FutureSightExchangedPayload {
  player: PlayerId;
  /** 손에서 패산 맨 밑으로 내려가는 3장 (내가 고른 패들) */
  outIds: TileId[];
  /** 패산 위에서 들어오는 3장 — 마지막 장이 새 쯔모패가 된다 */
  inIds: TileId[];
}

const futureExchangeAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const common = commonReject(state, req.player);
    if (common !== null) return common;
    // 액티브 버튼(future_arm)을 누르지 않았으면 교환할 수 없다
    if (!isArmed(state, req.player)) return "not armed";
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    if (pickedIds(state, req.player).includes(req.payload.tileId)) {
      return "tile already picked";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const picked = [...pickedIds(state, req.player), req.payload.tileId];
    // 아직 3장을 못 채웠으면 선택만 쌓고 같은 모달을 한 번 더 연다
    if (picked.length < SWAP_COUNT) {
      return [augmentDataSet(pickedKey(state, req.player), picked)];
    }
    const inIds = (state.zones[WALL]?.tileIds ?? []).slice(0, SWAP_COUNT);
    const payload: FutureSightExchangedPayload = {
      player: req.player,
      outIds: picked,
      inIds,
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
    "(3순에 1회) 액티브 버튼을 누른 뒤 손패 3장을 고르면, 그 3장이 패산 맨 밑으로 들어가고 패산 위 3장이 손에 들어온다. ⚠ 이렇게 가져온 3장은 상대에게도 공개된다. 쓸 때마다 층이 쌓여 그 국에 화료하면 층 하나당 +1판을 얻는다.",
  detail:
    "(3순에 1회) 자기 순에 버튼을 누르면 손패에서 바꿀 패를 고르라는 창이 뜬다. 원하는 패를 3장 고르면 그 3장이 패산 맨 밑으로 내려가고 패산 위에서 3장이 그대로 손에 들어온다. 바닥에 버려지는 패는 없으므로 이 교환으로는 후리텐이 생기지 않고, 손패 장수도 변하지 않는다.\n\n⚠ **가져온 3장은 상대에게도 그대로 공개된다** — 쓸수록 내 손이 읽힌다.\n\n교환할 때마다 층이 1씩 쌓여 그 국에 화료하면 층 하나당 +1판을 얻고, 층은 국이 바뀌면 초기화된다. 한 번 쓰면 내 순이 세 번 지나야 다시 열리며, 리치 중에는 쓸 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    /*
     * 남은 쿨다운(순)을 이름표 pill에 상시로 낸다 — 채널이 없어서 **버튼이 사라지는
     * 것으로만** 다시 쓸 수 없다는 걸 알 수 있었다. 값이 같으면 아무것도 내지 않으므로
     * 반응 연쇄는 한 겹에서 멈춘다.
     */
    ctx.reaction("*", (_event, rc) => {
      const last = rc.state.augmentData[lastUsedKey(rc.state, holder)];
      const left =
        typeof last === "number"
          ? Math.max(0, COOLDOWN_TURNS - (turnNo(rc.state, holder) - last))
          : 0;
      if (rc.state.augmentData[cooldownTurnsViewKey(ID, holder)] !== left) {
        rc.emit(augmentDataSet(cooldownTurnsViewKey(ID, holder), left));
      }
    });

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(FUTURE_SIGHT_EXCHANGED)) {
      engine.reducers.register(FUTURE_SIGHT_EXCHANGED, (state, event) => {
        const p = event.payload as FutureSightExchangedPayload;
        const newDrawn = p.inIds[p.inIds.length - 1];
        if (p.outIds.length !== SWAP_COUNT || newDrawn === undefined) {
          throw new Error("future_sight: malformed exchange payload");
        }
        // ① 고른 3장을 패산 맨 밑(배열 끝)으로 — 앞쪽(다음 쯔모) 순서는 그대로다
        let zones = moveTiles(state.zones, handZone(p.player), WALL, p.outIds);
        // ② 패산 위(앞) 3장을 손으로 (①에서 넣은 패는 맨 밑이라 안 걸린다)
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
          // 마지막으로 들어온 패를 쯔모패로 — 이어지는 버림·리치 흐름 유지
          round: replaceDrawnTile(state.round, newDrawn),
          augmentData: {
            ...state.augmentData,
            [sKey]: stacks,
            // 지금 이 순을 쿨다운 기준점으로 — 내 순이 3번 지나야 다시 열린다
            // (같은 순의 재발동은 순 번호가 그대로라 여기서 함께 막힌다)
            [lastUsedKey(state, p.player)]: turnNo(state, p.player),
            // 교환이 끝나면 무장과 선택이 풀린다 (다시 쓰려면 버튼을 또 눌러야 한다)
            [armedKey(state, p.player)]: false,
            [pickedKey(state, p.player)]: [],
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
        rc.emit(augmentDataSet(pickedKey(rc.state, holder), []));
      }
    });

    // 국이 바뀌면 지난 국 tileId가 새지 않게 공개 채널을 비운다
    // (무장·선택·스택 키는 roundKey가 섞여 자동 소멸한다).
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

    // 무장 전에는 액티브 버튼(future_arm)만, 무장 후에는 **아직 안 고른 손패 전부**가
    // 교환 후보로 뜬다 — 세 번 고르면 그때 교환이 일어난다.
    // (최종 판정은 validate.)
    ctx.holderTurnOptions((state) => {
      if (handIdsOf(state, holder).length < SWAP_COUNT + 1) return [];
      if (!isArmed(state, holder)) return [{ type: ARM_ACTION, payload: {} }];
      const picked = new Set(pickedIds(state, holder));
      return handIdsOf(state, holder)
        .filter((tileId) => !picked.has(tileId))
        .map((tileId) => ({ type: ACTION, payload: { tileId } }));
    });
  },
  /**
   * 봇 — **두 단계가 서로 다른 질문**이라는 것을 알면 판단이 선다.
   *
   * **1단계(무장)** — 손을 새로 고칠까. 들어올 3장은 모르지만 내보내는 3장은 내가 고르고,
   * **확실한 이득이 따로 있다**: 발동 하나당 화료 시 +1판. 그래서 "고쳐서 손해가 나는 손"만
   * 피하면 된다 — 텐파이와 1샹텐이다(다 된 손을 흩는 것은 명백한 손해).
   * 2샹텐부터는 고칠수록 이득이다.
   *
   * **2단계(선택)** — 무엇을 내보낼까. 바닥에 놓이는 패가 없으므로 안전패 문제가 아니라
   * 순수한 손패 문제다: **손에 쓸모없는 패부터** 내보낸다. 세 번 불리며 한 장씩 고른다.
   */
  bot: plan({
    intent: "advance",
    // 무장까지 마친 뒤라면 선택은 **지금 아니면 없다** — 그때만 적기 판단을 건너뛴다.
    fleeting: ({ options }) => options.some((o) => o.type === ACTION),
    pick: (ctx) => {
      const { options, view, holder, tenpai, shanten } = ctx;
      if (options.some((o) => o.type === ACTION)) {
        // 나머지 손패 기준으로 가장 고립된 패부터 내보낸다 (짝·이웃이 있으면 남긴다)
        return pickIsolatedDiscard(view, holder, options, ACTION);
      }
      // 아직 무장 전 — 다 된 손을 흩지 않는다
      if (tenpai || shanten <= 1) return null;
      return options.find((o) => o.type === ARM_ACTION) ?? null;
    },
  }),
});
