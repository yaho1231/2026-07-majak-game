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
 * 구현: 코어 규칙 `match.instantWinScore`(보유자 전용, 45000). HanchanController.shouldEnd가
 * 매 국 정산 직후 각 플레이어의 점수를 자기 문턱과 비교해, 넘으면 남은 국과 무관하게 종료한다.
 * 증강별 하드코딩 없이 문턱만 규칙으로 얹는다(아가리야메·score.finalAdjust와 같은 계열).
 *
 * ## 점수의 출처는 따지지 않는다 (사용자 확정 2026-08-12)
 *
 * 한동안은 뱅크 발행 점수(유국역만·승승장구·판돈·배수 …)를 매치 내내 누적해 그만큼 문턱을
 * 밀어 올렸다 — "마작으로 번 점수"만 세겠다는 취지였다. 그 대가로 52,000점을 들고도 게임이
 * 안 끝나는 상태를 설명하려고 공개 목표 채널까지 달아야 했고, 카드 한 줄로는 이해되지
 * 않는 증강이 됐다. 지금은 **출처와 무관하게 점수판이 45000이면 끝난다**.
 *
 * 대신 뱅크 발행 증강과 겹치면 첫 국에 매치가 끝날 수 있다(docs/21 B-2). 알고 남기는
 * 선택이며, 필요해지면 conflicts 선언으로 막는 쪽이 카드 문구를 지키는 방법이다.
 */

import { augmentDataSet, defineAugment } from "@majak/core";
import type { AugmentDef, GameState, ProposedEvent } from "@majak/core";
import { viewKey } from "../util.js";

/** 즉시 우승 문턱 점수 (밸런스는 실테스트로 조정) */
const THRESHOLD = 45000;

export const unification: AugmentDef = defineAugment({
  id: "unification",
  tier: "prism",
  category: "scoring",
  complexity: 3,
  name: "천하통일",
  description:
    "(상시) 내 점수가 45,000점에 도달하면 남은 국을 전부 무시하고 그 자리에서 게임이 끝난다.",
  detail:
    "(상시) 내 점수가 45,000점에 도달하면 그 국의 정산 직후 남은 국을 전부 무시하고 게임이 즉시 끝난다. 끝내는 것이 내 능력이지 우승이 보장되는 것은 아니다 — 같은 정산에서 나보다 높은 사람이 있으면 그쪽이 1위다.\n\n점수의 출처는 따지지 않는다 — 마작으로 벌었든 다른 증강이 얹어 줬든, 점수판이 45,000이면 그대로 끝이다.",
  install(ctx) {
    const { holder } = ctx;

    ctx.engine.rules.addModifier<number>("match.instantWinScore", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => (rctx.playerId === holder ? THRESHOLD : cur),
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
        const next = { threshold: THRESHOLD, left: Math.max(0, THRESHOLD - score) };
        const cur = rc.state.augmentData[key] as { left?: number } | undefined;
        // 값이 같으면 아무것도 내지 않는다 — 반응 연쇄가 한 겹에서 멈춘다
        if (cur !== undefined && cur.left === next.left) return;
        rc.emit(augmentDataSet(key, next));
      },
    );
  },
});
