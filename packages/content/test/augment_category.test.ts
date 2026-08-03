/**
 * 증강 계열(category) 전수 커버리지.
 *
 * 계열은 `AugmentDef.category`가 단일 진실이다 — 예전엔 클라이언트가 id 관례로
 * 추측(inferCategory)해서, 새 증강이 추가될 때마다 조용히 `etc`(기타)로 새고 있었다
 * (108종 중 39종이 미분류였다. docs/19 §4.1). 여기서 세 가지를 막는다:
 *   ① 계열 없는 증강(타입에서도 막히지만, 값이 오타면 통과한다)
 *   ② "일단 etc"로 대충 넣기 — 진짜 메타 능력만 예외로 허용한다
 *   ③ 클라이언트 표시 메타(CATEGORY_META)와 계열 enum이 어긋나는 것
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { AUGMENT_CATEGORIES, standardAugments } from "@majak/core";
import { contentAugments } from "../src/index.js";

const ALL = [...standardAugments, ...contentAugments];

/**
 * `etc`(기타)를 쓸 수 있는 증강 — 점수·손패·화료형 어디에도 안 붙는 **메타 능력**만.
 * 새 증강을 여기 추가하기 전에, 정말 아홉 계열 중 어디에도 안 맞는지 먼저 의심할 것.
 */
const ETC_ALLOWED = new Set([
  "reload", // 재장전 — 증강 자체의 사용 횟수를 다루는 메타 능력
  "cornucopia", // 화수분 — 증강을 지급하는 메타 능력
]);

const CLIENT_APP = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../client/src/App.tsx",
);

describe("증강 계열 커버리지", () => {
  it("모든 증강이 유효한 계열을 선언한다", () => {
    const bad = ALL.filter((a) => !AUGMENT_CATEGORIES.includes(a.category));
    expect(bad.map((a) => a.id)).toEqual([]);
  });

  it("etc(기타)는 허용 목록에 있는 메타 증강뿐이다", () => {
    const etc = ALL.filter((a) => a.category === "etc").map((a) => a.id);
    expect(etc.filter((id) => !ETC_ALLOWED.has(id))).toEqual([]);
    // 낡은 허용 항목(삭제된 증강)도 함께 걸러 준다
    const ids = new Set(ALL.map((a) => a.id));
    expect([...ETC_ALLOWED].filter((id) => !ids.has(id))).toEqual([]);
  });

  it("클라이언트 CATEGORY_META가 계열 전부를 표시할 수 있다", () => {
    const src = readFileSync(CLIENT_APP, "utf8");
    const start = src.indexOf("const CATEGORY_META");
    const block = src.slice(start, src.indexOf("};", start));
    const missing = AUGMENT_CATEGORIES.filter(
      (c) => !new RegExp(`^\\s*${c}:\\s*\\{`, "m").test(block),
    );
    expect(missing, `CATEGORY_META에 없는 계열: ${missing.join(", ")}`).toEqual([]);
  });
});
