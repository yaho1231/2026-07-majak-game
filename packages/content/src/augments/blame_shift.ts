/**
 * 책임전가 (blame_shift, prism) — "방총의 책임을 셋으로 흩는다".
 *
 * 보유자가 **론으로 화료**하면 그 지불이 쏜 한 사람에게 몰리지 않고 **세 명(나 제외
 * 전원)에게 쯔모처럼 3분할**된다.
 *
 * 2026-08-27 (사용자 지시, 밸런스 웨이브): 여기에 **론 화료 +2판**을 얹었다. 예전에는
 * 지불자만 재배선할 뿐 보유자의 순이득이 정확히 0이라, 카드를 뽑아도 내 점수가 한 푼도
 * 움직이지 않았다 — "누가 무느냐"만 바뀌는 카드는 뽑는 사람에게 보상이 없다. 거울상인
 * 덤터기(`scapegoat`)의 **쯔모 +2판**과 대칭을 이룬다. 쯔모 화료에는 붙지 않는다.
 *
 * 구현: 순수 패시브 인터셉터. 액티브 버튼·클라 배선 없음(발동은 론 그 자체).
 * - `ROUND_SETTLED` 인터셉터에서 보유자의 론 WinInfo를 찾고, 쏜 사람(from)의 지불
 *   음수 delta를 세 사람에게 고르게 나눈다(덤터기 `scapegoat`의 지불 재배선 계열,
 *   총액 불변). 쯔모 화료는 이미 분담이라 관여하지 않는다.
 * - 다중 화료(더블 론)에서 보유자가 화료자 중 하나면 보유자 몫에만 적용한다.
 * - 100점 단위를 유지하되 합은 정확히 보존한다(나머지는 원래 쏜 사람이 흡수 —
 *   "시작한 사람"이 끝수까지 진다).
 */

import { defineAugment, ROUND_SETTLED, SETTLE_STAGE } from "@majak/core";
import type { AugmentDef, PlayerId, RoundSettledPayload } from "@majak/core";
import { addWinHanBonus, settleInterceptor, withAugNoteFor } from "../util.js";

const ID = "blame_shift";
/** 론 화료에 얹히는 판수 (2026-08-27 사용자 지시 — 덤터기의 쯔모 +2판과 대칭) */
const RON_BONUS_HAN = 2;

/** total(양수)을 n명에게 100점 단위로 최대한 고르게 나눈다. 합은 정확히 total.
 *  마지막 몫이 나머지를 흡수한다(호출부에서 쏜 사람을 마지막에 둔다). */
function splitEvenly(total: number, n: number): number[] {
  /*
   * ⚠ `Math.round`가 아니라 **내림**이어야 한다. 올림이 나오는 금액(8000/3 = 2666.7 →
   * 2700)에서는 앞의 두 사람이 2,700씩 내고 **마지막(=쏜 사람)이 2,600**만 내서,
   * "끝수는 시작한 사람이 흡수한다"는 주석·카드 문구가 정확히 뒤집혔다 — 결과 화면에
   * 방총한 사람이 테이블에서 가장 적게 내는 줄이 섰다(2026-08-22 QA aug-1 확정 2).
   * 내림이면 나머지는 언제나 마지막 몫으로 몰린다.
   */
  const per = Math.floor(total / n / 100) * 100;
  const out: number[] = [];
  let assigned = 0;
  for (let i = 0; i < n - 1; i++) {
    out.push(per);
    assigned += per;
  }
  out.push(total - assigned); // 마지막이 끝수 흡수
  return out;
}

/** 그 화료 때문에 쏜 사람이 무는 금액 (파오분은 책임자가 따로 문다) */
function owedToMe(info: {
  points: number;
  honbaBonus?: number;
  pao?: { points: number } | null;
}): number {
  return info.points + (info.honbaBonus ?? 0) - (info.pao?.points ?? 0);
}

/** 지불을 나눠 질 사람들 — 화료자는 빼고, 끝수를 흡수할 쏜 사람을 마지막에 둔다. */
function losersFor(
  p: RoundSettledPayload,
  players: readonly { id: PlayerId }[],
  discarder: PlayerId,
): PlayerId[] {
  const winners = new Set((p.winInfos ?? []).map((w) => w.winner));
  return [
    ...players
      .map((pl) => pl.id)
      .filter((id) => !winners.has(id) && id !== discarder),
    discarder,
  ];
}

export const blameShift: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 2,
  name: "책임전가",
  description:
    "(상시) 내가 론으로 화료하면 **+2판**을 얻고, 그 지불이 쏜 사람 혼자가 아니라 세 명에게 쯔모처럼 분담된다.",
  detail:
    "판수를 빼면 내가 받는 총액은 변하지 않고 지불자만 분산된다. 더블론이면 화료자를 뺀 나머지끼리 나누므로 3분할이 아니라 2분할이 된다.\n\n쯔모 화료에는 판수도 붙지 않고 분담도 이미 되어 있어 관여하지 않으며(역만에는 판수가 얹히지 않는다), 100점 단위로 떨어지지 않는 끝수는 원래 쏜 사람이 흡수한다.",
  install(ctx) {
    const { holder } = ctx;

    /*
     * 론 화료에 +2판. 화료 유형은 **내 WinInfo**로 본다 — 더블론에서 남이 론했다고
     * 내 쯔모에 붙으면 안 되고, 반대로 내가 론한 국에 남이 쯔모할 수는 없다.
     * (`addWinHanBonus`는 역만에서 자동으로 무시된다.)
     */
    addWinHanBonus(ctx, (_state, info) =>
      info.winType === "ron" ? RON_BONUS_HAN : 0,
    );

    /*
     * 정산 단계: Redistribute — 지불자만 재배선한다 — 총액·홀더 수령액 불변. 재분배가
     * 방어(Shield)보다 먼저 돌아야 역만 방어술이 "새로 부과된 지불"까지 보고 막을 수 있다.
     */
    settleInterceptor(ctx, SETTLE_STAGE.Redistribute, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return event;
      const info = (p.winInfos ?? []).find(
        (w) => w.winner === holder && w.winType === "ron" && w.from !== null,
      );
      if (info === undefined || info.from === null) return event;
      const discarder = info.from;

      /*
       * 재분배 대상은 **내 화료에 대한 지불분만**이다 — 그 값은 `deltas`가 아니라
       * **내 WinInfo**에서 직접 센다.
       *
       * 예전에는 `-deltas[discarder] - Σ(다른 화료자 points)`로 역산했는데 두 곳에서 틀렸다
       * (QA score-b 확정 1·2):
       *   ① **본장은 첫 화료자 한 사람만** 받는다(standardActions `i === 0`). 내가 둘째
       *      화료자면 남의 본장 가산분이 통째로 내 `owed`에 섞여, 무관한 사람이 남의
       *      연장료를 대신 물었다.
       *   ② 두 사람이 이 증강을 들고 더블론하면 **뒤에 도는 인터셉터가 이미 재배선된
       *      deltas**를 원본으로 읽어 자기 몫을 과소 계산했다(방총자 과부담).
       * WinInfo에서 재는 값은 다른 인터셉터의 영향을 받지 않으므로 둘 다 사라진다.
       * 파오분은 책임자가 따로 무는 돈이라(방총자가 내지 않는다) 빼 둔다.
       */
      /*
       * **지금 그가 실제로 무는 것보다 많이 되돌려 줄 수는 없다** (2026-08-23 QA
       * synergy3 score 확정 1). 같은 `Redistribute` 단계의 눈먼 총알이 먼저 돌아
       * 지불을 통째로 다른 사람에게 옮겨 놓으면, WinInfo의 원본 금액을 그대로
       * 원상복구하는 순간 **쏜 사람이 흑자가 된다.**
       */
      const owed = Math.min(
        owedToMe(info),
        Math.max(0, -(p.deltas[discarder] ?? 0)),
      );
      if (owed <= 0) return event;

      const losers = losersFor(p, ic.state.players, discarder);
      if (losers.length === 0) return event;

      const shares = splitEvenly(owed, losers.length);
      const deltas = { ...p.deltas };
      // 쏜 사람의 기존 지불을 원상복구한 뒤, 세 명에게 새 몫을 부과한다.
      deltas[discarder] = (deltas[discarder] ?? 0) + owed;
      // 총액도 내 수령액도 그대로라 `withAugPoint`에는 남길 것이 없지만, **지불자들의
      // 줄에는 근거가 있어야 한다** — 쏘지도 화료하지도 않은 두 사람이 점수를 잃는데
      // 결과 화면 어디에도 이유가 없었다.
      let notes = p.augPoints ?? [];
      notes = withAugNoteFor({ ...p, augPoints: notes }, ID, discarder, owed);
      losers.forEach((id, i) => {
        const share = shares[i] as number;
        deltas[id] = (deltas[id] ?? 0) - share;
        notes = withAugNoteFor({ ...p, augPoints: notes }, ID, id, -share);
      });
      return { type: event.type, payload: { ...p, deltas, augPoints: notes } };
    });

    /*
     * `Reassert` — 이동(Transfer)이 전부 끝난 뒤 **한 번 더** 확인한다.
     *
     * 위 재분배는 `Redistribute`(100)라, 뒤에 도는 `Transfer`(400)가 **쏜 사람에게만**
     * 새로 부과하는 지불을 볼 수 없다. 그래서 뚫린 천장이 끼면 표준 24,000은 3분할되는데
     * 상한 해제분 6,000은 쏜 사람 혼자가 물었다 — 카드가 약속한 "그 지불이 세 명에게
     * 분담된다"가 큰 손에서 깨진 것이다(2026-08-23 QA synergy3 score 확정 4).
     * 역만 구간이면 그 편차가 42,000이다. 덤터기(`scapegoat`)는 정확히 같은 이유로
     * 이미 `Reassert` 재확인을 갖고 있는데 거울상인 이쪽에는 없었다.
     *
     * **새로 붙은 몫만** 나눈다. 지금 쏜 사람이 무는 것에서 ①내 화료로 내가 이미 지운
     * 그의 몫과 ②다른 화료자에게 가는 몫을 빼면 남는 것이 정확히 그것이다. 값이 0 이하면
     * (= 이미 누군가 다시 흩었거나 새 부담이 없다) 아무 일도 하지 않는다 — 그래서
     * 두 패스가 이중으로 나누지 않는다.
     */
    settleInterceptor(ctx, SETTLE_STAGE.Reassert, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "win") return event;
      const info = (p.winInfos ?? []).find(
        (w) => w.winner === holder && w.winType === "ron" && w.from !== null,
      );
      if (info === undefined || info.from === null) return event;
      const discarder = info.from;
      const owed = owedToMe(info);
      if (owed <= 0) return event;

      const losers = losersFor(p, ic.state.players, discarder);
      if (losers.length === 0) return event;

      /** 첫 패스가 쏜 사람에게 남긴 내 몫 — 끝수를 흡수하므로 마지막 칸이다. */
      const myShareLast = splitEvenly(owed, losers.length)[
        losers.length - 1
      ] as number;
      /** 다른 화료자에게 가는 몫 — 내 화료의 지불이 아니다. */
      const otherOwed = (p.winInfos ?? [])
        .filter(
          (w) =>
            w.winner !== holder && w.winType === "ron" && w.from === discarder,
        )
        .reduce((sum, w) => sum + owedToMe(w), 0);
      const extra = -(p.deltas[discarder] ?? 0) - myShareLast - otherOwed;
      if (extra <= 0) return event;

      const shares = splitEvenly(extra, losers.length);
      const deltas = { ...p.deltas };
      deltas[discarder] = (deltas[discarder] ?? 0) + extra;
      let notes = withAugNoteFor(p, ID, discarder, extra);
      losers.forEach((id, i) => {
        const share = shares[i] as number;
        deltas[id] = (deltas[id] ?? 0) - share;
        notes = withAugNoteFor({ ...p, augPoints: notes }, ID, id, -share);
      });
      return { type: event.type, payload: { ...p, deltas, augPoints: notes } };
    });
  },
  // 봇 정책 없음 — 패시브라 발동 판단이 없다.
});
