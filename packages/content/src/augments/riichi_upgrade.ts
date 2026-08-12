/**
 * 이중 선언 (riichi_upgrade) — 리치를 진짜로 두 번 선언한다.
 *
 * 1. 보유자의 리치는 몇 번째 버림이든 **언제나 더블리치**로 승격된다.
 *    (이 증강이 아니었어도 더블리치였다면 **트리플리치 = 4판**으로 취급된다 —
 *     표준 조건인 첫 버림뿐 아니라 **뒤늦은 출진**이 밀어 올린 더블도 포함한다.)
 * 2. 52차 개편 — 리치를 선언하는 순간 **내 하가(다음 차례 사람)의 그 국 리치를 봉인**한다.
 *    "사실상 보이지 않는 +1판"이던 증강에 상대가 대응해야 하는 순간을 붙였다.
 *
 * 설계 결정:
 * - **소급하지 않는다.** `riichi.blocked`는 리치를 선언하려는 시점에만 조회되므로,
 *   이미 리치를 건 사람의 리치가 풀리는 일은 구조적으로 없다.
 * - 봉인 대상과 사실은 **전원 공개 뷰 채널**로 나간다 — 피격자는 자기 리치가 잠긴
 *   이유를 알아야 다마텐·후로로 방향을 틀 수 있다(대응 가능성).
 * - **트리플리치는 4판으로 취급한다**(2026-07-26 밸런스, 예전엔 3판). 정산에서만 보이는
 *   패시브가 아니라 리치 선언 순간에 "트리플리치"로 표시되는 결과이고, 자연 더블 조건을
 *   스스로 만들어야 하는 선택형 보상이라 리트머스를 통과한다.
 *
 * 구현 지점:
 * - TILE_DISCARDED Interceptor: 보유자의 리치 버림에 riichiDouble=true를 강제.
 * - TILE_DISCARDED Reaction: 자연 더블 조건(또는 뒤늦은 출진의 승격)이면 트리플 플래그
 *   기록 + 하가 봉인 기록.
 * - ROUND_SETTLED Reaction: 트리플 플래그 해제(봉인 키는 roundKey가 섞여 자동 만료).
 * - `riichi.blocked` Modifier: 이번 국에 봉인된 대상에게 true.
 * - `score.extraHan` Modifier: 트리플 상태의 보유자 화료에 +2판(더블리치 2판 + 2 = 4판).
 */

import {
  ROUND_SETTLED,
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
  nextSeat,
  playerAtSeat,
  playerOf,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  TileDiscardedPayload,
} from "@majak/core";
import { flagOf, roundKey, stringOf, viewKey } from "../util.js";
import { lateDoublePromotes } from "./late_double.js";

const ID = "riichi_upgrade";

/** 트리플리치(자연 더블에서 한 번 더 승격) 상태 플래그 키 */
const tripleKey = (holder: PlayerId): string => `${ID}:triple:${holder}`;
/**
 * 트리플리치 사실을 알리는 뷰 채널 키 — 선언 배너에 "트리플리치"로 뜨게 하는 용도.
 * 스텔스 리치와 겹치면 리치 자체가 새므로 그때는 본인 채널로만 보낸다.
 */
const tripleViewKey = (holder: PlayerId): string => `${ID}:triple:${holder}`;
/** 이번 국에 리치가 봉인된 대상 (국이 바뀌면 키가 달라져 자동 만료) */
const sealKey = (state: GameState, holder: PlayerId): string =>
  `${ID}:seal:${roundKey(state)}:${holder}`;

export const riichiUpgrade: AugmentDef = defineAugment({
  id: ID,
  tier: "gold",
  category: "riichi",
  complexity: 3,
  name: "이중 선언",
  description:
    "(상시) 리치를 선언하면 언제나 더블리치가 되고, 동시에 내 하가(다음 차례 사람)는 그 국에 리치를 걸 수 없게 된다. 이 증강이 없었어도 더블리치였을 리치라면 트리플리치가 되어 4판으로 값한다.",
  detail:
    "(상시) 리치를 선언하면 몇 번째 버림이든 언제나 더블리치(2판)로 승격된다. 동시에 자신의 하가의 리치가 그 국 동안 봉인되어 그 사람은 리치·일발·뒷도라를 통째로 잃는다. 이미 리치를 건 사람에게는 소급하지 않으며 봉인 대상은 전원에게 공개된다. 이 증강이 없었어도 더블리치였을 리치(첫 버림, 또는 뒤늦은 출진이 승격시킨 7순 이내의 리치)라면 트리플리치가 되어 리치가 4판으로 값한다(추가 판은 역만에 적용되지 않는다).",
  install(ctx) {
    const { holder } = ctx;

    // 보유자의 리치 버림을 가로채 더블리치로 승격
    ctx.interceptor(TILE_DISCARDED, (event) => {
      const p = event.payload as TileDiscardedPayload;
      if (!p.riichi || p.player !== holder) return event;
      return { type: event.type, payload: { ...p, riichiDouble: true } };
    });

    ctx.reaction(TILE_DISCARDED, (event, rc) => {
      const p = event.payload as TileDiscardedPayload;
      if (!p.riichi || p.player !== holder) return;
      const state = rc.state;
      const rs = state.round.byPlayer[holder];
      if (rs?.riichi == null) return;

      /*
       * **나 말고 다른 이유로도 더블리치였는가** — 그러면 트리플이다.
       *
       * ① 표준 더블리치 조건: 첫 버림 + 첫 바퀴 무후로.
       * ② 뒤늦은 출진(late_double): 7순까지의 리치를 더블로 밀어 올린다.
       *
       * 결과 플래그(`riichi.double`)로는 판정할 수 없다 — 이 증강 자신이 모든 리치를
       * 더블로 만들어 언제나 true다. 그래서 예전에는 ①만 봤고, 뒤늦은 출진으로 만든
       * 더블리치는 이중 선언을 함께 들고도 트리플이 되지 않았다(2026-08-12 사용자 보고).
       */
      const naturalDouble =
        rs.riichi.discardIndex === 0 && state.round.goAroundBroken === false;
      if (naturalDouble || lateDoublePromotes(state, holder)) {
        rc.emit(augmentDataSet(tripleKey(holder), true));
        // 선언 순간 "트리플리치"로 보이게 — 정산에서만 드러나는 패시브가 되지 않도록.
        const stealth =
          ctx.engine.rules.has("riichi.hidden") &&
          ctx.engine.rules.resolve<boolean>("riichi.hidden", {
            playerId: holder,
            state,
          });
        rc.emit(
          augmentDataSet(viewKey(stealth ? holder : "*", tripleViewKey(holder)), true),
        );
      }

      // 두 번째 선언 — 하가(내 다음 차례 사람)의 그 국 리치를 봉인
      if (stringOf(state, sealKey(state, holder)) !== null) return;
      const mySeat = playerOf(state, holder).seat;
      const target = playerAtSeat(state, nextSeat(state, mySeat)).id;
      if (target === holder) return; // 1인 게임 등 방어
      rc.emit(augmentDataSet(sealKey(state, holder), target));
      // 전원 공개 — 피격자는 자기 리치가 잠긴 이유를 알아야 대응할 수 있다
      rc.emit(augmentDataSet(viewKey("*", `${ID}:${holder}`), target));
    });

    // 국이 끝나면 트리플 플래그·뷰 채널 해제 (다음 국으로 이월 금지)
    ctx.reaction(ROUND_SETTLED, (_event, rc) => {
      if (flagOf(rc.state, tripleKey(holder))) {
        rc.emit(augmentDataSet(tripleKey(holder), false));
      }
      for (const k of [
        viewKey("*", tripleViewKey(holder)),
        viewKey(holder, tripleViewKey(holder)),
      ]) {
        if (flagOf(rc.state, k)) rc.emit(augmentDataSet(k, false));
      }
      // 봉인 뷰 채널도 함께 내린다 — 이 키에는 roundKey가 없어 그대로 두면 다음 국까지 남는다
      const sealView = viewKey("*", `${ID}:${holder}`);
      if (stringOf(rc.state, sealView) !== null) {
        rc.emit(augmentDataSet(sealView, null));
      }
    });

    // riichi.blocked의 playerId는 '리치를 선언하려는 사람'이다
    ctx.engine.rules.addModifier<boolean>("riichi.blocked", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        // 봉인의 근거는 **내가 지고 있는 리치**다. 취소하면 함께 풀려야 한다 —
        // 예전에는 국 스코프 키만 봐서, 승부수로 공탁까지 돌려받고도 하가는
        // 그 국 내내 리치를 못 걸었다(리치 봉인이 같은 이유로 고쳐진 적 있다).
        if (state.round.byPlayer[holder]?.riichi == null) return cur;
        return stringOf(state, sealKey(state, holder)) === rctx.playerId
          ? true
          : cur;
      },
    });

    // 트리플 상태의 보유자 화료에 +2판 — 더블리치 2판과 합쳐 트리플리치 = 4판
    // (역만에는 엔진이 추가 판을 적용하지 않는다)
    ctx.engine.rules.addModifier<number>("score.extraHan", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (current, rctx) => {
        if (rctx.playerId !== holder) return current;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return current;
        /*
         * **살아 있는 리치에서 파생한다.** 트리플 플래그는 게임 스코프 키라
         * ROUND_SETTLED까지 남는데, 승부수·손바닥 뒤집기로 그 국에 리치를 취소하면
         * 리치가 없는 손에 리치 판수 +2가 그대로 붙었다. 판수는 리치의 값어치이므로
         * 리치가 사라지면 함께 사라져야 한다 — 리치 봉인이 같은 이유로 이미
         * 라이브 상태에서 파생한다(2026-08-08 QA §2-9).
         */
        if (state.round.byPlayer[holder]?.riichi == null) return current;
        return flagOf(state, tripleKey(holder)) ? current + 2 : current;
      },
    });
  },
});
