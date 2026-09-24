/**
 * docs/59 B04 «실물 손패로: 이면투시·붉은 손길 (+스파이·소환 종류 매핑)» 회귀 가드 (2026-09-25).
 *
 * U01 이면투시 바꿔치기 = 손패 클릭 + 목적지 칸 강조 + 결과 미리보기 ·
 * U02 붉은 손길 = 손패 클릭 → 같은 숫자 제자리 붉은 미리보기 → [확인] ·
 * U17 스파이·소환 같은 종류 둘째 장도 대상 · U20 안내 줄 주 버튼(.arm-hint-confirm).
 *
 * 다른 클라 테스트와 같은 **정적 소스 스캔**이다(렌더하지 않는다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(HERE, p), "utf8");

const APP = read("../src/App.tsx");
const CSS = read("../src/styles.css");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** `function name(` 부터 다음 최상위 `\n}\n` 까지 — 함수 하나의 본문 */
function fnBody(name: string): string {
  const at = APP_CODE.indexOf(`function ${name}(`);
  expect(at, `${name} 함수가 없다`).toBeGreaterThan(-1);
  return APP_CODE.slice(at, APP_CODE.indexOf("\n}\n", at));
}

/** reduce 블록들 안에 든 텍스트만 이어 붙인다 */
function reduceBlocks(): string {
  const out: string[] = [];
  const re = /@media \(prefers-reduced-motion: reduce\) \{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(CSS_CODE)) !== null) {
    let depth = 1;
    let i = m.index + m[0].length;
    const start = i;
    while (i < CSS_CODE.length && depth > 0) {
      if (CSS_CODE[i] === "{") depth++;
      else if (CSS_CODE[i] === "}") depth--;
      i++;
    }
    out.push(CSS_CODE.slice(start, i));
  }
  return out.join("\n");
}

describe("armTileIdsOf — 무장 옵션을 손패 id로 푸는 한 곳 (U01·U02)", () => {
  const body = fnBody("armTileIdsOf");

  it("handTileId는 이면투시 바꿔치기에서만 읽는다 (dw_swap이 armSub 14지선다로 새지 않게)", () => {
    expect(body).toContain('if (o.type === "ura_swap") return typeof p.handTileId === "number"');
    // handTileId 언급은 ura_swap 줄의 두 번(타입 가드·값)과 payload 타입 선언뿐이다
    const lines = body.split("\n").filter((l) => l.includes("p.handTileId"));
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain('o.type === "ura_swap"');
  });

  it("붉은 손길 후보 {rank}는 그 숫자의 수패(만·통·삭) 전부로 풀린다", () => {
    expect(body).toContain('if (o.type === "red_touch")');
    expect(body).toMatch(/k\.suit === "man" \|\| k\.suit === "pin" \|\| k\.suit === "sou"\) && k\.rank === rank/);
  });

  it("armedByTile이 이 함수를 쓰고, 종류 지목형은 비어 있는 장에만 대표 옵션을 채운다 (U17)", () => {
    const at = APP_CODE.indexOf("const armedByTile = useMemo(");
    expect(at).toBeGreaterThan(0);
    const memo = APP_CODE.slice(at, APP_CODE.indexOf("}, [armedAug, myPrompt, rawHand, view.tiles]);", at));
    expect(memo).toContain("armTileIdsOf(o, rawHand, view.tiles)");
    expect(memo).toContain("KIND_TARGET_ARM_TYPES.has(armedAug)");
    // 이미 제 옵션이 있는 장은 건드리지 않는다
    expect(memo).toContain("!map.has(t)");
    // 무장 분기 앵커(qaRound2Client)가 그대로다
    expect(APP_CODE).toContain("const opts = armedByTile.get(id);");
  });
});

describe("붉은 손길 — 제자리 미리보기와 [확인] (U02)", () => {
  it("첫 탭은 숫자만 고르고(들어 올림) 무장 분기보다 먼저 돌아간다", () => {
    const first = APP_CODE.indexOf(
      'if (armedAug === "red_touch" && armedTileId !== id && armedByTile.has(id)) {',
    );
    const branch = APP_CODE.indexOf(
      "if (armedAug !== null) {\n                    const opts = armedByTile.get(id);",
    );
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(branch);
    expect(APP_CODE.slice(first, first + 200)).toMatch(/setArmedTileId\(id\);\s*sfx\.pick\(\);\s*return;/);
  });

  it("같은 숫자의 손패를 내 각인 적도라 모양으로 그린다", () => {
    expect(APP_CODE).toContain("redPreviewIds.has(id)");
    expect(APP_CODE).toContain("attrs: { ...t.attrs, red: true, redFor: me.id }");
  });

  it("안내 줄 [확인]은 숫자를 고르기 전엔 비활성이고, 영구 효과를 말한다", () => {
    const at = APP_CODE.indexOf(') : armedAug === "red_touch" ? (');
    expect(at).toBeGreaterThan(0);
    const hint = APP_CODE.slice(at, APP_CODE.indexOf(") : armedAug !== null ? (", at));
    expect(hint).toContain('className="arm-hint-confirm"');
    expect(hint).toContain("disabled={redPick === undefined}");
    expect(hint).toContain("sel.submit(redPick)");
    expect(hint).toContain("게임 끝까지 내 적도라입니다");
    // 옛 모달의 틀린 조사가 돌아오지 않는다
    expect(APP_CODE).not.toContain("을 적도라로 (");
  });

  it("안내 줄은 hover한 숫자도 설명하지만 [확인]은 클릭으로 고른 숫자에만 묶인다", () => {
    expect(APP_CODE).toMatch(
      /const redShown =\s*redPick \?\?\s*\(armedAug === "red_touch" && armPreviewId !== null/,
    );
    const at = APP_CODE.indexOf(') : armedAug === "red_touch" ? (');
    const hint = APP_CODE.slice(at, APP_CODE.indexOf(") : armedAug !== null ? (", at));
    expect(hint).toContain("{redShown === undefined ? (");
    expect(hint).toContain('redPick === undefined ? "미리보기(눌러서 지정)" : "지정"');
    expect(hint).not.toContain("disabled={redShown");
  });

  it("무장이 바뀌면 들어 올린 패를 내린다 — 타패용 첫 탭이 «고른 숫자»로 읽히지 않게", () => {
    const at = APP_CODE.indexOf("if (armedAug === null) setArmSub(null);");
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 120)).toContain("setArmedTileId(null);");
  });
});

describe("이면투시 바꿔치기 — 목적지 칸과 결과 미리보기 (U01)", () => {
  it("무장 중 중앙 이면투시 줄 첫 칸을 목적지로 강조한다", () => {
    const panel = fnBody("CenterPanel");
    expect(panel).toContain('useContext(SelectionContext).armedType === "ura_swap"');
    expect(panel).toContain('uraSwapArmed && i === 0 ? " ura-swap-target" : ""');
    expect(CSS_CODE).toContain(".center-ura-peek .dora-slot.ura-swap-target {");
    expect(reduceBlocks()).toContain(".center-ura-peek .dora-slot.ura-swap-target");
  });

  it("들어 올린(또는 올려 둔) 손패의 결과 — 새 뒷도라와 손으로 올 표시패 — 를 안내 줄에 적는다", () => {
    expect(APP_CODE).toContain("→ 뒷도라 ${formatTile({ kind: doraKindFor(tile.kind) })}");
    expect(APP_CODE).toContain("{uraSwapPreview ?? armPromptText(sel.armMode, armedAug)}");
  });
});

describe("안내 줄 주 버튼 .arm-hint-confirm (U20)", () => {
  it("가지치기 [확인]이 주 버튼 모양이고 진행을 라벨이 말한다 — onClick 본문은 그대로", () => {
    const at = APP_CODE.indexOf(") : hand3Picking ? (");
    const hint = APP_CODE.slice(at, APP_CODE.indexOf('className="arm-hint-cancel"', at));
    expect(hint).toContain('className="arm-hint-confirm"');
    expect(hint).toContain("3장 고르기 (${handPicks.length}/3)");
    expect(hint).toContain('"이 3장 보내기"');
    expect(hint).toMatch(/if \(hand3Option !== undefined\) sel\.submit\(hand3Option\)/);
  });

  it("비활성은 흐리고 커서가 막히며, 맥동은 reduce에서 선다", () => {
    expect(CSS_CODE).toMatch(/\.arm-hint-confirm:disabled \{\s*opacity: 0\.4;\s*cursor: not-allowed;/);
    expect(CSS_CODE).toMatch(/\.arm-hint-cancel:disabled,\s*\.arm-sub-cancel:disabled \{\s*opacity: 0\.4;/);
    expect(reduceBlocks()).toContain(".arm-hint-confirm:not(:disabled)");
  });
});
