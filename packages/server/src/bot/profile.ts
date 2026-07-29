/**
 * profile — 봇마다 다른 "성격".
 *
 * 같은 규칙을 같은 세기로 적용하면 봇 넷이 한 사람처럼 움직인다. 실제 탁에는 잘 미는
 * 사람, 잘 접는 사람, 아무거나 우는 사람이 섞여 있고 그 차이가 사람다움의 큰 부분이다.
 * 성격은 **시드 PRNG로 결정론적으로** 뽑는다 — 리플레이가 깨지지 않는다.
 */

import type { Prng } from "@majak/core/engine/random/Prng.js";

export interface BotProfile {
  /** 0(신중) ~ 1(저돌) — 상대 리치에 맞서 미는 정도 */
  aggression: number;
  /** 0(멘젠파) ~ 1(뭐든 운다) — 후로 문턱 */
  callLoose: number;
  /** 0(다마텐 선호) ~ 1(무조건 리치) */
  riichiLoose: number;
  /** 생각 시간 배율 0.6~1.5 — 사람처럼 들쭉날쭉하게 */
  tempo: number;
}

/** 시드 난수로 성격을 뽑는다. 중앙값 근처가 두껍도록 두 번 뽑아 평균낸다 */
export function rollProfile(rng: Prng): BotProfile {
  const mid = (): number => (rng.next() + rng.next()) / 2;
  return {
    aggression: 0.2 + mid() * 0.7,
    callLoose: 0.15 + mid() * 0.7,
    riichiLoose: 0.3 + mid() * 0.6,
    tempo: 0.6 + rng.next() * 0.9,
  };
}

/** 테스트·기본값용 중립 성격 */
export const NEUTRAL_PROFILE: BotProfile = {
  aggression: 0.5,
  callLoose: 0.5,
  riichiLoose: 0.6,
  tempo: 1,
};
