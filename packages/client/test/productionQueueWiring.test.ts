/**
 * 연출 큐 규칙이 **App에 실제로 물려 있는가** — 회귀 가드.
 *
 * `productionQueue.ts`는 순수 함수라 그 자체는 `productionQueue.test.ts`가 돌려 본다.
 * 여기서 지키는 것은 그 함수들이 App의 세 지점에 그대로 꽂혀 있는가다 — 하나만 빠져도
 * 큐는 조용히 예전(순수 FIFO·압축 없음)으로 돌아가고, 리치 배너가 다시 증강 컷인
 * 줄 뒤에서 몇 초씩 밀린다(2026-08-17 사용자 보고).
 *
 * 이 패키지에는 jsdom이 없어 컴포넌트를 띄울 수 없다 — 그래서 정적 소스 스캔이다
 * (centerPanelRoundHold.test.ts·qaPredeployClient.test.ts와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

/** 주석을 걷어낸 코드만 — 주석에 적힌 설명이 검사에 걸리지 않게 한다 */
const APP_CODE = APP.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("연출 큐 배선", () => {
  it("큐에 넣을 때 등급 순서를 지킨다 (그냥 push 하지 않는다)", () => {
    expect(APP_CODE).toContain("insertByPriority(productionQueue.current,");
    // 예전의 무조건 맨 뒤 붙이기가 남아 있으면 등급이 무시된다
    expect(APP_CODE).not.toMatch(/productionQueue\.current\.push\(/);
  });

  it("리치 배너가 등급을 달고 나간다", () => {
    // 톤 → 등급 표에 riichi 가 있어야 하고,
    expect(APP_CODE).toMatch(/BANNER_PRIORITY[^=]*=\s*\{\s*riichi:\s*PROD_PRIORITY_RIICHI\s*\}/);
    // showBanner 가 그 표를 실제로 실어야 한다.
    expect(APP_CODE).toContain("priority: BANNER_PRIORITY[tone]");
  });

  it("등 떠밀기 컷인은 리치와 같은 등급이다 (짝이 갈리지 않게)", () => {
    // 리치만 앞질러 나가면 "리치 → (뒤늦게) 등 떠밀기"로 인과가 뒤집힌다.
    const push = APP_CODE.slice(APP_CODE.indexOf('"push_riichi:fired:"'));
    expect(push).toContain("priority: PROD_PRIORITY_RIICHI");
  });

  it("큐에서 꺼낼 때 밀린 개수만큼 체류를 줄인다", () => {
    expect(APP_CODE).toContain("backlogProdTtl(next.ttl, productionQueue.current.length)");
  });

  it("화면에 쓰는 시간과 내리는 타이머가 같은 값을 본다", () => {
    // 둘이 갈리면 CSS 연출이 끝나기 전에 사라지거나, 끝난 뒤에도 남는다.
    expect(APP_CODE).toContain("effectiveProdTtl(activeProd?.ttl ?? 0, settings.screenFx)");
    expect(APP_CODE).toContain("effectiveProdTtl(prod.ttl, settingsRef.current.screenFx)");
  });
});
