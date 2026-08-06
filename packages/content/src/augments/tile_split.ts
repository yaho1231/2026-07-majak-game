/**
 * 분열 (tile_split, prism) — "한 장이 두 장으로 갈라진다".
 *
 * 매 국 1회, 자기 턴에 손패의 **수패 1장을 두 숫자로 쪼갠다** — 두 숫자의 합이
 * 원래 숫자가 되고 무늬는 그대로다(예: 9통 → 4통 + 5통). 애물단지 끝패 한 장이 급소 두 장으로
 * 다시 태어난다.
 *
 * 구현: 허장성세(`bluff_pretense`)의 생성 기법을 그대로 쓴다. **엔진은 실물 없는 새 tileId를
 * 만들 수 없으므로**, 쪼갠 두 번째 조각은 손패에서 **가장 고립된 잡패 1장**을 재료로 삼아
 * 그 자리에 물질화한다(`tileKindChanged`, conjured). 결과적으로 손패 장수는 그대로다 —
 * 원안의 "직후 1장 버림"은 재료 소모로 대체되어 필요 없다(손패 불변식 보존).
 *
 * - 대상: 수패(만·통·삭) 중 **랭크 2 이상**(1은 두 양수로 쪼갤 수 없다).
 * - 분할: a + b = r, 1 ≤ a ≤ b. 중복 후보를 막으려 a ≤ r/2만 제시한다(9 → 1+8·2+7·3+6·4+5).
 * - 무작위 없음(결정적) — 무엇을 어떻게 쪼갤지는 전부 플레이어가 고른다(§0 무작위→선택 원칙).
 * - 리치 중에는 오름패가 고정돼 손패 변형과 충돌하므로 발동 불가(even_world·genesis와 동일).
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
import { flagOf, roundKey, roundViewKey } from "../util.js";
import { plan } from "./botPlan.js";
import { handIdsOfView, handKindsOf, isolatedIndex, shantenIfChanged } from "./botHelpers.js";

const ID = "tile_split";
const ACTION = "split_tile";

/** 국당 1회 — 국이 바뀌면 다시 쓸 수 있다 */
const usedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:used:${roundKey(state)}:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  !flagOf(state, usedKey(state, h));

/** 리치 중인가 (손패 변형 금지) */
const inRiichi = (state: GameState, h: PlayerId): boolean =>
  state.round.byPlayer[h]?.riichi != null;

/**
 * 재료로 쓸 잡패 하나 — 가장 고립된 패(주변에 이어지는 손패가 가장 적은 패).
 * 쪼갤 대상(targetId)은 제외한다. 결정적(동점은 손패 순서 앞쪽).
 * (허장성세 `pickSacrifice`와 같은 계열 — 그쪽은 목표패 종류도 제외하지만
 *  여기서는 재료가 어떤 종류든 상관없으므로 대상 한 장만 뺀다.)
 */
function pickMaterial(
  state: GameState,
  holder: PlayerId,
  targetId: TileId,
): TileId | undefined {
  const hand = handIdsOf(state, holder).filter((id) => id !== targetId);
  if (hand.length === 0) return undefined;
  const kinds = hand.map((id) => kindOf(state, id));
  const usefulness = (i: number): number => {
    const k = kinds[i] as TileKind;
    let n = 0;
    for (let j = 0; j < hand.length; j++) {
      if (j === i) continue;
      const o = kinds[j] as TileKind;
      if (o.suit !== k.suit) continue;
      if (o.rank === k.rank) n += 2; // 같은 패(또이쯔 씨앗)
      else if (isNumberSuit(k) && Math.abs(o.rank - k.rank) <= 2) n += 1; // 슌쯔 이웃
    }
    return n;
  };
  let best = 0;
  for (let i = 1; i < hand.length; i++) {
    if (usefulness(i) < usefulness(best)) best = i;
  }
  return hand[best];
}

/** 쪼갤 수 있는 손패인가 — 수패이면서 랭크 2 이상 */
function splittable(state: GameState, id: TileId): boolean {
  const k = kindOf(state, id);
  return isNumberSuit(k) && k.rank >= 2;
}

const splitAction: ActionDef<{ tileId: TileId; a: number }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no tile_split augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "already used this round";
    if (inRiichi(state, req.player)) return "cannot split during riichi";
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    if (!splittable(state, req.payload.tileId)) {
      return "only number tiles of rank 2+ can be split";
    }
    const r = kindOf(state, req.payload.tileId).rank;
    const a = req.payload.a;
    if (!Number.isInteger(a) || a < 1 || a * 2 > r) return "invalid split";
    if (pickMaterial(state, req.player, req.payload.tileId) === undefined) {
      return "no material tile to split into";
    }
    return null;
  },
  toEvents: (req, { state }) => {
    const target = kindOf(state, req.payload.tileId);
    const a = req.payload.a;
    const b = target.rank - a;
    const material = pickMaterial(state, req.player, req.payload.tileId) as TileId;
    return [
      // 대상은 작은 조각(a)으로, 재료 잡패는 나머지 조각(b)으로 — 둘 다 원래 무늬·conjured
      tileKindChanged([
        {
          tileId: req.payload.tileId,
          kind: { suit: target.suit, rank: a },
          attrs: { conjured: true },
        },
        {
          tileId: material,
          kind: { suit: target.suit, rank: b },
          attrs: { conjured: true },
        },
      ]),
      augmentDataSet(usedKey(state, req.player), true),
      // 전원 공개 — 무엇이 무엇으로 갈라졌는지 보인다
      augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), {
        from: kindKey(target),
        to: [
          kindKey({ suit: target.suit, rank: a }),
          kindKey({ suit: target.suit, rank: b }),
        ],
      }),
    ];
  },
};

export const tileSplit: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  name: "분열",
  description:
    "(매 국 1회) 자기 순에 손패의 수패 1장을 합이 같은 두 숫자로 쪼갠다(예: 9통 → 4통 + 5통). 두 번째 조각은 손패에서 가장 쓸모없는 잡패 한 장이 대신 바뀌어 채운다(손패 장수는 그대로).",
  detail:
    "(매 국 1회) 손패의 수패 한 장을 골라 두 숫자로 쪼갠다 — 두 숫자의 합이 원래 숫자가 되고 무늬는 그대로다(예: 9통 → 4통 + 5통). 쪼갤 수 있는 것은 랭크 2 이상의 수패이며, 두 번째 조각은 손패에서 가장 고립된 잡패 하나가 그 조각으로 바뀌어 채우므로 손패 장수는 변하지 않는다. 결과는 전원에게 공개되고 리치 중에는 쓸 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(splitAction);
    }

    // 쪼갤 수 있는 손패마다, 가능한 분할(a ≤ r/2)을 후보로 낸다
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (inRiichi(state, holder)) return [];
      const opts: { type: string; payload: unknown }[] = [];
      for (const id of handIdsOf(state, holder)) {
        if (!splittable(state, id)) continue;
        if (pickMaterial(state, holder, id) === undefined) continue;
        const r = kindOf(state, id).rank;
        for (let a = 1; a * 2 <= r; a++) {
          opts.push({ type: ACTION, payload: { tileId: id, a } });
        }
      }
      return opts;
    });
  },
  /**
   * 봇 — **쪼갠 뒤의 샹텐을 직접 세어 본다.**
   *
   * "손패 가치 추정이 필요해서 판단할 수 없다"고 두었던 자리인데, 실은 셀 수 있다.
   * 이 발동에는 무작위가 하나도 없기 때문이다 — 어느 패가 재료로 사라지는지까지
   * 규칙이 결정한다(`pickMaterial`). 그래서 후보마다 "그 뒤의 손"을 그대로 만들어
   * 샹텐을 세고, **실제로 나아지는 후보가 있을 때만** 발동한다.
   *
   * 봇 쪽 재료 계산은 `botHelpers.isolatedIndex`가 같은 규칙을 한 벌로 갖고 있다 —
   * 규칙이 두 벌이 되면 어긋난다.
   */
  bot: plan({
    intent: "advance",
    oneShot: true, // 국에 한 번뿐이다 — 어중간한 자리에서 태우지 않는다
    pick: (ctx) => {
      const { options, view, holder } = ctx;
      const ids = handIdsOfView(view, holder);
      const kinds = handKindsOf(view, holder);
      const base = shantenIfChanged(view, holder, [], []);
      let best: { type: string; payload: unknown } | null = null;
      let bestShanten = base;
      for (const o of options) {
        if (o.type !== ACTION) continue;
        const p = o.payload as { tileId?: number; a?: number };
        if (p.tileId === undefined || p.a === undefined) continue;
        const targetIdx = ids.indexOf(p.tileId);
        const target = kinds[targetIdx];
        if (targetIdx < 0 || target === undefined) continue;
        const materialIdx = isolatedIndex(kinds, targetIdx);
        if (materialIdx < 0) continue;
        const after = shantenIfChanged(
          view,
          holder,
          [targetIdx, materialIdx],
          [
            { suit: target.suit, rank: p.a },
            { suit: target.suit, rank: target.rank - p.a },
          ],
        );
        if (after < bestShanten) {
          bestShanten = after;
          best = o;
        }
      }
      return best;
    },
  }),
});
