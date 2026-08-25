/**
 * 티어 자동 조정 — 실전 성적으로 드래프트 확률을 서서히 움직인다.
 *
 * 사용자 확정(2026-08-03): **20판마다 / 티어별 상위 10%는 반 단계 상향**.
 * 티어 간 경계가 서서히 섞이도록 **하위 10%는 반 단계 하향**도 함께 적용한다
 * (한 방향으로만 밀면 결국 전부 최상위로 몰려 표가 굳는다).
 *
 * ## 무엇으로 순위를 매기는가 (2026-08-08)
 *
 * 예전에는 승률(1위율) 하나였다. 그런데 승률만 보면 **"세서 자주 집히는" 증강과
 * "재미있어서 자주 집히는" 증강**을 구분할 수 없고, 표본이 적을 때 1위 한 번이
 * 순위를 통째로 뒤집는다. 지금은 두 값을 합쳐 본다 (`strength`).
 *
 * - **승률** = 1위 수 / 보유 게임 수. 4인이므로 평범한 값이 0.25다.
 * - **픽률** = 선택 수 / 제시 수. 3지선다이므로 평범한 값이 1/3이다.
 *
 * 각각을 그 기준값으로 나눠 "평범 = 1.0"인 축에 올린 뒤 **승률 0.65 · 픽률 0.35**로
 * 섞는다. 픽률에 낮은 가중을 주는 이유는 그것이 파워가 아니라 **선호**를 재기 때문이다 —
 * 재밌어서 늘 집히는 증강이 그 이유만으로 희귀해지면 안 된다. 픽률 표본이 모자라면
 * 그 항은 빼고 승률만 본다.
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
 * 티어 순서(SS+ … D)에서 **한 칸의 절반**만큼 가중치를 옮긴다. 예를 들어 A(0.96)가
 * 반 단계 상향되면 S(0.90)와의 중간인 0.93이 된다. 정수 티어로 튀지 않고 이웃
 * 티어 사이를 연속적으로 오가므로, 표가 계단이 아니라 완만한 분포가 된다.
 *
 * 가중치 자체가 완만해졌으므로(`POWER_TIER_WEIGHT`, 양 끝 1.6배) 상한까지 밀려도
 * 노출이 사라지지는 않는다 — 승률이 아무리 높아도 "조금 덜 나온다"가 끝이다.
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
 * 한 티어에서 조정을 돌리기 위한 최소 종수. 2종이면 위 1 · 아래 1이라 매 주기마다
 * 둘이 반대 방향으로 갈려 표가 흔들리기만 한다. 4종부터는 가운데가 남는다.
 */
export const MIN_TIER_SAMPLE = 4;

/**
 * 조정 대상이 되기 위한 최소 표본(보유 게임 수).
 *
 * 사용자 지시(2026-08-08)로 10 → **5**. 10일 때는 실제 운영 집계에서 문턱을 넘은
 * 증강이 **하나도 없어**(최다 8판) 조정이 20판마다 돌면서 아무것도 움직이지 않았다.
 * 5여도 노이즈는 남지만, 움직이는 폭이 반 단계뿐이고 상한(`MAX_HALF_STEPS`)이
 * 있어 한 번의 운으로 증강이 사라지지는 않는다.
 *
 * 2026-08-25에 집계가 **게임 모드별로** 갈라졌지만(`AugmentStatsStore`) 이 값은
 * 그대로 둔다. 표본이 반으로 쪼개지는 대신 **조정 주기 카운터도 함께 쪼개져서**,
 * 조정이 도는 시점(그 모드의 20판째)에 각 증강이 모아 둔 표본 수는 나누기 전과
 * 같다. 달라지는 것은 첫 조정까지의 현실 시간뿐이라 문턱의 의미는 변하지 않는다.
 */
export const MIN_SAMPLE = 5;

/** 픽률을 신뢰하기 위한 최소 제시 수 — 못 넘으면 그 항을 빼고 승률만 본다 */
export const MIN_OFFERS = 5;

/** 4인 게임의 평범한 1위율 — 승률을 "평범 = 1.0" 축에 올릴 때의 기준값 */
const BASELINE_WIN_RATE = 0.25;

/** 3지선다의 평범한 픽률 — 픽률을 "평범 = 1.0" 축에 올릴 때의 기준값 */
const BASELINE_PICK_RATE = 1 / 3;

/** 강도 지표에서 승률이 차지하는 몫 (나머지가 픽률) */
export const WIN_RATE_SHARE = 0.65;

/**
 * 픽률 항의 상·하한 (평범 = 1.0 축에서).
 *
 * 픽률은 0~1이라 기준값 1/3로 나누면 **최대 3.0**까지 튄다. 그대로 두면 "모두가
 * 늘 고르는 증강"이 승률을 두 배로 올린 증강보다 세게 잡혀, 재미있다는 이유만으로
 * 희귀해진다 — 사용자가 명시적으로 막은 결과다(2026-08-08). 그래서 픽률은
 * **방향만 알려 주고 크기는 제한한다**: 아무리 사랑받아도 강도에 +0.175가 끝이다.
 */
const PICK_RATE_CLAMP = { min: 0.5, max: 1.5 } as const;

/** 누적 반 단계의 상한 — 원래 티어에서 두 단계(반 단계 ×4) 넘게는 벗어나지 않는다 */
export const MAX_HALF_STEPS = 4;

/** 증강 하나의 실전 집계 */
export interface AugmentRecord {
  /** 이 증강을 보유한 채 끝난 게임 수 */
  games: number;
  /** 그중 1위로 끝난 수 */
  wins: number;
  /** 드래프트 3지선다에 제시된 횟수 (예전 파일에는 없다) */
  offered?: number;
  /** 그중 실제로 선택된 횟수 (도박사 지급분은 제외) */
  picked?: number;
}

/**
 * 이 집계의 **강도 지표** — 1.0이 평범, 클수록 세다(= 조금 덜 나오게 민다).
 *
 * 승률과 픽률을 각자의 기준값으로 나눠 같은 축에 올린 뒤 섞는다. 픽률 표본이
 * 모자라면(`MIN_OFFERS` 미만) 승률만으로 본다 — 없는 값을 0으로 치면 잘 안 뜬
 * 증강이 전부 최약체로 몰린다.
 */
export function strengthOf(rec: AugmentRecord): number {
  const win = rec.games > 0 ? rec.wins / rec.games / BASELINE_WIN_RATE : 1;
  const offered = rec.offered ?? 0;
  if (offered < MIN_OFFERS) return win;
  const raw = (rec.picked ?? 0) / offered / BASELINE_PICK_RATE;
  const pick = Math.min(PICK_RATE_CLAMP.max, Math.max(PICK_RATE_CLAMP.min, raw));
  return WIN_RATE_SHARE * win + (1 - WIN_RATE_SHARE) * pick;
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

/** 표본이 충분한 증강만 강도 지표와 함께 돌려준다 */
function rated(
  records: Readonly<Record<string, AugmentRecord>>,
): { id: string; tier: PowerTier; rate: number }[] {
  const out: { id: string; tier: PowerTier; rate: number }[] = [];
  for (const [id, rec] of Object.entries(records)) {
    if (rec.games < MIN_SAMPLE) continue;
    const tier = AUGMENT_POWER_TIERS[id]?.tier;
    if (tier === undefined) continue;
    out.push({ id, tier, rate: strengthOf(rec) });
  }
  return out;
}

/**
 * 한 번의 조정을 계산한다 — **티어별로** 상위 10%는 +1 반 단계, 하위 10%는 −1.
 *
 * 티어별로 나눠 뽑는 이유: 전체에서 한 번에 뽑으면 상위권은 늘 SS+가 차지하고
 * 하위권은 늘 D라, 정작 조정이 필요한 중간 티어가 영영 움직이지 않는다.
 *
 * 10%가 1종이 안 되는 작은 티어도 **최소 1종씩은 움직인다**(2026-08-08). 예전에는
 * `floor(n*0.1) < 1`이면 그 티어를 통째로 건너뛰어, 표본이 10종을 못 넘는 티어
 * (SS+ 2종·D 2종 …)가 영영 조정 밖에 있었다. 위아래가 겹치지 않도록 표본이
 * `MIN_TIER_SAMPLE`종 미만인 티어만 건너뛴다.
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
    // 강도 내림차순, 동률은 id 오름차순 — 결정적 정렬
    const sorted = [...list].sort((a, b) => b.rate - a.rate || a.id.localeCompare(b.id));
    if (sorted.length < MIN_TIER_SAMPLE) continue;
    // 위아래를 겹치지 않게 뽑는다 — 겹치면 같은 증강을 올렸다 내려 아무 일도 안 한다.
    const k = Math.max(1, Math.min(Math.floor(sorted.length / 2), Math.floor(sorted.length * ADJUST_FRACTION)));
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
