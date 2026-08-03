/**
 * 유국역만 (nagashi_yakuman, prism).
 * 유국(황패평국) 시, 자신의 버림패가 전부 요구패(1·9 수패)나 자패라면 —
 * 본래 "유국만관(流し満貫)"인 이 손을 역만으로 처리한다.
 * 쯔모 역만과 같은 지불(오야 48000 / 자 32000)을 판이 아니라 실제 상대에게서 받는다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b D (52차 버프)
 *
 * ## 이 증강이 부수는 규칙은 정확히 하나 — "울리면 무효"
 *
 * 정통 유국만관은 두 가지를 함께 요구한다.
 *   ① 내 버림이 **전부** 요구패·자패일 것
 *   ② 그 버림을 **아무도 울지 않았을** 것
 *
 * 이 증강은 ②만 없앤다. 상대가 내 요구패를 울어 가도 유국역만은 살아 있다 —
 * 원래는 그 순간 무효가 되어 사실상 장식이었던 손을 실제로 성립시킨다.
 * ①은 그대로다. 요구패가 아닌 패를 한 장이라도 버렸으면 성립하지 않는다.
 *
 * ## 판정은 바닥이 아니라 **버림 이력**으로 한다 (2026-08-03 사용자 확정)
 *
 * 바닥에 남은 패만 보면 규칙이 거꾸로 선다. 5통을 버렸는데 상대가 그걸 울어 가면
 * 5통이 바닥에서 사라져, 남은 버림이 전부 요구패라는 이유로 **없던 역만이 생겼다**.
 * 보유자가 잡패를 일부러 울리기 쉽게 흘리는 것이 최적 전략이 되고, 상대의 정상적인
 * 후로가 자기 자신에게 -16000을 만드는 구조였다(docs/25 역/점수 #13).
 *
 * `round.byPlayer[x].discardedKinds`는 버림 시점의 스냅샷이라 울려 나가도 남는다 —
 * 후리텐 판정이 쓰는 바로 그 이력이다. 이것으로 ①을 판정하면 "무엇을 버렸는가"가
 * 울림 여부와 무관해지고, 이 증강이 부수는 것은 ②뿐이 된다.
 *
 * 구현:
 * - ROUND_SETTLED(outcome=draw) 인터셉터: 유효하면 쯔모 역만 지불을 deltas에 더한다.
 *   노텐 벌점 정산 위에 얹으므로(둘 다 적용) 여러 명이 동시에 유국역만이어도 안전하다.
 * - 역만 방어술(yakuman_shield) 보유자는 이 지불에서 면제된다(완전 면역 연동).
 *   유국은 outcome=draw라 방어술 인터셉터가 잡지 못하므로 여기서 연동한다.
 */

import {
  ROUND_SETTLED,
  SETTLE_STAGE,
  augmentInstanceId,
  defineAugment,
  isSourceDisarmed,
  isTerminalOrHonor,
  playerOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileKind,
} from "@majak/core";
import { settleInterceptor } from "../util.js";

const ID = "nagashi_yakuman";

/**
 * `discardedKinds`의 kindKey("man1"·"wind3")를 TileKind로 되돌린다.
 * 이력은 문자열 스냅샷이라 tileId가 없다 — 종류만 알면 요구패 판정에는 충분하다.
 */
function kindFromKey(key: string): TileKind {
  const m = /^([a-z]+)(\d+)$/.exec(key);
  if (m === null) return { suit: "man", rank: 5 }; // 파싱 실패 = 요구패 아님으로 취급
  return { suit: m[1] as TileKind["suit"], rank: Number(m[2]) };
}

/**
 * 유국역만 성립 여부 — **버린 이력 전체**가 요구패·자패이고 하나 이상.
 *
 * 바닥(zones)이 아니라 이력(discardedKinds)을 보는 것이 핵심이다. 울려 나간 패도
 * "내가 버린 패"이므로 판정에 포함된다 — 이 증강이 없애 주는 것은 "울리면 무효"라는
 * 제약이지, "무엇을 버렸는가"가 아니다.
 */
function nagashiValid(state: GameState, holder: PlayerId): boolean {
  const history = state.round.byPlayer[holder]?.discardedKinds ?? [];
  if (history.length === 0) return false;
  return history.every((key) => isTerminalOrHonor(kindFromKey(key)));
}

export const nagashiYakuman: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  name: "유국역만",
  description:
    "(상시) 유국까지 요구패(1·9)와 자패만 버렸다면 유국만관이 역만이 된다. 원래는 그 버림패를 남이 울어 가면 무효가 되지만, 이 증강은 울려도 성립한다.",
  detail:
    "(상시) 황패유국 시, 그 국에 내가 버린 패가 **한 장도 빠짐없이** 요구패(1·9 수패)나 자패(풍패·삼원패)이면 유국만관이 역만으로 격상된다.\n\n" +
    "이 증강이 바꾸는 것은 딱 하나 — **울림에 의한 무효화**다. 정통 규칙에서는 내 버림패를 누군가 치·펑·깡으로 가져가는 순간 유국만관이 사라지지만, 이 증강이 있으면 몇 번을 울려 가도 그대로 성립한다.\n\n" +
    "바꾸지 않는 것도 분명하다. 판정은 **내가 버린 모든 패**를 대상으로 하며, 울려 나가 바닥에 남지 않은 패도 그대로 센다. 따라서 요구패가 아닌 패를 한 장이라도 버렸다면 그 패가 울려 나갔더라도 성립하지 않는다.\n\n" +
    "지불은 쯔모 역만과 같아 오야면 각 16000점, 자면 오야에게 16000점·자에게 8000점씩 받는다. 노텐 벌점과는 별개로 함께 정산되며, 버림패가 하나도 없으면 성립하지 않는다.",
  install(ctx) {
    const { holder } = ctx;

    // 유국 정산: 성립 시 쯔모 역만 지불을 얹는다
    // 정산 단계: DrawPatch — 유국 전용 재정산.
    settleInterceptor(ctx, SETTLE_STAGE.DrawPatch, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "draw") return event;
      if (!nagashiValid(ic.state, holder)) return event;

      const dealerSeat = ic.state.round.dealerSeat;
      const holderIsDealer = playerOf(ic.state, holder).seat === dealerSeat;
      const deltas = { ...p.deltas };
      for (const pl of ic.state.players) {
        if (pl.id === holder) continue;
        // 역만 방어술 보유자는 유국역만 지불에서 면제된다 (완전 면역 연동).
        // 단 **무장해제로 잠긴 방어막은 면제하지 않는다** — 보유 문자열만 보면 잠긴
        // 방어막까지 공짜로 막아 줬다(2026-07-29 감사).
        if (
          pl.augments.includes("yakuman_shield") &&
          !isSourceDisarmed(ic.state, augmentInstanceId(pl.id, "yakuman_shield"))
        ) {
          continue;
        }
        // 쯔모 역만: 오야 화료 = 전원 16000 / 자 화료 = 오야 16000·자 8000
        const pay = holderIsDealer ? 16000 : pl.seat === dealerSeat ? 16000 : 8000;
        deltas[pl.id] = (deltas[pl.id] ?? 0) - pay;
        deltas[holder] = (deltas[holder] ?? 0) + pay;
      }
      return { type: event.type, payload: { ...p, deltas } };
    });
  },
});
