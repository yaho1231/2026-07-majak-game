/**
 * docs/59 B09 «이름표로 고르기» 회귀 가드 (2026-09-25).
 *
 * U24 무장해제 — 잠글 상대 증강을 ✦ 메뉴 2단계 «봇1의 ○○» 글자 목록 대신 상대 이름표 pill로
 *     (pill이 숨는 좁은 화면은 상대 줄 → 증강 시트 «잠그기»)
 * U32 재장전 — 되살릴 내 증강을 내 이름표 pill로
 * U27 상대 줄 전체가 대상인 무장 중에는 이름표 안의 이름·알약이 제 동작(시트·고정)을 멈추고 줄로 올린다
 *
 * 평소(무장 아님) 동작 — pill 클릭 = 설명 고정(2026-08-12), 폰에서 이름·알약 탭 = 증강 시트
 * (2026-08-27·28) — 은 그대로여야 한다(docs/59 §2-2). 다른 클라 테스트와 같은 **정적 소스 스캔**이다.
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

/** `start` 문자열부터 그 뒤 첫 `end`까지 */
function between(start: string, end: string): string {
  const at = APP_CODE.indexOf(start);
  expect(at, `${start} 를 못 찾았다`).toBeGreaterThan(-1);
  const stop = APP_CODE.indexOf(end, at);
  expect(stop, `${start} 뒤의 ${end} 를 못 찾았다`).toBeGreaterThan(at);
  return APP_CODE.slice(at, stop);
}

const NAMEPLATE = between("const NamePlate = memo(function NamePlate(", "\n});\n");
const SHEET = between("function PlayerAugSheet(", "\n}\n");
const STRIP = between("function OpponentStrip(", "\n}\n");
const SELECTION = between("function useSelection(", "\n}\n");

/** `a`가 `b`보다 앞에 나오는가(둘 다 있어야 한다) */
function before(src: string, a: string, b: string): void {
  const ia = src.indexOf(a);
  const ib = src.indexOf(b, Math.max(ia, 0));
  expect(ia, `${a} 가 없다`).toBeGreaterThan(-1);
  expect(ib, `${a} 뒤에 ${b} 가 없다`).toBeGreaterThan(ia);
}

describe("U24·U32 무장 방식 — 이름표 pill", () => {
  it("ArmMode에 opp-aug·own-aug가 있고 안내 줄·메뉴 힌트가 그 모드를 말한다", () => {
    // B10이 뒤에 "own-meld"(파혼)를 붙였다 — 순서만 보고 끝은 열어 둔다
    expect(APP_CODE).toMatch(/^type ArmMode = [^;]*"opp-aug" \| "own-aug"[^;]*;/m);
    expect(APP_CODE).toContain('case "opp-aug":\n      return "잠글 상대의 증강(이름표 또는 상대 줄)을 누르세요";');
    expect(APP_CODE).toContain('case "own-aug":\n      return "되살릴 내 증강을 이름표에서 클릭하세요";');
    expect(APP_CODE).toContain('case "opp-aug":\n        return "상대 증강 클릭으로 선택";');
    expect(APP_CODE).toContain('case "own-aug":\n        return "내 증강 클릭으로 선택";');
  });

  it("무장해제 옵션은 target과 augmentId 둘 다로 찾는다 — opp의 target만 보는 첫 옵션이 아니다", () => {
    const helper = between("function augPickOption(", "\n}\n");
    expect(helper).toContain("p.augmentId === augId");
    expect(helper).toContain("target === undefined || p.target === target");
    // 옵션 찾기는 이름표 쪽 한 곳 — 쓰지 않는 ctx 사본을 두지 않는다(B09 리뷰)
    expect(APP_CODE).not.toContain("oppAugOptionFor");
    expect(APP_CODE).not.toContain("ownAugOptionFor");
    // 이미 잠긴 증강만 남은 상대는 줄을 강조하지 않는다 — 시트 행이 전부 꺼진 입구가 된다(B09 리뷰)
    const armable = SELECTION.slice(SELECTION.indexOf("const oppAugArmable"));
    expect(armable).toContain("disarmedAugmentsOf(view, pid)");
    expect(armable).toContain("!locked.has(p.augmentId)");
    // opp 모드의 clickOpp는 opp-aug에서 아무것도 내지 않는다 — 줄 클릭이 곧바로 잠그면 안 된다
    expect(SELECTION).toContain('if (armMode !== "opp") return;');
  });

  it("상대 줄은 무장해제의 입구다 — 줄 클릭은 고르기 시트를 열 뿐 제출하지 않는다", () => {
    expect(STRIP).toMatch(/oppAugArmable\s*\?\s*\{\s*"data-arm-zone": "1",\s*\.\.\.clickableProps\(\s*\(\) => setAugPickOpen\(true\)/);
    expect(STRIP).toContain('opp-aug-armable');
    // 시트의 «잠그기»는 target까지 맞춘 옵션을 낸다
    expect(STRIP).toContain("augPickOption(armedOptions, augId, player.id)");
    expect(STRIP).toContain('verb: "잠그기"');
    // 이미 잠긴 증강은 후보에서 뺀다
    expect(STRIP).toContain("lockedAugs.has(augId) ? undefined");
    // 태그 — «무장해제: 잠글 증강을 고르세요»
    expect(APP_CODE).toMatch(/const OPP_ARM_TAG[\s\S]*?disarm_lock: "잠글 증강을 고르세요"/);
  });

  it("NamePlate(memo)에는 무장 중일 때만 고르기 콜백을 내린다", () => {
    expect(STRIP).toContain("...(oppAugArmable ? { pickAug, onPickAug: sel.submit } : {})");
    // 비후보 줄(armMiss)도 armTarget — W3 통합 리뷰 interaction-1
    expect(STRIP).toContain("...(oppArmable || oppAugArmable || armMiss ? { armTarget: true } : {})");
    expect(APP_CODE).toContain(
      "{...(ownAugArmed ? { pickAug: pickOwnAug, onPickAug: sel.submit } : {})}",
    );
    expect(APP_CODE).toMatch(/const pickOwnAug = useCallback\(/);
    expect(STRIP).toMatch(/const pickAug = useCallback\(/);
  });
});

describe("U24·U32·U27 NamePlate — 무장 중에만 다르게, 평소 동작은 그대로", () => {
  it("pill 클릭: 툴팁 안쪽 걸러내기 → 후보면 제출 → 줄 대상이면 올려 보내기 → 평소엔 고정", () => {
    const click = NAMEPLATE.slice(NAMEPLATE.indexOf('closest(".aug-tip")') - 120);
    before(click, 'closest(".aug-tip")', "onPickAug?.(armOpt)");
    before(click, "onPickAug?.(armOpt)", "if (armTarget === true) {");
    before(click, "if (armTarget === true) {", "togglePin(a);");
    // 고르는 중 후보 아닌 pill은 빗나감 — 고정하지 않고, 상대 줄의 고르기 시트로도 번지지 않는다(원칙 7, B09 리뷰)
    expect(click).toMatch(/if \(picking\) \{\s*e\.stopPropagation\(\);\s*return;\s*\}/);
    before(click, "if (picking) {", "if (armTarget === true) {");
    // 줄 대상(opp)이면 확정 뒤 툴팁이 남지 않게 걷고 올려 보낸다(U27, B09 리뷰)
    // (W3 수정 커밋 리뷰) 비후보 줄(armMissLabel)이면 읽던 툴팁을 닫지 않고 그냥 올려 보낸다
    expect(click).toMatch(
      /if \(armTarget === true\) \{\s*if \(armMissLabel !== undefined\) return;\s*e\.currentTarget\.blur\(\);\s*setTipFor\(null\);\s*return;\s*\}/,
    );
    // 후보 pill은 줄의 시트 열기로 번지지 않는다
    expect(click.slice(0, click.indexOf("togglePin(a);"))).toContain("e.stopPropagation();");
  });

  it("후보 pill은 키보드로도 고르고, 툴팁 안쪽의 Enter는 가로채지 않는다", () => {
    expect(NAMEPLATE).toContain("clickableProps(() => onPickAug?.(armOpt)");
    expect(NAMEPLATE).toContain("if (e.target === e.currentTarget) cp.onKeyDown(e);");
    // 키보드로 고른 뒤에도 포커스를 놓는다 — focus 툴팁이 확정 뒤에 남지 않게(B09 리뷰)
    before(NAMEPLATE, "(e.currentTarget as HTMLElement).blur();", "if (e.target === e.currentTarget) cp.onKeyDown(e);");
    expect(NAMEPLATE).toContain('" aug-pill-armable" : picking ? " aug-pill-unpickable" : ""');
  });

  it("이름 버튼: 줄 대상이면 시트를 열지 않고 줄로 올린다(U27), 평소엔 시트", () => {
    const name = NAMEPLATE.slice(NAMEPLATE.indexOf('className="np-name np-name-btn"'));
    before(name, "if (armTarget === true) return;", "setSheetOpen(true);");
    expect(name.slice(0, name.indexOf("setSheetOpen(true);"))).not.toContain("stopPropagation");
    // 줄 대상일 때는 «증강 보기»로 읽히지도 포커스를 받지도 않는다 — 줄 하나만 읽힌다(B09 리뷰)
    // (W3 수정 커밋 리뷰) 비후보 줄(armMissLabel)은 확정이 없어 숨기지 않고 «이름: 사유»로 읽힌다
    expect(name.slice(0, name.indexOf("onClick"))).toContain(
      '{...(armTarget === true && armMissLabel === undefined ? { tabIndex: -1, "aria-hidden": true } : {})}',
    );
    // 보기 시트를 연 채로 줄이 대상이 되면 걷는다
    expect(NAMEPLATE).toMatch(/if \(armTarget === true\) setSheetOpen\(false\);/);
  });

  it("알약 덮개(폰): 후보면 제출, 줄 대상이면 올려 보내기, 평소엔 시트", () => {
    const hit = NAMEPLATE.slice(NAMEPLATE.indexOf('className="aug-pill-sheet-hit"'));
    before(hit, "onPickAug?.(armOpt)", "if (armTarget === true) return;");
    before(hit, "if (armTarget === true) return;", "setSheetOpen(true);");
    // 제출 전에 포커스를 놓는다 — focusin 툴팁이 확정 뒤에 남지 않게(B09 리뷰)
    before(hit, "e.currentTarget.blur();", "onPickAug?.(armOpt)");
    // 후보 덮개의 Enter·Space가 줄의 onKeyDown(시트 열기)으로 새지 않는다
    expect(hit).toContain('if (armOpt !== undefined && (e.key === "Enter" || e.key === " ")) e.stopPropagation();');
    // 줄 대상일 때 후보 아닌 덮개는 «증강 보기»로 읽히지 않는다(B09 리뷰)
    expect(hit.slice(0, hit.indexOf("onClick"))).toContain(
      '{...(armTarget === true && armOpt === undefined ? { tabIndex: -1, "aria-hidden": true } : {})}',
    );
  });

  it("고르는 중에는 이름표 전체가 arm-zone — 내 이름·후보 아닌 pill을 눌러도 재장전이 조용히 풀리지 않는다", () => {
    expect(NAMEPLATE).toContain('{...(picking ? { "data-arm-zone": "1" } : {})}');
  });

  it("줄 대상일 때 툴팁 안(«자세히»)을 누른 것이 줄의 확정으로 번지지 않는다", () => {
    expect(NAMEPLATE).toMatch(
      /armTarget === true\s*\?\s*\{\s*onClick: \(e: React\.MouseEvent\) => e\.stopPropagation\(\)/,
    );
  });

  it("내 이름표의 시트도 무장 중에는 고르기 모드로 연다", () => {
    expect(NAMEPLATE).toMatch(/\.\.\.\(picking\s*\?\s*\{\s*pick: \{/);
    expect(NAMEPLATE).toContain('verb: pickVerb');
    expect(NAMEPLATE).toContain('const pickVerb = isMe ? "되살리기" : "잠그기";');
  });
});

describe("U24 PlayerAugSheet 고르기 모드", () => {
  it("시트 루트는 arm-zone이고 클릭·Enter/Space를 막는다 — 포털이어도 합성 이벤트는 줄까지 올라간다", () => {
    const root = SHEET.slice(SHEET.indexOf('className="overlay overlay-peekable aug-sheet-overlay"'));
    const head = root.slice(0, root.indexOf('className="aug-sheet"'));
    expect(head).toContain('data-arm-zone="1"');
    before(head, "e.stopPropagation();", "onClose();");
    // Enter·Space는 고르기 모드에서만 — 보기 시트에서는 창의 Space 건너뛰기가 받아야 한다(B09 리뷰)
    expect(head).toContain('if (pick !== undefined && (e.key === "Enter" || e.key === " ")) e.stopPropagation();');
    // Esc는 막지 않는다 — 창의 keydown이 시트를 닫는다
    expect(head).not.toContain("Escape");
  });

  it("행마다 고르기 버튼, 후보가 아니면 꺼진다(이미 잠김)", () => {
    expect(SHEET).toContain('className="aug-sheet-pick"');
    expect(SHEET).toContain("disabled={pickOpt === undefined}");
    expect(APP_CODE).toContain('const PICK_OFF_LOCK = (locked: boolean): string => (locked ? "이미 잠김" : "고를 수 없음");');
    // 꺼진 행은 읽어 주는 이름도 이유를 말한다 — 꺼진 «잠그기»만 들리면 왜인지 모른다(B09 리뷰)
    expect(SHEET).toContain("`${augName(a, catalog)} — ${pickOff}`");
    expect(APP_CODE).toContain("off: isMe ? PICK_OFF_RELOAD : PICK_OFF_LOCK,");
  });

  it("고르기 버튼은 손가락 과녁 44px", () => {
    const m = /\.aug-sheet-pick \{([^}]*)\}/.exec(CSS_CODE);
    expect(m).not.toBeNull();
    expect(m![1]).toContain("min-height: 44px");
  });
});

describe("CSS — 누를 수 있는 pill 맥동은 reduced-motion에서 선다", () => {
  it(".aug-pill-armable 맥동 + reduce 블록", () => {
    expect(CSS_CODE).toMatch(/\.aug-pill-armable \{[^}]*animation: aug-pill-usable-pulse/);
    expect(CSS_CODE).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.aug-pill-armable \{\s*animation: none;/,
    );
  });

  it("무장해제 줄은 맥동하지 않는다(맥동은 pill 몫)", () => {
    const m = /\.opp-aug-armable \{([^}]*)\}/.exec(CSS_CODE);
    expect(m).not.toBeNull();
    expect(m![1]).not.toContain("animation");
  });
});
