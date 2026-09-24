/**
 * docs/59 B11 «✦ 액티브 버튼·메뉴 라벨» 회귀 가드 (2026-09-25).
 *
 * U37 쓸 수 있는 액티브가 하나면 ✦ 버튼에 증강 이름(+행동 부제)을 적는다 — 단계는 늘리지 않는다 ·
 * U38 1단계 메뉴 줄에 행동 부제(ACTION_VERB) · U40 첫 순 한정 액티브에 «이번 순만»·금빛 테두리 ·
 * U39 후보 6개 이상 2단계는 격자 + 핏빛 계약 역 한 줄 정의 · U34 무르기·욕심 줄에 쯔모패 그림.
 * (U41 반전 ACTIVE_AUGMENT_IDS·ACTION_VERB 표 자체는 content/test/client_active_augment_wiring.test.ts)
 *
 * 다른 클라 테스트와 같은 **정적 소스 스캔**이다(렌더하지 않는다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");
const TUTORIAL = readFileSync(join(HERE, "../src/tutorial.ts"), "utf8");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);

/** `function name(` 부터 다음 최상위 `\n}\n` 까지 */
function fnBody(name: string): string {
  const at = APP_CODE.indexOf(`function ${name}(`);
  expect(at, `${name} 함수가 없다`).toBeGreaterThan(-1);
  return APP_CODE.slice(at, APP_CODE.indexOf("\n}\n", at));
}
const CONTROL = fnBody("ActiveAugmentControl");

/** 선택자 규칙의 본문 — 처음 나오는 `sel {` 부터 `}` 까지 */
function cssRule(src: string, sel: string): string {
  const at = src.indexOf(`${sel} {`);
  expect(at, `${sel} 규칙이 없다`).toBeGreaterThan(-1);
  return src.slice(at, src.indexOf("}", at));
}

describe("U37 — 단일 ✦ 버튼은 증강 이름을 적는다", () => {
  it("기준은 click()과 같은 types.length === 1 이다", () => {
    expect(CONTROL).toContain(
      "const single = usable && types.length === 1 ? (types[0] ?? null) : null;",
    );
    // click()의 즉시 발동(후보 1개면 즉시 제출)은 그대로 — 확인창을 새로 두지 않는다
    expect(CONTROL).toMatch(/if \(types\.length === 1\) \{\s*activate\(types\[0\]!\);\s*return;/);
    expect(CONTROL).not.toMatch(/window\.confirm|confirmDialog/);
  });

  it("라벨 = ✦ {이름} · {부제}, 개수는 메뉴가 열릴 때(둘 이상)만", () => {
    expect(CONTROL).toContain(
      '<span className="aug-btn-name">{single !== null ? augNameFor(single) : "액티브 증강"}</span>',
    );
    expect(CONTROL).toContain('<span className="aug-btn-sub">· {singleSub}</span>');
    expect(CONTROL).toContain("{usable && single === null ? ` (${displayCount})` : \"\"}");
    // 옛 라벨(언제나 «액티브 증강 (n)»)이 남지 않는다
    expect(CONTROL).not.toContain("✦ 액티브 증강{usable");
  });

  it("부제는 동사(ACTION_VERB)가 먼저, 없으면 조작 방식 — 이름과 같으면 뺀다", () => {
    expect(CONTROL).toMatch(/const actionSub = \(t: string\): string => \{[\s\S]*?ACTION_VERB\[t\] \?\?/);
    expect(CONTROL).toContain('return sub === augNameFor(t) ? "" : sub;');
  });

  it("좁은 화면(폰 세로·가로)에서는 부제를 숨기고 이름은 말줄임한다", () => {
    expect(cssRule(CSS, ".aug-btn-name,\n.aug-btn-sub")).toContain("text-overflow: ellipsis");
    const hides = CSS.match(/\.aug-btn-sub \{ display: none; \}/g) ?? [];
    expect(hides.length).toBe(2);
    // 가로 폰 블록의 «한 줄 ≈600px» 폭 예산 옆에 선다
    const landscape = CSS.indexOf("/* 액티브 증강 단추를 한 급 줄여 줄 폭 예산을 벌어 준다 */");
    expect(CSS.indexOf(".aug-btn-sub { display: none; }", landscape) - landscape).toBeLessThan(300);
  });
});

describe("U38 — 메뉴 줄에 행동 부제", () => {
  it("act-target = 동사 · 조작 방식", () => {
    expect(CONTROL).toContain(
      'const hint = [ACTION_VERB[type] ?? "", how].filter((x) => x !== "").join(" · ");',
    );
  });

  it("줄이 길어져도 메뉴가 화면 밖으로 넘치지 않는다", () => {
    expect(cssRule(CSS, ".aug-menu")).toContain("max-width: 92cqw;");
    expect(cssRule(CSS, ".aug-menu-item .act-target")).toContain("text-overflow: ellipsis");
  });

  it("폰(700px 블록)에서는 메뉴 기준을 화면 가운데 이름표 줄로 옮긴다 — 버튼 위치에 매이지 않는다", () => {
    const at = CSS.indexOf("  .own-top-main { position: relative; }");
    expect(at, "700px 블록의 메뉴 기준 규칙이 없다").toBeGreaterThan(-1);
    const block = CSS.lastIndexOf("@container ui", at);
    expect(CSS.slice(block, CSS.indexOf("{", block))).toBe("@container ui (max-width: 700px) ");
    const rules = CSS.slice(at, CSS.indexOf("\n\n", at));
    expect(rules).toContain(".own-aug { position: static; }");
    expect(rules).toMatch(/\.aug-menu \{\s*left: 50%;\s*transform: translateX\(-50%\);/);
  });
});

describe("U40 — 첫 순 한정 액티브 표시", () => {
  it("메뉴 줄에 «이번 순만», ✦ 버튼에 aug-btn-first + «첫 순»/«이번 순만»", () => {
    expect(CONTROL).toMatch(/FIRST_TURN_ONLY_TYPES\.has\(type\) \? \(\s*<span className="aug-first-badge">이번 순만<\/span>/);
    expect(CONTROL).toContain(
      "const firstTurnNow = usable && types.some((t) => FIRST_TURN_ONLY_TYPES.has(t));",
    );
    expect(CONTROL).toContain('${firstTurnNow ? " aug-btn-first" : ""}');
    expect(CONTROL).toContain('{single !== null ? "이번 순만" : "첫 순"}');
    expect(cssRule(CSS, ".aug-btn-first")).toContain("border-color");
  });

  it("좁은 화면의 금빛 점은 ✦ 버튼 안의 표만 — 메뉴 줄 «이번 순만»은 글자째 남는다", () => {
    const dots = CSS.match(/\n {2}\.aug-btn \.aug-first-badge \{\n {4}width: 8px;/g) ?? [];
    expect(dots.length).toBe(2);
    // 블록 안에 맨 선택자(.aug-first-badge {)로 점을 만들면 메뉴 줄 배지까지 글자가 사라진다
    expect(CSS).not.toMatch(/\n {2}\.aug-first-badge \{/);
  });

  it("액션 바 칩은 만들지 않는다(보류) — ✦ 목록·개수 규약이 그대로다", () => {
    expect(fnBody("ActionBar")).not.toContain("FIRST_TURN_ONLY_TYPES");
  });
});

describe("U39 — 후보 6개 이상 2단계는 격자", () => {
  it("2단계 컨테이너에 조건부 aug-menu-grid", () => {
    expect(CONTROL).toContain(
      'className={`aug-menu${(byType.get(menuType)?.length ?? 0) >= 6 ? " aug-menu-grid" : ""}`}',
    );
  });

  it("격자 CSS — 2열, 넓으면 4열, 머리글·되돌리기는 한 줄 전체", () => {
    expect(cssRule(CSS, ".aug-menu-grid")).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(CSS).toMatch(/\.aug-menu-grid \.aug-menu-head,\n\.aug-menu-grid \.aug-menu-back \{\n {2}grid-column: 1 \/ -1;/);
    expect(CSS).toMatch(/@container ui \(min-width: 901px\) \{\n {2}\.aug-menu-grid \{\n {4}grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  });

  it("핏빛 계약 칸에 역 한 줄 정의, 긴 풀이는 용어 사전 title — '추천' 표식은 없다", () => {
    expect(CONTROL).toContain("CONTRACT_YAKU_NOTE[yaku]");
    expect(CONTROL).toContain("glossaryTitle(CONTRACT_YAKU_TERM[yaku] ?? yaku)");
    expect(CONTROL).not.toContain("추천");
  });
});

describe("U34 — 무르기·욕심 줄에 쯔모패", () => {
  it("ActionTiles가 myDrawnTile을 그리고, 욕심은 같은 패로 전→후", () => {
    const tiles = fnBody("ActionTiles");
    expect(tiles).toMatch(
      /\(option\.type === "take_back" \|\| option\.type === "greed_use"\) &&\s*view\.round\.myDrawnTile !== null/,
    );
    expect(tiles).toContain("<TileImg tile={{ kind: drawn.kind, attrs: { conjured: true } }} size=\"mini\" />");
  });

  it("무르기는 쯔모패가 사라지므로 hover 때 손패에서 짚는다(doomed)", () => {
    const doomed = fnBody("doomedTileIdsOf");
    expect(doomed).toMatch(
      /if \(actionType === "take_back"\) \{\s*return view\.round\.myDrawnTile !== null \? \[view\.round\.myDrawnTile\] : \[\];/,
    );
    // 욕심은 패가 사라지지 않는다 — doomed가 아니다
    expect(doomed).not.toContain("greed_use");
  });
});

describe("문구 — 화면에 없는 «액티브 증강 버튼»으로 부르지 않는다", () => {
  it("튜토리얼 제목·본문·할 일과 코치 잠금 안내", () => {
    const visible = [...TUTORIAL.matchAll(/(?:title|body|todo): "([^"]*)"/g)].map((m) => m[1]!);
    expect(visible.length).toBeGreaterThan(10);
    expect(visible.filter((t) => t.includes("액티브 증강 버튼"))).toEqual([]);
    expect(APP_CODE).not.toContain("먼저 '✦ 액티브 증강' 버튼을");
    expect(APP_CODE).toContain("튜토리얼: 먼저 증강 이름이 적힌 ✦ 버튼을 누른 뒤 그 패를 고르세요");
  });
});
