/**
 * QA 4차 클라이언트 수리 — 2차 배치(client-fix-B) 회귀 가드.
 *
 * 출처: `qa-lab/round4/onboard.md` · `qa-lab/round4/loop.md` · `qa-lab/round4/text.md`.
 *
 * 여기 걸린 것들의 공통점: **화면은 멀쩡히 그려진다.** 30초 타이머는 정확히 돌고,
 * 용어 사전은 예쁜 문장으로 오카를 설명하고, 결과 화면은 «로비로» 버튼을 잘 세운다.
 * 다만 그 값이 실제 정산과 다르거나, 그 판이 처음 온 사람의 판이거나, 눌러야 할
 * 버튼이 거기 없을 뿐이었다. 눈으로는 다시 못 찾는 것들이라 못을 박는다.
 * `qaRound4ClientA.test.ts`와 같은 방식(정적 소스 스캔)이다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GLOSSARY, GLOSSARY_GROUPS } from "../src/glossary.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(HERE, p), "utf8");

const APP = read("../src/App.tsx");
const CSS = read("../src/styles.css");
const TUTORIAL = read("../src/tutorial.ts");
const GLOSSARY_SRC = read("../src/glossary.ts");
const HUMAN_AGENT = read("../../server/src/HumanAgent.ts");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);
const TUTORIAL_CODE = code(TUTORIAL);
const AGENT_CODE = code(HUMAN_AGENT);
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

const byKey = new Map(GLOSSARY.map((g) => [g.key, g]));

// ═══════════════ onboard P1 ═══════════════

describe("① 처음 보는 증강 카드 셋에 30초를 걸지 않는다", () => {
  it("판의 첫 드래프트만 넉넉한 상한을 받는다", () => {
    // 코드가 스스로 "카드 셋을 읽는 데만 30초가 넘게 걸린다"고 적어 놓고, 그 판단을
    // 튜토리얼에만 적용했다. «바로 한 판»(게스트)·«연습 대국»은 tutorial=false다.
    expect(AGENT_CODE).toContain("FIRST_DRAFT_TIMEOUT_MS");
    // 30초보다 넉넉하되 컨트롤러의 최후 그물(90초, `AGENT_DECIDE_TIMEOUT_MS`)보다는
    // **작아야** 한다 — 같으면 그물이 사람을 대신 골라 버린다.
    const m = /export const FIRST_DRAFT_TIMEOUT_MS = ([\d_]+);/.exec(HUMAN_AGENT);
    expect(m).not.toBeNull();
    const ms = Number((m?.[1] ?? "0").replace(/_/g, ""));
    expect(ms).toBeGreaterThan(30_000);
    expect(ms).toBeLessThan(90_000);
  });

  it("`draftTimeoutMs` 가 «몇 번째 드래프트인가»로 가른다", () => {
    const at = AGENT_CODE.indexOf("private draftTimeoutMs()");
    expect(at).toBeGreaterThan(0);
    const body = AGENT_CODE.slice(at, at + 400);
    expect(body).toContain("draftsOffered");
    expect(body).toContain("FIRST_DRAFT_TIMEOUT_MS");
    // 튜토리얼 예외는 그대로 남아 있어야 한다 — 그쪽은 사실상 무제한이다.
    expect(body).toContain("TUTORIAL_DECISION_TIMEOUT_MS");
  });

  it("드래프트를 낼 때마다 실제로 센다 (안 세면 늘 첫 번째가 된다)", () => {
    const at = AGENT_CODE.indexOf("async decideDraft(");
    expect(at).toBeGreaterThan(0);
    expect(AGENT_CODE.slice(at, at + 1200)).toContain("this.draftsOffered += 1;");
  });

  it("평상시 결정 상한 30초는 건드리지 않았다", () => {
    // 이 수리는 «증강 선택»에만 걸린다. 매 결정을 90초로 늘리면 판이 늘어진다.
    expect(HUMAN_AGENT).toMatch(/export const DECISION_TIMEOUT_MS = 30_000;/);
    const at = AGENT_CODE.indexOf("private decisionTimeoutMs()");
    expect(AGENT_CODE.slice(at, at + 400)).not.toContain("FIRST_DRAFT_TIMEOUT_MS");
  });
});

describe("② 튜토리얼이 실전의 30초 제한을 가르친다", () => {
  it("마무리 강의가 실전과의 차이를 말한다", () => {
    const at = TUTORIAL_CODE.indexOf('id: "outro"');
    expect(at).toBeGreaterThan(0);
    const body = TUTORIAL_CODE.slice(at, at + 900);
    expect(body).toContain("30초");
    // 무슨 일이 일어나는지까지 말해야 안내다 — "제한이 있습니다"만으로는 부족하다.
    expect(body).toMatch(/패스|나갑니다/);
  });

  it("랜딩도 두 문을 갈라 적는다 — «바로 한 판»은 실전과 같은 판이다", () => {
    const at = APP_CODE.indexOf('className="landing-key-note"');
    expect(at).toBeGreaterThan(0);
    const note = APP_CODE.slice(at, at + 600);
    expect(note).toContain("30초");
    // 예전에는 "시간 제한이 없습니다"가 둘 다에 걸리는 것처럼 읽혔다.
    expect(note).toContain("바로 한 판");
  });
});

describe("③ 첫 화료의 정산 화면에서 코치가 입을 다물지 않는다", () => {
  it("정산 화면 전용 강의가 있고, 마무리보다 앞에 선다", () => {
    const score = TUTORIAL_CODE.indexOf('id: "result-score"');
    const outro = TUTORIAL_CODE.indexOf('id: "outro"');
    expect(score).toBeGreaterThan(0);
    // 둘 다 성립하는 순간이 온다 — 점수 이야기가 뒤에 오면 판을 접은 뒤에 뜬다.
    expect(score).toBeLessThan(outro);
  });

  it("`allowedNow` 가 그 강의를 통과시킨다 (마무리 하나만 열려 있던 자리)", () => {
    const at = TUTORIAL_CODE.indexOf("function allowedNow");
    expect(at).toBeGreaterThan(0);
    const body = TUTORIAL_CODE.slice(at, at + 200);
    expect(body).toContain("RESULT_LESSONS");
    expect(TUTORIAL_CODE).toMatch(/RESULT_LESSONS[^\n]*result-score[^\n]*outro/);
  });

  it("그 강의는 정산 화면이 떠 있고 내가 이겼을 때만 나온다", () => {
    const at = TUTORIAL_CODE.indexOf('id: "result-score"');
    const body = TUTORIAL_CODE.slice(at, at + 800);
    expect(body).toContain("c.roundOver");
    expect(body).toContain("c.won");
  });

  it("«N판 M부» 원이 용어집으로 이어진다", () => {
    const at = APP_CODE.indexOf('className="result-han-circle"');
    expect(at).toBeGreaterThan(0);
    const body = APP_CODE.slice(at, at + 900);
    expect(body).toContain("<TermText");
    // 역 이름 줄은 **그대로 둔다** — 줄줄이 밑줄이 그이면 어느 역이 큰지가 안 보인다.
    const yaku = APP_CODE.indexOf('className="result-yaku-name"');
    expect(APP_CODE.slice(yaku, yaku + 80)).not.toContain("TermText");
  });

  it("「30부」가 용어집에 걸린다 (사전 표기는 「부수」뿐이었다)", () => {
    const fu = byKey.get("fu");
    expect(fu?.match).toBeDefined();
    const hit = (fu?.match ?? []).some((m) => new RegExp(m).test("30부"));
    expect(hit, "「30부」가 어떤 match 에도 안 걸린다").toBe(true);
    // 일반어를 잡으면 판 위 문장이 밑줄투성이가 된다.
    const junk = (fu?.match ?? []).some((m) => new RegExp(m).test("일부"));
    expect(junk, "「일부」 같은 일반어까지 잡는다").toBe(false);
  });
});

describe("④ 판에서 빠져나가는 몸짓을 한 번 붙잡는다", () => {
  it("beforeunload · popstate 가 둘 다 걸린다", () => {
    // 예전에는 저장소 전체에 grep 이 0건이었다 — 히스토리 항목을 만드는 화면이 없어
    // 뒤로가기가 곧 사이트 이탈이었다.
    expect(APP_CODE).toContain('window.addEventListener("beforeunload"');
    expect(APP_CODE).toContain('window.addEventListener("popstate"');
    expect(APP_CODE).toContain("majakGuard");
  });

  it("판·대기실에 있을 때만, 그리고 관전자에게는 걸지 않는다", () => {
    const at = APP_CODE.indexOf("const leavingGuard =");
    expect(at).toBeGreaterThan(0);
    const line = APP_CODE.slice(at, APP_CODE.indexOf(";", at));
    expect(line).toContain("inGame");
    expect(line).toContain("inWaiting");
    expect(line).toContain("!isSpectator");
  });

  it("되묻는 창은 `askConfirm` 이다 — `window.confirm` 은 결정 타이머를 세우지 못한다", () => {
    const at = APP_CODE.indexOf("const onPopState");
    expect(at).toBeGreaterThan(0);
    const body = APP_CODE.slice(at, at + 900);
    expect(body).toContain("askConfirm");
    expect(body).not.toContain("window.confirm");
  });

  it("게스트에게는 다른 문장을 준다 (돌아올 수단이 다르다)", () => {
    const at = APP_CODE.indexOf("const onPopState");
    expect(APP_CODE.slice(at, at + 900)).toContain("isGuestSeat");
  });
});

// ═══════════════ loop P1 ═══════════════

describe("① 초대를 들고 온 사람이 게스트 문으로 새지 않는다", () => {
  it("게스트 두 문이 초대 코드를 먼저 본다", () => {
    expect(APP_CODE).toContain("function inviteNeedsAccount()");
    // 두 버튼(튜토리얼·바로 한 판) **모두**에 걸려 있어야 한다 — 한쪽만 막으면
    // 다른 쪽으로 그대로 샌다.
    expect([...APP_CODE.matchAll(/if \(inviteNeedsAccount\(\)\) return;/g)].length).toBe(2);
  });

  it("막은 뒤 가입 탭으로 보내고 이유를 그 자리에 남긴다", () => {
    const at = APP_CODE.indexOf("function inviteNeedsAccount()");
    const body = APP_CODE.slice(at, at + 600);
    expect(body).toContain('switchTab("register")');
    expect(body).toContain("setLocalError");
    expect(body).toContain("props.invitedCode");
  });

  it("초대 배너가 «계정으로만»이라고 적는다", () => {
    const at = APP_CODE.indexOf('className="landing-invite"');
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 500)).toContain("계정으로만");
  });
});

describe("② 대국 중인 방에 늦게 온 사람에게 다음 걸음을 준다", () => {
  it("ROOM_PLAYING 이면 코드를 붙들어 둔다", () => {
    const at = APP_CODE.indexOf('msg.code === "ROOM_PLAYING" && joinTargetRef.current !== null');
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 500)).toContain("setBusyRoomCode");
  });

  it("홈의 참가 칸이 그 코드로 채워지고 안내가 남는다", () => {
    expect(APP_CODE).toContain("busyRoomCode");
    expect(APP_CODE).toContain('className="home-join-busy"');
    // 토스트는 사라진다 — 남는 줄이 있어야 재시도가 6자리 재입력이 되지 않는다.
    expect(CSS_CODE).toContain(".home-join-busy");
  });

  it("들어가는 데 성공하면 붙들고 있던 코드를 놓는다", () => {
    const at = APP_CODE.indexOf('if (msg.type === "joined")');
    expect(APP_CODE.slice(at, at + 300)).toContain("setBusyRoomCode(null)");
  });
});

describe("③ 연습 대국 결과 화면에 «한 판 더»가 있다", () => {
  it("결과 화면이 `onPracticeAgain` 을 그린다", () => {
    expect(APP_CODE).toContain("onPracticeAgain");
    const at = APP_CODE.indexOf("{onPracticeAgain !== undefined ?");
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 200)).toContain("연습 한 판 더");
  });

  it("«이어하기»가 없을 때만 뜬다 (사람 방에는 이어하기가 이미 있다)", () => {
    const at = APP_CODE.indexOf("!canContinue && wasPractice && !isSpectator");
    expect(at).toBeGreaterThan(0);
  });

  it("연습 판이었는지를 «보낸 쪽»에서 기억한다", () => {
    // 서버 응답에는 그 사실이 없다.
    expect([...APP_CODE.matchAll(/setWasPractice\(true\)/g)].length).toBe(2);
    // 사람 방에 들어가면 꺼져야 한다 — 안 그러면 남의 방 결과에도 뜬다.
    expect([...APP_CODE.matchAll(/setWasPractice\(false\)/g)].length).toBeGreaterThanOrEqual(2);
  });
});

// ═══════════════ loop P2 ═══════════════

describe("빈 전적 CTA 가 «기록에 남는 문»도 함께 준다", () => {
  it("두 단추가 서고, 남지 않는다는 사실을 적는다", () => {
    const at = APP_CODE.indexOf("아직 완료한 대국이 없습니다");
    const body = APP_CODE.slice(at, at + 700);
    expect(body).toContain("props.onPractice");
    expect(body).toContain("props.onCreateRoom");
    expect(APP).toContain("기록에 남지 않습니다");
  });
});

describe("결과 화면이 이번 판의 증강을 보여 준다", () => {
  it("`GameAugmentRow` 가 통계 탭에 붙어 있다", () => {
    expect(APP_CODE).toContain("function GameAugmentRow");
    const at = APP_CODE.indexOf('<StatsGrid s={e.stats} scope="game" />');
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 120)).toContain("<GameAugmentRow");
  });

  it("이미 도착해 있는 `stats.augments` 를 읽는다 (새 메시지가 필요 없다)", () => {
    const at = APP_CODE.indexOf("function GameAugmentRow");
    const body = APP_CODE.slice(at, at + 700);
    expect(body).toContain("s.augments");
    // 고른 것만 — offered 만 된 카드는 이번 판에 아무 일도 안 했다.
    expect(body).toContain("a.picked > 0");
  });
});

describe("대기실 전적 칩이 표본을 숨기지 않는다", () => {
  it("표본이 얇으면 비율을 접는다", () => {
    const at = APP_CODE.indexOf("function StatsChips");
    const body = APP_CODE.slice(at, at + 1200);
    expect(body).toContain("THIN_ROUNDS");
    expect(body).toContain("아직 적음");
  });

  it("비율을 그릴 때는 표본 칩이 **맨 앞**에 선다", () => {
    const at = APP_CODE.indexOf("function StatsChips");
    const body = APP_CODE.slice(at, at + 1600);
    const n = body.indexOf("stat-chip-n");
    const win = body.indexOf("화료 {pct(s.winRate)}");
    expect(n).toBeGreaterThan(0);
    expect(n).toBeLessThan(win);
  });
});

describe("만든 공유 링크를 내릴 수 있다", () => {
  it("클라이언트가 `revoke` 를 보낸다 (여태 0건이었다)", () => {
    expect(APP_CODE).toContain("revoke: true");
    expect(APP_CODE).toContain("onUnshare");
  });

  it("살아 있는 링크를 아는 판에만 내리기가 뜬다", () => {
    expect(APP_CODE).toContain("sharedGames");
    const at = APP_CODE.indexOf("props.shared === true && props.onUnshare !== undefined");
    expect(at).toBeGreaterThan(0);
  });

  it("내려간 응답(token === null)이면 표식도 걷힌다", () => {
    const at = APP_CODE.indexOf('if (msg.type === "replayShareToken")');
    expect(APP_CODE.slice(at, at + 700)).toContain("next.delete(msg.gameId)");
  });
});

describe("새로 고침 단추 넷이 하나의 쿨다운을 나눠 쓴다", () => {
  it("쿨다운이 모듈 전역이고 2.5초 이상이다", () => {
    // 버튼마다 900ms 씩 따로 세던 시절에는 한 버튼만으로도 10초에 11번까지 나갔다.
    expect(APP).toMatch(/const REFRESH_COOLDOWN_MS = 2_500;/);
    expect(APP_CODE).toContain("let refreshBusyUntil");
  });

  it("홈 진입도 같은 창을 태운다", () => {
    const at = APP_CODE.indexOf("function refreshHome()");
    expect(APP_CODE.slice(at, at + 300)).toContain("markRefreshed()");
  });

  it("한 버튼이 눌리면 넷이 함께 잠긴다", () => {
    const at = APP_CODE.indexOf("function RefreshButton");
    const body = APP_CODE.slice(at, at + 1200);
    expect(body).toContain("refreshBusyListeners");
    expect(body).toContain("markRefreshed()");
  });
});

// ═══════════════ text P2 (9건) ═══════════════

describe("① 「오카」·「반환점」 풀이가 실제 정산과 맞는다", () => {
  it("오카는 «이 서버에서는 0»이라고 적는다", () => {
    // 기본 설정이 `oka: 0`이고 결과 화면은 `oka !== 0`일 때만 칩을 그린다 —
    // 즉 오카는 한 번도 화면에 뜨지 않는다. 예전 풀이는 «1위가 20000점 독식»이었다.
    const oka = byKey.get("oka");
    expect(oka?.short).toContain("0");
    expect(oka?.long).toBeTruthy();
    expect(`${oka?.short}${oka?.long ?? ""}`).not.toMatch(/1위가 통째로 가져간다\.?$/);
  });

  it("반환점은 «서든데스 판정 기준»이지 성적의 기준이 아니다", () => {
    const rs = byKey.get("return_score");
    expect(rs?.short).toContain("서든데스");
    expect(rs?.short).not.toMatch(/성적을 셀 때 기준이 되는 점수/);
  });

  it("우마 풀이가 실제 기준선(시작 점수 25,000)을 적는다", () => {
    expect(byKey.get("uma")?.long).toContain("25,000");
  });
});

describe("② 「판」이 한 화면 안에서 뒤집히지 않는다", () => {
  it("도움말의 게임 단위 섹션 제목이 «대국»이다", () => {
    // 바로 위 섹션이 «판(역과 도라의 개수)»으로 정의해 놓고 다음 제목이 배신했다.
    expect(APP).toContain('title: "대국은 언제 끝나는가"');
    expect(APP).not.toContain('title: "판은 언제 끝나는가"');
  });

  it("튜토리얼의 화면 배율 강의가 «판» 대신 «화면»을 쓴다", () => {
    expect(TUTORIAL).not.toContain("판이 안 맞으면");
    expect(TUTORIAL).not.toContain("판이 잘리거나 겹쳐 보일 때");
  });
});

describe("③ 액티브 증강 배지가 한 글리프로 통일돼 있다", () => {
  it("배지·팁·드래프트 노트가 전부 ✦ 다 (실제 버튼이 ✦다)", () => {
    for (const s of ["✦ 액티브", "✦ 액티브 표시가 붙은 증강", "✦ 액티브 증강 (직접 발동)"]) {
      expect(APP, `«${s}» 가 없다`).toContain(s);
    }
    expect(APP_CODE, "⚡ 로 된 액티브 표기가 남아 있다").not.toContain("⚡ 액티브");
  });

  it("통일한 글리프가 계열 아이콘과 겹치지 않는다", () => {
    // ✦ 를 찾아 화면을 훑으면 «기타» 계열 필터가 먼저 눈에 들어왔다.
    const at = APP_CODE.indexOf("etc: { label: \"기타\"");
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 60)).not.toContain("✦");
  });

  it("도움말 배지 범례에 액티브 한 줄이 있다", () => {
    // 🕐·게이지·🔒·♻·🎲 는 설명하면서 **가장 많이 보게 되는 배지**만 빠져 있었다.
    const at = APP.indexOf("🕐N국 쿨다운");
    expect(at).toBeGreaterThan(0);
    expect(APP.slice(at - 200, at + 40)).toContain("✦ 액티브");
  });
});

describe("④ 같은 `call` id 의 표시 이름이 하나다", () => {
  it("용어 분류 라벨이 «후로»를 담는다", () => {
    const call = GLOSSARY_GROUPS.find((g) => g.id === "call");
    expect(call?.label).toContain("후로");
  });
});

describe("⑤·⑥ 비표준 표기 두 건", () => {
  it("「펑」이 사용자 문자열에 없다", () => {
    expect(APP_CODE).not.toContain("론·펑·치·깡");
    expect(APP).toContain("다른 자리의 선언(론·치·퐁·깡)을 기다리는 중입니다");
  });

  it("「야쿠」가 사용자 문자열에 없다 — 이 제품은 «역»으로 쓴다", () => {
    // 「야쿠」는 용어집 match 에도 안 걸려 밑줄도 풀이도 안 붙었다.
    expect(APP_CODE).not.toContain("야쿠");
    expect(APP).toContain("(점수·역을 보지 않습니다)");
  });
});

describe("⑦ 화면 크기 단축키를 Alt 로 적는다", () => {
  it("팁이 Ctrl 을 이 게임의 배율 단축키로 말하지 않는다", () => {
    // 실제 단축키는 Alt/⌥ 전용이고(`uiScale.ts` 가 ctrl·meta 면 손을 뗀다),
    // Ctrl+− 는 브라우저 확대라는 **별개의 장치**다.
    const at = APP.indexOf("화면 배치가 겹치거나 어색하면");
    expect(at).toBeGreaterThan(0);
    const tip = APP.slice(at, at + 220);
    expect(tip).toContain("Alt");
    expect(tip).not.toMatch(/Ctrl \+ −\(\+\)로 크기를/);
  });
});

describe("⑧ 되묻는 창의 줄바꿈이 살아난다", () => {
  it("`.confirm-body` 가 pre-line 이다", () => {
    // `\n` 을 넣은 호출부가 둘 있는데(강제 종료 명단·도중유국) 기본값 `normal` 이면
    // 명단과 경고문이 한 덩어리가 된다.
    const at = CSS_CODE.indexOf(".confirm-body {");
    expect(at).toBeGreaterThan(-1);
    const body = CSS_CODE.slice(at, CSS_CODE.indexOf("}", at));
    expect(body).toContain("white-space: pre-line");
  });
});

describe("⑨ 정적 문구의 천단위 콤마가 런타임 표시와 맞는다", () => {
  it("서든데스·모드 설명의 30000 에 콤마가 있다", () => {
    expect(APP_CODE).not.toContain("30000점");
    expect(APP_CODE).not.toContain("1위가 30000");
    expect(APP).toContain("30,000점");
  });

  it("용어 사전의 점수 등급에 콤마가 있다", () => {
    for (const key of ["mangan", "haneman", "baiman", "yakuman"]) {
      const e = byKey.get(key);
      expect(e?.short, `${key} 에 콤마 없는 점수가 남아 있다`).not.toMatch(/\d{4,}/);
    }
    // 리치봉 1,000점도 같은 규칙이다.
    expect(byKey.get("riichi_stick")?.short ?? byKey.get("riichi")?.short ?? "").not.toMatch(/\d{4,}/);
  });

  it("용어 검색이 콤마 유무와 무관하게 찾는다", () => {
    // 「1000점」으로 리치를 찾을 수 있어야 한다는 약속이 placeholder 에 적혀 있다.
    const at = APP_CODE.indexOf("const uncomma");
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE).toContain('placeholder="용어 검색 (예: 후리텐, 1000점)"');
  });

  it("사전 본문에 콤마 없는 4자리 점수가 남아 있지 않다", () => {
    // 주석은 걷는다 — 머리말이 «있지도 않은 20000점» 처럼 옛 표기를 인용한다.
    const bare = [...code(GLOSSARY_SRC).matchAll(/(?<![,\d])\d{4,}(?=점)/g)].map((m) => m[0]);
    expect(bare, `콤마 없는 점수: ${bare.join(" ")}`).toEqual([]);
  });
});

// ═══════════════ 설계 의도가 걸린 건 — 죽은 분기만 ═══════════════

describe("랜딩 규칙 버튼은 되살리지 않고 죽은 분기만 걷는다", () => {
  it("도움말 오버레이의 도달 불가능한 «로그인으로» 가지가 없다", () => {
    // 2026-08-19 사용자 지시로 랜딩에서 규칙 진입점을 **일부러** 뺐다.
    // 그 길을 전제한 분기만 남아 있었다.
    expect(APP_CODE).not.toContain('auth === null ? "← 로그인으로"');
    expect(APP_CODE).toContain('backLabel="← 닫기"');
  });

  it("`AuthScreen` 에 규칙 진입점을 새로 만들지 않았다", () => {
    const at = APP_CODE.indexOf("function AuthScreen");
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 4000)).not.toContain("onOpenHelp");
  });
});
