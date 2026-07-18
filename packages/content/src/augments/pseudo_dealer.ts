/**
 * 찬탈자 (pseudo_dealer, gold) — 게임당 1회 자기 턴에 선언하면, 다음 국 동안
 * 점수 계산에서 자신도 오야로 취급된다 (win.treatAsDealer — 연장은 실제 오야만).
 *
 * 상태 흐름 (augmentData "pseudo_dealer:{holder}"):
 *   선언 → "armed" → (선언한 국의 종료) → "active" → (다음 국의 종료) → 해제.
 * "active"인 국 동안만 win.treatAsDealer Modifier가 true를 돌려준다.
 */

import {
  ROUND_SETTLED,
  augmentDataSet,
  defineAugment,
  playerAtSeat,
} from "@majak/core";
import type { ActionDef, AugmentDef, GameState, PlayerId } from "@majak/core";

/** 단계 키: "armed"(선언한 국) → "active"(다음 국) → null(해제) */
const stageKey = (player: PlayerId): string => `pseudo_dealer:${player}`;
/** 게임당 1회 사용 플래그 */
const usedKey = (player: PlayerId): string => `pseudo_dealer:used:${player}`;

const claimDealerAction: ActionDef<Record<string, never>> = {
  type: "claim_dealer",
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes("pseudo_dealer")) return "no pseudo_dealer augment";
    if (state.augmentData[usedKey(req.player)] === true) {
      return "claim_dealer already used";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    return null;
  },
  toEvents: (req) => [
    augmentDataSet(stageKey(req.player), "armed"),
    augmentDataSet(usedKey(req.player), true),
  ],
};

export const pseudoDealer: AugmentDef = defineAugment({
  id: "pseudo_dealer",
  tier: "gold",
  name: "찬탈자",
  description:
    "게임당 1회, 자기 턴에 선언하면 다음 국 동안 점수 계산에서 자신도 오야로 취급된다 (연장은 없음).",
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has("claim_dealer")) {
      engine.actions.register(claimDealerAction);
    }

    // 국 종료마다 단계 전이: armed → active(다음 국 유효), active → 해제
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      const stage = rc.state.augmentData[stageKey(holder)];
      if (stage === "armed") {
        rc.emit(augmentDataSet(stageKey(holder), "active"));
      } else if (stage === "active") {
        rc.emit(augmentDataSet(stageKey(holder), null));
      }
    });

    // "active"인 국 동안 점수 계산에서 오야 취급
    engine.rules.addModifier<boolean>("win.treatAsDealer", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (current, rctx) => {
        if (rctx.playerId !== holder) return current;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return current;
        return state.augmentData[stageKey(holder)] === "active" ? true : current;
      },
    });

    // 보유자 턴 프롬프트에 선언 후보 노출 (validate가 최종 판정)
    ctx.holderTurnOptions(() => [{ type: "claim_dealer", payload: {} }]);
  },
});
