/**
 * suit_unify (단색 세계) — 동풍전 1·반장전 2회, 어느 국이든 첫 패를 받은 직후 액티브 버튼으로 발동한다.
 * **만·통·삭 중 원하는 색을 직접 골라** 손패의 수패를 전부 그 색으로 바꾼다.
 * **청일색까지 그대로 인정된다.**
 *
 * 버튼은 각 국에서 자기 첫 타패 전(자기 턴)에 뜨며, 동풍전 1·반장전 2회만 쓸 수 있다(usedKey). 어느
 * 국의 첫 순에 쓸지 스스로 고르며, 한 국의 첫 순을 넘겨도 다음 국의 첫 순에 다시 기회가 온다.
 *
 * 2026-07-22 (48차): **청일색 봉인 삭제 + 색 무작위 → 플레이어 선택.** "동풍전 1·반장전 2회"라는 횟수 제한이 이미 리미트이므로
 * 능력에 페널티를 겹쳐 붙이지 않는다 — 수패를 한 색으로 만들어 주면서 청일색을 막는 것은
 * 스스로 준 것을 도로 빼앗는 설계였다 (10_AUGMENT_SYSTEM §0 "리미트는 횟수로 준다").
 */

import {
  augmentDataSet,
  defineAugment,
  handIdsOf,
  isNumberSuit,
  kindOf,
  playerAtSeat,
  tileKindChanged,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  Suit,
  TileKindChangedPayload,
} from "@majak/core";
import { counterOf, matchUses, viewKey } from "../util.js";
import { handKindsOf } from "./botHelpers.js";

const ID = "suit_unify";
const ACTION = "mono_world";

/** 통일 대상 후보 수패 종류 */
const NUMBER_SUITS: readonly Suit[] = ["man", "pin", "sou"];

/** 매치당 사용 횟수 카운터 (게임 단위). 동풍전 1·반장전 2회. */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);

/** 지금이 '첫 패를 받은 직후'인가 — 어느 국이든 자기 턴·아직 이 국에서 안 버렸을 때 */
function atFirstHand(state: GameState, holder: PlayerId): boolean {
  const r = state.round;
  if (r.phase !== "turn.act") return false;
  if (playerAtSeat(state, r.turnSeat).id !== holder) return false;
  return (r.byPlayer[holder]?.discardedKinds.length ?? 0) === 0;
}

/** 손패 수패를 지정한 한 종류로 통일하는 이벤트들 (난수를 쓰지 않는다 — 색은 플레이어가 고른다) */
function unifyEvents(state: GameState, holder: PlayerId, suit: Suit) {
  const changes: TileKindChangedPayload["changes"] = [];
  for (const tileId of handIdsOf(state, holder)) {
    const kind = kindOf(state, tileId);
    if (isNumberSuit(kind)) {
      // 색을 바꿔 새로 만들어낸 패 — conjured로 표시해 클라이언트가 구분해 그린다
      // (원래 4장 한도를 넘는 중복이 생길 수 있으므로 원본 패와 시각적으로 구별)
      changes.push({ tileId, kind: { suit, rank: kind.rank }, attrs: { conjured: true } });
    }
  }
  return [
    tileKindChanged(changes),
    augmentDataSet(usesKey(holder), counterOf(state, usesKey(holder)) + 1),
    // 어떤 색으로 통일됐는지 전원 공개
    augmentDataSet(viewKey("*", `${ID}:${holder}`), suit),
  ];
}

const monoWorldAction: ActionDef<{ suit: Suit }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no suit_unify augment";
    }
    if (!hasUsesLeft(state, req.player)) return "already used";
    if (!atFirstHand(state, req.player)) return "only on the first hand";
    if (!NUMBER_SUITS.includes(req.payload.suit)) return "invalid suit";
    return null;
  },
  toEvents: (req, { state }) => unifyEvents(state, req.player, req.payload.suit),
};

export const suitUnify: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  name: "단색 세계",
  description:
    "(동풍전 1회 · 반장전 2회) 국의 첫 패를 받은 뒤 자기 첫 타패 전에 발동하며, 만·통·삭 중 원하는 색을 골라 손패의 수패를 전부 그 색으로 바꾼다. 청일색도 그대로 인정된다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 어느 국이든 첫 패를 받은 뒤 자기 첫 타패 전에 액티브 버튼이 뜬다. 만·통·삭 중 색을 직접 골라 손패의 수패를 전부 그 색으로 바꾸며, 통일된 색으로 청일색까지 그대로 인정된다. 어느 색으로 물들였는지는 전원에게 공개된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(monoWorldAction);
    }

    // 규칙 봉인 없음 — 통일해 준 색으로 청일색까지 그대로 노릴 수 있다 (48차).

    // 첫 국 첫 패를 받은 자기 턴에만 발동 버튼을 노출한다 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (!atFirstHand(state, holder)) return [];
      // 만·통·삭 세 후보를 제시 — 어떤 색으로 통일할지 플레이어가 고른다
      return NUMBER_SUITS.map((suit) => ({ type: ACTION, payload: { suit } }));
    });
  },
  // 수패를 전부 한 색으로 몰아 청일색을 노린다. 텐파이면 손을 깨므로 발동하지 않고,
  // 수패가 충분할 때(≥5장) 가장 많은 색으로 통일해 rank 충돌을 최소화한다.
  bot: {
    choose({ options, view, holder, tenpai }) {
      if (tenpai) return null;
      const counts: Record<string, number> = { man: 0, pin: 0, sou: 0 };
      let total = 0;
      for (const k of handKindsOf(view, holder)) {
        if (k.suit in counts) {
          counts[k.suit] = (counts[k.suit] ?? 0) + 1;
          total++;
        }
      }
      if (total < 5) return null; // 수패가 적으면 청일색 전환 이득이 작다
      let bestSuit = "man";
      for (const s of ["man", "pin", "sou"]) {
        if ((counts[s] ?? 0) > (counts[bestSuit] ?? 0)) bestSuit = s;
      }
      return (
        options.find(
          (o) => o.type === ACTION && (o.payload as { suit?: string }).suit === bestSuit,
        ) ?? null
      );
    },
  },
});
