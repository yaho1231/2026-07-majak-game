/**
 * 가불 인생 (devils_advance, prism) — 게임 시작 드래프트 전용.
 *
 * 획득 후 첫 국이 시작될 때 뱅크에서 10,000점을 앞당겨 받는다. 그리고 그 빚은
 * **테이블 전원에게 보인다** — 뷰 채널에 "가불 10000"이 붙는다.
 *
 * 52차 개편: 조용한 입금으로 끝나던 것에 **빚이 터지는 순간**을 붙였다.
 * 보유자가 **만관 이상**(WinInfo.limit !== null)으로 화료하는 순간, 게임당 1회
 * 빚이 터져 **상대 셋에게서 각 3,000점을 걷는다**. 폭발하면 공개 뷰가 "청산"으로
 * 바뀌어 더는 터지지 않는다.
 *
 * ⚠ 걷은 9,000점은 **보유자에게 가지 않는다** — 앞당겨 쓴 빚을 갚는 돈이라 그대로
 * 뱅크로 들어간다(2026-08-15 사용자 지시). 예전에는 보유자가 +9,000을 함께 받아
 * 만관 한 방이 두 배로 커졌다. 지금은 상대 셋만 3,000씩 줄고 내 점수는 그대로다.
 * 끝내 만관을 못 쳐도 잃는 것은 없다 — 받은 10,000점은 온전히 내 것이다.
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
/**
 * 가불금 지급 리액션의 순서 — **국 시작 리액션 중 가장 뒤**.
 * 다른 증강의 ROUND_STARTED 리액션은 전부 기본값 0이다. 근거는 install 안의 주석.
 */
const GRANT_PRIORITY = 1000;

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
    "10,000점을 미리 받고, 만관 이상으로 화료하면 내 빚을 상대가 3,000점씩 대신 갚는다.",
  detail:
    "획득 후 첫 국에 10,000점을 미리 받고, 만관 이상으로 화료하면 상대 셋이 3,000점씩 대신 갚는다.\n\n갚은 9,000점은 내 점수에 더해지지 않고 상대 점수만 줄어든다. 빚은 갚을 때까지 모두에게 공개되고, 게임이 끝날 때까지 만관을 내지 못하면 갚지 않아도 된다.",
  install(ctx) {
    const { holder } = ctx;
    const vKey = viewKey("*", `${ID}:${holder}`);

    /*
     * 획득 후 첫 국 시작에 가불금 지급 (1회) — 빚 문서가 테이블에 붙는다.
     *
     * ⚠ **priority가 있어야 한다** (2026-08-31 QA synergy4 A-12). 이 지급은
     * `ScoreChanged`이고, 반전(`sign_flip`)은 «자기가 켜진 국»의 `ScoreChanged`를
     * 통째로 뒤집는다. 그런데 반전이 «켜졌다»는 표식도 같은 `ROUND_STARTED` 리액션
     * (`armOnNextRound`)이 쓰므로, 두 리액션 중 어느 쪽이 먼저 도느냐로 가불금이
     * **+10,000이 되기도 −10,000이 되기도** 했다 — 그 순서는 `EffectRegistry`의 등록
     * 순서 = `installAugment` 호출 순서 = **드래프트 픽 순서**였다. 같은 시드·같은
     * 카드로 최종 점수가 32,100 vs 12,100으로 갈렸고, 이어하기·리플레이 재구성에서도
     * 갈릴 수 있었다. 정산 인터셉터는 `settlePriority`로 이 문제를 없앴지만
     * ROUND_STARTED 리액션 경로에는 같은 장치가 없다.
     *
     * 그래서 **지급을 마지막으로 민다**(다른 리액션은 전부 기본 priority 0). 이제 반전이
     * 켜져 있으면 가불금은 **언제나** 뒤집힌다 — "증강이 국 중에 직접 옮기는 점수도
     * 같은 국이면 부호를 뒤집는다"(`sign_flip.ts`)는 규약을 그대로 따르는 한 값이고,
     * 상태만으로 정해지므로 픽 순서·재구성과 무관하다.
     */
    ctx.reaction(
      ROUND_STARTED,
      (_event, rc) => {
        if (flagOf(rc.state, grantedKey(holder))) return;
        rc.emit(scoreChanged(holder, ADVANCE, ID));
        rc.emit(augmentDataSet(grantedKey(holder), true));
        rc.emit(augmentDataSet(vKey, `가불 ${ADVANCE}`));
      },
      { priority: GRANT_PRIORITY },
    );

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
      /*
       * 걷은 돈은 **뱅크로 간다** — 보유자의 deltas는 손대지 않는다. 그래서 결과 화면에
       * 적을 증감도 없다(0점 기록은 표시에서 걸러진다). 상대 셋이 3,000씩 줄어드는 것은
       * 결과창 증감에 그대로 뜨므로 무슨 일이 일어났는지는 전원이 본다.
       */
      return {
        type: event.type,
        payload: {
          ...p,
          deltas,
          augPoints: withAugPoint(p, ctx, 0),
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
