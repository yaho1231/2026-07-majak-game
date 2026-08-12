/**
 * docs/28 (2026-08-08 배포 전 감사)에서 확인된 클라이언트 결함 4건의 회귀 가드.
 *
 * 전부 **한 줄만 되돌려도 조용히 되살아나는** 종류다 — 화면은 멀쩡해 보이고,
 * 드래프트 픽 유실은 서버가 대신 골라 주므로 로그에도 안 남는다. 그래서 못을 박는다.
 *
 * 클라를 렌더하지 않는 **정적 소스 스캔**이다 (a11yPerfGuards.test.ts와 같은 방식 —
 * 이 패키지에는 jsdom·testing-library가 없다). 겹침 자체는 실제 브라우저에서
 * 좌표로 재서 확인했고(§2-2·2-3·2-4의 before/after), 여기서는 그 배치를 성립시키는
 * 장치가 사라지지 않았는지만 지킨다.
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

const APP_CODE = code(APP);
const CSS_CODE = code(CSS);

/** `marker` 부터 그 함수가 닫히는 최상위 `\n  }` 까지 */
function fnBody(marker: string): string {
  const start = APP_CODE.indexOf(marker);
  expect(start, `${marker} 를 못 찾았다`).toBeGreaterThan(0);
  const rest = APP_CODE.slice(start);
  const end = rest.indexOf("\n  }");
  expect(end).toBeGreaterThan(0);
  return rest.slice(0, end);
}

// ─────────── §2-5. 전송 실패한 결정을 "보낸 셈" 치지 않는다 ───────────

describe("§2-5 — send()가 실패하면 프롬프트를 그대로 둔다", () => {
  /*
   * resendPolicy.ts ①: action·draftPick 은 VOLATILE 이라 소켓이 닫혀 있으면
   * **큐에 담기지 않고 버려진다**. 그런데도 화면만 "보냈다"로 넘어가면,
   * 드래프트는 카드가 pointer-events:none 으로 잠긴 채 "✓ 선택 완료"가 뜨고
   * (서버는 타임아웃으로 대신 고른다), 액티브 증강 발동은 흔적 없이 사라진다.
   * 계약은 resendPolicy.ts 주석에 적혀 있다 — "프롬프트를 그대로 두어 다시 누를 수 있게".
   */

  it("pickDraft — 전송 실패면 잠그지 않는다", () => {
    const body = fnBody("function pickDraft(");
    expect(body).toContain('if (!send({ type: "draftPick"');
    // 잠금은 반드시 전송 성공 뒤에 온다
    const guard = body.indexOf('if (!send({ type: "draftPick"');
    const lock = body.indexOf("setDraftPicked(true)");
    expect(lock).toBeGreaterThan(guard);
    expect(body.indexOf("draftPickedRef.current = true")).toBeGreaterThan(guard);
  });

  it("submitOption — 전송 실패면 프롬프트를 내리지 않는다", () => {
    const body = fnBody("function submitOption(");
    expect(body).toMatch(/const sent = send\(/);
    expect(body).toContain("if (!sent) return;");
    const guard = body.indexOf("if (!sent) return;");
    expect(body.indexOf("dropPrompt(seat)")).toBeGreaterThan(guard);
  });

  it("send()는 실제 전송 여부를 돌려준다 (호출자가 판단할 수 있게)", () => {
    expect(APP_CODE).toContain("function send(msg: ClientMessage): boolean");
  });
});

// ─────────── §2-3·2-4. 보드가 내 영역·점수판을 덮지 않는다 ───────────

describe("§2-3·2-4 — 중앙 보드는 아래 띠를 침범하지 않는다", () => {
  it("--own-band 를 실측해 --board 의 세로 상한에 넣는다", () => {
    // 띠 변수의 집은 .game-root 다 — .table 안에 다시 선언하면 실측값이 덮인다
    expect(CSS_CODE).toMatch(/\.game-root\s*\{[^}]*--own-band:\s*0px/);
    expect(CSS_CODE).toContain("--board-fit-v:");
    expect(CSS_CODE).toMatch(/--board:\s*min\([^;]*--board-fit-v/);
    // 실측 쪽
    expect(APP_CODE).toContain('root.style.setProperty("--own-band"');
  });

  it("오름패 뱃지 자리는 텐파이가 아니어도 그대로 비워 둔다 (띠가 상수)", () => {
    // 뱃지는 액티브 증강 버튼 옆(.own-top-waits)에 선다. 자리를 안 비워 두면
    // 텐파이가 붙었다 떨어질 때마다 띠가 변해 바닥 타일 크기가 흔들린다("어지럽다").
    expect(APP_CODE).toContain("own-top-waits");
    const start = CSS_CODE.indexOf(".own-top-waits {");
    expect(start).toBeGreaterThan(0);
    const rule = CSS_CODE.slice(start, CSS_CODE.indexOf("}", start));
    expect(rule).toMatch(/min-height:\s*var\(--waits-row-h\)/);
    expect(CSS_CODE).toMatch(/\.game-root\s*\{[^}]*--waits-row-h:/);
    // 비는 자리는 이름표 **위**여야 한다 — 아래에 두면 이름표가 손패에서 떠 버린다
    // (2026-08-12 사용자 보고: "타이머와 내 이름표가 손패보다 한참 위에").
    const topStart = CSS_CODE.indexOf(".own-top {");
    const topRule = CSS_CODE.slice(topStart, CSS_CODE.indexOf("}", topStart));
    expect(topRule).toMatch(/align-items:\s*end/);
  });

  it(".table-center 는 위·아래 띠 사이로 clamp 된다 (46% 못 박기 금지)", () => {
    const start = CSS_CODE.indexOf(".table-center {");
    expect(start).toBeGreaterThan(0);
    const rule = CSS_CODE.slice(start, CSS_CODE.indexOf("}", start));
    expect(rule).toContain("clamp(");
    expect(rule).toContain("--own-band");
    expect(rule).toContain("--top-band");
    // 예전 형태(`top: 46%;`)로 되돌아가지 않게
    expect(rule).not.toMatch(/top:\s*\d+%\s*;/);
  });

  it("브레이크포인트가 --board 세로 상한을 우회하지 않는다", () => {
    // `--board: min(...)` 이 나올 때마다 --board-fit-v 가 들어 있어야 한다
    const decls = CSS_CODE.match(/--board:\s*min\([^;]*;/g) ?? [];
    expect(decls.length).toBeGreaterThanOrEqual(3);
    for (const d of decls) expect(d).toContain("--board-fit-v");
  });

  it("잠깐 뜨는 줄만 위로 자란다 — CSS order 목록과 실측 제외 목록이 같다", () => {
    const TRANSIENT = [".action-bar", ".prompt-timer", ".arm-hint"];
    for (const sel of TRANSIENT) {
      expect(CSS_CODE).toContain(`.own-area > ${sel}`);
    }
    expect(CSS_CODE).toMatch(/\.own-area > \.arm-hint\s*\{\s*order:\s*-1/);
    // App 쪽 실측에서 빼는 목록 — 둘이 어긋나면 띠가 잘못 계산된다
    expect(APP_CODE).toContain('el.matches(".action-bar, .prompt-timer, .arm-hint")');
  });
});

// ─────────── §2-2. 세로 안내가 손패를 덮지 않는다 ───────────

describe("§2-2 — '가로로 돌리세요' 안내", () => {
  it("닫을 수 있다", () => {
    expect(APP_CODE).toContain("rotate-hint-close");
    expect(APP_CODE).toContain("setRotateHintOff(true)");
    expect(APP_CODE).toMatch(/rotateHintOff \? null : \(/);
  });

  it("대국 중에는 손패 쪽이 아니라 위 띠에 붙는다", () => {
    expect(CSS_CODE).toMatch(
      /\.game-root:has\(\.table\) \.rotate-hint\s*\{[^}]*top:\s*calc\(var\(--top-band/,
    );
    // 아래에 못 박혀 있던 옛 형태(inset 한 줄로 bottom 고정)로 되돌아가지 않게
    expect(CSS_CODE).not.toMatch(/\.rotate-hint\s*\{[^}]*inset:\s*auto/);
  });
});

// ─────────── 2026-08-12. 새 판을 시작하면 컷인 중복 기억을 비운다 ───────────

/**
 * 증강 발동 컷인은 `{좌석}:{액션}`을 **순 서명**(`東:1:0:{순}`) 단위로 한 번만 띄운다.
 * 그런데 그 서명에는 판을 가르는 것이 없어서, 판을 다시 시작하면 새 판의 첫 순이
 * 지난 판의 첫 순과 글자까지 같다 — 같은 증강을 같은 순에 또 쓰면 컷인이 통째로
 * 사라졌다(사용자 보고: "조커 — 능력 사용했는데 알림이 안 나옴").
 *
 * 판을 걷어내는 자리마다 `prevViewRef`와 **함께** 비우는 것이 계약이다.
 */
describe("판 전환 — 증강 컷인 중복 기억(fxSeenRef)", () => {
  it("prevViewRef를 비우는 모든 자리에서 함께 비운다", () => {
    const lines = APP_CODE.split("\n");
    const at = lines
      .map((l, i) => (l.includes("prevViewRef.current = null;") ? i : -1))
      .filter((i) => i >= 0);
    expect(at.length).toBeGreaterThan(0);
    for (const i of at) {
      expect(lines[i + 1] ?? "", `${i + 1}번째 줄 뒤`).toContain("resetFxSeen()");
    }
  });
});
