/**
 * 만년 오야 (eternal_dealer, prism) — 실제 오야 자리를 상시 보유한다.
 *
 * 52차 개편: "점수만 오야 배율"이라는 보이지 않는 정산 보정에, **눈에 보이는 규칙 파괴**를 더했다.
 *   1. `win.treatAsDealer` — 내 화료는 언제나 오야 화료로 계산된다 (기존 유지).
 *   2. 커스텀 역 "역패 동" — **동 커쯔가 언제나 1판이 된다.**
 *   3. `round.keepDealer` — **내가 화료하면 오야가 유지된다(렌짱).**
 *
 * ⚠ 2번은 예전에 `scoring.seatWind` = 1(채점 자풍을 동으로 **교체**)이었다. 그러면 남가가
 * 南 커쯔를 모아도 자풍패가 안 붙어, 얻는 것 하나에 잃는 것 하나가 딸려 왔다. 지금은
 * **추가**다 — 자풍은 실제 자리 그대로 두고 동만 역패로 하나 더 얹는다(2026-08-15 사용자 지시).
 * 자풍이 이미 동인 동가에게는 아무것도 더 붙지 않는다(중복 지급 방지). 장풍이 동인 국에
 * 동 커쯔를 모으면 장풍패 1판 + 이 역 1판 = 더블동으로, 진짜 오야가 받는 값과 같아진다.
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
  Suits,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  ScoringVariant,
} from "@majak/core";
import {
  addYakuHolder,
  counterOf,
  publishUsesLeft,
  scaledUses,
  settleInterceptor,
  viewKey,
  yakuHolders,
} from "../util.js";

const ID = "eternal_dealer";
/**
 * **동풍전 기준** 연장(렌짱) 허용 횟수 — 무한 국 방지 안전장치.
 * 반장전은 `scaledUses`가 1.5배(올림)로 늘린다 (동풍전 3회 · 반장전 5회,
 * 2026-08-23 사용자 지시 — 매치 예산이 전부 동풍전 기준이었다).
 */
const TONPUU_KEEPS = 3;
/** 이 매치에서 허용되는 연장 횟수 (동풍전 3 · 반장전 5) */
const maxKeeps = (state: GameState): number => scaledUses(state, TONPUU_KEEPS);
/** 바람패 랭크의 동 (1동 2남 3서 4북) */
const EAST = 1;
/** 덧붙는 역패 동의 역 id */
const EAST_YAKU = `${ID}_east`;

/**
 * 순수한 동 커쯔(깡 포함)를 들고 있는가.
 *
 * 무늬·랭크가 섞인 몸통(동수의 결속·바람의 계보의 동남서북 깡)은 제외한다 — 표준
 * 역패가 `isPureTriplet`·`isSameRankTriplet`으로 거르는 것과 같은 기준이다.
 */
function hasEastTriplet(variant: ScoringVariant): boolean {
  return variant.sets.some(
    (s) =>
      s.type === "triplet" &&
      s.tiles.every((t) => t.suit === Suits.Wind && t.rank === EAST),
  );
}

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
    "(상시 · 연장은 동풍전 3회 · 반장전 5회) 내 화료는 언제나 오야 점수(약 1.5배)로 계산되고, 역패 '동'이 **하나 더 붙는다**. 내가 화료하면 다음 국의 오야가 내 자리로 온다.",
  detail:
    "원래 자풍은 그대로 두고 역패만 늘어난다 — 동 커쯔에 1판이 붙고, 장풍이 동인 국이면 더블동(2판)이 된다. 자풍이 이미 동인 동가에게는 더 붙지 않는다.\n\n내가 화료하면 다음 국 오야가 내 자리로 온다(연장). 내가 진짜 오야인 국의 화료는 원래 규칙대로라 연장 횟수를 쓰지 않는다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, maxKeeps(state) - counterOf(state, keepsKey(holder))),
      total: maxKeeps(state),
    }));

    // 1) 보유자의 화료를 오야로 채점
    engine.rules.addModifier<boolean>("win.treatAsDealer", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => (rctx.playerId === holder ? true : cur),
    });

    // 2) 역패 '동'을 하나 더 얹는다 — 자풍은 실제 자리 그대로다(교체가 아니라 추가).
    const yaku = ctx.yaku;
    if (yaku !== undefined) {
      if (yaku.get(EAST_YAKU) === undefined) {
        const holders = yakuHolders(yaku, EAST_YAKU);
        yaku.register({
          source: ctx.instanceId,
          id: EAST_YAKU,
          name: "역패 동",
          closedHan: 1,
          openHan: 1,
          check: (variant, wctx) =>
            wctx.winnerId !== undefined &&
            holders.has(wctx.winnerId) &&
            // 자풍이 이미 동이면 표준 자풍패가 이미 1판을 준다 — 두 번 주지 않는다.
            wctx.seatWind !== EAST &&
            hasEastTriplet(variant),
        });
      }
      addYakuHolder(ctx, yaku, EAST_YAKU);
    }

    // 3) 내가 화료하면 연장 — 단, 매치 예산(동풍전 3 · 반장전 5)까지
    engine.rules.addModifier<boolean>("round.keepDealer", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return counterOf(state, keepsKey(holder)) < maxKeeps(state) ? true : cur;
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
      /*
       * ⚠ 예전에는 "더블론 등으로 진짜 오야도 함께 화료했다면 그것도 원래 연장"이라며
       * 여기서 빠져나갔다. 그건 틀렸다 — 진짜 오야가 함께 올라도 `keepDealerSeat`에는
       * **보유자 자리**가 박혀 다음 국 오야가 내 쪽으로 옮겨 온다(standardActions).
       * 능력은 실제로 일했는데 표식이 안 남아 카운터가 오르지 않았고, 그 결과
       * **매치 연장 한도를 우회**했다(QA score-a 확정 4). 예외 문구가 가리키는 것은
       * "내가 진짜 오야인 국"뿐이며 그건 바로 위 줄이 이미 걸러 낸다.
       */
      // 오야 자리가 **내 자리로 옮겨 왔는가** (payload.dealerSeat = 다음 국의 오야 자리)
      if (p.dealerSeat !== holderSeat) return event;
      if (counterOf(ic.state, keepsKey(holder)) >= maxKeeps(ic.state)) return event;
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
    });

    /*
     * 남은 연장 횟수를 **전원 공개 채널에 상시** 싣는다.
     *
     * detail이 "남은 횟수는 전원에게 보인다"고 약속하는데, 실제로는 `publishUsesLeft`의
     * 보유자 전용 채널(view:{holder}:uses:…)뿐이었고 공개 채널은 **연장이 실제로 일어난
     * 국에만** 한 줄 발행됐다(QA text 확정 29). 상대에게 이 숫자는 "지금 이 사람을
     * 떨어뜨려야 하는가"를 가르는 판단 재료다.
     *
     * 갱신 시점은 publishUsesLeft와 같은 규약 — 모든 이벤트에 걸되 값이 달라질 때만
     * 발행하므로 연쇄는 한 겹에서 멈춘다.
     */
    const publicKey = viewKey("*", `${ID}:${holder}`);
    ctx.reaction("*", (_event, rc) => {
      const left = Math.max(0, maxKeeps(rc.state) - counterOf(rc.state, keepsKey(holder)));
      const label = `연장 (남은 ${left}회)`;
      if (rc.state.augmentData[publicKey] === label) return;
      rc.emit(augmentDataSet(publicKey, label));
    });
  },
});
