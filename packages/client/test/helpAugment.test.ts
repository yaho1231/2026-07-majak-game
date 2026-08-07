/**
 * 증강 도움말 회귀 가드 — 문안이 코드보다 낡는 것을 막는다.
 *
 * 배경: 이 화면의 예전 문안은 "한 게임에서 두 번 — 총 2개"와 "104가지"였다. 실제로는
 * 반장전 네 번(동1·동3·남1·남3)·동풍전 세 번(동1·동3·동4)이고 종수도 그 사이 늘었다.
 * 헌장 1.1의 "총 2개"가 그대로 화면에 남아 있었던 것이다.
 *
 * 그래서 종수는 문장에 박지 않고 카탈로그에서 세게 했다. 이 테스트는 그 규율이
 * 풀리지 않는지, 그리고 획득 시점 문안이 실제 draftSchedules와 어긋나지 않는지 본다.
 *
 * 클라를 렌더하지 않는 **정적 소스 스캔**이다 — `roundResultPanel.test.ts`와 같은 방식.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { contentAugments } from "@majak/content";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

/** `const HELP_AUGMENT` 선언 본문만 잘라 낸다. */
function helpAugmentSource(): string {
  const start = SRC.indexOf("const HELP_AUGMENT");
  expect(start).toBeGreaterThan(0);
  const end = SRC.indexOf("\n];", start);
  expect(end).toBeGreaterThan(start);
  return SRC.slice(start, end);
}

describe("증강 도움말 문안", () => {
  const body = helpAugmentSource();

  it("종수를 문장에 박지 않고 카탈로그에서 센다", () => {
    // 옛 문안의 실패 방식: "104가지"가 코드와 무관하게 굳어 있었다.
    expect(body).toContain("AUGMENT_KINDS");
    expect(body).not.toMatch(/\d+\s*(종|가지)/);
  });

  it("AUGMENT_KINDS는 실제 카탈로그 수다", () => {
    expect(SRC).toContain("const AUGMENT_KINDS = contentAugments.length;");
    expect(contentAugments.length).toBeGreaterThan(0);
  });

  it("획득 시점이 draftSchedules와 같은 국을 말한다", () => {
    // HanchanController 기본값:
    //   반장전 gameStart·eastThird·southEntry·southThird → 동1·동3·남1·남3 (네 번)
    //   동풍전 gameStart·eastThird·eastFourth            → 동1·동3·동4      (세 번)
    // 스케줄을 바꾸면 이 테스트가 먼저 깨져 문안도 같이 고치게 한다.
    expect(body).toContain("네 번");
    expect(body).toContain("세 번");
    for (const round of ["동1국", "동3국", "남1국", "남3국", "동4국"]) {
      expect(body).toContain(round);
    }
    // 폐기된 옛 주장이 되살아나지 않게. ("같은 증강이 두 번 나오지 않는다"는
    // 중복 금지 설명이라 정당하다 — 획득 횟수 주장만 겨냥한다.)
    expect(body).not.toContain("한 게임에서 두 번");
    expect(body).not.toContain("총 2개");
    expect(body).not.toMatch(/증강을?\s*(두 번|2번)/);
  });

  it("리치마작을 아는 사람 대상이라 기초 용어를 다시 풀지 않는다", () => {
    // basics 탭이 맡는 설명이 이 탭에 새어 들어오면 분업이 깨진다.
    for (const teach of ["멘젠(", "텐파이(", "후리텐(", "슌츠", "커츠"]) {
      expect(body).not.toContain(teach);
    }
  });

  it("유형과 제한 표식을 설명한다", () => {
    for (const must of ["상시형", "액티브", "쿨다운", "퀘스트", "🔒"]) {
      expect(body).toContain(must);
    }
  });
});
