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
 */

import { defineAugment } from "@majak/core";
import type { AugmentDef } from "@majak/core";

/** 즉시 우승 문턱 점수 (밸런스는 실테스트로 조정) */
const THRESHOLD = 50000;

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
    ctx.setHolderRule("match.instantWinScore", THRESHOLD);
  },
});
