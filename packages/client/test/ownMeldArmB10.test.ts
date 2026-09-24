/**
 * docs/59 B10 «내 후로로 고르기 + 무장 해제 범위 + 비후보 사유» 회귀 가드 (2026-09-25).
 *
 * U31 파혼 — 해체할 후로를 ✦ 메뉴 2단계의 구별할 수 없는 «파혼» 버튼 N개가 아니라 판 오른쪽 아래
 *     내 후로에서 직접 누른다(ArmMode "own-meld"). 관전·폴백 경로의 글자·패 그림도 어느 후로인지 말한다.
 * U25 무장 중 «빈 곳 누르기 = 해제»를 펠트의 진짜 빈 곳으로 좁힌다 — 판 밖 포털·판 가운데·내 후로 줄·
 *     아이콘 줄은 풀지 않고, Esc로도 푼다. 쉬운 취소라는 목적(GameTable 주석의 사용자 설계)은 그대로다.
 * U28 손패를 건드리는 상대 무장에서 비후보 상대에 **공개 정보로 계산되는** 이유만 적는다
 *     (리치 선언·보이는 손패 장수). 설명할 수 없는 제외에 일반 문구를 띄우면 숨은 리치가 새어 나간다.
 *
 * 다른 클라 테스트와 같은 **정적 소스 스캔**이다.
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

/** `a`가 `b`보다 앞에 나오는가(둘 다 있어야 한다) */
function before(src: string, a: string, b: string): void {
  const ia = src.indexOf(a);
  const ib = src.indexOf(b, Math.max(ia, 0));
  expect(ia, `${a} 가 없다`).toBeGreaterThan(-1);
  expect(ib, `${a} 뒤에 ${b} 가 없다`).toBeGreaterThan(ia);
}

const SELECTION = between("function useSelection(", "\n}\n");
const OWN = between("function OwnArea(", "\n}\n");
const STRIP = between("function OpponentStrip(", "\n}\n");
const TABLE = between("const GameTable = memo(function GameTable(", "\n});\n");
const OPTION_DETAIL = between("function optionDetail(", "\n}\n");
const ACTION_TILES = between("function ActionTiles(", "\n}\n");

describe("U31 파혼 — 판의 내 후로를 누른다", () => {
  it("ArmMode에 own-meld가 있고 안내 줄·메뉴 힌트가 그 모드를 말한다", () => {
    expect(APP_CODE).toMatch(/^type ArmMode = [^;]*"own-meld"[^;]*;/m);
    expect(APP_CODE).toMatch(/dissolve_meld: "own-meld",/);
    // case가 없으면 default(«발동할 손패를 클릭하세요»·«손패 클릭으로 선택»)로 떨어진다
    expect(APP_CODE).toContain('case "own-meld":\n      return "해체할 내 치·퐁을 클릭하세요";');
    expect(APP_CODE).toContain('case "own-meld":\n        return "내 후로 클릭으로 선택";');
  });

  it("useSelection이 meldIndex로 후보를 찾아 SelectionCtx로 내린다", () => {
    expect(APP_CODE).toMatch(/meldOptionFor: \(meldIndex: number\) => ActionOption \| undefined;/);
    expect(APP_CODE).toContain("meldOptionFor: () => undefined,");
    expect(SELECTION).toMatch(/const meldOptionFor = \(meldIndex: number\)/);
    expect(SELECTION).toContain('if (armMode !== "own-meld") return undefined;');
    expect(SELECTION).toContain(".meldIndex === meldIndex");
    expect(SELECTION).toMatch(/return \{[\s\S]*meldOptionFor,\n {2}\};/);
  });

  it("무장 중 내 후로 줄의 후로는 누를 수 있는 버튼이다 — 후보는 제출, 깡·비후보는 흐린 채 무장 유지", () => {
    const at = OWN.indexOf("{myMelds.map((m, i) => {");
    expect(at).toBeGreaterThan(-1);
    const map = OWN.slice(at, OWN.indexOf("<PulledGroup", at));
    expect(map).toContain('if (sel.armMode !== "own-meld") {');
    expect(map).toContain("const opt = sel.meldOptionFor(i);");
    expect(map).toContain('type="button"');
    expect(map).toContain('className={`meld-armable${opt === undefined ? " meld-unpickable" : ""}`}');
    // data-arm-zone이 없으면 후로를 누르는 pointerdown이 먼저 무장을 푼다
    expect(map).toContain('data-arm-zone="1"');
    expect(map).toContain("aria-disabled={opt === undefined}");
    expect(map).toContain("sel.submit(opt);");
    expect(map).toContain('<span className="meld-arm-tag" aria-hidden="true">해체</span>');
    // 비후보를 눌러도 무장은 그대로다(대상 영역 안의 빗나감) — 해제하지 않고 이유만 말한다
    expect(map).not.toContain("sel.arm(null)");
  });

  it("관전·폴백 경로도 어느 후로인지 말한다 — optionDetail 글자와 ActionTiles 패 그림", () => {
    expect(APP_CODE).toContain("function meldBrief(view: PlayerView, meld: MeldView): string {");
    expect(OPTION_DETAIL).toContain('if (option.type === "dissolve_meld" && typeof p.meldIndex === "number") {');
    expect(OPTION_DETAIL).toContain("meldBrief(view, meld)");
    // 국사 퐁은 «퐁 1만»이 아니라 제 이름과 세 장으로 부른다(B10 리뷰)
    const brief = between("function meldBrief(", "\n}\n");
    expect(brief).toContain('if (meld.kind === "kokushi_pon") return `국사 퐁 ');
    expect(brief).not.toContain('kokushi_pon: "퐁"');
    expect(ACTION_TILES).toContain('if (option.type === "dissolve_meld" && typeof p.meldIndex === "number") {');
    expect(ACTION_TILES).toContain("ids.push(...sortTileIds(meld.tileIds, view.tiles));");
  });

  it("✦ 메뉴 2단계에서 라벨 없는 후보가 둘 이상이면 개발 모드에서 알린다", () => {
    const warn = between("function warnBlankMenuDetails(", "\n}\n");
    expect(warn).toContain("if (!import.meta.env.DEV");
    expect(warn).toContain("blank >= 2");
    expect(warn).toContain("console.warn(");
    before(APP_CODE, '<div className="aug-menu-head">{augNameFor(menuType)}</div>', "warnBlankMenuDetails(view, menuType,");
  });

  it("후로 버튼은 폰에서도 누를 만하고, 맥동은 reduced-motion에서 멈춘다", () => {
    const rule = /\.meld-armable \{([^}]*)\}/.exec(CSS_CODE);
    expect(rule).not.toBeNull();
    expect(rule![1]).toContain("min-height: 32px;");
    // 맥동은 안쪽 그림자다 — .own-corner-right의 overflow가 바깥 번짐을 자른다(B10 리뷰)
    expect(rule![1]).toContain("animation: armable-pulse-inset ");
    const kf = /@keyframes armable-pulse-inset \{([\s\S]*?)\n\}/.exec(CSS_CODE);
    expect(kf).not.toBeNull();
    expect(kf![1]!.match(/box-shadow: inset /g)?.length).toBe(2);
    expect(CSS_CODE).toMatch(/prefers-reduced-motion: reduce[\s\S]*\.opp-armable,\n\s*\.meld-armable,\n\s*\.rt\.rt-armable,/);
  });
});

describe("U25 무장 해제 범위 — 펠트의 진짜 빈 곳만", () => {
  const DOWN = (() => {
    const at = TABLE.indexOf("const onDown = (e: PointerEvent): void => {");
    expect(at).toBeGreaterThan(-1);
    return TABLE.slice(at, TABLE.indexOf('document.addEventListener("pointerdown", onDown);', at));
  })();

  it("판 밖(body 포털)과 아이콘 줄은 무장을 풀지 않는다 — 이 검사가 해제보다 앞선다", () => {
    before(DOWN, "if (t === null || tableRef.current?.contains(t) !== true) return;", "selection.arm(null);");
    before(DOWN, 'if (t.closest("[data-arm-zone]") !== null) return;', "selection.arm(null);");
    before(DOWN, 'if (t.closest(".icon-btn") !== null) return;', "selection.arm(null);");
  });

  it("빈 곳 해제는 조용히 끝내지 않는다 — 판 표면이면 토스트", () => {
    before(DOWN, "selection.arm(null);", "if (!onControl) props.onToast?.(`${armName} 선택을 취소했습니다`);");
    // 손패 클릭 해제(OwnArea)와 같은 문구 — 증강 이름이 앞에 선다
    before(DOWN, "const armName = selection.armedType !== null ? augActionName(catalog, selection.armedType) : \"\";", "selection.arm(null);");
  });

  it("무장 중 판 가운데와 내 후로 줄은 대상 영역이다 — 빗나감은 무시", () => {
    expect(TABLE).toContain(
      '<div className="table-center" {...(selection.armedType !== null ? { "data-arm-zone": "1" } : {})}>',
    );
    const at = OWN.indexOf('className="own-corner-right"');
    expect(at).toBeGreaterThan(-1);
    expect(OWN.slice(at, at + 300)).toContain('{...(sel.armedType !== null ? { "data-arm-zone": "1" } : {})}');
  });

  it("무장 중 Esc는 무장을 푼다 — 입력 칸·다른 Esc 임자에 양보하고, ActionHotkeys 밖에 둔다", () => {
    const at = TABLE.indexOf('if (e.key !== "Escape" || e.defaultPrevented || isTypingTarget(e.target)) return;');
    expect(at).toBeGreaterThan(-1);
    const esc = TABLE.slice(at, TABLE.indexOf('window.removeEventListener("keydown", onKey);', at));
    before(esc, "if (document.querySelector(ESC_OWNER_SELECTOR) !== null) return;", "selection.arm(null);");
    // 강제 무장(미래를 보는 자)은 풀 수 없다 — 이유를 말하고 끝낸다
    before(esc, "FORCED_ARM_TYPES.has(selection.armedType)", "selection.arm(null);");
    before(esc, "selection.arm(null);", "props.onToast?.(`${armName} 선택을 취소했습니다`);");
    // role=dialog 없이 뜨는 고르기 창(.rinshan-pick-overlay)도 Esc 임자다(B10 리뷰).
    // 포커스가 있을 때만 Esc를 받는 비모달 창(기록 서랍·설정)은 임자가 아니다(B10 리뷰 라운드 2)
    expect(APP_CODE).toMatch(
      /const ESC_OWNER_SELECTOR =\n\s*'\[role="dialog"\]:not\(\.coach-layer\):not\(\.auglog\):not\(\.settings-panel\), \[aria-modal="true"\], \.prod-skip, \.aug-pill-pinned, \.rinshan-pick-overlay';/,
    );
    const hotkeys = between("function ActionHotkeys(", "\n}\n");
    expect(hotkeys).not.toContain('"Escape"');
  });
});

describe("U28 비후보 상대의 사유 — 공개 정보만", () => {
  it("oppRiichiBlocked가 oppBlockedReason으로 일반화됐고 태그는 그 문자열을 그린다", () => {
    expect(APP_CODE).not.toContain("oppRiichiBlocked");
    expect(APP_CODE).toContain("oppBlockedReason: (pid: string) => string | null;");
    expect(APP_CODE).toContain("oppBlockedReason: () => null,");
    expect(STRIP).toContain("const oppBlocked = sel.oppBlockedReason(player.id);");
    expect(STRIP.match(/<div className="opp-arm-tag opp-arm-blocked">\{oppBlocked\}<\/div>/g)?.length).toBe(2);
  });

  it("리치 → 손패 장수 순서이고, 장수는 통째로 바꾸기·자리 바꿈만 본다", () => {
    const fn = (() => {
      const at = SELECTION.indexOf("const oppBlockedReason = (pid: string): string | null => {");
      expect(at).toBeGreaterThan(-1);
      return SELECTION.slice(at, SELECTION.indexOf("\n  };\n", at));
    })();
    expect(fn).toContain("if (armedType === null || !HAND_MANIP_ACTIONS.has(armedType)) return null;");
    expect(fn).toContain("if (oppArmable(pid)) return null;");
    before(fn, "riichiDeclared === true", "appearedHandSlots(view, pid)");
    // 등가교환(swap3)은 3장만 맞바꿔 장수를 보지 않는다(content hand_swap3.ts)
    expect(fn).toContain('if (armedType !== "hand_swap" && armedType !== "seat_swap") return null;');
    expect(fn).toContain("if (mine !== null && theirs !== null) {");
    // 서버 슬롯 추정이 같으면 장수 탓이 아니다 — 다른 이유로 빠진 상대에게 장수 사유를 붙이지 않는다
    // (퐁 둘 ↔ 안깡 하나는 보이는 장수가 달라도 서버 슬롯은 같다, B10 리뷰 라운드 2)
    before(
      fn,
      "if (serverSlotsGuess(view, view.playerId, mine) === serverSlotsGuess(view, pid, theirs)) return null;",
      'if (!meldsDiffer) return "손패 장수가 달라 고를 수 없습니다";',
    );
    before(fn, 'if (!meldsDiffer) return "손패 장수가', 'if (mine !== theirs) return "후로가 달라 손패 장수가 맞지 않습니다";');
    // 보이는 장수가 같아도 후로 구성(깡 ↔ 퐁·치)이 다르면 서버가 뺀다 — 그 사유도 적는다(B10 리뷰).
    // 후로 구성이 같고 장수도 같으면(숨은 리치 등) 아무것도 적지 않는다
    expect(fn).toContain('return meldsDiffer ? "후로 구성(깡·퐁)이 달라 고를 수 없습니다" : null;');
    before(fn, "if (mine !== null && theirs !== null) {", 'return meldsDiffer ? "후로 구성(깡·퐁)이 달라');
    // 설명할 수 없는 제외에 일반 문구(«고를 수 없음»)를 띄우지 않는다 — 문구는 네 가지뿐이다
    const phrases = [...fn.matchAll(/"([^"]*[가-힣][^"]*)"/g)].map((m) => m[1]);
    expect(phrases.sort()).toEqual(
      [
        "리치 중이라 대상으로 고를 수 없습니다",
        "손패 장수가 달라 고를 수 없습니다",
        "후로가 달라 손패 장수가 맞지 않습니다",
        "후로 구성(깡·퐁)이 달라 고를 수 없습니다",
      ].sort(),
    );
  });

  it("보이는 손패 장수는 쯔모패를 빼고, 정상 모양(3k+1)이 아니면 비교하지 않는다", () => {
    const fn = between("function appearedHandSlots(", "\n}\n");
    expect(fn).toContain("const n = zone.tileIds.length + zone.hiddenCount;");
    expect(fn).toContain("const slots = n % 3 === 2 ? n - 1 : n;");
    expect(fn).toContain("return slots % 3 === 1 ? slots : null;");
    const taken = between("function meldTakenCount(", "\n}\n");
    expect(taken).toContain("m.tileIds.length - (m.calledTileId !== undefined ? 1 : 0)");
    // 서버 슬롯 추정 = 보이는 장수 + 3·후로 수 − 후로가 가져간 장수(B10 리뷰 라운드 2)
    const guess = between("function serverSlotsGuess(", "\n}\n");
    expect(guess).toContain("return appeared + 3 * melds.length - meldTakenCount(view, pid);");
  });
});
