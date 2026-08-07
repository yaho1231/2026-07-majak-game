/**
 * 가불 인생 (devils_advance, prism) — 게임 시작 드래프트 전용.
 *
 * 획득 후 첫 국이 시작될 때 뱅크에서 10,000점을 앞당겨 받는다. 그리고 그 빚은
 * **테이블 전원에게 보인다** — 뷰 채널에 "가불 10000"이 붙는다.
 *
 * 52차 개편: 조용한 입금으로 끝나던 것에 **빚이 터지는 순간**을 붙였다.
 * 보유자가 **만관 이상**(WinInfo.limit !== null)으로 화료하는 순간, 게임당 1회
 * 빚이 폭발해 **상대 셋에게서 각 3,000점을 추가로 강탈**한다(제로섬 — 뱅크가 아니라
 * 상대 주머니에서 나온다). 폭발하면 공개 뷰가 "청산"으로 바뀌어 더는 터지지 않는다.
 *
 * 구현:
 * - ROUND_STARTED 리액션: 첫 국에 +10,000 지급 + 전원 공개 뷰("가불 10000").
 * - ROUND_SETTLED 인터셉터: 만관 이상 화료면 deltas를 조정한다(상대 −3,000씩, 나 +합계).
 *   인터셉터는 이벤트를 emit할 수 없으므로, 실제 적용 여부를 같은 이벤트 처리 안에서
 *   리액션에 플래그로 넘겨 상태 기록(청산 플래그·뷰)을 맡긴다 — karma와 같은 패턴.
 * - 기존 `devils_advance:exempt:{holder}` 키를 **폭발 완료 기록**으로 재사용한다.
 *
 * 48차 무페널티: 게임 종료 상환(-15,000)은 이미 삭제됐다. 받은 10,000점은 온전히 내 것이다.
 */

import {
  augmentDataSet,
  defineAugment,
  ROUND_SETTLED,
  ROUND_STARTED,
  scoreChanged,
  SETTLE_STAGE,
} from "@majak/core";
import type { AugmentDef, PlayerId, RoundSettledPayload } from "@majak/core";
import {
  flagOf,
  settleInterceptor,
  viewKey,
  withAugPoint,
} from "../util.js";

const ID = "devils_advance";
const ADVANCE = 10000;
/** 폭발 시 상대 1명에게서 뜯는 액수 */
const BURST_PER_OPPONENT = 3000;

const grantedKey = (h: PlayerId): string => `${ID}:granted:${h}`;
/** 빚이 이미 폭발했는가 (게임당 1회) — 48차의 exempt 키를 재사용 */
const burstKey = (h: PlayerId): string => `${ID}:exempt:${h}`;

/** 이번 정산에서 빚이 폭발한 보유자 목록 (인터셉터 → reaction 신호) */
interface BurstMark {
  burstBy?: PlayerId[];
}

export const devilsAdvance: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "scoring",
  complexity: 2,
  name: "가불 인생",
  draftStages: ["gameStart"],
  description:
    "(게임 내 1회 · 게임 시작 드래프트 전용) 첫 국이 시작될 때 뱅크에서 10,000점을 앞당겨 받고 그 빚이 전원에게 공개된다. 이후 만관 이상으로 화료하는 순간 빚이 폭발해 상대 셋에게서 각 3,000점을 뜯어낸다.",
  detail:
    "(게임 내 1회 · 게임 시작 드래프트 전용) 획득 후 첫 국이 시작될 때 뱅크에서 10,000점을 받고 그 사실이 '가불 10000'으로 전원에게 공개된다. 이후 자신이 만관 이상으로 화료하는 순간 빚이 폭발해 상대 세 명에게서 각각 3,000점을 추가로 강탈한다(합계 9,000점 — 뱅크가 아니라 상대 주머니에서 나온다). 폭발은 게임당 한 번뿐이며 터지고 나면 공개 표시가 '청산'으로 바뀐다. 상환이나 위약금은 없어 받은 10,000점은 온전히 내 것이다.",
  install(ctx) {
    const { holder } = ctx;
    const vKey = viewKey("*", `${ID}:${holder}`);

    // 획득 후 첫 국 시작에 가불금 지급 (1회) — 빚 문서가 테이블에 붙는다
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      if (flagOf(rc.state, grantedKey(holder))) return;
      rc.emit(scoreChanged(holder, ADVANCE, ID));
      rc.emit(augmentDataSet(grantedKey(holder), true));
      rc.emit(augmentDataSet(vKey, `가불 ${ADVANCE}`));
    });

    /*
     * 만관 이상 화료 → 빚이 폭발한다 (게임당 1회, 제로섬 강탈).
     *
     * ⚠ 인터셉터 → 리액션 신호는 **이벤트 payload 표식**으로 넘긴다. 예전에는 엔진 밖
     * 클로저 변수(`let burst`)를 썼는데, 그건 상태에 없는 값이라 재개·리플레이 재구성
     * (rebuildAugments)에서 어긋나고 같은 증강을 두 명이 가지면 서로 덮어쓴다
     * (2026-07-29 감사).
     */
    // 정산 단계: Transfer — 상대 셋에게서 정액 3000씩 강탈 — 정액이므로 배수 뒤에 온다.
    settleInterceptor(ctx, SETTLE_STAGE.Transfer, (event, ic) => {
      if (flagOf(ic.state, burstKey(holder))) return event;
      const p = event.payload as RoundSettledPayload & BurstMark;
      if (p.outcome !== "win") return event;
      const info = (p.winInfos ?? []).find((w) => w.winner === holder);
      if (info === undefined || info.limit === null) return event;

      const deltas = { ...p.deltas };
      let taken = 0;
      for (const pl of ic.state.players) {
        if (pl.id === holder) continue;
        deltas[pl.id] = (deltas[pl.id] ?? 0) - BURST_PER_OPPONENT;
        taken += BURST_PER_OPPONENT;
      }
      if (taken === 0) return event;
      deltas[holder] = (deltas[holder] ?? 0) + taken;
      return {
        type: event.type,
        payload: {
          ...p,
          deltas,
          augPoints: withAugPoint(p, ctx, taken),
          burstBy: [...(p.burstBy ?? []), holder],
        },
      };
    });

    // 폭발이 실제로 적용됐으면 청산 기록 (인터셉터가 payload에 남긴 표식을 본다)
    ctx.reaction(ROUND_SETTLED, (event, rc) => {
      const p = event.payload as RoundSettledPayload & BurstMark;
      if (!(p.burstBy ?? []).includes(holder)) return;
      rc.emit(augmentDataSet(burstKey(holder), true));
      rc.emit(augmentDataSet(vKey, "청산"));
    });
  },
});
