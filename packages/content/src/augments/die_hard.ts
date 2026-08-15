/**
 * 죽기살기 (die_hard, gold).
 * 동풍전 1·반장전 2회, 국 정산 결과 점수가 0 미만이 되면 **마이너스로 떨어진 만큼을
 * 그대로 플러스로 되돌려 받는다** — −8000이면 그 자리에서 +8000이 된다.
 * 밑바닥을 친 깊이가 곧 반등폭이라 "크게 맞을수록 크게 돌아온다".
 *
 * 구현: 정산 인터셉터(SETTLE_STAGE.Shield) — 배수·가산·이동이 전부 끝난 **최종 손실**을
 * 보고 deltas를 직접 고친다. 방어이므로 반드시 마지막 단계여야 한다(settleStages 규약).
 *
 * ⚠ 2026-07-29 감사: 예전에는 정산 **뒤** 별도 ScoreChanged로 얹었다. 그러면 부활분이
 * deltas 밖에 있어 결과 화면에는 "−12,000"만 뜨는데 다음 국 점수판은 +8,000이 되어,
 * 무슨 일이 있었는지 화면으로 알 수 없었다. 지금은 deltas에 실어 증감 표시와 일치한다.
 * 인터셉터는 이벤트를 emit할 수 없으므로 발동 사실을 payload 표식(ReviveMark)으로 남기고
 * reaction이 그걸 보고 사용 횟수를 소진한다 — 역만 방어술(ShieldMark)과 같은 패턴이다.
 */

import {
  ROUND_SETTLED,
  SETTLE_STAGE,
  augmentDataSet,
  defineAugment,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import {
  counterOf,
  matchUses,
  publishUsesLeft,
  roundViewKey,
  settleInterceptor,
  withAugPoint,
} from "../util.js";

const ID = "die_hard";

/** 매치당 발동 횟수 카운터 (게임 단위). 동풍전 1·반장전 2회. */
const usesKey = (h: PlayerId): string => `${ID}:uses:${h}`;
const hasUsesLeft = (state: GameState, h: PlayerId): boolean =>
  counterOf(state, usesKey(h)) < matchUses(state);

/** 이번 정산에서 부활한 보유자 목록 (인터셉터 → reaction 신호) */
interface ReviveMark {
  revivedBy?: PlayerId[];
}

export const dieHard: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "defense",
  complexity: 1,
  name: "죽기살기",
  description:
    "(동풍전 1회 · 반장전 2회) 국 정산 결과 점수가 0 아래로 떨어지는 순간, 마이너스로 내려간 만큼을 그대로 플러스로 되돌려 받는다 — −8000점이 되면 즉시 +8000점.",
  detail:
    "(동풍전 1회 · 반장전 2회) 국 정산 결과 점수가 0 미만이 되면 내려간 깊이만큼 부호가 뒤집혀 그대로 점수가 된다(−8000점 → +8000점). 정산 결과가 0 이상이면 발동하지 않으며, 토비 판정보다 먼저 반영되어 그 자리에서 되살아난다. 되돌려 받은 몫은 결과 화면의 증감에도 함께 표시된다.",
  // A급 파괴(docs/25 §conflicts): 둘 다 SETTLE_STAGE.Shield에 앉는데, 한 사람이
  // 둘 다 가지면 자리(seat)가 같아 동률 정렬이 등록 순서로 되돌아간다(#64의 한계).
  // 방어막이 먼저면 손실 0·횟수 보존, 죽기살기가 먼저면 부호가 뒤집히고 횟수 소모 →
  // 최종 점수와 잔여 횟수가 픽 순서로 갈린다.
  conflicts: ["yakuman_shield"],
  install(ctx) {
    const { holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약)
    publishUsesLeft(ctx, (state) => ({
      left: Math.max(0, matchUses(state) - counterOf(state, usesKey(holder))),
      total: matchUses(state),
    }));

    // 방어는 반드시 마지막 단계 — 어떤 경로로 생긴 손실이든 **최종값**을 봐야 한다.
    settleInterceptor(ctx, SETTLE_STAGE.Shield, (event, ic) => {
      const p = event.payload as RoundSettledPayload & ReviveMark;
      if (!hasUsesLeft(ic.state, holder)) return event;
      const before = ic.state.players.find((pl) => pl.id === holder)?.score ?? 0;
      const after = before + (p.deltas[holder] ?? 0);
      if (after >= 0) return event;
      // after=-8000 → -2×after=+16000을 얹어 최종 +8000. 부호가 뒤집힌다.
      return {
        type: event.type,
        payload: {
          ...p,
          deltas: { ...p.deltas, [holder]: (p.deltas[holder] ?? 0) - 2 * after },
          augPoints: withAugPoint(p, ctx, -2 * after),
          revivedBy: [...(p.revivedBy ?? []), holder],
        },
      };
    });

    // 실제로 부활한 국에만 사용 횟수를 소진하고 전원에게 공개한다.
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload & ReviveMark;
      if (!(p.revivedBy ?? []).includes(holder)) return;
      rc.emit(
        augmentDataSet(usesKey(holder), counterOf(rc.state, usesKey(holder)) + 1),
      );
      rc.emit(augmentDataSet(roundViewKey("*", `${ID}:${holder}`), true));
    });
  },
});
