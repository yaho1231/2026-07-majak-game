/**
 * 이중 선언 (riichi_upgrade) — 보유자의 리치는 무조건 더블리치로 승격된다.
 * 원래부터 더블리치 조건(첫 버림·부로 없음)이었다면 화료 시 +1판을 더 얹는다 (트리플).
 *
 * 구현 지점:
 * - TILE_DISCARDED Interceptor: 보유자의 리치 버림에 riichiDouble=true를 강제.
 * - TILE_DISCARDED Reaction: 자연 더블 조건이면 트리플 플래그를 augmentData에 기록.
 * - ROUND_SETTLED Reaction: 국이 끝나면 플래그 해제.
 * - score.extraHan Modifier: 플래그가 켜진 보유자의 화료에 +1판.
 */

import {
  ROUND_SETTLED,
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  TileDiscardedPayload,
} from "@majak/core";
import { flagOf } from "../util.js";

/** 트리플리치(자연 더블에서 한 번 더 승격) 상태 플래그 키 */
const tripleKey = (holder: PlayerId): string =>
  `riichi_upgrade:triple:${holder}`;

export const riichiUpgrade: AugmentDef = defineAugment({
  id: "riichi_upgrade",
  tier: "gold",
  name: "이중 선언",
  description:
    "리치를 선언하면 언제나 더블리치가 된다. 원래 더블리치였다면 1판을 더 얹는다.",
  install(ctx) {
    // 보유자의 리치 버림을 가로채 더블리치로 승격
    ctx.interceptor(TILE_DISCARDED, (event) => {
      const p = event.payload as TileDiscardedPayload;
      if (!p.riichi || p.player !== ctx.holder) return event;
      return { type: event.type, payload: { ...p, riichiDouble: true } };
    });

    // 자연 더블리치 조건(첫 버림 + 첫 바퀴 무부로)이었다면 트리플 플래그 기록
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (!p.riichi || p.player !== ctx.holder) return;
      const rs = rc.state.round.byPlayer[ctx.holder];
      if (rs?.riichi == null) return;
      if (
        rs.riichi.discardIndex === 0 &&
        rc.state.round.goAroundBroken === false
      ) {
        rc.emit(augmentDataSet(tripleKey(ctx.holder), true));
      }
    });

    // 국이 끝나면 플래그 해제 (다음 국으로 이월 금지)
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      if (flagOf(rc.state, tripleKey(ctx.holder))) {
        rc.emit(augmentDataSet(tripleKey(ctx.holder), false));
      }
    });

    // 트리플 상태의 보유자 화료에 +1판 (역만에는 엔진이 적용하지 않는다)
    ctx.engine.rules.addModifier<number>("score.extraHan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (current, rctx) => {
        if (rctx.playerId !== ctx.holder) return current;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return current;
        return flagOf(state, tripleKey(ctx.holder)) ? current + 1 : current;
      },
    });
  },
});
