/**
 * 등 떠밀기 (push_riichi, prism) — "숨을 수 없다."
 *
 * 동풍전 1·반장전 2회, 자기 턴에 상대 한 명에게 **낙인**을 찍는다(전원 공개). 이후 그가
 * 리치 가능한 상태(멘젠 텐파이·공탁 여유·리치 미봉쇄)에서 패를 버리는 순간, 그 버림이
 * **자동으로 강제 리치**가 된다. 다마텐으로 숨으려는 바로 그 순간 시스템이 리치봉을 던지게 만든다.
 *
 * 낙인은 발동 전까지 **국을 넘어 유지**되며(그의 손 만들기 자체가 공개 공포가 된다), 1회
 * 터지면 소멸한다. 일부러 후로해 손을 열면 멘젠이 깨져 조건이 안 서므로 연기된다 —
 * 텐파이를 늦추거나 싸게 여는 것이 회피 루트다.
 *
 * 구현: 순수 콘텐츠. 지목은 게임 단위 augmentData(국 넘어 유지). `TILE_DISCARDED` **Interceptor**가
 * 낙인 대상의 버림을 가로채, 그 버림이 리치 성립 조건(멘젠 + 버린 뒤 텐파이 + 공탁 여유 +
 * 벽 잔여 + riichi.blocked 아님)을 만족하고 스스로 리치를 걸지 않았다면 `riichi:true`+riichiCost를
 * 실어 강제 리치로 만든다. 별도 `TILE_DISCARDED` **Reaction**이 낙인 대상의 리치 성립을 감지해
 * 낙인을 소멸시킨다(자발적 리치도 낙인을 소진한다 — 리치 가능 상태에 도달했으므로).
 * §2 지목형 연출 규칙 적용.
 */

import {
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  isTenpai,
  kindOf,
  meldCountOf,
  playerAtSeat,
  playerOf,
  scoringOptionsOf,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  TileDiscardedPayload,
  TileKind,
} from "@majak/core";
import { counterOf, matchUses, roundViewKey, stringOf, viewKey } from "../util.js";

const ID = "push_riichi";
const ACTION = "push_brand";

/** 매치당 사용 횟수 (동풍1/반장2) */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);
/** 현재 낙인 대상 (게임 단위 — 국을 넘어 유지, 발동 시 소멸) */
const brandKey = (h: PlayerId): string => `${ID}:brand:${h}`;

/** 대상이 멘젠인가 (안깡·묵계는 손을 열지 않는다) */
function isMenzen(state: GameState, id: PlayerId): boolean {
  return (state.round.byPlayer[id]?.melds ?? []).every(
    (m) => m.kind === "kan_closed" || m.silent === true,
  );
}

/** wall 잔여 장수 */
const wallLen = (state: GameState): number =>
  state.zones["wall"]?.tileIds.length ?? 0;

/**
 * 대상이 이 패(discardTileId)를 버리면 강제 리치가 성립하는가 —
 * 멘젠 + 버린 뒤 텐파이 + 공탁 여유 + 벽 잔여 + riichi 미봉쇄.
 */
function riichiEligibleOnDiscard(
  state: GameState,
  rules: import("@majak/core").RuleRegistry,
  target: PlayerId,
  discardTileId: number,
): boolean {
  if (state.round.byPlayer[target]?.riichi != null) return false;
  if (!isMenzen(state, target)) return false;
  if (rules.resolve<boolean>("riichi.blocked", { playerId: target, state })) return false;
  const cost = rules.resolve<number>("riichi.cost", { playerId: target, state });
  if (playerOf(state, target).score < cost) return false;
  if (wallLen(state) < rules.resolve<number>("riichi.minWallTiles")) return false;
  // 버린 뒤 손패가 텐파이인가
  const after: TileKind[] = handIdsOf(state, target)
    .filter((t) => t !== discardTileId)
    .map((t) => kindOf(state, t));
  return isTenpai(after, meldCountOf(state, target), undefined, scoringOptionsOf(state, rules, target));
}

const brandAction: ActionDef<{ target: PlayerId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no push_riichi augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (!hasUsesLeft(state, req.player)) return "no uses left this game";
    if (stringOf(state, brandKey(req.player)) !== null) return "a brand is already active";
    if (req.payload.target === req.player) return "cannot brand yourself";
    if (!state.players.some((p) => p.id === req.payload.target)) return "unknown target";
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(brandKey(req.player), req.payload.target),
    augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
    // 전원 공개 지목 관계
    augmentDataSet(viewKey("*", `${ID}:${req.player}`), req.payload.target),
  ],
};

export const pushRiichi: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  name: "등 떠밀기",
  description:
    "(동풍전 1회 · 반장전 2회) 자기 순에 상대 한 명에게 낙인을 찍는다(전원 공개). 그가 리치 가능한 상태에서 패를 버리는 순간 그 버림이 자동으로 강제 리치가 된다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 자기 순에 상대 한 명에게 낙인을 찍는다. 낙인자가 멘젠 텐파이 상태로 패를 버리려 하면 그 버림이 자동으로 리치가 되어 리치봉이 강제로 던져진다 — 다마텐으로 숨을 수 없다. 낙인은 발동 전까지 국을 넘어 유지되며 한 번 터지면 소멸한다. 후로해 멘젠이 깨진 손에는 조건이 서지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(brandAction);
    }

    // 낙인 대상의 버림을 가로채, 리치 성립 조건이면 강제 리치로 만든다.
    ctx.interceptor(TILE_DISCARDED, (event, ic) => {
      const p = event.payload as TileDiscardedPayload;
      if (p.riichi) return event; // 이미 리치면 그대로
      const target = stringOf(ic.state, brandKey(holder));
      if (target === null || p.player !== target) return event;
      if (!riichiEligibleOnDiscard(ic.state, ic.rules, target, p.tileId)) return event;
      const cost = ic.rules.resolve<number>("riichi.cost", { playerId: target, state: ic.state });
      return { type: event.type, payload: { ...p, riichi: true, riichiCost: cost } };
    });

    // 낙인 대상이 리치를 성립시키면(강제든 자발이든) 낙인을 소멸시킨다.
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (!p.riichi) return;
      const target = stringOf(rc.state, brandKey(holder));
      if (target === null || p.player !== target) return;
      rc.emit(augmentDataSet(brandKey(holder), ""));
      rc.emit(augmentDataSet(roundViewKey("*", `${ID}:fired:${holder}`), target));
    });

    // 사용 횟수가 남았고 활성 낙인이 없으면 보유자 턴에 각 상대를 지목 후보로 낸다
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (stringOf(state, brandKey(holder)) !== null) return [];
      return state.players
        .filter((p) => p.id !== holder)
        .map((p) => ({ type: ACTION, payload: { target: p.id } }));
    });
  },
  // 봇: 점수가 가장 높은 상대(선두)에게 낙인을 찍는다 — 다마텐 봉쇄로 압박(자해 없음).
  // 누구를 찍을지의 최적은 미묘하나, 선두 견제는 언제나 방어적으로 유효하다.
  bot: {
    choose({ options, view, holder }) {
      const mine = options.filter((o) => o.type === ACTION);
      if (mine.length === 0) return null;
      const scoreOf = new Map<string, number>();
      for (const p of view.players) scoreOf.set(p.id, p.score);
      let best = mine[0] ?? null;
      let bestScore = -Infinity;
      for (const o of mine) {
        const target = (o.payload as { target?: string }).target;
        if (target === undefined || target === holder) continue;
        const s = scoreOf.get(target) ?? 0;
        if (s > bestScore) {
          bestScore = s;
          best = o;
        }
      }
      return best;
    },
  },
});
