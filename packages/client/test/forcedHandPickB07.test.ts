/**
 * docs/59 B07 «강제 손패 선택: 미래를 보는 자·등가교환 넘길 3장 + 3장 확정 통일» 회귀 가드 (2026-09-25).
 *
 * U03 미래를 보는 자 — 뽑힌 3장을 전면 모달에 다시 그리지 않고 판의 손패에서 고른다(강제 무장) ·
 * U07 등가교환 넘길 3장 — 판의 손패를 클릭 토글 + 안내 줄 [이 3장 넘기기] ·
 * U10 3장 고르기는 3장째에 곧바로 나가지 않고 [확정]으로 낸다.
 *
 * 모달이 판 전체를 덮어 지키던 «다른 수 봉쇄»(2026-08-01 «쓰면 무조건 교환», 2026-08-02 «닫기
 * 없음 = 무료 열람 금지»)가 새 조작에서도 그대로인지가 핵심이다 — 구멍 하나면 평범한 타패가
 * 나가 교환 없이 쿨다운만 날아가거나 상대 손패만 보고 나간다.
 *
 * 다른 클라 테스트와 같은 **정적 소스 스캔**이다(렌더하지 않는다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);

/** `const NAME = new Set([...]);` 의 식별자 모양 문자열 */
function setIds(name: string): string[] {
  const m = new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)^\\]\\);`, "m").exec(APP_CODE);
  expect(m, `${name} 선언이 없다`).not.toBeNull();
  return [...m![1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!).filter((x) => /^[a-z0-9_]+$/.test(x)).sort();
}

/** `function name(` 부터 다음 최상위 `\n}\n` 까지 */
function fnBody(name: string): string {
  const at = APP_CODE.indexOf(`function ${name}(`);
  expect(at, `${name} 함수가 없다`).toBeGreaterThan(-1);
  return APP_CODE.slice(at, APP_CODE.indexOf("\n}\n", at));
}

/** OwnArea 한 덩어리 */
const OWN = (() => {
  const at = APP_CODE.indexOf("function OwnArea(props: {");
  expect(at).toBeGreaterThan(0);
  return APP_CODE.slice(at, APP_CODE.indexOf("\nfunction ", at + 10));
})();

describe("강제 선택 집합", () => {
  it("미래를 보는 자·등가교환 두 단계가 강제 선택이고, 손패 무장으로 고르는 것은 미래를 보는 자뿐", () => {
    expect(setIds("FORCED_PICK_TYPES")).toEqual(["future_exchange", "swap3_give", "swap3_take"]);
    expect(setIds("FORCED_ARM_TYPES")).toEqual(["future_exchange"]);
  });

  it("future_exchange는 손패 무장(hand)이지만 증강 리치 집합에는 없다 — ✦ 버튼에서 빠지면 안 된다", () => {
    // DRAG_DISCARD_ARM_TYPES가 곧 RIICHI_AUG_IDS라, 넣으면 ✦ 목록·개수에서 사라지고 액션 바에 버튼이 선다
    expect(APP_CODE).toMatch(/const ARM_MODE: Record<string, ArmMode> = \{[\s\S]*?\n  future_exchange: "hand",\n[\s\S]*?^\};/m);
    expect(setIds("DRAG_DISCARD_ARM_TYPES")).not.toContain("future_exchange");
    // 되돌릴 수 없는 버림이라 «두 번 눌러 확정» 게이트를 탄다
    expect(setIds("ARM_CONFIRM_TYPES")).toContain("future_exchange");
  });
});

describe("U03 미래를 보는 자 — 강제 무장", () => {
  const useSel = fnBody("useSelection");

  it("무장은 프롬프트에서 곧바로 읽는다 — 첫 렌더에 무장이 비는 틈이 없다", () => {
    expect(useSel).toContain("myPrompt?.options.find((o) => FORCED_ARM_TYPES.has(o.type))?.type ?? null");
    expect(useSel).toContain("const armedType = forcedArm ?? armedState;");
  });

  it("arm()은 강제 선택 중에 아무것도 바꾸지 못한다 — 판 바깥 클릭·✦ 재클릭·[리치]가 모두 여기를 지난다", () => {
    const at = useSel.indexOf("const arm = (type: string | null): void => {");
    expect(at).toBeGreaterThan(0);
    const body = useSel.slice(at, useSel.indexOf("};", at));
    expect(body.indexOf("if (forcedPick) return;")).toBeGreaterThan(-1);
    expect(body.indexOf("if (forcedPick) return;")).toBeLessThan(body.indexOf("setArmedType("));
  });

  it("강제 선택이 시작되면 옛 무장과 리치 모드를 걷는다", () => {
    const at = useSel.indexOf("if (!forcedPick) return;");
    expect(at).toBeGreaterThan(0);
    const eff = useSel.slice(at, useSel.indexOf("}, [forcedPick]);", at));
    expect(eff).toContain("setArmedType(null);");
    expect(eff).toContain("onRiichiMode(false);");
  });

  it("바닥으로 끌어 놓아 낼 수 있다 — discardOptionFor·beginDrag가 future_exchange를 연다", () => {
    const at = OWN.indexOf("function discardOptionFor(");
    const dof = OWN.slice(at, OWN.indexOf("\n  }\n", at));
    expect(dof).toContain('DRAG_DISCARD_ARM_TYPES.has(armedAug) || armedAug === "future_exchange"');
    const bd = OWN.slice(OWN.indexOf("function beginDrag("), OWN.indexOf("const container = handRef.current;"));
    expect(bd).toContain('armedAug !== "future_exchange"');
  });

  it("전면 모달은 없고, 안내 줄에 [🎲 무작위]만 있다 — [취소]가 없다", () => {
    expect(APP_CODE).not.toContain("futurePick");
    expect(APP_CODE).not.toContain("futureDismissed");
    expect(APP_CODE).not.toContain("🔮 미래를 보는 자: 버릴 패 선택");
    const at = OWN.indexOf(') : armedAug === "future_exchange" ? (');
    expect(at).toBeGreaterThan(0);
    const hint = OWN.slice(at, OWN.indexOf(') : armedAug === "swap3" ? (', at));
    expect(hint).toContain("🎲 무작위");
    expect(hint).toContain("sel.submit(pick)");
    expect(hint).not.toContain("sel.arm(null)");
    expect(hint).not.toContain("취소");
  });
});

describe("U07 등가교환 넘길 3장 — 판의 손패에서", () => {
  it("give 단계는 손패, 모달은 take 단계에만 뜬다", () => {
    expect(OWN).toContain('const swapGiveInHand = !isSpectator && swap3Pick.stage === "give" && !swapTakeDismissed;');
    expect(OWN).toContain('{swap3Pick.stage === "take" && !swapTakeDismissed ? createPortal(');
    expect(OWN).not.toContain("canSwapTake");
  });

  it("손패 클릭은 선택 토글로 가로챈다 — 코치 잠금 뒤, 다른 무장·타패 분기보다 앞", () => {
    const click = OWN.indexOf("if (swapGiveInHand) {\n                    if (!swap3Pick.pool.includes(id)) {");
    expect(click).toBeGreaterThan(0);
    expect(OWN.indexOf("if (coachLocked && coachLock !== null) {")).toBeLessThan(click);
    expect(click).toBeLessThan(OWN.indexOf("if (hand3Picking) {\n                    toggleHandPick(id);"));
    expect(click).toBeLessThan(OWN.indexOf("if (clickable && active !== undefined) {"));
    expect(OWN.slice(click, OWN.indexOf("return;\n                  }\n", click + 200))).toContain("toggleSwap3(id);");
  });

  it("끌어 버리기·드롭존으로도 새지 않는다", () => {
    const bd = OWN.slice(OWN.indexOf("function beginDrag("), OWN.indexOf("const container = handRef.current;"));
    expect(bd).toContain("if (swapGiveInHand) return;");
    const at = OWN.indexOf("function discardOptionFor(");
    expect(OWN.slice(at, OWN.indexOf("\n  }\n", at))).toContain("if (swapGiveInHand) return undefined;");
  });

  it("안내 줄에 대상 이름·[선택 초기화]·[이 3장 넘기기]가 있고 [취소]가 없다", () => {
    const at = OWN.indexOf("{swapGiveInHand ? (");
    expect(at).toBeGreaterThan(0);
    const hint = OWN.slice(at, OWN.indexOf(') : armedAug === "future_exchange" ? (', at));
    expect(hint).toContain("view.augmentView[`hand_swap3:${me.id}`]");
    expect(hint).toContain("선택 초기화");
    expect(hint).toContain('"이 3장 넘기기"');
    expect(hint).toContain("disabled={swap3Option === undefined}");
    expect(hint).not.toContain("sel.arm(null)");
    expect(hint).not.toContain("취소");
  });
});

describe("U10 3장 고르기는 [확정]으로 낸다", () => {
  it("toggleSwap3는 선택만 바꾸고 제출하지 않는다", () => {
    const at = OWN.indexOf("const toggleSwap3 = (id: number): void => {");
    expect(at).toBeGreaterThan(0);
    const body = OWN.slice(at, OWN.indexOf("\n  };\n", at));
    expect(body).not.toContain("onSubmit");
    expect(body).not.toContain("setSwapTakeDismissed");
  });

  it("제출은 버튼 핸들러(submitSwap3)에서 — 정렬 키 완전일치 후보만", () => {
    expect(OWN).toContain(
      'swap3Sel.length === 3 ? swap3Pick.byKey.get([...swap3Sel].sort((a, b) => a - b).join(",")) : undefined;',
    );
    const at = OWN.indexOf("const submitSwap3 = (): void => {");
    const body = OWN.slice(at, OWN.indexOf("\n  };\n", at));
    expect(body).toContain("if (swap3Option === undefined) return;");
    expect(body).toContain("props.onSubmit(swap3Option);");
    // take 모달의 [확정]도 같은 핸들러를 쓴다
    expect(OWN).toContain('"이 3장 가져와 교환"');
    expect(OWN).not.toContain("세 장을 고르면 교환됩니다");
  });
});

describe("모달이 하던 «다른 수 봉쇄»를 옮겼다", () => {
  it("액션 바는 강제 선택 중 쯔모 화료만 남긴다", () => {
    const bar = fnBody("ActionBar");
    expect(bar).toContain(
      'props.forcedPick === true\n      ? { ...props.prompt, options: props.prompt.options.filter((o) => o.type === "win") }',
    );
    expect(OWN).toMatch(/<ActionBar[\s\S]*?forcedPick=\{forcedPick\}/);
  });

  it("✦ 버튼은 강제 선택 중 메뉴를 열지 않고 이유를 말한다", () => {
    const ctl = fnBody("ActiveAugmentControl");
    const at = ctl.indexOf("const click = (): void => {");
    const click = ctl.slice(at, ctl.indexOf("if (!usable) {", at));
    expect(click).toContain("if (props.forcedPick === true) {");
    expect(click).toContain("props.onToast?.(FORCED_PICK_HINT);");
    expect(ctl).toContain("const usable = menuOptions.length > 0 && props.forcedPick !== true;");
    expect(OWN).toMatch(/<ActiveAugmentControl[\s\S]*?forcedPick=\{forcedPick\}/);
  });

  it("우클릭 쯔모기리·자동버림도 강제 선택 프롬프트에서는 버리지 않는다", () => {
    const at = APP_CODE.indexOf("function rightClickTsumogiri(e: React.MouseEvent): void {");
    const rc = APP_CODE.slice(at, APP_CODE.indexOf("props.onSubmit(opt);", at));
    expect(rc).toContain("if (isForcedPickPrompt(myPrompt)) return;");
    expect(fnBody("isForcedPickPrompt")).toContain("FORCED_PICK_TYPES.has(o.type)");
    expect(APP_CODE).toContain("if (auto.autoDiscard && drawn !== null && !isForcedPickPrompt(p)) {");
  });
});

describe("B07 리뷰 라운드 1 — 봉쇄의 나머지 조각과 신호 일치", () => {
  const ctl = fnBody("ActiveAugmentControl");

  it("강제 선택이 시작되면 ✦ 메뉴를 접는다 — 열린 메뉴 항목이 강제 선택을 건너뛰는 길이다", () => {
    const at = ctl.indexOf("if (props.forcedPick !== true) return;");
    expect(at).toBeGreaterThan(0);
    const eff = ctl.slice(at, ctl.indexOf("}, [props.forcedPick]);", at));
    expect(eff).toContain("setOpen(false);");
    expect(eff).toContain("setMenuType(null);");
  });

  it("hintAll은 강제 선택 중 아무 pill도 빛내지 않는다", () => {
    const at = ctl.indexOf("const hintAll = (): void => {");
    expect(at).toBeGreaterThan(0);
    const body = ctl.slice(at, ctl.indexOf("\n  };\n", at));
    expect(body.indexOf("if (props.forcedPick === true) return;")).toBeGreaterThan(-1);
    expect(body.indexOf("if (props.forcedPick === true) return;")).toBeLessThan(body.indexOf("onUsableHint"));
  });

  it("✦ 버튼은 강제 무장 중 켜진 것(aug-btn-armed)처럼 보이지 않는다", () => {
    expect(ctl).toMatch(
      /!DRAG_DISCARD_ARM_TYPES\.has\(sel\.armedType\) && props\.forcedPick !== true\s*\? " aug-btn-armed"/,
    );
  });

  it("타이머 안내는 등가교환 무작위 교환 · 미래를 보는 자 교환 없는 버림을 미리 말한다", () => {
    expect(OWN).toContain('swap3Pick.stage !== null\n                  ? "시간이 다 되면 남은 조합에서 무작위로 교환합니다"');
    const fut = OWN.indexOf('myPrompt.options.some((o) => o.type === "future_exchange")');
    expect(fut).toBeGreaterThan(0);
    expect(OWN.slice(fut, fut + 200)).toContain('"시간이 다 되면 교환 없이 쯔모한 패를 버립니다"');
    // 버림 폴백 문구보다 먼저 걸러야 한다(미래를 보는 자 프롬프트에도 discard가 섞여 있다)
    expect(fut).toBeLessThan(OWN.indexOf('"시간이 다 되면 쯔모한 패를 그대로 버립니다"'));
  });

  it("미래를 보는 자 드롭존 문구는 «발동»이 아니라 버리고 교환이다 — 안내 줄·aria-label과 같은 말", () => {
    const at = OWN.indexOf('<span className="discard-dropzone-label">');
    expect(at).toBeGreaterThan(0);
    const label = OWN.slice(at, OWN.indexOf("</span>", at));
    expect(label).toContain('armedAug === "future_exchange"\n              ? "🀫 여기에 놓으면 이 패를 버리고 교환"');
    expect(label.indexOf('armedAug === "future_exchange"')).toBeLessThan(label.indexOf("발동"));
  });
});
