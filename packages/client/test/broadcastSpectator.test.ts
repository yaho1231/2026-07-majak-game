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

describe("중계 관전 — 중계 패널 (A2·A5·A7)", () => {
  const panel = bodyOf("function BroadcastPanel({");

  it("관전 화면에만 선다 — 대국자에게는 아예 없다", () => {
    expect(APP).toMatch(/props\.spectator === true \? \(\s*<BroadcastPanel/);
  });

  it("판을 가리지 않는다 — 클릭은 통과시키고 스크롤만 받는다", () => {
    expect(CSS).toMatch(/\.bcast-side \{[\s\S]*?pointer-events: none;[\s\S]*?\}/);
  });

  it("좌석마다 점수·샹텐·예상 타점을 적는다", () => {
    expect(panel).toContain("bcast-card-score");
    expect(panel).toMatch(/ins\.shanten === 0 \? "텐파이"/);
    expect(panel).toContain("bcast-points");
  });

  it("예상 타점은 추정임을 화면에 적는다", () => {
    expect(panel).toMatch(/예상/);
    expect(panel).toMatch(/추정값입니다/);
  });

  it("증강은 좌석별 잔량까지 — 다 쓴 것은 따로 표시한다", () => {
    const augs = bodyOf("function SeatAugments({");
    expect(augs).toMatch(/seat:\$\{player\.id\}:uses:\$\{id\}/);
    expect(augs).toContain("bcast-aug-spent");
  });

  it("점수 추이는 국별 증감으로 적는다", () => {
    expect(panel).toContain("r.result.settle.deltas");
    expect(CSS).toContain(".bcast-trend-d.up");
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
});

describe("중계 관전 — 기록 (A6)", () => {
  it("관전에서는 기록이 처음부터 펼쳐져 있다 (대국자는 종전대로 접힘)", () => {
    expect(APP).toContain("useState(props.spectator === true)");
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

  it("대국자에게 «중계 중»을 알린다 (관전자에게는 띄우지 않는다)", () => {
    expect(APP).toMatch(/props\.spectator !== true && \(props\.spectatedBy \?\? 0\) > 0/);
    expect(CSS).toContain(".spectated-badge");
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

  it("오버레이 모드는 배경과 곁가지를 걷는다", () => {
    expect(CSS).toContain(".table-overlay-green");
    expect(CSS).toMatch(/\.table-overlay-clear \.bcast-side/);
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
