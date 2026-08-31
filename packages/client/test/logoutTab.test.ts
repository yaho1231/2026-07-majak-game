/**
 * 로그아웃한 뒤 **바로** 다른 계정으로 로그인할 수 있어야 한다 (2026-08-31 사용자 보고).
 *
 * 보고된 모습: "로그아웃하고 바로 다른 계정 로그인하려고 하면 «가입 코드가
 * 필요합니다»라고 나온다. 새로고침을 해야 로그인이 된다."
 *
 * 원인은 인자 하나였다. `logout(nextTab)` 을 `onClick={props.onLogout}` 에 그대로
 * 꽂아 두면 React가 넘기는 **마우스 이벤트**가 `nextTab` 자리에 들어간다. `authTab`
 * 이 "login"도 "register"도 아닌 값이 되고, 그 값이 `AuthScreen` 의 초기 탭으로
 * 내려가 `tab === "login"` 이 거짓 → 제출이 **가입**으로 나갔다. 화면은 로그인 폼처럼
 * 보이니 사람은 영문을 모른 채 «가입 코드가 필요합니다»만 읽었다. 새로고침하면
 * `authTab` 이 기본값 "login" 으로 돌아와서 풀렸다 — 그래서 "새로고침하면 된다".
 *
 * 이 패키지에는 jsdom이 없다 — authTabError와 같은 정적 스캔으로 못을 박는다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("로그아웃 버튼은 이벤트를 nextTab으로 흘리지 않는다", () => {
  const SRC = code(APP);

  it("핸들러를 맨손으로 넘기지 않는다 (인자 0개로 감싼다)", () => {
    expect(SRC).not.toMatch(/onLogout=\{logout\}/);
    expect(SRC).not.toMatch(/onClick=\{props\.onLogout\}/);
    expect(SRC).toMatch(/onLogout=\{\(\) => logout\(\)\}/);
    expect(SRC).toMatch(/onClick=\{\(\) => props\.onLogout\(\)\}/);
  });

  it("AuthScreen은 알 수 없는 initialTab을 로그인으로 되돌린다", () => {
    // ?? "login" 은 이벤트 객체를 그대로 통과시킨다 — 값 자체를 확인해야 한다.
    expect(SRC).not.toMatch(/props\.initialTab \?\? "login"/);
    const guards = SRC.match(/props\.initialTab === "register" \? "register" : "login"/g) ?? [];
    expect(guards.length).toBe(2); // tab · sentFrom
  });
});
