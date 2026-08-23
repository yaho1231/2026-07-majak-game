/**
 * **모양 규칙 액티브** 3종의 공용 배선 — 동수의 결속·무너진 국경·비대칭.
 *
 * ## 2026-08-23 (사용자 지시) — 상시 패시브 → **2국에 1회 액티브**
 *
 * 셋은 전부 `setHolderRule` 한 줄짜리 **상시** 증강이었다. 뽑는 순간부터 게임이 끝날
 * 때까지 손의 대원칙 하나(커쯔의 동일성·슌쯔의 무늬·또이쯔의 무늬)가 통째로 사라져,
 * 상대에게는 "이 사람에게 안전한 색"이라는 개념 자체가 매치 내내 없었다. 이제는
 * **자기 순에 선언한 그 국 동안만** 열리고, 한 번 쓰면 2국이 지나야 다시 열린다.
 * 조커(`joker`)와 완전히 같은 구조다 — 국 스코프 on 플래그 + 국 단위 쿨다운.
 *
 * 그래서 셋의 차이는 **어느 규칙을 켜는가** 하나뿐이고, 나머지(액션·검증·쿨다운·
 * 공개 채널·천화 게이트·봇 정책)는 전부 같다. 같은 코드를 세 번 복붙하면 한 곳만
 * 고쳐지는 순간 셋이 갈라지므로(이 저장소가 여러 번 겪은 실패다) 여기 한 곳에 둔다.
 *
 * ## 구현 메모
 *
 * - 규칙은 `setHolderRule`(항상 켜짐)이 아니라 **모디파이어**로 건다 — 이번 국에
 *   선언했을 때만 `true`를 돌려준다. 이 규칙 하나가 `helpers.scoringOptionsOf`를 타고
 *   화료·텐파이·대기·후리텐·후로 판정 전부에 흘러가므로 판정 지점을 따로 손댈 것이 없다.
 * - **리치 중에는 선언할 수 없다.** 조커가 같은 이유로 막았다(2026-08-22 QA aug-2 확정 6):
 *   대기가 잠겨 있어야 할 손이 그 자리에서 다시 계산돼, 싼 대기로 압박해 두고 상대가
 *   그 대기만 피해 밀어붙이는 순간 규칙을 켜서 아무 패로나 론하는 길이 열린다.
 * - **천화·지화 게이트를 닫는다**(`handAltered`). 패를 갈아 끼우지는 않지만 결과는
 *   게이트가 막으려던 바로 그것이다 — 완성돼 있지 **않던** 배패가 선언 한 번에
 *   완성형으로 읽힌다. 조커가 실측 48,000점으로 확인한 자리다.
 * - 발동은 **전원 공개**다(`view:*:{id}:{보유자}` = true). 상대가 "지금 이 사람에게는
 *   무늬가 없다"를 알아야 수비가 성립한다 — 헌장 2번.
 */

import { augmentDataSet, playerAtSeat, shantenOf } from "@majak/core";
import type {
  ActionDef,
  AugmentBotPolicy,
  AugmentContext,
  AugmentDef,
  DecomposeOptions,
  GameState,
  PlayerId,
  PlayerView,
} from "@majak/core";
import { cooldownReady, cooldownUse, flagOf, roundViewKey, trackRoundSeq } from "../util.js";
import { handAlteredKey } from "./handAltered.js";
import { handKindsOf } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

/** 한 번 쓰면 이만큼 국(본장 포함)이 지나야 다시 열린다 — 셋 공통 */
export const SHAPE_COOLDOWN_ROUNDS = 2;

/** 이번 국에 규칙을 켰는가 (국 스코프 — 효과는 그 국에만 산다) */
const onKey = (id: string, state: GameState, holder: PlayerId): string =>
  roundScopedKey(id, "on", state, holder);

/** 지금 이 국에 그 사람이 규칙을 켜 두었는가 */
export function shapeRuleOn(
  state: GameState,
  id: string,
  holder: PlayerId,
): boolean {
  return flagOf(state, onKey(id, state, holder));
}

/** 한 증강분의 배선 명세 */
export interface ShapeDeclareSpec {
  /** 증강 id */
  id: string;
  /** 액션 타입 (`declare_mixed_triplet` …) */
  action: string;
  /** 켜는 코어 규칙 이름 (`scoring.mixedTriplets` …) */
  rule: string;
  /** 같은 규칙의 분해 옵션 키 — 봇이 "지금 켜면 손이 나아지는가"를 재는 데만 쓴다 */
  option: "mixedTriplets" | "mixedRuns" | "chiitoiMixedPairs";
}

function declareAction(spec: ShapeDeclareSpec): ActionDef<Record<string, never>> {
  return {
    type: spec.action,
    validate: (req, { state }) => {
      const player = state.players.find((p) => p.id === req.player);
      if (player === undefined || !player.augments.includes(spec.id)) {
        return `no ${spec.id} augment`;
      }
      if (state.round.phase !== "turn.act") return "not in act phase";
      if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
        return "not your turn";
      }
      // 리치 중에는 손이 동결된다 (파일 머리 주석 참고 — 조커와 같은 이유)
      if (state.round.byPlayer[req.player]?.riichi != null) {
        return "riichi: hand is frozen";
      }
      if (!cooldownReady(state, spec.id, req.player, SHAPE_COOLDOWN_ROUNDS)) {
        return "on cooldown";
      }
      if (shapeRuleOn(state, spec.id, req.player)) return "already on";
      return null;
    },
    toEvents: (req, { state }) => [
      augmentDataSet(onKey(spec.id, state, req.player), true),
      ...cooldownUse(state, spec.id, req.player, SHAPE_COOLDOWN_ROUNDS),
      // 전원 공개 — 상대가 이번 국의 수비 기준을 바꿀 수 있어야 한다
      augmentDataSet(roundViewKey("*", `${spec.id}:${req.player}`), true),
      // 배패가 그 자리에서 완성형으로 읽히는 길을 닫는다 (천화·지화)
      augmentDataSet(handAlteredKey(state, req.player), true),
    ],
  };
}

/** 지금 켜면 샹텐이 얼마나 줄어드는가 (봇 정책 전용) */
function declareGain(
  spec: ShapeDeclareSpec,
  view: PlayerView,
  holder: PlayerId,
): { gain: number; tenpai: boolean } {
  const hand = handKindsOf(view, holder);
  if (hand.length === 0) return { gain: 0, tenpai: false };
  const meldCount = view.round.byPlayer[holder]?.meldCount ?? 0;
  const opts = (view.scoringOptions ?? {}) as DecomposeOptions;
  const base = shantenOf(hand, meldCount, opts);
  const withRule = shantenOf(hand, meldCount, { ...opts, [spec.option]: true });
  return { gain: Math.max(0, base - withRule), tenpai: withRule <= 0 };
}

/** `install` 배선 — 액션 등록·규칙 모디파이어·쿨다운·버튼 노출 */
export function installShapeDeclare(ctx: AugmentContext, spec: ShapeDeclareSpec): void {
  const { engine, holder } = ctx;

  if (!engine.actions.has(spec.action)) {
    engine.actions.register(declareAction(spec));
  }

  // 쿨다운 기준 — 국이 시작될 때마다 +1 (본장 재배패도 한 국으로 센다)
  trackRoundSeq(ctx, spec.id, SHAPE_COOLDOWN_ROUNDS);

  // 선언한 국 동안만 규칙이 켜진다 (그 외에는 원래 값을 그대로 돌려준다)
  engine.rules.addModifier<boolean>(spec.rule, {
    source: ctx.instanceId,
    layer: ctx.layer,
    apply: (cur, rctx) => {
      if (rctx.playerId !== holder) return cur;
      const state = rctx.state as GameState | undefined;
      if (state === undefined) return cur;
      return shapeRuleOn(state, spec.id, holder) ? true : cur;
    },
  });

  /*
   * 자기 순에 뜨는 액티브 버튼. 리치 중에는 후보 자체를 내지 않는다 — `FlowController`의
   * 리치 강제 쯔모기리 자동 진행은 `options.length === 1`일 때만 도는데, 후보가 하나 더
   * 남으면 리치 중 매 순 프롬프트가 떠 자동 진행이 사라진다(조커와 같은 규약).
   */
  ctx.holderTurnOptions((state) =>
    state.round.byPlayer[holder]?.riichi != null
      ? []
      : [{ type: spec.action, payload: {} }],
  );
}

/**
 * 봇 정책 — 손을 **전진시키는** 물건이라 `advance`다. 2국에 1회뿐이므로 지금 켜서
 * 실제로 샹텐이 줄어들 때만 태우고, 그 자리에서 텐파이가 서면 적기 문턱을 건너뛴다.
 */
export function shapeDeclareBot(spec: ShapeDeclareSpec): AugmentBotPolicy {
  return plan({
    intent: "advance",
    fleeting: (ctx) => declareGain(spec, ctx.view, ctx.holder).tenpai,
    pick: (ctx) => {
      const option = ctx.options.find((o) => o.type === spec.action);
      if (option === undefined) return null;
      return declareGain(spec, ctx.view, ctx.holder).gain > 0 ? option : null;
    },
  });
}

/** 셋이 공유하는 정의 조각 — `defineAugment`에 그대로 펼쳐 넣는다 */
export function shapeDeclareParts(
  spec: ShapeDeclareSpec,
): Pick<AugmentDef, "bot"> & { install: (ctx: AugmentContext) => void } {
  return {
    install: (ctx) => {
      installShapeDeclare(ctx, spec);
    },
    bot: shapeDeclareBot(spec),
  };
}
