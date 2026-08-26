/**
 * 역만 방어술 (yakuman_shield) — 역만은 **완전 면역**, 배만·삼배만은 **절반만** 맞는다.
 * 횟수 제한 없음.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b D (52차 버프) → 2026-07-26 재조정 → 2026-08-26 이중 방어
 *
 * 52차엔 "하네만 이상 · 게임당 2회"였다. 2026-07-26에 이름 그대로 **역만 전용**으로
 * 좁히는 대신 횟수 제한을 없앴는데, 그러자 카드가 **거의 발동하지 않았다** — 측정
 * 1,496화료 중 역만이 0회다. 그래서 2026-08-26에 층을 하나 더 둔다:
 *
 * - **역만 · 셈수역만 · 유국역만** — 완전 면역(손실 0). 종전과 같다.
 * - **배만 · 삼배만** — 내가 그 화료에 낸 몫의 **절반**만 돌려받는다(100점 단위 내림).
 * - **하네만 이하** — 그대로 맞는다.
 *
 * 절반 환급을 «내가 낸 몫»에서 재는 것이 중요하다. 손실(deltas) 절반으로 재면 같은
 * 국에 함께 난 평범한 화료·본장·공탁까지 절반이 되어 카드가 약속하지 않은 일을 한다.
 *
 * 방어가 발동하면 **보유자가 그 역만에 낸 몫 전액**(론이면 직격분, 쯔모면 분담분)을
 * 돌려받는다. 표준 분담(`winInfo.payments`)에는 본장·공탁이 없으므로 그 부담은 남는다 —
 * 설명도 그렇게 적혀 있다. 화료 총액(`Σ points`)을 상한으로 쓰던 시절에는 쯔모에서
 * 상한이 한 번도 물리지 않아 본장까지 환급됐다(QA defcall 확정 2). 환급분은 그
 * 화료자(들)의 이득에서 (이득 한도까지) 차감하고, 부족분은 뱅크에서 발행한다 —
 * 화료자가 마이너스로 떨어지지 않으면서 보유자는 역만 피해에서 벗어난다.
 *
 * 막아낸 역만 수는 전원 공개 뷰 채널(view:*:yakuman_shield:{holder})에 실어
 * "저 사람한테 역만이 안 통한다"가 테이블에 보이게 한다.
 *
 * 구현 메모: 인터셉터는 이벤트를 고칠 수만 있고 새 이벤트를 낼 수 없다. 그래서
 * 발동 시 payload에 표식(shieldedBy)을 남기고, 같은 ROUND_SETTLED의 리액션이
 * 그 표식을 보고 사용 횟수·공개 뷰를 갱신한다 (리플레이에서도 결정적).
 *
 * 유국역만(nagashi_yakuman)은 outcome=draw라 이 인터셉터가 잡지 못하므로,
 * nagashi 쪽에서 방어막 보유자에게는 지불을 부과하지 않도록 연동한다. 그쪽 면제분은
 * **전액 뱅크가 낸다**(화료자 수령은 줄지 않는다) — 화료 방어와 재원이 다르므로 detail에
 * 따로 적었다. 표식이 남지 않는 경로라 아래 리액션이 `drawSpecial`을 직접 보고
 * 막아낸 횟수를 센다.
 */

import {
  ROUND_SETTLED,
  SETTLE_STAGE,
  augmentDataSet,
  augmentInstanceId,
  defineAugment,
  isSourceDisarmed,
} from "@majak/core";
import type {
  AugmentDef,
  PlayerId,
  RoundSettledPayload,
  WinInfo,
} from "@majak/core";
import {
  counterOf,
  settleInterceptor,
  viewKey,
  withAugPoint,
} from "../util.js";
import { scapegoatTargetOf } from "./scapegoat.js";

const ID = "yakuman_shield";
/** 지불을 한 사람에게 몰아주는 재배선 — 쯔모 환급 상한이 이걸 봐야 한다 (아래 paidFor) */
const SCAPEGOAT = "scapegoat";
/** 게임 단위 누적 방어 횟수 (roundKey를 섞지 않는다 — 게임 내내 누적) */
const usedKey = (h: PlayerId): string => `${ID}:used:${h}`;
/** 전원 공개: 지금까지 막아낸 역만 수 */
const shieldViewKey = (h: PlayerId): string => viewKey("*", `${ID}:${h}`);

/** 이 payload가 이번 정산에서 방어를 발동한 보유자 목록 */
interface ShieldMark {
  shieldedBy?: PlayerId[];
}

/** 완전 면역 대상인가 — 역만(셈수역만·다중역만 포함) */
function isYakuman(w: WinInfo): boolean {
  if (w.yakumanCount > 0) return true;
  return w.limit === "kazoe_yakuman" || w.limit === "yakuman";
}

/** 절반 방어 대상인가 — 배만·삼배만 (하네만 이하는 그대로 맞는다) */
function isHalfShielded(w: WinInfo): boolean {
  return w.limit === "baiman" || w.limit === "sanbaiman";
}

/** 절반 환급은 100점 단위로 내린다 — 점수는 100점 격자 위에 있고, 내림은 보유자에게 불리한 쪽이다. */
const halfOf = (paid: number): number => Math.floor(paid / 2 / 100) * 100;

export const yakumanShield: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "defense",
  complexity: 3,
  name: "역만 방어술",
  description:
    "(상시 · 횟수 제한 없음) 역만(유국역만 포함) 피해를 막고, 배만·삼배만은 절반만 맞는다 — 내가 낸 몫이 그만큼 돌아온다. 본장·공탁 부담은 그대로 낸다.",
  detail:
    "(상시 · 횟수 제한 없음) **역만·셈수역만·유국역만**은 내가 낸 몫이 전액 돌아와 손실이 0이 된다. **배만·삼배만**은 내가 낸 몫의 절반이 돌아온다(100점 단위 내림). **하네만 이하**에는 발동하지 않는다. 직격(론)이면 내가 문 화료점, 쯔모면 내 분담분이 기준이다. 환급된 만큼 화료자의 획득이 줄고 모자란 몫은 뱅크가 낸다. 유국역만만은 화료자의 수령액이 줄지 않는다.",
  install(ctx) {
    const { holder } = ctx;

    // 정산 단계: Shield — 반드시 마지막 — 재배선·배수·가산이 전부 끝난 **최종 손실**을 보고 막는다.
    // 예전엔 tier(gold)가 책임전가(prism)보다 앞이라 아직 손실이 0인 시점에 돌아
    // "역만 완전 면역"이 한 번도 발동하지 않았다(60차 수정).
    settleInterceptor(ctx, SETTLE_STAGE.Shield, (event, ic) => {
      const p = event.payload as RoundSettledPayload & ShieldMark;
      if (p.outcome !== "win" || p.winInfos === undefined) return event;
      const loss = p.deltas[holder] ?? 0;
      if (loss >= 0) return event;

      // 방어 대상 화료 건 전부 (자기 화료는 제외 — 잃는 쪽일 때만 발동).
      //
      // ⚠ 예전엔 `find`로 **첫 한 건만** 잡았다. 그래서 더블론으로 역만이 둘 떨어지면
      // 두 번째 역만은 상한에 아예 안 들어가 그대로 얻어맞았다 — "역만 완전 면역"이
      // 더블론에서만 조용히 거짓이 됐다.
      const yakumanWins = p.winInfos.filter((w) => isYakuman(w) && w.winner !== holder);
      const halfWins = p.winInfos.filter((w) => isHalfShielded(w) && w.winner !== holder);
      const bigWins = [...yakumanWins, ...halfWins];
      if (bigWins.length === 0) return event;

      // 손실 전액 환급 → 보유자 손실 0. 환급분은 화료자 이득 한도까지 차감하고,
      // 부족분은 뱅크가 발행한다(제로섬 불변식은 아니다 — 프로젝트 허용).
      //
      // 환급 상한은 **보유자가 그 역만들에 실제로 낸 몫**이다. 예전에는 그 국의 합산
      // 손실(deltas) 전액을 되돌려, 더블론에서 함께 난 평범한 화료(3900)까지
      // 무효화됐다(docs/25 국면 #4). 그 수정이 상한을 `Σ w.points`(화료 총액)로 잡는
      // 바람에 이번엔 **쯔모에서 상한이 한 번도 물리지 않았다** — 보유자 몫은 총액의
      // 1/3~1/2뿐이라 상한이 늘 손실보다 커서 `refund = -loss`, 즉 본장 부담까지
      // 통째로 환급됐다(QA defcall 확정 2). 론 직격에서만 detail대로 본장이 남았다.
      //
      // 그래서 화료 총액이 아니라 **내 지불 분담**을 센다. `payments`는 본장·공탁을
      // 뺀 표준 분담이라 그 둘은 자연히 상한 밖에 남는다.
      const holderSeat = ic.state.players.find((pl) => pl.id === holder)?.seat;
      const dealerSeat = ic.state.round.dealerSeat;
      const paidFor = (w: WinInfo): number => {
        // 론 — 한 사람이 손 전액을 문다. **누가 무는지는 보지 않는다**: 책임전가·
        // 눈먼 총알이 그 지불을 나에게 돌렸어도 역만 피해인 것은 같다. 상한은
        // 본장을 뺀 화료점이므로 detail대로 본장 몫만 남는다.
        if (w.winType === "ron") return Math.max(0, w.payments?.discarder ?? w.points);
        // 쯔모 — 내 분담분만. 오야 취급 화료(payments.dealer 없음)면 셋이 똑같이 낸다.
        // 여기서 화료 총액(Σ points)을 쓰면 상한이 손실보다 늘 커서 본장까지 환급된다.
        // 파오 책임자로 떠안은 몫도 그 역만 때문에 낸 돈이다 — 표준 분담과 합친다
        // (겹쳐서 넘쳐도 `min(-loss, cap)`이 잘라 준다).
        const paoShare = w.pao?.responsible === holder ? w.pao.points : 0;
        if (holderSeat === undefined) return paoShare;
        /*
         * ⚠ **재배선으로 나에게 몰린 몫도 그 역만 때문에 낸 돈이다.**
         *
         * 론 분기는 위에서 이미 "누가 무는지는 보지 않는다"고 적어 두었는데, 쯔모
         * 분기만 표준 분담(`payments.others`)을 상한으로 삼고 있었다. 그래서 덤터기가
         * 셋의 지불을 나 하나에게 몰아준 96,000 역만 쯔모에서 방어막이 32,000만
         * 돌려주고 **64,000이 그대로 남았다** — 25,000 시작 판이면 즉사인데, 화면에는
         * 방어 카운터가 +1 되어 "막았다"고 찍혔다(2026-08-23 QA synergy3 disrupt 확정 1).
         * 같은 96,000을 론으로 맞으면 0이 되는 것과 앞뒤가 맞지 않았다.
         *
         * 덤터기 표식이 그 화료자에게서 나를 가리키면 상한을 그 손의 **지불 총액**으로
         * 올린다. 본장·공탁은 `payments`(=`points`)에 없으므로 detail대로 그대로 남는다.
         * 잠긴(무장해제된) 덤터기는 재배선 자체를 하지 않으니 표식도 무시한다.
         */
        const marker = ic.state.players.find(
          (pl) =>
            pl.id !== holder &&
            pl.augments.includes(SCAPEGOAT) &&
            !isSourceDisarmed(ic.state, augmentInstanceId(pl.id, SCAPEGOAT)) &&
            scapegoatTargetOf(ic.state, pl.id) === holder,
        );
        if (marker !== undefined && marker.id === w.winner) {
          return w.points + paoShare;
        }
        const share =
          w.payments?.dealer !== undefined && holderSeat === dealerSeat
            ? w.payments.dealer
            : (w.payments?.others ?? w.points);
        return Math.max(0, share) + paoShare;
      };
      /*
       * 두 층을 **따로** 잰다.
       *
       * 역만은 내가 낸 몫 전액까지, 배만·삼배만은 그 절반까지다. 절반을 «남은 손실의
       * 절반»으로 재면 같은 국에 함께 난 평범한 화료나 본장·공탁까지 절반이 되어
       * 설명이 약속하지 않은 것을 깎는다. 그래서 화료 건마다 «내가 낸 몫»을 먼저
       * 재고 그 절반을 상한으로 쓴다.
       */
      const yakumanCap = yakumanWins.reduce((sum, w) => sum + paidFor(w), 0);
      const yakumanRefund = Math.min(-loss, yakumanCap);
      const halfCap = halfWins.reduce((sum, w) => sum + halfOf(paidFor(w)), 0);
      const halfRefund = Math.min(-loss - yakumanRefund, halfCap);
      const refund = yakumanRefund + halfRefund;
      if (refund <= 0) return event;

      // 차감은 역만 화료자들에게 **이득이 큰 쪽부터** 결정적으로 나눠 문다
      // (동점이면 winner id 순 — 리플레이에서 같은 결과가 나와야 한다).
      const deltas = { ...p.deltas };
      const order = [...bigWins].sort((a, b) => {
        const ga = p.deltas[a.winner] ?? 0;
        const gb = p.deltas[b.winner] ?? 0;
        return gb - ga || (a.winner < b.winner ? -1 : a.winner > b.winner ? 1 : 0);
      });
      let rest = refund;
      for (const w of order) {
        if (rest <= 0) break;
        const gain = deltas[w.winner] ?? 0;
        const deduct = Math.min(rest, Math.max(0, gain));
        deltas[w.winner] = gain - deduct;
        rest -= deduct;
      }
      // 역만만 맞은 국이면 여기서 정확히 0이 된다. 배만·삼배만이 섞이면 절반이 남는다.
      deltas[holder] = (deltas[holder] ?? 0) + refund;
      return {
        type: event.type,
        payload: {
          ...p,
          deltas,
          augPoints: withAugPoint(p, ctx, refund),
          shieldedBy: [...(p.shieldedBy ?? []), holder],
        },
      };
    });

    // 발동했으면 누적 방어 횟수를 올리고 전원에게 공개한다.
    //
    // 유국역만(outcome=draw)은 위 인터셉터가 잡지 않는다 — nagashi_yakuman 쪽이 방어막
    // 보유자를 **지불 목록에서 건너뛰는** 방식이라 `shieldedBy` 표식이 남지 않았고,
    // 그래서 막아 내고도 카운터와 공개 채널이 그대로였다(QA defcall 확정 3).
    // description이 "막아낸 횟수는 전원에게 보인다"고 약속하므로 여기서 함께 센다.
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload & ShieldMark;
      const nagashiBlocked =
        p.outcome === "draw" &&
        p.drawSpecial?.augId === "nagashi_yakuman" &&
        p.drawSpecial.holder !== undefined &&
        p.drawSpecial.holder !== holder;
      if (!(p.shieldedBy ?? []).includes(holder) && !nagashiBlocked) return;
      const used = counterOf(rc.state, usedKey(holder)) + 1;
      rc.emit(augmentDataSet(usedKey(holder), used));
      rc.emit(augmentDataSet(shieldViewKey(holder), used));
    });
  },
});
