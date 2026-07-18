/**
 * 카운터 (counter, silver).
 * 이번 국에 상대가 리치를 선언한 직후 자신도 리치를 선언하면, 그 화료에 +1판.
 * 매 국 시작 시 초기화된다 (국당 최대 1회 성립).
 */

import {
  ROUND_STARTED,
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
} from "@majak/core";
import type { AugmentDef, PlayerId, TileDiscardedPayload } from "@majak/core";
import { addHanBonus, flagOf, stringOf } from "../util.js";

const prevKey = (h: PlayerId): string => `counter:prev:${h}`;
const hitKey = (h: PlayerId): string => `counter:hit:${h}`;

export const counter: AugmentDef = defineAugment({
  id: "counter",
  tier: "silver",
  name: "카운터",
  description:
    "상대가 리치를 선언한 뒤 자신이 이어서 리치를 선언하면, 그 국의 화료에 +1판. 매 국 시작 시 초기화된다.",
  install(ctx) {
    const { holder } = ctx;
    addHanBonus(ctx, (state) => (flagOf(state, hitKey(holder)) ? 1 : 0));

    // 매 국 시작 시 초기화
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      if (stringOf(rc.state, prevKey(holder)) !== null) {
        rc.emit(augmentDataSet(prevKey(holder), ""));
      }
      if (flagOf(rc.state, hitKey(holder))) {
        rc.emit(augmentDataSet(hitKey(holder), false));
      }
    });

    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (!p.riichi) return;
      if (p.player === holder) {
        // 내 리치 이전에 상대 리치가 있었으면 성립
        if (stringOf(rc.state, prevKey(holder)) !== null) {
          rc.emit(augmentDataSet(hitKey(holder), true));
        }
      } else {
        // 상대의 리치 — 반격 창을 연다
        rc.emit(augmentDataSet(prevKey(holder), p.player));
      }
    });
  },
});
