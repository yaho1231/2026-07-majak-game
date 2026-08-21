/**
 * 비밀번호 변경의 **결과는 카드 안에 남는다** (2026-08-21 사용자 보고).
 *
 * 보고: "원래 계정의 비밀번호를 바꾼 뒤 다시 로그인하는데 안 된다 — 닉네임·비밀번호는
 * 정상인데."
 *
 * 서버 쪽은 멀쩡했다. 라이브 서버에 실제로 붙어 가입 → 로그인 → 비밀번호 변경 →
 * **새 비밀번호로 재로그인**까지 전부 통과하는 것을 확인했고(옛 비밀번호는 정확히
 * 거절됐다), 같은 흐름을 서버 테스트(PasswordChangeLogin.test.ts)로도 못 박았다.
 *
 * 문제는 화면이었다. 예전 계정 카드는
 *   - 누르는 **즉시 칸 셋을 비우고**,
 *   - 성공하면 아무 말도 하지 않고(`authOk`는 로그인과 같은 메시지라 화면이 구별을 못 했다),
 *   - 실패 사유는 3.2초 토스트로 흘려보냈다.
 * 그래서 성공한 화면과 실패한 화면이 **똑같이 생겼다**. 「지금 비밀번호가 올바르지
 * 않습니다」를 놓친 사람은 바뀌지도 않은 새 비밀번호로 로그인하다가, 계정이 잠긴 줄 안다.
 *
 * 이 패키지에는 jsdom이 없다 — clientShell·homeCardLayout과 같은 정적 스캔이다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** `AccountCard` 함수의 본문만 — 다음 최상위 선언 전까지. */
function accountCard(): string {
  const src = code(APP);
  const start = src.indexOf("function AccountCard(props: {");
  expect(start).toBeGreaterThan(0);
  const rest = src.slice(start + 1);
  const end = rest.search(/\n(?:function|const|export) /);
  return end < 0 ? rest : rest.slice(0, end);
}

const CARD = accountCard();
const APP_CODE = code(APP);

describe("성공과 실패가 다르게 생긴다", () => {
  it("성공(`authOk`)을 비밀번호 변경의 답으로 알아본다", () => {
    // 이 표식이 없으면 `authOk`는 로그인과 구별되지 않는다 — 화면은 바뀌었는지
    // 아닌지 모르는 채로 있고, 사용자는 확인할 방법이 없다.
    expect(APP_CODE).toMatch(/pwChangePending\.current = true/);
    expect(APP_CODE).toMatch(/if \(pwChangePending\.current\) \{/);
    expect(APP_CODE).toMatch(/setPwNotice\("password", true, "비밀번호를 바꿨습니다/);
  });

  it("실패 사유는 토스트가 아니라 카드로 간다", () => {
    expect(APP_CODE).toMatch(/msg\.code === "PASSWORD_CHANGE_FAILED"/);
    expect(APP_CODE).toMatch(/setPwNotice\("password", false, msg\.message\)/);
    // 「다른 기기에서 로그아웃」의 답도 같은 카드의 것이다.
    expect(APP_CODE).toMatch(/msg\.code === "SESSIONS_CLEARED"/);
  });

  it("카드가 그 답을 실제로 그린다", () => {
    expect(CARD).toMatch(/notice\.ok \? "auth-check-ok" : "auth-error"/);
    expect(CARD).toMatch(/aria-live="polite"/);
  });
});

describe("칸은 성공했을 때만 비운다", () => {
  it("누르는 즉시 비우지 않는다 — 실패하면 다시 칠 것이 없어야 한다", () => {
    // 예전 형태: onClick 안에서 onChangePassword 직후 setCur("")…
    expect(CARD).not.toMatch(/props\.onChangePassword\(cur, next\);\s*setCur\(""\)/);
  });

  it("비우는 조건은 «비밀번호 변경 성공»뿐이다", () => {
    // 「다른 기기에서 로그아웃」의 성공까지 칸을 비우면 쓰던 입력이 사라진다.
    expect(CARD).toMatch(/notice\.ok && notice\.kind === "password"/);
  });

  it("보내는 동안 버튼이 잠기고, 답이 없어도 12초 뒤 풀린다", () => {
    expect(CARD).toMatch(/disabled=\{!ready \|\| sending\}/);
    expect(CARD).toMatch(/12_000/);
  });
});

describe("비밀번호 규칙은 서버와 같은 것을 본다", () => {
  /*
   * 서버(`SiteDb.passwordProblem`)·가입 폼(`AuthScreen.submit`)과 셋이 같아야 한다.
   * 여기가 느슨하면 사람은 화면이 통과시킨 값을 보냈다가 거절당하고, 그 거절은
   * 인증 레이트리밋 예산까지 태운다.
   */
  it("8자 이상 · 숫자만 아님 · 닉네임 미포함 · 지금 것과 다름", () => {
    expect(CARD).toMatch(/next\.length < 8/);
    expect(CARD).toMatch(/\/\^\\d\+\$\/\.test\(next\)/);
    expect(CARD).toMatch(/next\.toLowerCase\(\)\.includes\(props\.username\.toLowerCase\(\)\)/);
    expect(CARD).toMatch(/next === cur/);
  });

  it("닉네임을 실제로 받아 온다 (없으면 규칙 하나를 못 잰다)", () => {
    expect(APP_CODE).toMatch(/username=\{props\.auth\.username\}/);
  });
});
