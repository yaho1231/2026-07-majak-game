/**
 * draft — 증강을 **무엇을 기준으로 고를 것인가.**
 *
 * ## 무엇이 문제였나
 *
 * 봇의 드래프트는 파워 티어표 하나만 봤다. 그건 "이 증강이 센가"를 말하는 표이고,
 * 그것만 보면 **네 봇이 전부 같은 기준으로 고른다.** 같은 선택지가 오면 넷이 같은
 * 답을 내므로, 성격이 여섯 가지여도 덱은 한 종류다.
 *
 * 그리고 그건 사람이 뽑는 방식도 아니다. 사람은 두 가지를 더 본다.
 *
 *   1. **나한테 맞는가** — 잘 미는 사람은 리치 증강을, 잘 접는 사람은 방어 증강을
 *      같은 파워라도 더 높게 본다. 취향이 아니라 자기 플레이와의 궁합이다.
 *   2. **지금 모으는 것과 붙는가** — 이미 점수 증강 둘을 들었으면 세 번째 점수 증강은
 *      액면가보다 값나간다. "덱을 짜고 있다"는 감각이 여기서 나온다.
 *
 * ## 왜 곱셈인가
 *
 * 궁합과 시너지는 파워를 **대체하지 않고 기울인다.** SS+ 방어 증강은 공격형에게도
 * 여전히 D티어 리치 증강보다 낫다 — 성격은 비슷한 값 사이에서 갈리는 것이지,
 * 명백히 센 것을 버리게 만드는 것이 아니다. 곱셈이면 그 성질이 저절로 지켜진다.
 *
 * 계열(`AugmentCategory`)로 궁합을 정의한 것도 같은 이유다. 증강 id를 하나하나
 * 적어 두면 새 증강이 들어올 때마다 표를 고쳐야 하지만, 계열은 증강 정의가 이미
 * **반드시 선언하는 값**이라 새 증강이 저절로 분류된다.
 */

import type { AugmentCategory, AugmentDef } from "@majak/core";
import type { ArchetypeName, BotProfile } from "./profile.js";

/**
 * 원형별 계열 궁합 (1.0 = 중립). 적어 두지 않은 계열은 1.0이다.
 *
 * 값의 폭을 0.75~1.35로 좁게 둔 것이 요점이다 — 성격이 파워를 뒤엎으면 봇이
 * 자기 취향에 맞는 약한 증강을 집는 바보가 된다. 비슷한 것 사이에서만 갈린다.
 */
const AFFINITY: Record<ArchetypeName, Partial<Record<AugmentCategory, number>>> = {
  /** 공격형 — 리치를 걸고 점수를 키운다. 방어는 취향이 아니다 */
  attacker: { riichi: 1.3, scoring: 1.15, defense: 0.8 },
  /** 수비형 — 막고 본다. 남을 건드리는 것보다 자기 안전 */
  defender: { defense: 1.35, info: 1.15, riichi: 0.85, disrupt: 0.9 },
  /** 속공형 — 울고 손을 바꿔 빨리 간다. 타점 증강은 느리다 */
  speedster: { call: 1.35, hand: 1.2, shape: 1.1, scoring: 0.85 },
  /** 타점형 — 크게 만든다. 손을 여는 증강은 멘젠을 깬다 */
  valueHunter: { scoring: 1.35, shape: 1.2, riichi: 1.1, call: 0.75 },
  /** 균형형 — 표 그대로 */
  balanced: {},
  /** 변덕형 — 판을 흔드는 쪽이 재미있다 */
  wildcard: { disrupt: 1.3, info: 1.2, etc: 1.2 },
};

/** 같은 계열을 이미 들고 있을 때 한 장당 붙는 값 */
const SYNERGY_PER_HELD = 0.08;
/** 시너지 상한 — 한 계열로만 몰려 손이 한쪽으로 굳는 것을 막는다 */
const SYNERGY_CAP = 0.24;

export interface DraftContext {
  profile: BotProfile;
  /** 지금 들고 있는 증강 id */
  held: readonly string[];
  /** id → 정의 (보유 증강의 계열을 알아내는 데 쓴다) */
  catalog: ReadonlyMap<string, AugmentDef>;
  /** 증강의 파워 점수 (코어 티어표) */
  powerOf: (id: string) => number;
  /** 봇이 발동 판단을 할 수 없는 증강 — 뽑아 봐야 게임 내내 놀린다 */
  unusable: readonly string[];
}

/**
 * 이 선택지의 값. 클수록 뽑고 싶다.
 *
 * 파워 × 성격 궁합 × (1 + 계열 시너지). 봇이 못 쓰는 액티브는 크게 깎는다 —
 * 완전히 0으로 두지는 않는다(다른 선택지가 전부 그것뿐일 수 있다).
 */
export function draftScore(def: AugmentDef, ctx: DraftContext): number {
  const base = ctx.powerOf(def.id);
  const fit = AFFINITY[ctx.profile.archetype][def.category] ?? 1;

  let sameCategory = 0;
  for (const id of ctx.held) {
    if (ctx.catalog.get(id)?.category === def.category) sameCategory++;
  }
  const synergy = 1 + Math.min(SYNERGY_CAP, sameCategory * SYNERGY_PER_HELD);

  /**
   * **파일 위의 불변식이 실제로는 깨져 있었다.**
   *
   * "궁합과 시너지는 파워를 대체하지 않고 기울인다"고 적어 놓고 두 배수를 그대로
   * 곱했다. 폭은 궁합 0.75~1.35 × 시너지 1~1.24 = **2.23배**인데, 인접 파워 티어의
   * 간격은 실측 1.26배쯤이다(코어 티어표 점수 16~47, 컷 사이 간격). 즉 성격 궁합
   * 하나로 **티어 두 개를 통째로 뒤집을 수 있었다** — A티어를 놔두고 B티어를,
   * 때로는 C티어를 집는다. 극단(SS+ vs D)에서만 불변식이 지켜지고 실제 선택이
   * 일어나는 중간 구간에서는 지켜지지 않았다.
   *
   * 그래서 두 배수를 곱한 **기울기 전체에 제곱근**을 씌워 폭을 좁힌다. 방향과 순서는
   * 그대로이고(단조 증가), 최대 폭이 1.67배 → **1.29배**가 되어 인접 티어 하나
   * 언저리에 머문다. 상수를 하나 더 만들지 않고 성질로 묶는 편이 낫다 — 표를 고쳐도
   * 불변식이 저절로 따라온다.
   */
  const tilt = Math.sqrt(fit * synergy);

  const usable = ctx.unusable.includes(def.id) ? UNUSABLE_PENALTY : 1;
  return base * tilt * usable;
}

/** 봇이 발동 판단을 못 하는 증강에 곱하는 값 — 사실상 후순위로 민다 */
const UNUSABLE_PENALTY = 0.25;

/**
 * 값이 셀수록 가팔라지는 정도. 성격의 흔들림(`noise`)이 이 안에서 완만하게 만든다.
 *
 * 지수라서 **비율**로 판단한다 — 최선값의 90%짜리는 자주, 45%짜리는 드물게 뽑힌다.
 * 파워가 절대값이 아니라 비율로 들어오므로 티어표의 눈금이 바뀌어도 성질이 따라온다.
 */
const DRAFT_SHARPNESS = 2.5;

/** 균등난수를 뽑아낼 눈금 (rng는 `int(n)`만 준다 — 리플레이 계약을 바꾸지 않는다) */
const RNG_RESOLUTION = 1 << 20;

/**
 * 뽑을 증강을 고른다.
 *
 * ## 왜 최고점을 그대로 집지 않는가
 *
 * 예전에는 최고점을 집고 **최선값의 몇 %(wobble) 안에 있는 것들 사이에서만** 흔들었다.
 * 그 폭이 실측 3~6%라, 220판 2,596픽에서 **D티어 7종이 691번 제시되고 픽이 0**이었다
 * (`qa-lab/findings/bot.md` 확정 1). 파워 ≤21 구간이 통째로 전멸이다.
 *
 * 그건 "가끔 흔들린다"가 아니라 **카드 풀이 사람과 다르다**는 뜻이다. 봇 셋이 영영
 * 들지 않는 증강 7종은 대인전에서 사라지고, 티어표 하단은 아레나로 검증할 표본이
 * 아예 쌓이지 않는다(표가 만든 표본으로 그 표를 검증하는 순환).
 *
 * 그래서 **절대 문턱(밴드)이 아니라 비율 가중 추첨**으로 바꾼다. 최선값 대비 비율의
 * 거듭제곱을 가중치로 쓰면
 *   - 순서는 그대로다 — 센 것이 항상 더 자주 뽑힌다(단조),
 *   - 격차가 클수록 아래쪽이 급격히 드물어진다(파워를 뒤엎지 않는다),
 *   - 그래도 **0은 아니다** — 사람이 가끔 낮은 티어를 집는 것과 같다.
 *
 * ## 봇이 못 쓰는 증강은 그대로 제외한다
 *
 * `unusable`(BOT_UNUSABLE)은 뽑아 봐야 게임 내내 놀리는 카드다. 흔들림을 넓히면서
 * 이것까지 같이 열면 봇이 빈 칸을 들고 다니게 되므로, 추첨 **모집단에서 뺀다** —
 * 다만 선택지가 전부 그것뿐이면 어쩔 수 없이 그중에서 고른다.
 */
export function chooseDraft(
  choices: readonly AugmentDef[],
  ctx: DraftContext,
  rng: { int(n: number): number },
): AugmentDef | undefined {
  if (choices.length === 0) return undefined;

  // 봇이 못 쓰는 것은 모집단에서 뺀다 (전부 그것뿐이면 그대로 둔다)
  const usable = choices.filter((def) => !ctx.unusable.includes(def.id));
  const pool = usable.length > 0 ? usable : choices;

  const scored = pool.map((def) => ({ def, score: Math.max(0, draftScore(def, ctx)) }));
  // 값 내림차순 — 안정 정렬이라 동점은 제시 순서를 지킨다(리플레이 결정론)
  scored.sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (best === undefined) return undefined;
  if (best.score <= 0) return best.def;

  /**
   * 성격이 가파름을 정한다. 흔들림이 작은 수비형은 표에 가깝게, 변덕형은 훨씬
   * 평평하게 뽑는다 — 탁이 한 종류의 덱으로 채워지지 않게 하는 것이 원래 목적이다.
   */
  const gamma = DRAFT_SHARPNESS / (0.5 + ctx.profile.noise);

  let total = 0;
  const weights = scored.map((s) => {
    const w = Math.pow(s.score / best.score, gamma);
    total += w;
    return w;
  });

  // rng는 `int(n)`만 준다 — 눈금으로 나눠 균등난수를 만든다.
  // int()가 0을 주면 u=0이라 **항상 최고점**이 나온다(기존 테스트의 결정론 계약).
  const u = rng.int(RNG_RESOLUTION) / RNG_RESOLUTION;
  let acc = 0;
  for (let i = 0; i < scored.length; i++) {
    acc += (weights[i] as number) / total;
    if (u < acc) return (scored[i] as { def: AugmentDef }).def;
  }
  return best.def;
}
