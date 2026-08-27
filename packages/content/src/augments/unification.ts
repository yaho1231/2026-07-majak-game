/**
 * 천하통일 (unification, prism) — 이 게임에 새로운 승리 조건이 추가된다.
 * **어느 시점이든 내 점수가 45000점에 도달하는 순간, 남은 국을 전부 무시하고 즉시 우승**으로
 * 게임이 끝난다.
 *
 * 부수는 상식: 승부는 오라스까지 가 봐야 안다 — 나에게만 조기 체크메이트 조건이 있다.
 *
 * 도파민 순간: 홀더의 점수봉이 문턱(4만 5천)에 다가서는 순간부터 전 테이블에 긴장이 걸린다.
 * 통일 사이렌이 울리면 남4국이고 뭐고 그대로 엔딩 크레딧.
 *
 * 대응: 목표가 고정 수치라 대응도 명확 — 홀더가 문턱에 붙으면 전원이 홀더에게만 안 쏘는
 * 연합 수비, 홀더에게서 론해 점수를 깎는 것이 유일한 해독제.
 *
 * 구현: 코어 규칙 `match.instantWinScore`(보유자 전용). HanchanController.shouldEnd가
 * 매 국 정산 직후 각 플레이어의 점수를 자기 문턱과 비교해, 넘으면 남은 국과 무관하게 종료한다.
 * 증강별 하드코딩 없이 문턱만 규칙으로 얹는다(아가리야메·score.finalAdjust와 같은 계열).
 *
 * ## 점수의 출처는 따지지 않는다 (사용자 확정 2026-08-12)
 *
 * ## 문턱은 모드마다 다르다 (반장전 QA 2026-08-25)
 *
 * 45,000은 **동풍전(4국) 기준**으로 «압도적 리드»(시작 +20,000)를 뜻하는 숫자였다.
 * 국이 두 배인 반장전에 같은 문턱을 쓰면 고점을 찍을 창이 4번에서 8번으로 늘 뿐 아니라,
 * 남1~2국에 도달하는 순간 **반장전 후반 절반이 통째로 사라진다** — 반장전이 동풍전과
 * 다른 이유(후반 역전의 여지)를 이 카드 한 장이 잘라내는 것이라 단순한 강화가 아니라
 * 모드 의미의 파괴였다. 그래서 반장전 문턱만 55,000으로 올린다(시작 +30,000).
 * 횟수가 아니라 점수 좌표계라 `scaledUses` 계열로는 표현할 수 없어 여기서 직접 가른다.
 *
 * 한동안은 뱅크 발행 점수(유국역만·승승장구·판돈·배수 …)를 매치 내내 누적해 그만큼 문턱을
 * 밀어 올렸다 — "마작으로 번 점수"만 세겠다는 취지였다. 그 대가로 52,000점을 들고도 게임이
 * 안 끝나는 상태를 설명하려고 공개 목표 채널까지 달아야 했고, 카드 한 줄로는 이해되지
 * 않는 증강이 됐다. 지금은 **출처와 무관하게 점수판이 문턱에 닿으면 끝난다**.
 *
 * 대신 뱅크 발행 증강과 겹치면 첫 국에 매치가 끝날 수 있다(docs/21 B-2). 알고 남기는
 * 선택이며, 필요해지면 conflicts 선언으로 막는 쪽이 카드 문구를 지키는 방법이다.
 */

import { augmentDataSet, defineAugment } from "@majak/core";
import type { AugmentDef, GameState, ProposedEvent } from "@majak/core";
import { viewKey } from "../util.js";

/** 즉시 우승 문턱 점수 — 동풍전(4국) 기준. */
const THRESHOLD_TONPUU = 45000;
/** 반장전(8국) 문턱 — 국이 두 배라 문턱도 시작 +30,000으로 올린다(위 주석 참고). */
const THRESHOLD_HANCHAN = 55000;

/** 이 판의 즉시 우승 문턱. state가 없으면 서버 기본과 같은 반장전으로 본다. */
function thresholdOf(state: GameState | undefined): number {
  return state?.config.mode === "tonpuu" ? THRESHOLD_TONPUU : THRESHOLD_HANCHAN;
}

export const unification: AugmentDef = defineAugment({
  id: "unification",
  tier: "prism",
  category: "scoring",
  // 난도 2 (2026-08-27 재평가): '점수 문턱에 닿으면 게임 종료' — 마작 지식이 사실상 필요 없다.
  complexity: 2,
  name: "천하통일",
  description:
    "(상시) 내 점수가 문턱(반장전 55,000점 · 동풍전 45,000점)에 도달하면 남은 국을 전부 무시하고 그 자리에서 게임이 끝난다.",
  detail:
    "문턱은 반장전 55,000점 · 동풍전 45,000점이고, 판정은 각 국의 정산 직후에 이루어진다. 점수의 출처는 따지지 않는다 — 다른 증강이 얹어 준 점수여도 점수판이 문턱에 닿으면 그대로 끝이다.\n\n끝내는 것이 내 능력이지 우승이 보장되지는 않는다 — 같은 정산에서 나보다 높은 사람이 있으면 그쪽이 1위다.",
  install(ctx) {
    const { holder } = ctx;

    ctx.engine.rules.addModifier<number>("match.instantWinScore", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) =>
        rctx.playerId === holder
          ? thresholdOf(rctx.state as GameState | undefined)
          : cur,
    });

    /*
     * 문턱까지 얼마나 남았는가 — **전원 공개**.
     *
     * 예전에는 이 증강이 view 채널을 하나도 내지 않았다. 그래서 동2국에서 갑자기 최종
     * 순위표가 뜨는데 아무 설명이 없었고("통일 사이렌"은 주석에만 있었다), 대응 수단이
     * 명확하다는 설계(홀더에게만 안 쏘는 연합 수비)도 성립할 수 없었다 — 언제 붙었는지
     * 아무도 몰랐기 때문이다. 점수판은 원래 전원이 보는 것이므로 숨길 이유가 없다.
     */
    const key = viewKey("*", `unification:${holder}`);
    ctx.reaction(
      "*",
      (_event: unknown, rc: { state: GameState; emit: (e: ProposedEvent) => void }) => {
        const score = rc.state.players.find((p) => p.id === holder)?.score ?? 0;
        const threshold = thresholdOf(rc.state);
        const next = { threshold, left: Math.max(0, threshold - score) };
        const cur = rc.state.augmentData[key] as { left?: number } | undefined;
        // 값이 같으면 아무것도 내지 않는다 — 반응 연쇄가 한 겹에서 멈춘다
        if (cur !== undefined && cur.left === next.left) return;
        rc.emit(augmentDataSet(key, next));
      },
    );
  },
});
