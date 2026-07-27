/**
 * 만년 오야 (eternal_dealer, prism) — 실제 오야 자리를 상시 보유한다.
 *
 * 52차 개편: "점수만 오야 배율"이라는 보이지 않는 정산 보정에, **눈에 보이는 규칙 파괴**를 더했다.
 *   1. `win.treatAsDealer` — 내 화료는 언제나 오야 화료로 계산된다 (기존 유지).
 *   2. `scoring.seatWind` = 1 — **채점 자풍이 언제나 동으로 고정된다.**
 *      역패 동이 늘 성립하고, 장풍이 동이면 더블동이 된다.
 *   3. `round.keepDealer` — **내가 화료하면 오야가 유지된다(렌짱).**
 *
 * ⚠ 무한 국 방지 안전장치: 3번 연장은 **게임당 최대 3회**다. augmentData 카운터로 세고,
 *   한도를 넘으면 modifier가 false를 돌려준다. 무페널티 원칙이 허용하는 억제 수단은
 *   발동 횟수 제한뿐이므로 여기서 그것을 쓴다 (점수 손해는 붙이지 않는다).
 *
 * 연장 소모 판정: ROUND_SETTLED 인터셉터의 ic.state는 **리듀서 적용 전** = 지금 정산되는 국이라
 * 그 국의 진짜 오야 자리를 알 수 있다. 내가 진짜 오야가 아닌데 내 화료로 오야 자리가 그대로
 * 유지됐다면(payload.dealerSeat === 정산 전 dealerSeat) 우리 규칙이 일한 것이다.
 * 인터셉터→리액션이 같은 이벤트 처리 안에서 순차 실행되는 점을 이용해 플래그를 넘긴다
 * (karma가 쓰던 것과 같은 패턴 — 매 진입 시 false로 리셋되어 리플레이 결정성을 해치지 않는다).
 */

import {
  augmentDataSet,
  defineAugment,
  playerOf,
  ROUND_SETTLED,
  SETTLE_STAGE,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import {
  counterOf,
  settleInterceptor,
  viewKey,
} from "../util.js";

const ID = "eternal_dealer";
/** 게임당 허용되는 연장(렌짱) 횟수 — 무한 국 방지 안전장치 */
const MAX_KEEPS = 3;

/** 이 게임에서 이미 소모한 연장 횟수 (게임 단위 — roundKey를 섞지 않는다) */
const keepsKey = (h: PlayerId): string => `${ID}:keeps:${h}`;

export const eternalDealer: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  name: "만년 오야",
  description:
    "(상시 · 연장은 게임 내 3회) 내 화료는 언제나 오야 화료로 계산되고 채점 자풍이 동으로 고정된다. 게다가 내가 화료하면 오야 자리가 그대로 유지된다.",
  detail:
    "(상시 · 연장은 게임 내 3회) 획득 이후 자신의 모든 화료가 오야 화료로 계산되어 점수가 약 1.5배가 된다. 여기에 채점상의 자풍이 항상 동으로 고정되어 역패 동이 늘 성립하고, 장풍이 동인 국에서는 더블동이 된다. 마지막으로 자신이 화료하면 오야 자리가 그대로 유지된다(연장) — 다만 무한 국을 막기 위해 이 연장은 게임 내 3회까지만 발동하며 남은 횟수는 전원에게 공개된다. 실제 오야로서 화료한 국은 원래 연장이므로 횟수를 소모하지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 1) 보유자의 화료를 오야로 채점
    engine.rules.addModifier<boolean>("win.treatAsDealer", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => (rctx.playerId === holder ? true : cur),
    });

    // 2) 채점 자풍을 동으로 고정 — 역패 동 상시 성립, 장풍 동이면 더블동
    ctx.setHolderRule("scoring.seatWind", 1);

    // 3) 내가 화료하면 연장 — 단, 게임당 MAX_KEEPS회까지
    engine.rules.addModifier<boolean>("round.keepDealer", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return counterOf(state, keepsKey(holder)) < MAX_KEEPS ? true : cur;
      },
    });

    // 연장이 실제로 우리 규칙 때문에 일어났는지 판정해 리액션에 넘긴다
    let extended = false;
    // 정산 단계: Observe — deltas를 바꾸지 않고 연장 여부만 관찰한다 — 맨 뒤.
    settleInterceptor(ctx, SETTLE_STAGE.Observe, (event, ic) => {
      extended = false;
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return event;
      const infos = p.winInfos ?? [];
      if (!infos.some((w) => w.winner === holder)) return event;
      const dealerSeat = ic.state.round.dealerSeat;
      // 진짜 오야로서 화료한 국은 원래 연장이다 — 횟수를 소모하지 않는다
      if (playerOf(ic.state, holder).seat === dealerSeat) return event;
      // 더블론 등으로 진짜 오야도 함께 화료했다면 그것도 원래 연장이다
      if (infos.some((w) => playerOf(ic.state, w.winner).seat === dealerSeat)) {
        return event;
      }
      // 오야 자리가 그대로 유지됐는가 (payload.dealerSeat = 다음 국의 오야 자리)
      if (p.dealerSeat !== dealerSeat) return event;
      if (counterOf(ic.state, keepsKey(holder)) >= MAX_KEEPS) return event;
      extended = true;
      return event;
    });

    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      if (!extended) return;
      extended = false;
      const used = counterOf(rc.state, keepsKey(holder)) + 1;
      rc.emit(augmentDataSet(keepsKey(holder), used));
      // 전원 공개 — 남은 연장 횟수가 테이블에 보인다
      rc.emit(
        augmentDataSet(
          viewKey("*", `${ID}:${holder}`),
          `연장 (남은 ${MAX_KEEPS - used}회)`,
        ),
      );
    });
  },
});
