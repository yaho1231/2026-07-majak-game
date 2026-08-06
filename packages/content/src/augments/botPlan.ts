/**
 * botPlan — 증강 봇 정책을 **각본이 아니라 의도**로 쓴다.
 *
 * ## 무엇이 문제였나
 *
 * 정책 62개를 세어 보면 실체가 드러난다. **23개가 "제시되면 무조건 발동"** 한 줄이고,
 * 발동 강도를 밝힌 것은 **단 2개**다. 나머지 60개는 파워 티어표에서 나온 기본값을
 * 썼는데, 그 표는 "이 증강이 센가"를 말할 뿐 **"지금 쓸 때인가"** 는 말하지 않는다.
 *
 * 그래서 봇은 이런 짓을 했다.
 *   - 1순째, 아무 위협도 없는데 이면투시를 태워 정보를 버린다.
 *   - 4샹텐 잡손에 점수 배율 증강을 걸어 놓고 그 국을 그냥 흘린다.
 *   - 상대가 아무도 안 위험한데 방어 증강을 켠다.
 *
 * 타이밍을 신경 쓴 정책들(안개·위험 감지·무적·승부수)은 **각자 자기 파일에 같은
 * 조건문을 복붙**해 두고 있었다 — `!someoneRiichi && turnCount < N → null`.
 * 증강이 100개 더 들어오면 그 복붙도 100번 늘어난다. 차터의 목표("증강 1000개를
 * 엔진 수정 없이")가 봇 쪽에서 깨지는 지점이 정확히 여기다.
 *
 * ## 어떻게 바꾸나
 *
 * 정책이 **두 가지만** 말하게 한다.
 *
 *   1. `intent` — 이 증강이 만들어 내는 이득의 **종류**. (지키는가? 손을 미는가?
 *      값을 키우는가? 보는가? 남을 방해하는가? 나중을 위한 포석인가?)
 *   2. `pick`   — 발동한다면 **어느 선택지**인가. 이건 증강마다 정말로 다르다.
 *
 * "지금이 때인가"는 정책이 답하지 않는다. 그건 증강이 아니라 **판**에 달린 문제이고,
 * 판은 봇이 이미 읽어 두었다(`BotDecisionContext`). 그래서 여기 한 곳에서 답한다.
 *
 * 새 증강을 붙이는 일이 "조건문을 어떻게 쓸까"에서 "이 증강은 무엇을 하는 물건인가"로
 * 바뀐다 — 후자는 증강을 만든 사람이 이미 아는 답이다.
 *
 * ## 무엇을 여전히 정책이 정하는가
 *
 * `pick`은 일반화하지 않는다. "어느 패를 바꿀까", "누구를 지목할까", "어느 영상패를
 * 집을까"는 그 증강의 규칙 자체이고, 공통 규칙으로 뭉갤 수 있는 것이 아니다.
 * 일반화되는 것은 **언제·얼마나 급하게**이고, 그건 전부 판에서 나온다.
 */

import { BOT_WEIGHT, augmentValueMultiplier } from "@majak/core";
import type {
  AugmentBotPolicy,
  BotAugmentChoice,
  BotAugmentOption,
  BotDecisionContext,
} from "@majak/core";

/**
 * 증강이 만들어 내는 이득의 종류.
 *
 * 계열(`AugmentCategory`)과 다르다 — 계열은 "무엇을 건드리는가"(표시·연출 분류)고,
 * 의도는 "**어떤 이득을 언제 주는가**"다. 예를 들어 같은 `info` 계열이라도 상대
 * 대기를 보는 것은 `defend`(위험할 때 값이 있다)이고 우라도라를 보는 것은
 * `inform`(늦게 봐도 손해가 적다)이다.
 */
export type AugmentIntent =
  /** 지금 화료가 걸렸다 / 역만이 확정된다 — 놓치면 국이 끝난다 */
  | "win"
  /** 방총·실점을 막는다 — 위협이 실재할 때만 값이 있다 */
  | "defend"
  /** 손이 실제로 전진한다 — 아직 화료를 노릴 시간이 있어야 값이 있다 */
  | "advance"
  /** 손이 비싸진다 — **이길 손에만** 값이 붙는다 */
  | "score"
  /** 정보를 얻는다 — 볼 것이 생긴 뒤라야 값이 있다 */
  | "inform"
  /** 상대를 방해한다 — 방해할 만한 상대가 있어야 값이 있다 */
  | "disrupt"
  /** 나중을 위한 포석 — 회수할 시간이 남아 있어야 값이 있다 */
  | "setup"
  /**
   * 손을 **통째로 갈아엎는다** — 잡손일수록 값이 난다.
   *
   * `advance`와 방향이 정반대라 따로 세웠다. 전진은 "가까울수록 밀 값이 있다"이고,
   * 갈아엎기는 **가까운 손을 흩으면 손해**다. 2026-08-06 측정에서 개벽·짝수의 세계를
   * `advance`로 묶었다가 순위 −0.0037 ± 0.0094로 미세하게 밀렸는데, 원인이 이것이었다 —
   * 적기 게이트가 **그 물건이 가장 필요한 자리(잡손)에서 정확히 막고** 있었다.
   */
  | "rewrite";

/** 의도별 기준 강도 — `BOT_WEIGHT`의 어휘를 그대로 쓴다 */
const BASE_WEIGHT: Record<AugmentIntent, number> = {
  win: BOT_WEIGHT.win,
  defend: BOT_WEIGHT.defend,
  advance: BOT_WEIGHT.advance,
  score: BOT_WEIGHT.advance,
  disrupt: BOT_WEIGHT.normal,
  setup: BOT_WEIGHT.setup,
  inform: BOT_WEIGHT.info,
  rewrite: BOT_WEIGHT.advance,
};

/**
 * 의도별 **최소 적기(適期)** — 이보다 판이 안 맞으면 발동을 미룬다.
 *
 * 0으로 두면 예전과 같다(제시되면 무조건 발동). 정보·포석처럼 "늦게 써도 손해가
 * 적은" 것일수록 문턱이 높다 — 아껴 두는 쪽이 이득이기 때문이다.
 */
const MIN_READINESS: Record<AugmentIntent, number> = {
  win: 0,
  defend: 0.2,
  advance: 0.15,
  score: 0.15,
  disrupt: 0.25,
  setup: 0.25,
  inform: 0.35,
  rewrite: 0.2,
};

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/**
 * 이 국에 아직 시간이 남아 있는가 0~1.
 * 손을 밀거나 포석을 까는 일은 회수할 순목이 없으면 값이 0에 가깝다.
 */
function timeLeft(ctx: BotDecisionContext): number {
  return clamp01(ctx.wallLeft / 40);
}

/**
 * **지금이 이 의도에 맞는 때인가** 0(전혀 아니다) ~ 1(바로 지금이다).
 *
 * 전부 봇이 이미 읽어 둔 판(`BotDecisionContext`)에서만 나온다 — 증강을 모르고도
 * 답할 수 있는 질문이라 한 곳에 모을 수 있다.
 */
export function readiness(intent: AugmentIntent, ctx: BotDecisionContext): number {
  switch (intent) {
    case "win":
      return 1;

    // 지킬 것이 있어야 지킨다. 위협이 0이면 방어 증강은 그냥 낭비다.
    case "defend":
      return clamp01(ctx.threat);

    // 손을 미는 일은 아직 갈 길이 있고 시간도 있을 때 값이 있다.
    // 이미 텐파이면 밀 곳이 없고, 5샹텐이면 한 번 밀어도 닿지 않는다.
    case "advance":
      return ctx.tenpai
        ? 0.3
        : clamp01(1 - Math.max(0, ctx.shanten) / 5) * timeLeft(ctx);

    // 값을 키우는 일은 **이길 손에만** 값이 붙는다. 4샹텐 잡손에 배율을 걸어 봐야
    // 그 국을 흘릴 뿐이다 — 봇이 실제로 하던 낭비가 이것이다.
    case "score": {
      const close = ctx.tenpai ? 1 : clamp01(1 - Math.max(0, ctx.shanten) / 3) * timeLeft(ctx);
      // 1000점짜리 손에 배율을 걸어 봐야 그 국을 흘릴 뿐이다 — 값이 붙을 손이어야 한다
      const worth = clamp01(myHandPoints(ctx) / 5000);
      return close * (0.5 + 0.5 * worth);
    }

    /**
     * 정보는 **쓸 데가 있을 때** 값이 있다. 셋 중 하나면 된다 —
     * 지금 위험하거나(막는 데 쓴다), 내 손이 그 정보를 쓸 만큼 여물었거나
     * (텐파이의 뒷도라·영상패), 판이 무르익어 볼 것이 쌓였거나.
     * 셋 다 아니면(1순째 4샹텐, 아무도 아무것도 안 함) 그냥 태우는 것이다.
     */
    case "inform":
      return Math.max(
        clamp01(ctx.threat),
        ctx.tenpai ? 1 : clamp01(1 - Math.max(0, ctx.shanten) / 3),
        clamp01((ctx.turn - 3) / 8),
      );

    // 방해는 방해할 만한 상대가 있을 때. 아무도 아무것도 안 하는 1순에 쓰는 것은 낭비다.
    case "disrupt":
      return Math.max(clamp01(ctx.threat), clamp01((ctx.turn - 4) / 10));

    /**
     * 갈아엎기는 **손이 멀수록** 값이 난다 — 전진(advance)과 정확히 반대 방향이다.
     * 텐파이·1샹텐을 흩는 것은 손해이므로 0에 가깝고, 3샹텐부터 제값이 된다.
     * 회수할 순목이 없으면 어차피 의미가 없어 시간은 똑같이 곱한다.
     */
    case "rewrite":
      return clamp01((Math.max(0, ctx.shanten) - 1) / 3) * timeLeft(ctx);

    /**
     * 포석은 회수할 시간이 남아 있을 때만 — 그리고 **회수할 국이 남아 있을 때만.**
     * 올라스에 까는 포석은 다음 국이 없어 값이 없다.
     */
    case "setup":
      return ctx.placement.allLast ? 0 : clamp01(1 - ctx.turn / 12) * timeLeft(ctx);
  }
}

/**
 * **내가 든 증강을 얹은** 내 손 값어치.
 *
 * `ctx.handPoints`는 봇이 평범한 손으로 계산한 값이다 — 뚫린 천장(상한 없음)이나
 * 밀실의 도라(안깡당 +4판)를 들고 있어도 그 사실이 들어가 있지 않다. 그래서 점수를
 * 키우는 증강이 "이 손에 걸 만한가"를 물을 때, **이미 비싼 손을 싸구려로 보고** 접었다.
 *
 * 표(`AUGMENT_PLAY`)는 상시 효과만 센다 — "지금 발동할까"는 여기가 아니라 의도가 답한다.
 */
function myHandPoints(ctx: BotDecisionContext): number {
  // 뷰가 최소 형태(players 없음)일 수 있다 — 정책은 판을 모르고도 답할 수 있어야 한다
  const mine = (ctx.view.players ?? []).find((p) => p.id === ctx.holder)?.augments ?? [];
  return ctx.handPoints * augmentValueMultiplier(mine);
}

/**
 * 순위가 **점수의 값어치 자체를 바꾼다.**
 *
 * 올라스 선두에게 추가 점수는 거의 쓸모가 없다 — 원하는 건 국이 조용히 끝나는
 * 것이다. 그래서 점수를 키우는 증강은 값이 떨어지고, 막는 증강은 값이 오른다.
 * 꼴찌는 정확히 반대다. 봇의 버림·리치가 쓰는 것과 **같은 축**(riskAppetite)이라
 * 증강 판단만 따로 놀지 않는다.
 *
 * 2026-08-05까지 이 문맥에는 점수판이 아예 없어서, 증강은 동1국과 올라스에서
 * 똑같이 발동했다.
 */
function placementTilt(intent: AugmentIntent, ctx: BotDecisionContext): number {
  const appetite = ctx.placement.riskAppetite; // -1(지킨다) ~ +1(뒤집는다)
  if (intent === "score" || intent === "win") return clamp01(1 + appetite * 0.35);
  if (intent === "defend") return clamp01(1 - appetite * 0.3);
  return 1;
}

export interface AugmentPlanSpec {
  /** 이 증강이 만들어 내는 이득의 종류 — 강도와 타이밍이 여기서 나온다 */
  intent: AugmentIntent;
  /**
   * 발동한다면 **어느 선택지**인가. 없으면 null(발동할 것이 없다).
   *
   * 여기서는 "무엇을 고를까"만 본다. "지금이 때인가"는 보지 않는다 — 그건 판의
   * 문제라 planner가 답한다. 순수 함수여야 한다(부수효과 금지).
   */
  pick(ctx: BotDecisionContext): BotAugmentOption | null;
  /**
   * **이 순을 넘기면 기회가 사라지는가.**
   *
   * 배패 직후에만 제시되는 선언, 남의 버림에 반응하는 커스텀 콜처럼 "지금 아니면
   * 없는" 발동은 적기를 따질 이유가 없다 — 미룰 수가 없기 때문이다.
   * true면 타이밍 문턱을 건너뛰고, 강도만 판에 맞춰 조정된다.
   *
   */
  /** 함수로 주면 **판을 보고 정한다** (미래를 보는 자: 무장 뒤의 교환은 미룰 수 없다) */
  fleeting?: boolean | ((ctx: BotDecisionContext) => boolean);
  /**
   * 게임·국에 **한 번뿐인가.** 한 번뿐이면 어중간한 자리에서 태우지 않고 아낀다
   * (문턱이 올라간다). 매 순 다시 쓸 수 있는 증강은 지금 안 써도 손해가 없으므로
   * 이 값이 필요 없다.
   */
  oneShot?: boolean;
}

/** `plan()`이 만든 정책 — 의도가 밖에서 보인다(커버리지 테스트·도구용) */
export interface PlannedPolicy extends AugmentBotPolicy {
  readonly intent: AugmentIntent;
}

/** 한 번뿐인 발동에 얹는 추가 문턱 — 어중간한 자리에서 태우지 않는다 */
const ONE_SHOT_BAR = 0.2;

/*
 * ## `fleeting` 재검토 기록 (2026-08-06)
 *
 * 정책 63개 중 46개가 `fleeting: true`였다 — "이 순을 넘기면 기회가 사라진다"는 뜻인데,
 * 세어 보니 상당수는 그런 발동이 아니라 **자기 순이면 언제든 되는** 것이었다. 그것들은
 * planner의 적기 판단을 통째로 건너뛰어, 1순에 아무 이유 없이 태우고 있었다.
 *
 * 한 번에 다 건드리지 않고 배치로 나눠 `plantime` 스위치로 쟀다.
 *
 * - **1차 6종 채택** (무장해제·기생충·재장전·연금술사·염색·날치기) — 순위 −0.0025 ± 0.0081로
 *   **중립.** 개선을 확인한 것이 아니라 손해 없음을 확인했고 모형이 더 옳아졌다.
 * - **2차 5종 반려** (삼원의 의지·마작의 거신병·소환 등) — 순위 −0.0037 ± 0.0094로 밀렸다.
 *   원인은 **의도의 방향**이었다: 손을 통째로 갈아엎는 물건을 `advance`로 묶으니 적기가
 *   "가까울수록 값이 있다"로 계산돼 **그 물건이 가장 필요한 자리(잡손)에서 막았다.**
 * - 그래서 `rewrite` 의도를 만들고 짝수의 세계·개벽을 다시 세웠더니 같은 시드에서
 *   **부호가 뒤집혔다** (+0.0037 ± 0.0045).
 *
 * 스위치는 임시 비계라 채택·반려가 끝난 지금 지웠다. 남은 `fleeting`들은 다시 훑어
 * 대부분 옳게 붙어 있음을 확인했다(정책이 자기 타이밍을 직접 보거나, 첫 순·리액션 전용).
 */


/**
 * 의도 하나로 봇 정책을 만든다.
 *
 * ```ts
 * bot: plan({
 *   intent: "inform",
 *   pick: ({ options }) => options.find((o) => o.type === ACTION) ?? null,
 * }),
 * ```
 *
 * 이 한 줄이 예전의 "제시되면 무조건 발동" + 각 파일에 복붙된 타이밍 조건문을
 * 함께 대신한다. 강도(`weight`)도 여기서 나오므로 정책이 숫자를 직접 쓸 일이 없다.
 */
export function plan(spec: AugmentPlanSpec): PlannedPolicy {
  return {
    intent: spec.intent,
    choose(ctx: BotDecisionContext): BotAugmentChoice | null {
      const option = spec.pick(ctx);
      if (option === null) return null;

      const fit = readiness(spec.intent, ctx) * placementTilt(spec.intent, ctx);
      const fleeting =
        typeof spec.fleeting === "function" ? spec.fleeting(ctx) : spec.fleeting === true;
      if (!fleeting) {
        const bar = MIN_READINESS[spec.intent] + (spec.oneShot === true ? ONE_SHOT_BAR : 0);
        if (fit < bar) return null; // 아직 때가 아니다 — 다음 순에 다시 본다
      }

      // 의도가 기준 강도를 정하고, 적기가 그 안에서 위아래로 흔든다.
      // (0.55~1.0 — 때가 어중간해도 발동은 발동이라 바닥을 둔다)
      return { option, weight: BASE_WEIGHT[spec.intent] * (0.55 + 0.45 * fit) };
    },
  };
}
