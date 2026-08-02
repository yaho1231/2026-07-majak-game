/**
 * hand_swap3 (등가교환) — 게임당 2회, 자기 턴에 상대 한 명을 '지정'하면 그 상대의
 * 손패가 보유자에게만 진짜 패로 공개되고, **내 패 3장 ↔ 상대 패 3장을 한 번에**
 * 맞바꾼다. 주는 패도 받는 패도 전부 보유자가 고른다 — 무작위 없음
 * (10_AUGMENT_SYSTEM §0 무페널티 원칙: "나에게 불리할 수 있는 무작위"를 선택으로 대체).
 *
 * 구현 메모:
 * - 액션이 셋으로 나뉜다. FlowController.submit은 제시된 옵션과 JSON 완전일치를
 *   요구하므로 "내 3장 + 상대 3장"을 한 액션에 담으면 C(14,3)×C(13,3) ≈ 10만 옵션이
 *   되어 불가능하다. 두 단계로 쪼개면 364개 → 286개로 각각 감당 가능하다.
 *   · swap3      : 대상 지정. 손패는 전혀 움직이지 않는다(중간 상태에서 손패 수가
 *                  깨지지 않게 하는 핵심). 게임 사용 횟수를 1 소비하고, 대상의 실제
 *                  손패 tile id를 view:{holder}:revealTiles:{target}에 실어 보유자
 *                  에게만 진짜 패로 공개한다(봉인술사가 쓰는 코어 범용 채널).
 *   · swap3_give : 넘길 내 손패 3장을 한 번에 고른다 (아직 아무것도 움직이지 않는다).
 *   · swap3_take : 가져올 상대 손패 3장을 한 번에 고른다 → 그 순간 3:3 교환이 일어난다.
 *   (예전엔 1:1 교환을 3번 반복시켜 선택 창을 여섯 번 띄웠다 — 같은 결과에 조작만 배로
 *    드는 구조라 "3장씩 한 번에"로 합쳤다.)
 * - 55차(사용자 피드백): **교환을 완료한 국에는 재사용할 수 없다.** swap3_take 리듀서가
 *   국 단위 done 플래그를 세우고, 그 국 동안 새 지정(swap3)을 holderTurnOptions와
 *   validate 양쪽에서 막는다. done은 '완료 시점'에만 서므로 이미 시작한 다단계
 *   (지정→넘길 3장→가져올 3장)는 중간에 끊기지 않고 끝까지 진행된다.
 * - 지정은 국 단위 스코프다(키에 roundKey를 섞어 국이 바뀌면 자동 소멸). 지정 후
 *   대상이 리치를 걸면 손이 고정되므로 그 시점부터 교환이 막힌다(마작 규칙 정합성).
 * - 쯔모패를 넘겼다면 받아온 패 하나를 새 lastDrawnTile로 삼아 이어지는 버림·리치
 *   흐름이 깨지지 않게 한다.
 * - PRNG를 쓰지 않는다(전부 보유자의 선택이라 소비할 난수가 없다).
 */

import {
  ROUND_STARTED,
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
import {
  counterOf,
  replaceDrawnTile,
  roundKey,
  roundViewKey,
  stringOf,
} from "../util.js";
import {
  breakStealthRiichiEvents,
  ensureStealthBreakReducer,
  riichiBlocksSwap,
} from "./stealthBreak.js";

const ID = "hand_swap3";
/** 대상 지정 액션 (손패는 움직이지 않는다) */
const AIM_ACTION = "swap3";
/** 넘길 내 3장 선택 액션 */
const GIVE_ACTION = "swap3_give";
/** 가져올 상대 3장 선택 액션 (여기서 실제 교환이 일어난다) */
const TAKE_ACTION = "swap3_take";
/** 게임당 지정 가능 횟수 */
const MAX_USES = 2;
/** 한 번에 맞바꾸는 장수 */
const SWAP_TILES = 3;
/** 교환 이벤트 — id에서 파생시켜 충돌 방지 */
const HAND_SWAP3_SWAPPED = "HandSwap3Swapped";

/** 게임 단위 지정 횟수 카운터 */
const usedKey = (holder: PlayerId): string => `${ID}:used:${holder}`;
/** 이번 국에 지정해 둔 상대 (국 단위 — 국이 바뀌면 키가 달라져 자동 소멸) */
const targetKey = (state: GameState, holder: PlayerId): string =>
  `${ID}:target:${roundKey(state)}:${holder}`;
/** 이번 국에 남은 교환 횟수 (지정 1회당 1) */
const leftKey = (state: GameState, holder: PlayerId): string =>
  `${ID}:left:${roundKey(state)}:${holder}`;
/** 고르기까지 끝낸 '넘길 내 3장' (아직 손패는 그대로) */
const giveKey = (state: GameState, holder: PlayerId): string =>
  `${ID}:give:${roundKey(state)}:${holder}`;
/**
 * 이번 국에 교환을 **완료**했는가 (55차 사용자 피드백: "발동한 국에는 재사용 불가").
 * 교환이 끝나는 순간(swap3_take 리듀서)에 세우고, 그 국에는 새 지정을 막는다.
 * 국 단위 키라 다음 국이 되면 자동 만료된다 — 게임당 2회 한도와는 별개의 제한이다.
 */
const doneKey = (state: GameState, holder: PlayerId): string =>
  `${ID}:done:${roundKey(state)}:${holder}`;
/** 보유자 전용 '실제 패' 공개 키 (revealTiles:* 채널 → 진짜 패 메타데이터 노출) */
const revealKey = (holder: PlayerId, target: PlayerId): string =>
  roundViewKey(holder, `revealTiles:${target}`);

interface HandSwap3SwappedPayload {
  holder: PlayerId;
  target: PlayerId;
  /** 보유자 → 상대 (보유자가 고른 3장) */
  gives: TileId[];
  /** 상대 → 보유자 (보유자가 고른 3장) */
  takes: TileId[];
}

/** 이번 국에 지정해 둔 상대 (없으면 null) */
function aimedTarget(state: GameState, holder: PlayerId): PlayerId | null {
  return stringOf(state, targetKey(state, holder));
}

/** 이번 국에 이미 교환을 완료했는가 */
function swappedThisRound(state: GameState, holder: PlayerId): boolean {
  return state.augmentData[doneKey(state, holder)] === true;
}

/** 이번 국에 남은 교환 횟수 */
function swapsLeft(state: GameState, holder: PlayerId): number {
  return counterOf(state, leftKey(state, holder));
}

/** 고르기까지 끝낸 '넘길 내 3장' (아직 없으면 빈 배열) */
function pendingGives(state: GameState, holder: PlayerId): TileId[] {
  const v = state.augmentData[giveKey(state, holder)];
  return Array.isArray(v) ? (v as TileId[]) : [];
}

/** 지금 바로 교환할 수 있는 대상 (지정됨 + 횟수 남음 + 대상이 리치 아님) */
function activeTarget(state: GameState, holder: PlayerId): PlayerId | null {
  const target = aimedTarget(state, holder);
  if (target === null) return null;
  if (swapsLeft(state, holder) <= 0) return null;
  if (state.round.byPlayer[target]?.riichi != null) return null;
  return target;
}

/** 보유자의 자기 턴(행동 페이즈)인가 */
function onMyTurn(state: GameState, holder: PlayerId): boolean {
  if (state.round.phase !== "turn.act") return false;
  if (state.round.byPlayer[holder]?.riichi != null) return false; // 리치 중엔 손이 동결
  return playerAtSeat(state, state.round.turnSeat).id === holder;
}

/** 보유 증강 확인 + 자기 턴 확인 (세 액션 공통) */
function commonReject(state: GameState, player: PlayerId): string | null {
  const me = state.players.find((p) => p.id === player);
  if (me === undefined) return "unknown player";
  if (!me.augments.includes(ID)) return "no hand_swap3 augment";
  if (state.round.phase !== "turn.act") return "not in act phase";
  if (playerAtSeat(state, state.round.turnSeat).id !== player) {
    return "not your turn";
  }
  // 보유자 자신이 리치 중이면 손패가 동결된다 — 대상의 리치만 보고 자기 리치를
  // 빠뜨리면 리치 후 손패 3장을 바꿔치기할 수 있었다(2026-07-29 감사).
  if (state.round.byPlayer[player]?.riichi != null) return "riichi: hand is frozen";
  return null;
}

/** 서로 다른 3장인가 (제시 옵션과의 JSON 완전일치를 위해 오름차순도 요구) */
function isSortedTriple(ids: unknown): ids is TileId[] {
  if (!Array.isArray(ids) || ids.length !== SWAP_TILES) return false;
  if (!ids.every((x) => typeof x === "number")) return false;
  const arr = ids as number[];
  return arr[0]! < arr[1]! && arr[1]! < arr[2]!;
}

/** 오름차순 tileId 목록에서 3장 조합을 전부 만든다 (옵션 제시용) */
function triples(ids: readonly TileId[]): TileId[][] {
  const sorted = [...ids].sort((a, b) => a - b);
  const out: TileId[][] = [];
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      for (let k = j + 1; k < sorted.length; k++) {
        out.push([sorted[i]!, sorted[j]!, sorted[k]!]);
      }
    }
  }
  return out;
}

/** 지정 — 상대의 손패를 보유자에게 공개하고 3:3 교환 1회를 연다 (손패는 그대로) */
const aimAction: ActionDef<{ target: PlayerId }> = {
  type: AIM_ACTION,
  validate: (req, { state, rules }) => {
    const common = commonReject(state, req.player);
    if (common !== null) return common;
    if (counterOf(state, usedKey(req.player)) >= MAX_USES) {
      return "swap3 already used";
    }
    // 발동(교환 완료)한 국에는 다시 지정할 수 없다
    if (swappedThisRound(state, req.player)) {
      return "swap3 already swapped this round";
    }
    const target = state.players.find((p) => p.id === req.payload.target);
    if (target === undefined) return "unknown target";
    if (target.id === req.player) return "cannot target yourself";
    // 보이는 리치만 막는다 — 숨은 리치(스텔스)를 대상 목록에서 빼면 그 빈자리가
    // 곧 "저 사람 리치다"가 된다. 숨은 리치는 지정할 수 있고, 교환이 성사되는
    // 순간(take) 그 리치가 풀린다.
    if (riichiBlocksSwap(rules, state, target.id)) {
      return "target is in riichi";
    }
    if (handIdsOf(state, req.player).length < SWAP_TILES) {
      return "not enough tiles in hand";
    }
    if (handIdsOf(state, target.id).length < SWAP_TILES) {
      return "target has too few tiles";
    }
    return null;
  },
  // 손패를 건드리지 않으므로 커스텀 리듀서가 필요 없다 — 상태 키 5개만 쓴다.
  toEvents: (req, { state }) => [
    augmentDataSet(usedKey(req.player), counterOf(state, usedKey(req.player)) + 1),
    augmentDataSet(targetKey(state, req.player), req.payload.target),
    augmentDataSet(leftKey(state, req.player), 1),
    augmentDataSet(giveKey(state, req.player), []),
    augmentDataSet(revealKey(req.player, req.payload.target), [
      ...handIdsOf(state, req.payload.target),
    ]),
  ],
};

/** 넘길 내 3장 선택 — 아직 아무 패도 움직이지 않는다 (다음 단계에서 실제 교환) */
const giveAction: ActionDef<{ gives: TileId[] }> = {
  type: GIVE_ACTION,
  validate: (req, { state }) => {
    const common = commonReject(state, req.player);
    if (common !== null) return common;
    if (aimedTarget(state, req.player) === null) return "no target designated";
    if (swappedThisRound(state, req.player)) return "already swapped this round";
    if (swapsLeft(state, req.player) <= 0) return "no swaps left";
    if (pendingGives(state, req.player).length > 0) return "gives already chosen";
    if (!isSortedTriple(req.payload.gives)) return "need three distinct tiles";
    const hand = handIdsOf(state, req.player);
    if (!req.payload.gives.every((id) => hand.includes(id))) {
      return "give tile not in hand";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(giveKey(state, req.player), [...req.payload.gives]),
  ],
};

/** 가져올 상대 3장 선택 — 여기서 3:3 교환이 실제로 일어난다 */
const takeAction: ActionDef<{ takes: TileId[] }> = {
  type: TAKE_ACTION,
  validate: (req, { state, rules }) => {
    const common = commonReject(state, req.player);
    if (common !== null) return common;
    const target = aimedTarget(state, req.player);
    if (target === null) return "no target designated";
    if (swappedThisRound(state, req.player)) return "already swapped this round";
    if (swapsLeft(state, req.player) <= 0) return "no swaps left";
    if (riichiBlocksSwap(rules, state, target)) return "target is in riichi";
    const gives = pendingGives(state, req.player);
    if (gives.length !== SWAP_TILES) return "choose your three tiles first";
    const myHand = handIdsOf(state, req.player);
    if (!gives.every((id) => myHand.includes(id))) return "give tile not in hand";
    if (!isSortedTriple(req.payload.takes)) return "need three distinct tiles";
    const theirHand = handIdsOf(state, target);
    if (!req.payload.takes.every((id) => theirHand.includes(id))) {
      return "take tile not in target hand";
    }
    return null;
  },
  toEvents: (req, { state, rules }) => {
    const target = aimedTarget(state, req.player) as PlayerId;
    const payload: HandSwap3SwappedPayload = {
      holder: req.player,
      target,
      gives: pendingGives(state, req.player),
      takes: [...req.payload.takes],
    };
    return [
      { type: HAND_SWAP3_SWAPPED, payload },
      // 손패 3장이 갈렸으면 그 손에 걸려 있던 숨은 리치는 풀린다 (당사자에게만 통보)
      ...breakStealthRiichiEvents(rules, state, target, req.player),
    ];
  },
};

export const handSwap3: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  name: "등가교환",
  description:
    "(게임 내 2회 · 한 국에 1회) 자기 순에 상대 한 명을 지정하면 그 손패가 나에게만 공개되고, 넘길 내 3장과 가져올 상대 3장을 각각 골라 통째로 맞바꾼다.",
  detail:
    "(게임 내 2회 · 한 국에 1회) 자기 순에 상대 한 명을 지정하면 그 손패 전체가 나에게만 진짜 패로 공개된다. 이어서 넘길 내 3장과 가져올 상대 3장을 각각 한 번에 골라 맞바꾸며, 무작위 없이 전부 내가 고르고 양쪽 손패 장수도 그대로 유지된다. 리치한 상대는 지정할 수 없고 지정한 뒤 상대가 리치하면 교환이 중단된다. 다만 **숨은 리치(스텔스 리치)는 남들에게 리치가 아닌 사람으로 보이므로 그대로 지정할 수 있고**, 3장이 갈리는 순간 그 리치는 풀린다 — 풀렸다는 사실은 당사자에게만 알려진다. 한 번 교환을 마친 국에는 그 국이 끝날 때까지 다시 쓸 수 없어 두 번째 사용은 다음 국 이후로 미뤄진다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 숨은 리치 해제 리듀서 (손을 바꾸는 증강 공용 — 등록은 멱등)
    ensureStealthBreakReducer(engine);

    // 이벤트·액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.reducers.has(HAND_SWAP3_SWAPPED)) {
      engine.reducers.register(HAND_SWAP3_SWAPPED, (state, event) => {
        const p = event.payload as HandSwap3SwappedPayload;
        // 3장씩 맞바꾼다 — 양쪽 손패 장수가 보존된다.
        let zones = moveTiles(
          state.zones,
          handZone(p.holder),
          handZone(p.target),
          p.gives,
        );
        zones = moveTiles(zones, handZone(p.target), handZone(p.holder), p.takes);
        // 쯔모패를 넘겼다면 받아온 패 하나가 새 쯔모패 — 이어지는 버림 흐름(리치 제한·
        // 쯔모기리 표시)이 깨지지 않게 한다.
        const drawn = state.round.lastDrawnTile;
        const nextDrawn =
          drawn !== null && p.gives.includes(drawn) ? (p.takes[0] as TileId) : drawn;
        // 교환이 끝나면 공개는 거기서 끝난다 — 채널을 비운다.
        // (2026-08-02 사용자 지시: "3개씩 교환하고 끝이야. 따로 더 보여줄 필요는 없어".
        //  예전엔 교환 후 상대의 새 손패를 계속 실어 둬서, 그 상대 옆에 남은 국 내내
        //  손패가 떠 있었다 — 게다가 클라이언트가 그걸 봉인술사와 같은 배지로 그려
        //  '🔒 봉인'이라는 엉뚱한 이름표가 붙었다.)
        const next: GameState = {
          ...state,
          zones,
          round: replaceDrawnTile(state.round, nextDrawn),
          augmentData: {
            ...state.augmentData,
            [leftKey(state, p.holder)]: Math.max(
              0,
              counterOf(state, leftKey(state, p.holder)) - 1,
            ),
            [giveKey(state, p.holder)]: [],
            // 이 국에는 다시 지정할 수 없다 (사용자 피드백: 발동한 국 재사용 금지)
            [doneKey(state, p.holder)]: true,
            [revealKey(p.holder, p.target)]: [],
          },
        };
        return next;
      });
    }
    if (!engine.actions.has(AIM_ACTION)) engine.actions.register(aimAction);
    if (!engine.actions.has(GIVE_ACTION)) engine.actions.register(giveAction);
    if (!engine.actions.has(TAKE_ACTION)) engine.actions.register(takeAction);

    // 국이 바뀌면 지정·잔여 횟수는 키가 달라져 자동 소멸하지만, 공개 채널은 고정 키라
    // 남는다 — 새 국의 배패에 그대로 얹히면 엉뚱한 패가 새므로 국 시작에 비운다.
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      for (const p of rc.state.players) {
        if (p.id === holder) continue;
        const key = revealKey(holder, p.id);
        const current = rc.state.augmentData[key];
        if (Array.isArray(current) && current.length > 0) {
          rc.emit(augmentDataSet(key, []));
        }
      }
    });

    // 보유자 턴 후보:
    //  - 지정됐고 아직 넘길 3장을 안 골랐으면 → 내 손패 3장 조합 (C(14,3)=364)
    //  - 넘길 3장을 골랐으면            → 상대 손패 3장 조합 (C(13,3)=286)
    //  - 아니면(미지정·교환 소진) 게임 횟수가 남는 한 → 대상 지정 (최대 3개)
    // 합법성은 validate가 최종 판정한다.
    ctx.holderTurnOptions((state) => {
      if (!onMyTurn(state, holder)) return [];
      const myHand = handIdsOf(state, holder);
      if (myHand.length < SWAP_TILES) return [];

      const target = activeTarget(state, holder);
      if (target !== null) {
        const gives = pendingGives(state, holder);
        if (gives.length === 0) {
          return triples(myHand).map((t) => ({
            type: GIVE_ACTION,
            payload: { gives: t },
          }));
        }
        return triples(handIdsOf(state, target)).map((t) => ({
          type: TAKE_ACTION,
          payload: { takes: t },
        }));
      }

      if (counterOf(state, usedKey(holder)) >= MAX_USES) return [];
      // 이번 국에 이미 교환을 마쳤으면 새 지정을 제시하지 않는다
      if (swappedThisRound(state, holder)) return [];
      return state.players
        .filter(
          (p) =>
            p.id !== holder &&
            // 숨은 리치는 후보에 남긴다 — 빠지는 것 자체가 누설이기 때문이다
            !riichiBlocksSwap(engine.rules, state, p.id) &&
            handIdsOf(state, p.id).length >= SWAP_TILES,
        )
        .map((p) => ({ type: AIM_ACTION, payload: { target: p.id } }));
    });
  },
  // 봇 정책 없음 — 지정→넘길 3장→가져올 3장으로 이어지는 3단계 액션이라, 한 번의
  // choose()로는 조율할 수 없다(여러 프롬프트에 걸친 계획이 필요). 단순 규칙으로 두면
  // 반쪽짜리 교환이 되기 쉬워 정책을 두지 않는다.
});
