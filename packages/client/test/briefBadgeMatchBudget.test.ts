/**
 * 카드 배지는 **가장 빡빡한 한도**를 말해야 한다 (2026-08-23 사용자 지적).
 *
 * 매치 예산(`동풍전 N회 · 반장전 M회` 또는 `게임 내 N회`)과 `국당 1회`를 **함께** 가진
 * 증강이 있다. 그때 배지에 국당 한도만 적으면 카드가 «매 국 1회»라고 말하는데 실제로는
 * 게임 전체에 한두 번뿐이라, 드래프트에서 그 증강의 값을 **정반대로** 읽게 된다.
 *
 * 2026-08-22 표기 통일에서 정확히 그 일이 났다 — `단색세계`·`개벽`은
 * `동풍전1·반장전2`가, `등가교환`은 `게임 2회`가 «매 국 1회»로 덮였다. 구현은 그대로였고
 * 원문(description·detail)도 매치 예산을 그대로 적고 있었는데 **카드 배지만** 뒤집혔다.
 *
 * 그래서 배지와 원문을 대조한다: **원문 머리말이 매치 예산을 말하면 카드도 말해야 한다**
 * (배지 또는 요약 본문 어디든). 반대는 강제하지 않는다 — 쿨다운형 `2국에 1회`처럼
 * 매치 예산이 없는 표기가 정상이다.
 *
 * 배지 하나로 못 박지 않는 이유: `만년 오야`처럼 **본체는 상시이고 곁가지만 매치 예산**인
 * 증강이 있다("(상시 · 연장은 게임 내 3회)"). 그런 카드의 배지는 «상시»가 맞고, 예산은
 * 본문이 말한다. 뒤집힌 셋은 배지와 본문 **양쪽에서** 사라졌으므로 이 그물에 걸린다.
 */

import { describe, expect, it } from "vitest";
import { contentAugments } from "@majak/content";
import { AUGMENT_BRIEF } from "../src/augmentBrief.js";

/** "(동풍전 1회 · 반장전 2회 · 매 국 1회)" 같은 머리말 */
function prefixOf(def: { description: string }): string {
  return /^\(([^)]*)\)/.exec(def.description)?.[1] ?? "";
}

/** 매치(게임 전체) 예산을 말하는 표기인가 */
function saysMatchBudget(text: string): boolean {
  return /동풍전\s*\d+|게임\s*내?\s*\d+\s*회|게임\s*\d+\s*회/.test(text);
}

describe("증강 카드 배지 — 매치 예산을 숨기지 않는다", () => {
  const offenders: string[] = [];
  for (const def of contentAugments) {
    const brief = AUGMENT_BRIEF[def.id];
    if (brief === undefined) continue;
    const prefix = prefixOf(def);
    if (!saysMatchBudget(prefix)) continue;
    if (!saysMatchBudget(brief.use) && !saysMatchBudget(brief.text)) {
      offenders.push(`${def.id}: 원문 "(${prefix})" ↔ 배지 "${brief.use}" / 본문 "${brief.text}"`);
    }
  }

  it("원문이 매치 예산을 말하는 증강은 카드도 말한다 (배지 또는 본문)", () => {
    expect(offenders).toEqual([]);
  });

  it("검사 자체가 살아 있다 — 대상 증강이 실제로 존재한다", () => {
    // 규약이 도는지 확인한다. 0종이면 위 검사가 아무것도 안 보고 통과한다.
    const covered = contentAugments.filter(
      (d) => AUGMENT_BRIEF[d.id] !== undefined && saysMatchBudget(prefixOf(d)),
    );
    expect(covered.length).toBeGreaterThan(10);
  });

  it("국당 한도가 함께 있으면 본문이 그 사실을 말한다", () => {
    const missing: string[] = [];
    for (const def of contentAugments) {
      const brief = AUGMENT_BRIEF[def.id];
      if (brief === undefined) continue;
      const prefix = prefixOf(def);
      if (!saysMatchBudget(prefix)) continue;
      if (!/매 국 1회|국당 1회|한 국에 1회/.test(prefix)) continue;
      if (!/국당 1회|매 국 1회/.test(brief.text)) {
        missing.push(`${def.id}: "${brief.text}"`);
      }
    }
    expect(missing).toEqual([]);
  });
});
