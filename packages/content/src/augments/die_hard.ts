/**
 * 죽기살기 (die_hard, gold).
 * 게임당 1회, 국 정산 결과 점수가 0 미만이 되면 부족분을 환급받아 정확히 0이 된다.
 * 이 게임의 도비는 0 '미만'에서 발동하므로 0점이면 탈락하지 않고 속행한다.
 *
 * 구현: ROUND_SETTLED reaction — rc.state는 정산이 적용된 후 상태이므로
 * 보유자 점수가 음수면 그만큼 scoreChanged로 되돌리고 사용 플래그를 남긴다.
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
import type { AugmentDef, PlayerId } from "@majak/core";
import { flagOf } from "../util.js";

const usedKey = (h: PlayerId): string => `die_hard:used:${h}`;

export const dieHard: AugmentDef = defineAugment({
  id: "die_hard",
  tier: "gold",
  name: "죽기살기",
  description:
    "게임에 단 한 번, 점수를 0 미만으로 떨어뜨릴 피해를 버텨낸다 — 점수가 마이너스가 되지 않고 정확히 0에서 멈춘다.",
  install(ctx) {
    const { holder } = ctx;

    // 정산 적용 후 보유자 점수가 음수면 부족분을 환급해 정확히 0으로 (게임당 1회)
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      if (flagOf(rc.state, usedKey(holder))) return;
      const score =
        rc.state.players.find((p) => p.id === holder)?.score ?? 0;
      if (score >= 0) return;
      rc.emit(scoreChanged(holder, -score, "die_hard"));
      rc.emit(augmentDataSet(usedKey(holder), true));
    });
  },
});
