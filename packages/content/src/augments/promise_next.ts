/**
 * promise_next — 다음을 위한 기약 (gold).
 * 화료도 방총도 없이 국을 넘길 때마다 스택 +1.
 * 화료하면 스택만큼 판이 추가되고, 화료하거나 론당하면 스택이 초기화된다.
 */

import { ROUND_SETTLED, augmentDataSet, defineAugment } from "@majak/core";
import type { AugmentDef, GameState, PlayerId, RoundSettledPayload } from "@majak/core";
import { counterOf, viewKey } from "../util.js";

const stackKey = (holder: PlayerId): string => `promise_next:stack:${holder}`;

export const promiseNext: AugmentDef = defineAugment({
  id: "promise_next",
  tier: "gold",
  name: "다음을 위한 기약",
  description:
    "화료도 방총도 없이 국을 넘길 때마다 스택 +1. 화료하면 스택만큼 판이 추가되고 스택이 사라진다 (론당해도 초기화).",
  install(ctx) {
    const key = stackKey(ctx.holder);

    // 화료 시 스택만큼 추가 판 — 정산(sys.settleWin) 시점의 스택이 반영된다
    ctx.engine.rules.addModifier<number>("score.extraHan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== ctx.holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return cur + counterOf(state, key);
      },
    });

    // 국 정산마다 스택 갱신: 화료·론당 → 0, 그 외(유국·남의 화료) → +1
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      const infos = p.winInfos ?? [];
      const won = infos.some((w) => w.winner === ctx.holder);
      const dealtIn = infos.some(
        (w) => w.winType === "ron" && w.from === ctx.holder,
      );
      const next = won || dealtIn ? 0 : counterOf(rc.state, key) + 1;
      rc.emit(augmentDataSet(key, next));
      // 스택은 전원에게 보이는 표시용 값으로도 공개한다
      rc.emit(augmentDataSet(viewKey("*", `promise_next:${ctx.holder}`), next));
    });
  },
});
