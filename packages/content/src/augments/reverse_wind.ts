/**
 * 역풍 (reverse_wind, prism) — 이번 국은 차례가 거꾸로 돈다.
 *
 * (획득 즉시 · 이번 국만) 획득한 뒤 처음 시작되는 국 동안 차례가 동→북→서→남으로 돈다.
 * 코어 규칙 `turn.direction`을 −1로 내리는 것이 전부다 — 그 값을 읽는 곳이 함께 뒤집힌다:
 *  - 다음 차례(`sys.advanceTurn`)·치 대상(상가)·동시 론의 선후.
 *  - 하가를 쓰는 증강(리치 강화의 하가 봉인)·쯔모 순서를 보는 증강(삼세 예지·예지의 자리 이름).
 *
 * 자풍과 다음 국 오야 이동은 그대로다(2026-09-24 사용자 확정: 바람 이름은 두고 순서만 거꾸로).
 * 두 명이 같은 국에 켜도 거꾸로 한 번이다(되돌아가지 않는다).
 */

import { augmentDataSet, defineAugment } from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";
import { armOnNextRound, armedNow, roundViewKey } from "../util.js";

const ID = "reverse_wind";

export const reverseWind: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  complexity: 1,
  name: "역풍",
  description:
    "(획득 즉시 · 이번 국만) 차례가 반대 방향(동→북→서→남)으로 돈다.",
  detail:
    "획득한 국 동안 차례가 반대 방향으로 돈다. 치는 새 순서의 바로 앞사람(상가) 패로만 할 수 있다.\n\n하가·상가를 쓰는 다른 증강도 바뀐 순서를 따른다. 자풍과 다음 국 오야는 바뀌지 않는다.",
  install(ctx) {
    const { engine, holder, instanceId, layer } = ctx;

    // 켜지는 국의 공개 표시 — 판 전체의 순서가 바뀌므로 전원이 알아야 한다
    armOnNextRound(ctx, ID, () => [
      augmentDataSet(roundViewKey("*", `${ID}:${holder}`), true),
    ]);

    engine.rules.addModifier<number>("turn.direction", {
      source: instanceId,
      layer,
      apply: (cur, rctx) => {
        const state = rctx.state as GameState | undefined;
        if (state === undefined || !armedNow(state, ID, holder)) return cur;
        return -1;
      },
    });
  },
});
