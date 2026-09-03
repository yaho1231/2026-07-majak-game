/**
 * 대회 중계 관전 — 화면 표기 회귀 가드 (docs/36 §3 D1·A1·A3, 1차).
 *
 * 관전 화면에 붙인 세 가지를 못 박는다:
 *  - **아래 자리 고르기**(D1) — 오야 고정이던 하단 시점을 중계가 직접 고른다.
 *  - **좌석별 오름패 남은 장수**(A1) — 판 전체가 쓰는 셈은 하단 좌석 하나 기준이라,
 *    남의 오름패 옆에 그대로 붙이면 아무의 것도 아닌 숫자가 된다.
 *  - **샹텐 뱃지**(A3) — 오름패가 없는 좌석이 얼마나 먼지.
 *
 * 이 패키지에는 jsdom·testing-library가 없어 **정적 소스 스캔**으로 확인한다
 * (waitsFuriten.test.ts·a11yPerfGuards.test.ts와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");
/** 도크 취향값(구획 목록·기본값·저장 키) — App.tsx가 아니라 여기 산다. */
const PREFS = readFileSync(join(HERE, "../src/spectateDock.ts"), "utf8");

/**
 * 공백을 한 칸으로 눌러 둔 사본. **프리티어 한 번에 빨개지는 테스트를 만들지 않기
 * 위해서다** — 줄바꿈 위치를 정규식에 박아 두면 그건 «뜻»이 아니라 «지금의 포맷»을
 * 지키는 것이고, 실제로 QA가 의미가 같은 `) : tableEl}` 로 줄이자 즉시 깨졌다.
 */
const APP1 = APP.replace(/\s+/g, " ");

/* ────────────────────────────────────────────────────────────────────────
 * 아주 작은 CSS 스캐너 — «같은 선언을 두고 누가 이기나»를 판정한다.
 *
 * **왜 필요한가.** 이번에 실제로 난 P0 는 선언이 «없어서»가 아니라 **캐스케이드에서
 * 져서** 생겼다: 좁은 화면 폴백(`@container ui (max-width: 900px)`)이 기본 규칙보다
 * 앞에 있었고, 특이성이 같으니 뒤에 오는 기본 규칙이 전부 되이겼다. 살아남은 선언이
 * `width` 하나뿐이라 도크가 창 밖으로 100px 삐져나갔고 ⚙·▶ 에 닿을 수 없었다.
 * 문자열 검사로는 이걸 **원리적으로** 못 잡는다 — 두 선언이 «있다»는 사실은 참이다.
 *
 * jsdom/happy-dom 도 답이 아니다: 둘 다 레이아웃을 하지 않고 컨테이너 질의를 풀지
 * 않아 `getComputedStyle` 이 선언값만 돌려준다. 그래서 여기서는 **소스 순서**를
 * 본다 — 특이성이 같을 때 이기는 쪽을 정하는 것이 정확히 그것이다.
 * (기하는 브라우저 실측으로 따로 확인한다.)
 * ──────────────────────────────────────────────────────────────────────── */

interface CssRule {
  /** 이 규칙을 감싼 at-rule 조건들 (`@container ui (max-width: 900px)` 등) */
  conds: string[];
  /** 쉼표로 갈라 다듬은 선택자들 */
  selectors: string[];
  /** 선언 블록 (중첩 규칙은 제외한 자기 몫만) */
  body: string;
  /** 소스에서의 시작 위치 — 같은 특이성끼리는 이 값이 큰 쪽이 이긴다 */
  at: number;
}

/** 주석을 먼저 걷는다 — 이 파일의 주석에는 `{`·`}` 가 실제로 들어 있다. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function parseRules(cssRaw: string): CssRule[] {
  const css = stripComments(cssRaw);
  const out: CssRule[] = [];
  const stack: { prelude: string; isAt: boolean }[] = [];
  let buf = "";
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i] as string;
    if (c === "{") {
      const prelude = buf.trim();
      const isAt = prelude.startsWith("@");
      if (!isAt) start = i - buf.length;
      stack.push({ prelude, isAt });
      buf = "";
      continue;
    }
    if (c === "}") {
      const top = stack.pop();
      if (top !== undefined && !top.isAt) {
        out.push({
          conds: stack.filter((f) => f.isAt).map((f) => f.prelude),
          selectors: top.prelude.split(",").map((x) => x.trim()).filter((x) => x !== ""),
          body: buf,
          at: start,
        });
      }
      buf = "";
      continue;
    }
    buf += c;
  }
  return out;
}

const CSS_RULES = parseRules(CSS);

/** 한 규칙이 그 속성을 선언하는가 (선언값도 함께 돌려준다) */
function declOf(rule: CssRule, prop: string): string | null {
  const m = new RegExp(`(?:^|;)\\s*${prop}\\s*:([^;]*)`, "m").exec(rule.body);
  return m === null ? null : (m[1] as string).trim();
}

/** `selector` 에 `prop` 을 선언하는 규칙 전부 — 소스 순서대로 */
function rulesFor(selector: string, prop: string): CssRule[] {
  return CSS_RULES.filter((r) => r.selectors.includes(selector) && declOf(r, prop) !== null).sort(
    (a, b) => a.at - b.at,
  );
}

/** 이름으로 함수 본문을 잘라 낸다 (다음 최상위 선언 전까지). */
function bodyOf(head: string): string {
  const start = APP.indexOf(head);
  expect(start, `${head} 를 못 찾았다`).toBeGreaterThan(0);
  const rest = APP.slice(start + head.length);
  const end = rest.search(/\n(?:function |const \w+ = memo\()/);
  expect(end).toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe("중계 관전 — 아래 자리 고르기 (D1)", () => {
  it("도크의 관전 설정에 오야·차례·좌석 고정 단추가 있다", () => {
    expect(APP).toContain("spectate-focus-pick");
    expect(APP).toMatch(/key: "dealer"[\s\S]{0,40}label: "오야"/);
    expect(APP).toMatch(/key: "turn"[\s\S]{0,40}label: "차례"/);
    // 좌석 고정 — 네 사람 이름이 그대로 단추가 된다
    expect(APP).toMatch(/onFocusSeat\(p\.id\)/);
  });

  it("고른 좌석이 하단 시점(me)이 된다 — 못 찾으면 예전처럼 오야로 되돌아간다", () => {
    expect(APP).toMatch(
      /const me = view\.players\.find\(\(p\) => p\.id === view\.playerId\)\s*\n\s*\?\? focusPlayer\s*\n\s*\?\? view\.players\.find\(\(p\) => p\.seat === view\.round\.dealerSeat\)/,
    );
  });

  it("관전이 아닐 때는 좌석 고르기가 시점을 건드리지 않는다", () => {
    expect(APP).toContain('props.spectator !== true || focusSeat === "dealer"');
  });

  it("띠는 판을 가리지 않고 단추만 눌린다", () => {
    // .spectate-bar 는 pointer-events:none 그대로 두고, 단추 묶음만 되살린다.
    expect(CSS).toMatch(/\.spectate-focus \{[^}]*pointer-events: auto;/);
  });

  it("고른 자리를 저장한다 — 새로고침마다 오야로 튕겨 나가지 않는다", () => {
    expect(APP).toContain("saveFocusSeat(s)");
    expect(APP1).toContain("props.spectator === true ? loadFocusSeat() : \"dealer\"");
    // 대국자 화면에서는 읽지 않는다 (spectateDock.ts 머리말의 경계와 같은 뜻)
    expect(APP1).toContain("props.spectator === true ? loadDockPrefs() : DEFAULT_DOCK_PREFS");
  });
});

describe("중계 관전 — 좌석별 오름패 (A1)", () => {
  const strip = bodyOf("function OpponentStrip({");

  it("남은 장수를 그 좌석 기준으로 다시 센다", () => {
    expect(strip).toContain("remainingCounter(view, player.id)");
    // 뱃지를 감싸 컨텍스트를 갈아 끼운다 (판 전체 셈은 하단 좌석 기준이라 그대로 못 쓴다)
    expect(strip).toMatch(/WaitCountContext\.Provider value=\{seatRemaining\}/);
  });

  it("후리텐·역없음을 그 좌석의 것으로 넘긴다 (서버가 관전 뷰에 네 좌석 모두 싣는다)", () => {
    expect(strip).toContain("pr?.noYakuWaits");
    expect(strip).toContain("pr?.furitenReasons");
  });

  it("차례가 온 좌석도 오름패가 꺼지지 않는다 — 떨어져 쥔 쯔모패를 빼고 잰다", () => {
    expect(strip).toMatch(/drawnSeparated === true \? full\.slice\(0, -1\) : full/);
  });

  it("계산해서 아는 오름패는 '간파'가 아니라 '오름패'로 적는다", () => {
    const badge = bodyOf("function WaitsBadge({");
    expect(badge).toContain("spectator?: boolean");
    expect(badge).toMatch(/spectator === true\s*\n?\s*\? "오름패"/);
    expect(CSS).toContain(".waits-badge-spec");
  });
});

describe("중계 관전 — 샹텐 뱃지 (A3)", () => {
  const badge = bodyOf("function ShantenBadge({");

  it("화료형(-1)에는 아무것도 적지 않는다", () => {
    expect(badge).toContain("if (shanten < 0) return null;");
  });

  it("오름패 뱃지가 이미 텐파이를 말하면 겹쳐 적지 않는다", () => {
    expect(badge).toContain("if (shanten === 0 && tenpaiShown) return null;");
  });

  it("N샹텐을 적는다", () => {
    expect(badge).toMatch(/\$\{shanten\}샹텐/);
    expect(CSS).toContain(".shanten-badge");
  });

  it("14장(쯔모를 쥔 차례)은 한 장 버린 뒤의 최선으로 잰다", () => {
    const strip = bodyOf("function OpponentStrip({");
    expect(strip).toMatch(/hand\.filter\(\(_, j\) => j !== i\), meldCount, opts\)/);
  });
});

describe("중계 관전 — 일시정지 (B1)", () => {
  it("도크에서 세우고 다시 돌린다", () => {
    expect(APP).toMatch(/type: "adminPauseGame", code: spectating, paused/);
    expect(APP).toContain("spectate-pause-btn");
    expect(APP).toMatch(/▶ 재개/);
  });

  it("판이 서면 화면의 시계도 선다 — 세 시계 전부", () => {
    expect(APP).toContain("const PausedContext = createContext(false)");
    // 프롬프트·드래프트·결과 화면 — useContext(PausedContext)로 같은 값을 본다
    const uses = APP.match(/useContext\(PausedContext\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(3);
    expect(APP).toContain("if (deadlineAt === null || paused) return;");
  });

  it("재개할 때 마감을 정지한 만큼 뒤로 민다 — 세워 둔 것이 벌이 되지 않게", () => {
    expect(APP).toMatch(/setPromptDeadline\(\(d\) => \(d === null \? null : d \+ dEpoch\)\)/);
    expect(APP).toMatch(/draftDeadline\.current \+= dPerf/);
    expect(APP).toMatch(/roundResultDeadline\.current \+= dPerf/);
  });

  it("대국자 화면은 덮어 잠그고, 관전석은 덮지 않는다", () => {
    expect(APP).toMatch(/<PauseOverlay pause=\{pause\} blocking=\{spectating === null\} \/>/);
    // 관전석 변형은 클릭을 통과시킨다 — 판을 다시 돌릴 단추가 거기 있다
    expect(CSS).toMatch(/\.pause-overlay-open \{[^}]*pointer-events: none;/);
  });

  it("방을 나가거나 관전을 접으면 정지 표식도 걷는다", () => {
    const reset = APP.slice(APP.indexOf("function clearProductions()"));
    expect(reset.slice(0, reset.indexOf("\n  }"))).toContain("setPause(null)");
  });
});

describe("중계 관전 — 방 공지 · 시간 연장 (B2·B3)", () => {
  const tools = bodyOf("function BroadcastTools({");

  it("공지를 걸고 내린다 — 빈 글이 곧 내림이다", () => {
    expect(tools).toContain('onRoomNotice("", 0)');
    expect(APP).toMatch(/type: "adminRoomNotice"/);
  });

  it("좌석마다 +30초 — 봇 자리는 잠근다", () => {
    expect(tools).toMatch(/onExtendTime\(p\.id, 30\)/);
    expect(tools).toContain("disabled={p.isBot}");
  });

  it("연장은 마감만 갈아 끼운다 — 프롬프트를 다시 그리지 않는다", () => {
    const handler = APP.slice(APP.indexOf('if (msg.type === "promptExtended")'));
    const body = handler.slice(0, handler.indexOf("return;"));
    expect(body).toContain("setPromptDeadline(Date.now() + msg.deadlineMs)");
    expect(body).toContain("draftDeadline.current = performance.now() + msg.deadlineMs");
    expect(body).not.toContain("setPrompts");
  });

  it("공지는 대국자와 관전자가 같은 것을 본다", () => {
    expect(APP).toContain('className={`room-notice${props.spectator === true ? " room-notice-spec" : ""}`}');
    expect(CSS).toContain(".room-notice");
    // 판을 가리지 않는다
    expect(CSS).toMatch(/\.room-notice \{[^}]*pointer-events: none;/);
  });

  it("서랍은 접혀 있고, 열면 클릭을 받는다", () => {
    expect(tools).toContain("const [open, setOpen] = useState(false)");
    expect(CSS).toMatch(/\.bcast-panel \{[^}]*pointer-events: auto;/);
  });
});

/*
 * ── 2열 무대와 분석 도크 (2026-08-23) ──
 *
 * 관전 UI 3종이 전부 `.table` 위의 절대좌표 오버레이였고 자기 크기를 레이아웃에
 * 통보하지 않아, 오른쪽 패널이 오른쪽 상대의 손패 위에 그대로 올라탔다.
 * 오버레이를 옆으로 밀어 피하는 방식은 다음 창 크기에서 또 겹친다 — 그래서 자리를
 * 나누고, 왼쪽 칸이 **자기 container 컨텍스트**가 되어 `--board` 가 좁아진 폭을
 * 따라오게 했다. 그 두 가지가 이 파일에서 못 박는 핵심이다.
 */
describe("중계 관전 — 2열 무대 (인게임 3/4 + 분석 도크 1/4)", () => {
  it("관전일 때만 2열이 된다 — 대국자 화면은 판 하나 그대로다", () => {
    // 관전이면 무대로 감싸고, 아니면 판(tableEl)을 **그대로** 돌려준다.
    expect(APP1).toMatch(/props\.spectator === true \? \( <div className=\{`spectate-stage/);
    expect(APP1).toMatch(/\) : \(? ?tableEl ?\)? ?\}/);
    expect(APP1).toContain('<div className="spectate-stage-board">{tableEl}</div>');
    // 무대·도크는 **그 분기 안에서만** 나온다 — 대국자 경로로 새어 나갈 길이 없다
    expect(APP.match(/spectate-stage/g)?.length ?? 0).toBeGreaterThan(0);
    expect(APP.match(/<SpectateDock/g)?.length).toBe(1);
    const branch = APP.slice(APP.indexOf("props.spectator === true ? ("));
    expect(branch.slice(0, branch.indexOf("tableEl\n    )}"))).toContain("<SpectateDock");
  });

  it("도크 폭은 clamp — 25%는 목표지 하한이 아니다", () => {
    expect(CSS).toMatch(
      /\.spectate-stage \{[\s\S]*?grid-template-columns: minmax\(0, 1fr\) clamp\(300px, 25%, 460px\);/,
    );
  });

  it("왼쪽 칸이 자기 container가 된다 — 이게 겹침을 «구조적으로» 없애는 자리다", () => {
    // 이름을 `ui` 로 똑같이 둬야 `.table` 아래 @container ui 규칙들이 이 칸을 본다.
    expect(CSS).toMatch(/\.spectate-stage-board \{[\s\S]*?container: ui \/ size;/);
  });

  it("왼쪽 칸이 판을 잘라 준다 — 안 그러면 좁은 폭에서 손패가 도크를 문다", () => {
    /*
     * `container-type: size` 는 **레이아웃** 봉쇄일 뿐 자르지 않는다(자르는 것은
     * paint 봉쇄다). 대국자 화면에서 `.game-root { overflow: hidden }` 이 하던 몫을
     * 이 칸이 이어받아야 한다 — 진짜 대국 화면을 2열에 넣고 재 보니 창 1000px ·
     * 왼쪽 칸 700px 에서 손패 레일이 x=722 까지 뻗어 도크를 22px 물었다.
     */
    const board = CSS_RULES.filter(
      (r) => r.selectors.includes(".spectate-stage-board") && r.conds.length === 0,
    );
    expect(board.length).toBeGreaterThan(0);
    expect(board.some((r) => declOf(r, "overflow") === "hidden")).toBe(true);
  });

  /*
   * ⚠ 아래 셋은 **선언이 있는지**가 아니라 **이기는지**를 본다.
   *
   * 첫 판(2026-08-23)에서 실제로 난 P0 가 이것이다: 좁은 화면 폴백이 기본 규칙보다
   * «앞»에 있어 특이성이 같은 기본 규칙에 전부 되졌다. 880×760 실측으로 열은
   * `580px 300px` 그대로인데 도크만 400px 로 부풀어 오른쪽 100px 이 창 밖으로
   * 나갔고, 거기 실린 ⚙(구획 on/off)와 ▶(접기)에 닿을 수가 없었다.
   * 그때 이 파일의 62개 테스트는 **전부 통과했다** — 선언은 실제로 «있었으니까».
   */
  it("좁은 화면 폴백이 캐스케이드에서 이긴다 (선언만으로는 부족하다)", () => {
    for (const [sel, prop] of [
      [".spectate-stage", "grid-template-columns"],
      [".spectate-dock", "position"],
      [".spectate-dock", "width"],
    ] as const) {
      const rules = rulesFor(sel, prop);
      const narrow = rules.filter((r) =>
        r.conds.some((c) => c.includes("max-width: 900px")),
      );
      expect(narrow.length, `${sel} { ${prop} } 의 좁은 화면 규칙이 없다`).toBeGreaterThan(0);
      const last = rules[rules.length - 1];
      expect(
        narrow.includes(last as (typeof rules)[number]),
        `${sel} { ${prop} } — 좁은 화면 규칙이 뒤따르는 기본 규칙에 진다 ` +
          "(특이성이 같으면 뒤에 오는 쪽이 이긴다: @container 블록을 정의 뒤로 옮겨라)",
      ).toBe(true);
    }
  });

  it("좁은 화면의 도크는 창 안에 들어온다 — 넘치면 ⚙·▶ 에 닿을 길이 없다", () => {
    const w = rulesFor(".spectate-dock", "width").find((r) =>
      r.conds.some((c) => c.includes("max-width: 900px")),
    );
    // `.game-root { overflow: hidden }` 이라 넘친 것은 스크롤로도 못 간다.
    // 그래서 폭 자체가 100cqw 를 넘지 않는 식이어야 한다.
    expect(w).toBeDefined();
    expect(declOf(w!, "width")).toBe("min(86cqw, 400px)");
    expect(declOf(w!, "right")).toBe("0");
  });

  it("도크는 오버레이가 아니라 그리드 칸이다 — 옛 구조로 되돌아가면 깨진다", () => {
    /*
     * QA 가 `.spectate-dock` 을 `position: absolute; top/right/bottom: 0; width: 232px`
     * 로 되돌려 **사용자가 신고한 그 오버레이 구조를 그대로 복원**했는데 62/62 가
     * 전부 통과했다. 그 회귀를 여기서 잡는다: 기본 상태의 도크는 자리를 «차지»해야
     * 하고(그래야 `--board` 가 줄어든다), 폭은 그리드 트랙이 정해야 한다.
     */
    const base = CSS_RULES.filter(
      (r) => r.selectors.includes(".spectate-dock") && r.conds.length === 0,
    );
    expect(base.length).toBeGreaterThan(0);
    for (const r of base) {
      expect(declOf(r, "position")).not.toBe("absolute");
      expect(declOf(r, "position")).not.toBe("fixed");
      // 폭을 스스로 정하면 그 순간 그리드 트랙과 두 값이 갈라진다
      expect(declOf(r, "width")).toBeNull();
    }
    // 무대는 두 칸이고, 도크 칸이 곧 도크 폭이다
    const stage = rulesFor(".spectate-stage", "grid-template-columns")[0];
    expect(declOf(stage!, "grid-template-columns")).toBe(
      "minmax(0, 1fr) clamp(300px, 25%, 460px)",
    );
  });

  it("띠에는 표식만 남는다 — 손잡이가 늘수록 판이 가려지던 구조를 끊는다", () => {
    const bar = APP.slice(APP.indexOf('<div className="spectate-bar">'));
    const end = bar.indexOf("</div>");
    expect(bar.slice(0, end)).toContain("👁 관전 중");
    expect(bar.slice(0, end)).not.toContain("spectate-focus");
  });
});

describe("중계 관전 — 도크 구획 on/off · 접기 · 영속화", () => {
  const dock = bodyOf("function SpectateDock(props: {");

  it("여섯 구획이 있다 — 관전 설정·좌석 분석·오름패·위험패·다음 쯔모·점수 추이", () => {
    const ids = [...PREFS.matchAll(/id: "(\w+)"/g)].map((m) => m[1]);
    expect(ids).toEqual(["settings", "seats", "waits", "danger", "nextDraw", "trend"]);
  });

  it("구획마다 켜기/끄기와 접기가 따로 있다 — 둘은 다른 뜻이다", () => {
    // 끈 구획은 아예 안 그린다(렌더 비용도 스포일러도 사라진다),
    // 접은 구획은 제목줄이 남아 «여기 있다»를 계속 말한다.
    expect(dock).toContain("prefs.on[s.id]");
    expect(dock).toContain("prefs.open[s.id]");
    // `standalone: false` 인 구획(오름패)은 스위치에만 서고 상자를 만들지 않는다
    expect(dock).toMatch(
      /DOCK_SECTIONS\.filter\(\(s\) => prefs\.on\[s\.id\] && s\.standalone !== false\)/,
    );
  });

  it("도크 전체도 접히고, 접었을 때 되돌릴 손잡이가 남는다", () => {
    expect(dock).toContain("if (!prefs.dockOpen)");
    expect(dock).toContain("spectate-dock-handle");
    // 폭을 0으로 만들지 않는다 — 되돌릴 길이 사라지면 탈출구가 새로고침뿐이 된다
    expect(CSS).toMatch(/\.spectate-stage-folded \{\s*grid-template-columns: minmax\(0, 1fr\) 30px;/);
  });

  it("취향값을 저장한다 — 새 키는 STORAGE_KEYS에도 들어 있다", async () => {
    const { STORAGE_KEYS } = await import("../src/storage.js");
    for (const k of [
      "majak.spectateDock",
      "majak.spectateDelay",
      "majak.spectateOverlay",
      "majak.spectateFocus",
    ]) {
      expect(STORAGE_KEYS as readonly string[]).toContain(k);
    }
  });

  it("지연·오버레이도 살아남는다 — 지연은 취향이 아니라 안전장치다", () => {
    expect(APP).toContain("useState(loadSpectateDelay)");
    expect(APP).toContain("useState<OverlayMode>(loadOverlayMode)");
    expect(APP).toContain("saveSpectateDelay(seconds)");
    expect(APP).toContain("saveOverlayMode(m)");
    // 관전을 **시작할 때부터** 저장된 지연을 들고 간다 (안 그러면 저장이 무의미하다)
    expect(APP).toMatch(/onSpectate=\{\(code\) =>[\s\S]{0,400}delaySeconds: spectateDelay/);
  });

  it("도크는 aria-hidden도 pointer-events:none도 아니다 — 실제로 조작하는 물건이다", () => {
    expect(dock).toContain('aria-label="관전 분석 도크"');
    // 뿌리(aside)에 aria-hidden 이 붙어 있지 않다 — 장식 글자(캐럿·화살표)는 예외다
    expect(dock).not.toMatch(/<aside className="spectate-dock"[^>]*aria-hidden/);
    expect(CSS).toMatch(/\.spectate-dock \{[\s\S]*?pointer-events: auto;/);
  });
});

describe("중계 관전 — 다음 쯔모 미리보기 (기본 OFF)", () => {
  const next = bodyOf("function DockNextDraw({");

  it("기본값이 꺼짐이다 — 이 화면에서 가장 강한 스포일러다", () => {
    expect(PREFS).toMatch(/on: \{[^}]*nextDraw: false/);
  });

  it("켤 때 무엇을 보게 되는지 적는다", () => {
    expect(PREFS).toContain("스포일러");
    expect(next).toMatch(/판의 결말을 먼저 보게 됩니다/);
  });

  it("누가 뽑는지는 drawOrder를 그대로 쓴다 — 역행·후로 건너뜀이 거기 들어 있다", () => {
    expect(next).toContain("projectedDrawSeats(");
    expect(next).toContain("view.round.direction");
    expect(next).toContain('view.zones["wall"]');
  });
});

describe("중계 관전 — 좌석 분석 (A2·A5·A7)", () => {
  const seats = bodyOf("function DockSeats({");

  it("좌석마다 점수·샹텐·도라를 적는다", () => {
    expect(seats).toContain("bcast-card-score");
    expect(seats).toMatch(/ins\.shanten === 0 \? "텐파이"/);
    expect(seats).toContain("도라 {ins?.dora}");
  });

  /*
   * 예전 화면은 봇의 값어치 모형을 그대로 찍어 「3.2판 4660점」처럼 **마작에 없는
   * 숫자**를 냈다. 이제 텐파이 좌석의 `best` 는 판이 실제로 쓰는 채점기가 낸
   * 확정값이라, 거기에 「추정」이라 적으면 화면 쪽이 거짓말이 된다.
   */
  it("확정과 추정을 다른 말로 적는다", () => {
    expect(seats).toMatch(/지금 화료/);
    // 확정/하한/후리텐을 툴팁이 갈라 말한다 (winValueTip)
    expect(seats).toContain("winValueTip(best,");
    expect(APP).toMatch(/확정값입니다 \(추정이 아닙니다\)/);
    // 「추정」은 노텐 구간(estimate)에만
    expect(seats).toMatch(/ins\?\.estimate !== undefined/);
    expect(seats).toMatch(/bcast-points-est/);
    expect(seats).toMatch(/아직 텐파이가 아닌 손의 추정값입니다/);
  });

  it("성립한 역과 배패 점수를 적는다 — 없으면 그 줄이 아예 안 뜬다", () => {
    expect(seats).toContain("yakuText(best)");
    expect(seats).toContain("ins?.handGrade !== undefined");
    expect(seats).toContain("bcast-grade-bar");
    expect(CSS).toContain(".bcast-grade-fill");
  });

  it("도라는 역이 있어야 센다 — 값 계산은 코어 채점기 것을 그대로 쓴다", () => {
    const wv = APP.slice(APP.indexOf("function winValueText("));
    const body = wv.slice(0, wv.indexOf("\n}"));
    expect(body).toContain("v.yakumanCount");
    expect(body).toContain("v.limit");
  });

  it("증강은 좌석별 잔량까지 — 다 쓴 것은 따로 표시한다", () => {
    const augs = bodyOf("function SeatAugments({");
    expect(augs).toMatch(/seat:\$\{player\.id\}:uses:\$\{id\}/);
    expect(augs).toContain("bcast-aug-spent");
  });

  it("점수 추이는 국별 증감으로 적는다", () => {
    const trend = bodyOf("function DockTrend({");
    expect(trend).toContain("r.result.settle.deltas");
    expect(CSS).toContain(".bcast-trend-d.up");
  });
});

/*
 * 코어가 정산기와 갈리던 값을 고치면서 붙인 **선택 필드 넷**. 이걸 안 읽으면 화면이
 * 조용히 틀린 말을 한다 — 특히 `uraUnknown` 은 중계가 가장 주목하는 좌석(리치)에서
 * 실제보다 낮은 값을 «확정»이라 단언하게 만든다.
 */
describe("중계 관전 — 확정·하한·거부 상태 (코어 2차 필드)", () => {
  const seats = bodyOf("function DockSeats({");
  const wv = APP.slice(APP.indexOf("function winValueText("), APP.indexOf("function DockSeats({"));

  it("리치 좌석의 값은 하한이라고 적는다 — 「확정」이라 단언하지 않는다", () => {
    expect(wv).toContain("uraUnknown === true");
    expect(wv).toMatch(/뒷도라 제외/);
    expect(wv).toMatch(/이 값은 하한입니다/);
    // 툴팁이 하한일 때와 확정일 때 **다른 말**을 한다
    expect(wv).toMatch(/확정값입니다 \(추정이 아닙니다\)/);
    // 확정값과 색까지 가른다 — 라벨만 다르면 눈은 둘을 같은 종류로 읽는다
    expect(seats).toContain("winValueCaveats(best).length > 0");
    expect(CSS).toContain(".bcast-points-floor");
  });

  it("무형화료를 뜻 없는 숫자로 두지 않는다 (han: 0 이 실제 지불액이다)", () => {
    expect(wv).toContain("v.noYaku === true");
    expect(wv).toMatch(/역 없이 성립/);
  });

  it("「격 미달」은 「역없음」과 다른 표식이다 — 손이 비싸지면 열린다", () => {
    expect(seats).toContain("ins?.belowMinHan === true");
    expect(seats).toMatch(/격 미달/);
    expect(CSS).toContain(".bcast-below");
    // 「역없음」과 색을 나눈다 (죽은 손 vs 아직 모자란 손)
    expect(CSS).toMatch(/\.bcast-below \{[^}]*color: #cfc4ee;/);
  });

  it("후리텐이면 best 가 쯔모 값이라는 것이 라벨에 드러난다", () => {
    expect(seats).toContain('ins?.furiten === true ? "쯔모하면" : "지금 화료"');
    expect(seats).toContain("pr?.furiten === true || ins?.furiten === true");
  });
});

/*
 * 되감기(D3) — 보조값을 안 붙이는 것까지는 맞았는데, 그때 도크가 「텐파이한 좌석이
 * 없습니다」를 그렸다. 그건 **없다는 주장**이지 «지금은 안 붙인다»가 아니다.
 */
/*
 * 코어 3차 필드 둘. 하나는 **이미 포함된 판의 출처**고, 하나는 **따라갈 수 없는
 * 보정**이다 — 뒤엣것은 `uraUnknown` 과 같은 층위로 다뤄야 한다.
 */
describe("중계 관전 — 증강 보너스 판 · 따라갈 수 없는 정산 보정 (코어 3차 필드)", () => {
  const wv = APP.slice(APP.indexOf("function winValueText("), APP.indexOf("function DockSeats({"));
  const seats = bodyOf("function DockSeats({");

  it("증강이 얹은 판을 역 목록에 세운다 — 합계가 안 맞아 보이면 화면이 고장 난 줄 안다", () => {
    const yt = APP.slice(APP.indexOf("function yakuText("), APP.indexOf("function DockSeats({"));
    expect(yt).toContain("v.augHan ?? 0");
    expect(yt).toMatch(/증강 \+\$\{v\.augHan\}판/);
    // 더하는 값이 아니라 «출처»다 — 툴팁이 이미 포함이라고 말한다
    expect(wv).toMatch(/이미 포함/);
  });

  it("따라갈 수 없는 보정은 하한과 같은 층위다 — 「확정값」이라 말하지 않는다", () => {
    expect(wv).toContain("v.augAdjusted === true");
    expect(wv).toMatch(/증강 보정 미반영/);
    expect(wv).toMatch(/실제 수령액이 이 값과 다를 수 있습니다/);
    /*
     * 핵심: 사정이 **하나라도** 있으면 확정 문구를 쓰지 않는다.
     * (`uraUnknown` 만 보던 옛 분기라면 `augAdjusted` 만 선 값이 「확정값입니다」로
     *  나갔다 — 갈라 놓은 뜻이 정확히 그 자리에서 무너진다.)
     */
    expect(wv).toContain("if (caveats.length === 0)");
  });

  it("꼬리표와 «확정색 죽이기»가 한 곳에서 나온다 — 갈라지면 서로 다른 말을 한다", () => {
    expect(wv).toContain("function winValueCaveats(");
    // 색·꼬리표·툴팁·대기별 값이 전부 같은 출처를 본다
    expect(seats).toContain("winValueCaveats(best).length > 0");
    expect(seats).toContain("winValueCaveats(best).map(");
    expect(wv).toMatch(/function winValueSuffix\(v: SpectateWinValue\): string \{\s*\n\s*const c = winValueCaveats\(v\);/);
    expect(wv).toContain("const caveats = winValueCaveats(v);");
  });

  it("오름패의 대기별 값에도 같이 흐른다", () => {
    const waits = bodyOf("function SeatWaits({").replace(/\s+/g, " ");
    expect(waits).toContain("winValueText(w.ron) + winValueSuffix(w.ron)");
    expect(waits).toContain("winValueText(w.tsumo) + winValueSuffix(w.tsumo)");
    // 꼬리표가 다르면 론/쯔모를 한 줄로 합치지 않는다 (합치면 그 사실이 사라진다)
    expect(waits).toContain("winValueSuffix(w.ron) === winValueSuffix(w.tsumo)");
  });
});

describe("중계 관전 — 되감는 동안의 말투", () => {
  it("구획이 «없다»가 아니라 «안 붙인다»고 적는다", () => {
    expect(APP).toContain("const REWIND_NOTE =");
    expect(APP).toMatch(/되감는 중입니다 — 이 값은 «지금»의 것이라 지나간 화면 옆에 세우지 않습니다/);
    expect(bodyOf("function DockDanger({")).toContain("REWIND_NOTE");
    /*
     * 오름패는 이제 좌석 카드 안이라(`SeatWaits`) 자기 문구가 없다 — 되감을 때는
     * `insight` 자체가 안 붙어 대기 목록이 비고, 카드가 그 이유를 한 번만 적는다.
     * 같은 사실을 두 자리에서 적으면 그 둘이 언젠가 다른 말을 한다.
     */
    expect(bodyOf("function DockSeats({")).toContain("rewinding");
  });

  it("다음 쯔모도 되감기 게이트 안이다 — 한 화면에서 시점이 섞이면 안 된다", () => {
    // 이 구획만 view.zones["wall"] 을 직접 읽어 게이트 밖이었다.
    const next = bodyOf("function DockNextDraw({");
    expect(next).toContain("if (rewinding) return");
    const wallAt = next.indexOf('const ids = (view.zones["wall"]');
    expect(wallAt).toBeGreaterThan(0);
    expect(next.indexOf("if (rewinding) return")).toBeLessThan(wallAt);
  });
});

/*
 * `.auglog`(z 90)은 body 포털이라 열 분할 바깥에 산다 — 컨테이너 봉쇄도 안 걸려
 * 늘 «창» 오른쪽에 서고, 그대로 두면 도크 위에 올라탔다 (1440×900 실측: 📜 서랍이
 * 도크 머리·구획 스위치·좌석 카드를 통째로 덮었다).
 * (같은 자리에 있던 배율 손잡이 `.ui-zoom` 은 2026-08-24에 없앴다.)
 */
describe("중계 관전 — body 포털이 도크를 덮지 않는다", () => {
  it("기록 서랍이 도크 몫만큼 물러난다", () => {
    // 좁은 화면(≤900)에서는 도크가 떠 있는 서랍이라 자리를 안 쓴다 — 그 블록의
    // 규칙은 예전 값 그대로가 맞다. **넓은 폭에 적용되는** 규칙만 따진다.
    const wide = (r: CssRule): boolean =>
      !r.conds.some((c) => {
        const m = /max-width:\s*(\d+)px/.exec(c);
        return m !== null && Number(m[1]) <= 900;
      });
    for (const sel of [".auglog"]) {
      const rs = rulesFor(sel, "right").filter(wide);
      expect(rs.length, `${sel} 의 right 규칙이 없다`).toBeGreaterThan(0);
      for (const r of rs) expect(declOf(r, "right")).toContain("--dock-reserve");
    }
    // 좁은 폭에서는 되돌린다 (그쪽은 서랍이라 자리를 안 쓴다)
    expect(CSS).toMatch(/@container ui \(max-width: 900px\) \{[\s\S]{0,200}--dock-reserve: 0px;/);
  });

  /*
   * ⚠ 이것은 `.game-root` 의 **후손이 아니라 형제**다(body 포털). 처음엔
   * `.game-root:has(.table-overlay-green) .auglog` 로 썼는데 후손 결합자가
   * 성립하지 않아 **한 번도 매치되지 않았고**, 크로마키 출력에 열린 📜 로그가
   * 그대로 나갔다. 소스만 보면 멀쩡해 보이는 종류의 실패라 여기서 못 박는다.
   */
  it("오버레이 출력에서 기록 서랍이 실제로 걷힌다 (body 신호로)", () => {
    // 정확히 그 요소를 겨냥한 규칙만 본다 (`.auglog-btn` 같은 것은 제외)
    const targets = (sel: string): boolean => /(?:^|\s)\.auglog$/.test(sel);
    const hide = CSS_RULES.filter(
      (r) => r.selectors.some(targets) && declOf(r, "display") === "none",
    );
    expect(hide.length, "오버레이에서 서랍을 걷는 규칙이 없다").toBeGreaterThan(0);
    for (const r of hide) {
      for (const sel of r.selectors.filter(targets)) {
        // `.game-root …` 후손 결합자로는 이 둘에 절대 닿지 못한다
        expect(sel.startsWith(".game-root"), `닿지 않는 선택자: ${sel}`).toBe(false);
        expect(sel.startsWith("body[data-majak-dock"), `body 신호가 아니다: ${sel}`).toBe(true);
      }
    }
    // 그 표식을 실제로 다는 쪽 (오버레이일 때 "overlay")
    expect(APP1).toContain('props.spectator !== true ? null : overlayOn ?');
    expect(APP).toContain('"overlay"');
  });

  it("도크 폭은 무대의 그리드 트랙과 같은 식이다 — 두 곳에서 따로 계산하지 않는다", () => {
    const open = CSS_RULES.find((r) => r.selectors.includes('body[data-majak-dock="open"]'));
    expect(declOf(open!, "--dock-reserve")).toBe("clamp(300px, 25cqw, 460px)");
    const folded = CSS_RULES.find((r) => r.selectors.includes('body[data-majak-dock="folded"]'));
    expect(declOf(folded!, "--dock-reserve")).toBe("30px");
    // 표식은 관전이고 오버레이가 아닐 때만 붙고, 벗어나면 걷힌다
    expect(APP).toContain("document.body.dataset.majakDock = dockFlag;");
    expect(APP).toContain("delete document.body.dataset.majakDock;");
  });
});

/*
 * `.game-root` 는 새 컨테이너(`.spectate-stage-board`) 바깥이라 늘 창을 본다.
 * 그래서 두 층이 서로 다른 폭을 믿는 구간이 생겼다 — 1024×768 실측으로 왼쪽 칸은
 * 724px 이라 `.table` 이 ≤900 규칙을 받는데, 같은 순간 `.game-root` 는 창이 1024라
 * 넓은 판의 띠 값을 유지했다.
 */
describe("중계 관전 — 두 층이 같은 폭을 본다", () => {
  it("예약 띠 변수를 .table 에서도 다시 푼다 (기본값 + 모든 브레이크포인트)", () => {
    for (const prop of ["--top-band", "--waits-row-h", "--own-reserve"]) {
      const onRoot = rulesFor(".game-root", prop);
      const onTable = rulesFor(".table", prop);
      expect(onTable.length, `${prop} 가 .table 에 없다`).toBeGreaterThan(0);
      // .game-root 가 조건부로 바꾸는 곳마다 .table 에도 같은 조건의 짝이 있어야 한다
      for (const r of onRoot.filter((x) => x.conds.length > 0)) {
        expect(
          onTable.some((t) => t.conds.join("|") === r.conds.join("|")),
          `${prop} — .game-root 는 ${r.conds.join(" ")} 에서 바뀌는데 .table 은 안 바뀐다`,
        ).toBe(true);
      }
      // 기본값을 .table 에도 못 박아 넓은 쪽 값이 상속으로 새지 않게 한다
      expect(onTable.some((t) => t.conds.length === 0)).toBe(true);
    }
  });

  it("--own-band 는 .table 에 선언하지 않는다 — OwnArea 실측값이 덮인다", () => {
    for (const r of CSS_RULES.filter((x) => x.selectors.includes(".table"))) {
      expect(declOf(r, "--own-band")).toBeNull();
    }
  });
});

describe("중계 관전 — 오름패별 값 (A1 확장)", () => {
  const waits = bodyOf("function SeatWaits({");
  const seatsBody = bodyOf("function DockSeats({");

  it("오름패마다 패 그림·남은 장수·론/쯔모 값을 적는다", () => {
    expect(waits).toContain("w.remaining");
    // 패는 **그림으로** 선다 — 관전에서 `1m` 같은 글자를 읽게 두지 않는다
    expect(waits).toContain("<TileImg tile={{ kind }} size=\"mini\" />");
    const waits1 = waits.replace(/\s+/g, " ");
    expect(waits1).toContain(
      '<span className="dock-wait-kind">론</span> {w.ron === null ? "역없음" : winValueText(w.ron) + winValueSuffix(w.ron)}',
    );
    expect(waits1).toContain(
      '<span className="dock-wait-kind">쯔모</span> {w.tsumo === null ? "역없음" : winValueText(w.tsumo) + winValueSuffix(w.tsumo)}',
    );
  });

  it("역이 없는 대기는 그렇게 적는다 — 남은 장수만 적으면 «왜 안 나지»가 된다", () => {
    expect(waits).toMatch(/역없음 — 이 패로는 못 납니다/);
    // 좌석 단위로 막히는 사실(형식텐파이)은 카드의 딱지줄이 말한다
    expect(seatsBody).toContain("ins?.yakuless === true");
  });

  /*
   * 오름패가 **좌석 카드 안**으로 들어왔다 (2026-08-24 사용자 요구). 같은 사람의
   * 「3판 5200점」과 「그게 무슨 패로 나는가」가 화면의 다른 자리에 있으면 중계가
   * 한 문장으로 말하는 것을 눈이 두 번 찾아야 한다.
   */
  it("좌석 카드가 그 좌석의 오름패를 함께 그린다", () => {
    expect(seatsBody).toContain("<SeatWaits waits={ins?.waits ?? []} />");
    // 대기가 없으면 빈 제목만 남기지 않는다
    expect(waits).toContain("if (waits.length === 0) return null;");
  });

  /*
   * 「오름패」 스위치는 남는다 — 그 값이 도크뿐 아니라 **판 위의 «쏘이는 패»**까지
   * 끄는 유일한 손잡이라, 없애면 「추정은 싫지만 사실은 보고 싶다」는 자리가 사라진다.
   * 대신 자기 구획 상자를 갖지 않는다(`standalone: false`).
   */
  it("스위치는 남되 자기 구획 상자는 없다", () => {
    expect(PREFS).toMatch(/id: "waits"[\s\S]{0,300}standalone: false/);
    expect(APP).toContain("prefs.on[s.id] && s.standalone !== false");
    expect(seatsBody).toContain("showWaits ? <SeatWaits");
    expect(APP).toContain("showWaits={prefs.on.waits}");
  });
});

describe("중계 관전 — 위험패 (A4)", () => {
  it("지금 두는 좌석의 손패에만 칠한다", () => {
    expect(APP).toContain("const DangerContext = createContext<");
    expect(APP).toMatch(/dg\?\.seat === owner \? dg\.danger\[slot\.id\] : undefined/);
    expect(APP).toMatch(/specDanger\?\.seat === me\.id/);
  });

  it("두 단계뿐이다 — 세 단계는 색이 서로를 잡아먹는다", () => {
    const fn = APP.slice(APP.indexOf("function specDangerClass("));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("spec-danger-hi");
    expect(body).toContain("spec-danger-md");
    expect(CSS).toContain(".spec-danger-hi");
  });

  it("도크의 스위치가 판 위의 색칠까지 함께 끈다 — 아니면 스위치가 거짓말을 한다", () => {
    const at = APP.indexOf("const specDanger = useMemo(");
    const fn = APP.slice(at, APP.indexOf("  );", at));
    expect(fn).toContain("dangerOn");
    expect(APP).toContain("const dangerOn = dockPrefs.on.danger;");
  });

  it("도크는 판 위와 같은 값을 쓴다 — 따로 세면 두 표시가 언젠가 갈라진다", () => {
    const dd = bodyOf("function DockDanger({");
    expect(dd).toContain("insight?.danger");
    expect(dd).toContain("specDangerClass(lv)");
    // 색만으로 단계를 말하지 않는다 (고대비·색약)
    expect(dd).toContain("dock-danger-tag");
    expect(CSS).toContain(".dock-danger-tag");
  });
});

describe("중계 관전 — 기록 (A6)", () => {
  // 2026-09-01 사용자 지시로 되돌렸다 — 관전에 들어서자마자 판을 덮는 패널이
  // 먼저 보이는 게 더 거슬렸다. 기록은 관전에서도 우상단에서 열어 본다.
  it("기록은 관전에서도 접혀 있다", () => {
    expect(APP).toContain("const [logOpen, setLogOpen] = useState(false);");
    expect(APP).not.toContain("useState(props.spectator === true)");
  });
});

describe("중계 관전 — 방송 안전 (C1·C4)", () => {
  it("송출 지연을 관전 띠에서 고른다", () => {
    expect(APP).toMatch(/\[0, 5, 15, 30\]\.map\(\(sec\)/);
    expect(APP).toMatch(/type: "spectate",\s*\n\s*code: spectating,/);
  });

  it("재접속으로 지연이 풀리지 않는다 — 그 순간 실시간 손패가 나간다", () => {
    expect(APP).toMatch(/spectateDelayRef\.current > 0 \? \{ delaySeconds: spectateDelayRef\.current \}/);
  });

  /*
   * 2026-09-03 사용자 지시로 «중계 중» 뱃지를 내렸다 — 관전은 관리자 전용이라
   * 판정에 개입하지 않는 열람인데, 판 위 붉은 점이 대국자에게 «내 판에 문제가
   * 생겼다»로 읽혔다. 그래서 검사도 뒤집는다: **그리지 않는다**가 지금의 약속이다.
   */
  it("«중계 중» 표식은 판 위에 그리지 않는다", () => {
    expect(APP).not.toMatch(/className="spectated-badge"/);
    expect(APP).toContain("관리자가 관전하면 중계중 표시 안 나오게");
  });
});

describe("중계 관전 — 되감기·오버레이·탁자 (D3·D2·D4)", () => {
  it("되감는 동안에는 그때의 뷰를 그린다", () => {
    expect(APP).toMatch(/rewindAt !== null \? \(viewBuffer\.current\[rewindAt\] \?\? view\) : view/);
  });

  it("되감기 버퍼는 관전에서만 쌓는다", () => {
    expect(APP).toMatch(/if \(spectatingRef\.current\) \{\s*\n\s*const buf = viewBuffer\.current;/);
  });

  it("되감는 동안에는 보조값을 붙이지 않는다 — 두 시점이 섞이면 서로를 거짓말로 만든다", () => {
    expect(APP).toMatch(/insight !== null && isSpectator && rewindAt === null/);
  });

  it("오버레이 모드는 배경과 곁가지를 걷는다 — 도크는 통째로 사라진다", () => {
    expect(CSS).toContain(".table-overlay-green");
    expect(CSS).toMatch(/\.table-overlay-clear \.quick-toggles/);
    // React 쪽에서 안 그리고(dockOff), CSS가 **열까지** 걷는다 —
    // 빈 열만 남으면 판이 그만큼 좁은 채로 방송에 나간다.
    expect(APP1).toContain('const dockOff = overlayOn || props.spectator !== true;');
    expect(APP).toContain("{dockOff ? null : (");
    const hide = CSS_RULES.filter((r) => r.selectors.includes(".spectate-stage-nodock .spectate-dock"));
    expect(hide.length).toBe(1);
    expect(declOf(hide[0]!, "display")).toBe("none");
    // 그 규칙이 도크 정의보다 뒤에 있어야 이긴다 (P0-1 과 같은 함정)
    const dockDef = CSS_RULES.filter(
      (r) => r.selectors.includes(".spectate-dock") && r.conds.length === 0,
    );
    expect(hide[0]!.at).toBeGreaterThan(Math.max(...dockDef.map((r) => r.at)));
    expect(declOf(rulesFor(".spectate-stage-nodock", "grid-template-columns")[0]!, "grid-template-columns"))
      .toBe("minmax(0, 1fr) 0");
  });

  /*
   * QA 실증: 「초록」을 켜면 도크와 관전 띠가 **동시에** 사라져 화면에 남는
   * 끔/투명/초록 단추가 0개가 됐다. 예전에는 `overlayMode` 가 휘발이라 새로고침이
   * 탈출구였는데, 저장을 붙이면서 그 탈출구까지 없앴다.
   * 접힌 도크에 30px 레일을 남긴 것과 **같은 원칙**을 여기에도 건다.
   */
  it("오버레이 모드에 갇히지 않는다 — 판 위 손잡이와 Esc 둘 다", () => {
    expect(APP).toContain('className={`spectate-overlay-escape${escapeIdle ? " is-idle" : ""}`}');
    expect(APP1).toContain('{overlayOn && props.onOverlayMode !== undefined ? (');
    // 키보드만 쓰는 사람의 문
    expect(APP).toContain('if (e.key !== "Escape" || isTypingTarget(e.target)) return;');
    // 저장까지 되돌린다 — 안 그러면 다음 관전에서 같은 화면으로 되살아난다
    expect(APP1).toContain('setOverlayMode("off"); saveOverlayMode("off");');
  });

  /*
   * 2026-08-23 사용자 보고: 「오버레이 투명 누르면 다시 켤 수 없어」.
   *
   * 예전 손잡이는 `opacity: 0` 이고 hover 에만 드러났다 — 켠 사람의 화면에는 아무것도
   * 남지 않으니 «여기 손잡이가 있다»를 배울 기회가 0이었다. 지금은 **켠 직후에는
   * 보이고 포인터가 멈추면 사라진다**(카메라에는 커서가 없다).
   */
  it("탈출구는 켠 직후 보인다 — 안 보이는 탈출구는 탈출구가 아니다", () => {
    const esc = CSS_RULES.filter(
      (r) => r.selectors.includes(".spectate-overlay-escape") && r.conds.length === 0,
    );
    expect(declOf(esc[0]!, "opacity")).toBe("1");
    // 숨는 것은 «포인터가 멈췄을 때»뿐이다 (React 가 `.is-idle` 을 단다)
    const idle = CSS_RULES.filter((r) => r.selectors.includes(".spectate-overlay-escape.is-idle"));
    expect(idle.length).toBe(1);
    expect(declOf(idle[0]!, "opacity")).toBe("0");
    expect(APP).toContain("function usePointerIdle(");
    expect(APP).toContain("const escapeIdle = usePointerIdle(overlayOn, 4000);");
    // 오버레이가 꺼져 있으면 창 전역 리스너를 아예 안 건다
    expect(APP1).toContain("if (!active) { setIdle(false); return; }");
  });

  /*
   * 캐스케이드 함정 — `:hover` 와 `.is-idle` 은 특이성이 (0,2,0) 로 **같다**.
   * hover 규칙이 앞에 오면 숨어 있는 동안 마우스를 올려도 안 나타난다(=다시 갇힌다).
   * 문자열 검사로는 원리적으로 못 잡는 종류라 소스 순서를 못 박는다.
   */
  it("hover·focus 가 .is-idle 을 이긴다 — 순서로만 정해지는 승부다", () => {
    const idle = CSS_RULES.filter(
      (r) => r.selectors.includes(".spectate-overlay-escape.is-idle") && r.conds.length === 0,
    );
    const wake = CSS_RULES.filter(
      (r) =>
        r.selectors.includes(".spectate-overlay-escape:hover") &&
        r.selectors.includes(".spectate-overlay-escape:focus-visible") &&
        r.conds.length === 0,
    );
    expect(idle.length).toBe(1);
    expect(wake.length).toBe(1);
    expect(declOf(wake[0]!, "opacity")).toBe("1");
    expect(wake[0]!.at).toBeGreaterThan(idle[0]!.at);
  });

  it("저장값과 상태가 갈라지지 않는다 (방을 나올 때·서버가 확정할 때)", () => {
    // 방을 나오며 오버레이를 끌 때 저장도 함께 내린다
    const reset = APP.slice(APP.indexOf("setSpectating(null);"));
    expect(reset.slice(0, 900)).toContain('saveOverlayMode("off")');
    // 지연은 «서버가 확정한 값»이 진짜다 — 저장도 거기에 맞춘다
    const started = APP.slice(APP.indexOf('if (msg.type === "spectateStarted")'));
    expect(started.slice(0, 600)).toContain("saveSpectateDelay(msg.delaySeconds ?? 0)");
  });

  it("탁자 전환기는 국·리치를 함께 보여준다", () => {
    expect(APP).toContain("spectate-table");
    expect(APP).toMatch(/r\.riichiCount \?\? 0\) > 0/);
    expect(APP).toMatch(/type: "liveGames" \}\), 10_000/);
  });
});

describe("중계 관전 — 국 무효 (B4)", () => {
  it("되돌릴 수 없는 조작이라 반드시 한 번 묻는다", () => {
    const tools = bodyOf("function BroadcastTools({");
    expect(tools).toContain("askConfirm({");
    expect(tools).toMatch(/이 국을 물린다/);
  });

  it("판을 접는 것과 다르다고 화면에 적는다", () => {
    const tools = bodyOf("function BroadcastTools({");
    expect(tools).toMatch(/판 자체는 계속됩니다/);
    // 결과 화면의 사유도 규칙 유국과 말투를 가른다
    expect(APP).toMatch(/adminVoid: "운영 판정/);
  });
});

/* ────────────────────────────────────────────────────────────────────────
 * 2026-08-23 사용자 보고 5건 — 관전 화면
 * ──────────────────────────────────────────────────────────────────────── */

describe("일시정지 — 제한시간 게이지도 함께 선다", () => {
  const timer = bodyOf("function PromptTimer(props: {");

  /*
   * 「일시정지 제한시간바가 움직임」. 숫자는 `PausedContext` 로 섰는데 게이지는 CSS
   * 애니메이션이라 React 가 멈춰도 계속 흘렀다 — 한 화면의 두 시계가 서로를
   * 거짓말로 만든다.
   */
  it("게이지가 CSS 애니메이션이 아니다 — React 가 멈추면 함께 멈춘다", () => {
    const fill = CSS_RULES.filter(
      (r) => r.selectors.includes(".prompt-timer-fill") && r.conds.length === 0,
    );
    expect(fill.length).toBeGreaterThan(0);
    for (const r of fill) expect(declOf(r, "animation")).toBeNull();
    // 이제는 남은 시간 하나로 길이를 그린다
    expect(timer).toContain("transform: `scaleX(${ratio})`");
    expect(timer).toContain("if (paused) return;");
    // 사라진 키프레임이 어디서도 안 불린다
    expect(CSS).not.toContain("@keyframes timer-run");
    expect(CSS).not.toContain("--timer-duration,");
  });

  /*
   * 재개하면 서버가 세워 둔 만큼 마감을 **뒤로 민다**. 예전 구조는 마감이 바뀌면
   * 새로 마운트해 애니메이션을 처음부터 돌렸으므로, 그 순간 막대가 가득 찬 자리로
   * 튀었다. 기준을 `seq` 에 묶어 그 튐을 없앤다.
   */
  it("재개·연장으로 마감이 밀려도 막대가 튀지 않는다", () => {
    // 다시 마운트하는 조건에서 deadline 이 빠졌다
    expect(timer).toContain("key={props.seq}");
    expect(timer).not.toContain("key={`${props.seq}:${deadline");
    // «가득 참» 기준은 프롬프트 단위다
    expect(timer).toContain("if (spanRef.current.seq !== props.seq)");
    // 연장(+30초)으로 남은 시간이 기준을 넘으면 기준을 늘린다 (scaleX > 1 방지)
    expect(timer).toContain("if (left > spanRef.current.total) spanRef.current.total = left;");
  });

  it("마감이 없는 국에서도 막대는 돈다 — 숫자는 지어내지 않는다", () => {
    expect(timer).toContain("deadline ?? Date.now() + PROMPT_FALLBACK_MS");
    expect(APP).toContain("const PROMPT_FALLBACK_MS = 30_000;");
    /*
     * 남은 «초»는 서버 마감이 있을 때만 적는다.
     *
     * 2026-08-25 QA §12 로 «마감이 있는 동안에는 내내» 숫자를 띄우게 바뀌었다
     * (예전에는 ≤10초 구간에만 떠서, 평소엔 5px 짜리 선이 유일한 신호였다).
     * 이 검사가 지키는 선은 그 «언제부터»가 아니라 **마감이 없으면 숫자가 아예
     * 안 나온다**는 쪽이다 — 어림값에 «약»을 붙여 적는 것도 지어내는 것이다.
     */
    expect(timer).toContain("const showCount = deadline !== null;");
    expect(timer).toContain("const urgent = deadline !== null && left <= TIMER_URGENT_MS;");
    // 게이트가 실제로 렌더를 막아야 한다 — 값만 계산하고 늘 그리면 의미가 없다
    expect(timer).toContain('{showCount ? <span className="prompt-timer-count">');
    // 어림값을 숫자로 옮기는 «약 N초» 표기가 되살아나지 않게
    expect(timer).not.toContain('"약 "');
  });
});

describe("중계 도크 — 구획이 잘리지 않고 스크롤된다", () => {
  /*
   * 「중계도크 칸들이 스크롤이 안 되서 짤림」. 부모는 `overflow-y: auto` 로 맞았는데
   * `.dock-sec` 이 flex 자식이라 `flex-shrink: 1` 로 줄어들고 자기 `overflow: hidden`
   * 으로 잘렸다 — 넘칠 일이 없으니 스크롤이 **생길 수가 없었다.**
   */
  it(".dock-sec 은 줄어들지 않는다 — 이게 스크롤을 만드는 유일한 줄이다", () => {
    const sec = CSS_RULES.filter(
      (r) => r.selectors.includes(".dock-sec") && r.conds.length === 0 && declOf(r, "flex") !== null,
    );
    expect(sec.length).toBe(1);
    expect(declOf(sec[0]!, "flex")).toBe("0 0 auto");
  });

  it("스크롤 상자 쪽 조건은 그대로다 (둘이 다 있어야 성립한다)", () => {
    const body = CSS_RULES.filter(
      (r) => r.selectors.includes(".spectate-dock-body") && r.conds.length === 0,
    );
    expect(body.some((r) => declOf(r, "overflow-y") === "auto")).toBe(true);
    expect(body.some((r) => declOf(r, "min-height") === "0")).toBe(true);
  });
});

describe("더블 론 — 한 장으로 합친 컷인", () => {
  const over = bodyOf("  function handleRoundOver(msg: RoundOverMessage): void {");

  /*
   * 「더블 론 하면 한 명만 론 연출」. 엔진은 이미 성립시키고(`winInfos` 가 복수)
   * 결과 화면도 승자별로 그리는데, 컷인만 최고 등급 한 건으로 좁아졌다.
   */
  it("승자가 둘이면 「더블 론!」 한 장 — 두 번 띄우지 않는다", () => {
    expect(over).toContain("if (infos.length >= 2) {");
    expect(over).toContain('"더블 론!"');
    // 큐가 순차 재생이라 두 번 부르면 1.5초씩 두 번 끌린다 — 분기 안에 showCutIn 은 하나뿐
    const branch = over.slice(over.indexOf("if (infos.length >= 2) {"), over.indexOf("} else if (isYakuman) {"));
    expect(branch.match(/showCutIn\(/g)?.length).toBe(1);
  });

  it("등급이 갈리면 부제에 **사람별로 둘 다** 적는다", () => {
    const branch = over.slice(over.indexOf("if (infos.length >= 2) {"), over.indexOf("} else if (isYakuman) {"));
    expect(branch).toContain("const gradeOf = (w: WinInfo): string =>");
    expect(branch).toContain("infos\n          .map(");
    expect(branch).toContain("gradeOf(w)");
    // 밴드의 무게는 그 판의 최고 등급을 따른다
    expect(branch).toContain('isYakuman ? "yakuman" : tier !== undefined ? "limit" : "ron"');
  });

  it("소리는 전용 변형이다 — ron() 을 두 번 부르면 볼륨만 2배가 된다", () => {
    const SFX = readFileSync(join(HERE, "../src/sfx.ts"), "utf8");
    expect(SFX).toContain("doubleRon(): void {");
    // 절대시각 스케줄이라 같은 시각에 겹치면 위상이 더해진다 — 두 번째 겹은 늦고 높다
    expect(SFX).toContain("const d = 0.1;");
    expect(SFX).toContain("const s = 1.06;");
    expect(APP).toContain("sfx.doubleRon");
  });

  /*
   * 3인 동시 론은 **화료가 아니다** — `tripleRon` 도중유국이라 점수가 안 움직인다.
   * 화료 연출로 만들면 화면과 정산표가 서로를 거짓말로 만든다.
   */
  it("트리플 론은 유국으로 말하되 사유를 밝힌다", () => {
    expect(over).toContain('msg.settle.abortReason === "tripleRon"');
    expect(over).toContain('showCutIn("삼가화", "draw", "트리플 론 — 점수는 움직이지 않습니다"');
  });

  it("역 스탬프 계단이 두 번째 승자까지 따라간다", () => {
    // 예전에는 infos[0] 만 세서 더블론의 두 번째 손이 무음으로 찍혔다
    expect(APP).toContain("const headRows = infos.reduce(");
    expect(APP).not.toContain("const headRows = infos[0] !== undefined");
  });
});

describe("쏘이는 패 — 추정이 아니라 사실 (2026-08-23)", () => {
  const read = bodyOf("function readHotWaits(");

  /*
   * 「위험패도 그냥 손패만 가져옴. 따로 오름패를 붉게 표시해주고 하는 게 아니라」.
   * 관전 뷰는 네 손패를 다 보므로 「이 패를 버리면 쏘인다」는 추정이 아니라 사실이다.
   */
  it("못 먹는 대기는 칠하지 않는다 — 붉게 칠하면 거짓말이다", () => {
    // 좌석 단위로 막히는 셋
    expect(read).toContain('s.furiten === true');
    expect(read).toContain('s.yakuless === true');
    expect(read).toContain('s.belowMinHan === true');
    // 대기 단위 — 그 패로는 역이 없다
    expect(read).toContain("if (w.ron === null) {");
    // 자기 버림패로는 못 쏜다
    expect(read).toContain("if (s.id === turn.id) continue;");
  });

  it("뺀 것들은 사라지지 않고 «이유»와 함께 도크에 남는다", () => {
    expect(read).toContain("cold.push({");
    expect(read).toMatch(/후리텐 — 론이 막혀 있습니다/);
    expect(read).toMatch(/형식텐파이 — 어떤 오름패로도 역이 없습니다/);
    expect(read).toMatch(/격 미달 —/);
    const dd = bodyOf("function DockDanger({");
    expect(dd).toContain("대기는 있지만 못 먹는 손");
    expect(dd).toContain("c.why");
  });

  it("판 위와 도크가 **같은 함수**를 쓴다 — 따로 세면 언젠가 갈라진다", () => {
    const dd = bodyOf("function DockDanger({");
    expect(dd).toContain("const read = readHotWaits(view, insight);");
    expect(APP).toContain("const read = readHotWaits(view, props.insight);");
  });

  it("«추정»(spec-danger)과 시각 채널이 겹치지 않는다 — 바깥 box-shadow 는 빈 자리였다", () => {
    const hot = CSS_RULES.filter(
      (r) => r.selectors.includes(".spec-hot") && r.conds.length === 0 && declOf(r, "box-shadow") !== null,
    );
    expect(hot.length).toBe(1);
    const shadow = declOf(hot[0]!, "box-shadow")!;
    // 안쪽 링은 이미 포화 상태다 — 이쪽은 바깥으로만 번진다
    expect(shadow).not.toContain("inset");
    // 추정 쪽은 그대로 안쪽 링이다
    const md = CSS_RULES.filter(
      (r) => r.selectors.includes(".spec-danger-md") && r.conds.length === 0 && declOf(r, "box-shadow") !== null,
    );
    expect(declOf(md[0]!, "box-shadow")).toContain("inset");
  });

  /*
   * box-shadow 는 규칙끼리 합쳐지지 않고 통째로 덮어쓴다. 한 패가 둘 다일 수 있으므로
   * 결합 규칙이 없으면 겹치는 순간 추정 쪽 링이 소리 없이 사라진다.
   */
  it("한 패가 «추정 + 사실» 둘 다일 때 두 링이 다 산다", () => {
    for (const sel of [".spec-danger-md.spec-hot", ".spec-danger-hi.spec-hot"]) {
      const r = CSS_RULES.filter((x) => x.selectors.includes(sel) && x.conds.length === 0);
      expect(r.length, sel).toBe(1);
      const sh = declOf(r[0]!, "box-shadow")!;
      expect(sh).toContain("inset");
      expect(sh).toContain("rgba(255, 74, 60, 0.95)");
    }
  });

  it("색만으로 말하지 않는다 — 좌석 바람 글자 + 고대비·강제색 채널", () => {
    expect(APP).toContain('<span className="spec-hot-mark"');
    expect(APP).toContain("seatWindChar(view, p)");
    // 이름(스크린리더)에도 실린다
    expect(APP).toContain("hot === null ? null : hotWaitTitle(hot),");
    // 색이 평탄해지는 두 환경에서 선종 채널이 남는다
    const contrast = CSS_RULES.filter(
      (r) => r.selectors.includes(".spec-hot") && r.conds.some((c) => c.includes("prefers-contrast")),
    );
    const forced = CSS_RULES.filter(
      (r) => r.selectors.includes(".spec-hot") && r.conds.some((c) => c.includes("forced-colors")),
    );
    expect(contrast.length).toBe(1);
    expect(forced.length).toBe(1);
    expect(declOf(forced[0]!, "outline")).toContain("solid");
  });

  it("끌 수 있다 — 성격상 «오름패» 스위치에 묶는다", () => {
    expect(APP).toContain("const waitsOn = dockPrefs.on.waits;");
    const at = APP.indexOf("const hotWaits = useMemo(");
    const fn = APP.slice(at, APP.indexOf("  }, [", at));
    expect(fn).toContain("!waitsOn");
    // 대국자 화면에는 절대 서지 않는다 (남의 손패를 읽어 만든 값이다)
    expect(fn).toContain("props.spectator !== true");
    expect(PREFS).toContain("판 위의 «쏘이는 패» 표시도 함께 꺼집니다");
  });
});
