/**
 * 횟수 표기는 판이 정해져 있으면 **그 판의 숫자 하나**여야 한다 (2026-08-23 사용자 지시).
 *
 * "동풍전 1회 · 반장전 2회"는 판 밖 도감에서만 쓰는 말이다. 동풍전을 두고 있는 사람에게
 * 반장전 숫자는 정보가 아니라 셈거리다 — 「게임 1회」라고 바로 말해야 한다.
 *
 * 예전에는 드래프트 카드·이름표 툴팁만 줄이고 도감·샌드박스·관전 칩은 원문을 뒀다.
 * 그래서 같은 증강이 카드에서는 「게임 1회」, 판 중에 📖로 연 도감에서는
 * 「동풍전 1회 · 반장전 2회」로 보였다. 화면마다 다른 말을 하면 어느 쪽이 진짜인지
 * 사람이 확인할 방법이 없다.
 *
 * 규약은 하나다: **모드는 `GameModeContext`가 정하고, 증강 글을 그리는 자리는 전부
 * 그 값을 `forMode`에 통과시킨다.** 이 파일은 그 규약이 소스에서 지켜지는지 본다
 * (이 패키지에는 jsdom이 없어 정적 스캔이다 — a11yBatchF·noticeBannerClick과 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { forMode } from "../src/augmentBrief.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

describe("모드가 정해진 자리에서는 두 숫자가 남지 않는다", () => {
  it("대국뿐 아니라 대기실에서도 모드를 내려 준다", () => {
    // 대기실은 방의 모드가 이미 골라져 있는 자리다. 여기서 도감을 열어 고른 증강이
    // 판에 들어가는 순간 다른 숫자로 보이면 안 된다.
    // 방에 들어가 있을 때만이다 — 홈으로 나온 뒤 남아 있는 lobby 값이 홈 도감을
    // 물들이면 안 된다.
    expect(APP).toMatch(/value=\{view\?\.round\.mode \?\? \(joined !== null \? lobby\?\.gameMode \?\? null : null\)\}/);
  });

  it("AugDesc가 변형(도감/드래프트)으로 모드를 잘라내지 않는다", () => {
    const at = APP.indexOf("function AugDesc(");
    expect(at).toBeGreaterThan(0);
    const body = APP.slice(at, APP.indexOf("\n}\n", at));
    expect(body).toMatch(/const mode = useContext\(GameModeContext\)/);
    // 예전 회귀: variant === "draft" 일 때만 줄였다
    expect(body).not.toMatch(/variant === "draft" \? \w+ : null/);
  });

  it("expandParas로 편 본문은 어디서든 forMode를 지난다", () => {
    const calls = [...APP.matchAll(/expandParas\(/g)];
    expect(calls.length).toBeGreaterThan(0);
    const leaked = calls
      .map((m) => APP.slice(m.index ?? 0, (m.index ?? 0) + 320))
      .filter((chunk) => !chunk.includes("forMode"));
    expect(leaked).toEqual([]);
  });

  it("원문 설명을 그대로 title에 꽂는 자리가 없다", () => {
    // `title=` 과 `note=`(InfoNote — 터치에서도 열리는 설명 칩) 둘 다 본다.
    const titles = [...APP.matchAll(/(?:title|note)=\{[^}]*\.description[^}]*\}/g)].map(
      (m) => m[0],
    );
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.filter((t) => !t.includes("forMode"))).toEqual([]);
  });

  it("도감 상세의 요약 배지도 그 판의 숫자로 줄인다", () => {
    expect(APP).toMatch(/forMode\(selRaw\.use, codexMode\)/);
  });
});

describe("줄인 결과가 사람이 읽는 말이 된다", () => {
  it("동풍전은 «게임 1회», 반장전은 «게임 2회»", () => {
    const raw = "(동풍전 1회 · 반장전 2회 · 매 국 1회) 발동한다.";
    expect(forMode(raw, "tonpuu")).toBe("(게임 1회 · 매 국 1회) 발동한다.");
    expect(forMode(raw, "hanchan")).toBe("(게임 2회 · 매 국 1회) 발동한다.");
  });
});
