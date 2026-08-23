/**
 * hand_swap3 (등가교환) — 동풍전 2회·반장전 3회, 자기 턴에 상대 한 명을 '지정'하면 그 상대의
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
  TileKind,
} from "@majak/core";
import {
  counterOf,
  publishUsesLeft,
  replaceDrawnTile,
  roundViewKey,
  scaledUses,
  stringOf,
} from "../util.js";
import {
  breakStealthRiichiEvents,
  ensureStealthBreakReducer,
  riichiBlocksSwap,
} from "./stealthBreak.js";
import { roundScopedKey } from "./roundScope.js";
import { handAlteredMark } from "./handAltered.js";

const ID = "hand_swap3";
/** 대상 지정 액션 (손패는 움직이지 않는다) */
const AIM_ACTION = "swap3";
/** 넘길 내 3장 선택 액션 */
const GIVE_ACTION = "swap3_give";
/** 가져올 상대 3장 선택 액션 (여기서 실제 교환이 일어난다) */
const TAKE_ACTION = "swap3_take";
/** 게임당 지정 가능 횟수 */
/**
 * **동풍전 기준** 사용 횟수 — 반장전은 `scaledUses`가 1.5배(올림)로 늘린다
 * (동풍전 2회 · 반장전 3회, 2026-08-23 사용자 지시).
 * 매치 예산은 원래 동풍전(4국)을 기준으로 잡혀 있어서, 국이 두 배 도는 반장전에서
 * 같은 카드가 국당 절반 값이 됐다.
 */
const TONPUU_USES = 2;
/** 이 매치에서 쓸 수 있는 총 횟수 (동풍전 2 · 반장전 3) */
const maxUses = (state: GameState): number => scaledUses(state, TONPUU_USES);
/** 한 번에 맞바꾸는 장수 */
const SWAP_TILES = 3;
/** 교환 이벤트 — id에서 파생시켜 충돌 방지 */
const HAND_SWAP3_SWAPPED = "HandSwap3Swapped";

/** 게임 단위 지정 횟수 카운터 */
const usedKey = (holder: PlayerId): string => `${ID}:used:${holder}`;
/** 이번 국에 지정해 둔 상대 (국 단위 — 국이 바뀌면 키가 달라져 자동 소멸) */
const targetKey = (state: GameState, holder: PlayerId): string =>
  roundScopedKey(ID, "target", state, holder);
/** 이번 국에 남은 교환 횟수 (지정 1회당 1) */
const leftKey = (state: GameState, holder: PlayerId): string =>
  roundScopedKey(ID, "left", state, holder);
/** 고르기까지 끝낸 '넘길 내 3장' (아직 손패는 그대로) */
const giveKey = (state: GameState, holder: PlayerId): string =>
  roundScopedKey(ID, "give", state, holder);
/**
 * 이번 국에 교환을 **완료**했는가 (55차 사용자 피드백: "발동한 국에는 재사용 불가").
 * 교환이 끝나는 순간(swap3_take 리듀서)에 세우고, 그 국에는 새 지정을 막는다.
 * 국 단위 키라 다음 국이 되면 자동 만료된다 — 매치 횟수 한도와는 별개의 제한이다.
 */
const doneKey = (state: GameState, holder: PlayerId): string =>
  roundScopedKey(ID, "done", state, holder);
/** 보유자 전용 '실제 패' 공개 키 (revealTiles:* 채널 → 진짜 패 메타데이터 노출) */
const revealKey = (holder: PlayerId, target: PlayerId): string =>
  roundViewKey(holder, `revealTiles:${target}`);
/**
 * **누구를 지정했는가** — 전원 공개, 양쪽 이름표의 지목 표식(np-rel)이 그린다.
 *
 * 지정과 교환 사이에는 순서가 몇 번 돌 수 있는데(넘길 3장을 고민하다 물러나면 다음
 * 순으로 넘어간다), 그동안 화면에는 "누구와 바꾸기로 했는지"가 어디에도 없었다
 * (2026-08-15 사용자 요청). 대상 지정 사실 자체는 원래 actionFx로 전원에게 알리는
 * 정보라 공개 채널에 그대로 실을 수 있다 — 갈릴 **패**는 여전히 당사자 전용이다.
 *
 * 교환이 성사되는 순간 비운다(표식은 '앞으로 바꾼다'는 예고이므로 끝나면 남을 이유가
 * 없다). 교환하지 못한 채 국이 끝나면 국 스코프 키라 알아서 사라진다.
 *
 * ⚠ 대상이 리치를 걸어 교환이 막혔을 때는 **비우지 않는다** — 표식이 사라지는 것
 * 자체가 "저 사람 숨은 리치다"가 되기 때문이다(docs/25 P3, 대상 목록과 같은 이유).
 */
const aimViewKey = (holder: PlayerId): string => roundViewKey("*", `${ID}:${holder}`);
/**
 * 교환 결과 통보 채널 — **당사자 둘에게만**.
 *
 * 3장이 소리 없이 갈리는 것이 이 증강의 전부인데, 화면에는 아무 말도 안 나왔다.
 * 보유자는 자기가 고른 것이라 그나마 알지만 **지정당한 쪽은 손패가 언제 어떻게
 * 바뀌었는지 알 길이 없었다**(2026-08-12 사용자 지적). 무엇이 나가고 무엇이 들어왔는지를
 * 양쪽에 한 번 크게 보여준다.
 *
 * 제3자에게는 여전히 새지 않는다 — 대상 지정 사실만 공개(actionFx)이고, 갈린 패는
 * 당사자 전용 채널이다.
 */
const noticeKey = (viewer: PlayerId): string => roundViewKey(viewer, `${ID}:swapped`);

/** `noticeKey` 채널에 실리는 값 (클라이언트 컷인이 그대로 읽는다) */
interface Swap3Notice {
  /** 교환 상대 */
  with: PlayerId;
  /** 내가 넘긴 패 */
  gave: TileKind[];
  /** 내가 받은 패 */
  got: TileKind[];
  /** 내가 지정한 쪽인가 (문구가 갈린다) */
  holder: boolean;
}

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

/**
 * 고르기까지 끝낸 '넘길 내 3장' (아직 없으면 빈 배열).
 *
 * ⚠ **손을 떠난 패가 하나라도 있으면 그 선택은 통째로 무효**로 본다
 * (2026-08-20 QA hand-a 확정 4). give는 패를 움직이지 않고 키에 적어 둘 뿐이라
 * 고른 3장을 그대로 버리거나 안깡으로 넣을 수 있는데, 예전에는 그러면
 * ① take가 "give tile not in hand"로 영구 반려되고
 * ② give는 `length > 0`이라 다시 고를 수 없어
 * 그 국의 교환이 조용히 죽었다 — 매치 예산 한 번은 이미 소모된 채로.
 * 무효로 떨어뜨리면 give 후보가 다시 뜨고, 그 국 안에서 다시 고를 수 있다.
 */
function pendingGives(state: GameState, holder: PlayerId): TileId[] {
  const v = state.augmentData[giveKey(state, holder)];
  if (!Array.isArray(v)) return [];
  const raw = v as TileId[];
  const hand = handIdsOf(state, holder);
  return raw.every((id) => hand.includes(id)) ? raw : [];
}

/** 지금 바로 교환할 수 있는 대상 (지정됨 + 횟수 남음 + 대상이 리치 아님) */
function activeTarget(
  state: GameState,
  rules: Parameters<typeof riichiBlocksSwap>[0],
  holder: PlayerId,
): PlayerId | null {
  const target = aimedTarget(state, holder);
  if (target === null) return null;
  if (swapsLeft(state, holder) <= 0) return null;
  // 원시 riichi를 보면 안 된다 — 지정해 둔 상대가 **스텔스** 리치를 걸었을 때
  // 보유자의 give/take 옵션이 통째로 사라져, 그 빈자리가 곧 "저 사람 리치다"가
  // 된다(docs/25 P3). 숨은 리치는 대상으로 남기고 교환 시 stealthBreak가 해제한다.
  if (riichiBlocksSwap(rules, state, target)) return null;
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
    if (counterOf(state, usedKey(req.player)) >= maxUses(state)) {
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
    // 누구와 바꾸기로 했는지 — 양쪽 이름표에 표식으로 선다 (교환이 끝나면 걷힌다)
    augmentDataSet(aimViewKey(req.player), req.payload.target),
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
    // 이미 3장을 고른 뒤에만 막는다 — 손을 떠난 패가 섞이면 pendingGives가 빈
    // 배열을 돌려주므로 그 국 안에서 다시 고를 수 있다(확정 4).
    if (pendingGives(state, req.player).length >= SWAP_TILES) {
      return "gives already chosen";
    }
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
  complexity: 1,
  name: "등가교환",
  description:
    "(동풍전 2회 · 반장전 3회 · 매 국 1회) 자기 순에 상대 한 명을 지정해 손패를 보고, 넘길 내 3장과 가져올 상대 3장을 골라 맞바꾼다. 리치를 선언한 상대는 지정할 수 없다.",
  detail:
    "(동풍전 2회 · 반장전 3회 · 매 국 1회) 무작위 없이 전부 내가 고르고 양쪽 손패 장수도 그대로다. 손패와 오간 패는 당사자 둘에게만 보인다. **숨은 리치는 그대로 지정할 수 있고**, 3장이 갈리는 순간 그 리치는 풀린다. 횟수는 지정하는 순간 소비된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, maxUses(state) - counterOf(state, usedKey(holder))),
      total: maxUses(state),
    }));

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
        // 무엇이 오갔는지 — 당사자 둘에게만. 각자 자기 기준으로 "준 것 / 받은 것"이다.
        const kindsOf = (ids: readonly TileId[]): TileKind[] =>
          ids.map((id) => state.tiles[id]?.kind).filter((k): k is TileKind => k !== undefined);
        const gaveKinds = kindsOf(p.gives);
        const tookKinds = kindsOf(p.takes);
        const holderNotice: Swap3Notice = {
          with: p.target,
          gave: gaveKinds,
          got: tookKinds,
          holder: true,
        };
        const targetNotice: Swap3Notice = {
          with: p.holder,
          gave: tookKinds,
          got: gaveKinds,
          holder: false,
        };
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
            // 교환이 끝났으니 '누구와 바꾼다'는 예고 표식도 함께 걷는다
            [aimViewKey(p.holder)]: "",
            [noticeKey(p.holder)]: holderNotice,
            [noticeKey(p.target)]: targetNotice,
            // 천화·지화 게이트를 닫는다 — 3장만 바꿔도 "배패가 첫 쯔모 시점에 이미
            // 완성돼 있었다"는 천화의 전제가 깨진다(2026-08-22 QA aug-2 확정 2,
            // 48,000점 실측). 손이 바뀐 것은 **교환 당사자 양쪽**이다.
            ...handAlteredMark(state, p.holder),
            ...handAlteredMark(state, p.target),
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

      const target = activeTarget(state, engine.rules, holder);
      if (target !== null) {
        const gives = pendingGives(state, holder);
        if (gives.length < SWAP_TILES) {
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

      if (counterOf(state, usedKey(holder)) >= maxUses(state)) return [];
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
