/**
 * 로그인 화면의 실패 사유는 **그 탭의 것이다** (2026-08-21 사용자 보고).
 *
 * 보고된 모습: "로그인할 때 비밀번호가 틀린 건데 «코드가 필요합니다»라고 나온다."
 *
 * 실제로 그랬다. 로그인·가입은 탭만 다른 **한 폼**이고, 실패 사유(`authError`)는
 * 부모가 들고 있는데 탭을 바꿔도 아무도 지우지 않았다. 그래서 초대제 서버에서
 * 가입을 한 번 눌러 «가입 코드가 필요합니다»를 받은 사람이 로그인 탭으로 옮기면
 * 그 문장이 **로그인 폼 아래에 그대로 서 있었다** — 라이브 사이트에서 재현했다
 * (2026-08-21: 가입 제출 → 탭 전환 → `.auth-error` 가 여전히 "가입 코드가 필요합니다").
 *
 * 비밀번호를 틀린 사람은 서버가 정확히 답해 줘도(「닉네임 또는 비밀번호가 올바르지
 * 않습니다」) 그 전에 남아 있던 문장을 먼저 읽는다. 로그인 화면에서 잘못된 진단은
 * 그냥 이탈이다 — 없는 코드를 찾으러 나간 사람은 돌아오지 않는다.
 *
 * 이 패키지에는 jsdom이 없다 — clientShell·homeCardLayout과 같은 정적 스캔으로
 * 못을 박는다.
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

/**
 * `AuthScreen` 함수의 본문만 잘라 온다.
 *
 * 파일 전체를 보면 안 된다 — `setTab`은 도감·규칙·결과창에도 있고, 그쪽은 이
 * 규칙과 무관하다(실패 사유를 들고 있지 않다).
 */
function authScreen(): string {
  const src = code(APP);
  const start = src.indexOf("function AuthScreen(props: {");
  expect(start).toBeGreaterThan(0);
  // 다음 최상위 선언 전까지 = 이 컴포넌트의 범위
  const rest = src.slice(start + 1);
  const end = rest.search(/\n(?:function|const|export) /);
  return end < 0 ? rest : rest.slice(0, end);
}

const AUTH = authScreen();
const APP_CODE = code(APP);

describe("탭을 바꾸면 앞 탭의 실패 사유는 사라진다", () => {
  it("탭 단추는 `setTab`을 직접 부르지 않는다 — `switchTab`을 거친다", () => {
    // 직접 부르면 사유를 지우는 자리가 없다. 이 파일이 막는 것이 정확히 그것이다.
    expect(AUTH).toMatch(/onClick=\{\(\) => switchTab\("login"\)\}/);
    expect(AUTH).toMatch(/onClick=\{\(\) => switchTab\("register"\)\}/);
    expect(AUTH).not.toMatch(/onClick=\{\(\) => setTab\("(login|register)"\)\}/);
  });

  it("`switchTab`은 화면 쪽 사유(localError)와 서버 쪽 사유(onClearError)를 **둘 다** 지운다", () => {
    const m = /function switchTab\([^)]*\)[^{]*\{([\s\S]*?)\n  \}/.exec(AUTH);
    expect(m).not.toBeNull();
    const body = m?.[1] ?? "";
    expect(body).toMatch(/setTab\(next\)/);
    // 하나만 지우면 다른 하나가 그대로 남는다 — 화면에는 둘이 같은 자리에 뜬다.
    expect(body).toMatch(/setLocalError\(null\)/);
    expect(body).toMatch(/props\.onClearError\(\)/);
  });

  it("부모가 `onClearError`를 실제로 이어 준다 (없으면 서버 사유는 못 지운다)", () => {
    expect(APP_CODE).toMatch(/onClearError=\{\(\) => setAuthError\(null\)\}/);
  });
});

describe("늦게 온 답도 제 탭에만 뜬다", () => {
  /*
   * 탭 전환에서 지우는 것만으로는 부족하다 — 답은 늦게 온다(scrypt 포함 왕복 ~1초).
   * 가입을 누르고 그 사이에 로그인 탭으로 옮기면, 지워 둔 자리에 뒤늦게 «가입
   * 코드가 필요합니다»가 내려앉는다. 끊겼다 붙은 직후 큐에 남아 있던 `register`가
   * 다시 나가는 길도 있다(SEND_RESEND_POLICY ②) — 그쪽은 사람이 아무것도 누르지
   * 않아도 도착한다. 그래서 **보낼 때의 탭**을 적어 두고 그 탭에서만 보여 준다.
   */
  it("보낼 때의 탭을 적어 둔다 (`sentFrom`)", () => {
    expect(AUTH).toMatch(/sentFrom\.current = tab/);
  });

  it("답이 오면 그 탭에 귀속시킨다", () => {
    expect(AUTH).toMatch(/setErrorTab\(sentFrom\.current\)/);
  });

  it("화면은 **지금 탭의 답만** 그린다", () => {
    expect(AUTH).toMatch(/errorTab === tab \? props\.serverError : null/);
    // 서버 사유를 날것으로 그리면 귀속이 무의미해진다.
    expect(AUTH).toMatch(/\{localError \?\? shownServerError\}/);
    expect(AUTH).not.toMatch(/\{localError \?\? props\.serverError\}/);
  });
});

describe("초대제 서버에서 빈 가입 코드는 보내기 전에 걸린다", () => {
  /*
   * 서버도 같은 것을 본다(`SIGNUP_CODE_REQUIRED`). 다만 빈 칸인 줄 알면서 보내면
   * 그 왕복이 인증 레이트리밋 예산(연결 12회/분)을 태울 뿐이다 — 칸에 붙은
   * «(필수)»가 이미 약속한 것을 화면이 먼저 지킨다.
   */
  it("가입 탭 검사에 빈 코드 분기가 있다", () => {
    expect(AUTH).toMatch(/gateOn && signupCode\.trim\(\) === ""/);
  });

  it("그 분기는 **가입 탭 안**에 있다 — 로그인은 코드를 묻지 않는다", () => {
    const reg = AUTH.indexOf('if (tab === "register") {');
    const gate = AUTH.indexOf('gateOn && signupCode.trim() === ""');
    const send = AUTH.indexOf("setSending(true)");
    expect(reg).toBeGreaterThan(0);
    expect(gate).toBeGreaterThan(reg);
    expect(send).toBeGreaterThan(gate);
  });
});
