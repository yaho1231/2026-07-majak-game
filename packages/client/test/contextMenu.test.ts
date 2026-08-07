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
