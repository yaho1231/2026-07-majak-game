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
import { settleInterceptor } from "../util.js";

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
  name: "책임전가",
  description:
    "(상시) 내가 론으로 화료하면 그 지불이 쏜 사람 혼자가 아니라 세 명에게 쯔모처럼 분담된다. 내가 받는 총액은 그대로 — 방총의 책임만 테이블 전체로 흩어진다.",
  detail:
    "(상시) 론으로 화료할 때마다 쏜 사람이 전액 물던 점수가 나를 뺀 세 명에게 쯔모처럼 고르게 3분할된다. 내가 받는 총액은 변하지 않으며 손해를 보는 사람도 이득을 보는 사람도 없이 지불자만 분산된다. 쯔모 화료는 이미 분담이므로 관여하지 않고, 100점 단위로 떨어지지 않는 끝수는 원래 쏜 사람이 흡수한다.",
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

      // 쏜 사람이 이번 론으로 문 총액(양수). deltas는 이미 본장·공탁까지 반영돼 있고
      // 론에서는 쏜 사람만 음수이므로 그 크기를 그대로 재분배 대상으로 삼는다.
      const owed = -(p.deltas[discarder] ?? 0);
      if (owed <= 0) return event;

      // 나를 뺀 세 명. 쏜 사람을 마지막에 두어 끝수를 흡수시킨다.
      const losers: PlayerId[] = [
        ...ic.state.players.map((pl) => pl.id).filter((id) => id !== holder && id !== discarder),
        discarder,
      ];
      if (losers.length === 0) return event;

      const shares = splitEvenly(owed, losers.length);
      const deltas = { ...p.deltas };
      // 쏜 사람의 기존 지불을 원상복구한 뒤, 세 명에게 새 몫을 부과한다.
      deltas[discarder] = (deltas[discarder] ?? 0) + owed;
      losers.forEach((id, i) => {
        deltas[id] = (deltas[id] ?? 0) - (shares[i] as number);
      });
      return { type: event.type, payload: { ...p, deltas } };
    });
  },
  // 봇 정책 없음 — 패시브라 발동 판단이 없다.
});
