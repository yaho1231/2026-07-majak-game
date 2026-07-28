/**
 * 짝수의 세계 (even_world, prism) — 동풍전 1·반장전 2회, 자기 턴에 버튼으로 발동한다.
 * **내 손패의 홀수 수패가 전부 한 칸 위 짝수로 다시 태어난다**: 1→2, 3→4, 5→6, 7→8, 9→8.
 * 자패(바람·삼원)는 불변, 짝수 수패도 불변. 결과는 결정적(무작위 아님).
 *
 * 단색 세계(suit_unify)의 짝수판 — 색이 아니라 홀짝을 정렬한다. 손이 순식간에 짝수로
 * 몰리면서 탕야오(단타)·또이또이가 단숨에 사정권에 든다. 9만 예외적으로 아래(8)로 내려온다
 * (10 위쪽이 없으니 짝수 세계로 끌어들이려면 8로 붙일 수밖에 없다).
 *
 * 리미트는 매치당 사용 횟수(usesKey, 동풍1·반장2)뿐, 페널티 없음 — 색을 통일해 주는 단색 세계와 같은 결에서
 * 홀짝을 통일해 준다. 리치 중에는 오름패가 고정돼 손패 변형과 충돌하므로 발동 불가.
 *
 * 구현: 단색 세계의 손패 일괄 변환 + conjured 부여를 그대로 재사용하되, 색은 그대로 두고
 * 랭크만 홀→짝으로 옮긴다. 무작위를 전혀 쓰지 않으므로(결정적) prngState도 건드리지 않는다.
 * 패는 제자리에서 종류만 바뀐다 — 장수는 늘지도 줄지도 않는다(손패 불변식 보존).
 */

import {
  augmentDataSet,
  defineAugment,
  doraKindFor,
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
  TileKind,
  TileKindChangedPayload,
} from "@majak/core";
import { counterOf, matchUses, viewKey } from "../util.js";
import { handIsWeak, handKindsOf } from "./botHelpers.js";

const ID = "even_world";
const ACTION = "even_world_flip";

/** 게임당 사용 횟수 카운터 (roundKey 없음 — 매치 전체에 누적). 동풍전 1·반장전 2회. */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;

/** 홀수 랭크를 한 칸 위 짝수로: 1→2, 3→4, 5→6, 7→8, 9→8 (9만 아래로). */
function toEvenRank(rank: number): number {
  return rank === 9 ? 8 : rank + 1;
}

/** 지금 활성 도라 종류 집합 (kindKey). 도라 표시패로부터 파생한다. */
function activeDoraKeys(state: GameState): Set<string> {
  const keys = new Set<string>();
  for (const t of state.round.doraIndicators) {
    keys.add(kindKey(doraKindFor(kindOf(state, t))));
  }
  return keys;
}

/**
 * 이 홀수 수패를 짝수로 바꿔야 하는가.
 * 도라(표시패 도라·적도라)는 값이 크므로 **바꾸지 않고 남긴다**(사용자 지시).
 */
function shouldFlip(
  state: GameState,
  tileId: number,
  dora: Set<string>,
): boolean {
  const kind = kindOf(state, tileId);
  if (!isNumberSuit(kind) || kind.rank % 2 !== 1) return false;
  if (dora.has(kindKey(kind))) return false; // 표시패 도라 — 유지
  if (state.tiles[tileId]?.attrs.red === true) return false; // 적도라(빨간 5) — 유지
  return true;
}

/** 자기 턴(turn.act)이고 리치 중이 아니면 발동 가능 */
function canFlip(state: GameState, holder: PlayerId): boolean {
  const r = state.round;
  if (r.phase !== "turn.act") return false;
  if (playerAtSeat(state, r.turnSeat).id !== holder) return false;
  if (r.byPlayer[holder]?.riichi != null) return false;
  return true;
}

/** 손패에 바꿀(도라 아닌) 홀수 수패가 하나라도 있는가 — 아무것도 안 바뀌면 발동을 막는다. */
function hasOddSuited(state: GameState, holder: PlayerId): boolean {
  const dora = activeDoraKeys(state);
  for (const tileId of handIdsOf(state, holder)) {
    if (shouldFlip(state, tileId, dora)) return true;
  }
  return false;
}

/** 손패의 (도라 아닌) 홀수 수패를 전부 한 칸 위 짝수로 바꾸는 이벤트들 (결정적). */
function evenEvents(state: GameState, holder: PlayerId) {
  const dora = activeDoraKeys(state);
  const changes: TileKindChangedPayload["changes"] = [];
  for (const tileId of handIdsOf(state, holder)) {
    if (!shouldFlip(state, tileId, dora)) continue;
    const kind = kindOf(state, tileId);
    // 색은 그대로, 랭크만 짝수로 — 새로 만들어낸 패라 conjured로 표시해 클라이언트가 구분해 그린다
    // (원래 4장 한도를 넘는 중복이 생길 수 있으므로 원본 패와 시각적으로 구별)
    const next: TileKind = { suit: kind.suit, rank: toEvenRank(kind.rank) };
    changes.push({ tileId, kind: next, attrs: { conjured: true } });
  }
  return [
    tileKindChanged(changes),
    // 사용 횟수 +1 (동풍전 1·반장전 2회)
    augmentDataSet(usesKey(holder), counterOf(state, usesKey(holder)) + 1),
    // 짝수의 세계가 발동됐음을 전원에게 알린다 (구체적 결과는 손패로 드러난다)
    augmentDataSet(viewKey("*", `${ID}:${holder}`), true),
  ];
}

/** 아직 사용 횟수가 남았는가 (동풍전 1·반장전 2회) */
function hasUsesLeft(state: GameState, holder: PlayerId): boolean {
  return counterOf(state, usesKey(holder)) < matchUses(state);
}

const evenWorldAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no even_world augment";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left this game";
    if (!canFlip(state, req.player)) return "not your turn (or riichi)";
    if (!hasOddSuited(state, req.player)) return "no odd suited tiles to change";
    return null;
  },
  toEvents: (req, { state }) => evenEvents(state, req.player),
};

export const evenWorld: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  name: "짝수의 세계",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 발동하면 손패의 홀수 수패가 전부 한 칸 위 짝수로 다시 태어난다(1→2, 3→4, 5→6, 7→8, 9→8). 자패와 도라는 그대로다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 자기 순에 발동하면 손패의 홀수 수패가 전부 짝수로 바뀐다. 1→2, 3→4, 5→6, 7→8이 되고 9만은 위가 없어 8로 내려온다. 무늬는 그대로이며 자패(바람·삼원)와 이미 짝수인 패는 건드리지 않는다. 도라(표시패 도라·적도라)는 값이 보존되도록 그대로 남는다. 리치 중에는 발동할 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(evenWorldAction);
    }

    // 자기 턴에, 아직 안 썼고, 바꿀 홀수 수패가 있을 때만 버튼을 노출한다 (합법성은 validate가 최종 판정)
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (!canFlip(state, holder)) return [];
      if (!hasOddSuited(state, holder)) return [];
      return [{ type: ACTION, payload: {} }];
    });
  },
  // 홀수 수패를 짝수로 몰아 짝·슌쯔·탕야오를 만든다 — 손이 약할 때(고립패가 많을 때)만
  // 발동해, 이미 잘 짜인 손을 헝클지 않는다.
  bot: {
    choose({ options, view, holder, tenpai }) {
      const opt = options.find((o) => o.type === ACTION);
      if (opt === undefined) return null;
      return handIsWeak(handKindsOf(view, holder), tenpai) ? opt : null;
    },
  },
});
