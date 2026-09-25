/**
 * docs/59 B17 «후로 고르기 그룹화» 회귀 가드 (2026-09-25).
 *
 * U56 같은 종류의 후로(치·퐁·깡·가깡·국사 퐁) 변형을 액션 바 버튼 하나로 접고, 후보가 여럿이면
 * 손패에서 함께 쓸 패를 눌러 좁힌다 — 하나로 정해지면 **서버 옵션 객체 그대로** 낸다.
 * U57 10번째 이후 버튼의 툴팁이 누를 수 없는 «단축키 10·11…»을 적지 않는다.
 *
 * 좁히기 규칙은 순수 함수(src/callPick.ts)라 가짜 뷰로 동작을 확인하고, 배선은 다른 클라 테스트처럼
 * 정적 소스 스캔으로 본다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { ActionOption, PlayerView } from "@majak/core";
import {
  CALL_PICK_TYPES,
  callPickRemaining,
  callPickSigs,
  resolveCallPick,
  sameCallChoice,
} from "../src/callPick.js";
import type { CallPick } from "../src/callPick.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(HERE, p), "utf8");

const APP = read("../src/App.tsx");
const CSS = read("../src/styles.css");
const CALL_PICK = read("../src/callPick.ts");
const TUTORIAL = read("../src/tutorial.ts");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);

function fnBody(name: string): string {
  const at = APP_CODE.indexOf(`function ${name}(`);
  expect(at, `${name} 함수가 없다`).toBeGreaterThan(-1);
  return APP_CODE.slice(at, APP_CODE.indexOf("\n}\n", at));
}
const BAR = fnBody("ActionBar");
const OWN = fnBody("OwnArea");
const SELECTION = fnBody("useSelection");

// ── 가짜 뷰 — callPick.ts가 읽는 것(playerId·zones 손패·tiles)만 채운다 ──

type T = { suit: "man" | "pin" | "sou" | "wind" | "dragon"; rank: number; red?: boolean };
function viewOf(hand: Record<number, T>, extra: Record<number, T> = {}): PlayerView {
  const tiles: Record<number, unknown> = {};
  for (const [id, t] of Object.entries({ ...hand, ...extra })) {
    tiles[Number(id)] = { kind: { suit: t.suit, rank: t.rank }, attrs: t.red === true ? { red: true } : {} };
  }
  return {
    playerId: "me",
    tiles,
    zones: { "hand:me": { tileIds: Object.keys(hand).map(Number) } },
  } as unknown as PlayerView;
}
const m = (rank: number, red = false): T => ({ suit: "man", rank, red });
const opt = (type: string, payload: Record<string, unknown>): ActionOption => ({ type, payload }) as ActionOption;
function pickOf(view: PlayerView, type: string, options: ActionOption[], picks: number[] = []): CallPick {
  return { type, options, picks, remaining: callPickRemaining(view, options, picks), cursor: null };
}

describe("U56 좁히기 규칙 (src/callPick.ts)", () => {
  // 4만을 치는데 손에 2·3·5·적5·6만 — 서버(FlowController.chiCandidates)가 내는 치 5개
  const view = viewOf({ 1: m(2), 2: m(3), 3: m(5), 4: m(5, true), 5: m(6), 6: m(5) });
  const chi = [
    opt("chi", { tileIds: [1, 2] }),
    opt("chi", { tileIds: [2, 3] }),
    opt("chi", { tileIds: [2, 4] }),
    opt("chi", { tileIds: [3, 5] }),
    opt("chi", { tileIds: [4, 5] }),
  ];

  it("대상 타입", () => {
    expect([...CALL_PICK_TYPES]).toEqual(["chi", "pon", "minkan", "ankan", "shouminkan", "kokushi_pon"]);
  });

  it("한 장으로 하나가 남으면 곧바로 — 서버 옵션 객체 그대로 낸다", () => {
    const r = resolveCallPick(view, pickOf(view, "chi", chi), 1);
    expect(r?.submit).toBe(chi[0]);
  });

  it("둘 이상 남으면 기다리고, 두 번째 패로 정해진다 (적5를 가른다)", () => {
    const first = resolveCallPick(view, pickOf(view, "chi", chi), 2);
    expect(first).toEqual({ picks: [2], submit: null });
    expect(callPickRemaining(view, chi, [2])).toEqual([chi[0], chi[1], chi[2]]);
    const second = resolveCallPick(view, pickOf(view, "chi", chi, [2]), 4);
    expect(second?.submit).toBe(chi[2]);
  });

  it("같은 서명의 다른 장을 눌러도 서버 후보의 id 그대로다 — payload를 다시 만들지 않는다", () => {
    // 6번(5만)은 어느 후보 payload에도 없지만 3번과 서명이 같다
    const r = resolveCallPick(view, pickOf(view, "chi", chi, [5]), 6);
    expect(r?.submit).toBe(chi[3]);
    expect((r?.submit?.payload as { tileIds: number[] }).tileIds).toEqual([3, 5]);
  });

  it("다시 누르면 뺀다 — 아무것도 내지 않는다", () => {
    expect(resolveCallPick(view, pickOf(view, "chi", chi, [2]), 2)).toEqual({ picks: [], submit: null });
  });

  it("남은 후보에 안 쓰이는 패는 대상이 아니다", () => {
    // 6만을 골랐으면 2만은 어느 남은 치에도 들지 않는다
    expect(resolveCallPick(view, pickOf(view, "chi", chi, [5]), 1)).toBeNull();
  });

  it("퐁 — 일반 둘 / 일반+적: 일반을 누르면 기다리고, 적을 누르면 정해진다", () => {
    const v = viewOf({ 1: m(5), 2: m(5), 3: m(5, true) });
    const pon = [opt("pon", { tileIds: [1, 2] }), opt("pon", { tileIds: [1, 3] })];
    expect(resolveCallPick(v, pickOf(v, "pon", pon), 2)?.submit).toBeNull();
    expect(resolveCallPick(v, pickOf(v, "pon", pon), 3)?.submit).toBe(pon[1]);
    expect(resolveCallPick(v, pickOf(v, "pon", pon, [2]), 1)?.submit).toBe(pon[0]);
  });

  it("가깡 — 한 손패가 퐁 둘에 붙으면 손패로는 못 가른다(칩이 맡는다)", () => {
    const v = viewOf({ 1: m(5) }, { 10: m(5), 20: { suit: "pin", rank: 5 } });
    const kan = [
      opt("shouminkan", { tileId: 1, targetMeldTileId: 10 }),
      opt("shouminkan", { tileId: 1, targetMeldTileId: 20 }),
    ];
    expect(sameCallChoice(v, kan[0]!, kan[1]!)).toBe(false);
    expect(resolveCallPick(v, pickOf(v, "shouminkan", kan), 1)).toEqual({ picks: [1], submit: null });
  });

  it("쓰는 패가 손에 없으면 서명을 만들지 않는다 — 묶지 않고 제 버튼으로 남는다", () => {
    expect(callPickSigs(view, opt("chi", { tileIds: [1, 99] }))).toBeNull();
    expect(callPickSigs(view, opt("chi", { tileIds: [2, 4] }))).toEqual(["man3", "man5*"]);
  });

  it("제출 옵션은 받은 목록에서만 나온다 — 모듈에 payload를 만드는 코드가 없다", () => {
    expect(code(CALL_PICK)).not.toMatch(/payload:\s*\{/);
    expect(code(CALL_PICK)).toContain("return { picks, submit: settled ? head : null };");
  });
});

describe("U56 액션 바 — 종류당 버튼 하나", () => {
  it("CALL_PICK_TYPES를 type별로 접고, 손패에 없는 후보는 묶지 않는다", () => {
    expect(BAR).toContain("if (CALL_PICK_TYPES.has(o.type) && callPickSigs(view, o) !== null) {");
    expect(BAR).toContain("const callGroups = new Map<ActionOption, ActionOption[]>();");
  });

  it("[론·쯔모]는 맨 앞, [패스]는 맨 끝 — 세 무리와 스크롤 상자는 그대로(2026-09-19)", () => {
    expect(BAR).toMatch(
      /const buttons = \[\s*\.\.\.foldedButtons\.filter\(\(o\) => o\.type === "win"\),\s*\.\.\.foldedButtons\.filter\(\(o\) => o\.type !== "win" && o\.type !== "pass"\),\s*\.\.\.foldedButtons\.filter\(\(o\) => o\.type === "pass"\),\s*\];/,
    );
    expect(BAR).toContain('<div className="action-calls">');
  });

  it("묶음 버튼은 곧바로 내지 않고 후로 고르기로 — 클릭과 숫자 단축키가 같은 길(pressOption)", () => {
    expect(BAR).toMatch(
      /const pressOption = \(o: ActionOption, key: string\): void => \{\s*const group = groupOf\(o\);\s*if \(group !== null\) \{\s*setPrimedKey\(null\);\s*sel\.toggleCallPick\(o\.type, group\);\s*return;\s*\}/,
    );
  });

  it("묶음 버튼은 부른 패 + ×N을 그리고, 고르는 중에는 눌린 채(aria-pressed)", () => {
    expect(BAR).toContain("!isMyTurn && view.round.lastDiscard !== null ? view.tiles[view.round.lastDiscard.tileId] : undefined;");
    expect(BAR).toContain('<span className="act-group-count" aria-hidden="true">×{group.length}</span>');
    expect(BAR).toContain('{...(group !== null ? { "aria-pressed": picking } : {})}');
    expect(CSS).toContain(".act-group-count {");
    expect(CSS).toContain(".act-group-on {");
  });

  it("묶음 버튼에도 doomed-hint 신호가 그대로다(qaFixes_2026-09-07)", () => {
    expect(BAR).toContain("onMouseEnter={() => props.onDoomedHint?.(doomedTileIdsOf(view, o.type))}");
    expect(BAR).toContain("onFocus={() => props.onDoomedHint?.(doomedTileIdsOf(view, o.type))}");
  });

  it("고르는 중에는 숫자 1..N이 남은 후보 칩 — 바의 숫자는 비우고 R·P는 끝자리로 산다", () => {
    expect(BAR).toMatch(
      /if \(pickChips !== null\) \{\s*keyed\.unshift\(\.\.\.pickChips\.map\(\(o, i\) => \(\{ key: String\(i \+ 1\), run: \(\) => sel\.submit\(o\) \}\)\)\);/,
    );
    // 칩 목록은 안내 줄(OwnArea)과 같은 기준
    expect(BAR).toContain("sel.callPick.remaining.length <= CALL_PICK_CHIP_MAX");
    expect(OWN).toContain("{sel.callPick.remaining.length <= CALL_PICK_CHIP_MAX");
    expect(OWN).toContain("sel.callPick.remaining.map((o, i) => callPickChip(o, String(i), String(i + 1)))");
    expect(OWN).toContain("title={`${callPickName} 이 조합으로${meldName} (단축키 ${hot})`}");
  });

  it("고르는 중 바의 숫자는 후보 수와 상관없이 늘 비운다 — «2»가 [퐁]으로 새지 않는다(B17 리뷰)", () => {
    // 칩 여부(pickChips)가 아니라 이 바의 종류를 고르는 중인가(pickingHere)로 비운다
    expect(BAR).toContain("const pickingHere = sel.callPick !== null && buttons.some((o) => o.type === sel.callPick?.type);");
    expect(BAR).toContain('if (pickingHere) for (const k of keyed) k.key = "";');
    const blank = BAR.indexOf('if (pickingHere) for (const k of keyed) k.key = "";');
    expect(blank).toBeLessThan(BAR.indexOf("if (pickChips !== null) {"));
  });

  it("칩이 없는 많은 후보는 ←→로 하나씩 짚고 1로 낸다 — 키보드로 특정 후보를 고를 길(5단계)", () => {
    expect(BAR).toContain('{ key: "ArrowLeft", run: () => sel.stepCallPick(-1) },');
    expect(BAR).toContain('{ key: "ArrowRight", run: () => sel.stepCallPick(1) },');
    expect(BAR).toContain('...(pointed !== undefined ? [{ key: "1", run: () => sel.submit(pointed) }] : []),');
    // 짚은 후보는 안내 줄에 칩 하나로 서고, 손패를 눌러 후보가 바뀌면 짚은 자리를 버린다
    expect(OWN).toContain("sel.callPick.cursor !== null && sel.callPick.remaining[sel.callPick.cursor] !== undefined");
    expect(SELECTION).toContain("setCallPickState({ ...callPickState, picks: r.picks, cursor: null });");
    expect(SELECTION).toContain("const next = cur === null ? (delta > 0 ? 0 : n - 1) : (((cur + delta) % n) + n) % n;");
  });

  it("가깡 칩은 붙일 퐁까지 그리고 이름에 싣는다 — 퐁 둘에 붙는 한 장을 칩으로 가른다", () => {
    expect(OWN).toContain("const target = (o.payload as { targetMeldTileId?: unknown } | undefined)?.targetMeldTileId;");
    expect(OWN).toContain("번째 후로(");
    expect(OWN).toContain("aria-label={`${callPickName}: ${handName}${meldName}");
  });
});

describe("U56 후로 고르기는 무장(armedType)과 따로다", () => {
  it("SelectionCtx에 별도 상태 — toggleCallPick은 arm()을 부르지 않는다", () => {
    expect(APP_CODE).toContain("callPick: CallPick | null;");
    const at = SELECTION.indexOf("const toggleCallPick = ");
    const body = SELECTION.slice(at, SELECTION.indexOf("\n  };\n", at));
    expect(body).not.toContain("arm(");
    expect(body).toContain("setArmedType(null);");
    expect(body).toContain("exitRiichiMode();");
    // 무장하면(또는 [리치] 앞의 arm(null)) 후로 고르기를 비운다
    const armAt = SELECTION.indexOf("const arm = (type: string | null): void => {");
    expect(SELECTION.slice(armAt, SELECTION.indexOf("\n  };\n", armAt))).toContain("setCallPickState(null);");
  });

  it("프롬프트가 바뀌면 옛 고르기는 첫 렌더부터 무효다", () => {
    expect(SELECTION).toContain(
      "if (callPickState === null || myPrompt === null || callPickState.prompt !== myPrompt) return null;",
    );
  });

  it("✦ 버튼 켜짐·튜토리얼 무장 선택자는 callPick을 보지 않는다", () => {
    expect(fnBody("ActiveAugmentControl")).not.toContain("callPick");
    expect(TUTORIAL).not.toContain("callPick");
  });

  it("손패 누르기는 서버 옵션을 그대로 제출한다", () => {
    expect(SELECTION).toMatch(
      /const r = resolveCallPick\(view, callPick, id\);\s*if \(r === null\) return false;\s*if \(r\.submit !== null\) \{\s*submit\(r\.submit\);/,
    );
  });

  it("펠트 빈 곳·Esc로 풀고 풀렸다고 말한다(§2 원칙 7)", () => {
    expect(APP_CODE).toContain("selection.cancelCallPick();");
    expect(APP_CODE).toContain("props.onToast?.(`${name} 고르기를 취소했습니다`);");
  });
});

describe("U56 손패 — 후보에 쓰이는 패만 밝히고, 클릭은 타패보다 먼저 가로챈다", () => {
  it("분기 순서: 코치 잠금 → 등가교환 → 후로 고르기 → 가지치기 → … → 타패", () => {
    const pick = OWN.indexOf("if (callPicking) {\n                    if (sel.callPickClick(id)) {");
    expect(pick).toBeGreaterThan(0);
    expect(OWN.indexOf("if (coachLocked && coachLock !== null) {")).toBeLessThan(pick);
    expect(OWN.indexOf("if (swap3Pending) {")).toBeLessThan(pick);
    expect(pick).toBeLessThan(OWN.indexOf("if (hand3Picking) {\n                    toggleHandPick(id);"));
    expect(pick).toBeLessThan(OWN.indexOf("if (clickable && active !== undefined) {"));
    // 빗나감은 풀지 않고 까닭만(원칙 7)
    expect(OWN).toContain("props.onToast?.(`이 패는 ${callPickName}에 쓰이지 않습니다`);");
  });

  it("우클릭 쯔모기리는 고르는 중에 듣지 않는다 — 턴 중 안깡 고르기가 버림으로 새지 않게(B17 리뷰)", () => {
    expect(APP_CODE).toContain(
      "if (props.riichiMode || selection.armedType !== null || selection.callPick !== null) return;",
    );
  });

  it("고르는 중 손패 이름은 버림이 아니라 고르기의 말이다(B17 리뷰)", () => {
    expect(OWN).toContain(": callPicking && armable\n                    ? `${callPickName}에 함께 쓸 수 있는 패`");
    expect(OWN).toContain("? `${callPickName}에 쓰이지 않는 패`\n                      : \"지금 버릴 수 없음\"");
  });

  it("armable·dim·고른 패 강조·클릭 가능", () => {
    expect(OWN).toContain(": callPicking\n                ? sel.callPickArmable(id)");
    expect(OWN).toContain('(armedAug !== null || callPicking) && !armable ? " hand-dimmed" : ""');
    expect(OWN).toContain("(callPicking && sel.callPick?.picks.includes(id) === true) ||");
    expect(OWN).toContain("(!callPicking && active !== undefined && (!props.riichiMode || riichi !== undefined))");
  });

  it("안내 줄 — «함께 쓸 손패를 클릭하세요» + [취소]는 고르기만 접는다([확인] 없음)", () => {
    const at = OWN.indexOf(") : callPicking && sel.callPick !== null ? (");
    expect(at).toBeGreaterThan(0);
    const hint = OWN.slice(at, OWN.indexOf(') : armedAug === "frame_discard" && sel.frameTile !== null ? (', at));
    expect(hint).toContain("{callPickName}: 함께 쓸 손패를 클릭하세요");
    expect(hint).toContain('<button className="arm-hint-cancel" onClick={() => sel.cancelCallPick()}>');
    expect(hint).not.toContain("arm-hint-confirm");
    expect(CSS).toContain(".call-pick-chip {");
  });

  it("튜토리얼 후로 강의가 새 흐름을 말한다", () => {
    expect(TUTORIAL).toContain("치·퐁을 누른 뒤 함께 쓸 손패를 고르세요");
  });
});

describe("U57 누를 수 없는 단축키는 툴팁에 적지 않는다", () => {
  it("10번째부터는 키를 비우되 항목은 남긴다(R/P 폴백 인덱스)", () => {
    expect(BAR).toContain('keyed.push({ key: n <= 9 ? String(n) : "", run: () => pressOption(o, `${o.type}-${i}`) });');
    expect(fnBody("ActionHotkeys")).toContain("cur.keyed[idx + (cur.keyed.length - cur.buttons.length)]?.run();");
  });

  it("title의 숫자는 실제로 걸린 키일 때만 — 아니면 [론] R·[패스] P만", () => {
    expect(BAR).toContain("const hotBound = keyed[hotBase + i]?.key === hotIndex(i);");
    expect(BAR).toContain("? `${label} (단축키 R)`");
    expect(BAR).toContain("? `${label} (단축키 P)`");
    // a11yPerfGuards가 고정한 템플릿 조각은 남는다
    expect(BAR).toMatch(/단축키 \$\{hotIndex\(i\)\}/);
  });
});

describe("후로없음(자동 패스)은 그대로", () => {
  it("isCallOnlyPrompt는 옵션 타입만 본다 — 버튼 묶음과 무관", () => {
    expect(APP_CODE).toContain(
      'nonPass.every((o) => o.type === "pon" || o.type === "chi" || o.type === "minkan")',
    );
  });
});
