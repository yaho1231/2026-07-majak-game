/**
 * 등 떠밀기 (push_riichi, prism) — "숨을 수 없다."
 *
 * 매 국 1회, 자기 턴에 상대 한 명에게 **낙인**을 찍는다(전원 공개). 이후 그가
 * 리치 가능한 상태(멘젠 텐파이·공탁 여유·리치 미봉쇄)에서 패를 버리는 순간, 그 버림이
 * **자동으로 강제 리치**가 된다. 다마텐으로 숨으려는 바로 그 순간 시스템이 리치봉을 던지게 만든다.
 *
 * 낙인은 **찍은 국 동안만** 살아 있고, 터지거나 국이 끝나면 사라진다. 일부러 후로해 손을
 * 열면 멘젠이 깨져 조건이 안 서므로 그 국은 넘길 수 있다 — 텐파이를 늦추거나 싸게 여는
 * 것이 회피 루트다.
 *
 * ⚠ 예전에는 낙인이 **국을 넘어** 살아남았다. 그런데 "매 국 1회" 표식(usedKey)은 낙인을
 * **찍은 국**에 찍히므로, E1에 찍은 낙인이 E2에 터지면 E2에는 표식이 없어 **같은 국에
 * 낙인을 한 번 더** 찍을 수 있었다(2026-08-12 사용자 보고: "국이 지나갔는데 남아 있고
 * 증강이 재사용된다"). 낙인 자체를 국 단위로 내려 "매 국 1회 = 그 국 동안"으로 맞췄다 —
 * 표시 채널도 국 스코프(roundViewKey)라 국 경계에서 함께 내려간다.
 *
 * 구현: 순수 콘텐츠. 지목은 국 단위 augmentData. `TILE_DISCARDED` **Interceptor**가
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
import { flagOf, publishUsesLeft, roundKey, roundViewKey, stringOf } from "../util.js";
import { plan } from "./botPlan.js";

const ID = "push_riichi";
const ACTION = "push_brand";

/** 국당 1회 — 국이 바뀌면 다시 찍을 수 있다 (단, 살아 있는 낙인이 있으면 못 찍는다) */
const usedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:used:${roundKey(state)}:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  !flagOf(state, usedKey(state, h));
/**
 * 현재 낙인 대상 (**국 단위** — 국이 바뀌면 키가 달라져 저절로 풀린다, 발동 시 소멸).
 * `usedKey`와 같은 국을 가리켜야 "매 국 1회"가 어긋나지 않는다 — 위 ⚠ 참고.
 */
const brandKey = (state: GameState, h: PlayerId): string =>
  `${ID}:brand:${roundKey(state)}:${h}`;
/** 낙인 표시 채널 (전원 공개, 국 스코프 — 국 경계에서 엔진이 지운다) */
const brandViewKey = (h: PlayerId): string => roundViewKey("*", `${ID}:${h}`);

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
    if (!hasUsesLeft(state, req.player)) return "already used this round";
    if (stringOf(state, brandKey(state, req.player)) !== null) return "a brand is already active";
    if (req.payload.target === req.player) return "cannot brand yourself";
    if (!state.players.some((p) => p.id === req.payload.target)) return "unknown target";
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(brandKey(state, req.player), req.payload.target),
    augmentDataSet(usedKey(state, req.player), true),
    // 전원 공개 지목 관계
    augmentDataSet(brandViewKey(req.player), req.payload.target),
  ],
};

export const pushRiichi: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  complexity: 2,
  name: "등 떠밀기",
  description:
    "(매 국 1회) 자기 순에 상대 한 명에게 낙인을 찍는다(전원 공개). 그가 리치 가능한 상태에서 패를 버리는 순간 그 버림이 자동으로 강제 리치가 된다.",
  detail:
    "(매 국 1회) 자기 순에 상대 한 명에게 낙인을 찍는다. 낙인자가 멘젠 텐파이 상태로 패를 버리려 하면 그 버림이 자동으로 리치가 되어 리치봉이 강제로 던져진다 — 다마텐으로 숨을 수 없다. 낙인은 찍은 국 동안만 살아 있고, 한 번 터지거나 국이 끝나면 소멸한다. 후로해 멘젠이 깨진 손에는 조건이 서지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // "이번 국 1회"는 이미 썼는지가 화면 어디에도 없어서, 액티브 버튼이 사라지고
    // 나서야 소진을 알 수 있었다(2026-08-15 사용자 지적: "횟수류 전부 안 나온다").
    publishUsesLeft(
      ctx,
      (state) => ({ left: flagOf(state, usedKey(state, holder)) ? 0 : 1, total: 1 }),
      "round",
    );

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(brandAction);
    }

    // 낙인 대상의 버림을 가로채, 리치 성립 조건이면 강제 리치로 만든다.
    ctx.interceptor(TILE_DISCARDED, (event, ic) => {
      const p = event.payload as TileDiscardedPayload;
      if (p.riichi) return event; // 이미 리치면 그대로
      const target = stringOf(ic.state, brandKey(ic.state, holder));
      if (target === null || p.player !== target) return event;
      if (!riichiEligibleOnDiscard(ic.state, ic.rules, target, p.tileId)) return event;
      const cost = ic.rules.resolve<number>("riichi.cost", { playerId: target, state: ic.state });
      return { type: event.type, payload: { ...p, riichi: true, riichiCost: cost } };
    });

    // 낙인 대상이 리치를 성립시키면(강제든 자발이든) 낙인을 소멸시킨다.
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (!p.riichi) return;
      const target = stringOf(rc.state, brandKey(rc.state, holder));
      if (target === null || p.player !== target) return;
      rc.emit(augmentDataSet(brandKey(rc.state, holder), ""));
      /*
       * 낙인 표시도 **그 자리에서** 함께 내린다.
       *
       * ⚠ 예전에는 상태(brandKey)만 비우고 공개 채널은 그대로 뒀다. 표시 키가
       * 게임 단위(viewKey)였던 탓에, 이미 사라진 낙인이 매치가 끝날 때까지 이름표에
       * 떠 있었다(docs/25 리치 #8, P4). 상대는 없는 낙인을 피해 계속 다마텐을
       * 포기하게 된다. 지금은 국 스코프라 국 경계에서도 저절로 내려가지만, 국 도중에
       * 터진 낙인은 여기서 비워야 한다. 클라이언트는 빈 문자열을 관계 없음으로 읽는다.
       */
      rc.emit(augmentDataSet(brandViewKey(holder), ""));
      rc.emit(augmentDataSet(roundViewKey("*", `${ID}:fired:${holder}`), target));
    });

    // 사용 횟수가 남았고 활성 낙인이 없으면 보유자 턴에 각 상대를 지목 후보로 낸다
    ctx.holderTurnOptions((state) => {
      if (!hasUsesLeft(state, holder)) return [];
      if (stringOf(state, brandKey(state, holder)) !== null) return [];
      return state.players
        .filter((p) => p.id !== holder)
        .map((p) => ({ type: ACTION, payload: { target: p.id } }));
    });
  },
  // 봇: 점수가 가장 높은 상대(선두)에게 낙인을 찍는다 — 다마텐 봉쇄로 압박(자해 없음).
  // 누구를 찍을지의 최적은 미묘하나, 선두 견제는 언제나 방어적으로 유효하다.
  bot: plan({
    // 상대에게 강제 리치를 건다 — 내 손이 아니라 **상대**를 건드리는 물건이다
    intent: "disrupt",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder }) => {
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
  }),
});
