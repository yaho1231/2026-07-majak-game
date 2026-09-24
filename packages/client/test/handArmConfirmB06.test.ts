/**
 * docs/59 B06 «손패 무장 확정·빗나감 규칙» 회귀 가드 (2026-09-25).
 *
 * U16 되돌릴 수 없는 손패 무장은 후보 한 장이어도 두 번 눌러 확정 + 결과 풍선 ·
 * U21 누명은 심을 패를 들어 올리지 않는다(«한 번 더» 뱃지·취소 뒤 잔재 제거) ·
 * U22 누명 2단계 [패 다시 고르기] 삭제 · U23 버리지 않는 무장 중 대기 툴팁 끄기 ·
 * U26 손패가 대상인 무장에서 비대상 손패 클릭은 무시 + 알림.
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

/** 손패 무장 분기(qaRound2Client의 앵커)부터 그 분기의 끝 return까지 */
function armBranch(): string {
  const at = APP_CODE.indexOf("if (armedAug !== null) {\n                    const opts = armedByTile.get(id);");
  expect(at).toBeGreaterThan(0);
  return APP_CODE.slice(at, APP_CODE.indexOf("coachLock.how === \"augment\"", at));
}

/** 누명 1단계 분기 */
function frameBranch(): string {
  const at = APP_CODE.indexOf('if (armedAug === "frame_discard" && (armedByTile.get(id)?.length ?? 0) > 0) {');
  expect(at).toBeGreaterThan(0);
  return APP_CODE.slice(at, APP_CODE.indexOf("return;", at));
}

describe("U16 되돌릴 수 없는 손패 무장 — 두 번 눌러 확정과 결과 풍선", () => {
  it("후보 한 장 게이트가 ARM_CONFIRM_TYPES에도 걸리고, 둘째 탭 전엔 제출하지 않는다", () => {
    const b = armBranch();
    expect(b).toContain(
      "(DRAG_DISCARD_ARM_TYPES.has(armedAug) || ARM_CONFIRM_TYPES.has(armedAug)) &&",
    );
    expect(b.indexOf("ARM_CONFIRM_TYPES.has(armedAug)")).toBeLessThan(b.indexOf("sel.submit(opts[0]!)"));
  });

  it("결과 풍선은 후보가 한 장인 패에만, 팝오버가 열려 있으면 뜨지 않는다", () => {
    const at = APP_CODE.indexOf("const armTip = useMemo(");
    expect(at).toBeGreaterThan(0);
    const memo = APP_CODE.slice(at, APP_CODE.indexOf("]);", at));
    expect(memo).toContain("!ARM_CONFIRM_TYPES.has(armedAug)");
    expect(memo).toContain('armedAug === "ura_swap"');
    expect(memo).toContain("armSub !== null");
    expect(memo).toContain("opts.length !== 1");
    expect(memo).toContain("armResultPreview(view, opts[0]!)");
    // 확정 방법은 설정에 따라 — 마우스(꺼짐)는 한 번 클릭 그대로
    expect(memo).toContain('"누르면 바로 발동"');
    expect(memo).toContain('"한 번 더 누르면 발동"');
    expect(memo).toContain('"두 번 누르면 발동"');
  });

  it("결과 미리보기가 조커·소환·스파이·분열·변형을 그린다", () => {
    const at = APP_CODE.indexOf("function armResultPreview(");
    expect(at).toBeGreaterThan(0);
    const fn = APP_CODE.slice(at, APP_CODE.indexOf("\n}\n", at));
    expect(fn).toContain("splitPreview(view, option)");
    expect(fn).toContain('case "joker_call":');
    expect(fn).toContain('{ suit: "dragon", rank: 1 }');
    expect(fn).toContain('case "conjure_tsumo":');
    expect(fn).toContain('"다음 쯔모"');
    expect(fn).toContain('case "spy_mark":');
    expect(fn).toContain("morphedTile(view, option)");
  });

  it("풍선을 손패에 그리고 CSS가 대기 툴팁처럼 클릭을 막지 않는다", () => {
    expect(APP_CODE).toContain('{armTip?.id === id ? (\n                  <span className="arm-result-tip" aria-hidden="true">');
    expect(CSS_CODE).toMatch(/\.arm-result-tip \{[^}]*pointer-events: none;/);
  });

  it("무장 중 둘째 탭은 «발동» — 뱃지와 aria가 «버림»이라 하지 않는다", () => {
    expect(APP_CODE).toContain('"한 번 더: 발동" : "한 번 더"');
    expect(APP_CODE).toContain('"선택됨. 한 번 더 누르면 발동"');
  });

  it("분열 재료 ✕는 들어 올린 패 기준으로도 고정된다", () => {
    expect(APP_CODE).toContain("const t = armSub?.tileId ?? armedTileId ?? hoverId;");
  });

  it("안내 줄의 확정 문구가 두 번 누르기 설정을 따른다 (조커의 «백을 고르면 바로»가 사라졌다)", () => {
    expect(APP_CODE).not.toContain("백을 고르면 바로 발동합니다");
    expect(APP_CODE).toContain("armPromptText(sel.armMode, armedAug, props.tapTwiceToDiscard)");
  });
});

describe("U21·U22 누명 — 심을 패는 들어 올리지 않고, 다시 고르기 버튼이 없다", () => {
  it("누명 1단계 분기에 setArmedTileId가 없다", () => {
    const b = frameBranch();
    expect(b).toContain("sel.setFrameTile(id);");
    expect(b).not.toContain("setArmedTileId");
  });

  it("고른 심을 패는 swapChosen 강조·«심을 패» 뱃지·aria로 말한다", () => {
    expect(APP_CODE).toContain('(armedAug === "frame_discard" && sel.frameTile === id);');
    expect(APP_CODE).toMatch(/armedAug === "frame_discard" && sel\.frameTile === id \? \(\s*<span className="hand-armed-badge" aria-hidden="true">\s*심을 패/);
    // aria는 armedTileId 조건 밖에서 먼저 가른다
    expect(APP_CODE).toMatch(
      /armedAug === "frame_discard" && sel\.frameTile === id\s*\?\s*"심을 패로 선택됨\. 놓을 상대의 바닥을 클릭"\s*:\s*armedTileId === id/,
    );
  });

  it("2단계 안내 줄은 [취소] 하나이고 다른 손패로 바꾸는 법을 적는다", () => {
    const at = APP_CODE.indexOf(') : armedAug === "frame_discard" && sel.frameTile !== null ? (');
    expect(at).toBeGreaterThan(0);
    const hint = APP_CODE.slice(at, APP_CODE.indexOf(') : armedAug === "red_touch" ? (', at));
    expect(hint).toContain("(다른 손패를 누르면 바꿉니다)");
    expect(hint).not.toContain("패 다시 고르기");
    expect(hint.match(/<button/g)?.length).toBe(1);
  });

  it("무장이 바뀌면 들어 올린 패를 내린다 (armedAug effect)", () => {
    const end = APP_CODE.indexOf("}, [armedAug]);");
    expect(end).toBeGreaterThan(0);
    expect(APP_CODE.slice(APP_CODE.lastIndexOf("useEffect(() => {", end), end)).toContain(
      "setArmedTileId(null);",
    );
  });
});

describe("U23 버리지 않는 무장 중에는 «버리면 대기» 툴팁을 끈다", () => {
  it("armNoDiscard — 증강 리치·누명은 남기고 나머지 무장은 끈다", () => {
    expect(APP_CODE).toMatch(
      /const armNoDiscard =\s*armedAug !== null && !DRAG_DISCARD_ARM_TYPES\.has\(armedAug\) && armedAug !== "frame_discard";/,
    );
    expect(APP_CODE).toContain("const showWaits = hoverId === id && hoverWaits.length > 0 && !armNoDiscard;");
  });

  it("누명으로 심는 패는 내 바닥에 남지 않으므로 후리텐 셈에서 뺀다", () => {
    const at = APP_CODE.indexOf("const hoverFuriten = useMemo<boolean>(");
    const memo = APP_CODE.slice(at, APP_CODE.indexOf("]);", at) + 3);
    expect(memo).toContain('if (armedAug === "frame_discard") return null;');
    expect(memo).toContain("armedAug]);");
  });
});

describe("U26 빗나감 규칙 — 손패가 대상이면 무시하고 알린다", () => {
  it("손패 무장(hand)에서 비대상 패는 무장을 풀지 않고 reject + 토스트", () => {
    const b = armBranch();
    const at = b.indexOf('} else if (sel.armMode === "hand") {');
    expect(at).toBeGreaterThan(0);
    const miss = b.slice(at, b.indexOf("} else {", at));
    expect(miss).toContain("haptics.reject();");
    expect(miss).toContain("props.onToast?.(`이 패는 ${armName} 대상이 아닙니다`);");
    expect(miss).not.toContain("sel.arm(null)");
  });

  it("상대·바닥 무장에서 손패를 누르면 해제하되 조용히 풀지 않는다", () => {
    const b = armBranch();
    const at = b.indexOf('} else if (sel.armMode === "hand") {');
    const rest = b.slice(b.indexOf("} else {", at));
    expect(rest).toContain("sel.arm(null);");
    expect(rest).toContain("props.onToast?.(`${armName} 선택을 취소했습니다`);");
  });

  it("가지치기 풀 밖의 패도 같은 말로 알린다", () => {
    const at = APP_CODE.indexOf("const toggleHandPick = (id: number): void => {");
    const fn = APP_CODE.slice(at, APP_CODE.indexOf("sfx.pick();", at));
    expect(fn).toContain("haptics.reject();");
    expect(fn).toContain("props.onToast?.(`이 패는 ${armName} 대상이 아닙니다`);");
  });
});
