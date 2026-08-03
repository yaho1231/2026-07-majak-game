/**
 * 천하통일 (unification, prism) — 이 게임에 새로운 승리 조건이 추가된다.
 * **어느 시점이든 내 점수가 50000점에 도달하는 순간, 남은 국을 전부 무시하고 즉시 우승**으로
 * 게임이 끝난다.
 *
 * 부수는 상식: 승부는 오라스까지 가 봐야 안다 — 나에게만 조기 체크메이트 조건이 있다.
 *
 * 도파민 순간: 홀더의 점수봉이 문턱(5만)에 다가서는 순간부터 전 테이블에 등정 게이지가 켜진다.
 * 통일 사이렌이 울리면 남4국이고 뭐고 그대로 엔딩 크레딧.
 *
 * 대응: 목표가 완전 공개라 대응도 명확 — 홀더가 문턱에 붙으면 전원이 홀더에게만 안 쏘는
 * 연합 수비, 홀더에게서 론해 게이지를 깎는 것이 유일한 해독제.
 *
 * 구현: 코어 규칙 `match.instantWinScore`(보유자 전용, 50000). HanchanController.shouldEnd가
 * 매 국 정산 직후 각 플레이어의 점수를 자기 문턱과 비교해, 넘으면 남은 국과 무관하게 종료한다.
 * 증강별 하드코딩 없이 문턱만 규칙으로 얹는다(아가리야메·score.finalAdjust와 같은 계열).
 *
 * ## 증강이 만든 점수는 문턱에 세지 않는다 (docs/25 §conflicts)
 *
 * 뱅크가 발행하는 점수(유국역만·승승장구·판돈·배수 …)는 상대가 막을 수단이 구조적으로
 * 없다. 실측으로 "유국역만 + 승승장구"가 유국 한 번에 55,000을 만들어 **첫 국에 매치가
 * 끝났다**. 그 조합들을 전부 conflicts로 묶으면 천하통일이 사표가 되므로, 대신
 * **문턱을 증강이 움직인 만큼 올린다** — 점수에서 빼는 것과 같고, 천하통일은
 * "마작으로 5만을 벌어야 하는" 조건이 된다.
 *
 * augPoints는 정산에서 증강이 움직인 점수의 단일 기록이라(#60에서 10종을 여기로 모았다)
 * 이 한 곳만 누적하면 새 증강이 추가돼도 자동으로 덮인다.
 */

import { ROUND_SETTLED, augmentDataSet, defineAugment } from "@majak/core";
import type { AugmentDef, PlayerId, RoundSettledPayload } from "@majak/core";
import { counterOf } from "../util.js";

/** 즉시 우승 문턱 점수 (밸런스는 실테스트로 조정) */
const THRESHOLD = 50000;

/** 이 사람이 증강으로 얻은 점수의 매치 누적 (문턱을 그만큼 올린다) */
const augGainKey = (holder: PlayerId): string => `unification:auggain:${holder}`;

export const unification: AugmentDef = defineAugment({
  id: "unification",
  tier: "prism",
  category: "scoring",
  name: "천하통일",
  description:
    "(상시) 어느 시점이든 내 점수가 50000점에 도달하는 순간, 남은 국을 전부 무시하고 즉시 우승으로 게임이 끝난다.",
  detail:
    "(상시) 내 점수가 50000점에 도달하면 그 국의 정산 직후 남은 국을 전부 무시하고 게임이 즉시 끝나며 내가 우승한다. 목표 점수와 현재 점수는 전원에게 공개된다.",
  install(ctx) {
    const { holder } = ctx;

    // 문턱 = 기본 5만 + 증강이 지금까지 얹어 준 점수. 마작으로 번 5만에만 반응한다.
    ctx.engine.rules.addModifier<number>("match.instantWinScore", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as
          | import("@majak/core").GameState
          | undefined;
        const base = cur > 0 ? cur : THRESHOLD;
        if (state === undefined) return base;
        return base + Math.max(0, counterOf(state, augGainKey(holder)));
      },
    });

    // 증강이 움직인 점수를 매치 단위로 누적한다 (음수 = 잃은 것은 문턱을 내리지 않는다)
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload;
      const gained = (p.augPoints ?? [])
        .filter((n) => n.player === holder)
        .reduce((sum, n) => sum + n.points, 0);
      if (gained <= 0) return;
      rc.emit(
        augmentDataSet(
          augGainKey(holder),
          counterOf(rc.state, augGainKey(holder)) + gained,
        ),
      );
    });
  },
});
