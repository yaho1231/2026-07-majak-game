/**
 * suit_unify (단색 세계) — 첫 국 시작 시 손패의 수패가 전부 무작위 한 종류
 * (만/통/삭)로 바뀐다. 대신 혼일색·청일색은 영구 봉인된다.
 */

import {
  ROUND_STARTED,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  isNumberSuit,
  kindOf,
  tileKindChanged,
} from "@majak/core";
import type { AugmentDef, Suit, TileKindChangedPayload } from "@majak/core";
import { flagOf, statePrng, viewKey } from "../util.js";

const ID = "suit_unify";

/** 통일 대상 후보 수패 종류 */
const NUMBER_SUITS: readonly Suit[] = ["man", "pin", "sou"];

export const suitUnify: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  name: "단색 세계",
  description:
    "첫 국 시작 시 손패의 수패가 전부 무작위 한 종류(만/통/삭)로 바뀐다. 대신 혼일색·청일색은 영구 봉인.",
  install(ctx) {
    // 혼일색·청일색 영구 봉인 — 보유자에게만 blockedYaku에 추가
    ctx.engine.rules.addModifier<string[]>("win.blockedYaku", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) =>
        rctx.playerId === ctx.holder ? [...cur, "honitsu", "chinitsu"] : cur,
    });

    // 첫 국 시작 시 1회: 손패 수패를 무작위 한 종류로 통일
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      const state = rc.state; // setupRound 이후 = 배패 완료
      const doneKey = `${ID}:done:${ctx.holder}`;
      if (flagOf(state, doneKey)) return;

      const prng = statePrng(state);
      const suit = prng.pick(NUMBER_SUITS);

      const changes: TileKindChangedPayload["changes"] = [];
      for (const tileId of handIdsOf(state, ctx.holder)) {
        const kind = kindOf(state, tileId);
        if (isNumberSuit(kind)) {
          // 색을 바꿔 새로 만들어낸 패 — conjured로 표시해 클라이언트가 구분해 그린다
          // (원래 4장 한도를 넘는 중복이 생길 수 있으므로 원본 패와 시각적으로 구별)
          changes.push({ tileId, kind: { suit, rank: kind.rank }, attrs: { conjured: true } });
        }
      }
      // 난수를 소비했으므로 changes가 비어도 prngState는 반드시 되쓴다
      rc.emit(tileKindChanged(changes, prng.getState()));
      rc.emit(augmentDataSet(doneKey, true));
      // 어떤 색으로 통일됐는지 전원 공개
      rc.emit(augmentDataSet(viewKey("*", `${ID}:${ctx.holder}`), suit));
    });
  },
});
