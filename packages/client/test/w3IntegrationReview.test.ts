/**
 * docs/59 W3(B09~B12) 통합 리뷰 반영 회귀 가드 (2026-09-25).
 *
 * interaction-2·lifecycle-1·regression-1 폰 세로에서 ✦ 버튼이 줄어든 .own-aug 칸 밖으로 삐져나가 화면(375) 밖에 섰다 ·
 * regression-2 좁은 화면의 5em 말줄임이 평소 라벨 «액티브 증강»까지 잘랐다 ·
 * interaction-1 상대 대상 무장 중 비후보 상대 줄을 누르면 무장이 풀렸다(원칙 7) ·
 * interaction-3·lifecycle-3 강제 무장 중 판 가운데·후로 줄에서 FORCED_PICK_HINT가 사라졌다 ·
 * interaction-4 오른쪽 버튼 pointerdown이 무장을 풀어 우클릭 쯔모기리 가드를 비꼈다 ·
 * interaction-5·lifecycle-2·regression-3 밑장 예약·삼세 예지와 예지 «다음»이 서로 다른 패에 섰다 ·
 * regression-4 좁은 화면에서 패산 정보 섹션 이름이 접근성 트리에서 빠졌다 ·
 * regression-5 패산 정보 줄의 누르는 곳이 손가락보다 작았다.
 * 알려진 문제 (2)·(4)는 앞 라운드에서 고쳐진 상태를 함께 못 박는다.
 *
 * 다른 클라 테스트와 같은 **정적 소스 스캔**이다(렌더하지 않는다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { projectedDrawSeats } from "../src/drawOrder.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function between(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  expect(a, start).toBeGreaterThanOrEqual(0);
  const b = src.indexOf(end, a + start.length);
  expect(b, end).toBeGreaterThan(a);
  return src.slice(a, b);
}

/** 최상위 at-rule 블록 하나(중괄호 짝 맞춤) */
function block(src: string, head: string, from = 0): string {
  const a = src.indexOf(head, from);
  expect(a, head).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let i = src.indexOf("{", a); i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") {
      depth--;
      if (depth === 0) return src.slice(a, i + 1);
    }
  }
  throw new Error(`unterminated ${head}`);
}

/** ✦ 버튼 규칙이 든 두 좁은 블록 — 폰 세로(700px)와 가로 폰(max-height 560px) */
function narrowAugBlocks(): string[] {
  const out: string[] = [];
  for (const head of ["@container ui (max-width: 700px) {", "@container ui (max-height: 560px) and (orientation: landscape) {"]) {
    let from = 0;
    for (;;) {
      const at = CSS_CODE.indexOf(head, from);
      if (at < 0) break;
      const b = block(CSS_CODE, head, at);
      if (b.includes(".aug-btn-sub { display: none; }")) out.push(b);
      from = at + head.length;
    }
  }
  return out;
}

describe("✦ 버튼이 좁은 화면에서 칸을 따라 줄어든다 (interaction-2·lifecycle-1·regression-1)", () => {
  it("두 좁은 블록 모두 버튼을 inline-flex·min-width 0·max-width 100%로 두고 이름만 줄인다", () => {
    const blocks = narrowAugBlocks();
    expect(blocks.length).toBe(2);
    for (const b of blocks) {
      expect(b).toMatch(
        /\.own-aug \.aug-btn \{[^}]*display: inline-flex;[^}]*min-width: 0;[^}]*max-width: 100%;[^}]*overflow: hidden;/,
      );
      expect(b).toContain(".own-aug .aug-btn-name { flex: 0 1 auto; min-width: 0; }");
      // 첫 순 점은 제 폭을 지킨다
      expect(b).toContain(".own-aug .aug-btn .aug-first-badge { flex: none; }");
    }
  });

  it("5em은 증강 이름(aug-btn-name-aug)에만 — 평소 라벨 «액티브 증강»은 묶지 않는다 (regression-2)", () => {
    for (const b of narrowAugBlocks()) {
      expect(b).toContain(".aug-btn-name-aug { max-width: 5em; }");
      expect(b).not.toMatch(/(^|\n)\s*\.aug-btn-name \{ max-width: 5em; \}/);
    }
    expect(APP).toContain('<span className={`aug-btn-name${single !== null ? " aug-btn-name-aug" : ""}`}>');
  });

  it("알려진 문제 (2) — 첫 순 표를 점으로 줄이는 규칙은 버튼 안에만 걸린다", () => {
    for (const b of narrowAugBlocks()) {
      expect(b).toMatch(/\.aug-btn \.aug-first-badge \{\s*width: 8px;/);
      expect(b).not.toMatch(/(^|\n)\s*\.aug-first-badge \{/);
    }
  });
});

describe("알려진 문제 (4) — 좌우 줄 비후보 사유는 접힌다", () => {
  it("opp-arm-blocked는 180px에서 어절 단위로 두 줄로 접는다(nowrap이 아니다)", () => {
    const rule = between(
      CSS_CODE,
      ".opp-strip-left > .opp-arm-tag.opp-arm-blocked,\n.opp-strip-right > .opp-arm-tag.opp-arm-blocked {",
      "}",
    );
    expect(rule).toContain("max-width: 180px;");
    expect(rule).toContain("white-space: normal;");
    expect(rule).toContain("word-break: keep-all;");
  });
});

describe("비후보 상대 줄은 대상 영역 안의 빗나감이다 (interaction-1)", () => {
  const strip = between(APP, "function OpponentStrip({", "\nfunction ");

  it("opp·opp-aug 무장 중 후보가 아닌 줄에도 data-arm-zone을 붙이고 이유를 토스트로 알린다", () => {
    expect(strip).toContain(
      'const armMiss =\n    (sel.armMode === "opp" || sel.armMode === "opp-aug") && !oppArmable && !oppAugArmable;',
    );
    const miss = between(strip, ": armMiss\n        ? {", "}\n        : {};");
    expect(miss).toContain('"data-arm-zone": "1"');
    expect(miss).toContain("onClick: () => onToast?.(armMissText())");
    // 사유 태그가 있으면 그 문장을, 없으면 «대상이 아닙니다»
    expect(strip).toMatch(/const armMissText = \(\): string =>\s*oppBlocked \?\?/);
  });

  it("비후보 줄의 이름표도 armTarget — 이름 단추·pill이 시트 열기·설명 고정을 멈추고 줄로 올린다", () => {
    expect(strip).toContain("...(oppArmable || oppAugArmable || armMiss ? { armTarget: true } : {})");
  });

  it("GameTable이 세 줄 모두에 onToast를 내린다", () => {
    const calls = APP.match(/<OpponentStrip [^>]*onToast=\{props\.onToast\} \/>/g) ?? [];
    expect(calls.length).toBe(3);
  });
});

describe("강제 무장은 판 가운데·후로 줄을 대상 영역으로 두지 않는다 (interaction-3·lifecycle-3)", () => {
  it("table-center와 own-corner-right의 data-arm-zone 조건이 FORCED_ARM_TYPES를 뺀다", () => {
    expect(APP).toContain(
      'className="table-center"\n        {...(selection.armedType !== null && !FORCED_ARM_TYPES.has(selection.armedType)',
    );
    expect(APP).toContain(
      '{...(sel.armedType !== null && !FORCED_ARM_TYPES.has(sel.armedType) ? { "data-arm-zone": "1" } : {})}',
    );
    expect(APP).not.toContain('<div className="table-center" {...(selection.armedType !== null ? {');
  });
});

describe("무장 해제는 주 버튼만 (interaction-4)", () => {
  it("판 pointerdown 감시가 e.button !== 0을 먼저 거른다", () => {
    const down = between(APP, "const onDown = (e: PointerEvent): void => {", 'document.addEventListener("pointerdown", onDown);');
    const guard = down.indexOf("if (e.button !== 0) return;");
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(down.indexOf("selection.arm(null);"));
    expect(guard).toBeLessThan(down.indexOf('t.closest("[data-arm-zone]")'));
  });
});

describe("예지 «다음»이 다른 패의 «다음»과 겹치지 않는다 (interaction-5·lifecycle-2·regression-3)", () => {
  it("밑장 예약·삼세 예지가 있으면 예지 쪽 «다음»을 뺀다", () => {
    const row = between(APP, "function WallPeekRow(props: {", "\nfunction ");
    expect(row).toContain("{pos === 0 && isMine && !bottom.armed && triple.length === 0 ? nextBadge : null}");
  });

  it("밑장 예약 중이면 자리 라벨이 내 한 번의 쯔모를 건너뛴다 — 두 계산 모두", () => {
    expect(APP).toContain("bottomDealArmed ? me.seat : undefined,");
    expect(APP).toContain("bottomArmed ? mySeat : undefined,");
  });

  it("projectedDrawSeats(skipNextDrawOf) — 내 다음 한 번만 건너뛰고 길이는 그대로", () => {
    // 내가 0번, 지금 내 차례(0)에 밑장을 예약하고 버렸다 → 앞 장은 1·2·3이 받고, 넷째는 내 밑장 뒤 1이 받는다
    expect(projectedDrawSeats(0, 1, 4, 4, 0)).toEqual([1, 2, 3, 1]);
    // 상가(3) 차례 — 내 쯔모(0)가 밑장이라 앞 장은 하가부터
    expect(projectedDrawSeats(3, 1, 4, 4, 0)).toEqual([1, 2, 3, 0]);
    // 역행에서도 같은 규칙
    expect(projectedDrawSeats(1, -1, 4, 3, 0)).toEqual([3, 2, 1]);
    // 건너뛸 자리가 없으면 예전과 같다
    expect(projectedDrawSeats(2, 1, 4, 4, undefined)).toEqual(projectedDrawSeats(2, 1, 4, 4));
  });
});

describe("패산 정보 줄 — 접근성·터치 (regression-4·regression-5)", () => {
  const start = CSS.indexOf("@container ui (max-width: 700px) {\n  .wall-peek-sec");
  const narrow = block(CSS_CODE, "@container ui (max-width: 700px) {\n  .wall-peek-sec", CSS_CODE.indexOf(".wall-peek-arm-cell:hover .tile-mini"));

  it("좁은 화면에서 섹션 이름은 눈에서만 숨긴다(display: none이 아니다)", () => {
    expect(start).toBeGreaterThan(-1);
    const nameRule = between(narrow, ".wall-peek-name {", "}");
    expect(nameRule).toContain("clip-path: inset(50%);");
    expect(nameRule).not.toContain("display: none");
    // 긴 안내 문구(cta)만 display: none
    expect(narrow).toMatch(/\.wall-peek-cta \{\s*display: none;\s*\}/);
  });

  it("터치에서 [순서 바꾸기]·예약 태그·밑장 칸의 닿는 자리를 위쪽으로 넓힌다", () => {
    const touch = between(CSS_CODE, "@media (pointer: coarse) {\n  .wall-peek-reorder,", "\n}\n");
    expect(touch).toContain(".wall-peek-reorder::before,\n  .wall-peek-arm::before,\n  .wall-peek-arm-cell::before {");
    expect(touch).toContain("inset: -8px -4px -2px;");
    expect(touch).toContain('content: "";');
  });
});
