/**
 * 복수자 (avenger, silver) — 48차 도파민 개편.
 *
 * 이전: "원수에게 론으로 되갚으면 +2판" (보이지 않는 판 보너스).
 * 지금: 론당하면 그 상대가 **원수**로 전원에게 공개되고, 그 순간부터
 *       원수의 버림패에 한해 **후리텐도 역 없음도 무시하고 론**할 수 있다.
 *       복수에 성공하면 원한이 풀린다.
 *
 * 부수는 상식: "내가 버린 패는 나에게 안전하다(후리텐)" · "역이 없으면 화료 못 한다".
 * 원수로 찍힌 사람은 그 순간부터 나에게 어떤 패도 안전하지 않다.
 *
 * 구현: win.furiten.enabled / win.requiresYaku 모디파이어가 rctx.state를 읽어
 * **지금 론 대상 버림패의 주인이 원수일 때만** 해제한다(그 외에는 규칙 불변).
 * 조건부 해석이 가능한 것은 standardActions가 두 규칙 resolve에 state를 넘기기 때문.
 */

import {
  ROUND_SETTLED,
  WIN_DECLARED,
  augmentDataSet,
  defineAugment,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  WinDeclaredPayload,
} from "@majak/core";
import { stringOf, viewKey } from "../util.js";

const nemKey = (h: PlayerId): string => `avenger:nemesis:${h}`;

/** 지금 론하려는 대상(버림패·창깡)의 주인이 이 보유자의 원수인가 */
function targetIsNemesis(state: GameState | undefined, holder: PlayerId): boolean {
  if (state === undefined) return false;
  const nemesis = stringOf(state, nemKey(holder));
  if (nemesis === null) return false;
  const from = state.round.lastDiscard?.player ?? state.round.chankan?.player;
  return from === nemesis;
}

export const avenger: AugmentDef = defineAugment({
  id: "avenger",
  tier: "silver",
  category: "shape",
  name: "복수자",
  description:
    "(상시) 론으로 방총당하면 그 상대가 '원수'로 전원에게 공개되며, 원수의 버림패에 한해 후리텐이어도 역이 없어도 론할 수 있다. 복수에 성공하면 원한이 풀린다.",
  detail:
    "(상시) 론으로 방총당하는 순간 그 상대가 '원수'로 지정되어 전원에게 공개된다. 그 뒤로 원수의 버림패에 한해 후리텐 규칙과 역 필요 조건이 모두 무시되어, 자신이 버린 패로도 역 없는 손으로도 론할 수 있다. 원수에게 론으로 화료하면 원한이 풀려 해제되고, 다른 사람에게 방총당하면 원수가 그쪽으로 갱신된다. 방총당하기 전까지는 아무 효과도 없다.",
  install(ctx) {
    const { holder } = ctx;

    // 원수의 버림패에 한해서만 후리텐·역 요구가 풀린다 (그 외에는 표준 규칙 그대로)
    ctx.engine.rules.addModifier<boolean>("win.furiten.enabled", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        return targetIsNemesis(rctx.state as GameState | undefined, holder)
          ? false
          : cur;
      },
    });
    ctx.engine.rules.addModifier<boolean>("win.requiresYaku", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        return targetIsNemesis(rctx.state as GameState | undefined, holder)
          ? false
          : cur;
      },
    });

    // 복수 성공 — 원수에게 론으로 화료하면 그 자리에서 원한이 풀린다
    ctx.reaction(WIN_DECLARED, (event, rc) => {
      const p = event.payload as WinDeclaredPayload;
      if (p.winner !== holder || p.winType !== "ron") return;
      const nemesis = stringOf(rc.state, nemKey(holder));
      if (nemesis === null || p.from !== nemesis) return;
      rc.emit(augmentDataSet(nemKey(holder), ""));
      rc.emit(augmentDataSet(viewKey("*", `avenger:${holder}`), ""));
    });

    // 방총당하면 원수 지정 (전원 공개 — Rule #4 대응의 전제)
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      const ronnedBy = (p.winInfos ?? []).find(
        (w) => w.winType === "ron" && w.from === holder,
      )?.winner;
      if (ronnedBy === undefined || ronnedBy === holder) return;
      rc.emit(augmentDataSet(nemKey(holder), ronnedBy));
      rc.emit(augmentDataSet(viewKey("*", `avenger:${holder}`), ronnedBy));
    });
  },
});
