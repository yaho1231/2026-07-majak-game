/**
 * 2026-08-22 사용자 보고 회귀 가드 — **쯔모패를 손에 넣었는데도 손패가 두 덩이로 갈렸다.**
 *
 * `.hand-drawn` 의 `margin-left`(0.4w)는 "이 패는 아직 손에 넣지 않은 쯔모패다"를 뜻하는
 * 벌어짐이다. 그런데 그 여백이 **패가 어디 있든** 따라다녀서, 수동 정렬(자동정렬 끔)에서
 * 쯔모패를 손패 가운데로 끌어다 놓으면 그 자리에서 손패가 갈라졌다. 손에 넣었는데도
 * 여전히 밖에 있는 것처럼 보이는 셈이다.
 *
 * 고친 방식: 벌어짐을 `.hand-drawn-tail`(맨 끝에 있을 때만 붙는 클래스)로 옮겼다.
 * 금빛 테두리는 `.hand-drawn` 에 그대로 둔다 — "방금 뽑은 패"는 손에 넣은 뒤에도
 * 쓸모 있는 정보다(쯔모기리 판단).
 *
 * 한 줄이면 조용히 되돌아가는 종류라 가드를 둔다. 이 패키지에는 jsdom 이 없어
 * 다른 클라이언트 테스트와 같은 **정적 소스 스캔**이다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");

/** 주석을 걷어낸 CSS — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
const cssCode = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** 선택자 하나의 선언 블록 */
function rule(selector: string): string {
  const at = cssCode.indexOf(`${selector} {`);
  expect(at, `${selector} 규칙이 있어야 한다`).toBeGreaterThan(-1);
  return cssCode.slice(at, cssCode.indexOf("}", at));
}

describe("쯔모패 벌어짐 — 손에 넣으면 붙는다", () => {
  it(".hand-drawn 자체에는 벌어짐이 없다 (어디 있든 따라다니면 안 된다)", () => {
    expect(rule(".hand-drawn")).not.toMatch(/margin-left/);
  });

  it("벌어짐은 .hand-drawn-tail 에만 있다", () => {
    expect(rule(".hand-drawn-tail")).toMatch(/margin-left:\s*calc\(var\(--hand-w\)\s*\*\s*0\.4\)/);
  });

  it("금빛 테두리는 .hand-drawn 에 남는다 — 손에 넣은 뒤에도 읽을 정보다", () => {
    expect(cssCode).toMatch(/\.hand-drawn \.tile-face\s*\{/);
  });

  it("tail 클래스는 **맨 끝일 때만** 붙는다", () => {
    // `isDrawn && idx === displayIds.length - 1 ? " hand-drawn-tail" : ""`
    const at = SRC.indexOf("hand-drawn-tail");
    expect(at).toBeGreaterThan(0);
    const around = SRC.slice(Math.max(0, at - 200), at);
    expect(around).toMatch(/isDrawn\s*&&\s*idx === displayIds\.length - 1/);
  });

  it("레일 폭은 벌어짐을 늘 포함한다 — 넣고 빼도 손패 블록이 흔들리지 않는다", () => {
    // .own-hand-rail 의 width 계산에 0.4w 가 남아 있어야 한다.
    expect(rule(".own-hand-rail")).toMatch(/var\(--hand-w\)\s*\*\s*0\.4/);
  });
});
