/**
 * 연금술사 (alchemist, prism).
 * 게임 전체 5회, 자기 턴에 손패의 수패 1장의 숫자를 ±1 바꾼다(무늬 유지, 1↔9
 * 순환 없음, 리치 중에도 가능). 변환은 매번 전원 공개. 5회를 언제 쓰느냐가 자원 관리.
 *
 * 구현: TileKindChanged(conjured) + 게임 단위 카운터. holderTurnOptions로 손패
 * 수패×유효 방향(±1) 후보 열거.
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
  TileId,
} from "@majak/core";
import { counterOf, roundKey } from "../util.js";
import { handKindsOf, tileSwapImproves } from "./botHelpers.js";

const ID = "alchemist";
const ACTION = "alchemy";
const MAX_USES = 5;
const usedKey = (h: PlayerId): string => `${ID}:used:${h}`;
/** 마지막으로 사용한 '턴'의 서명 (한 턴에 한 번만 쓰게 막는다) */
const turnUsedKey = (h: PlayerId): string => `${ID}:turn:${h}`;

/**
 * 이 국에서 보유자의 현재 턴을 식별하는 서명.
 * 매 턴은 정확히 버림 한 번으로 끝나므로 버림 수(discardedKinds.length)가
 * 턴마다 1씩 늘어난다 → (국 + 버림 수)로 턴을 유일하게 식별한다.
 * (연금술은 버림을 소비하지 않으므로 같은 턴 재사용 시 이 서명이 그대로다.)
 */
function currentTurnSig(state: GameState, h: PlayerId): string {
  const discards = state.round.byPlayer[h]?.discardedKinds.length ?? 0;
  return `${roundKey(state)}:${discards}`;
}

/** 보유자가 이번 턴에 이미 연금술을 썼는가 */
function usedThisTurn(state: GameState, h: PlayerId): boolean {
  return state.augmentData[turnUsedKey(h)] === currentTurnSig(state, h);
}

const alchemyAction: ActionDef<{ tileId: TileId; delta: 1 | -1 }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no alchemist augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    // 48차 무페널티: 리치 중 사용 금지 해제 — 리치 여부는 더 이상 보지 않는다.
    // (검사를 return null로 바꾸면 아래 한도·손패 검증이 통째로 건너뛰어지므로 삭제한다.)
    if (counterOf(state, usedKey(req.player)) >= MAX_USES) return "no uses left";
    if (usedThisTurn(state, req.player)) return "already used this turn";
    if (!handIdsOf(state, req.player).includes(req.payload.tileId)) {
      return "tile not in hand";
    }
    const k = kindOf(state, req.payload.tileId);
    if (!isNumberSuit(k)) return "not a number tile";
    const nr = k.rank + req.payload.delta;
    if (nr < 1 || nr > 9) return "out of range";
    return null;
  },
  toEvents: (req, { state }) => {
    const k = kindOf(state, req.payload.tileId);
    return [
      tileKindChanged([
        {
          tileId: req.payload.tileId,
          kind: { suit: k.suit, rank: k.rank + req.payload.delta },
          attrs: { conjured: true },
        },
      ]),
      augmentDataSet(usedKey(req.player), counterOf(state, usedKey(req.player)) + 1),
      // 이번 턴에 썼음을 기록 → 같은 턴 재사용 차단 (버림으로 턴이 넘어가면 자동 해제)
      augmentDataSet(turnUsedKey(req.player), currentTurnSig(state, req.player)),
    ];
  },
};

export const alchemist: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  name: "연금술사",
  description:
    "(게임 내 5회) 자기 순에 한 번, 손패의 수패 1장의 숫자를 ±1 바꾼다(무늬 유지, 1↔9 순환 없음). 리치 중에도 쓸 수 있고, 바뀐 패는 매번 전원에게 공개된다.",
  detail:
    "(게임 내 5회) 자기 순에 액티브 버튼으로 발동해 손패의 수패 1장을 골라 숫자를 ±1 이동한다 — 무늬는 그대로이고 1↔9 순환은 없으며 자패는 대상이 아니다. 한 순에 한 번까지만 쓸 수 있고 리치 중에도 발동할 수 있다. 바뀐 패는 매번 전원에게 공개된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(alchemyAction);
    }

    ctx.holderTurnOptions((state) => {
      if (counterOf(state, usedKey(holder)) >= MAX_USES) return [];
      if (usedThisTurn(state, holder)) return []; // 한 턴에 한 번만

      const opts: { type: string; payload: { tileId: TileId; delta: 1 | -1 } }[] = [];
      for (const id of handIdsOf(state, holder)) {
        const k = kindOf(state, id);
        if (!isNumberSuit(k)) continue;
        if (k.rank > 1) opts.push({ type: ACTION, payload: { tileId: id, delta: -1 } });
        if (k.rank < 9) opts.push({ type: ACTION, payload: { tileId: id, delta: 1 } });
      }
      return opts;
    });
  },
  // 수패 1장을 ±1 옮겨 고립패를 짝·슌쯔에 붙인다(게임당 5회). 실제로 손이 나아지는
  // 변경(고립패 → 유용패)이 있을 때만 발동하고, 없으면 아낀다.
  bot: {
    choose({ options, view, holder }) {
      const kinds = handKindsOf(view, holder);
      for (const o of options) {
        if (o.type !== ACTION) continue;
        const p = o.payload as { tileId?: number; delta?: number };
        if (p.tileId === undefined || p.delta === undefined) continue;
        const orig = view.tiles[p.tileId]?.kind;
        if (orig === undefined) continue;
        const next = { ...orig, rank: orig.rank + p.delta };
        if (tileSwapImproves(kinds, orig, next)) return o;
      }
      return null;
    },
  },
});
