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

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
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

/**
 * **배지는 펼쳐도 그대로다** (2026-08-23 사용자 보고: "개벽 인게임에서 횟수가 이상하게 바뀜").
 *
 * 예전 `AugDesc`는 «자세히»를 펼치는 순간 배지를 원문 머리말로 갈아 끼웠다. 개벽은
 * 접으면 「게임 2회」, 펼치면 「게임 2회 · 매 국 1회」 — 같은 자리의 같은 칩이 누를 때마다
 * 다른 횟수를 말했다. 몇 번 쓸 수 있는지를 그 칩으로 읽는 사람에게는 숫자가 흔들린다.
 *
 * 대신 머리말이 배지보다 더 말할 때는 펼친 본문 맨 위에 조건 줄(`augdesc-cond`)로 선다.
 * 머리말은 `expandParas`가 본문에서 떼어 내므로, 그 줄이 없으면 조건이 통째로 사라진다.
 */
describe("배지는 펼쳐도 바뀌지 않는다", () => {
  const HERE = dirname(fileURLToPath(import.meta.url));
  const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
  const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");
  function augDesc(): string {
    const at = APP.indexOf("function AugDesc(");
    expect(at).toBeGreaterThan(0);
    const end = APP.indexOf("\n}\n", at);
    expect(end).toBeGreaterThan(at);
    return APP.slice(at, end);
  }

  it("펼침(showFull) 여부가 배지 글을 고르지 않는다", () => {
    const src = augDesc();
    const use = /const use =\s*([\s\S]*?);\n/.exec(src);
    expect(use).not.toBeNull();
    expect(use?.[1]).not.toMatch(/showFull/);
    expect(use?.[1]).toMatch(/brief\.use/);
  });

  it("배지보다 더 말하는 머리말은 조건 줄로 선다", () => {
    const src = augDesc();
    expect(src).toMatch(/lead\.use !== brief\.use/);
    expect(src).toMatch(/augdesc-cond/);
    expect(CSS).toMatch(/\.augdesc-cond\s*\{/);
  });
});
