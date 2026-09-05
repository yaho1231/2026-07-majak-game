/**
 * 기생충 (parasite, prism) — 자기 턴에 상대 한 명에게 기생한다 (국마다 1회 지정).
 * 숙주가 그 국 정산에서 얻는 점수의 절반(100점 단위)을 대신 받는다. 숙주가 잃는
 * 국에는 아무 영향이 없다.
 *
 * 구현 메모:
 * - 지정은 augmentData "parasite:target:{holder}:{roundKey}#round"에 대상만 저장하고
 *   roundViewKey("*", ...)로 전원에게 공개한다. 둘 다 국 단위로 만료되므로
 *   대상 키의 존재 자체가 "이번 국에 이미 썼다" 플래그다 (별도 used 키 불필요).
 * - 예전에는 게임당 1회 지정 후 숙주가 화료·방총할 때마다 대상이 다음 자리로
 *   자동 이동했다. 보유자가 통제할 수 없어 "랜덤으로 돌아간다"는 체감이었고,
 *   자리 배치에 따라서는 결국 아무한테도 붙지 않은 것과 다름없었다. 이제는
 *   자동 이동을 없애고, 매 국 보유자가 직접 새로 지정한다.
 * - ROUND_SETTLED Interceptor에서 숙주 delta가 양수일 때만 그 절반을 보유자에게
 *   이전한다. 숙주에게서 뺀 만큼 그대로 보유자에게 더하므로 정산 합계(제로섬)가 보존된다.
 */

import {
  augmentDataSet,
  defineAugment,
  playerAtSeat,
  SETTLE_STAGE,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
} from "@majak/core";
import {
  roundViewKey,
  settleInterceptor,
  stringOf,
  withAugPoint,
} from "../util.js";
import { clearViewOnDisarm } from "./disarmBanner.js";
import { roundScopedKey } from "./roundScope.js";
import { plan } from "./botPlan.js";
import { threatWeightOf } from "./botHelpers.js";

/** 이번 국의 기생 대상 키 (국이 바뀌면 만료되어 다시 지정할 수 있다) */
const targetKey = (holder: PlayerId, state: GameState): string =>
  // 좌석을 이름 쪽에 둔다 — 기존 키 모양(`parasite:target:{holder}:{roundKey}`)을 그대로
  // 유지하면서 국 경계 정리 표식만 얹는다.
  roundScopedKey("parasite", `target:${holder}`, state);
/** 전원 공개 뷰 키 (이번 국의 숙주 표시용 — 국 경계에서 엔진이 지운다) */
const targetViewKey = (holder: PlayerId): string =>
  roundViewKey("*", `parasite:${holder}`);

const parasiteAttachAction: ActionDef<{ target: PlayerId }> = {
  type: "parasite_attach",
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined) return "unknown player";
    if (!player.augments.includes("parasite")) return "no parasite augment";
    if (stringOf(state, targetKey(req.player, state)) !== null) {
      return "parasite already attached this round";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (req.payload.target === req.player) return "cannot attach to yourself";
    if (!state.players.some((p) => p.id === req.payload.target)) {
      return "unknown target";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(targetKey(req.player, state), req.payload.target),
    augmentDataSet(targetViewKey(req.player), req.payload.target),
  ],
};

export const parasite: AugmentDef = defineAugment({
  id: "parasite",
  tier: "prism",
  // 계열은 `scoring` — 스파이(spy)의 절반짜리인데 둘이 다른 칩에 있어
  // 도감의 계열 필터가 반쪽만 찾아 줬다(2026-08-22 QA round2 확정 15).
  category: "scoring",
  complexity: 1,
  name: "기생충",
  description:
    "(매 국 1회) 자기 순에 상대 한 명에게 기생해, 그 국 정산에서 숙주가 얻는 점수의 절반을 대신 가져온다.",
  detail:
    "상대 한 명에게 기생하면 그 국 정산에서 숙주가 얻는 점수의 절반이 내 몫으로 온다.\n\n⚠ 누구에게서 벌었는지는 따지지 않는다 — 내가 숙주에게 방총당해도 절반이 돌아온다. 숙주가 잃는 국에는 아무 영향이 없다. 지정은 전원에게 공개된다.",
  install(ctx) {
    const { engine, holder } = ctx;

    // 액션은 게임당 한 번만 등록 (여러 플레이어가 같은 증강 보유 가능)
    if (!engine.actions.has("parasite_attach")) {
      engine.actions.register(parasiteAttachAction);
    }

    // 정산 가로채기 — 숙주 증감의 절반(100점 단위)을 보유자에게 이전한다.
    // 숙주에게서 뺀 share를 그대로 보유자에게 더하므로 deltas 합계는 불변.
    //
    // ⚠ **보유자가 그 획득의 지불자여도 그대로 적용된다** — 숙주에게 방총하면 지불의
    // 절반이 되돌아와 실질 반값이 된다(QA disrupt-a 확정 2). 산술은 카드가 약속한
    // "숙주가 얻는 점수의 절반" 그대로이고 총합도 보존되므로 **동작은 그대로 두고
    // 카드 문구에 그 귀결을 명시**했다(2026-08-20). 여기서 지불자를 예외로 빼면
    // "숙주가 얻는 점수의 절반"이 거짓이 되고, 더블론·쯔모 지분 계산이 갈라진다.
    // 정산 단계: Transfer — 숙주 획득의 절반 강탈 — 최종 획득 기준.
    settleInterceptor(ctx, SETTLE_STAGE.Transfer, (event, ic) => {
      const host = stringOf(ic.state, targetKey(holder, ic.state));
      if (host === null) return event;
      const p = event.payload as RoundSettledPayload;
      const d = p.deltas[host] ?? 0;
      if (d === 0) return event;
      // 48차 무페널티: 숙주가 잃을 때는 함께 잃지 않는다 — 이득만 빨아먹는다
      if (d <= 0) return event;
      const share = Math.round(d / 200) * 100;
      if (share === 0) return event;
      const deltas = {
        ...p.deltas,
        [host]: d - share,
        [holder]: (p.deltas[holder] ?? 0) + share,
      };
      return {
        type: event.type,
        payload: { ...p, deltas, augPoints: withAugPoint(p, ctx, share) },
      };
    });

    /*
     * 무장해제로 잠기면 기생 관계선도 함께 내린다 (2026-08-23 QA synergy3 disrupt 확정 4).
     * 효과는 게이트가 막는데 관계선만 남아 있으면 화면이 정확히 반대를 말한다 —
     * 눈먼 총알·초읽기와 같은 규약이다(disarmBanner.ts).
     */
    clearViewOnDisarm(ctx, () => [targetViewKey(holder)]);

    // 이번 국에 아직 지정 전일 때만 상대별 후보를 턴 프롬프트에 노출 (validate가 최종 판정)
    ctx.holderTurnOptions((state) => {
      if (stringOf(state, targetKey(holder, state)) !== null) return [];
      return state.players
        .filter((p) => p.id !== holder)
        .map((p) => ({ type: "parasite_attach", payload: { target: p.id } }));
    });
  },
  // 숙주가 버는 점수의 절반을 나눠 받는다(숙주가 화료할수록 이득) — 가장 점수가 높은
  // 상대(리드 중이라 계속 벌 가능성이 큰 쪽)에 기생한다. 없으면 첫 상대.
  /**
   * 봇 — **누가 벌 것 같은가**로 숙주를 고른다.
   *
   * 기생은 숙주가 그 국에 얻는 점수의 절반을 가져온다. 그래서 고를 것은
   * "점수가 높은 사람"이 아니라 **이번 국에 벌 것 같은 사람**이다. 예전 정책은 점수판만
   * 봤는데, 점수판은 지금까지의 결과이지 이번 국의 예측이 아니다.
   *
   * 보이는 예측 재료가 둘 있다 — **리치를 걸었는가**(그 국에 화료할 확률이 확 올라간다),
   * 그리고 **어떤 증강을 들었는가**(같은 화료라도 값이 다르다). 점수는 마지막 동점 처리로 남긴다.
   */
  bot: plan({
    intent: "disrupt",
    // 기생은 숙주가 실제로 벌 것 같을 때 값이 난다 — 아무도 아무것도 안 한 1순에
    // 붙이는 것은 그냥 낭비다. 자기 순이면 국 내내 언제든 붙일 수 있다.
    pick: (ctx) => {
      const { options, view, holder } = ctx;
      const mine = options.filter((o) => o.type === "parasite_attach");
      if (mine.length === 0) return null;
      const info = new Map(view.players.filter((p) => p.id !== holder).map((p) => [p.id, p]));
      let best = mine[0] ?? null;
      let bestScore = -Infinity;
      for (const o of mine) {
        const target = (o.payload as { target?: string }).target;
        const p = target === undefined ? undefined : info.get(target);
        if (p === undefined) continue;
        const riichi = view.round.byPlayer[p.id]?.riichiDeclared === true ? 2 : 1;
        const score = riichi * threatWeightOf(ctx, p.augments) * 1_000_000 + p.score;
        if (score > bestScore) {
          bestScore = score;
          best = o;
        }
      }
      return best;
    },
  }),
});
