/**
 * 티어 자동 조정 — 실전 성적으로 드래프트 확률을 서서히 움직인다.
 *
 * 사용자 확정(2026-08-03): **20판마다 / 티어별 승률 상위 10%는 반 단계 상향**.
 * 티어 간 경계가 서서히 섞이도록 **하위 10%는 반 단계 하향**도 함께 적용한다
 * (한 방향으로만 밀면 결국 전부 최상위로 몰려 표가 굳는다).
 *
 * ## 무엇을 움직이는가
 *
 * 티어 **라벨**(SS+/S+/…)은 손으로 관리하는 설계 문서(`powerTier.ts`·docs/20)의
 * 것이고, 여기서 움직이는 것은 **드래프트 가중치뿐**이다. 라벨까지 자동으로 갈아
 * 끼우면 "왜 이 티어인가"의 근거(p·s·u·f 평가)와 코드가 갈라져 밸런스 판단의
 * 기준을 잃는다. 조정값은 원본을 덮어쓰지 않고 별도로 누적되므로 언제든 되돌릴 수 있다.
 *
 * ## 반 단계란
 *
 * 티어 순서(SS+ … D)에서 **한 칸의 절반**만큼 가중치를 옮긴다. 예를 들어 A(0.85)가
 * 반 단계 상향되면 S(0.55)와의 중간인 0.70이 된다. 정수 티어로 튀지 않고 이웃
 * 티어 사이를 연속적으로 오가므로, 표가 계단이 아니라 완만한 분포가 된다.
 *
 * 이 파일은 순수 계산만 한다 — 집계·영속화는 서버(`AugmentStatsStore`)의 몫이다.
 */

import {
  AUGMENT_POWER_TIERS,
  POWER_TIER_ORDER,
  POWER_TIER_WEIGHT,
} from "./powerTier.js";
import type { PowerTier } from "./powerTier.js";

/** 조정 주기 — 이만큼의 게임이 기록되면 한 번 재계산한다 */
export const ADJUST_EVERY_GAMES = 20;

/** 각 티어에서 위·아래로 얼마씩 뽑는가 (0.1 = 상위 10% / 하위 10%) */
export const ADJUST_FRACTION = 0.1;

/**
 * 조정 대상이 되기 위한 최소 표본. 한두 판 성적으로 티어가 흔들리면 조정이
 * 노이즈를 증폭하기만 한다.
 */
export const MIN_SAMPLE = 10;

/** 누적 반 단계의 상한 — 원래 티어에서 두 단계(반 단계 ×4) 넘게는 벗어나지 않는다 */
export const MAX_HALF_STEPS = 4;

/** 증강 하나의 실전 집계 */
export interface AugmentRecord {
  /** 이 증강을 보유한 채 끝난 게임 수 */
  games: number;
  /** 그중 1위로 끝난 수 */
  wins: number;
}

/** 증강 id → 누적 반 단계 (양수 = 더 강한 것으로 취급 = 덜 나온다) */
export type TierOffsets = Readonly<Record<string, number>>;

/**
 * 티어와 누적 반 단계로 최종 드래프트 가중치를 구한다.
 *
 * `halfSteps`가 양수면 더 강한(= 더 희귀한) 쪽으로, 음수면 약한 쪽으로 옮긴다.
 * 티어 사이는 선형 보간이라 반 단계가 그대로 "이웃 티어와의 중간값"이 된다.
 * 표의 양끝(SS+·D)을 넘어서지는 않는다.
 */
export function weightForOffset(tier: PowerTier, halfSteps: number): number {
  const last = POWER_TIER_ORDER.length - 1;
  const base = POWER_TIER_ORDER.indexOf(tier);
  if (base < 0) return 1;
  // 인덱스 0이 가장 강하다 — 상향(양수)은 인덱스를 줄이는 방향이다
  const pos = Math.min(last, Math.max(0, base - halfSteps / 2));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const wLo = POWER_TIER_WEIGHT[POWER_TIER_ORDER[lo] as PowerTier];
  const wHi = POWER_TIER_WEIGHT[POWER_TIER_ORDER[hi] as PowerTier];
  if (lo === hi) return wLo;
  return wLo + (wHi - wLo) * (pos - lo);
}

/** 증강 id의 현재 드래프트 가중치 (티어표 + 누적 조정). 미등재는 균등 1.0 */
export function adjustedWeight(id: string, offsets: TierOffsets = {}): number {
  const tier = AUGMENT_POWER_TIERS[id]?.tier;
  if (tier === undefined) return 1;
  return weightForOffset(tier, offsets[id] ?? 0);
}

/** 표본이 충분한 증강만 승률과 함께 돌려준다 */
function rated(
  records: Readonly<Record<string, AugmentRecord>>,
): { id: string; tier: PowerTier; rate: number }[] {
  const out: { id: string; tier: PowerTier; rate: number }[] = [];
  for (const [id, rec] of Object.entries(records)) {
    if (rec.games < MIN_SAMPLE) continue;
    const tier = AUGMENT_POWER_TIERS[id]?.tier;
    if (tier === undefined) continue;
    out.push({ id, tier, rate: rec.wins / rec.games });
  }
  return out;
}

/**
 * 한 번의 조정을 계산한다 — **티어별로** 상위 10%는 +1 반 단계, 하위 10%는 −1.
 *
 * 티어별로 나눠 뽑는 이유: 전체에서 한 번에 뽑으면 상위권은 늘 SS+가 차지하고
 * 하위권은 늘 D라, 정작 조정이 필요한 중간 티어가 영영 움직이지 않는다.
 *
 * 동률은 id 순으로 잘라 결정적이다(같은 입력 → 같은 출력).
 */
export function computeAdjustment(
  records: Readonly<Record<string, AugmentRecord>>,
  current: TierOffsets = {},
): TierOffsets {
  const next: Record<string, number> = { ...current };
  const byTier = new Map<PowerTier, { id: string; rate: number }[]>();
  for (const r of rated(records)) {
    const list = byTier.get(r.tier);
    if (list === undefined) byTier.set(r.tier, [{ id: r.id, rate: r.rate }]);
    else list.push({ id: r.id, rate: r.rate });
  }

  for (const list of byTier.values()) {
    // 승률 내림차순, 동률은 id 오름차순 — 결정적 정렬
    const sorted = [...list].sort((a, b) => b.rate - a.rate || a.id.localeCompare(b.id));
    const k = Math.floor(sorted.length * ADJUST_FRACTION);
    if (k < 1) continue; // 티어 안 표본이 10개 미만이면 이번엔 건드리지 않는다
    for (const { id } of sorted.slice(0, k)) {
      next[id] = clampSteps((next[id] ?? 0) + 1);
    }
    for (const { id } of sorted.slice(-k)) {
      next[id] = clampSteps((next[id] ?? 0) - 1);
    }
  }
  return next;
}

function clampSteps(v: number): number {
  return Math.max(-MAX_HALF_STEPS, Math.min(MAX_HALF_STEPS, v));
}

/** 조정 결과를 드래프트가 바로 쓸 수 있는 가중치 표로 편다 */
export function weightsFromOffsets(offsets: TierOffsets): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of Object.keys(AUGMENT_POWER_TIERS)) {
    out[id] = adjustedWeight(id, offsets);
  }
  return out;
}
