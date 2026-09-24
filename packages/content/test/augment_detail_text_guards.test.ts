/**
 * 증강 설명 문안 가드 (2026-09-25, docs/59 U80).
 *
 * 큰손의 detail 첫 두 문단이 같은 문장이었다 — 어투 교정(docs/52) 때 고친 문단을 넣으면서
 * 원래 문단을 지우지 않았다. 도감·증강 시트의 «자세히»는 detail을 빈 줄로 나눠 전부
 * 펼치므로 같은 설명을 두 번 읽게 됐다. 괄호 속 표현만 다른 경우까지 잡도록 괄호를 걷고
 * 공백을 접은 뒤 비교한다.
 */

import { describe, expect, it } from "vitest";
import { ALL_AUGMENTS } from "./catalogSource.js";

/** 괄호 속·공백·문장부호 차이를 걷어 «같은 문장인가»만 본다 */
function norm(para: string): string {
  return para
    .replace(/\([^)]*\)/g, "")
    .replace(/[\s.,·]/g, "");
}

describe("증강 detail — 인접한 중복 문단이 없다", () => {
  it.each(ALL_AUGMENTS.filter((a) => typeof a.detail === "string" && a.detail !== "").map((a) => [a.id, a.detail!] as const))(
    "%s",
    (_id, detail) => {
      const paras = detail
        .split(/\n\s*\n/)
        .map((p) => p.trim())
        .filter((p) => p !== "");
      for (let i = 1; i < paras.length; i += 1) {
        expect(norm(paras[i]!), `문단 ${i}와 ${i + 1}이 같은 문장이다`).not.toBe(norm(paras[i - 1]!));
      }
    },
  );

  it("큰손 — 교정된 문단 하나만 남는다", () => {
    const bigHand = ALL_AUGMENTS.find((a) => a.id === "big_hand");
    expect(bigHand?.detail).toBeDefined();
    expect(bigHand!.detail).not.toContain("버리기도 울기도 전");
    expect(bigHand!.detail).toContain("패를 버리거나 울기 전");
  });
});
