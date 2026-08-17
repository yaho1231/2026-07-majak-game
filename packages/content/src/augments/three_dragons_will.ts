/**
 * 삼원의 의지 (three_dragons_will, prism) — "한 장으로 대삼원?!"
 *
 * 백·발·중 중 **두 종류를 커쯔로 만들고 나머지 한 종류를 1장이라도 쥐고 있으면**, 자기 턴에
 * 발동해 그 한 장을 **커쯔로 완성**한다 — 삼원패 9장을 모아야 하는 대삼원이 7장에서 선다.
 *
 * 구현: 손패 장수 불변식을 지키는 유일한 길로 **재료 소모형 생성**을 쓴다(허장성세 `bluff_pretense`·
 * 분열 `tile_split`과 같은 계열). 엔진은 실물 없는 새 tileId를 만들 수 없으므로, 손패에서 가장
 * 고립된 잡패 **2장**을 부족한 삼원패로 변환(`tileKindChanged`, conjured)해 커쯔를 채운다.
 *
 * docs/16 §2의 "conjured 2장 보충" 노트를 그대로 따른 것이며, 결과적으로 **코어 변경이 없다** —
 * 세 삼원 커쯔가 실제로 손에 서므로 대삼원·소삼원·부수가 표준 채점에서 자연히 따라온다
 * (분해 단계를 건드렸다면 부수·역 판정 전반을 함께 손봐야 했다).
 *
 * ⚠ 손에 잡패가 2장 없으면(전부 몸통에 묶여 있으면) 발동할 수 없다. 리치 중에도 발동 불가.
 */

import {
  augmentDataSet,
  defineAugment,
  handIdsOf,
  isNumberSuit,
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
  TileId,
  TileKind,
} from "@majak/core";
import { counterOf, matchUses, publishUsesLeft, roundViewKey } from "../util.js";
import { handIsPoor } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "three_dragons_will";
const ACTION = "dragons_will";
/** 삼원패 랭크: 1=백, 2=발, 3=중 */
const DRAGON_RANKS = [1, 2, 3] as const;

/** 매치당 사용 횟수 (동풍1/반장2) */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);

const inRiichi = (state: GameState, h: PlayerId): boolean =>
  state.round.byPlayer[h]?.riichi != null;

const isDragon = (k: TileKind): boolean => k.suit === "dragon";

/**
 * 삼원패 랭크별 장수 — **손패와 후로를 함께** 센다.
 *
 * 예전에는 손패만 봐서, 백백백을 펑하고 발발발을 쥔 채 中 한 장인 손이
 * "완성 두 종류"로 잡히지 않아 발동할 수 없었다 — 설명("두 종류를 커쯔로
 * 만들고")과 어긋난다(docs/25 역/점수 #14). 대삼원은 후로해도 성립하는 역이라
 * 후로한 커쯔를 세지 않을 이유가 없다.
 */
function dragonCounts(state: GameState, holder: PlayerId): Map<number, number> {
  const counts = new Map<number, number>(DRAGON_RANKS.map((r) => [r, 0]));
  const bump = (id: TileId): void => {
    const k = kindOf(state, id);
    if (isDragon(k)) counts.set(k.rank, (counts.get(k.rank) ?? 0) + 1);
  };
  for (const id of handIdsOf(state, holder)) bump(id);
  for (const meld of state.round.byPlayer[holder]?.melds ?? []) {
    for (const id of meld.tileIds) bump(id);
  }
  return counts;
}

/**
 * 발동 조건을 만족하면 채워야 할 삼원패 종류와 필요 장수를 돌려준다.
 * - 삼원패 두 종류가 각각 3장 이상(커쯔)
 * - 나머지 한 종류가 1~2장 (0장이면 '의지'가 없다)
 * 반환: { kind, need } — need는 3장을 채우기 위해 생성할 장수(1 또는 2).
 */
function pendingDragon(
  state: GameState,
  holder: PlayerId,
): { kind: TileKind; need: number } | null {
  const counts = dragonCounts(state, holder);
  const complete = DRAGON_RANKS.filter((r) => (counts.get(r) ?? 0) >= 3);
  if (complete.length !== 2) return null;
  const rest = DRAGON_RANKS.find((r) => !complete.includes(r));
  if (rest === undefined) return null;
  const have = counts.get(rest) ?? 0;
  if (have <= 0 || have >= 3) return null;
  return { kind: { suit: "dragon", rank: rest }, need: 3 - have };
}

/**
 * 재료로 쓸 잡패 n장 — 삼원패가 아니면서 가장 고립된 패부터.
 * 결정적(유용도 오름차순, 동점은 손패 순서). 부족하면 null.
 */
function pickMaterials(
  state: GameState,
  holder: PlayerId,
  n: number,
): TileId[] | null {
  const hand = handIdsOf(state, holder).filter((id) => !isDragon(kindOf(state, id)));
  if (hand.length < n) return null;
  const kinds = hand.map((id) => kindOf(state, id));
  const usefulness = (i: number): number => {
    const k = kinds[i] as TileKind;
    let u = 0;
    for (let j = 0; j < hand.length; j++) {
      if (j === i) continue;
      const o = kinds[j] as TileKind;
      if (o.suit !== k.suit) continue;
      if (o.rank === k.rank) u += 2;
      else if (isNumberSuit(k) && Math.abs(o.rank - k.rank) <= 2) u += 1;
    }
    return u;
  };
  const order = hand
    .map((id, i) => ({ id, u: usefulness(i), i }))
    .sort((a, b) => a.u - b.u || a.i - b.i);
  return order.slice(0, n).map((e) => e.id);
}

const willAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no three_dragons_will augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left this game";
    if (inRiichi(state, req.player)) return "cannot invoke during riichi";
    const pending = pendingDragon(state, req.player);
    if (pending === null) return "need two dragon triplets and one of the third";
    if (pickMaterials(state, req.player, pending.need) === null) {
      return "not enough spare tiles to conjure";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const pending = pendingDragon(state, req.player) as { kind: TileKind; need: number };
    const materials = pickMaterials(state, req.player, pending.need) as TileId[];
    return [
      tileKindChanged(
        materials.map((tileId) => ({
          tileId,
          kind: pending.kind,
          attrs: { conjured: true },
        })),
      ),
      augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
      // 전원 공개 — 대삼원이 섰다는 것은 테이블 전체의 사건이다
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), kindKey(pending.kind)),
    ];
  },
};

export const threeDragonsWill: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 3,
  name: "삼원의 의지",
  description:
    "(동풍전 1회 · 반장전 2회) 백·발·중 중 두 종류를 커쯔로 세우고 나머지 한 종류를 한 장이라도 쥐고 있으면, 자기 순에 발동해 그 한 장을 커쯔로 완성한다 — 삼원패 9장이 필요한 대삼원이 7장에서 선다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 백·발·중 중 두 종류를 커쯔로 세우고 나머지 한 종류를 한 장이라도 쥔 상태에서 발동하면, 부족한 두 장이 손패의 가장 쓸모없는 잡패에서 물질화해 커쯔를 채운다. 손패 장수는 변하지 않고 세 커쯔가 실제로 손에 서므로 대삼원이 정식으로 성립한다. 재료로 쓸 잡패가 모자라거나 리치 중이면 발동할 수 없다.\n\n⚠ 재료는 손패에서 자동으로 골라 덮어쓴다 — 이웃 패가 적은 순으로 뽑으므로 이미 완성된 몸통의 패가 나갈 수도 있다. 미리 보거나 고를 수는 없다. 세 번째 삼원패를 2장 쥐고 있으면 필요한 재료도 1장뿐이다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, matchUses(state) - counterOf(state, usesKey(holder))),
      total: matchUses(state),
    }));

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(willAction);
    }

    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (inRiichi(state, holder)) return [];
      const pending = pendingDragon(state, holder);
      if (pending === null) return [];
      if (pickMaterials(state, holder, pending.need) === null) return [];
      return [{ type: ACTION, payload: {} }];
    });
  },
  // 봇: 조건이 서면 곧바로 발동한다 — 역만이 걸리는 순수 이득이고 자해 위험이 없다.
  bot: plan({
    intent: "score",
    // 조건이 서면 그 자리에서 커쯔가 완성된다 — 미룰 이유가 없다.
    fleeting: true,
    pick: (ctx) => {
      // 재료로 뽑히는 것은 "가장 고립된 패"인데, 그 유용도 계산은 같은 무늬 이웃만
      // 세므로 **이미 완성된 몸통의 패도 최저점이 될 수 있다**. 조건이 서는 즉시
      // 무조건 발동하면 789m·789p 같은 완성 몸통 둘이 통째로 날아간다
      // (docs/25 역/점수 #14). 손이 아직 멀 때만 지른다 — 대삼원을 노릴 값어치가
      // 있는 국면이면 어차피 손이 좋지 않다.
      if (!handIsPoor(ctx)) return null;
      return ctx.options.find((o) => o.type === ACTION) ?? null;
    },
  }),
});
