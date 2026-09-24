/**
 * 좁은 화면 이름표 줄의 폭 우선순위 회귀 가드 (2026-09-25, docs/59 W3 실측).
 *
 * - 375×700: 이름표·✦·정보 칩이 같은 비율로 줄어 ✦가 «✦ (2)»만 남기고 이름을 잃었다.
 * - 740×360: 정보 칩을 좁히자 글자가 한 글자씩 세로로 접혀 위 아이콘 줄까지 솟았다.
 * 두 좁은 블록(세로 폰 700px · 가로 폰 max-height 560px) 모두 ✦는 제 폭을 지키고(절반까지),
 * 칩은 44px 을 남긴 채 한 줄 말줄임으로 물러나야 한다.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

/** 같은 머리의 블록이 파일에 여럿이라, 그 머리로 시작하는 블록을 전부 잘라 돌려준다 */
function blocks(header: string): string[] {
  const out: string[] = [];
  let at = CSS.indexOf(header);
  while (at !== -1) {
    const rest = CSS.slice(at + header.length);
    const next = rest.search(/\n@(container|media) /);
    out.push(next === -1 ? CSS.slice(at) : CSS.slice(at, at + header.length + next));
    at = CSS.indexOf(header, at + header.length);
  }
  expect(out.length, header).toBeGreaterThan(0);
  return out;
}

describe("좁은 화면 이름표 줄 — ✦ 우선, 정보 칩은 한 줄 말줄임", () => {
  for (const header of [
    "@container ui (max-width: 700px) and (orientation: portrait) {",
    "@container ui (max-height: 560px) and (orientation: landscape) {",
  ]) {
    it(header, () => {
      const b = blocks(header).find((x) => x.includes(".own-top-main > .own-aug")) ?? "";
      expect(b).toMatch(/\.own-top-main > \.own-aug \{ flex-shrink: 0; max-width: 50%; \}/);
      expect(b).toMatch(/\.own-top-main > \.active-info \{ flex: 1 1 0; min-width: 44px; \}/);
      expect(b).toMatch(/\.own-top-main \.active-info \{\s*overflow: hidden;\s*white-space: nowrap;\s*text-overflow: ellipsis;/);
      expect(b).toMatch(/\.own-top-main \.active-info \.ai-badge-text \{[^}]*white-space: nowrap;/);
    });
  }
});
