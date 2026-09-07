/**
 * profile — 봇마다 다른 "성격".
 *
 * ## 왜 원형(archetype)인가
 *
 * 예전에는 성격값 넷을 **각각 따로** 뽑았다. 그러면 두 가지가 어긋난다.
 *
 * 1. **앞뒤가 안 맞는 사람이 나온다.** 저돌적이면서 아무것도 안 울고 다마텐만 고르는
 *    봇은 사람으로 읽히지 않는다 — 사람의 성향은 서로 얽혀 있다. 잘 미는 사람은
 *    대개 리치도 잘 걸고, 타점을 노리는 사람은 대개 손을 잘 안 연다.
 * 2. **다 비슷해진다.** 독립 난수를 넷 뽑아 평균 근처를 두껍게 만들면 넷 다 중앙값
 *    언저리로 몰린다. 탁에 앉은 넷이 미묘하게 다른 같은 사람이 된다.
 *
 * 그래서 지금은 **원형을 하나 뽑고**, 그 원형의 값에 작은 흔들림만 준다. 원형끼리는
 * 뚜렷이 다르고, 같은 원형의 두 봇은 미묘하게 다르다 — 실제 탁의 모습이 그렇다.
 *
 * ## 성격은 규칙이 아니라 저울이다
 *
 * 어떤 성격값도 판단 **분기**를 만들지 않는다. 전부 이미 있는 계산의 양쪽에 곱해지는
 * 가중치로만 붙는다(`discard.scales`, `lineEV`, `evOfCall`, `gainOfKan`). 그래서
 * 원형을 하나 더 추가해도 로직이 갈라지지 않고, 새 판단을 붙여도 성격이 저절로 따라온다.
 *
 * 성격은 **시드 PRNG로 결정론적으로** 뽑는다 — 리플레이가 깨지지 않는다.
 */

import type { Prng } from "@majak/core/engine/random/Prng.js";

/** 원형 이름 — 로그·리플레이 분석에서 사람이 읽는 이름 */
export type ArchetypeName =
  | "attacker"
  | "defender"
  | "speedster"
  | "valueHunter"
  | "balanced"
  | "wildcard";

export interface BotProfile {
  /** 이 봇의 원형 */
  archetype: ArchetypeName;
  /** 0(신중) ~ 1(저돌) — 상대 리치에 맞서 미는 정도 */
  aggression: number;
  /** 0(멘젠파) ~ 1(뭐든 운다) — 손을 여는 문턱 */
  callLoose: number;
  /** 0(다마텐 선호) ~ 1(무조건 리치) */
  riichiLoose: number;
  /**
   * 0(속도 우선) ~ 1(타점 우선).
   * 같은 손을 **싸게 빨리** 먹을지 **비싸게 천천히** 먹을지 — 사람마다 확실히 갈리는
   * 취향이고, 어느 쪽도 틀리지 않는다. 그래서 EV를 뒤엎지 않고 기울이기만 한다.
   */
  valueBias: number;
  /** 0(즉흥) ~ 1(참을성) — 증강을 아껴 두는 정도 */
  patience: number;
  /**
   * 0(기계적 최적) ~ 1(자주 흔들린다).
   * **비슷한 선택지 사이에서만** 흔들린다 — 사람도 쓸모가 엇비슷한 두 패 중 무엇을
   * 버릴지는 그날그날 다르다. 손해가 큰 선택은 이 값이 1이어도 고르지 않는다.
   */
  noise: number;
  /**
   * 0(현물주의) ~ 1(스지면 민다) — **스지를 얼마나 믿는가**.
   *
   * 스지는 사실이 아니라 **읽기**다. 량면 론이 지워진다는 것까지는 규칙이지만, 그래서
   * 이 패를 내도 되느냐는 판단이고 사람마다 확실히 갈린다. 저돌적인 사람은 스지를
   * 밀 구실로 쓰고("스지니까 통한다"), 수비적인 사람은 현물이 있는 한 스지에 손을
   * 대지 않는다 — 스지 걸기에 쏘여 본 사람의 태도다.
   *
   * 다른 성격값과 마찬가지로 **분기를 만들지 않는다.** `suji.waitFactor`가 지우는
   * 량면 몫에 곱해지는 저울일 뿐이라, 이 값이 0이어도 계산은 그대로 돌아간다
   * (스지를 아예 안 본 값이 나올 뿐이다).
   */
  sujiTrust: number;
  /**
   * 0(정직) ~ 1(허세) — **손해가 없을 때** 세 보이게 두는 정도.
   * 접은 국에도 중장패를 흘려 아직 미는 것처럼 보이게 한다. 안전도가 사실상 같은
   * 후보 사이에서만 작동하므로 값을 치르지 않는 거짓말이다.
   */
  bluff: number;
  /**
   * 0(확인된 것만 믿는다) ~ 1(신호를 액면대로 받는다) — **증강 신호를 얼마나 믿는가**.
   *
   * 개벽이 터진 것은 사실이지만 "그래서 지금 자일색 텐파이다"는 **추정**이다. 그 추정을
   * 받는 태도는 사람마다 갈린다 — "그거 안 나와" 하고 자기 손을 미는 사람과 "역만
   * 신호에 자패는 절대 안 낸다"는 사람. `aggression`이 실점 전체를 어떻게 저울질하느냐라면,
   * 이 값은 **그 실점 추정 자체를 얼마나 크게 보느냐**다. 둘은 얽혀 있지만 같지 않다 —
   * 타점형은 밀기 자체는 보통이지만 역만 신호는 무겁게 받는다.
   *
   * 분기가 아니라 저울이다. `collect.credenceScale`이 표가 준 **텐파이 하한**에 곱할
   * 뿐이고(값어치에는 안 곱한다), 오픈 리치의 공개 대기 같은 **사실**에는 곱하지 않는다.
   * 0.5에서 정확히 1이라 표의 값 그대로다. 원형은 전부 0.5 이하다 — **아무도 표를 부풀리지
   * 않고**, 공격 쪽만 깎는다. 수비형에 0.7~0.9를 줘 봤더니 도라 넷 텐파이까지 접었다(실측).
   */
  credence: number;
  /** 생각 시간 배율 — 사람처럼 들쭉날쭉하게 */
  tempo: number;
  /**
   * 0(초보) ~ 1(숙련) — **난이도.** 기본 1이면 종전 봇과 한 치도 다르지 않다.
   *
   * 이 저장소에는 **난이도라는 개념 자체가 없었다**(`difficulty`로 검색해도 게임과
   * 관련된 것이 하나도 나오지 않는다). 사람이 붙는 자리인데 세 봇이 언제나 같은
   * 실력이면, 처음 앉은 사람은 이길 수 없고 익숙해진 사람은 이길 이유가 없다.
   *
   * **분기를 만들지 않는다** — 성격값과 같은 규율이다(파일 위 §"성격은 규칙이 아니라
   * 저울이다"). 이 값이 하는 일은 세는 무게를 깎고(`bot/skill.ts`), `discard.wobble`이
   * "엇비슷하다"고 보는 폭과 **고르기의 온도**를 정하는 것뿐이다. 그러면 봇은
   * **판단을 못 하는 것이 아니라 고르기를 흔들려서** 진다 —
   * 사람이 실수하는 모습과 같고, 규칙을 몰라 이상한 수를 두는 것과는 다르다.
   * 값이 1이면 폭이 정확히 종전과 같아 기존 측정·테스트가 전부 그대로 유효하다.
   */
  skill: number;
}

type Archetype = Omit<BotProfile, "archetype" | "tempo" | "skill">;

/**
 * 원형표. 값이 서로 **얽혀 있다는 것**이 핵심이다 —
 * 예를 들어 타점형은 손을 안 열고(callLoose↓) 참을성이 있으며(patience↑) 다마텐을
 * 고르는(riichiLoose↓) 한 사람이지, 그 셋을 따로 뽑아 우연히 모인 값이 아니다.
 */
const ARCHETYPES: Record<ArchetypeName, Archetype> = {
  /** 공격형 — 밀고, 걸고, 물러서지 않는다 */
  attacker: {
    aggression: 0.85,
    callLoose: 0.55,
    riichiLoose: 0.85,
    valueBias: 0.45,
    patience: 0.25,
    // 스지를 '통한다'의 근거로 삼는다 — 미는 사람에게 스지는 밀 구실이다
    sujiTrust: 0.9,
    // "그거 안 나와" — 역만 신호를 보고도 자기 손이 빠르면 자패를 낸다
    credence: 0.2,
    noise: 0.3,
    bluff: 0.5,
  },
  /** 수비형 — 방총을 극히 싫어하고, 아니다 싶으면 일찍 접는다 */
  defender: {
    aggression: 0.15,
    callLoose: 0.3,
    riichiLoose: 0.35,
    valueBias: 0.5,
    patience: 0.75,
    // 현물이 있는 한 스지에 손대지 않는다 — 스지 걸기에 쏘여 본 사람의 태도다
    sujiTrust: 0.28,
    // 표의 값 그대로 받는다. 0.7~0.9로 올려 봤더니 도라 넷 텐파이까지 접었다(실측) —
    // 그건 수비가 아니라 겁이다. 수비형의 수비는 신호를 부풀리는 게 아니라 실점을 무겁게 저울질하는 데서 나온다(aggression)
    credence: 0.5,
    noise: 0.15,
    bluff: 0.4,
  },
  /** 속공형 — 싸도 좋으니 빨리. 뭐든 울어서 텐파이를 잡는다 */
  speedster: {
    aggression: 0.6,
    callLoose: 0.9,
    riichiLoose: 0.7,
    valueBias: 0.12,
    patience: 0.3,
    // 깊게 안 읽는다. 스지면 낸다 — 손이 싸서 잃을 것도 적다
    sujiTrust: 0.72,
    // 남의 손을 깊게 안 읽는다 — 내 손이 빠르면 그게 답이다
    credence: 0.3,
    noise: 0.35,
    bluff: 0.3,
  },
  /** 타점형 — 멘젠으로 크게. 잘 안 울고, 비싸질 때까지 기다린다 */
  valueHunter: {
    aggression: 0.5,
    callLoose: 0.12,
    riichiLoose: 0.45,
    valueBias: 0.9,
    patience: 0.85,
    // 비싼 손을 들고 있으니 방총 한 방이 뼈아프다 — 스지를 액면대로 믿지 않는다
    sujiTrust: 0.42,
    // 표의 값 그대로 — 비싼 손을 지키는 것은 aggression·valueBias가 이미 한다
    credence: 0.5,
    noise: 0.2,
    bluff: 0.55,
  },
  /** 균형형 — 교과서대로 */
  balanced: {
    aggression: 0.5,
    callLoose: 0.5,
    riichiLoose: 0.6,
    valueBias: 0.5,
    patience: 0.5,
    // 교과서 — 현물 다음이 스지, 스지 다음이 벽
    sujiTrust: 0.6,
    // 표의 값 그대로
    credence: 0.5,
    noise: 0.25,
    bluff: 0.35,
  },
  /** 변덕형 — 읽히지 않는 사람. 비슷한 자리에서 매번 다르게 두고 허세가 잦다 */
  wildcard: {
    aggression: 0.7,
    callLoose: 0.65,
    riichiLoose: 0.75,
    valueBias: 0.5,
    patience: 0.2,
    // 읽히지 않는 사람 — 스지도 그날 기분대로다(흔들림이 큰 만큼 폭도 넓다)
    sujiTrust: 0.68,
    // 남의 신호에 크게 개의치 않는다
    credence: 0.4,
    noise: 0.8,
    bluff: 0.8,
  },
};

export const ARCHETYPE_NAMES = Object.keys(ARCHETYPES) as ArchetypeName[];

/** 같은 원형의 두 봇이 완전히 같지는 않도록 주는 흔들림의 크기 */
const JITTER = 0.08;

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** 문자열이 원형 이름인가 — 클라이언트가 보낸 값을 그대로 믿지 않으려고 쓴다 */
export function isArchetypeName(s: string): s is ArchetypeName {
  return (ARCHETYPE_NAMES as string[]).includes(s);
}

/**
 * 시드 난수로 성격을 뽑는다 — 먼저 **원형 하나**, 그 다음 작은 흔들림.
 * 원형은 균등하게 뽑는다(탁에 여러 성향이 섞이는 것이 목적이다).
 *
 * `forced`를 주면 원형만 그 값으로 고정하고 흔들림·템포는 그대로 뽑는다(방장이 대기실에서
 * 성향을 지정한 자리). 이때도 원형 뽑기 난수는 **버리지 않고 그대로 소모한다** —
 * 그래야 지정 여부와 상관없이 뒤따르는 난수열이 같아 재현이 어긋나지 않는다.
 */
export function rollProfile(rng: Prng, forced?: ArchetypeName): BotProfile {
  const rolled = ARCHETYPE_NAMES[rng.int(ARCHETYPE_NAMES.length)] ?? "balanced";
  const name = forced ?? rolled;
  const base = ARCHETYPES[name];
  const shake = (v: number): number => clamp01(v + (rng.next() - 0.5) * 2 * JITTER);
  return {
    archetype: name,
    aggression: shake(base.aggression),
    callLoose: shake(base.callLoose),
    riichiLoose: shake(base.riichiLoose),
    valueBias: shake(base.valueBias),
    patience: shake(base.patience),
    sujiTrust: shake(base.sujiTrust),
    credence: shake(base.credence),
    noise: shake(base.noise),
    bluff: shake(base.bluff),
    tempo: 0.6 + rng.next() * 0.9,
    skill: 1,
  };
}

/** 이름으로 원형 하나를 그대로 만든다 (테스트·재현용 — 흔들림 없음) */
export function profileOf(name: ArchetypeName, tempo = 1): BotProfile {
  return { archetype: name, ...ARCHETYPES[name], tempo, skill: 1 };
}

// ─────────────────────────── 탁 전체를 한 번에 뽑는다 ───────────────────────────

/**
 * **탁에 앉는 봇 셋의 성격을 함께 뽑는다.**
 *
 * 예전에는 봇마다 따로 `rollProfile`을 불렀고, 원형은 여섯 중 균등 추첨이었다.
 * 독립 추첨 셋이 서로 겹칠 확률은 1 − (6·5·4)/6³ = **44%** — 즉 두 판에 한 번 꼴로
 * 탁에 같은 성향이 둘 앉는다. 게다가 같은 원형의 두 봇은 흔들림이 ±0.08뿐이라
 * **거의 구별되지 않는다.** "탁에 여러 성향이 섞이는 것이 목적"이라고 적어 놓고
 * 그 목적이 절반은 달성되지 않고 있었다.
 *
 * 한 자리씩 뽑되 **이미 앉은 원형은 후보에서 뺀다.** 자리 수(3)가 원형 수(6)보다
 * 적으므로 언제나 서로 다른 셋이 나온다. 자리가 원형보다 많으면 다 쓴 뒤 다시 채운다.
 *
 * `forced`(방장이 지정한 자리)는 그대로 존중하고, 지정된 원형만 남은 후보에서 뺀다 —
 * 지정이 있는 방에서도 나머지 자리가 그것과 겹치지 않는다.
 */
export function rollTableProfiles(
  rng: Prng,
  count: number,
  forced: readonly (ArchetypeName | undefined)[] = [],
): BotProfile[] {
  let pool: ArchetypeName[] = [];
  const take = (): ArchetypeName => {
    if (pool.length === 0) pool = [...ARCHETYPE_NAMES];
    const i = rng.int(pool.length);
    return pool.splice(i, 1)[0] ?? "balanced";
  };
  const out: BotProfile[] = [];
  for (let i = 0; i < count; i++) {
    const fixed = forced[i];
    if (fixed !== undefined) {
      // 지정된 원형은 남은 후보에서 빼 둔다 (뽑기 난수는 소모하지 않는다)
      if (pool.length === 0) pool = [...ARCHETYPE_NAMES];
      const j = pool.indexOf(fixed);
      if (j >= 0) pool.splice(j, 1);
      out.push(rollProfile(rng, fixed));
      continue;
    }
    out.push(rollProfile(rng, take()));
  }
  return out;
}

// ─────────────────────────── 난이도 ───────────────────────────

/** 방 설정에 노출하는 난이도 이름 */
export type BotDifficulty = "easy" | "normal" | "hard";

/**
 * 난이도 → `skill`.
 *
 * `hard`가 1.0(= 지금까지의 봇)이고 나머지는 그보다 아래다. **위로 열지 않는 것이
 * 요점이다** — 지금의 봇이 이 저장소가 만들 수 있는 가장 잘 두는 봇이므로, `hard`를
 * 1보다 크게 두면 존재하지 않는 실력을 파는 셈이 된다.
 */
export const DIFFICULTY_SKILL: Readonly<Record<BotDifficulty, number>> = {
  easy: 0.35,
  normal: 0.7,
  hard: 1,
};

/** 성격에 난이도를 입힌다 (성격 자체는 그대로 — `skill` 한 칸만 바뀐다) */
export function withDifficulty(profile: BotProfile, difficulty: BotDifficulty): BotProfile {
  return { ...profile, skill: DIFFICULTY_SKILL[difficulty] };
}

/** 문자열이 난이도 이름인가 — 클라이언트가 보낸 값을 그대로 믿지 않으려고 쓴다 */
export function isBotDifficulty(s: string): s is BotDifficulty {
  return s === "easy" || s === "normal" || s === "hard";
}

/** 테스트·기본값용 중립 성격 */
export const NEUTRAL_PROFILE: BotProfile = profileOf("balanced");
