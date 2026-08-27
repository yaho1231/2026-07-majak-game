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
 * ## 2026-08-27 (사용자 지시) — **국 첫 순 한정 + 모드별 쿨다운**
 *
 * 두 가지가 바뀌었다.
 *
 * 1. **쿨다운이 매치 길이를 탄다** — 동풍전 2국 / 반장전 3국(`scaledCooldown`).
 *    2국 고정은 국이 두 배 도는 반장전에서 매치당 발동 횟수를 그대로 두 배로 만들었다.
 * 2. **국의 첫 순에만 선언할 수 있다** — 예전에는 자기 순이면 국 중 아무 때나 켤 수
 *    있어, 손이 굳은 뒤 "지금 켜면 텐파이"인 순간만 골라 태우는 결과 확인형 카드였다.
 *    이제는 배패만 보고 **먼저** 이번 국을 걸어야 하고, 상대는 국 내내 그 사실을 안다.
 *    첫 순 판정은 `atHolderFirstTurn`(= `discardCount === 0`) — 일확천금·통째로
 *    바꾸기와 같은 규약이다.
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
import {
  atHolderFirstTurn,
  cooldownReady,
  cooldownUse,
  flagOf,
  roundViewKey,
  scaledCooldown,
  trackRoundSeq,
} from "../util.js";
import { handAlteredKey } from "./handAltered.js";
import { handKindsOf } from "./botHelpers.js";
import { plan } from "./botPlan.js";
import { roundScopedKey } from "./roundScope.js";

/**
 * 한 번 쓰면 이만큼 국(본장 포함)이 지나야 다시 열린다 — 셋 공통.
 *
 * **동풍전 2국 / 반장전 3국** (2026-08-27 밸런스 웨이브). 예전에는 모드와 무관하게
 * 2국 고정이라, 국이 두 배 도는 반장전에서 매치당 발동 횟수가 그대로 두 배였다.
 */
export const SHAPE_COOLDOWN_TONPUU_ROUNDS = 2;
export const shapeCooldownRounds = (state: GameState): number =>
  scaledCooldown(state, SHAPE_COOLDOWN_TONPUU_ROUNDS);

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
      /*
       * **국의 첫 순에만** 선언할 수 있다 (2026-08-27 사용자 지시).
       *
       * 예전에는 자기 순이면 국 중 아무 때나 켤 수 있어, 손이 다 굳은 뒤에
       * "지금 켜면 텐파이"인 순간만 골라 태우는 **결과를 보고 고르는** 카드였다.
       * 첫 순으로 못박으면 배패만 보고 이번 국을 그 규칙에 걸겠다고 **먼저**
       * 선언해야 한다 — 상대도 국 내내 그 사실을 알고 수비할 수 있다.
       *
       * 판정 규약은 일확천금·통째로 바꾸기와 같다(`discardCount === 0`).
       */
      if (!atHolderFirstTurn(state, req.player)) {
        return "only on the first turn of the round";
      }
      if (!cooldownReady(state, spec.id, req.player, shapeCooldownRounds(state))) {
        return "on cooldown";
      }
      if (shapeRuleOn(state, spec.id, req.player)) return "already on";
      return null;
    },
    toEvents: (req, { state }) => [
      augmentDataSet(onKey(spec.id, state, req.player), true),
      ...cooldownUse(state, spec.id, req.player, shapeCooldownRounds(state)),
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
  trackRoundSeq(ctx, spec.id, shapeCooldownRounds);

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
   *
   * 첫 순이 아니거나 쿨다운이 남았을 때도 후보를 내지 않는다 — 눌러 봐야 거절될 버튼을
   * 띄우면 화면이 "지금 쓸 수 있다"고 말하는 셈이다(박무·함구령과 같은 규약).
   */
  ctx.holderTurnOptions((state) =>
    state.round.byPlayer[holder]?.riichi != null ||
    !atHolderFirstTurn(state, holder) ||
    !cooldownReady(state, spec.id, holder, shapeCooldownRounds(state))
      ? []
      : [{ type: spec.action, payload: {} }],
  );
}

/** 봇이 첫 순에 태울 최소 샹텐 이득 (아래 주석 참고) */
const BOT_MIN_GAIN = 2;

/**
 * 봇 정책 — 손을 **전진시키는** 물건이라 `advance`다.
 *
 * ## 2026-08-27 — 첫 순 한정이 되면서 문턱을 올렸다
 *
 * 예전에는 "지금 켜서 샹텐이 1이라도 줄면 켠다"였다. 그때는 국 중 **아무 때나** 켤 수
 * 있어 나중에 더 좋은 순간이 오면 그때 켜면 됐고, 창을 놓쳐도 손해가 크지 않았다.
 * 이제 후보가 뜨는 순간은 **국의 첫 순 한 번뿐**이라 그 문턱을 그대로 두면 봇은
 * 배패에서 흔히 나오는 1 이득에 매번 반사적으로 태우고, 그 국을 이미 써 버린 채
 * 다음 두세 국을 잠긴 채로 보낸다. 그래서 **2 이상**을 요구한다 — 배패 단계에서
 * 샹텐이 2 줄어든다는 것은 그 규칙이 이 손의 모양과 실제로 맞는다는 뜻이다.
 * (첫 순에 이미 텐파이가 서는 손이면 문턱을 건너뛴다 — 그건 놓칠 수 없다.)
 */
export function shapeDeclareBot(spec: ShapeDeclareSpec): AugmentBotPolicy {
  return plan({
    intent: "advance",
    fleeting: (ctx) => declareGain(spec, ctx.view, ctx.holder).tenpai,
    pick: (ctx) => {
      const option = ctx.options.find((o) => o.type === spec.action);
      if (option === undefined) return null;
      const { gain, tenpai } = declareGain(spec, ctx.view, ctx.holder);
      return tenpai || gain >= BOT_MIN_GAIN ? option : null;
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
