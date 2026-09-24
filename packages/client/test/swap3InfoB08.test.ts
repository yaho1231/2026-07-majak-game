/**
 * docs/59 B08 «등가교환 정보·swap3 잔재·가져온 패 표식» 회귀 가드 (2026-09-25).
 *
 * U08 공개받은 상대 손패를 give 단계에 손패 위 참고 줄로 · U09 교환 상대 관계 표식·take 제목의
 * 이름·«넘길 패» 줄 · U11 도달 불가한 옛 swap3 무장 경로 삭제 · U81 «🔮 가져온 패»를 실제 패
 * 표식(내 것)과 그 상대 줄 옆(남의 것)으로.
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

/** `function name(` 부터 다음 최상위 `\n}\n` 까지 — 함수 하나의 본문 */
function fnBody(name: string): string {
  const at = APP_CODE.indexOf(`function ${name}(`);
  expect(at, `${name} 함수가 없다`).toBeGreaterThan(-1);
  return APP_CODE.slice(at, APP_CODE.indexOf("\n}\n", at));
}

/** `const X = memo(function X(` 형 컴포넌트 본문 — 다음 `\n});\n` 까지 */
function memoBody(name: string): string {
  const at = APP_CODE.indexOf(`const ${name} = memo(function ${name}(`);
  expect(at, `${name} 컴포넌트가 없다`).toBeGreaterThan(-1);
  return APP_CODE.slice(at, APP_CODE.indexOf("\n});\n", at));
}

const OWN = fnBody("OwnArea");

describe("U08 공개받은 상대 손패 — 손패 위 참고 줄", () => {
  it("보유자 채널 revealTiles:{대상}을 읽고, 교환 중(stage)에만·관전이 아닐 때만 선다", () => {
    const at = OWN.indexOf("const swapRevealIds = useMemo<number[]>(() => {");
    expect(at).toBeGreaterThan(0);
    const memo = OWN.slice(at, OWN.indexOf("}, [", at));
    expect(memo).toContain("if (isSpectator || swap3Pick.stage === null || swapAimId === null) return [];");
    expect(memo).toContain("view.augmentView[`revealTiles:${swapAimId}`]");
    // 스냅샷에서 이미 공개된 자리(바닥·후로)로 간 패는 뺀다
    expect(memo).toContain("if (zone === `hand:${swapAimId}`) continue;");
    expect(memo).toContain("sortTileIds(ids, view.tiles)");
    expect(OWN).toContain(
      'const aim = view.augmentView[`hand_swap3:${me.id}`];\n    return typeof aim === "string" && view.players.some((p) => p.id === aim) ? aim : null;',
    );
  });

  it("줄은 «나만 보임» 참고용 — 봉인 배지 모양(🔒·seal-badge·SealBadge)을 쓰지 않는다 (2026-08-02 보고)", () => {
    const at = OWN.indexOf('className="swap3-reveal-strip"');
    expect(at).toBeGreaterThan(0);
    const strip = OWN.slice(OWN.lastIndexOf("{swapRevealIds.length > 0", at), OWN.indexOf(") : null}", at));
    expect(strip).toContain("의 손패 (나만 보임)");
    expect(strip).toContain("playerNameById(view, swapAimId)");
    expect(strip).not.toContain("🔒");
    expect(strip).not.toContain("seal-badge");
    expect(strip).not.toContain("SealBadge");
    expect(strip).not.toContain("onClick");
    // 손패 레일 바로 위 — 내 손패와 위아래로 견준다
    expect(at).toBeLessThan(OWN.indexOf('<div className="own-hand-rail"'));
    // 클릭을 받지 않는다
    // 줄 머리의 규칙(본 규칙) — `.own-area > .swap3-reveal-strip { order: -1 }`(W2 regression-1)가 먼저 걸리지 않게
    const css = /\n\.swap3-reveal-strip \{[^}]*\}/.exec(CSS)?.[0] ?? "";
    expect(css).toContain("pointer-events: none;");
    // 풀이(title)는 이름표에 — 줄 자체는 hover도 못 받아 줄에 달면 안 뜬다(라운드 1 리뷰)
    const tagOpen = strip.slice(strip.indexOf('className="swap3-reveal-tag"'));
    expect(tagOpen.slice(0, tagOpen.indexOf(">"))).toContain("교환이 끝나면 사라집니다");
    expect(strip.slice(0, strip.indexOf('className="swap3-reveal-tag"'))).not.toContain("title=");
    expect(CSS).toMatch(/\.swap3-reveal-tag \{[^}]*pointer-events: auto;/);
  });

  it("좁은 화면·폰 가로에서는 참고 줄 패를 줄여 give 안내를 밀어 올리지 않는다", () => {
    for (const q of ["@container ui (max-width: 700px) {", "@container ui (max-height: 560px) and (orientation: landscape) {"]) {
      const at = CSS.indexOf(`${q}\n  .swap3-reveal-strip {`);
      expect(at, q).toBeGreaterThan(0);
      expect(CSS.slice(at, CSS.indexOf("\n}\n", at))).toMatch(/\.swap3-reveal-cell \.tile-mini \{\s*width: 20px;\s*height: 28px;/);
    }
  });

  it("봉인 배지는 여전히 revealTiles를 읽지 않는다", () => {
    const peek = fnBody("sealedPeekOf");
    expect(peek).not.toContain("`revealTiles:");
    expect(peek).toContain("view.augmentView[`discardLockReveal:${playerId}`]");
  });
});

describe("U09 교환 상대·넘길 패", () => {
  it("RELATION_META에 hand_swap3가 있어 양쪽 이름표에 관계 표식이 선다 — 컷인은 없다", () => {
    const meta = /const RELATION_META[^=]*= \{([\s\S]*?)^\};/m.exec(APP_CODE)?.[1] ?? "";
    expect(meta).toMatch(/hand_swap3: \{ icon: "🔄", label: "등가교환", color: "#[0-9a-f]{6}" \}/);
    const cutins = /const RELATION_CUTINS[\s\S]*?^\};/m.exec(APP_CODE)?.[0] ?? "";
    expect(cutins.length).toBeGreaterThan(0);
    expect(cutins).not.toContain("hand_swap3");
    // relationsOf는 `hand_swap3:swapped`(객체 값, target 없음)를 걸러 낸다
    expect(fnBody("relationsOf")).toContain('if (typeof m.target !== "string") continue;');
    // 보유자 pill의 «→ 이름» 칩은 남긴다(U09-중복은 사용자 판단)
    expect(APP_CODE).toContain('if (augId === "hand_swap3") {');
  });

  it("take 모달 제목에 대상 이름, 위에 «넘길 패» 줄", () => {
    const at = OWN.indexOf('{swap3Pick.stage === "take" && !swapTakeDismissed ? createPortal(');
    expect(at).toBeGreaterThan(0);
    const modal = OWN.slice(at, OWN.indexOf("document.body,", at));
    expect(modal).toContain("playerNameById(view, swapAimId)}에게서");
    expect(modal).toContain("가져올 패 3장");
    expect(modal).toContain('<div className="swap3-gives-row">');
    // 기억이 비었거나 손을 떠났으면 지어내지 않는다
    expect(modal).toContain("if (swapGives.length !== 3 || !swapGives.every((id) => rawHand.includes(id))) return null;");
    // 닫기는 여전히 없다(2026-08-02 «닫기 없음»)
    expect(modal).not.toContain("닫기");
  });

  it("give 제출 때 넘길 3장을 기억한다", () => {
    const at = OWN.indexOf("const submitSwap3 = (): void => {");
    const fn = OWN.slice(at, OWN.indexOf("};", at));
    expect(fn).toContain('if (swap3Pick.stage === "give") setSwapGives(sortTileIds([...swap3Sel], view.tiles));');
    // 기억은 **전송이 나간 뒤에만** 남긴다 — 실패하면 고르던 3장을 그대로 두고 다시 누르게 한다
    // (W2 상태 수명 재검토). 이벤트 핸들러 안이라 같은 렌더로 묶이므로 순서가 기억을 잃게 하지는 않는다.
    const sentGuard = fn.indexOf("props.onSubmit(swap3Option) === false) return;");
    expect(sentGuard).toBeGreaterThan(0);
    expect(fn.indexOf("setSwapGives")).toBeGreaterThan(sentGuard);
  });

  it("새 give 프롬프트가 오면 지난 교환의 기억을 버린다 — 시간 초과 대행으로 끝난 give에 옛 3장이 뜨지 않게", () => {
    expect(OWN).toMatch(
      /useEffect\(\(\) => \{\n    if \(swap3Pick\.stage === "give"\) setSwapGives\(\[\]\);\n[^\n]*\n  \}, \[props\.promptSeq\]\);/,
    );
    // stage===null(give와 take 사이 잠깐 빈 순간)에서는 비우지 않는다
    expect(OWN).not.toMatch(/stage === null\) setSwapGives\(\[\]\)/);
  });

  it("상대 지정이 바뀌면(교환 완료로 채널이 걷히면) 기억을 버린다 — give 프롬프트를 못 본 재접속에도 옛 3장이 뜨지 않게", () => {
    expect(OWN).toMatch(/useEffect\(\(\) => \{\n    setSwapGives\(\[\]\);\n  \}, \[swapAimId\]\);/);
  });
});

describe("U11 도달 불가한 옛 swap3 무장 경로가 없다", () => {
  it("ArmMode·SelectionCtx·useSelection에 swap3 잔재가 없다", () => {
    expect(APP_CODE).toMatch(/^type ArmMode = "hand" \| "opp" \| "own-river" \| "opp-river" \| "hand3";/m);
    // (넘길 3장 기억 swapGives/setSwapGives는 U09의 새 상태라 단어 경계로 가른다)
    for (const s of ["swapTarget", "swapGive", "setSwapTarget", "setSwapGive", "pickSwapTile"]) {
      expect(APP_CODE, s).not.toMatch(new RegExp(`\\b${s}\\b`));
    }
    expect(APP_CODE).not.toContain("swap3.byKey");
    expect(APP_CODE).not.toContain('armMode === "swap3"');
    expect(APP_CODE).not.toContain('armedAug === "swap3"');
    expect(APP_CODE).not.toContain('case "swap3":');
  });

  it("상대 지정 안내는 armPromptText의 swap3 전용 문구로 살아 있다", () => {
    const table = /const ARM_PROMPT: Record<string, string> = \{([\s\S]*?)^\};/m.exec(APP_CODE)?.[1] ?? "";
    expect(table).toMatch(/swap3: "교환할 상대를 클릭하세요\./);
  });
});

describe("U81 가져온 패 — 실제 패 표식과 그 상대 줄 옆", () => {
  it("뱃지 줄(ActiveInfoBadges)은 가져온 패를 그리지 않는다", () => {
    const badges = memoBody("ActiveInfoBadges");
    expect(badges).not.toContain("future_sight:got:");
    expect(badges).not.toContain("fs_got_");
  });

  it("내 손패의 그 패에 hand-future 표식 — 손에 있는 패에만(버리면 사라진다)", () => {
    expect(OWN).toContain("view.augmentView[`future_sight:got:${me.id}`]");
    expect(OWN).toContain("const futureGot = futureGotMine.has(id);");
    expect(OWN).toContain('${futureGot ? " hand-future" : ""}');
    expect(OWN).toContain('<span className="hand-future-badge"');
    expect(OWN).toContain('futureGot ? "미래를 보는 자로 가져온 패" : null,');
    expect(CSS).toMatch(/\.hand-future-badge \{[^}]*left: -5px;/);
  });

  it("남의 것은 그 상대 줄의 봉인·천리안 옆 — 위·좌우 두 자리 모두", () => {
    const strip = APP_CODE.slice(APP_CODE.indexOf("const futureGot = futureGotOf(view, player.id);"));
    const n = strip.split("<FutureGotBadge got={futureGot} owner={playerName(view, player)} />").length - 1;
    expect(n).toBe(2);
    // 뒷면 자리를 앞면으로 바꿔 치지 않는다 — 공개된 것은 id뿐이다
    const fn = fnBody("futureGotOf");
    expect(fn).toContain("view.augmentView[`future_sight:got:${playerId}`]");
    expect(fn).not.toContain("hiddenCount");
  });

  it("이미 손을 떠난 패는 흐리게 — 그 사람 손패 밖의 자리에서 gone을 셈하고 뱃지가 future-got-gone을 단다", () => {
    const fn = fnBody("futureGotOf");
    expect(fn).toContain("if (zone === `hand:${playerId}`) continue;");
    expect(fn).toContain("for (const id of z.tileIds) elsewhere.add(id);");
    expect(fn).toContain(".map((tile) => ({ tile, gone: elsewhere.has(tile.id) }));");
    const badge = fnBody("FutureGotBadge");
    expect(badge).toContain('className={`future-got-cell${gone ? " future-got-gone" : ""}`}');
    expect(CSS).toMatch(/\.future-got-gone[^{]*\{[^}]*opacity:/);
  });

  it("좁은 판의 좌우 세로 줄에서는 뱃지 폭을 묶어 줄을 판 쪽으로 밀지 않는다", () => {
    const rules = CSS.match(/\.opp-strip-right \.future-got-badge \{[^}]*\}/g) ?? [];
    expect(rules.length).toBe(2);
    for (const r of rules) expect(r).toMatch(/max-width:/);
  });
});
