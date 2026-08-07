/**
 * 덤터기 (scapegoat, gold).
 * 자기 턴에 상대 1명을 공개 지목할 수 있다(턴마다 변경 가능). 지목이 걸려 있는
 * 동안 자신의 쯔모 화료 지불은 분담 없이 그 상대가 전액 부담한다
 * (총액 불변, 분배만 변경).
 *
 * 구현: parasite 패턴. 지목 커스텀 액션 + augmentData(공개 뷰), ROUND_SETTLED
 * 인터셉터에서 보유자 쯔모 시 나머지 두 명의 지불(음수 delta)을 지목 대상에게 이전.
 */

import {
  augmentDataSet,
  defineAugment,
  playerAtSeat,
  ROUND_SETTLED,
  SETTLE_STAGE,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import { roundKey, roundViewKey, settleInterceptor, stringOf } from "../util.js";
import { plan } from "./botPlan.js";

const ID = "scapegoat";
const ACTION = "scapegoat_mark";
const targetKey = (state: GameState, h: PlayerId): string =>
  `${ID}:target:${roundKey(state)}:${h}`;

const markAction: ActionDef<{ target: PlayerId }> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no scapegoat augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (req.payload.target === req.player) return "cannot target yourself";
    if (!state.players.some((p) => p.id === req.payload.target)) {
      return "unknown target";
    }
    if (stringOf(state, targetKey(state, req.player)) !== null) {
      return "already marked this round";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(targetKey(state, req.player), req.payload.target),
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), req.payload.target),
  ],
};

export const scapegoat: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "disrupt",
  complexity: 2,
  name: "덤터기",
  description:
    "(매 국 1회) 자기 순에 상대 1명을 공개 지목하면, 내 쯔모 화료 지불을 분담 없이 그 상대가 전액 부담한다(총액 불변).",
  detail:
    "(매 국 1회) 자기 순에 상대 한 명을 공개 지목한다. 지목이 걸린 동안 자신의 쯔모 화료 지불을 세 명이 나눠 내지 않고 지목한 그 상대가 전액 부담한다. 내가 받는 총액은 그대로이고 분배만 바뀐다. 론 화료에는 적용되지 않으며 지목은 국당 한 번뿐이라 한 번 정하면 그 국에는 바꿀 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(markAction);
    }

    // 정산 단계: Redistribute — 쯔모 지불을 지목 대상 한 명에게 몰아준다 — 총액 불변, 분배만 변경.
    settleInterceptor(ctx, SETTLE_STAGE.Redistribute, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return event;
      const info = (p.winInfos ?? []).find(
        (w) => w.winner === holder && w.winType === "tsumo",
      );
      if (info === undefined) return event;
      const target = stringOf(ic.state, targetKey(ic.state, holder));
      if (target === null || target === holder) return event;
      // 나머지 두 명(보유자·대상 제외)의 지불을 대상에게 이전
      const deltas = { ...p.deltas };
      for (const pl of ic.state.players) {
        if (pl.id === holder || pl.id === target) continue;
        const owed = deltas[pl.id] ?? 0;
        if (owed >= 0) continue; // 지불(음수)만 이전
        deltas[target] = (deltas[target] ?? 0) + owed;
        deltas[pl.id] = 0;
      }
      return { type: event.type, payload: { ...p, deltas } };
    });

    // 매 국 1회만 지목 — 이번 국에 이미 지목했으면 버튼을 내리지 않는다
    ctx.holderTurnOptions((state) => {
      if (stringOf(state, targetKey(state, holder)) !== null) return [];
      return state.players
        .filter((p) => p.id !== holder)
        .map((p) => ({ type: ACTION, payload: { target: p.id } }));
    });
  },
  // 쯔모 화료 시 지불을 한 상대에게 몰아준다(총액 불변) — 내가 텐파이라 화료가 가시권일
  // 때, 점수가 가장 높은 상대에게 몰아 그 상대의 순위를 끌어내린다.
  bot: plan({
    intent: "defend",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: ({ options, view, holder, tenpai }) => {
      if (!tenpai) return null;
      const mine = options.filter((o) => o.type === ACTION);
      if (mine.length === 0) return null;
      const scoreOf = new Map<string, number>();
      for (const p of view.players) if (p.id !== holder) scoreOf.set(p.id, p.score);
      let best = mine[0] ?? null;
      let bestScore = -Infinity;
      for (const o of mine) {
        const target = (o.payload as { target?: string }).target;
        const s = target === undefined ? -Infinity : (scoreOf.get(target) ?? -Infinity);
        if (s > bestScore) {
          bestScore = s;
          best = o;
        }
      }
      return best;
    },
  }),
});
