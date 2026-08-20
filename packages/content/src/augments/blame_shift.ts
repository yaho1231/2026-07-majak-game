/**
 * 책임전가 (blame_shift, prism) — "방총의 책임을 셋으로 흩는다".
 *
 * 보유자가 **론으로 화료**하면 그 지불이 쏜 한 사람에게 몰리지 않고 **세 명(나 제외
 * 전원)에게 쯔모처럼 3분할**된다. 보유자가 받는 총액은 그대로다 — 손해 보는 사람도,
 * 이득 보는 사람도 없이 **지불자만 분산**된다(§0 무페널티: 홀더 수령액 불변).
 *
 * 구현: 순수 패시브 인터셉터. 액티브 버튼·클라 배선 없음(발동은 론 그 자체).
 * - `ROUND_SETTLED` 인터셉터에서 보유자의 론 WinInfo를 찾고, 쏜 사람(from)의 지불
 *   음수 delta를 세 사람에게 고르게 나눈다(덤터기 `scapegoat`의 지불 재배선 계열,
 *   총액 불변). 쯔모 화료는 이미 분담이라 관여하지 않는다.
 * - 다중 화료(더블 론)에서 보유자가 화료자 중 하나면 보유자 몫에만 적용한다.
 * - 100점 단위를 유지하되 합은 정확히 보존한다(나머지는 원래 쏜 사람이 흡수 —
 *   "시작한 사람"이 끝수까지 진다).
 */

import {
  defineAugment,
  ROUND_SETTLED,
  SETTLE_STAGE,
} from "@majak/core";
import type {
  AugmentDef,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import { settleInterceptor, withAugNoteFor } from "../util.js";

const ID = "blame_shift";

/** total(양수)을 n명에게 100점 단위로 최대한 고르게 나눈다. 합은 정확히 total.
 *  마지막 몫이 나머지를 흡수한다(호출부에서 쏜 사람을 마지막에 둔다). */
function splitEvenly(total: number, n: number): number[] {
  const per = Math.round(total / n / 100) * 100;
  const out: number[] = [];
  let assigned = 0;
  for (let i = 0; i < n - 1; i++) {
    out.push(per);
    assigned += per;
  }
  out.push(total - assigned); // 마지막이 끝수 흡수
  return out;
}

export const blameShift: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 2,
  name: "책임전가",
  description:
    "(상시) 내가 론으로 화료하면 그 지불이 쏜 사람 혼자가 아니라 세 명에게 쯔모처럼 분담된다. 내가 받는 총액은 그대로 — 방총의 책임만 테이블 전체로 흩어진다.",
  detail:
    "(상시) 론으로 화료할 때마다 쏜 사람이 전액 물던 점수가 나를 뺀 세 명에게 쯔모처럼 고르게 3분할된다. 내가 받는 총액은 변하지 않으며 손해를 보는 사람도 이득을 보는 사람도 없이 지불자만 분산된다. 더블론이면 화료자를 뺀 나머지끼리 나누므로 3분할이 아니라 2분할이 된다. 쯔모 화료는 이미 분담이므로 관여하지 않고, 100점 단위로 떨어지지 않는 끝수는 원래 쏜 사람이 흡수한다.",
  install(ctx) {
    const { holder } = ctx;

    // 정산 단계: Redistribute — 지불자만 재배선한다 — 총액·홀더 수령액 불변. 재분배가 방어(Shield)보다
    // 먼저 돌아야 역만 방어술이 "새로 부과된 지불"까지 보고 막을 수 있다.
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
      const owed =
        info.points + (info.honbaBonus ?? 0) - (info.pao?.points ?? 0);
      if (owed <= 0) return event;

      // 화료자는 전부 제외한다 — 승자에게 지불을 떠넘기지 않는다.
      // 쏜 사람을 마지막에 두어 끝수를 흡수시킨다.
      const winners = new Set((p.winInfos ?? []).map((w) => w.winner));
      const losers: PlayerId[] = [
        ...ic.state.players
          .map((pl) => pl.id)
          .filter((id) => !winners.has(id) && id !== discarder),
        discarder,
      ];
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
  },
  // 봇 정책 없음 — 패시브라 발동 판단이 없다.
});
