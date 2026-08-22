/**
 * **판 위의 작은 상자에는 스크롤막대를 그리지 않는다** (2026-08-23 사용자 지시:
 * "스크롤이 필요없는 부분들에 스크롤이 있어 — 증강 설명·후로 다 빼줘").
 *
 * `overflow: auto`는 «넘칠 때만» 막대를 그리는 규칙처럼 보이지만, macOS의
 * «스크롤 막대 항상 표시»를 켠 사람에게는 넘치든 말든 **항상** 서 있다. 그래서 한
 * 화면에 다 들어오는 증강 설명에도, 후로 두어 개뿐인 줄에도 회색 줄이 그어져 있었다.
 *
 * 막대만 감추고 스크롤 자체는 남긴다 — 휠·터치·드래그로 넘친 내용에 그대로 닿는다.
 * (긴 목록을 담는 상자 — 증강 정보 로그·도감·설정 — 은 그대로 둔다. 거기서는 막대가
 *  «더 있다»는 유일한 신호다.)
 *
 * 정적 CSS 스캔이다(이 패키지에는 jsdom이 없다 — noticeBannerClick과 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");

/** 이 선택자가 어딘가에서 `scrollbar-width: none` 을 받는가 */
function hidesScrollbar(selector: string): boolean {
  const re = new RegExp(`(^|[,{}])[^{}]*\\${selector}\\b[^{}]*\\{[^}]*scrollbar-width:\\s*none`, "m");
  return re.test(CSS);
}

describe("판 위의 상자는 스크롤막대를 그리지 않는다", () => {
  it("증강 설명(펼친 원문)", () => {
    expect(hidesScrollbar(".augdesc-body-full")).toBe(true);
  });

  it("내 후로 줄", () => {
    expect(hidesScrollbar(".own-corner-right")).toBe(true);
  });

  it("인게임 공지 카드", () => {
    expect(hidesScrollbar(".game-notice-float")).toBe(true);
  });

  it("막대만 감추고 스크롤은 남긴다 (내용에 닿을 길이 없어지면 안 된다)", () => {
    expect(CSS).toMatch(/\.augdesc-body-full\s*\{[^}]*overflow-y:\s*auto/);
    expect(CSS).toMatch(/\.own-corner-right\s*\{[^}]*overflow-x:\s*auto/);
    expect(CSS).toMatch(/\.game-notice-float\s*\{[^}]*overflow-y:\s*auto/);
  });

  it("webkit 쪽 막대도 함께 지운다 (Safari·Chrome은 scrollbar-width만으로는 남는 판이 있다)", () => {
    expect(CSS).toMatch(/\.augdesc-body-full::-webkit-scrollbar/);
    expect(CSS).toMatch(/\.own-corner-right::-webkit-scrollbar/);
    expect(CSS).toMatch(/\.game-notice-float::-webkit-scrollbar/);
  });

  it("긴 목록을 담는 상자는 그대로 둔다 (막대가 «더 있다»는 신호다)", () => {
    expect(hidesScrollbar(".auglog-body")).toBe(false);
    expect(hidesScrollbar(".codex-detail")).toBe(false);
  });
});
