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
  name: "사방치기",
  description: "상가뿐 아니라 누구의 버림패로도 치를 할 수 있다.",
  install(ctx) {
    ctx.setHolderRule("call.chi.fromAnyone", true);
  },
});
