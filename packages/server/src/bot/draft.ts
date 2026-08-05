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

  const usable = ctx.unusable.includes(def.id) ? UNUSABLE_PENALTY : 1;
  return base * fit * synergy * usable;
}

/** 봇이 발동 판단을 못 하는 증강에 곱하는 값 — 사실상 후순위로 민다 */
const UNUSABLE_PENALTY = 0.25;

/**
 * 뽑을 증강을 고른다.
 *
 * 값이 가장 큰 것을 고르되, **엇비슷한 것들 사이에서는 흔들린다** — 버림에서와
 * 같은 이유다(`bot/discard.ts`의 wobble). 넷이 같은 표를 보고 매번 같은 답을 내면
 * 그 자체가 읽히는 정보이고, 무엇보다 탁이 한 종류의 덱으로 채워진다.
 */
export function chooseDraft(
  choices: readonly AugmentDef[],
  ctx: DraftContext,
  rng: { int(n: number): number },
): AugmentDef | undefined {
  if (choices.length === 0) return undefined;
  const scored = choices.map((def) => ({ def, score: draftScore(def, ctx) }));
  let bestScore = -Infinity;
  for (const s of scored) if (s.score > bestScore) bestScore = s.score;

  // 흔들림 폭은 성격이 정하고, 최선값에 비례한다 (파워 격차가 크면 흔들리지 않는다)
  const band = bestScore * ctx.profile.noise * DRAFT_WOBBLE;
  const near = scored.filter((s) => s.score >= bestScore - band);
  return (near[rng.int(near.length)] ?? scored[0])?.def;
}

/** 최선값 대비 흔들릴 수 있는 비율의 상한 (성격이 이 안에서 정한다) */
const DRAFT_WOBBLE = 0.12;
