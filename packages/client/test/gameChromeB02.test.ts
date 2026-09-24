/**
 * docs/59 B02 «판 크롬·보조 화면 정리» 회귀 가드 (2026-09-25).
 *
 * U69 아이콘 줄 구별 · U70 도감·규칙 위 «내 차례» 띠 · U71/U72 무효 투표는 배너 한 곳 ·
 * U73 증강 시트 여러 행 펼침·고정 버튼 문구 · U74 봇 난이도 배지 InfoNote ·
 * U75 터치의 키 칩 숨김 · U78 드래프트 «자세히»를 카드 밖으로 · U83 관리자 계정명 ·
 * U86 정형구 2열·모르는 id 생략.
 *
 * 다른 클라 테스트와 같은 **정적 소스 스캔**이다(렌더하지 않는다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { LESSONS } from "../src/tutorial.js";

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

/** `function name(` 부터 다음 최상위 `\n}\n` 까지 — 함수 하나의 본문 */
function fnBody(name: string): string {
  const at = APP_CODE.indexOf(`function ${name}(`);
  expect(at, `${name} 함수가 없다`).toBeGreaterThan(-1);
  return APP_CODE.slice(at, APP_CODE.indexOf("\n}\n", at));
}

describe("U69 우상단 아이콘 줄 — 구별되고 이름이 있다", () => {
  it("⚙·📖·?·나가기 모두 aria-label 이 있다", () => {
    expect(APP_CODE).toMatch(/className="icon-btn settings-btn"[\s\S]{0,200}aria-label="설정"/);
    expect(APP_CODE).toMatch(/className="icon-btn codex-btn"[\s\S]{0,200}aria-label="증강 도감"/);
    expect(APP_CODE).toMatch(/className="icon-btn help-btn"[\s\S]{0,200}aria-label="규칙 도움말"/);
    expect(APP_CODE).toMatch(/className="icon-btn leave-btn"[\s\S]{0,2000}aria-label="나가기"/);
  });

  it("규칙은 📘 대신 «?» 글자라 📖 도감과 모양이 다르다", () => {
    expect(APP_CODE).toMatch(/aria-label="규칙 도움말"\s*>\?<\/button>/);
    expect(APP_CODE).not.toContain(">📘</button>");
  });

  it("나가기는 패널 닫기 ✕ 와 다른 글자이고, 확인은 그대로 한 번 묻는다", () => {
    const at = APP_CODE.indexOf('className="icon-btn leave-btn"');
    const btn = APP_CODE.slice(at, APP_CODE.indexOf("</button>", at));
    expect(btn).toContain("askConfirm(");
    expect(btn).not.toContain(">✕<");
    // (JSX 주석은 걷으면 `{}` 로 남는다)
    expect(btn).toMatch(/>[\s{}]*나가기\s*$/);
    // 좁은 판(34px 칸)에서도 옆 버튼 좌표가 안 흔들리게 글자를 줄여 칸에 맞춘다
    expect(CSS_CODE).toContain(".icon-btn.leave-btn {");
  });

  it("튜토리얼 규칙 강의가 새 글리프를 가리킨다", () => {
    const help = LESSONS.find((l) => l.id === "help")!;
    expect(help.todo).toContain("? 버튼");
    expect(help.todo).not.toContain("📘");
    expect(help.anchor).toBe(".help-btn");
  });
});

describe("U70 도감·규칙 오버레이 위 «내 차례» 띠", () => {
  it("띠는 알리기만 한다 — role=status, 포커스를 빼앗지 않게 단추는 한 박자 뒤에", () => {
    const bar = fnBody("OverlayTurnBar");
    expect(bar).toContain('role="status"');
    expect(bar).toContain('aria-live="polite"');
    expect(bar).toContain("useEffect(() => setReady(true), [])");
    expect(bar).toMatch(/\{ready \? \(\s*<button/);
    expect(bar).toContain("판으로 돌아가기");
    // 반응 프롬프트(pass 가 있는 것)와 버림 차례를 구별해 적는다
    expect(bar).toContain('"론·퐁 선택 대기"');
    expect(bar).toContain('"내 차례"');
  });

  it("관전자에게는 띄우지 않는다", () => {
    expect(APP_CODE).toContain("const overlayTurnPrompt = inGame && !isSpectator ? prompt : null;");
  });

  it("두 오버레이의 children 으로 들어가고, 겹쳐 열리면 도감 쪽 하나만", () => {
    expect(APP_CODE).toMatch(
      /<ScreenOverlay label="규칙 · 도움말"[\s\S]{0,200}overlayTurnPrompt !== null && !codexOpen \?[\s\S]{0,80}<OverlayTurnBar/,
    );
    expect(APP_CODE).toMatch(/<ScreenOverlay label="증강 도감"[\s\S]{0,200}<OverlayTurnBar/);
    // [판으로 돌아가기]는 겹쳐 열린 도움말까지 한 번에 걷는다
    expect(APP_CODE).toMatch(/const backToTable = \(\): void => \{\s*setCodexOpen\(false\);\s*setHelpOpen\(false\);/);
  });

  it("ScreenOverlay 본문은 그대로다(띠는 오버레이 안쪽이라 inert 에 안 걸린다)", () => {
    expect(fnBody("ScreenOverlay")).not.toContain("OverlayTurnBar");
  });

  it("튜토리얼 도감 강의가 이름표 쪽 길을 먼저 알려 준다", () => {
    expect(LESSONS.find((l) => l.id === "codex")!.body).toContain("이름표의 증강을 눌러 보거나");
  });
});

describe("U71·U72 무효 투표는 화면 위 배너 한 곳에서", () => {
  it("«설정 맨 아래에서 응답» 토스트가 없다", () => {
    expect(APP_CODE).not.toContain("설정 맨 아래에서 응답할 수 있습니다");
    expect(APP_CODE).not.toContain("abortVoteNoticed");
  });

  it("배너는 요청자·동의함·미응답 세 경우로 나뉜다", () => {
    const banner = fnBody("AbortVoteBanner");
    expect(banner).toContain('"내가 무효를 요청했습니다"');
    expect(banner).toMatch(/isRequester \? \(\s*<button className="abort-no" onClick=\{\(\) => props\.onVote\?\.\("reject"\)\}>\s*요청 취소/);
    expect(banner).toMatch(/onVote\?\.\("withdraw"\)\}>\s*동의 취소/);
    expect(banner).toMatch(/onVote\?\.\("agree"\)\}>\s*동의\s*</);
    // 비활성 «동의함 ✓»는 사라졌다 — 동의한 사람은 여기서 바로 취소한다
    expect(banner).not.toContain("동의함");
  });

  it("요청자는 배너가 뜬 순간의 voters[0] 으로 기억한다 — 요청자가 빠지면 일반 문장", () => {
    // 매번 voters[0] 을 보면, 요청자가 끊겨 표가 빠졌을 때 다음 동의자가 «요청자»가 되어
    // [동의 취소] 길이 사라졌다(리뷰 라운드 1).
    const banner = fnBody("AbortVoteBanner");
    expect(banner).toContain("const [requesterId] = useState<string | null>(() => props.abortVote.voters[0] ?? null)");
    expect(banner).toContain("const requesterIn = requesterId !== null && voters.includes(requesterId)");
    expect(banner).toContain("const isRequester = requesterIn && requesterId === props.myId");
    expect(banner).toContain('"무효 투표가 진행 중입니다"');
    expect(APP_CODE).not.toContain("isRequester={props.abortVote.voters[0]");
  });

  it("투표 회차마다 배너를 새로 마운트한다 — 반대와 다음 동의가 한 렌더에 몰려도 옛 요청자가 남지 않는다", () => {
    // 리뷰 라운드 2: votes 0 → 1 이 한 배치로 처리되면 배너가 내려가지 않아 useState 가
    // 지난 투표의 요청자를 들고 있었다.
    expect(APP_CODE).toContain("if (msg.votes > 0 && !abortVoteLive.current) setAbortVoteRound((n) => n + 1);");
    expect(APP_CODE).toMatch(/<AbortVoteBanner\s+key=\{props\.abortVoteRound \?\? 0\}/);
  });

  it("설정 패널은 투표 중이면 버튼 대신 배너로 안내한다", () => {
    const panel = fnBody("SettingsPanel");
    expect(panel).toMatch(/votes > 0 \? \(\s*<span className="abort-voting-note"/);
    expect(panel).toContain("투표 진행 중 — 화면 위 배너에서 응답하세요");
    // 동의 취소(withdraw)는 배너만 보낸다 — 두 곳이 할 수 있는 일이 같아야 한다
    expect(panel).not.toMatch(/onVoteAbort\?\.\([^)]*"withdraw"/);
  });
});

describe("U73 증강 시트·툴팁 고정 버튼", () => {
  it("시트는 여러 행을 함께 펼치고, 머리에 «모두 자세히»가 있다(기본 접힘)", () => {
    const sheet = fnBody("PlayerAugSheet");
    expect(sheet).toContain("useState<ReadonlySet<string>>(() => new Set())");
    expect(sheet).toContain('"모두 자세히"');
    expect(sheet).toContain('"모두 간단히"');
    expect(sheet).toContain("expanded={detailFor.has(a)}");
  });

  it("고정 버튼 문구는 짧고, 해제 방법은 title·aria 로 간다", () => {
    expect(APP_CODE).toContain('{pinned.has(a) ? "📌 고정 해제" : "📌 고정"}');
    expect(APP_CODE).not.toContain("📌 고정됨. 눌러서 해제");
    expect(APP_CODE).toMatch(/className="aug-tip-pin"[\s\S]{0,400}aria-label=\{pinned\.has\(a\) \? "고정 해제 \(Esc나 바깥 클릭으로도 해제됩니다\)"/);
  });
});

describe("U74 봇 난이도 배지도 터치에서 열린다", () => {
  it("InfoNote 로 감싸 탭하면 설명이 열린다", () => {
    expect(APP_CODE).toMatch(/<InfoNote\s+className="mode-badge bot-diff-badge"\s+note=\{`봇 난이도 /);
    expect(APP_CODE).not.toMatch(/<div\s+className="mode-badge bot-diff-badge"/);
  });

  it("폰 세로에서는 전처럼 보이고, 가로 폰에서는 전처럼 접힌다", () => {
    const show = ".game-root .info-note.mode-badge.bot-diff-badge { display: flex; top: 8px; }";
    const fold = ".game-root .info-note.mode-badge.bot-diff-badge { display: none; }";
    expect(CSS_CODE).toContain(show);
    expect(CSS_CODE).toContain(fold);
    // 가로 폰의 접기는 폰 세로의 되살리기보다 파일 뒤, 481~700 의 접기는 그 앞이어야
    // 같은 특정도에서 각자 이긴다(폰 세로는 되살리고, 가로 폰은 접는다).
    expect(CSS_CODE.lastIndexOf(fold)).toBeGreaterThan(CSS_CODE.indexOf(show));
    expect(CSS_CODE.indexOf(fold)).toBeLessThan(CSS_CODE.indexOf(show));
  });

  it("두 배지가 포개지지 않는다 — 모드 뱃지 ⓘ 는 첫 줄, 좁은 판에서 칩은 아래 단", () => {
    // 리뷰 라운드 2 실측: 1280×800 에서 모드 뱃지의 셋째 줄 ⓘ 가 칩 윗단을 덮었고,
    // 태블릿 세로에서는 `.mode-badge{top:8px}` 가 칩의 60px 을 이겨 둘이 같은 자리였다.
    expect(CSS_CODE).toMatch(
      /\.mode-badge\.info-note:where\(:not\(\.bot-diff-badge\)\) \{[^}]*display: grid;[^}]*"name mark" "drafts drafts"/,
    );
    const narrow = CSS_CODE.indexOf("@container ui (max-width: 900px) {\n  .mode-badge {");
    expect(narrow).toBeGreaterThan(-1);
    expect(CSS_CODE.slice(narrow, narrow + 200)).toContain(".mode-badge.bot-diff-badge { top: 54px; }");
  });

  it("난이도 변경 토스트도 원문 키로 떨어지지 않는다", () => {
    expect(APP_CODE).not.toContain("?? msg.botDifficulty");
  });
});

describe("U75 키 칩은 키가 실제로 듣는 곳에만, 터치에서는 숨긴다", () => {
  it("MoreToggle 의 Shift 칩은 기본 꺼짐이다", () => {
    const toggle = fnBody("MoreToggle");
    expect(toggle).toContain("showKey = false");
    expect(toggle).toContain('{showKey ? <span className="augdesc-more-key">Shift</span> : null}');
  });

  it("Shift 가 연결된 두 곳(이름표 툴팁·드래프트 카드)만 켠다", () => {
    const all = APP_CODE.match(/<MoreToggle[\s\S]*?\/>/g) ?? [];
    expect(all.length).toBeGreaterThanOrEqual(3);
    const uses = all.filter((u) => /\bshowKey\b/.test(u));
    expect(uses).toHaveLength(2);
    for (const u of uses) expect(u).toContain("shiftHeld ||");
  });

  it("터치(hover: none)에서는 Shift·Esc 칩을 숨긴다", () => {
    const at = CSS_CODE.indexOf("@media (hover: none) {");
    const block = CSS_CODE.slice(at, CSS_CODE.indexOf("\n}", at));
    expect(block).toContain(".augdesc-more-key");
    expect(block).toContain(".prod-skip-key { display: none; }");
  });
});

describe("U78 드래프트 «자세히»는 확정 과녁(카드) 밖에 선다", () => {
  it("카드 버튼 안에는 MoreToggle 이 없고, 카드 아래 줄에 있다", () => {
    const at = APP_CODE.indexOf("className={`draft-card draft-card-cat");
    expect(at).toBeGreaterThan(-1);
    const card = APP_CODE.slice(at, APP_CODE.indexOf("</button>", at));
    expect(card).not.toContain("<MoreToggle");
    const foot = APP_CODE.indexOf('<div className="draft-slot-foot">', at);
    expect(foot).toBeGreaterThan(at);
    expect(APP_CODE.slice(foot, foot + 400)).toContain("<MoreToggle");
  });

  it("튜토리얼 «자세히» 강의가 새 자리를 비켜선다", () => {
    expect(LESSONS.find((l) => l.id === "draft-detail")!.mustClear).toBe(".draft-slot .augdesc-more");
  });
});

describe("U83 관리자 계정명을 설명 없이 붙이지 않는다", () => {
  it("일시정지 — 대국자 화면에는 계정명이 없고 관전석에만 «세운 사람»", () => {
    const pause = fnBody("PauseOverlay");
    expect(pause).not.toContain("` (${pause.by})`");
    expect(pause).toMatch(/!blocking && pause\.by !== undefined \?[\s\S]{0,80}세운 사람: \{pause\.by\}/);
  });

  it("탁자 공지 — 역할 이름이 아니면 «— 관리자»로 적는다", () => {
    expect(APP_CODE).toMatch(/props\.roomNotice\.by === "튜토리얼" \|\| props\.roomNotice\.by === "관리자"/);
    expect(APP_CODE).toMatch(/className="room-notice-by"\s*title=\{[^}]*\}[^>]*>\s*— 관리자/s);
  });

  it("탁자 공지 — 계정명은 관전석 title 에만, 대국자는 «관리자»", () => {
    expect(APP_CODE).toContain(
      'title={props.spectator === true ? `공지한 사람: ${props.roomNotice.by}` : "공지한 사람: 관리자"}',
    );
  });
});

describe("U86 정형구 — 2열 격자, 모르는 id 는 생략", () => {
  it("대국판 목록만 2열이고 대기실 드롭다운은 그대로다", () => {
    const at = CSS_CODE.indexOf(".table > .emote-bar .emote-list {");
    expect(at).toBeGreaterThan(-1);
    const body = CSS_CODE.slice(at, CSS_CODE.indexOf("}", at));
    expect(body).toContain("display: grid");
    expect(body).toContain("grid-template-columns: repeat(2, minmax(0, max-content))");
    expect(body).toContain("overflow-x: hidden");
    expect(body).toContain("overflow-y: auto");
    const wr = CSS_CODE.indexOf(".wr-head .emote-list {");
    expect(CSS_CODE.slice(wr, CSS_CODE.indexOf("}", wr))).not.toContain("grid");
  });

  it("받은 문구의 정의가 없으면 원문 id 대신 건너뛴다", () => {
    const feed = fnBody("EmoteFeed");
    expect(feed).toContain("if (def === undefined) return null;");
    expect(feed).not.toContain("?? e.id");
  });
});
