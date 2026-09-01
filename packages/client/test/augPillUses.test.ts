/**
 * 횟수형 증강의 «n회» 잔량 칩이 pill에서 **다시 사라지지 않게** 하는 구조 가드.
 *
 * 이 표시는 세 번 고쳐졌고 세 번 다시 사라졌다(2026-08-12 · 08-15 · 08-31 사용자 보고:
 * "날치기 같은 횟수형 증강이 몇 회 남았는지 안 나온다"). 채널(`uses:{id}`)도, 서버가
 * 실어 보내는 값도, CSS도 매번 멀쩡했다 — 매번 같은 자리에서 깨졌다:
 *
 *   `augmentPillStatus`에 **증강 전용 분기를 새로 추가하면서** 그 분기가 잔량을 합치지
 *   않고 곧바로 `return {...}` 해 버린다. 그 증강을 든 사람의 «n회»는 그 분기가 켜지는
 *   순간 통째로 묻힌다. 화면에는 상태 뱃지만 남으니 «횟수가 안 나온다»가 된다.
 *
 * 그래서 분기 하나하나가 아니라 **규약 자체**를 잠근다: 분기 구역의 모든 return은
 * `withUses(...)`(상태 + 잔량) 또는 `usesStatus`(잔량만)를 지나가야 한다. 새 증강 분기를
 * 규약 밖으로 쓰면 이 테스트가 먼저 걸린다.
 *
 * 정적 소스 스캔이다(이 패키지에는 jsdom이 없다 — polishBatchG.test.ts와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

/** `augmentPillStatus` 본문 (선언부터 최상위 닫는 중괄호까지) */
function pillStatusBody(): string {
  const start = APP.indexOf("function augmentPillStatus(");
  expect(start).toBeGreaterThan(0);
  const end = APP.indexOf("\n}\n", start);
  expect(end).toBeGreaterThan(start);
  return APP.slice(start, end);
}

describe("횟수형 증강 잔량 칩 — pill에서 사라지지 않는다", () => {
  it("잔량은 어떤 증강 전용 분기보다 **먼저** 계산된다", () => {
    const body = pillStatusBody();
    const uses = body.indexOf("const usesStatus");
    const withUses = body.indexOf("const withUses");
    // 첫 증강 전용 분기 — 지금은 선발동 종료 표식(`spent:`)이 맨 앞이다.
    const firstBranch = body.indexOf("if (av[`spent:");
    expect(uses).toBeGreaterThan(0);
    expect(withUses).toBeGreaterThan(uses);
    expect(firstBranch).toBeGreaterThan(withUses);
  });

  it("분기 구역의 모든 return이 withUses/usesStatus를 지나간다", () => {
    const body = pillStatusBody();
    const region = body.slice(body.indexOf("if (av[`spent:"));
    const offenders = region
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith("return "))
      .filter((line) => !/^return (usesStatus;|withUses\()/.test(line));
    // 규약 밖으로 나가는 return이 있으면 그 증강의 «n회»가 화면에서 묻힌다.
    expect(offenders).toEqual([]);
  });

  it("잔량 칩과 게이지를 실제로 그린다", () => {
    // 값이 있어도 그리는 곳이 없으면 결과는 같다(«안 나온다»).
    expect(APP).toContain("aug-pill-chip");
    expect(APP).toContain("aug-pill-gauge");
    expect(APP).toContain("{status.chip}");
  });
});
