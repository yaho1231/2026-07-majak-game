/**
 * 미완성 구현 §M 회귀 가드 (화면·문서 몫) — 감사 2026-08-17 §10-1·10-2·10-6.
 *
 * 서버 몫(§10-3·10-4·10-11)은 `server/test/UnfinishedBatchM.test.ts`에 있다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const DOC28 = readFileSync(
  join(HERE, "../../../docs/28_QA_PREDEPLOY_2026-08-08.md"),
  "utf8",
);

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);

// ─────────────── §10-1 개인 한정 적도라 ───────────────

describe("개인 한정 적도라가 화면에서 거짓말하지 않는다", () => {
  it("`redFor`를 읽는 판정이 있다", () => {
    // 코어 채점부는 처음부터 `redFor`가 자기 것이 아닌 적도라를 빼고 셌는데,
    // **클라이언트는 그 필드를 한 번도 읽지 않았다** — 코어에 데이터가 다 와 있는데
    // 화면이 거짓말을 하는 유일한 자리였다.
    expect(APP_CODE).toContain("function tileIsRed");
    expect(APP_CODE).toContain('tile.attrs["redFor"]');
  });

  it("각인 없는 적도라(패산에서 나온 진짜 적도라)는 누구에게나 붉다", () => {
    const at = APP_CODE.indexOf("function tileIsRed");
    const body = APP_CODE.slice(at, at + 420);
    expect(body).toContain('if (typeof only !== "string") return true;');
  });

  it("붉은 그림·반짝임·이름이 **전부** 같은 판정을 쓴다", () => {
    // 한 자리라도 옛 판정(`attrs.red === true`)이 남으면 그 표면만 거짓말한다.
    expect(APP_CODE).toContain("const isRed = tileIsRed(tile, owner);"); // 그림
    expect(APP_CODE).toContain("if (tileIsRed(tile, owner)) return \" tile-dora\";"); // 반짝임
    expect(APP_CODE).toContain("const red = tileIsRed(tile, owner)"); // 이름(赤)
  });

  it("판정 기준이 **채점과 같다** (뷰어가 아니라 주인 기준)", () => {
    // 뷰어 기준으로 두면 네 사람의 화면이 서로 다른 것을 말한다.
    const at = APP_CODE.indexOf("function tileIsRed");
    expect(APP_CODE.slice(at, at + 420)).toContain("only === owner");
  });
});

// ─────────────── §10-2 계정 회수 수단 ───────────────

describe("계정을 되찾는 화면이 있다", () => {
  it("비밀번호 변경 · 다른 기기 로그아웃이 한 카드에 있다", () => {
    // 사람이 이 화면을 찾는 이유가 하나다 — "누가 내 계정을 봤을지도 모른다".
    // 두 행동이 다른 화면에 있으면 그 순간에 하나를 놓친다.
    expect(APP_CODE).toContain("function AccountCard");
    expect(APP_CODE).toContain('send({ type: "changePassword"');
    expect(APP_CODE).toContain('send({ type: "logoutOthers" })');
  });

  it("바꾸면 다른 기기가 끊긴다는 것을 **미리** 말한다", () => {
    expect(APP).toContain("다른 기기의 로그인이 전부 끊깁니다");
  });

  it("새 비밀번호를 두 번 받고 서로 다르면 못 누른다", () => {
    expect(APP_CODE).toContain("const mismatch =");
    // `sending`이 붙은 것은 2026-08-21에 하나 더 잠근 것이다 — 답을 기다리는
    // 동안에도 계속 눌리면 인증 레이트리밋만 태운다. `!ready` 는 그대로여야 한다.
    expect(APP_CODE).toContain("disabled={!ready || sending}");
  });
});

// ─────────────── §10-6 문서가 코드보다 뒤처지지 않는다 ───────────────

describe("docs/28의 '남은 HIGH'가 실제와 맞는다", () => {
  it("여섯 건이 해소됐다고 적혀 있다", () => {
    // 이 목록이 낡은 채로 남아서 감사 §10-6이 그대로 인용했고, 그걸 믿고 착수하면
    // **이미 있는 것을 다시 만든다** — 이 저장소가 §9에서 경계한 함정이다.
    expect(DOC28).toContain("여섯 건 전부 해소됐다");
    expect(DOC28).not.toMatch(/### 남은 HIGH \(이번 PR 범위 밖/);
  });

  it("어디서 고쳐졌는지를 적어 둔다 (다음 사람이 확인할 수 있게)", () => {
    for (const where of [
      "markPassFuriten",
      "rotate-hint",
      "draftPickedRef",
      "HAND_ORDER_MIN_INTERVAL_MS",
      "detachStaleConns",
    ]) {
      expect(DOC28, `${where} 가 표에 없다`).toContain(where);
    }
  });
});
