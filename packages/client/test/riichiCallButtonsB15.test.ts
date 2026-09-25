/**
 * docs/59 B15 «리치·증강 콜 버튼» 회귀 가드 (2026-09-25).
 *
 * U51 승부수(리치 취소)는 ✦ 메뉴가 아니라 액션 바 [리치] 자리 — 언제나 두 번 눌러 확정 ·
 * U53 ⚡ 증강 리치 버튼에 «리치»·판돈 보조 줄 · U54 증강 리치 둘 이상이면 한 테두리 묶음 ·
 * U55 증강 리치 무장은 평범한 리치 모드처럼 액션 바 한 줄(손패 위 안내 줄 없음) ·
 * U59 증강이 만든 콜(허장성세·묵계·국사 퐁)은 증강 색 + ✦ ·
 * U61 손패를 태우거나 바꾸는 선언은 «두 번 눌러 버리기»가 켜져 있으면 첫 탭이 미리보기.
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
const ALL_OR_NOTHING = read("../../content/src/augments/all_or_nothing.ts");

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
const BAR = fnBody("ActionBar");
const CONTROL = fnBody("ActiveAugmentControl");
const OWN = fnBody("OwnArea");

/** `new Set([...])` 선언 하나의 문자열 원소 — 주석 속 따옴표는 /^[a-z0-9_]+$/로 거른다 */
function setLiterals(name: string): string[] {
  const at = APP_CODE.indexOf(`const ${name} = new Set([`);
  expect(at, `${name} 선언이 없다`).toBeGreaterThan(-1);
  const body = APP_CODE.slice(at, APP_CODE.indexOf("]);", at));
  return [...body.matchAll(/"([^"]+)"/g)].map((m) => m[1]!).filter((s) => /^[a-z0-9_]+$/.test(s));
}

describe("U51 승부수(리치 취소)는 액션 바 [리치] 자리", () => {
  it("✦ 쪽 목록·개수·안내에서 빠진다 — ACTIONBAR_AUG_IDS = 증강 리치 + last_stand", () => {
    expect(APP_CODE).toContain('const ACTIONBAR_AUG_IDS = new Set([...RIICHI_AUG_IDS, "last_stand"]);');
    // hasActive·activeIds 두 곳 모두 새 집합으로
    const uses = CONTROL.match(/ACTIVE_AUGMENT_IDS\.has\(a\) && !ACTIONBAR_AUG_IDS\.has\(a\)/g) ?? [];
    expect(uses.length).toBe(2);
    expect(CONTROL).not.toContain("!RIICHI_AUG_IDS.has(a)");
    // augOptions에서도 뺀다(메뉴 줄·단일 ✦ 직행 경로가 사라진다)
    expect(CONTROL).toMatch(/const augOptions = [\s\S]*?o\.type !== "cancel_riichi" &&/);
  });

  it("cancel_riichi는 AUGMENT_ACTION_TYPES에 그대로다 — 빼면 후로 줄(rawButtons)에 샌다", () => {
    expect(setLiterals("AUGMENT_ACTION_TYPES")).toContain("cancel_riichi");
  });

  it("액션 바가 리치 중에도 선다 — early-null 조건에 후보가 들어간다", () => {
    expect(BAR).toContain('const cancelRiichiOpt = prompt.options.find((o) => o.type === "cancel_riichi");');
    expect(BAR).toMatch(/riichiAugTypes\.length === 0 &&\s*cancelRiichiOpt === undefined\s*\) \{\s*return null;/);
  });

  it("언제나 두 번 눌러 확정 — 첫 탭은 armed, 3초 뒤·프롬프트 바뀌면 풀린다", () => {
    const press = BAR.slice(BAR.indexOf("const pressCancelRiichi = (): void => {"));
    expect(press).toMatch(/if \(!cancelArmed\) \{\s*setCancelArmed\(true\);\s*return;\s*\}/);
    expect(press.indexOf("setCancelArmed(true)")).toBeLessThan(press.indexOf("props.onSubmit(cancelRiichiOpt)"));
    // tapTwiceToDiscard에 묶지 않는다
    expect(press.slice(0, press.indexOf("};"))).not.toContain("tapTwiceToDiscard");
    expect(BAR).toContain("window.setTimeout(() => setCancelArmed(false), 3000)");
    expect(BAR).toMatch(/setCancelArmed\(false\);\s*setPrimedKey\(null\);[\s\S]{0,200}\}, \[props\.prompt\]\);/);
    // 단축키도 버튼과 같은 두 번 누르기 경로
    expect(BAR).toContain("keyed.push({ key: String(keyed.length + 1), run: pressCancelRiichi });");
  });

  it("버튼 — 이름은 증강 이름, 부제가 행동, 첫 탭 뒤엔 «한 번 더 눌러 확정»", () => {
    expect(BAR).toContain('className={`act act-riichi-cancel${cancelArmed ? " act-riichi-cancel-armed" : ""}`}');
    expect(BAR).toContain('{cancelArmed ? "한 번 더 눌러 확정" : augActionName(props.catalog, "cancel_riichi")}');
    expect(BAR).toContain('<span className="act-target">리치 취소 · 리치봉 환급 · 재리치 불가</span>');
    expect(CSS_CODE).toContain(".act-riichi-cancel {");
    expect(CSS_CODE).toContain(".act-riichi-cancel-armed {");
  });

  it("튜토리얼 코치의 .act-riichi 앵커가 리치 취소 버튼에 걸리지 않는다(클래스 토큰이 다르다)", () => {
    expect(BAR).not.toMatch(/className="act act-riichi act-riichi-cancel/);
  });
});

describe("U53 ⚡ 증강 리치 버튼의 보조 줄", () => {
  it("RIICHI_AUG_SUB가 DRAG형 7종을 전부 덮는다", () => {
    const at = APP_CODE.indexOf("const RIICHI_AUG_SUB:");
    const table = APP_CODE.slice(at, APP_CODE.indexOf("\n};\n", at));
    for (const t of setLiterals("DRAG_DISCARD_ARM_TYPES")) {
      expect(table, `${t} 보조 줄이 없다`).toMatch(new RegExp(`\\n  ${t}: `));
    }
    expect(table).toContain('intimidate_riichi: () => "리치 · 타가 1순 쯔모기리"');
    expect(table).toContain('flip_riichi: () => "리치 유지 · 다른 패 버리기"');
  });

  it("올인 판돈은 content allInAmount와 같은 식이다", () => {
    expect(ALL_OR_NOTHING).toContain("Math.max(0, Math.floor(score / 2 / 1000) * 1000)");
    expect(APP_CODE).toContain("const amount = Math.max(0, Math.floor(score / 2 / 1000) * 1000);");
    expect(APP_CODE).toContain("return `리치 · 판돈 ${amount.toLocaleString()}점`;");
  });

  it("본문은 카드 이름 그대로(pill과 이어진다), 보조 줄은 act-target", () => {
    const btn = BAR.slice(BAR.indexOf("const riichiAugButton ="));
    expect(btn).toContain("⚡ {augActionName(props.catalog, t)}");
    expect(btn).toContain('{sub !== "" ? <span className="act-target">{sub}</span> : null}');
  });
});

describe("U54 증강 리치 둘 이상 — 한 테두리 묶음, 셋 이상이면 보조 줄 생략", () => {
  it("riichi-group 래퍼와 조건", () => {
    expect(BAR).toContain("const groupRiichi = riichiAugTypes.length >= 2;");
    expect(BAR).toContain("const showAugSub = riichiAugTypes.length < 3;");
    expect(BAR).toContain('<div className="riichi-group" role="group" aria-label="리치">');
    expect(CSS_CODE).toContain(".riichi-group {");
    // 세로 알약 줄(가로 폰)에서는 묶음도 세로
    expect(CSS_CODE).toMatch(/\.own-area > \.action-bar \.riichi-group \{\s*flex-direction: column;/);
  });

  it("[리치 ▾]로 접지 않는다 — ⚡는 여전히 버튼마다 선다(2026-08-08 결정)", () => {
    expect(BAR).toMatch(/riichiAugTypes\.forEach\(\(t, i\) => \{\s*riichiNodes\.push\(/);
  });
});

describe("U55 증강 리치 무장은 액션 바 한 줄", () => {
  it("riichiLike 분기 — 안내 줄·[취소]=무장 해제·평범한 [리치]·다른 ⚡·[쯔모]", () => {
    expect(BAR).toContain("const riichiLike = props.riichiMode || armedRiichiAug !== null;");
    expect(BAR).toContain("const switchAugTypes = riichiAugTypes.filter((t) => t !== armedRiichiAug);");
    expect(BAR).toMatch(/armedRiichiAug === "flip_riichi" \? "버릴 패" : "리치할 패"\s*\}를 바닥으로 끌어 놓거나 클릭하세요/);
    expect(BAR).toMatch(/const cancelRiichiLike = \(\): void => \{\s*if \(armedRiichiAug !== null\) sel\.arm\(null\);\s*else props\.onRiichiMode\(false\);/);
    expect(BAR).toContain("{armedRiichiAug !== null ? winButtons.map((o, i) => renderButton(o, i)) : null}");
    // 잠긴 선언(🔒 론/쯔모)은 무장 중에도 자리를 지킨다 — 평상시 분기와 같은 목록(리뷰 R2)
    expect(BAR).toContain("{armedRiichiAug !== null ? lockedButtons : null}");
    expect(BAR).toContain("{lockedButtons}\n      {wins.map((o, i) => renderButton(o, i))}");
    // 평범한 리치 모드의 문구·취소 클래스는 그대로(튜토리얼 코치가 .action-bar .act-cancel을 본다)
    expect(BAR).toContain('"리치할 패를 바닥으로 끌어 놓거나 클릭하세요"');
    expect(BAR).toContain('<button className="act act-cancel" onClick={cancelRiichiLike} title="취소 (단축키 1)">');
  });

  it("OwnArea 일반 안내 줄은 DRAG형 무장을 그리지 않는다", () => {
    expect(OWN).toContain(") : armedAug !== null && !DRAG_DISCARD_ARM_TYPES.has(armedAug) ? (");
    // DRAG형 무장 중에는 아래 영상패 다시 열기 줄로 흘러내리지 않는다(U55 리뷰)
    const at = OWN.indexOf(") : armedAug !== null && !DRAG_DISCARD_ARM_TYPES.has(armedAug) ? (");
    const rest = OWN.slice(at);
    expect(rest.indexOf(") : armedAug !== null ? (")).toBeGreaterThan(-1);
    expect(rest.indexOf(") : armedAug !== null ? (")).toBeLessThan(
      rest.indexOf(") : canPickRinshan && rinshanDismissed ? ("),
    );
  });

  it("드롭존은 버튼과 같은 이름 — ⚡ 여기에 놓으면 {증강 이름} 리치", () => {
    expect(OWN).toContain("? `⚡ 여기에 놓으면 ${armName}`");
    expect(OWN).toContain(": `⚡ 여기에 놓으면 ${armName} 리치`");
    expect(OWN).toContain('armedAug === "flip_riichi" || armName.includes("리치")');
  });

  it("무장 중 켜짐(act-riichi-aug-on)은 걷었다 — 무장한 ⚡는 서지 않는다", () => {
    expect(APP_CODE).not.toContain("act-riichi-aug-on");
    expect(CSS_CODE).not.toContain(".act-riichi-aug-on");
  });
});

describe("U59 증강이 만든 콜은 증강 색 + ✦", () => {
  it("tone에 ACTION_AUGMENT 매핑이 들어가고, 라벨 앞에 ✦", () => {
    expect(BAR).toContain("const fromAugment = ACTION_AUGMENT[o.type] !== undefined;");
    expect(BAR).toContain(
      'ACTION_LABEL[o.type] === undefined || AUGMENT_ACTION_TYPES.has(o.type) || fromAugment',
    );
    expect(BAR).toContain('{fromAugment ? "✦ " : ""}');
  });

  it("세 콜은 AUGMENT_ACTION_TYPES에 넣지 않는다 — 넣으면 rawButtons가 버튼을 지운다", () => {
    const set = setLiterals("AUGMENT_ACTION_TYPES");
    for (const t of ["bluff_pon", "silent_pon", "kokushi_pon"]) expect(set).not.toContain(t);
  });

  it("라벨은 짧은 동작명(국사 퐁·묵계 퐁)", () => {
    expect(APP_CODE).toContain('kokushi_pon: "국사 퐁",');
    expect(APP_CODE).toContain('silent_pon: "묵계 퐁",');
  });
});

describe("U61 손패를 태우거나 바꾸는 선언 — 터치에서 첫 탭은 미리보기", () => {
  it("대상 세 가지", () => {
    expect(setLiterals("PREVIEW_FIRST_TYPES")).toEqual(["bluff_pon", "dragons_will", "even_world_flip"]);
  });

  it("액션 바 — 설정이 켜져 있으면 첫 탭은 primed + 재료 짚기, 둘째 탭이 제출", () => {
    expect(BAR).toContain(
      'const previewFirst = props.tapTwiceToDiscard === true && PREVIEW_FIRST_TYPES.has(o.type);',
    );
    expect(BAR).toMatch(
      /if \(previewFirst && primedKey !== key\) \{\s*setPrimedKey\(key\);\s*props\.onDoomedHint\?\.\(doomedTileIdsOf\(view, o\.type\)\);\s*return;\s*\}\s*setPrimedKey\(null\);\s*props\.onSubmit\(o\);/,
    );
    // 클릭과 숫자 단축키가 같은 길(pressOption)을 탄다 — 키보드로는 게이트 없이 곧장 나가던 구멍(리뷰 R2)
    expect(BAR).toContain("onClick={() => pressOption(o, key)}");
    expect(BAR).toContain("run: () => pressOption(o, `${o.type}-${i}`)");
    expect(BAR).not.toContain("run: () => props.onSubmit(o)");
    // 첫 탭을 받은 동안은 손을 떼도 짚은 패를 끄지 않는다 — 바 전체의 첫 탭을 본다(옆 버튼을
    // 스쳐도 첫 탭을 받은 콜의 재료로 되돌린다, U61 리뷰)
    expect(BAR).toContain("onMouseLeave={restoreDoomed}");
    expect(BAR).toContain("onBlur={restoreDoomed}");
    expect(BAR).toContain(
      "props.onDoomedHint?.(primedType === null ? null : doomedTileIdsOf(view, primedType));",
    );
    expect(BAR).not.toContain("if (!primed) props.onDoomedHint?.(null);");
    expect(BAR).toContain('<span className="act-target">한 번 더 눌러 발동</span>');
  });

  it("✦ 메뉴 줄과 단일 ✦ 직행 경로도 같은 게이트", () => {
    expect(CONTROL).toMatch(/onClick=\{\(\) => \{\s*if \(primeFirst\(type\)\) return;\s*activate\(type\);/);
    expect(CONTROL).toMatch(/if \(primeFirst\(types\[0\]!\)\) return;\s*activate\(types\[0\]!\);/);
    // 즉시 제출되는 경로만(무장·모달·후보 여럿은 이미 한 단계가 있다)
    expect(CONTROL).toMatch(
      /const previewFirst = \(type: string\): boolean =>\s*props\.tapTwiceToDiscard === true &&\s*PREVIEW_FIRST_TYPES\.has\(type\) &&\s*!armType\(type\) &&\s*!MODAL_PICK_TYPES\.has\(type\) &&\s*\(byType\.get\(type\)\?\.length \?\? 0\) === 1;/,
    );
    expect(CONTROL).toContain('<span className="aug-btn-sub">· 한 번 더 눌러 발동</span>');
  });

  it("프롬프트가 바뀌거나 언마운트되면 첫 탭이 고정한 미리보기도 끈다(U61 리뷰)", () => {
    // 시간 초과·남의 선언으로 순이 지나가면 바깥 누르기가 없어 ✕·발광이 판 끝까지 남았다
    expect(BAR).toMatch(
      /setPrimedKey\(null\);[\s\S]*?return \(\) => \{\s*if \(primedKeyRef\.current !== null\) doomedHintRef\.current\?\.\(null\);\s*\};\s*\}, \[props\.prompt\]\);/,
    );
    expect(CONTROL).toMatch(
      // B18(U61): 짝수의 세계 제자리 미리보기(onFlip)도 함께 끈다 — hover만 받은 경우도 있어 첫 탭 검사보다 먼저
      /return \(\) => \{\s*onFlip\?\.\(false\);\s*if \(primedRef\.current === null\) return;\s*onHint\?\.\(null\);\s*onDoomed\?\.\(null\);\s*\};\s*\}, \[myPrompt\]\);/,
    );
    // 다른 줄을 스쳤다 떠나도 첫 탭의 재료로 되돌린다
    expect(CONTROL).toMatch(/const hintNone = \(\): void => \{\s*if \(primed !== null\) \{\s*hintOne\(primed\);/);
  });

  it("다른 곳을 누르거나 프롬프트가 바뀌면 풀린다", () => {
    expect(CONTROL).toMatch(/setPrimed\(null\);[\s\S]{0,200}\}, \[myPrompt\]\);/);
    // 표식은 주인별 — 한쪽 첫 탭 버튼을 눌러도 다른 쪽 첫 탭은 풀린다(U61 리뷰)
    expect(CONTROL).toContain("t.closest('[data-confirm-pending=\"aug\"]')");
    expect(BAR).toContain("t.closest('[data-confirm-pending=\"bar\"]')");
    expect(APP_CODE).not.toContain('data-confirm-pending={primed ? "1"');
    // 발동하면 첫 탭 상태와 무관하게 발광·짚기를 끈다(가드된 hintNone이 아니라 clearHints)
    const at = CONTROL.indexOf("const activate = (type: string): void => {");
    const activate = CONTROL.slice(at, CONTROL.indexOf("setMenuType(type);", at));
    expect(activate).toContain("setPrimed(null);");
    expect(activate).toContain("clearHints();");
    expect(activate).not.toContain("hintNone()");
  });

  it("두 컨트롤 모두 설정을 받는다", () => {
    expect(OWN.match(/tapTwiceToDiscard=\{props\.tapTwiceToDiscard\}/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("허장성세 퐁 버튼에 [일치패] + [희생패 ✕]를 늘 그린다 — 값은 서버 재료 채널 그대로", () => {
    const tiles = fnBody("ActionTiles");
    expect(tiles).toContain('if (option.type === "bluff_pon" && typeof p.tileId === "number") {');
    expect(tiles).toContain('const material = doomedTileIdsOf(view, "bluff_pon")[0];');
    expect(tiles).toContain('<span className="act-tile-doomed"');
    expect(CSS_CODE).toMatch(/\.act-tile-doomed::after \{[^}]*content: "✕"/);
  });

  it("설정 설명이 되돌릴 수 없는 발동까지 넓어졌다", () => {
    expect(APP).toContain("되돌릴 수 없는 발동(허장성세 퐁·삼원의 의지·짝수의 세계 등)도 첫 번째 누름은 미리보기만");
  });
});
