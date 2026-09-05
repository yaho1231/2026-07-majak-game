/**
 * 승부수 (last_stand, gold).
 * 이번 국 1회, 리치 중이라면 자기 턴에 **언제든** 리치를 취소할 수 있다.
 * 취소하면 리치봉(공탁 낸 점수)을 돌려받는다. 매 국 시작 시 사용 횟수가 초기화된다.
 *
 * 설계: docs/16_AUGMENT_REDESIGN.md §1b D (52차 버프)
 * 이전엔 "패산 10장 이하 + 리치 중"이라는 이중 조건이라 대부분의 국에 아무 일도
 * 일어나지 않았다. 패산 조건을 삭제해 리치를 건 순간부터 언제든 물러설 수 있게 했다 —
 * 억제는 "국당 1회"라는 횟수뿐이다.
 *
 * 구현:
 * - 커스텀 이벤트 RiichiCanceled + 리듀서(리치 해제·리치봉 환급)를 게임당 1회 등록.
 * - 액션 cancel_riichi(자기 턴·리치 중·미사용) → RiichiCanceled + 사용 플래그.
 * - holderTurnOptions로 취소 선택지를 노출. 사용 플래그·취소 이력은 국 스코프 키라
 *   국 경계에서 엔진이 지운다(`roundScopedKey`).
 *
 * ⚠ **취소한 국에는 리치를 다시 걸 수 없다.** 코어의 재리치 가드는
 * `riichiAction.validate` 의 `if (rs?.riichi != null) return "already riichi"` 하나뿐이라,
 * 취소로 `riichi` 가 null이 되는 순간 그 가드가 열렸다. 1,000점을 돌려받고 다시 내므로
 * **순비용 0**인데 ① 일발이 새로 장전되고 ② 취소가 함께 내린 `riichiFuriten` 이 false로
 * 남아 **영구 리치 후리텐이 세탁**됐다(2026-08-22 QA aug-2 확정 8, 실측 재현).
 * 마작에서 리치는 국당 한 번이고 리치 후리텐은 되돌릴 수 없는 벌인데, 그 유일한 우회로가
 * 카드 설명 한 줄 없이 열려 있었다 — 카드는 이 증강을 **폴드 수단**으로만 서술한다.
 * 그래서 취소 이력을 국 스코프로 남기고 `riichi.blocked` 로 그 국의 재리치를 막는다
 * (스텔스 리치·공성계 등 다른 리치 경로도 전부 이 규칙을 조회하므로 한 곳이면 족하다).
 */

import {
  augmentDataSet,
  defineAugment,
  playerAtSeat,
} from "@majak/core";
import type { ActionDef, AugmentDef, GameState, PlayerId } from "@majak/core";
import { flagOf, publishUsesLeft } from "../util.js";
import { roundScopedKey } from "./roundScope.js";
import { stealthActiveKey } from "./stealth_riichi.js";
import { waitTilesLeft } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "last_stand";
const RIICHI_CANCELED = "RiichiCanceled";
/**
 * 이번 국에 취소를 썼는가 (국 스코프).
 *
 * 예전에는 게임 스코프 키(`last_stand:used:p0`) + `ROUND_STARTED` 수동 리셋이었다.
 * 같은 계열 다섯 중 유일한 규약 위반이었고, 재구성·리플레이·증강 재설치로 리셋 리액션과
 * 국 전환이 어긋나면 직전 국의 소진 플래그가 살아남을 수 있었다(QA aug-2 의심 7).
 */
const usedKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "used", state, h);
/** 이번 국에 리치를 취소했는가 — 이 국의 재리치를 막는 이력 (국 스코프) */
const canceledKey = (state: GameState, h: PlayerId): string =>
  roundScopedKey(ID, "canceled", state, h);

interface RiichiCanceledPayload {
  player: PlayerId;
  refund: number;
}

const cancelRiichiAction: ActionDef<Record<string, never>> = {
  type: "cancel_riichi",
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes("last_stand")) {
      return "no last_stand augment";
    }
    if (state.augmentData[usedKey(state, req.player)] === true) {
      return "already used this round";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (state.round.byPlayer[req.player]?.riichi == null) return "not in riichi";
    return null;
  },
  toEvents: (req, { state, rules }) => {
    // 실제로 낸 만큼만, 그리고 공탁에 남아 있는 만큼만 돌려받는다.
    // 공탁을 내지 않는 리치(스텔스 리치)가 규칙 상수를 받아 가면 없던 점수가
    // 생기고 riichiPot이 음수가 되어, 그 국 화료자가 되레 점수를 뺏겼다
    // (docs/25 최우선#2). 손으로 조립한 구 상태에만 규칙값 폴백.
    const paid =
      state.round.byPlayer[req.player]?.riichi?.cost ??
      rules.resolve<number>("riichi.cost", { playerId: req.player, state });
    const refund = Math.max(0, Math.min(paid, state.round.riichiPot));
    return [
      {
        type: RIICHI_CANCELED,
        payload: { player: req.player, refund } satisfies RiichiCanceledPayload,
      },
      augmentDataSet(usedKey(state, req.player), true),
      // 이 국에는 리치를 다시 걸 수 없다 (파일 머리 주석 참고)
      augmentDataSet(canceledKey(state, req.player), true),
    ];
  },
};

export const lastStand: AugmentDef = defineAugment({
  id: "last_stand",
  tier: "gold",
  category: "defense",
  complexity: 2,
  name: "승부수",
  description:
    "(매 국 1회) 리치 중이라면 자기 순에 언제든 자신의 리치를 취소할 수 있다. 취소하면 냈던 리치봉을 돌려받고 다시 자유롭게 버릴 수 있다.",
  detail:
    "리치 중 자기 순에 리치를 취소할 수 있다 — 리치봉을 돌려받고 다시 자유롭게 버리며, 리치 후리텐도 풀린다.\n\n취소한 국에는 리치를 다시 걸 수 없다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // 매 국 초기화되는 1회라 "이번 국에 이미 썼나"가 판단의 전부다.
    publishUsesLeft(
      ctx,
      (state) => ({ left: flagOf(state, usedKey(state, holder)) ? 0 : 1, total: 1 }),
      "round",
    );

    if (!engine.reducers.has(RIICHI_CANCELED)) {
      engine.reducers.register(RIICHI_CANCELED, (state, event) => {
        const p = event.payload as RiichiCanceledPayload;
        const rs = state.round.byPlayer[p.player];
        if (rs === undefined) throw new Error(`RiichiCanceled: unknown ${p.player}`);
        /*
         * 숨은 리치 표식도 함께 내린다 — 손을 뺏겨 풀리는 경로(`stealthBreak`)와 같다.
         *
         * 남겨 두면 ① 같은 국에 스텔스 리치를 한 번 더 걸 수 있고("리치는 국당 한 번"이
         * 깨진다) ② 그 뒤 공탁 1000점을 낸 **표준 리치까지 은닉**된다 — 공탁은 냈는데
         * 남들 화면에는 리치가 없다(2026-08-20 QA 문구 확정 12).
         */
        const stealthKey = stealthActiveKey(state, p.player);
        const augmentData =
          state.augmentData[stealthKey] === undefined
            ? state.augmentData
            : { ...state.augmentData, [stealthKey]: false };
        return {
          ...state,
          augmentData,
          players: state.players.map((pl) =>
            pl.id === p.player ? { ...pl, score: pl.score + p.refund } : pl,
          ),
          round: {
            ...state.round,
            riichiPot: state.round.riichiPot - p.refund,
            byPlayer: {
              ...state.round.byPlayer,
              [p.player]: { ...rs, riichi: null, riichiFuriten: false },
            },
          },
        };
      });
    }
    if (!engine.actions.has("cancel_riichi")) {
      engine.actions.register(cancelRiichiAction);
    }

    // 사용 플래그·취소 이력은 국 스코프 키라 국 경계에서 엔진이 지운다 —
    // 수동 리셋 리액션은 없다.

    /*
     * 취소한 국에는 리치를 다시 걸 수 없다.
     *
     * `riichi.blocked` 의 playerId는 '리치를 선언하려는 사람'이다. 여기서 잠그는 대상은
     * **보유자 본인뿐**이다(봉인술과 반대 방향). 코어의 `riichiAction` 은 물론
     * 스텔스 리치·공성계·개시 리치 등 content의 다른 리치 경로도 전부 이 규칙을 먼저
     * 조회하므로, 한 곳만 막으면 우회로가 남지 않는다.
     */
    ctx.engine.rules.addModifier<boolean>("riichi.blocked", {
      source: ctx.instanceId,
      layer: ctx.layer,
      apply: (cur, rctx) => {
        if (rctx.playerId !== holder) return cur;
        const state = rctx.state as GameState | undefined;
        if (state === undefined) return cur;
        return flagOf(state, canceledKey(state, holder)) ? true : cur;
      },
    });

    // 리치 중이면 취소 선택지 노출 (validate가 패산·미사용 등 최종 판정)
    ctx.holderTurnOptions((state) =>
      state.round.byPlayer[holder]?.riichi != null
        ? [{ type: "cancel_riichi", payload: {} }]
        : [],
    );
  },
  /**
   * 리치 취소는 폴드 수단이다 — **이길 가망이 사라졌는데 계속 쏘일 위험만 남았을 때**
   * 쓴다. 사람이 실제로 물러서는 두 장면을 그대로 옮겼다.
   *
   *  · 남이 리치를 걸었는데 내 대기가 죽었다(오름패가 세상에 거의 안 남았다).
   *  · 패산이 얼마 안 남아 화료는 어려운데 상대는 아직 위험하다.
   *
   * 취소하면 리치봉도 돌아오고 그 뒤로는 안전패를 골라 낼 수 있다(봇의 버림 판단이
   * 위협을 보고 알아서 접는다). 위협이 없으면 리치는 그대로 두는 것이 항상 낫다.
   */
  bot: plan({
    intent: "defend",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: (ctx) => {
      const opt = ctx.options.find((o) => o.type === "cancel_riichi");
      if (opt === undefined) return null;
      if (ctx.threat < 0.9) return null; // 위협이 없으면 물러설 이유가 없다
      const left = waitTilesLeft(ctx);
      const hopeless = left <= 1 || (ctx.wallLeft <= 12 && left <= 3);
      // 여기까지 왔으면 "지금 접지 않으면 방총한다"는 상황이다. 그 급함은 이제
      // 의도(`defend`)가 강도로 옮겨 주므로 정책이 숫자를 직접 쓰지 않는다.
      return hopeless ? opt : null;
    },
  }),
});
