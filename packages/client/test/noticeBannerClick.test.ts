/**
 * 공지 띠를 펼치는 과녁 회귀 가드.
 *
 * "자세히 ▾"만 과녁이던 시절, 사람들은 제목을 눌러 놓고 아무 일도 안 일어난다고
 * 여겼다 — 특히 손가락으로 누르는 기기에서 그 알약은 너무 작다. 이제 **머리줄
 * 전체**가 과녁이다.
 *
 * 함께 못을 박는 것: 머리줄 안에 `<button>` 을 되살리면 클릭이 부모까지 올라가
 * 두 번 세어지고, 펼치자마자 접힌다. 그래서 "자세히 ▾"는 `<span>` 이어야 한다.
 *
 * 정적 소스 스캔이다(이 패키지에는 jsdom이 없다 — a11yBatchF와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");

function noticeBanner(): string {
  const at = APP.indexOf("function NoticeBanner(");
  expect(at).toBeGreaterThan(0);
  const end = APP.indexOf("\n}\n", at);
  expect(end).toBeGreaterThan(at);
  return APP.slice(at, end);
}

describe("공지 띠는 어디를 눌러도 펼쳐진다", () => {
  it("머리줄 자체가 눌리는 자리다 (clickableProps)", () => {
    const src = noticeBanner();
    expect(src).toMatch(/notice-head-clickable/);
    expect(src).toMatch(/clickableProps\(toggle/);
  });

  it("본문이 없으면 아무것도 안 열리므로 과녁도 없다", () => {
    const src = noticeBanner();
    // hasBody 일 때만 clickableProps 를 펼친다.
    expect(src).toMatch(/hasBody\s*\?\s*\{\s*\.\.\.clickableProps\(toggle/);
  });

  it("머리줄 안에 버튼을 되살리지 않는다 (클릭이 두 번 세어진다)", () => {
    const src = noticeBanner();
    expect(src).not.toMatch(/<button/);
  });

  it("펼침 여부를 스크린리더에도 알린다", () => {
    expect(noticeBanner()).toMatch(/"aria-expanded":\s*open/);
  });

  it("누를 수 있게 보이고, 키보드 포커스도 보인다", () => {
    expect(CSS).toMatch(/\.notice-head-clickable\s*\{[^}]*cursor:\s*pointer/);
    expect(CSS).toMatch(/\.notice-head-clickable:focus-visible/);
  });
});

/**
 * 서는 자리 회귀 가드.
 *
 * 홈 맨 위(로고 줄보다 위)에 있던 시절, 띠는 화면 꼭대기 여백에 얇게 얹혀 있어서
 * 있어도 못 보고 없어져도 몰랐다(2026-08-19 사용자 보고). 지금은 **누르러 오는 것
 * 바로 위** — 대국 카드 위다.
 */
describe("공지 띠가 서는 자리", () => {
  it("홈에서는 대국 카드 바로 위에 선다", () => {
    const col = APP.indexOf('className="home-top-left"');
    expect(col).toBeGreaterThan(0);
    const play = APP.indexOf('className="home-card home-play"', col);
    expect(play).toBeGreaterThan(col);
    const banner = APP.indexOf("<NoticeBanner", col);
    expect(banner).toBeGreaterThan(col);
    expect(banner).toBeLessThan(play);
  });

  it("홈 맨 위(상태 줄 위)로 되돌아가지 않는다", () => {
    const home = APP.indexOf('<div className="home">');
    expect(home).toBeGreaterThan(0);
    const bar = APP.indexOf("<header", home);
    const banner = APP.indexOf("<NoticeBanner", home);
    expect(bar).toBeGreaterThan(home);
    expect(banner).toBeGreaterThan(bar);
  });

  it("왼쪽 열 안에서는 아래 여백을 열의 gap에 맡긴다", () => {
    expect(CSS).toMatch(/\.home-top-left\s*>\s*\.notice-banner\s*\{[^}]*margin:\s*0/);
  });
});

/**
 * 인게임 전역 공지가 서는 자리 (2026-08-23 사용자 보고).
 *
 * 처음 판 위에 얹었을 때는 화면 맨 위를 좌우로 가로지르는 띠였다 — 맞은편 자리·도라
 * 표시·모드 배지가 있는 상단 줄이 통째로 가려졌다. 공지는 한 번 읽으면 끝이고 판은
 * 계속 봐야 하는 것이라, 왼쪽 위 귀퉁이의 좁은 카드로 세운다.
 */
describe("인게임 공지는 왼쪽 위 귀퉁이만 쓴다", () => {
  function gameNotice(): string {
    const at = APP.indexOf("function GameNoticeBanner(");
    expect(at).toBeGreaterThan(0);
    const end = APP.indexOf("\n}\n", at);
    expect(end).toBeGreaterThan(at);
    return APP.slice(at, end);
  }

  it("좌우로 가로지르던 띠로 되돌아가지 않는다", () => {
    const src = gameNotice();
    expect(src).toMatch(/game-notice-float/);
    // `right: 0` + `left: 0` 조합이 곧 «상단 전체를 가리는 띠»다
    expect(src).not.toMatch(/right:\s*0/);
    expect(src).not.toMatch(/left:\s*0/);
  });

  it("모드·봇 배지 아래에서 시작한다 (배지와 겹치지 않는다)", () => {
    // 배지는 판 컨테이너 안의 absolute라 fixed인 이 카드와 서로 밀어내지 못한다.
    const off = /const NOTICE_TOP_OFFSET = (\d+);/.exec(APP);
    expect(off).not.toBeNull();
    // 봇 난이도 배지가 top 60에서 시작해 ≈90에서 끝난다
    expect(Number(off?.[1])).toBeGreaterThanOrEqual(92);
  });

  /*
   * **판 위의 공지는 ✕로 내릴 수 있다** (2026-08-23 사용자 지시).
   *
   * 홈·로그인 배너에는 닫기가 없다 — 거기서는 아무것도 가리지 않는다. 판 위는
   * 왼쪽 위를 30~40분 내내 덮고 있어서 사정이 다르다.
   *
   * 닫은 표식은 그 공지 한 건(제목·본문·수정 시각)에만 붙는다. 공지가 바뀌면 키가
   * 달라져 다시 뜬다 — 「점검 5분 전」이 옛 닫기 때문에 안 보이면 안 된다.
   */
  it("닫기 단추가 있다", () => {
    const src = gameNotice();
    expect(src).toMatch(/className="notice-close"/);
    expect(src).toMatch(/aria-label="공지 닫기"/);
  });

  it("닫은 표식은 공지 한 건에만 붙는다 (제목·본문·수정 시각)", () => {
    const src = gameNotice();
    expect(src).toMatch(/notice\.title/);
    expect(src).toMatch(/notice\.body/);
    expect(src).toMatch(/notice\.updatedAt/);
    expect(src).toMatch(/setDismissed\(key\)/);
    expect(src).toMatch(/dismissed === key/);
  });

  it("단추는 공지 띠 밖에 선다 (띠 안이면 클릭이 두 번 세어진다)", () => {
    const src = gameNotice();
    const btn = src.indexOf("notice-close");
    const banner = src.indexOf("<NoticeBanner");
    expect(btn).toBeGreaterThan(0);
    expect(banner).toBeGreaterThan(btn);
    // CSS가 머리줄에 ✕ 자리를 비워 둔다
    expect(CSS).toMatch(/\.game-notice-float\s*>\s*\.notice-banner\s+\.notice-head\s*\{[^}]*padding-right/);
  });

  it("홈·로그인 배너에는 닫기가 없다", () => {
    expect(noticeBanner()).not.toMatch(/notice-close/);
  });

  it("폭은 화면이 좁아도 넘치지 않는다 (cqw 규약)", () => {
    const rule = /\.game-notice-float\s*\{([^}]*)\}/.exec(CSS);
    expect(rule).not.toBeNull();
    expect(rule?.[1]).toMatch(/width:\s*min\(/);
    expect(rule?.[1]).toMatch(/cqw/);
    expect(rule?.[1]).not.toMatch(/\bvw\b/);
  });
});
