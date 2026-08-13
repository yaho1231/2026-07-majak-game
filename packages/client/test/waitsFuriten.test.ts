/**
 * 오름패 뱃지의 후리텐 표시 회귀 가드.
 *
 * 후리텐은 이름표(np-furiten)에만 떠 있었다. 그런데 정작 "이 패로 날 수 있나"를 보는
 * 순간에 눈은 손패 위 오름패 뱃지에 있어서, 론이 안 되는 대기를 살아 있는 대기로
 * 읽게 된다(2026-08-13 사용자 보고). 뱃지에도 같은 사실을 적어 둔다.
 *
 * 이 패키지에는 jsdom·testing-library가 없어 **정적 소스 스캔**으로 못을 박는다
 * (a11yPerfGuards.test.ts와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");

/** WaitsBadge 함수 본문만 잘라 낸다 — 이름표 쪽 후리텐 표시와 섞이지 않게. */
function waitsBadgeBody(): string {
  const start = APP.indexOf("function WaitsBadge({");
  expect(start, "WaitsBadge 를 못 찾았다").toBeGreaterThan(0);
  const rest = APP.slice(start);
  const end = rest.search(/\n(?:function |const \w+ = memo\()/);
  expect(end).toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe("오름패 뱃지 — 후리텐", () => {
  const badge = waitsBadgeBody();

  it("후리텐 사유를 받아 태그로 띄운다", () => {
    expect(badge).toContain("furiten?: readonly FuritenReason[]");
    expect(badge).toContain("waits-badge-furiten-tag");
    expect(badge).toContain("후리텐");
  });

  it("낱장 툴팁에도 론 불가를 적는다 — 남은 장수만 보고 살아 있다고 읽지 않게", () => {
    expect(badge).toMatch(/furitenOn[\s\S]{0,120}론 불가/);
  });

  it("사유 세 가지(버림·일시·리치)를 전부 사람 말로 풀어 둔다", () => {
    const table = APP.slice(APP.indexOf("const FURITEN_REASON_TEXT"));
    expect(table.indexOf("}")).toBeGreaterThan(0);
    for (const reason of ["discard:", "temporary:", "riichi:"]) {
      expect(table.slice(0, table.indexOf("};"))).toContain(reason);
    }
  });

  it("내 오름패 뱃지에 서버가 준 사유가 실제로 연결돼 있다", () => {
    // 본인 뷰에만 오는 값(PlayerRoundView.furitenReasons)을 그대로 넘긴다
    expect(APP).toContain("furitenReasons ?? []");
    expect(APP).toMatch(/furiten=\{myFuritenReasons\}/);
  });

  it("태그와 뱃지 테두리 스타일이 있다", () => {
    expect(CSS).toContain(".waits-badge-furiten-tag");
    expect(CSS).toContain(".waits-badge-furiten {");
  });
});
