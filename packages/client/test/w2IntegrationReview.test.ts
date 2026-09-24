/**
 * docs/59 W2(B04~B08) 통합 리뷰 반영 회귀 가드 (2026-09-25).
 *
 * interaction-1 리치 단축키가 무장을 풀지 않아 리치하려던 손패 클릭이 증강(이면투시 바꿔치기 등)으로 나갔다 ·
 * interaction-2 이면투시 목적지 칸을 누르면 판 빈 곳으로 판정돼 무장이 조용히 풀렸다 ·
 * interaction-3 붉은 손길 — 같은 숫자로 칠해진 다른 장을 눌러도 확정되지 않고 들어 올림만 옮겨 갔다 ·
 * interaction-4 등가교환 take 단계 — 전송 실패로 오버레이만 내려가면 손패 타패가 샜다 ·
 * regression-1 등가교환 참고 줄이 --own-band 에 들어가 뜨고 질 때마다 보드가 출렁였다 ·
 * regression-2 안내 줄 주 버튼 라벨이 길어져 375 폭에서 두 줄로 쪼개졌다 ·
 * regression-3 변형 팝오버 닫기(24px)가 터치 목표로 너무 작았다.
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

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

function between(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  expect(a, start).toBeGreaterThanOrEqual(0);
  const b = src.indexOf(end, a + start.length);
  expect(b, end).toBeGreaterThan(a);
  return src.slice(a, b);
}

describe("interaction-1 리치 단축키도 무장을 먼저 푼다", () => {
  it("단축키 1(리치 진입)이 버튼과 같이 sel.arm(null) 뒤 리치 모드를 켠다", () => {
    expect(APP_CODE).toContain(
      'if (hasRiichi) keyed.push({ key: "1", run: () => { sel.arm(null); props.onRiichiMode(true); } });',
    );
    expect(APP_CODE).not.toContain('keyed.push({ key: "1", run: () => props.onRiichiMode(true) })');
  });
});

describe("interaction-2 이면투시 목적지 줄은 무장 해제 대상이 아니다", () => {
  it("바꿔치기 무장 중 center-ura-peek 에 data-arm-zone 과 안내 토스트가 붙는다", () => {
    const peek = between(APP_CODE, 'className="center-dora center-ura center-ura-peek"', "{peeked.map(");
    expect(peek).toContain("uraSwapArmed");
    expect(peek).toContain('"data-arm-zone": "ura-target"');
    expect(peek).toContain('onToast?.("손패에서 이 자리로 보낼 패를 누르세요")');
  });

  it("GameTable 이 CenterPanel 에 onToast 를 넘긴다", () => {
    const call = between(APP_CODE, "<CenterPanel", "/>");
    expect(call).toContain("onToast: props.onToast");
    expect(between(APP_CODE, "function CenterPanel(", "): JSX.Element {")).toContain(
      "onToast?: (text: string) => void;",
    );
  });
});

describe("interaction-3 붉은 손길 — 같은 숫자의 다른 장도 둘째 탭", () => {
  it("isArmSecondTap 의 같은 옵션 규칙이 red_touch 에도 걸린다", () => {
    const fn = between(APP_CODE, "const isArmSecondTap = (id: number): boolean =>", ";\n");
    expect(fn).toContain('(KIND_TARGET_ARM_TYPES.has(armedAug) || armedAug === "red_touch")');
    expect(fn).toContain("armedByTile.get(armedTileId)?.[0] === armedByTile.get(id)?.[0]");
  });

  it("red_touch 첫 탭 분기가 tileId 가 아니라 isArmSecondTap 으로 판정한다", () => {
    expect(APP_CODE).toContain('if (armedAug === "red_touch" && !isArmSecondTap(id) && armedByTile.has(id)) {');
    expect(APP_CODE).not.toContain('armedAug === "red_touch" && armedTileId !== id && armedByTile.has(id)');
  });
});

describe("interaction-4 등가교환 — give·take 두 단계 모두 타패를 막는다", () => {
  it("막는 기준이 프롬프트의 두 단계 공통(stage !== null)이다", () => {
    expect(APP_CODE).toContain("const swap3Pending = !isSpectator && swap3Pick.stage !== null;");
    expect(APP_CODE).not.toContain("swapGivePending");
  });

  it("discardOptionFor·beginDrag·손패 클릭 세 경로가 모두 막는다", () => {
    expect(between(APP_CODE, "function discardOptionFor(", "\n  }\n")).toContain("if (swap3Pending) return undefined;");
    expect(between(APP_CODE, "function beginDrag(", "const container = handRef.current;")).toContain(
      "if (swap3Pending) return;",
    );
    // take 단계(swapGiveInHand 거짓)면 손패 클릭은 아무것도 하지 않는다 — 선택은 모달이 맡는다
    const click = between(APP_CODE, "if (swap3Pending) {", "toggleSwap3(id);");
    expect(click).toContain("if (!swapGiveInHand) return;");
  });
});

describe("regression-1 등가교환 참고 줄은 --own-band 에 들지 않는다", () => {
  it("실측 제외 목록과 CSS order:-1 목록이 둘 다 .swap3-reveal-strip 을 포함한다", () => {
    expect(APP_CODE).toContain('el.matches(".action-bar, .prompt-timer, .arm-hint, .swap3-reveal-strip")');
    const order = between(CSS_CODE, ".own-area > .action-bar,\n", "order: -1;");
    expect(order).toContain(".own-area > .prompt-timer,");
    expect(order).toContain(".own-area > .arm-hint,");
    expect(order).toContain(".own-area > .swap3-reveal-strip");
  });
});

describe("regression-2 안내 줄 버튼은 접히지 않고, 좁은 화면에선 문장 아래로 내린다", () => {
  it("버튼 nowrap·flex:none, 문장 min-width:0", () => {
    expect(CSS_CODE).toMatch(/\.arm-hint > button \{\s*flex: none;\s*white-space: nowrap;\s*\}/);
    expect(CSS_CODE).toMatch(/\.arm-hint-text \{\s*min-width: 0;\s*\}/);
  });

  it("@container ui (max-width: 700px) 에서 줄바꿈해 버튼을 문장 아래로", () => {
    expect(CSS_CODE).toMatch(
      /@container ui \(max-width: 700px\) \{\s*\.arm-hint \{\s*flex-wrap: wrap;\s*justify-content: center;[^}]*\}\s*\.arm-hint-text \{\s*flex: 1 1 100%;/,
    );
  });
});

describe("regression-3 변형 팝오버 닫기의 터치 목표", () => {
  it("coarse 포인터에서 ::before 로 누르는 영역을 넓힌다", () => {
    expect(CSS_CODE).toMatch(
      /@media \(pointer: coarse\) \{\s*\.arm-sub-pop-close \{\s*position: relative;\s*\}\s*\.arm-sub-pop-close::before \{\s*content: "";\s*position: absolute;\s*inset: -10px;/,
    );
  });
});

describe("W2 상태 수명 재검토 — 강제 선택 중 판 안 컨트롤", () => {
  it("설정·나가기·토글 같은 컨트롤을 누르면 «먼저 정하세요» 토스트를 덧붙이지 않는다", () => {
    // B10(2026-09-25, docs/59 U25)이 «판 밖이면 아무것도 안 한다»를 onDown 맨 앞으로 올렸다 — 판 밖
    // 조작은 강제 분기에 닿기 전에 끝나고, 컨트롤 판정(onControl)은 강제 분기와 일반 해제가 함께 쓴다
    const watch = between(APP_CODE, "const onDown = (e: PointerEvent): void => {", "selection.arm(null);");
    expect(watch).toMatch(/if \(t === null \|\| tableRef\.current\?\.contains\(t\) !== true\) return;/);
    expect(watch).toMatch(/closest\("button, \[role=button\], a, input, select, textarea, label"\)/);
    expect(watch).toMatch(/FORCED_ARM_TYPES\.has\(selection\.armedType\)\) \{\n\s*if \(!onControl\) props\.onToast\?\.\(FORCED_PICK_HINT\);/);
  });
});

describe("W2 상태 수명 재검토 — 등가교환 제출 전송 실패", () => {
  it("submitOption 이 전송 성공 여부를 돌려준다", () => {
    const fn = between(APP_CODE, "function submitOption(option: ActionOption): boolean", "function pickDraft(");
    expect(fn).toMatch(/if \(!sent\) return false;/);
    expect(fn).toMatch(/setRiichiMode\(false\);\s*return true;/);
  });

  it("전송이 실패하면 고르던 3장·안내 줄·모달을 닫지 않는다", () => {
    const fn = between(APP_CODE, "const submitSwap3 = (): void => {", "};");
    const guard = fn.indexOf("props.onSubmit(swap3Option) === false) return;");
    expect(guard).toBeGreaterThan(0);
    expect(fn.indexOf("setSwapTakeDismissed(true)")).toBeGreaterThan(guard);
    expect(fn.indexOf("setSwapGives(")).toBeGreaterThan(guard);
  });
});
