/**
 * 가드 ① — 표시명은 카탈로그에서 유일하다.
 *
 * `late_bloomer`와 `late_bloomer_east`가 둘 다 **"대기만성"**이었다(2026-08-07 `ae87e47`
 * 에서 "대기만성 (반장전)" · "대기만성 (동풍전)"으로 갈랐다). 모드가 서로 배타적이라
 * 한 판에 같이 뜨지는 않지만, 도감·결과창·통계·티어표는 모드를 가로질러 한 목록에
 * 늘어놓기 때문에 사람이 둘을 구별할 수 없었다.
 *
 * 이 가드가 잡는 것: 같은 표시명 두 개.
 * 못 잡는 것: **비슷한** 이름(같은 뜻의 다른 표기), 그리고 이름과 내용이 어긋나는 것.
 */

import { describe, expect, it } from "vitest";
import { ALL_AUGMENTS } from "./catalogSource.js";

describe("증강 표시명 유일성", () => {
  it("두 증강이 같은 name을 쓰지 않는다", () => {
    const byName = new Map<string, string[]>();
    for (const def of ALL_AUGMENTS) {
      const ids = byName.get(def.name);
      if (ids === undefined) byName.set(def.name, [def.id]);
      else ids.push(def.id);
    }
    const dupes = [...byName.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([name, ids]) => `${name}: ${ids.join(" / ")}`);
    expect(dupes, "표시명이 겹치는 증강").toEqual([]);
  });

  it("id도 유일하다 (카탈로그 중복 등록 방지)", () => {
    const ids = ALL_AUGMENTS.map((a) => a.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("표시명이 비어 있지 않다", () => {
    expect(ALL_AUGMENTS.filter((a) => a.name.trim() === "").map((a) => a.id)).toEqual([]);
  });
});
