/**
 * 액티브 증강 무장 ↔ 리치 모드는 동시에 서지 않는다 (2026-09-16 사용자 보고).
 *
 * [리치]를 누른 뒤 ✦ 액티브 증강으로 조커를 쓰려 하면 리치 모드가 살아 있었고, 무장이
 * 풀리는 순간(버튼 재클릭·대상 아닌 패 클릭) 다음 손패 클릭이 리치 선언으로 나갔다.
 * 정적 소스 스캔 — 이 배관은 컨텍스트·상태가 얽혀 통합 테스트 비용이 크다
 * (AutoRespondBeat.test.ts와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

function body(startMarker: string, endMarker: string): string {
  const at = APP.indexOf(startMarker);
  expect(at, startMarker).toBeGreaterThan(0);
  const end = APP.indexOf(endMarker, at);
  expect(end, endMarker).toBeGreaterThan(at);
  return APP.slice(at, end);
}

describe("증강 무장은 리치 모드를 푼다", () => {
  it("useSelection.arm 이 무장할 때 exitRiichiMode 를 부른다", () => {
    const arm = body("const arm = (type: string | null): void => {", "};");
    expect(arm).toContain("exitRiichiMode()");
  });

  it("✦ 액티브 증강의 activate 와 메뉴 열기가 모두 리치 모드를 푼다", () => {
    const activate = body("const activate = (type: string): void => {", "};");
    expect(activate).toContain("sel.exitRiichiMode()");
    const click = body("const click = (): void => {", "// 단색 세계·편식");
    expect(click).toContain("sel.exitRiichiMode()");
  });

  it("GameTable 이 useSelection 에 onRiichiMode 를 넘긴다", () => {
    expect(APP).toContain("useSelection(view, prompt, props.onSubmit, props.onRiichiMode)");
  });
});
