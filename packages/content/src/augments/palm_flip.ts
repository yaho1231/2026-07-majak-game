/**
 * 손바닥 뒤집기 (palm_flip, prism) — "리치! → 취소. → 다시 리치!"
 *
 * 동풍전 1·반장전 2회, 리치 중 자기 턴에 **리치를 해제**한다. 손이 풀려 자유롭게 버릴 수 있고,
 * **같은 국에 다시 리치를 걸 수 있다 — 이미 낸 리치봉이 그대로 살아 있어 재선언은 공짜다.**
 * 첫 리치를 기준으로 짠 세 사람의 안전패 계산이 통째로 휴지조각이 된다.
 *
 * 설계 결정 — 원안의 "공탁 1000점 몰수"는 §0 무페널티 원칙(능력에 붙는 손해 금지)에 걸린다.
 * 그래서 **몰수(손해)를 "이미 낸 공탁의 재사용"(이득)으로 뒤집었다** — 봉을 돌려받지는 않지만
 * 그 봉이 다음 리치 선언의 비용을 대신한다. 결과적으로 홀더는 어떤 손해도 지지 않는다.
 *
 * 승부수(`last_stand`)와의 차이:
 * - 승부수 = 취소 + **리치봉 환급**(국당 1회) — 물러서서 접는 수단(폴드).
 * - 손바닥 뒤집기 = 취소 + **봉 유지 + 재리치 무료**(matchUses) — 대기를 갈아타는 수단(공격).
 *
 * 구현: 커스텀 이벤트 `RiichiFlipped` 리듀서가 리치 상태만 해제한다(riichiPot 불변 = 환급 없음).
 * 해제한 국에는 `riichi.cost`를 0으로 덮어 재리치가 공짜가 된다(국 단위 플래그, roundKey 스코프).
 */

import {
  augmentDataSet,
  defineAugment,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
} from "@majak/core";
import { counterOf, flagOf, matchUses, roundKey, roundViewKey } from "../util.js";
import { waitTilesLeft } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "palm_flip";
const ACTION = "flip_riichi";
const EVENT = "RiichiFlipped";

/** 매치당 사용 횟수 (동풍1/반장2) */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);
/** 이번 국에 해제했는가 — 재리치 무료 게이트 (국이 바뀌면 자동 만료) */
const flippedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:flipped:${roundKey(state)}:${h}`;

interface FlipPayload {
  player: PlayerId;
}

const flipAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no palm_flip augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.byPlayer[req.player]?.riichi == null) return "not in riichi";
    if (!hasUsesLeft(state, req.player)) return "no uses left this game";
    return null;
  },
  toEvents: (req, { state }) => [
    { type: EVENT, payload: { player: req.player } satisfies FlipPayload },
    augmentDataSet(usesKey(req.player), counterOf(state, usesKey(req.player)) + 1),
    augmentDataSet(flippedKey(state, req.player), true),
    // 전원 공개 — 상대는 이 사람의 리치 정보에 유통기한이 있다는 걸 알아야 한다
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), roundKey(state)),
  ],
};

export const palmFlip: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  complexity: 2,
  name: "손바닥 뒤집기",
  description:
    "(동풍전 1회 · 반장전 2회) 리치 중 자기 순에 리치를 해제한다 — 손이 풀리고 같은 국에 다시 리치를 걸 수 있으며, 이미 낸 리치봉이 그대로 살아 있어 재선언은 공짜다.",
  detail:
    "(동풍전 1회 · 반장전 2회) 리치 중 자기 순에 선언을 취소하면 잠겼던 손이 풀려 무엇이든 버릴 수 있고, 대기를 갈아엎은 뒤 같은 국에 다시 리치를 걸 수 있다. 처음 낸 리치봉이 그대로 남아 있어 재선언에는 공탁을 다시 내지 않는다. 해제 사실은 전원에게 공개된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(flipAction);
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as FlipPayload;
        const rs = state.round.byPlayer[p.player];
        if (rs === undefined) return state;
        // 리치 상태만 해제한다 — riichiPot(공탁)은 그대로 두어 환급이 없다.
        // 대신 이번 국 재리치가 무료가 된다(riichi.cost = 0).
        return {
          ...state,
          round: {
            ...state.round,
            byPlayer: {
              ...state.round.byPlayer,
              [p.player]: { ...rs, riichi: null, riichiFuriten: false },
            },
          },
        };
      });
    }

    // 해제한 국에는 재리치 공탁이 무료 (이미 낸 봉이 그 값을 대신한다)
    engine.rules.addModifier<number>("riichi.cost", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return flagOf(state, flippedKey(state, holder)) ? 0 : cur;
      },
    });

    ctx.holderTurnOptions((state) => {
      if (state.round.byPlayer[holder]?.riichi == null) return [];
      if (!hasUsesLeft(state, holder)) return [];
      return [{ type: ACTION, payload: {} }];
    });
  },
  /**
   * 승부수(`last_stand`)가 물러서는 수단이라면 이쪽은 **대기를 갈아타는 수단**이다.
   * 그래서 판단 기준도 위험이 아니라 "지금 대기가 죽었는가"다 — 오름패가 세상에 한 장도
   * 남지 않은 리치는 그대로 두면 유국까지 아무 일도 일어나지 않는다.
   *
   * 풀고 나서 손을 다시 짤 시간(패산)이 남아 있을 때만 켠다. 봉이 그대로 살아 있어
   * 재리치는 공짜이므로, 푼 뒤의 리치 판단은 평소 규칙(넓은 대기를 고른다)에 맡긴다.
   */
  bot: plan({
    intent: "advance",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: (ctx) => {
      const opt = ctx.options.find((o) => o.type === ACTION);
      if (opt === undefined) return null;
      if (!ctx.tenpai) return null;
      if (ctx.wallLeft < 12) return null; // 다시 짤 시간이 없다
      return waitTilesLeft(ctx) === 0 ? opt : null;
    },
  }),
});
