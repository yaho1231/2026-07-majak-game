/**
 * docs/59 W4(B13~B17) 통합 리뷰 반영 회귀 가드 (2026-09-25).
 *
 * interaction-1·lifecycle-1·regression-1 리치 소프트 자동이 «멈추는 목록»이라 무덤 도굴(확정 화료)·
 *   연금술·염색(리치 중 쯔모패 변경)·영상 정찰·소환·욕심·카피가 끼어도 2초 뒤 쯔모기리가 나갔다 → 허용 목록 ·
 * interaction-2·lifecycle-2·regression-2 예지 발동 뒤 같은 순의 재배열 프롬프트에 소프트 자동이 다시 걸렸고,
 *   스스로 뜨는 고르기 창(.rinshan-pick-overlay)이 멈춤 신호가 아니었다 ·
 * interaction-3·lifecycle-3·regression-3 카운트다운이 3px 막대뿐 — 무엇이 일어나는지·멈추는 법·멈췄다는 사실이
 *   화면에 없었다 ·
 * interaction-4·regression-4 두 번 누르기 첫 탭으로 들린 패가 후로 고르기에 들어가도 «한 번 더»를 달고 남았다 ·
 * lifecycle-4 왕패의 주인 큐가 전송 실패·순 경계에서 비워지지 않아 다시 붙은 뒤 지시하지 않은 교환이 나갔다 ·
 * regression-5 도킹 패널의 20px 왕패 칸 사이 틈이 터치에서 허공이었다.
 *
 * 정적 소스 스캔 + riichiSoftAutoOption 은 소스에서 떼어 내 실제로 돌려 본다(TS → JS 변환).
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");
const CONTENT_DIR = join(HERE, "../../content/src/augments");
const CONTENT = readdirSync(CONTENT_DIR)
  .filter((f) => f.endsWith(".ts"))
  .map((f) => readFileSync(join(CONTENT_DIR, f), "utf8"))
  .join("\n");

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);

function between(src: string, start: string, end: string): string {
  const a = src.indexOf(start);
  expect(a, start).toBeGreaterThanOrEqual(0);
  const b = src.indexOf(end, a + start.length);
  expect(b, end).toBeGreaterThan(a);
  return src.slice(a, b);
}

function setOf(head: string): Set<string> {
  const body = between(APP_CODE, head, "]);");
  return new Set((body.match(/"[a-z0-9_]+"/g) ?? []).map((s) => s.slice(1, -1)));
}

const AUG = setOf("const AUGMENT_ACTION_TYPES = new Set([");
const OK = setOf("const RIICHI_SOFT_AUTO_OK_TYPES: ReadonlySet<string> = new Set([");
const FORCED = setOf("const FORCED_PICK_TYPES = new Set([");

type Opt = { type: string; payload?: unknown };
type Fn = (p: { player: string; options: Opt[]; locked?: unknown[] }, view: unknown) => Opt | null;

/** 소스의 riichiSoftAutoOption 을 그대로 떼어 JS로 바꿔 돌린다 */
const riichiSoftAutoOption: Fn = (() => {
  const src = between(APP, "function riichiSoftAutoOption(", "\n}\n") + "\n}\n";
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(
    "AUGMENT_ACTION_TYPES",
    "RIICHI_SOFT_AUTO_OK_TYPES",
    "isForcedPickPrompt",
    "bottomDealDecisive",
    `${js}\nreturn riichiSoftAutoOption;`,
  )(
    AUG,
    OK,
    (p: { options: Opt[] }) => p.options.some((o) => FORCED.has(o.type)),
    // 밑장빼기의 «이번 순 결정» 판정은 아래에서 따로 돌려 본다 — 여기서는 view 에 실린 표시로 흉내 낸다
    (v: { bottomDecisive?: boolean }) => v.bottomDecisive === true,
  ) as Fn;
})();

type Kind = { suit: string; rank: number };
/** 소스의 bottomDealDecisive 를 떼어 돌린다 — 대기 계산은 주입한 가짜(waits)로 대신한다 */
const bottomDealDecisive = (waits: Kind[] | "throw") => {
  const src = between(APP, "function bottomDealDecisive(", "\n}\n") + "\n}\n";
  const js = ts.transpileModule(src, { compilerOptions: { target: ts.ScriptTarget.ES2020 } }).outputText;
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function("winningKinds", "waitDecompOptions", `${js}\nreturn bottomDealDecisive;`)(
    () => {
      if (waits === "throw") throw new Error("decompose failed");
      return waits;
    },
    () => undefined,
  ) as (view: unknown, drawn: number) => boolean;
};

const DRAWN = 77;
const view = {
  playerId: "p0",
  round: { myDrawnTile: DRAWN, byPlayer: { p0: { riichiDeclared: true } } },
};
const tsumogiri: Opt = { type: "discard", payload: { tileId: DRAWN } };
const prompt = (...types: string[]) => ({
  player: "p0",
  options: [tsumogiri, ...types.map((type) => ({ type, payload: {} }))],
});

describe("interaction-1·lifecycle-1·regression-1 소프트 자동은 허용 목록(fail-closed)", () => {
  it("멈추는 목록은 사라졌고 판정은 허용 목록을 본다", () => {
    expect(APP_CODE).not.toContain("RIICHI_SOFT_AUTO_STOP_TYPES");
    const fn = between(APP_CODE, "function riichiSoftAutoOption(", "\n}\n");
    expect(fn).toContain("!RIICHI_SOFT_AUTO_OK_TYPES.has(o.type)) return null;");
  });

  it("허용 목록은 전부 실제 액티브 증강 타입이고 content 에 있다", () => {
    for (const t of OK) {
      expect(AUG.has(t), t).toBe(true);
      expect(CONTENT.includes(`"${t}"`), `content 에 ${t} 가 없다`).toBe(true);
    }
  });

  it("리치 내내 서는 선택지(승부수·밑장빼기·예지 발동 등)만 끼면 쯔모기리를 건다", () => {
    for (const t of ["cancel_riichi", "bottom_deal", "triple_peek_use", "foresight_reveal", "ura_peek_reveal", "claim_dealer", "swamp_activate"]) {
      expect(OK.has(t), t).toBe(true);
    }
    expect(riichiSoftAutoOption(prompt("cancel_riichi"), view)).toBe(tsumogiri);
    expect(riichiSoftAutoOption(prompt("cancel_riichi", "bottom_deal", "foresight_reveal"), view)).toBe(tsumogiri);
  });

  it("화료·쯔모패 변경·그 순 한정 선택이 하나라도 끼면 걸지 않는다", () => {
    const danger = [
      "grave_rob", // 후보 = 확정 화료
      "alchemy", // 리치 중 쯔모패 ±1
      "tile_dye", // 리치 중 쯔모패 색 바꾸기
      "rinshan_arrange", // 쯔모패 ↔ 영상패
      "conjure_tsumo", // 다음 쯔모를 대기패로
      "greed_use", // 방금 쯔모한 패 한정
      "copy_take", // 무엇을 빌려 올지 모른다
      "foresight_order", // 공개한 그 순에만 열리는 재배열
      "bloom_pick", // 스스로 뜨는 영상패 고르기
      "flip_riichi",
      "pond_snatch",
      "take_back",
      "recall",
      "silent_take",
      "dw_swap",
    ];
    for (const t of danger) {
      expect(OK.has(t), `${t} 가 허용 목록에 있다`).toBe(false);
      expect(riichiSoftAutoOption(prompt("cancel_riichi", t), view), t).toBeNull();
      expect(riichiSoftAutoOption(prompt(t), view), t).toBeNull();
    }
  });

  it("모르는 새 타입이 끼면 걸지 않는다 (새 증강의 기본값은 «멈춤»)", () => {
    expect(riichiSoftAutoOption(prompt("cancel_riichi", "brand_new_active_2099"), view)).toBeNull();
  });

  it("리치가 아니거나 쯔모패가 아닌 버림이 있으면 걸지 않는다", () => {
    expect(
      riichiSoftAutoOption(prompt("cancel_riichi"), { ...view, round: { ...view.round, byPlayer: { p0: { riichiDeclared: false } } } }),
    ).toBeNull();
    expect(
      riichiSoftAutoOption({ player: "p0", options: [{ type: "discard", payload: { tileId: 3 } }, { type: "cancel_riichi" }] }, view),
    ).toBeNull();
  });
});

describe("interaction-2·lifecycle-2·regression-2 증강을 쓴 순의 뒤따르는 프롬프트·스스로 뜨는 창", () => {
  it("«손을 쓰는 중» 선택자에 고르기 창이 들어 있고, 걸 때와 쏠 때 둘 다 본다", () => {
    expect(APP_CODE).toContain(
      'const RIICHI_SOFT_AUTO_BUSY_SELECTOR = ".aug-menu, .arm-hint, .dw-dock, .rinshan-pick-overlay";',
    );
    const fx = between(APP_CODE, "if (riichiSoftAutoAt === null) return;", "}, [riichiSoftAutoAt]);");
    expect(fx).toContain("document.querySelector(RIICHI_SOFT_AUTO_BUSY_SELECTOR) !== null");
    const fn = between(APP_CODE, "function tryRiichiSoftAuto(", "function tryAutoRespond(");
    const recheck = fn.indexOf("if (document.querySelector(RIICHI_SOFT_AUTO_BUSY_SELECTOR) !== null) {");
    expect(recheck).toBeGreaterThan(0);
    // 쏘기 전 재확인은 소리·전송보다 먼저
    expect(fn.indexOf("sfx.discard();")).toBeGreaterThan(recheck);
    expect(fn.indexOf("send({")).toBeGreaterThan(recheck);
  });

  it("사람이 버림 아닌 수를 보낸 순에는 같은 순의 새 프롬프트에 다시 걸지 않는다", () => {
    const submit = between(APP_CODE, "function submitOption(option: ActionOption): boolean", "setRiichiMode(false);");
    const sentGuard = submit.indexOf("if (!sent) return false;");
    const mark = submit.indexOf("riichiSoftAutoHandTurnRef.current = riichiSoftAutoTurnKey(prevViewRef.current, seat);");
    expect(mark).toBeGreaterThan(sentGuard);
    expect(submit).toContain("!DISCARD_LIKE.has(option.type)");
    const fn = between(APP_CODE, "function tryRiichiSoftAuto(", "function tryAutoRespond(");
    // (W4 수정 커밋 리뷰) 걷을 때 «자동 멈춤» 표시를 남기고 돌아간다
    expect(fn).toMatch(/if \(turnKey !== null && riichiSoftAutoHandTurnRef\.current === turnKey\) \{\s*setRiichiSoftAutoStopped\(true\);\s*return;\s*\}/);
    // 열쇠는 좌석·국·순·쯔모패 — 다음 순(새 쯔모)에는 다시 걸린다
    const key = between(APP_CODE, "function riichiSoftAutoTurnKey(", "\n}\n");
    expect(key).toContain("r.turnCount");
    expect(key).toContain("r.myDrawnTile");
    expect(key).toContain("r.honba");
  });
});

describe("interaction-3·lifecycle-3·regression-3 카운트다운과 멈춤이 글로 보인다", () => {
  it("걸린 동안 «곧 쯔모기리 · 누르면 멈춤», 걷힌 뒤 «자동 멈춤 · 직접 버리세요»", () => {
    expect(APP).toMatch(/<span className="hand-soft-auto-note" aria-hidden="true">\s*곧 쯔모기리 · 누르면 멈춤/);
    expect(APP).toMatch(/<span className="hand-soft-auto-note is-stopped" aria-hidden="true">\s*자동 멈춤 · 직접 버리세요/);
    // 멈춤 글은 «한 번 더» 뱃지와 같은 자리라 들린 패에는 서지 않는다
    expect(APP_CODE).toMatch(/props\.riichiSoftAutoStopped === true &&\s*armedTileId !== id/);
    expect(CSS).toMatch(/\.hand-soft-auto-note \{[^}]*right: 0;[^}]*white-space: nowrap;[^}]*pointer-events: none;/);
  });

  it("손이 닿아 걷히면 멈춤 상태를 세우고, 새 프롬프트가 오면 내린다", () => {
    const fx = between(APP_CODE, "if (riichiSoftAutoAt === null) return;", "}, [riichiSoftAutoAt]);");
    expect(fx).toMatch(/const stop = \(\): void => \{\s*cancelRiichiSoftAuto\(\);\s*setRiichiSoftAutoStopped\(true\);\s*\};/);
    const at = APP_CODE.indexOf('if (msg.type === "prompt") {');
    const body = APP_CODE.slice(at, APP_CODE.indexOf('if (msg.type === "promptCancel") {', at));
    expect(body).toMatch(/cancelRiichiSoftAuto\(msg\.prompt\.player\);\s*setRiichiSoftAutoStopped\(false\);/);
    expect(APP_CODE).toContain("riichiSoftAutoStopped={riichiSoftAutoStopped}");
    expect(APP_CODE).toContain("riichiSoftAutoStopped={props.riichiSoftAutoStopped === true}");
  });

  it("걸릴 때 live 영역으로 한 번 읽어 준다", () => {
    expect(APP).toMatch(
      /<div className="sr-only" aria-live="polite" aria-atomic="true">\s*\{riichiSoftAutoAt !== null \? "잠시 뒤 쯔모패를 자동으로 버립니다\. 아무 키나 누르거나 화면을 누르면 멈춥니다" : ""\}/,
    );
  });
});

describe("interaction-4·regression-4 후로 고르기에 들어가면 들린 패를 내린다", () => {
  it("callPicking 이 바뀌면 armedTileId 를 비운다", () => {
    expect(APP_CODE).toMatch(/useEffect\(\(\) => \{\s*setArmedTileId\(null\);\s*\}, \[callPicking\]\);/);
  });
});

describe("lifecycle-4 왕패의 주인 큐 — 전송 실패·순 경계에서 접는다", () => {
  const hook = between(APP_CODE, "function useSelection(", "const dwHasOpt = ");

  it("useSelection.submit 은 전송 결과를 돌려준다", () => {
    expect(hook).toContain("onSubmit: (o: ActionOption) => boolean | void,");
    expect(hook).toMatch(/const submit = \(o: ActionOption\): boolean => \{\s*const sent = onSubmit\(o\) !== false;/);
  });

  it("보내지 못하면 남은 쌍을 통째로 접는다", () => {
    expect(hook).toMatch(/if \(!submit\(opt\)\) \{\s*setDwQueue\(\[\]\);\s*return;\s*\}\s*setDwQueue\(\(cur\) => cur\.slice\(1\)\);/);
  });

  it("확정한 순이 아닌 프롬프트에는 싣지 않는다", () => {
    // (W4 수정 커밋 리뷰) turnCount 는 친의 쯔모 수라 내 다음 차례에도 같을 수 있다 — 내 버림 수를 붙인 열쇠
    expect(hook).toMatch(/if \(dwQueueTurnRef\.current !== dwTurnKey\) \{\s*setDwQueue\(\[\]\);\s*return;\s*\}/);
    const confirm = between(APP_CODE, "const dwConfirm = (): void => {", "\n  };");
    expect(confirm.indexOf("dwQueueTurnRef.current = dwTurnKey;")).toBeGreaterThan(-1);
    expect(confirm.indexOf("dwQueueTurnRef.current = dwTurnKey;")).toBeLessThan(confirm.indexOf("setDwQueue(dwPairs);"));
  });

  it("국 경계 비우기는 그대로다 (알려진 문제 4)", () => {
    expect(APP_CODE).toMatch(/useEffect\(\(\) => \{\s*setDwQueue\(\[\]\);\s*dwSentPromptRef\.current = null;\s*\}, \[dwRoundKey\]\);/);
  });
});

describe("regression-5 도킹 패널 왕패 칸 — 터치에서 틈까지 닿게", () => {
  it("(pointer: coarse) 에서 ::after 껍데기로 칸 사이 틈을 메운다(빈 칸 제외)", () => {
    expect(CSS).toMatch(
      /@media \(pointer: coarse\) \{\s*\.dw-dock \.aug-pick-tile \{ position: relative; \}\s*\.dw-dock \.aug-pick-tile:not\(\.aug-pick-tile-spent\)::after \{\s*content: "";\s*position: absolute;\s*(?:\/\*[\s\S]*?\*\/\s*)?inset: -2px;/,
    );
  });
});

describe("W4 수정 커밋 리뷰 — 목록 안이라도 이번 순에 묶이면 멈춘다 (실제로 돌려 본다)", () => {
  it("스파이 후보가 쯔모패 자체면 멈추고, 다른 장이면 건다", () => {
    const spy = (tileId: number) => ({ player: "p0", options: [tsumogiri, { type: "spy_mark", payload: { tileId } }] });
    expect(riichiSoftAutoOption(spy(DRAWN), view)).toBeNull();
    expect(riichiSoftAutoOption(spy(DRAWN + 1), view)).toBe(tsumogiri);
  });

  it("밑장빼기가 이번 순의 결정이면 멈춘다", () => {
    expect(riichiSoftAutoOption(prompt("bottom_deal"), { ...view, bottomDecisive: true })).toBeNull();
    expect(riichiSoftAutoOption(prompt("bottom_deal", "cancel_riichi"), { ...view, bottomDecisive: true })).toBeNull();
    expect(riichiSoftAutoOption(prompt("bottom_deal"), view)).toBe(tsumogiri);
  });

  const handView = (wallVisible: number[], hidden: number, bottomKind: Kind) => ({
    playerId: "p0",
    players: [{ id: "p0" }],
    round: { byPlayer: { p0: { meldCount: 0 } } },
    zones: {
      wall: { tileIds: wallVisible, hiddenCount: hidden },
      // 쯔모패(77) + 13장
      "hand:p0": { tileIds: [77, ...Array.from({ length: 13 }, (_v, i) => 100 + i)] },
    },
    tiles: {
      ...Object.fromEntries(Array.from({ length: 13 }, (_v, i) => [100 + i, { kind: { suit: "man", rank: 1 } }])),
      77: { kind: { suit: "pin", rank: 9 } },
      ...Object.fromEntries(wallVisible.map((id) => [id, { kind: bottomKind }])),
    },
  });

  it("bottomDealDecisive — 밑장이 내 대기패면 결정, 아니면 아니다", () => {
    const five = { suit: "sou", rank: 5 };
    expect(bottomDealDecisive([five])(handView([201, 202, 203], 40, five), 77)).toBe(true);
    expect(bottomDealDecisive([{ suit: "sou", rank: 6 }])(handView([201, 202, 203], 40, five), 77)).toBe(false);
  });

  it("bottomDealDecisive — 패산이 4장 이하면 결정, 대기를 못 세면 결정(fail-closed)", () => {
    const five = { suit: "sou", rank: 5 };
    expect(bottomDealDecisive([])(handView([201, 202, 203], 1, five), 77)).toBe(true);
    expect(bottomDealDecisive("throw")(handView([201, 202, 203], 40, five), 77)).toBe(true);
  });
});
