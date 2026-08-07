/**
 * 도감 계열 필터 + 마작 규칙 문안 회귀 가드.
 *
 * 계열 필터: 증강이 100종을 넘어 한 화면에서 훑는 게 불가능해졌다. 계열(AugmentDef
 * .category)은 이미 카탈로그로 넘어오고 있었는데 도감에서만 안 쓰고 있었다. 칩 목록은
 * `AUGMENT_CATEGORIES`(코어의 단일 진실)를 돌아야 한다 — 클라가 계열을 따로 나열하면
 * 새 계열이 늘 때 조용히 빠진다.
 *
 * 규칙 문안: 울기 세 가지의 한국어 표기는 치·퐁·깡이다. "폰"·"캉"은 실제로 쓰는 사람이
 * 없는 표기라 초보자가 게임 안 버튼(치/퐁/깡)과 설명을 연결하지 못했다.
 *
 * 클라를 렌더하지 않는 **정적 소스 스캔**이다 — `roundResultPanel.test.ts`와 같은 방식.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUGMENT_CATEGORIES } from "@majak/core";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");

/** `function CodexScreen(` 부터 다음 최상위 함수 선언 직전까지 */
function codexSource(): string {
  const start = SRC.indexOf("function CodexScreen(");
  expect(start).toBeGreaterThan(0);
  const rest = SRC.slice(start + 1);
  const end = rest.indexOf("\nfunction ");
  expect(end).toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe("증강 도감 — 계열 필터", () => {
  const body = codexSource();

  it("계열 목록을 코어에서 받아 온다 (클라가 따로 나열하지 않는다)", () => {
    expect(body).toContain("AUGMENT_CATEGORIES");
    expect(SRC).toMatch(/import \{[^}]*AUGMENT_CATEGORIES[^}]*\} from "@majak\/core"/);
    expect(AUGMENT_CATEGORIES.length).toBeGreaterThan(0);
  });

  it("고른 계열이 실제 목록 필터에 걸린다", () => {
    expect(body).toContain("m.cat.category !== category");
  });

  it("전 계열에 칩 스타일(색)이 준비돼 있다", () => {
    expect(CSS).toContain(".codex-cat-on[class*=\"aug-cat-\"]");
    for (const c of AUGMENT_CATEGORIES) {
      expect(CSS, `${c} 계열 색이 없다`).toContain(`.aug-cat-${c}`);
    }
  });
});

describe("마작 규칙 문안 — 울기 표기", () => {
  it("치·퐁·깡으로 쓴다", () => {
    expect(SRC).toContain("울기 — 치 · 퐁 · 깡");
  });

  it("'폰'·'캉' 표기가 남아 있지 않다", () => {
    const start = SRC.indexOf("울기 — 치 · 퐁 · 깡");
    const section = SRC.slice(start, start + 600);
    expect(section).not.toContain("폰");
    expect(section).not.toContain("캉");
  });
});
