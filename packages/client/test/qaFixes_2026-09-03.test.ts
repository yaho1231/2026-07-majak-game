/**
 * 2026-09-03 사용자 보고 13건 중 **클라이언트 몫**의 회귀 가드.
 *
 * 여기 걸린 것들은 전부 «한 줄만 되돌려도 조용히 되살아나는» 종류다 — 흐림 한 줄이
 * 쌓임 맥락을 만들어 설명창을 판 밑으로 밀어 넣거나, 정산 창의 CTA가 sticky 로
 * 돌아가 화면 한가운데 서거나, 탁자를 옮겨도 앞 탁자의 선택 패널이 남거나.
 *
 * 클라를 렌더하지 않는 **정적 소스 스캔**이다(이 패키지에는 jsdom 이 없다 —
 * roundResultPanel.test.ts · a11yPerfGuards.test.ts 와 같은 방식).
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

/** `.선택자 {` 부터 닫는 중괄호까지 (첫 번째 것) */
function rule(sel: string): string {
  const at = CSS.indexOf(`${sel} {`);
  expect(at, `${sel} 규칙을 못 찾았다`).toBeGreaterThan(0);
  return CSS.slice(at, CSS.indexOf("}", at));
}

// ── 1. 비활성화된 증강의 설명창 ──────────────────────────────────────────────

describe("① 죽은 증강의 설명창도 맨 앞에 · 불투명하게 선다", () => {
  it("흐림은 pill 이 아니라 그 «내용»에 건다 — opacity 가 쌓임 맥락을 만들면 설명이 갇힌다", () => {
    /*
     * `.aug-pill-locked { opacity: .62 }` 한 줄이 두 가지를 한꺼번에 망가뜨렸다:
     * 자식인 `.aug-tip` 까지 반투명해져 글자가 안 읽혔고(자식에서 되돌릴 수 없다),
     * opacity < 1 이 쌓임 맥락을 만들어 `.aug-tip` 의 z-index 95 가 pill 안에 갇혔다
     * — 그래서 죽은 증강의 설명만 상대 손패 밑으로 깔렸다.
     */
    expect(CSS).toMatch(
      /\.aug-pill-cd > :not\(\.aug-tip\),\s*\n\.aug-pill-spent > :not\(\.aug-tip\),\s*\n\.aug-pill-locked > :not\(\.aug-tip\) \{\s*\n\s*opacity: 0\.62;/,
    );
    // pill 자신에게 흐림을 도로 거는 옛 형태로 되돌아가지 않게
    expect(CSS).not.toMatch(/\.aug-pill-cd,\s*\n\.aug-pill-spent,\s*\n\.aug-pill-locked \{\s*\n\s*opacity:/);
    expect(rule(".aug-pill-usable > :not(.aug-tip)")).toContain("opacity: 1");
  });

  it("설명창은 언제나 불투명하다", () => {
    expect(rule(".aug-tip")).toContain("opacity: 1");
    expect(rule(".aug-tip")).toContain("z-index: 95");
  });

  it("얹어서 읽는 동안에도 이름표 줄이 판 위로 올라선다 (여는 조건 = 올리는 조건)", () => {
    expect(CSS).toContain(".opp-strip:has(.aug-pill:hover)");
    expect(CSS).toContain(".opp-strip-left .nameplate:has(.aug-pill:hover)");
  });
});

// ── 2. 정산 화면의 「다음 국으로」 ───────────────────────────────────────────

describe("② 「다음 국으로」는 언제나 화면 맨 아래다 (더블론 포함)", () => {
  it("읽는 칸과 넘기는 줄이 층으로 갈려 있다 — sticky 로 되돌아가지 않는다", () => {
    expect(APP).toContain('<div className="result-body">');
    expect(rule(".result-cta")).not.toContain("position: sticky");
    expect(rule(".result-cta")).toContain("flex: none");
    // 스크롤은 읽는 칸이 맡는다 (패널은 넘치지 않는다)
    expect(rule(".result-body")).toContain("overflow-y: auto");
    expect(rule(".result-body")).toContain("min-height: 0");
    expect(rule(".result-panel")).toContain("overflow: hidden");
  });
});

// ── 3 · 8. 관전 탁자 전환 ───────────────────────────────────────────────────

describe("③⑧ 탁자를 옮기면 앞 탁자의 잔상이 통째로 사라진다", () => {
  const started = APP.slice(APP.indexOf('if (msg.type === "spectateStarted")'));
  const head = started.slice(0, started.indexOf("return;"));

  it("연출 큐·선택 패널·되감기 버퍼를 걷고, 첫 뷰로 다시 시드한다", () => {
    expect(head).toContain("clearProductions()");
    expect(head).toContain("prevViewRef.current = null");
    expect(head).toContain("resetFxSeen()");
    // 증강 선택 패널은 clearProductions 안에서 걷힌다
    expect(APP.slice(APP.indexOf("function clearProductions("))).toContain("setSpectateDraft(null)");
  });
});

describe("③ 정산 중에는 관전 좌석이 돌지 않는다", () => {
  it("오야를 붙들어 두었다가, 다음 국이 실제로 시작되면 따라간다", () => {
    expect(APP).toContain('const followsDealer = props.spectator === true && focusSeat === "dealer"');
    expect(APP).toContain('view.round.phase !== "round.over" || dealerAnchor.current === null');
    expect(APP).toContain("?? anchoredDealer");
  });
});

// ── 4. 관리자 — 접속자 · 닉네임 ─────────────────────────────────────────────

describe("④ 관리자는 접속자를 보고 닉네임을 바꾼다", () => {
  it("접속자 목록을 요청하고 받는다", () => {
    expect(code(APP)).toContain('send({ type: "adminOnline" })');
    expect(code(APP)).toContain('if (msg.type === "adminOnline")');
  });

  it("«지금 어디»가 로비·대기실·대국·관전 네 갈래로 보인다", () => {
    expect(APP).toContain("const ONLINE_WHERE_LABEL");
    for (const [k, v] of [
      ["lobby", "로비"],
      ["waiting", "대기실"],
      ["playing", "대국 중"],
      ["spectating", "관전 중"],
    ]) {
      expect(APP).toContain(`${k}: "${v}"`);
      expect(CSS).toContain(`.online-where-${k}`);
    }
  });

  it("닉네임은 줄 안에서 고친다 — Enter 저장 · Esc 취소", () => {
    const row = APP.slice(APP.indexOf("function AdminUserRow("));
    expect(row).toContain('if (e.key === "Enter") commit()');
    expect(row).toContain('if (e.key === "Escape") setEditing(null)');
    // 형식 검사는 서버(SiteDb.renameUser)가 가입과 같은 규칙으로 한다 — 두 번 하지 않는다
    expect(code(APP)).toContain('send({ type: "adminRenameUser", userId: String(userId), username })');
  });
});

// ── 5. 분석창은 판 옆이다 ───────────────────────────────────────────────────

describe("⑤ 분석 도크는 판을 누르지 않고 무대를 넓힌다", () => {
  it("무대가 도크만큼 넓어지고, 판 칸은 그대로 1920px 이다", () => {
    expect(CSS).toContain("width: calc(1920px + var(--stage-extra, 0px))");
    expect(CSS).toMatch(/html\[data-ui-stage="fixed"\] \.spectate-stage \{\s*\n\s*--spec-dock-w: 460px;/);
    expect(APP).toContain('setStageExtraWidth(dockFlag === "open" ? 460 : dockFlag === "folded" ? 30 : 0)');
  });

  it("탁자 위에 얹는 중계 창들은 도크 몫을 비워 «판 위»에 가운데 선다", () => {
    expect(rule(".spec-draft")).toContain("var(--stage-extra, 0px)");
    expect(rule(".spec-choice")).toContain("var(--stage-extra, 0px)");
  });
});

// ── 6. 배패 점수 재측정 ─────────────────────────────────────────────────────

describe("⑥ 손패가 교환되면 배패 점수도 다시 잰다 — 화면이 그 사실을 말한다", () => {
  it("다시 잰 좌석에는 표식이 선다", () => {
    expect(APP).toContain("ins.handGradeRegraded === true");
    expect(CSS).toContain(".bcast-regraded");
  });
});

// ── 7. 위험도(추정) ─────────────────────────────────────────────────────────

describe("⑦ 위험도는 «패 나열»이 아니라 값으로 읽힌다", () => {
  const dock = APP.slice(APP.indexOf("function DockDanger("));
  const body = dock.slice(0, dock.indexOf("\nfunction "));

  it("모든 패에 숫자(%)와 막대가 붙는다 — 0.33 미만이라고 비워 두지 않는다", () => {
    expect(body).toContain("dock-danger-pct");
    expect(body).toContain("dock-danger-meter-fill");
    expect(body).toContain("{pct}%");
    expect(CSS).toContain(".dock-danger-meter-fill.hi");
  });

  it("정렬 규칙(왼쪽이 위험)을 화면에서 한 줄로 말한다", () => {
    expect(body).toContain("dock-danger-legend");
    expect(CSS).toContain(".dock-danger-legend-bar");
  });
});

// ── 9. 리치 해제 알림 ───────────────────────────────────────────────────────

describe("⑨ 국이 끝나서 리치 표식이 내려간 것은 «해제»가 아니다", () => {
  it("배너는 국이 도는 중에만 뜬다 (브금 정리는 그대로 돈다)", () => {
    expect(APP).toContain(
      'const roundStillRunning = next.round.phase !== "round.over" && rk === shown.roundKey;',
    );
    const at = APP.indexOf("const roundStillRunning");
    // 배너 호출이 그 가드 안에 들어 있다
    expect(APP.slice(at, at + 400)).toContain("if (roundStillRunning) {");
    // 정리(riichiWasCancelled)는 가드 **밖**이라 브금이 이월되지 않는다
    expect(APP.slice(at - 600, at)).toContain("riichiWasCancelled = true;");
  });
});

// ── 10. 관전의 자동 넘김 ────────────────────────────────────────────────────

describe("⑩ 관전은 화료 뒤 스스로 다음 국으로 넘어간다", () => {
  it("증강 드래프트가 열리면 정산 창을 걷는다", () => {
    const at = APP.indexOf('if (msg.type === "spectateDraft") {');
    expect(at).toBeGreaterThan(0);
    const branch = APP.slice(at, APP.indexOf('if (msg.type === "spectateDraftEnd")'));
    expect(branch).toContain("if (spectatingRef.current) {");
    expect(branch).toContain("setRoundResult(null)");
  });

  it("드래프트가 없는 국은 마감 시계가 걷는다 — 관전석에서만", () => {
    expect(APP).toContain("autoClose={isSpectator}");
  });
});

// ── 11. 다 쓴 증강 ──────────────────────────────────────────────────────────

describe("⑪ 마지막 한 번을 쓴 «그 국»에는 아직 죽지 않았다", () => {
  it("0회가 된 국 동안에는 회색으로 내리지 않는다", () => {
    expect(APP).toContain("const stillThisRound = left === 0 && spentRound !== undefined && spentRound === roundKeyOfView(view)");
    expect(APP).toContain("...(left === 0 && !stillThisRound ? { tone: \"spent\" as const } : {})");
  });

  it("국 키는 콘텐츠·App 과 같은 식이다 (셋이 어긋나면 판정이 조용히 틀린다)", () => {
    expect(APP).toContain(
      "return `${v.round.prevalentWind}-${v.round.roundNumber}-${v.round.honba}`;",
    );
  });
});

// ── 12. 증강 선택창 중계 ────────────────────────────────────────────────────

describe("⑫ 관전자도 액티브 증강의 선택창을 본다", () => {
  it("서버 스냅샷을 그대로 그리고, 끝나면 그 좌석의 것만 걷는다", () => {
    expect(code(APP)).toContain('if (msg.type === "spectateChoice")');
    expect(code(APP)).toContain("cur === null || cur.seat === msg.seat ? null : cur");
    expect(APP).toContain("<SpectateChoicePanel choice={spectateChoice} view={view} />");
  });

  it("판이 도는 중이므로 탁자를 어둡게 덮지 않는다 (드래프트 중계와 다른 점)", () => {
    expect(rule(".spec-choice")).not.toContain("background:");
    expect(rule(".spec-choice")).toContain("pointer-events: none");
    // 되감는 중에는 띄우지 않는다 — 한 화면에 두 시각이 서면 안 된다
    expect(APP).toContain("isSpectator && spectateChoice !== null && view !== null && rewindAt === null");
  });
});

// ── 13. 「중계 중」 ─────────────────────────────────────────────────────────

describe("⑬ 「중계 중」 표식은 판 위에 그리지 않는다", () => {
  it("뱃지가 사라졌다", () => {
    expect(APP).not.toContain('className="spectated-badge"');
  });
});
