/**
 * 사방치기 (gold) — 상가뿐 아니라 누구의 버림패든 치할 수 있다.
 *
 * 구현: call.chi.fromAnyone 규칙을 보유자에게만 켠다.
 * 호출 우선순위(펑 > 원격 치 > 일반 치)는 FlowController가 처리한다.
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";

export const omniChi: AugmentDef = defineAugment({
  id: "omni_chi",
  tier: "gold",
  category: "call",
  complexity: 2,
  name: "사방치기",
  description:
    "(상시) 상가뿐 아니라 누구의 버림패로도 치할 수 있다.",
  detail:
    "같은 버림에 퐁과 겹치면 퐁이 우선하는 표준 우선순위는 그대로지만, 상가의 일반 치와 겹치면 이쪽 원격 치가 우선한다.",
  install(ctx) {
    ctx.setHolderRule("call.chi.fromAnyone", true);
  },
});
