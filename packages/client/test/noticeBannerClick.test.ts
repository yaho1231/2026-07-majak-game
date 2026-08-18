/**
 * 공지 띠를 펼치는 과녁 회귀 가드.
 *
 * "자세히 ▾"만 과녁이던 시절, 사람들은 제목을 눌러 놓고 아무 일도 안 일어난다고
 * 여겼다 — 특히 손가락으로 누르는 기기에서 그 알약은 너무 작다. 이제 **머리줄
 * 전체**가 과녁이다.
 *
 * 함께 못을 박는 것: 머리줄 안에 `<button>` 을 되살리면 클릭이 부모까지 올라가
 * 두 번 세어지고, 펼치자마자 접힌다. 그래서 "자세히 ▾"는 `<span>` 이어야 한다.
 *
 * 정적 소스 스캔이다(이 패키지에는 jsdom이 없다 — a11yBatchF와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");

function noticeBanner(): string {
  const at = APP.indexOf("function NoticeBanner(");
  expect(at).toBeGreaterThan(0);
  const end = APP.indexOf("\n}\n", at);
  expect(end).toBeGreaterThan(at);
  return APP.slice(at, end);
}

describe("공지 띠는 어디를 눌러도 펼쳐진다", () => {
  it("머리줄 자체가 눌리는 자리다 (clickableProps)", () => {
    const src = noticeBanner();
    expect(src).toMatch(/notice-head-clickable/);
    expect(src).toMatch(/clickableProps\(toggle/);
  });

  it("본문이 없으면 아무것도 안 열리므로 과녁도 없다", () => {
    const src = noticeBanner();
    // hasBody 일 때만 clickableProps 를 펼친다.
    expect(src).toMatch(/hasBody\s*\?\s*\{\s*\.\.\.clickableProps\(toggle/);
  });

  it("머리줄 안에 버튼을 되살리지 않는다 (클릭이 두 번 세어진다)", () => {
    const src = noticeBanner();
    expect(src).not.toMatch(/<button/);
  });

  it("펼침 여부를 스크린리더에도 알린다", () => {
    expect(noticeBanner()).toMatch(/"aria-expanded":\s*open/);
  });

  it("누를 수 있게 보이고, 키보드 포커스도 보인다", () => {
    expect(CSS).toMatch(/\.notice-head-clickable\s*\{[^}]*cursor:\s*pointer/);
    expect(CSS).toMatch(/\.notice-head-clickable:focus-visible/);
  });
});
