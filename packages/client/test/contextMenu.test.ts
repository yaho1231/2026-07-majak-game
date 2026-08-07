/**
 * 우클릭 차단 — 판에서는 막고, 글자 치는 칸에서는 그대로 둔다.
 *
 * 이 패키지에는 jsdom이 없다(a11yPerfGuards.test.ts와 같은 사정). 그래서 판정 함수만
 * 가짜 요소로 직접 부르고, 부팅 배선은 소스 스캔으로 못을 박는다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isTypingTarget } from "../src/contextMenu.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MAIN = readFileSync(join(HERE, "../src/main.tsx"), "utf8");
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

/** `closest`만 가진 최소 요소 — 실제 DOM 없이 선택자 매칭 여부만 흉내 낸다. */
function el(matches: boolean): EventTarget {
  return { closest: (sel: string) => (matches && sel.includes("input") ? {} : null) } as unknown as EventTarget;
}

describe("우클릭 차단 — 글자 치는 칸은 예외", () => {
  it("입력 칸 안이면 브라우저 메뉴를 살려 둔다 (붙여넣기·비밀번호 관리자)", () => {
    expect(isTypingTarget(el(true))).toBe(true);
  });

  it("판 위(입력 칸 밖)에서는 막는다", () => {
    expect(isTypingTarget(el(false))).toBe(false);
  });

  it("target이 없거나 요소가 아니면 막는 쪽으로 떨어진다", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });

  it("부팅 때 실제로 걸린다", () => {
    expect(MAIN).toContain("blockContextMenu()");
  });
});

/**
 * 우클릭 쯔모기리 — 손패 어디서든 오른쪽 버튼이면 쯔모패가 나간다.
 * 실제 동작은 실게임에서 확인했고(우클릭한 패가 아니라 쯔모패가 버려진다),
 * 여기서는 **조용히 풀릴 수 있는 배선**만 못 박는다.
 */
describe("우클릭 쯔모기리", () => {
  it("설정으로 끌 수 있고, 기본은 켜져 있다", () => {
    expect(APP).toContain("rightClickTsumogiri: true"); // DEFAULT_SETTINGS
    expect(APP).toContain('key: "rightClickTsumogiri"'); // 설정 패널의 한 줄
  });

  it("개별 패가 아니라 손패 상자에 걸린다 (겨냥하지 않아도 되는 것이 요점)", () => {
    expect(APP).toContain("onContextMenu={rightClickDiscard}");
  });

  it("버리는 것은 우클릭한 패가 아니라 **쯔모패**다", () => {
    const fn = APP.slice(APP.indexOf("function rightClickDiscard("));
    expect(fn.slice(0, fn.indexOf("\n  }"))).toContain("discardOptionFor(drawnId)");
  });

  it("오른쪽 버튼이 이미 다른 뜻인 자리에서는 듣지 않는다", () => {
    const fn = APP.slice(APP.indexOf("function rightClickDiscard("));
    const body = fn.slice(0, fn.indexOf("\n  }"));
    // 리치할 패 고르는 중 · 증강 무장 중 · 관전
    expect(body).toContain("isSpectator || props.riichiMode || armedAug !== null");
  });
});
