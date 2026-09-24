/**
 * 밑장빼기 설명 카드에 같은 말이 두 번 읽히지 않는다 (2026-09-25, docs/59 U35 곁다리).
 *
 * 설명 카드(도감·AugDesc)는 요약(briefOf) 바로 밑에 상세(expandParas)를 편다. 밑장빼기 상세의
 * 첫 문단이 «패산 맨 밑 3장이 항상 나에게 보이고, 사용하면 다음 쯔모를 패산 밑에서 뽑는다»라
 * 요약(«패산 맨 밑 3장을 항상 볼 수 있다. 사용하면…»)과 같은 말을 한 카드에서 두 번 했다.
 */

import { describe, expect, it } from "vitest";
import { contentAugments } from "../src/index.js";
import { briefOf, expandParas } from "../../client/src/augmentBrief.js";

describe("밑장빼기 상세 — 요약과 겹치지 않는다", () => {
  const def = contentAugments.find((a) => a.id === "bottom_deal");

  it("상세가 요약의 «패산 맨 밑 3장» 문장을 되풀이하지 않고 요약에 없는 것만 말한다", () => {
    expect(def).toBeDefined();
    const brief = briefOf(def!.id, def!.description).text;
    expect(brief).toContain("패산 맨 밑 3장");
    const paras = expandParas(def!.description, def!.detail);
    expect(paras.length).toBeGreaterThan(0);
    expect(paras.join("\n")).not.toContain("패산 맨 밑 3장");
    // 요약에 없는 정보(방향·공개 범위·리치 중 사용)는 남아 있다
    expect(paras.join("\n")).toContain("오른쪽 끝이 맨 밑장이다");
    expect(paras.join("\n")).toContain("리치 중에도");
  });
});
