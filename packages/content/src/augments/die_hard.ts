/**
 * 죽기살기 (die_hard, gold).
 * 동풍전 1·반장전 2회, 국 정산 결과 점수가 0 미만이 되면 **마이너스로 떨어진 만큼을
 * 그대로 플러스로 되돌려 받는다** — −8000이면 그 자리에서 +8000이 된다.
 * 밑바닥을 친 깊이가 곧 반등폭이라 "크게 맞을수록 크게 돌아온다".
 *
 * 구현: ROUND_SETTLED reaction — rc.state는 정산이 적용된 후 상태이므로
 * 보유자 점수가 음수면 그 두 배(−2×score)를 scoreChanged로 얹어 부호를 뒤집고
 * 사용 플래그를 남긴다.
 * (인터셉터로 deltas를 고치면 사용 플래그를 남길 수 없어 reaction을 쓴다.
 *  환급은 정산 직후 같은 이벤트 연쇄 안에서 적용되므로 HanchanController의
 *  도비 체크(runRound 종료 후 score<0)보다 먼저 반영된다.)
 */

import {
  ROUND_SETTLED,
  augmentDataSet,
  defineAugment,
  scoreChanged,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { counterOf, matchUses } from "../util.js";

/** 매치당 발동 횟수 카운터 (게임 단위). 동풍전 1·반장전 2회. */
const usesKey = (h: PlayerId): string => `die_hard:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);

export const dieHard: AugmentDef = defineAugment({
  id: "die_hard",
  tier: "gold",
  category: "defense",
  name: "죽기살기",
  description:
    "(동풍전 1회 · 반장전 2회) 국 정산 결과 점수가 0 아래로 떨어지는 순간, 마이너스로 내려간 만큼을 그대로 플러스로 되돌려 받는다 — −8000점이 되면 즉시 +8000점.",
  detail:
    "(동풍전 1회 · 반장전 2회) 국 정산 결과 점수가 0 미만이 되면 내려간 깊이만큼 부호가 뒤집혀 그대로 점수가 된다(−8000점 → +8000점). 정산 결과가 0 이상이면 발동하지 않으며, 도비 판정보다 먼저 반영되어 그 자리에서 되살아난다.",
  install(ctx) {
    const { holder } = ctx;

    // 정산 적용 후 보유자 점수가 음수면 그 깊이만큼 플러스로 튕겨 올린다 (동풍1·반장2회)
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      if (!hasUsesLeft(rc.state, holder)) return;
      const score =
        rc.state.players.find((p) => p.id === holder)?.score ?? 0;
      if (score >= 0) return;
      // score=-8000 → +16000을 얹어 +8000. 부호가 뒤집힌다.
      rc.emit(scoreChanged(holder, -2 * score, "die_hard"));
      rc.emit(augmentDataSet(usesKey(holder), counterOf(rc.state, usesKey(holder)) + 1));
    });
  },
});
