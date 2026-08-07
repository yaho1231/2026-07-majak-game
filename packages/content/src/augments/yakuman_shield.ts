/**
 * 역만 방어술 (yakuman_shield) — 역만 피해에 **완전 면역**. 횟수 제한 없음.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b D (52차 버프) → 2026-07-26 재조정
 *
 * 52차엔 "하네만 이상 · 게임당 2회"였다. 이제 이름 그대로 **역만 전용**으로 좁히는 대신
 * **횟수 제한을 없앤다** — 역만(셈수역만 포함)과 유국역만 피해는 몇 번이 오든 전부 0이 된다.
 * 하네만·배만·삼배만은 더 이상 막지 않는다.
 *
 * 방어가 발동하면 **역만 화료분(winInfo.points) 전액**을 돌려받는다. 본장·공탁은
 * points에 없으므로 그 부담은 남는다 — 설명도 그렇게 적혀 있다. 환급분은 그
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
 * nagashi 쪽에서 방어막 보유자에게는 지불을 부과하지 않도록 연동한다.
 */

import {
  ROUND_SETTLED,
  SETTLE_STAGE,
  augmentDataSet,
  defineAugment,
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

const ID = "yakuman_shield";
/** 게임 단위 누적 방어 횟수 (roundKey를 섞지 않는다 — 게임 내내 누적) */
const usedKey = (h: PlayerId): string => `${ID}:used:${h}`;
/** 전원 공개: 지금까지 막아낸 역만 수 */
const shieldViewKey = (h: PlayerId): string => viewKey("*", `${ID}:${h}`);

/** 이 payload가 이번 정산에서 방어를 발동한 보유자 목록 */
interface ShieldMark {
  shieldedBy?: PlayerId[];
}

/** 역만인가 (셈수역만·다중역만 포함. 하네만~삼배만은 대상이 아니다) */
function isYakuman(w: WinInfo): boolean {
  if (w.yakumanCount > 0) return true;
  return w.limit === "kazoe_yakuman" || w.limit === "yakuman";
}

export const yakumanShield: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "defense",
  name: "역만 방어술",
  description:
    "(상시 · 횟수 제한 없음) 역만(유국역만 포함) 피해를 막는다 — 역만 화료분을 전액 돌려받고 그만큼 화료자의 이득이 줄어든다. 본장·공탁 부담은 그대로 낸다. 막아낸 횟수는 전원에게 보인다.",
  detail:
    "(상시 · 횟수 제한 없음) 역만·셈수역만으로 점수를 잃을 때 **그 역만 화료의 점수만큼** 돌려받는다. 더블론으로 역만이 둘 떨어지면 둘의 합만큼 돌려받는다.\n\n돌려받는 상한이 역만 화료 점수라, 본장(1본당 300)과 공탁 부담은 환급 대상이 아니다 — 2본장 역만 직격이면 손실이 0이 아니라 600 남는다. 역만을 막는 능력이지 본장을 막는 능력이 아니다.\n\n환급된 만큼 화료자의 획득이 줄어들고 모자란 몫은 뱅크가 내므로 화료자가 마이너스로 떨어지지는 않는다. 몇 번이 오든 전부 막지만 하네만·배만·삼배만은 막지 않으며, 유국역만도 막되 자신이 화료하는 경우에는 관여하지 않는다.",
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

      // 역만 화료 건 전부 (자기 화료는 제외 — 잃는 쪽일 때만 발동).
      //
      // ⚠ 예전엔 `find`로 **첫 한 건만** 잡았다. 그래서 더블론으로 역만이 둘 떨어지면
      // 두 번째 역만은 상한에 아예 안 들어가 그대로 얻어맞았다 — "역만 완전 면역"이
      // 더블론에서만 조용히 거짓이 됐다.
      const bigWins = p.winInfos.filter((w) => isYakuman(w) && w.winner !== holder);
      if (bigWins.length === 0) return event;

      // 손실 전액 환급 → 보유자 손실 0. 환급분은 화료자 이득 한도까지 차감하고,
      // 부족분은 뱅크가 발행한다(제로섬 불변식은 아니다 — 프로젝트 허용).
      // 환급 상한은 **역만 화료들의 값 합**이다. 예전에는 그 국의 합산 손실(deltas)
      // 전액을 되돌려, 더블론에서 함께 난 평범한 화료(3900)까지 무효화되고 다른
      // 증강이 뜯어간 이동액도 함께 환급됐다(docs/25 국면 #4).
      // points는 본장·공탁을 제외한 화료 획득점이다. 본장 부담까지 막을 필요는
      // 없으므로(역만을 막는 능력이지 본장을 막는 능력이 아니다) 그대로 상한으로 쓴다 —
      // 설명도 "역만 화료분 전액"이라고 적어 본장·공탁이 남는다는 사실을 밝힌다.
      const cap = bigWins.reduce((sum, w) => sum + w.points, 0);
      const refund = Math.min(-loss, cap);

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
      deltas[holder] = (deltas[holder] ?? 0) + refund; // = 0
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

    // 발동했으면 누적 방어 횟수를 올리고 전원에게 공개한다
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload & ShieldMark;
      if (!(p.shieldedBy ?? []).includes(holder)) return;
      const used = counterOf(rc.state, usedKey(holder)) + 1;
      rc.emit(augmentDataSet(usedKey(holder), used));
      rc.emit(augmentDataSet(shieldViewKey(holder), used));
    });
  },
});
