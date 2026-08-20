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
  it("관전 띠에 오야·차례·좌석 고정 단추가 있다", () => {
    expect(APP).toContain("spectate-focus-pick");
    expect(APP).toMatch(/key: "dealer"[\s\S]{0,40}label: "오야"/);
    expect(APP).toMatch(/key: "turn"[\s\S]{0,40}label: "차례"/);
    // 좌석 고정 — 네 사람 이름이 그대로 단추가 된다
    expect(APP).toMatch(/setFocusSeat\(p\.id\)/);
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
  it("관전 띠에서 세우고 다시 돌린다", () => {
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
