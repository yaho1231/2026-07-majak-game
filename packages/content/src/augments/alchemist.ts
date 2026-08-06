/**
 * 연금술사 (alchemist, prism).
 * 게임 전체 5회, 자기 턴에 손패의 수패 1장의 숫자를 ±1 바꾼다(무늬 유지, 1↔9
 * 순환 없음, 리치 중에도 가능). 변환은 매번 전원 공개. 5회를 언제 쓰느냐가 자원 관리.
 *
 * 구현: TileKindChanged(conjured) + 게임 단위 카운터. holderTurnOptions로 손패
 * 수패×유효 방향(±1) 후보 열거.
 */

import {
  TILE_DRAWN,
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
  TileAttrs,
  TileId,
} from "@majak/core";
import { counterOf, roundKey, viewKey } from "../util.js";
import { handKindsOf, tileSwapImproves } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "alchemist";
const ACTION = "alchemy";
const MAX_USES = 5;
const usedKey = (h: PlayerId): string => `${ID}:used:${h}`;
/** 마지막으로 사용한 '턴'의 서명 (한 턴에 한 번만 쓰게 막는다) */
const turnUsedKey = (h: PlayerId): string => `${ID}:turn:${h}`;
/**
 * 남은 횟수를 보유자 화면에 노출하는 채널 — "몇 번 남았는지 안 보인다"는 보고
 * (2026-08-01)에 대한 대응. 게임 전체 5회라 국을 넘어 유지돼야 하므로 국 스코프가
 * 아닌 고정 viewKey를 쓴다. 값은 **남은 횟수**(0이면 소진).
 */
const leftViewKey = (h: PlayerId): string => viewKey(h, `${ID}:left`);
const usesLeft = (state: GameState, h: PlayerId): number =>
  Math.max(0, MAX_USES - counterOf(state, usedKey(h)));

/**
 * 이 국에서 보유자의 현재 턴을 식별하는 서명.
 * 매 턴은 정확히 버림 한 번으로 끝나므로 버림 수(discardCount)가
 * 턴마다 1씩 늘어난다 → (국 + 버림 수)로 턴을 유일하게 식별한다.
 * (연금술은 버림을 소비하지 않으므로 같은 턴 재사용 시 이 서명이 그대로다.)
 */
function currentTurnSig(state: GameState, h: PlayerId): string {
  // 누명이 discardedKinds를 남의 이력으로 돌리므로 실제 버림 횟수로 센다(docs/25 P5)
  const discards = state.round.byPlayer[h]?.discardCount ?? 0;
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
          // 적도라 표식은 **숫자와 함께 옮기지 않는다** — 적5를 4나 6으로 옮기면
          // 존재할 수 없는 '적4·적6'이 생겨 +1판이 그대로 따라왔다(2026-07-29 감사).
          // (undefined는 TileKindChanged 규약상 해당 키를 제거한다)
          // undefined는 TileKindChanged 규약상 "그 키를 제거"를 뜻한다
          // (exactOptionalPropertyTypes 때문에 타입 단언이 필요하다)
          attrs: { conjured: true, red: undefined, redFor: undefined } as unknown as TileAttrs,
        },
      ]),
      augmentDataSet(usedKey(req.player), counterOf(state, usedKey(req.player)) + 1),
      // 이번 턴에 썼음을 기록 → 같은 턴 재사용 차단 (버림으로 턴이 넘어가면 자동 해제)
      augmentDataSet(turnUsedKey(req.player), currentTurnSig(state, req.player)),
      // 남은 횟수 갱신 (위 usedKey 증가를 반영해 -1)
      augmentDataSet(leftViewKey(req.player), usesLeft(state, req.player) - 1),
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
    "(게임 내 5회 — 남은 횟수는 액티브 버튼 옆에 상시 표시된다) 자기 순에 액티브 버튼으로 발동해 손패의 수패 1장을 골라 숫자를 ±1 이동한다 — 무늬는 그대로이고 1↔9 순환은 없으며 자패는 대상이 아니다. 한 순에 한 번까지만 쓸 수 있고 리치 중에도 발동할 수 있다. 바뀐 패는 매번 전원에게 공개된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(alchemyAction);
    }

    // 남은 횟수 채널 동기화 — 값이 어긋날 때만 발행한다.
    // ROUND_STARTED로는 부족하다: 게임 시작 드래프트는 1국 배패 **뒤에** 설치되므로
    // 첫 국 내내 채널이 비어 "몇 번 남았는지 안 보인다"가 그대로 남는다(2026-08-01 보고).
    // 쯔모는 매 순 일어나므로 획득 직후 첫 쯔모에 곧바로 값이 선다(그 뒤로는 no-op).
    ctx.reaction(TILE_DRAWN, (_event, rc) => {
      const left = usesLeft(rc.state, holder);
      if (rc.state.augmentData[leftViewKey(holder)] === left) return;
      rc.emit(augmentDataSet(leftViewKey(holder), left));
    });

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
  bot: plan({
    intent: "advance",
    // 게임 내 5회뿐이다 — 시간이 남아 있고 손이 닿는 거리일 때만 태운다.
    // 유국 직전 3샹텐에 한 장 고쳐 봐야 회수할 순목이 없다.
    pick: ({ options, view, holder }) => {
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
  }),
});
