/**
 * 가려진 도라 (dora_conceal, prism) — "이 판의 도라는 나만 안다".
 *
 * 도라 표시패가 **상대들에게는 뒷면**이다. 상대는 자기 손의 무엇이 도라인지도 모른 채
 * 한 국을 친다. 보유자만 도라를 그대로 본다.
 *
 * (docs/16 §2b — 백로그 "왕패의 주인 — 도라 은닉"을 이 id로 정식 대체. 이미 구현된
 *  `dead_wall_master`와 이름만 같던 충돌을 해소한다.)
 *
 * 구현: 순수 패시브. 코어 규칙 `visibility.doraIndicators.hidden`(playerId = **보는 사람**)을
 * **비보유자에게만** true로 거는 Modifier. PlayerView가 그 뷰어의 도라 표시패를 비워
 * 뒷면으로 렌더한다. `setHolderRule`은 '보유자에게만' 거는 것이라 여기선 못 쓴다 —
 * 반대로 '보유자가 아닌 뷰어'에게 걸어야 하므로 addModifier로 직접 짠다.
 * 액티브 버튼·발동 없음(국 시작과 함께 상시).
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef, GameState } from "@majak/core";

const ID = "dora_conceal";

export const doraConceal: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "info",
  complexity: 2,
  name: "가려진 도라",
  description:
    "(상시) 도라 표시패가 상대에게는 가려진다 — 도라는 나만 알 수 있다.",
  detail:
    "(상시) 국이 시작되는 순간부터 도라 표시패가 당신에게만 보이고 세 상대에게는 뒷면으로 덮인다. 증강 자체는 전원에게 공개된다. 표시패는 종국 공개에서 뒤집히며 뒷도라는 표준대로 화료 때만 열린다. 다른 증강으로 도라를 들여다보는 것까지 막지는 못한다.",
  install(ctx) {
    const { holder } = ctx;
    // 보유자가 아닌 뷰어에게만 도라 표시패를 감춘다.
    ctx.engine.rules.addModifier<boolean>("visibility.doraIndicators.hidden", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId === holder) return cur;
        const state = rctx.state as GameState | undefined;
        // 종국 공개(결과 화면)에서는 감추지 않는다 — detail이 "표시패는 종국 공개에서
        // 뒤집힌다"고 약속하는데 예전에는 끝까지 덮여 있었다(2026-07-29 감사).
        if (state?.round.phase === "round.over") return cur;
        return true;
      },
    });
  },
  // 봇 정책 없음 — 패시브라 발동 판단이 없다.
});
