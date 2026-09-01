/**
 * 드래프트 페르소나 — **누가 뽑는가**.
 *
 * 봇의 기본 드래프트(`bot/draft.ts`)는 파워 × 원형궁합 × 계열시너지 하나뿐이다.
 * 그 기준 하나로 1만 판을 돌리면 표본은 커지지만 **다양성은 그대로**다 — 낮은
 * 파워 증강은 "다른 둘이 더 나빴을 때"만 손에 들어와, 그 표본으로 격차를 재면
 * 표가 만든 표본으로 그 표를 재는 순환이 된다.
 *
 * 그래서 사람이 실제로 뽑는 방식들을 그대로 옮겨 놓는다. 페르소나는 게임 로직을
 * 건드리지 않고 **decideDraft만** 갈아 끼운다 — 판의 진행은 실대국과 같다.
 */

import type { AugmentDef } from "@majak/core";
import { AUGMENT_POWER_TIERS, AUGMENT_SYNERGY, powerScore } from "@majak/core";

export type PersonaName =
  | "meta"        // 메타 신봉자 — 티어표 최상위만 집는다
  | "synergy"     // 시너지 빌더 — 이미 든 것과 태그가 겹치는 쪽
  | "fun"         // 재미 우선 — 완전 무작위 (편향 없는 기준선)
  | "contrarian"  // 역빌드 — 남들이 안 집는 저파워를 일부러 집는다
  | "category"    // 한 우물 — 첫 픽 계열을 끝까지 밀어붙인다
  | "greedy"      // 눈앞의 수치 — 파워만 보되 약간의 흔들림
  | "archetype";  // 기본 봇 정책 (파워×원형×계열) — 대조군

export const PERSONA_NAMES: readonly PersonaName[] = [
  "meta", "synergy", "fun", "contrarian", "category", "greedy", "archetype",
];

const powerOf = (id: string): number => {
  const e = AUGMENT_POWER_TIERS[id];
  return e === undefined ? 3 : powerScore(e);
};

const tagsOf = (id: string): readonly string[] => AUGMENT_SYNERGY[id]?.tags ?? [];

export interface PickCtx {
  held: readonly string[];
  /** 0~1 난수 (봇 시드에서 파생 — 결정론 유지) */
  rand: () => number;
}

/** 후보 중 하나를 고른다. null이면 호출부가 기본 정책으로 넘긴다. */
export type PersonaPick = (choices: readonly AugmentDef[], ctx: PickCtx) => AugmentDef | null;

const argmax = <T>(xs: readonly T[], f: (x: T) => number): T | null => {
  let best: T | null = null;
  let bestV = -Infinity;
  for (const x of xs) {
    const v = f(x);
    if (v > bestV) { bestV = v; best = x; }
  }
  return best;
};

export const PERSONAS: Record<PersonaName, PersonaPick> = {
  meta: (cs) => argmax(cs, (d) => powerOf(d.id)),

  synergy: (cs, { held }) => {
    const heldTags = new Set(held.flatMap((id) => tagsOf(id)));
    // 파워를 버리지 않는다 — 겹치는 태그 하나당 가산. 시너지는 파워를 기울일 뿐이다.
    return argmax(cs, (d) => {
      const shared = tagsOf(d.id).filter((t) => heldTags.has(t)).length;
      return powerOf(d.id) + shared * 1.6;
    });
  },

  fun: (cs, { rand }) => cs[Math.floor(rand() * cs.length)] ?? null,

  contrarian: (cs) => argmax(cs, (d) => -powerOf(d.id)),

  category: (cs, { held }) => {
    // 첫 픽이 정한 계열을 끝까지 민다 (계열 정보는 정의가 이미 들고 있다)
    if (held.length === 0) return cs[0] ?? null;
    const target = HELD_CATEGORY.get(held[0] as string);
    if (target === undefined) return argmax(cs, (d) => powerOf(d.id));
    return argmax(cs, (d) => powerOf(d.id) + (d.category === target ? 4 : 0));
  },

  greedy: (cs, { rand }) => argmax(cs, (d) => powerOf(d.id) + rand() * 1.2),

  archetype: () => null,
};

/** id → 계열. 러너가 카탈로그를 넘겨 채운다 (계열은 정의에만 있다) */
export const HELD_CATEGORY = new Map<string, string>();

export function registerCatalog(defs: readonly AugmentDef[]): void {
  for (const d of defs) HELD_CATEGORY.set(d.id, d.category);
}
