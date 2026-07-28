/**
 * 리치 봉인 (riichi_seal, prism).
 *
 * 내가 그 국의 **첫 리치**를 선언하면, **내가 그 리치를 지고 있는 동안** 다른 셋은
 * 리치를 걸 수 없다. 점수는 1점도 늘어나지 않는다 — 상대 셋에게서 리치·일발·뒷도라라는
 * 최대 화력 수단을 통째로 빼앗는 것 자체가 이 증강의 전부다.
 *
 * 설계 결정:
 * - **소급하지 않는다.** 나보다 먼저 이 국에 리치를 건 사람이 있으면 봉인은 아예
 *   서지 않는다("그 국의 첫 리치"). 이미 걸린 리치가 풀리는 일도 없다.
 * - 이 "첫 리치"라는 조건이 곧 국당 자연 1회 제한이다 — 별도의 횟수 카운터가 필요 없다.
 * - 봉인 사실은 **전원 공개 뷰 채널**로 나간다. 상대는 자기 화면에서 리치가 잠긴
 *   이유를 알 수 있어야 대응(다마텐 전환·후로 전환)을 선택할 수 있다.
 *
 * # 봉인의 대가는 리치를 지고 있는 것 (2026-07-27, 60차 사용자 확정)
 *
 * 봉인은 **내가 리치 중일 때만** 살아 있다. 손바닥 뒤집기·승부수로 리치를 풀면
 * **봉인도 그 자리에서 풀린다.** 국이 바뀌면 당연히 풀리고, 다음 국에 다시 선제 리치를
 * 걸면 그 국 동안 또 봉인된다.
 *
 * 왜: 예전엔 봉인이 "한 번 세우면 그 국 내내 유지되는 플래그"였다. 그래서
 * **공성계**(무텐파이 리치)로 1순에 가짜 리치를 걸어 봉인만 세우고, **손바닥 뒤집기**로
 * 취소해 정상 플레이로 돌아가도 봉인이 남았다 — 아무 대가 없이 상대 셋의 리치를
 * 국 내내 지우는 조합이었다(docs/21 §B-3). 봉인을 리치 상태에 묶으면 그 무비용 변형만
 * 정확히 잘리고, 정직하게 리치를 지고 싸우는 쪽은 아무것도 잃지 않는다.
 *
 * 구현:
 * - TILE_DISCARDED(riichi=true) 리액션에서 그 시점에 다른 누구도 리치 상태가 아니면
 *   봉인 플래그를 세운다. 키에 roundKey를 섞어 국이 바뀌면 자동 만료된다.
 *   이 플래그는 "내 이번 국 리치가 그 국의 첫 리치였다"는 **과거 사실**의 기록이다.
 * - 봉인의 현재 유효 여부는 **살아 있는 상태에서 파생**한다(아래 isSealActive) —
 *   리치 해제 이벤트를 따로 구독하지 않는다. 손바닥 뒤집기(`RiichiFlipped`)든
 *   승부수(`RiichiCanceled`)든 결국 `byPlayer[holder].riichi = null`로 끝나므로,
 *   상태만 보면 어떤 해제 수단이 새로 생겨도 자동으로 따라온다(증강 간 결합 없음).
 * - 봉인은 `riichi.blocked` 규칙 Modifier로 걸린다. 이 규칙의 playerId는
 *   **리치를 선언하려는 사람**이므로, 보유자 본인만 통과시키고 나머지에게 true를 준다.
 */

import {
  ROUND_STARTED,
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  ProposedEvent,
  TileDiscardedPayload,
} from "@majak/core";
import { flagOf, roundKey, viewKey } from "../util.js";

const ID = "riichi_seal";

/** 이번 국에 이 보유자가 봉인을 세웠는가 (국이 바뀌면 키가 달라져 자동 만료) */
const sealKey = (state: GameState, h: PlayerId): string =>
  `${ID}:sealed:${roundKey(state)}:${h}`;

/** 이 플레이어가 지금 리치 중인가 */
const inRiichi = (state: GameState, p: PlayerId): boolean =>
  state.round.byPlayer[p]?.riichi != null;

/**
 * 봉인이 **지금** 살아 있는가.
 *
 * 세 조건을 전부 만족해야 한다:
 *  ① 이번 국에 봉인을 세웠다 (첫 리치를 내가 걸었다는 과거 사실)
 *  ② 보유자가 **지금도 리치 중**이다 — 풀면 봉인도 풀린다
 *  ③ 다른 누구도 리치 중이 아니다
 *
 * ③이 필요한 이유: 내가 리치를 풀어 봉인이 풀린 사이에 남이 리치를 걸 수 있다.
 * 그 뒤 내가 같은 국에 다시 리치를 걸어도 나는 더 이상 "선제"가 아니므로 봉인이
 * 되살아나선 안 된다. 플래그(①)는 과거 기록이라 그 사이의 변화를 모르므로,
 * 현재 상태로 한 번 더 걸러 준다. (아무도 안 걸었다면 재리치로 봉인이 돌아온다 —
 * "리치를 지고 있는 동안 봉인"이라는 규칙 그대로다.)
 */
function isSealActive(state: GameState, holder: PlayerId): boolean {
  if (!flagOf(state, sealKey(state, holder))) return false;
  if (!inRiichi(state, holder)) return false;
  return !state.players.some((pl) => pl.id !== holder && inRiichi(state, pl.id));
}

export const riichiSeal: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  name: "리치 봉인",
  description:
    "(매 국 1회 — 그 국의 첫 리치를 내가 선언할 때) 내가 그 리치를 지고 있는 동안 다른 셋은 리치를 걸 수 없다. 리치를 풀면 봉인도 풀린다. 추가 점수는 붙지 않는다.",
  detail:
    "(매 국 1회 — 그 국의 첫 리치를 내가 선언할 때) 국의 첫 리치를 내가 선언하는 순간 나머지 세 명의 리치가 잠겨, 상대는 리치·일발·뒷도라라는 최대 화력 수단을 통째로 잃는다. 봉인은 내가 그 리치를 지고 있는 동안만 유지된다 — 손바닥 뒤집기나 승부수로 리치를 풀면 봉인도 그 자리에서 풀리고, 그 사이 상대가 리치를 걸었다면 같은 국에 다시 걸어도 봉인은 돌아오지 않는다. 국이 바뀌면 초기화되어, 다음 국에 다시 선제 리치를 걸면 그 국 동안 또 봉인된다. 나보다 먼저 리치를 건 사람이 있으면 봉인은 아예 서지 않으며, 이미 선언된 리치를 되돌리지도 않는다. 봉인 사실은 전원에게 공개된다. 점수는 1점도 늘지 않는다.",
  install(ctx) {
    const { holder } = ctx;
    const bannerKey = viewKey("*", `${ID}:${holder}`);

    /**
     * 공개 배너를 현재 봉인 상태에 맞춘다.
     * 봉인이 풀렸는데 "봉인"이 떠 있으면 지운다 — 상대가 잠겼다고 오해하면
     * 리치를 걸 수 있는데도 안 거는 잘못된 대응을 한다(Rule #4는 정보가 **맞을** 때만 산다).
     * 국이 바뀌어 플래그 키가 만료된 경우도 여기서 함께 정리된다.
     */
    const syncBanner = (
      state: GameState,
      emit: (e: ProposedEvent) => void,
    ): void => {
      if (state.augmentData[bannerKey] !== "봉인") return;
      if (isSealActive(state, holder)) return;
      emit(augmentDataSet(bannerKey, ""));
    };

    // 국의 첫 리치를 잡는다 — 그 시점에 다른 누구도 리치 중이 아니어야 한다
    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      const state = rc.state;

      if (
        p.riichi === true &&
        p.player === holder &&
        !flagOf(state, sealKey(state, holder))
      ) {
        const someoneElseRiichi = state.players.some(
          (pl) => pl.id !== holder && inRiichi(state, pl.id),
        );
        // 내가 첫 리치가 아니면 소급 봉인 없음 — 배너 동기화만 하고 지나간다
        if (!someoneElseRiichi) {
          rc.emit(augmentDataSet(sealKey(state, holder), true));
          // 전원 공개 — 상대는 리치가 잠긴 이유를 알아야 대응할 수 있다
          rc.emit(augmentDataSet(bannerKey, "봉인"));
          return;
        }
      }

      // 리치를 푼 직후에도 결국 버림이 이어지므로, 여기서 배너가 즉시 정리된다.
      syncBanner(state, rc.emit);
    });

    // 국이 바뀌면 봉인 플래그 키가 만료된다 — 배너도 함께 내린다
    ctx.reaction(ROUND_STARTED, (_event, rc) => {
      syncBanner(rc.state, rc.emit);
    });

    // riichi.blocked의 playerId는 '리치를 선언하려는 사람'이다
    ctx.engine.rules.addModifier<boolean>("riichi.blocked", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId === holder) return cur; // 보유자 본인은 잠기지 않는다
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return isSealActive(state, holder) ? true : cur;
      },
    });
  },
});
