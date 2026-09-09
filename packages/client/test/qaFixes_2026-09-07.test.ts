/**
 * 2026-09-07 사용자 보고 4건 중 **클라이언트 몫**의 회귀 가드.
 *
 * 넷 다 «한 줄만 되돌려도 조용히 되살아나는» 종류다 — 정산 오버레이의 알파 한 값,
 * 첫 뷰 시드 한 블록, 라벨 분기 한 줄, hover 신호 한 줄.
 *
 * 클라를 렌더하지 않는 **정적 소스 스캔**이다(이 패키지에는 jsdom 이 없다 —
 * qaFixes_2026-09-03.test.ts 와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");
const SHAPE = readFileSync(join(HERE, "../src/winShapeView.ts"), "utf8");

/** `.선택자 {` 부터 닫는 중괄호까지 (첫 번째 것) */
function rule(sel: string): string {
  const at = CSS.indexOf(`${sel} {`);
  expect(at, `${sel} 규칙을 못 찾았다`).toBeGreaterThan(0);
  return CSS.slice(at, CSS.indexOf("}", at));
}

// ── 1. 유국 정산창이 판을 덮는다 ────────────────────────────────────────────

describe("① 유국 정산창 뒤로 판의 손패가 비치지 않는다", () => {
  /*
   * `.result-overlay` 는 «판 위 버림패가 글자 뒤로 비친다»는 이유로 알파를 0.62 → 0.86
   * 으로 올렸는데, 유국·도중유국만 따로 0.66 으로 낮게 되돌려 놓고 있었다. 그런데
   * **네 사람의 손패를 통째로 싣는 화면은 유국뿐**이라, 판의 네 손패가 결과창의 네
   * 손패 뒤로 그대로 비쳐 어느 것이 어느 것인지 갈리지 않았다.
   */
  it("유국·도중유국 오버레이는 기본 오버레이보다 옅지 않다", () => {
    const draw = rule(".result-outcome-draw,\n.result-outcome-abort");
    const alphas = [...draw.matchAll(/rgba\([^)]*?,\s*([0-9.]+)\)/g)].map((m) =>
      Number(m[1]),
    );
    expect(alphas.length).toBe(2);
    // 기본 오버레이가 읽히는 값으로 정한 0.86 / 0.96 이 하한이다.
    expect(alphas[0]).toBeGreaterThanOrEqual(0.86);
    expect(alphas[1]).toBeGreaterThanOrEqual(0.96);
  });
});

// ── 2. 구련보등은 몸통이 아니라 뼈대다 ─────────────────────────────────────

describe("② 구련보등은 1112345678999 + 남는 한 장으로 읽힌다", () => {
  it("뼈대 몸통에는 슌쯔·커쯔가 아니라 배열 자체가 이름표로 붙는다", () => {
    expect(SHAPE).toContain('if (type === "gates") return "1112345678999";');
    expect(SHAPE).toContain('if (form === "chuuren" && type === "single") return "남는 한 장";');
  });

  it("무늬가 섞인 뼈대만 «증강이 만든 자리»로 강조한다 (표준 구련은 평범하게)", () => {
    expect(SHAPE).toContain('if (type === "gates") return tiles.some((t) => t.suit !== first.suit);');
  });

  it("구련은 몸통이 이상하지 않아도 이름표를 붙인다 — 그 배열이 곧 근거다", () => {
    expect(APP).toContain('const labeled = shape.form === "chuuren" || groups.some((g) => g.unusual);');
  });
});

// ── 3. 사라지는 재료를 미리 짚는다 ─────────────────────────────────────────

describe("③ 허장성세·분열의 재료는 누르기 **전에** 손패에서 짚인다", () => {
  it("계산은 서버 채널 하나만 읽는다 — 클라가 다시 세면 짚는 패와 타는 패가 갈린다", () => {
    expect(APP).toContain('const id = av["bluff_pretense:material"];');
    expect(APP).toContain('const table = av["tile_split:material"];');
    // 분열은 «대상 → 재료» 표다. 대상이 정해지면 그 하나로 좁힌다.
    expect(APP).toContain("const one = map[String(targetTileId)];");
  });

  it("발동 버튼·메뉴 줄 hover 가 그대로 신호가 된다 (마우스·키보드 둘 다)", () => {
    expect(APP).toContain("onMouseEnter={() => props.onDoomedHint?.(doomedTileIdsOf(view, o.type))}");
    expect(APP).toContain("onFocus={() => props.onDoomedHint?.(doomedTileIdsOf(view, o.type))}");
    expect(APP).toContain("props.onDoomedHint?.(doomedTileIdsOf(view, type));");
  });

  it("손패가 그 표식을 그린다 — 이름에도 실어 화면을 못 보는 사람에게도 남는다", () => {
    expect(APP).toContain('doomed ? " hand-doomed" : ""');
    expect(APP).toContain('doomed ? "누르면 이 발동에 쓰여 사라지는 패" : null');
    // 색만으로 말하지 않는다 (적록색맹·고대비)
    expect(CSS).toContain(".hand-doomed::after");
    expect(rule(".hand-doomed::after")).toContain('content: "✕"');
  });
});

// ── 4. 관전의 「리치 해제」 ─────────────────────────────────────────────────

describe("④ 첫 뷰는 이미 끝난 «숨은 리치 해제»를 다시 알리지 않는다", () => {
  /*
   * 채널(`stealth_riichi:broken:*`)은 국이 끝날 때까지 값을 들고 있는데 걸러 내는
   * 집합만 첫 뷰에서 비어 있었다. 관전은 탁자를 옮길 때마다 첫 뷰 경로를 타므로
   * (spectateStarted → prevViewRef=null) 옮겨 다닐 때마다 컷인이 다시 터졌다.
   */
  it("첫 뷰에서 시드한다 — 서명은 컷인 루프가 쓰는 것과 같은 식이어야 한다", () => {
    expect(APP).toContain("shown.stealthBroken = new Set();");
    expect(APP).toContain('if (!key.startsWith("stealth_riichi:broken:")) continue;');
    expect(APP).toContain("shown.stealthBroken.add(`${key}:${shown.roundKey}`);");
    // 컷인 루프의 서명 (같은 식이 아니면 시드가 아무것도 못 거른다)
    expect(APP).toContain("const seen = `${key}:${shown.roundKey}`;");
  });

  it("시드는 첫 뷰 경로(prev === null) 안에 있다 — 밖으로 나가면 매 뷰가 비운다", () => {
    const at = APP.indexOf("shown.stealthBroken = new Set();");
    expect(at).toBeGreaterThan(0);
    const head = APP.lastIndexOf("if (prev === null) {", at);
    expect(head).toBeGreaterThan(0);
    // 첫 뷰 경로의 끝(return)보다 앞이다
    expect(APP.indexOf("      return;\n    }", head)).toBeGreaterThan(at);
  });
});
