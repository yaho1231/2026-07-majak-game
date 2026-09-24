/**
 * docs/59 B13 «왕패의 주인: 손패 실물 클릭 + 왕패 도킹 패널» 회귀 가드 (2026-09-25).
 *
 * U04 판 손패를 복제한 «내 손패» 줄을 걷고 실제 손패를 누른다 · 판에 없는 왕패 14칸만 손패 위
 *     비차단 도킹 패널(DeadWallDock)에 편다 · 순서 강제(손패 먼저) 없음 · 여러 쌍 예약 → 순차 제출 유지.
 * U05 왕패 칸마다 자리 이름(영상1·도라1✓·뒷1)을 상시로 붙이고 자리별 색 테두리를 준다.
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

/** `{`로 시작하는 CSS 규칙 본문 하나 */
function ruleBody(selector: string): string {
  const at = CSS_CODE.indexOf(`${selector} {`);
  expect(at, `${selector} 규칙이 없다`).toBeGreaterThan(-1);
  const start = CSS_CODE.indexOf("{", at);
  return CSS_CODE.slice(start, CSS_CODE.indexOf("}", start));
}

describe("U04 왕패의 주인 — 모달이 아니라 실제 손패 + 도킹 패널", () => {
  it("옛 전면 모달과 «내 손패» 복제 줄이 없다", () => {
    expect(APP_CODE).not.toContain('pickModal === "dw_swap"');
    expect(APP_CODE).not.toContain("dwHandIds");
    expect(APP_CODE).not.toContain("modalPick");
  });

  it("손패 클릭은 무장 분기보다 먼저 가로채 들어 올리기만 한다 (armSub 14지선다로 새지 않게)", () => {
    const at = APP_CODE.indexOf("if (dwArmed) {\n                    const r = sel.dwClickHand(id);");
    expect(at, "왕패의 주인 손패 가로채기 분기가 없다").toBeGreaterThan(0);
    // 누명 가로채기 뒤, 일반 무장 분기(armedByTile) 앞
    expect(at).toBeGreaterThan(APP_CODE.indexOf('if (armedAug === "frame_discard" && (armedByTile.get(id)?.length ?? 0) > 0) {'));
    expect(at).toBeLessThan(APP_CODE.indexOf("if (armedAug !== null) {\n                    const opts = armedByTile.get(id);"));
    const branch = APP_CODE.slice(at, APP_CODE.indexOf("return;\n                  }", at));
    // 제출·팝오버·두 번 누르기 게이트로 새지 않는다
    expect(branch).not.toContain("sel.submit(");
    expect(branch).not.toContain("setArmSub(");
    expect(branch).not.toContain("setArmedTileId(");
    // 대상이 아닌 패는 대상 영역 안의 빗나감 — 까닭을 말한다(§2 원칙 7)
    expect(branch).toContain("haptics.reject();");
    expect(branch).toContain("props.onToast?.(");
  });

  it("손패 armable은 dwHandArmable로 — 먼저 누른 왕패 칸이 있으면 그 칸과 짝이 되는 패만 빛난다", () => {
    expect(APP_CODE).toContain(
      ": dwArmed\n                  ? dwHandArmable(id)\n                  : armedAug !== null && armedByTile.has(id);",
    );
    const at = APP_CODE.indexOf("const dwHandArmable = (id: number): boolean =>");
    expect(at).toBeGreaterThan(0);
    const fn = APP_CODE.slice(at, APP_CODE.indexOf(";\n", at));
    expect(fn).toContain("dwStagedHand.has(id)");
    expect(fn).toContain("dwHandCands.get(id)?.has(sel.dwDead) === true");
  });

  it("짝 짓기는 순서를 강제하지 않는다 — 손패·왕패 어느 쪽을 먼저 눌러도 반대쪽이 서 있으면 짝이 된다", () => {
    const sel = fnBody("useSelection");
    expect(sel).toContain("const dwClickHand = (id: number)");
    expect(sel).toContain("const dwClickDead = (idx: number)");
    expect(sel).toContain("if (dwDead !== null) {");
    expect(sel).toContain("if (dwHand !== null) {");
    // 먼저 고른 반대쪽과 짝이 안 되는(흐리게 그려진) 쪽을 누르면 몰래 갈아타지 않고 까닭을 말한다(B13 리뷰)
    expect(sel).toContain('if (!dwHasOpt(id, dwDead)) return dwHasOpt(id, null) ? "mismatch" : "none";');
    expect(sel).toContain('if (!dwHasOpt(dwHand, idx)) return dwHasDeadOpt(idx) ? "mismatch" : "none";');
    // 남은 횟수가 예약 상한이다
    expect(sel).toContain('if (dwPairs.length >= dwRemaining) return "full";');
  });

  it("[이대로 교환]은 큐로 넘기고, 큐는 프롬프트마다 하나씩 보낸다 (docs/10 여러 쌍 · 2026-08-07 봇 중복 컷인)", () => {
    const sel = fnBody("useSelection");
    expect(sel).toContain("setDwQueue(dwPairs);");
    expect(sel).toContain("if (dwSentPromptRef.current === myPrompt) return;");
    expect(sel).toContain("dwSentPromptRef.current = myPrompt;");
    expect(sel).toContain("setDwQueue((cur) => cur.slice(1));");
    // 국 경계에서 큐를 비운다(qaRound2Client 의심 3과 같은 앵커)
    expect(sel).toContain("setDwQueue([]);\n    dwSentPromptRef.current = null;");
    // 큐가 두 벌이 되지 않는다 — ActiveAugmentControl에는 남지 않는다
    expect(fnBody("ActiveAugmentControl")).not.toContain("dwQueue");
  });

  it("무장이 바뀌거나 풀리면 고른 패·칸·예약을 비운다", () => {
    const sel = fnBody("useSelection");
    expect(sel).toContain('if (armedType !== "dw_swap") clearDw();');
    // arm·submit 둘 다 비운다
    expect(sel.match(/clearDw\(\);/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
  });

  it("무장 중 평범한 타패로 새지 않는다 — 드래그 버림도 막힌다 (dead_wall_master는 TILE_DISCARDED로 창을 닫는다)", () => {
    const fn = APP_CODE.slice(
      APP_CODE.indexOf("function discardOptionFor(id: number | null)"),
      APP_CODE.indexOf("const canDropDiscard ="),
    );
    expect(fn).toContain('DRAG_DISCARD_ARM_TYPES.has(armedAug) || armedAug === "future_exchange"');
    expect(fn).toContain(": undefined;");
  });

  it("도킹 패널은 손패 위 비차단 줄이다 — data-arm-zone, 배경막·포털 없음, 패산 정보 줄 위", () => {
    const dock = fnBody("DeadWallDock");
    expect(dock).toContain('<div className="dw-dock" data-arm-zone="1"');
    expect(dock).not.toContain("createPortal");
    expect(dock).not.toContain("rinshan-pick-overlay");
    // 예약 쌍 · 남은 횟수 · [이대로 교환 (n장)] · [취소]
    expect(dock).toContain("aug-pick-pair");
    expect(dock).toContain("남은 교환 {remaining}회");
    expect(dock).toContain("이대로 교환 ({pairs.length}장)");
    expect(dock).toContain("onClick={sel.dwConfirm}");
    expect(dock).toContain("onClick={() => sel.arm(null)}");
    // 손패를 고르기 전에 왕패를 disabled로 흐리지 않는다
    expect(dock).not.toContain("disabled={disabled}");
    // 깡으로 빠진 영상패는 빈 칸(docs/10)
    expect(dock).toContain("rinshanSpentOf(view)");
    expect(dock).toContain("aug-pick-tile-spent");
    // OwnArea — 패산 정보 줄 바로 위, 무장 중에만
    const at = APP_CODE.indexOf("<DeadWallDock view={view} name={armName}");
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(APP_CODE.indexOf("<WallPeekRow", at));
    // 일반 안내 줄은 패널이 대신한다 — 같은 [취소]가 두 번 서지 않게
    // (2026-09-25 docs/59 U55: 일반 안내 줄은 증강 리치(DRAG형) 무장도 뺀다 — 액션 바가 한 줄로 든다)
    expect(APP_CODE).toMatch(
      /\) : armedAug === "dw_swap" \? \(\s*null\s*\) : armedAug !== null && !DRAG_DISCARD_ARM_TYPES\.has\(armedAug\) \? \(/,
    );
  });

  it("잠깐 뜨는 줄 무리(order:-1 · --own-band 실측 제외)에 든다", () => {
    expect(CSS_CODE).toMatch(/\.own-area > \.dw-dock,\s*\.own-area > \.action-bar,/);
    expect(APP_CODE).toContain('".action-bar, .prompt-timer, .arm-hint, .swap3-reveal-strip, .dw-dock"');
  });

  it("dw_swap은 ARM_MODE hand이고, 안내 문구·행동 부제를 가진다", () => {
    expect(APP_CODE).toMatch(/\n {2}dw_swap: "hand",\n/);
    expect(APP_CODE).toContain('dw_swap: "내 손패와 위의 왕패 칸을 하나씩 눌러 맞바꿀 짝을 정하세요",');
    expect(APP_CODE).toContain('dw_swap: "왕패와 맞바꾸기",');
  });
});

describe("U05 왕패 칸의 자리 이름·색", () => {
  it("deadWallSlotInfo가 짧은 자리 이름을 뒤에서부터 센 자리로 만든다 (상수 인덱스 없음)", () => {
    const fn = fnBody("deadWallSlotInfo");
    expect(fn).toContain("const first = size - INDICATOR_BLOCK;");
    expect(fn).toContain("short: `영상${idx + 1}`");
    expect(fn).toContain("short: `도라${n}✓`");
    expect(fn).toContain("short: `도라${n}`");
    expect(fn).toContain("short: `뒷${n}`");
    // 자리 이름만 — 패 정체(formatTile)를 라벨에 싣지 않는다(가려진 도라)
    expect(fn).not.toContain("formatTile");
  });

  it("칸 안에 span.aug-pick-slot-label을 상시로 그리고, 긴 설명은 aria-label에도 싣는다", () => {
    const dock = fnBody("DeadWallDock");
    expect(dock).toContain('<span className="aug-pick-slot-label">{slot.short}</span>');
    expect(dock).toContain("aria-label={`${slot.label}");
    expect(dock).toContain("className={`aug-pick-tile rinshan-slot-${slot.cls}");
    // 표시패 블록 2단(열 우선) — 도라 위·뒷도라 아래
    expect(ruleBody(".dw-dock-grid")).toContain("grid-auto-flow: column;");
    expect(ruleBody(".dw-dock-grid")).toContain("grid-template-rows: repeat(2, auto);");
  });

  it("자리별 색은 .aug-pick-tile로 한정해 특이도를 높인다 — 절벽 위 꽃 규칙은 그대로", () => {
    for (const cls of ["rinshan", "dora", "dora-open", "ura"]) {
      expect(ruleBody(`.aug-pick-tile.rinshan-slot-${cls}`)).toContain("border-color:");
    }
    // 절벽 위 꽃(.rinshan-slot-rinshan 단독 규칙)은 바뀌지 않는다
    expect(CSS_CODE).toContain(".rinshan-slot-rinshan { border-color: rgba(111, 214, 167, 0.5); }");
    expect(CSS_CODE).not.toMatch(/\n\.rinshan-slot-(dora|ura)/);
  });

  it("고른 칸은 공개된 도라 자리의 금빛 바탕보다 선택 바탕이 앞선다 (B13 리뷰)", () => {
    expect(ruleBody(".dw-dock .aug-pick-tile.aug-pick-tile-on")).toContain("background:");
    expect(ruleBody(".dw-dock .aug-pick-tile.aug-pick-tile-staged")).toContain("background:");
  });

  it("좁은 화면·폰 가로에서 패널을 접는다 — 등가교환 참고 줄과 같은 처지(order:-1, --own-band 밖) (B13 리뷰)", () => {
    const narrow = CSS_CODE.indexOf("@container ui (max-width: 820px) {\n  .dw-dock {");
    // 주석을 걷으면 여는 괄호 뒤에 빈 줄이 남는다 — 공백은 느슨하게
    const land = CSS_CODE.search(/@container ui \(max-height: 560px\) and \(orientation: landscape\) \{\s*\.dw-dock \{/);
    expect(narrow, "좁은 화면 .dw-dock 규칙이 없다").toBeGreaterThan(-1);
    expect(land, "폰 가로 .dw-dock 규칙이 없다").toBeGreaterThan(-1);
    const narrowBody = CSS_CODE.slice(narrow, CSS_CODE.indexOf("\n}\n", narrow));
    const landBody = CSS_CODE.slice(land, CSS_CODE.indexOf("\n}\n", land));
    // 왕패와 버튼을 한 줄에(두 단을 한 단으로), 블록 태그는 칸 이름이 대신한다
    expect(narrowBody).toContain(".dw-dock-body { flex-wrap: nowrap;");
    expect(narrowBody).toContain(".dw-dock-tag { display: none; }");
    expect(landBody).toContain("flex-direction: row;");
    expect(landBody).toContain(".dw-dock-tag { display: none; }");
  });

  it("안 쓰는 옛 모달 규칙(.aug-pick-row-static·.aug-pick-pairs)이 남지 않는다", () => {
    expect(CSS_CODE).not.toContain(".aug-pick-row-static");
    expect(CSS_CODE).not.toContain(".aug-pick-pairs");
  });

  it("DeadWallDock은 «패산 정보» 주석과 WallPeekRow 사이에 끼지 않는다 — 주석이 제 함수에 붙는다", () => {
    const doc = APP.indexOf(" * 손패 위 «패산 정보» 한 줄");
    const fn = APP.indexOf("function WallPeekRow(");
    expect(doc).toBeGreaterThan(-1);
    const between = APP.slice(doc, fn);
    expect(between).not.toContain("function DeadWallDock(");
    expect(between).not.toContain("const DW_FULL_HINT");
  });
});
