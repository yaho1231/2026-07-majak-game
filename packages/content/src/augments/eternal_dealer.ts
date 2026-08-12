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
 * 그 국의 진짜 오야 자리를 알 수 있다. 내가 진짜 오야가 아닌데 내 화료로 오야 자리가
 * **내 자리로 옮겨 왔다면**(payload.dealerSeat === 내 자리) 우리 규칙이 일한 것이다.
 * 인터셉터 → 리액션 신호는 **이벤트 payload 표식**으로 넘긴다(2026-07-29 감사) —
 * 엔진 밖 클로저 변수는 상태에 없어 재개·리플레이 재구성에서 어긋나고 다중 보유 시 충돌한다.
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
  publishUsesLeft,
  settleInterceptor,
  viewKey,
} from "../util.js";

const ID = "eternal_dealer";
/** 게임당 허용되는 연장(렌짱) 횟수 — 무한 국 방지 안전장치 */
const MAX_KEEPS = 3;

/** 이 게임에서 이미 소모한 연장 횟수 (게임 단위 — roundKey를 섞지 않는다) */
const keepsKey = (h: PlayerId): string => `${ID}:keeps:${h}`;

/** 이번 정산에서 연장(오야 자리 이전)을 발동한 보유자 목록 */
interface ExtendMark {
  extendedBy?: PlayerId[];
}

export const eternalDealer: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 3,
  name: "만년 오야",
  description:
    "(상시 · 연장은 게임 내 3회) 나는 계속 오야다 — 내가 화료하면 언제나 오야 점수(약 1.5배)로 계산되고, 내 자풍은 **'동'으로 덮어씌워진다**(동이 역패가 되는 대신 원래 자풍은 역패가 아니게 된다). 게다가 내가 화료하면 다음 국의 오야가 내 자리로 온다(게임 내 3회).",
  detail:
    "(상시 · 연장은 게임 내 3회) 세 가지가 한꺼번에 걸린다. ① 자리가 어디든 내 화료는 오야 화료로 계산되어 점수가 약 1.5배가 된다. ② 점수 계산에서 내 자풍이 항상 '동'이 된다 — 동을 커쯔로 모으면 늘 역패 1판이 붙고, 장풍까지 동인 국이면 더블동(2판)이 된다. ⚠ **이것은 추가가 아니라 교체다** — 남가에 앉아 南을 커쯔로 모아도 그 南은 더 이상 내 자풍이 아니어서 역패가 붙지 않는다(장풍 南인 국이라면 장풍 몫 1판은 남는다). ③ 내가 화료하면 다음 국의 오야가 내 자리로 옮겨 온다(연장). 다만 국이 무한히 늘어나지 않게 ③은 게임 내 3회까지만 발동하고, 남은 횟수는 전원에게 보인다. 내가 진짜 오야인 국에 화료한 것은 원래 규칙대로의 연장이므로 횟수를 쓰지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, MAX_KEEPS - counterOf(state, keepsKey(holder))),
      total: MAX_KEEPS,
    }));

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

    /*
     * 연장이 **우리 규칙 때문에** 일어났는지 판정해 리액션에 넘긴다.
     *
     * ⚠ 신호는 엔진 밖 클로저 변수가 아니라 **이벤트 payload 표식**으로 넘긴다. 클로저는
     * 상태에 없는 값이라 재개·리플레이 재구성(rebuildAugments)에서 어긋나고, 같은 증강을
     * 두 명이 가지면 서로 덮어쓴다(2026-07-29 감사, 역만 방어술의 ShieldMark와 같은 패턴).
     */
    // 정산 단계: Observe — deltas를 바꾸지 않고 연장 여부만 관찰한다 — 맨 뒤.
    settleInterceptor(ctx, SETTLE_STAGE.Observe, (event, ic) => {
      const p = event.payload as RoundSettledPayload & ExtendMark;
      if (p.outcome !== "win") return event;
      const infos = p.winInfos ?? [];
      if (!infos.some((w) => w.winner === holder)) return event;
      const dealerSeat = ic.state.round.dealerSeat;
      const holderSeat = playerOf(ic.state, holder).seat;
      // 진짜 오야로서 화료한 국은 원래 연장이다 — 횟수를 소모하지 않는다
      if (holderSeat === dealerSeat) return event;
      // 더블론 등으로 진짜 오야도 함께 화료했다면 그것도 원래 연장이다
      if (infos.some((w) => playerOf(ic.state, w.winner).seat === dealerSeat)) {
        return event;
      }
      // 오야 자리가 **내 자리로 옮겨 왔는가** (payload.dealerSeat = 다음 국의 오야 자리)
      if (p.dealerSeat !== holderSeat) return event;
      if (counterOf(ic.state, keepsKey(holder)) >= MAX_KEEPS) return event;
      return {
        type: event.type,
        payload: { ...p, extendedBy: [...(p.extendedBy ?? []), holder] },
      };
    });

    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload & ExtendMark;
      if (!(p.extendedBy ?? []).includes(holder)) return;
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
