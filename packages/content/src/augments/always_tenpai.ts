/**
 * 승승장구 (always_tenpai, prism) — "유국이면 나는 언제나 이긴 쪽이다".
 *
 * ⚠ **텐파이 "취급"의 범위는 유국 정산뿐이다.** 이 증강은 `RoundSettled`의 deltas를
 *    고칠 뿐 텐파이 판정 자체를 바꾸지 않는다. 그래서 텐파이를 조건으로 삼는 다른
 *    증강(모래시계 hourglass·미련 regret)은 실제 손패를 보고 발동하지 않는다 —
 *    같은 단어를 두 카드가 다르게 쓰는 셈이라 실측에서 "정산은 12/12 텐파이인데
 *    모래시계는 2회만 열린다"가 나왔다(2026-08-23 QA synergy3 build 확정 3).
 *    범위를 넓히지 않고 **카드 문구에 그 경계를 적었다** — 넓히면 노텐 손으로도
 *    솔로 쯔모 4장이 매 유국마다 열려 다른 축의 밸런스가 통째로 흔들린다.
 *
 * 황패유국 정산에서 보유자는 **손패가 어떻든 항상 텐파이로 취급**된다 — 노텐 벌점을 내지
 * 않고, 노텐인 상대에게서 분배를 받는다. **버프(사용자 지시)**: 여기에 더해, 보유자는
 * 노텐인 상대 **한 명당 2000점**을 추가로 받는다(표준 노텐 분배 위에 얹는다). 노텐 셋이면
 * +6000점 — 유국이 홀더에게 확실한 이득이 되도록 강화했다.
 *
 * 구현:
 * - 패시브 규칙 `draw.treatAsTenpai`(보유자 전용)로 표준 정산에서 항상 텐파이로 잡힌다.
 * - ROUND_SETTLED 인터셉터(유국 outcome="draw")로, 표준 델타가 계산된 뒤 노텐 지불자
 *   (delta < 0, 보유자 제외)를 세어 각자 2000점씩 보유자에게 이전한다(합=0 보존, 결정적).
 *   화료·중단 국에는 관여하지 않는다.
 *
 * §0 무페널티: 홀더는 절대 손해 보지 않는다(항상 수령자). 유국을 안 만들면 아무 일도 없다.
 */

import { ROUND_SETTLED, SETTLE_STAGE, defineAugment } from "@majak/core";
import type {
  AugmentDef,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import {
  settleInterceptor,
  withAugPoint,
} from "../util.js";

const ID = "always_tenpai";
/** 노텐 지불자 한 명당 보유자가 추가로 받는 점수 (사용자 지시 버프) */
const PER_NOTEN_BONUS = 2000;

export const alwaysTenpai: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "defense",
  complexity: 2,
  name: "승승장구",
  description:
    "(상시) 황패유국 시 손패가 어떻든 항상 텐파이로 취급된다 — 노텐 벌점을 내지 않고, 노텐인 상대 한 명당 2,000점을 추가로 받는다.",
  detail:
    "황패유국에서 손패가 어떻든 텐파이 쪽에 서서, 표준 텐파이 분배에 더해 노텐인 상대에게서 각각 2,000점씩 직접 받는다(셋 다 노텐이면 **+6,000**). 오야가 텐파이 취급이 되면 연장(렌짱)도 그대로 적용된다.\n\n텐파이 취급은 유국 정산에만 적용된다 — 텐파이를 조건으로 삼는 다른 증강(모래시계·미련)은 실제 손패를 본다.",
  install(ctx) {
    const { holder } = ctx;
    // 보유자에게만 '항상 텐파이' 규칙을 고정한다 (표준 정산에서 항상 텐파이로 집계).
    ctx.setHolderRule("draw.treatAsTenpai", true);

    // 유국 정산 위에 "노텐당 2000점" 버프를 얹는다 (합=0 보존, 결정적).
    // 정산 단계: DrawPatch — 유국 전용 재정산.
    settleInterceptor(ctx, SETTLE_STAGE.DrawPatch, (event, ic) => {
      const p = event.payload as RoundSettledPayload;
      if (p.outcome !== "draw") return event;
      // ⚠ 노텐 판정은 payload.tenpaiPlayers(엔진의 실제 집계)로만 한다.
      //    예전엔 `deltas[id] < 0`으로 추정했는데, 유국역만처럼 먼저 도는 유국 증강이
      //    전원을 음수로 만들어 놓으면 **텐파이인 상대까지 노텐으로 오판**해
      //    2000씩 더 뜯었다(60차 수정). 단계를 나눠도 추정 자체가 틀린 방법이었다.
      const tenpai = new Set(
        p.tenpaiPlayers ??
          // 구 리플레이 호환: 필드가 없던 로그는 예전 추정으로 폴백한다
          ic.state.players
            .filter((pl) => (p.deltas[pl.id] ?? 0) >= 0)
            .map((pl) => pl.id),
      );
      const noten = ic.state.players.filter(
        (pl) => pl.id !== holder && !tenpai.has(pl.id),
      );
      if (noten.length === 0) return event;
      const deltas: Record<PlayerId, number> = { ...p.deltas };
      for (const pl of noten) {
        deltas[pl.id] = (deltas[pl.id] ?? 0) - PER_NOTEN_BONUS;
      }
      const gained = PER_NOTEN_BONUS * noten.length;
      deltas[holder] = (deltas[holder] ?? 0) + gained;
      return {
        type: event.type,
        payload: { ...p, deltas, augPoints: withAugPoint(p, ctx, gained) },
      };
    });
  },
  // 봇 정책 없음 — 패시브라 발동 판단이 없다.
});
