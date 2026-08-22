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
  TileAttrs,
  TileId,
} from "@majak/core";
import { counterOf, publishUsesLeft, roundKey, roundViewKey } from "../util.js";
import { handKindsOf, tileSwapImproves } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "alchemist";
const ACTION = "alchemy";
const MAX_USES = 5;
const usedKey = (h: PlayerId): string => `${ID}:used:${h}`;
/** 마지막으로 사용한 '턴'의 서명 (한 턴에 한 번만 쓰게 막는다) */
const turnUsedKey = (h: PlayerId): string => `${ID}:turn:${h}`;
/**
 * 전원 공개: 이번 국에 무엇을 무엇으로 바꿨는가 ("man3→man4").
 *
 * 설명이 "바뀐 패는 매번 전원에게 공개된다"라고 약속하는데 채널은 **남은 횟수(본인
 * 전용)뿐이었다** — 상대는 변환 사실조차 알 수 없었다. 염색(tile_dyeing)과 같은
 * 국 스코프 공개 채널로 맞춘다.
 */
const revealViewKey = (h: PlayerId): string => roundViewKey("*", `${ID}:${h}`);
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
      // 전원 공개 — 무엇이 무엇이 됐는지. 문자열이라 클라이언트 폴백이 그대로 읽는다.
      augmentDataSet(
        revealViewKey(req.player),
        `${kindKey(k)}→${kindKey({ suit: k.suit, rank: k.rank + req.payload.delta })}`,
      ),
    ];
  },
};

export const alchemist: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "hand",
  complexity: 1,
  name: "연금술사",
  description:
    "(게임 내 5회) 자기 순에 한 번, 손패의 수패 1장의 숫자를 ±1 바꾼다(무늬 유지, 1↔9 순환 없음).",
  detail:
    "(게임 내 5회) 자패는 대상이 아니다. 한 순에 한 번까지만 쓸 수 있고 리치 중에도 발동하며, 무엇이 무엇으로 바뀌었는지는 매번 전원에게 공개된다.\n\n⚠ **적도라(빨간 5)를 옮기면 그 빨간색은 사라진다** — 적도라는 '그 무늬의 5'라는 뜻이라 숫자가 바뀌면 성립하지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(alchemyAction);
    }

    /*
     * 남은 횟수는 **횟수형 증강 공용 채널**(`uses:alchemist`)로 낸다.
     *
     * 예전에는 이 증강만 쓰는 `alchemist:left`에 숫자를 직접 실었고, 동기화도 쯔모
     * (`TILE_DRAWN`) 한 곳에만 걸려 있었다. 그래서 ① 남은 횟수를 읽는 자리(액티브 메뉴의
     * "남은 횟수 없음" 안내·pill 게이지)가 전부 공용 채널만 보므로 연금술사만 빠졌고,
     * ② 발동 직후에는 쯔모가 올 때까지 숫자가 그대로 서 있었다(2026-08-17 사용자 보고:
     * "연금술사 남은 횟수 안 나옴"). `publishUsesLeft`는 모든 이벤트에서 값이 달라질
     * 때만 발행하므로 두 문제가 함께 사라진다.
     */
    publishUsesLeft(ctx, (state) => ({ left: usesLeft(state, holder), total: MAX_USES }));

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
