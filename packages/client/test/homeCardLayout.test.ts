/**
 * 홈 카드 레이아웃 가드 (2026-08-18 사용자 보고).
 *
 * 세 가지가 한꺼번에 드러난 자리다.
 *
 * 1. **잘림** — `.home-top-left`가 오른쪽 증강 카드의 높이에 못 박혀 있었고
 *    (`height: 0; min-height: 100%; overflow: hidden` + `.home-top { min-height: 640px }`),
 *    친구 카드가 들어와 왼쪽이 네 장이 되자 내용 978px이 잠금 640px을 넘겨
 *    338px이 잘려 나갔다. 내 통계가 중간에서 끊기고 리플레이는 통째로 사라졌다.
 * 2. **디자인 없는 입력칸** — `.fb-input`·`.fb-textarea`가 App.tsx에서 쓰이는데
 *    CSS에 규칙이 하나도 없어, 어두운 카드 위에 브라우저 기본 회색 상자가 떴다.
 * 3. **접기** — 왼쪽 열이 길어진 만큼, 지금 안 보는 카드는 접어 둘 수 있어야 한다.
 *
 * 셋 다 "없어도 콘솔은 조용한" 종류라 정적 스캔으로 못을 박는다
 * (이 패키지에는 jsdom이 없다 — onboardingAndLiveness와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");
const STORAGE = readFileSync(join(HERE, "../src/storage.ts"), "utf8");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** 선택자 하나의 선언 블록 */
function rule(selector: string): string {
  const at = CSS_CODE.indexOf(`${selector} {`);
  expect(at, `CSS에 ${selector} 규칙이 없다`).toBeGreaterThanOrEqual(0);
  return CSS_CODE.slice(at, CSS_CODE.indexOf("}", at));
}

// ─────────────────── 1. 왼쪽 열을 자르지 않는다 ───────────────────

describe("홈 왼쪽 열은 카드를 자르지 않는다", () => {
  it("높이 잠금이 없다", () => {
    // 이 세 줄이 함께 서면 넘치는 만큼이 그대로 사라진다.
    const left = rule(".home-top-left");
    expect(left).not.toMatch(/height:\s*0/);
    expect(left).not.toMatch(/min-height:\s*100%/);
    expect(left).not.toMatch(/overflow:\s*hidden/);
  });

  it("행에 최소 높이를 박지 않는다", () => {
    expect(rule(".home-top")).not.toMatch(/min-height:\s*640px/);
  });

  it("두 열이 각자 제 내용만큼 선다", () => {
    // stretch면 증강 기록이 없는 계정에서 오른쪽 카드가 텅 빈 채로 늘어난다.
    expect(rule(".home-top")).toMatch(/align-items:\s*start/);
  });

  it("리플레이 목록만 스스로 상한을 갖는다", () => {
    // 열을 잠그는 대신 목록 안에서 구르게 한다 — 판이 쌓여도 열이 안 길어진다.
    const list = rule(".home-top-left > .home-replays .replay-list");
    expect(list).toMatch(/max-height:\s*\d+px/);
    expect(list).toMatch(/overflow-y:\s*auto/);
  });
});

// ─────────────────── 2. 입력칸에 디자인이 있다 ───────────────────

describe("입력칸은 카드와 같은 톤이다", () => {
  it("`.fb-input`·`.fb-textarea`에 규칙이 있다", () => {
    // 클래스만 붙어 있고 CSS가 없으면 브라우저 기본 회색 상자가 그대로 뜬다.
    expect(CSS_CODE).toContain(".fb-input");
    expect(CSS_CODE).toContain(".fb-textarea");
  });

  it("제보 폼 입력칸과 **같은 규칙**을 쓴다", () => {
    // 따로 베껴 두면 한쪽만 고쳐지고 두 입력칸이 서서히 달라진다.
    const at = CSS_CODE.indexOf(".fb-title,");
    expect(at).toBeGreaterThanOrEqual(0);
    const block = CSS_CODE.slice(at, CSS_CODE.indexOf("}", at));
    expect(block).toContain(".fb-input");
    expect(block).toContain(".fb-textarea");
    expect(block).toMatch(/background:\s*var\(--felt-1\)/);
    expect(block).toMatch(/border:\s*1px solid var\(--line-strong\)/);
  });

  it("포커스가 보인다", () => {
    expect(CSS_CODE).toMatch(/\.fb-input:focus[\s\S]{0,80}border-color:\s*var\(--brass\)/);
  });

  it("친구 추가 단추가 글자 폭을 지킨다", () => {
    // 입력칸이 자리를 다 가져가면 "추 가"로 접힌다. margin도 지워야 줄이 맞는다.
    const btn = rule(".friend-add .lobby-join");
    expect(btn).toMatch(/flex:\s*0 0 auto/);
    expect(btn).toMatch(/white-space:\s*nowrap/);
    expect(btn).toMatch(/margin:\s*0/);
  });
});

// ─────────────────── 3. 접어 둘 수 있다 ───────────────────

describe("홈 카드를 접어 둘 수 있다", () => {
  it("친구·내 통계·리플레이에 접기 단추가 있다", () => {
    for (const id of ['useFold("friends")', 'useFold("mystats")', 'useFold("replays")']) {
      expect(APP_CODE, `${id} 가 없다`).toContain(id);
    }
    expect(APP_CODE).toContain("FoldButton");
  });

  it("접으면 내용이 렌더되지 않는다", () => {
    // display:none 으로 감추기만 하면 안 보이는 목록을 계속 그린다.
    expect(APP_CODE).toMatch(/folded \? null :/);
    expect(APP_CODE).toMatch(/statsFolded \? null :/);
    expect(APP_CODE).toMatch(/replaysFolded \? null :/);
  });

  it("접힘은 localStorage에 남고, 지우는 목록에도 들어 있다", () => {
    expect(APP_CODE).toContain('"majak.homeFolded"');
    // STORAGE_KEYS 에 빠지면 "저장된 상태 지우고 시작"이 처음부터가 아니게 된다.
    expect(STORAGE).toContain('"majak.homeFolded"');
  });

  it("저장은 setState updater 밖에서 한다", () => {
    // updater 안에서 부수효과를 내면 StrictMode 이중 호출에 저장이 어긋난다.
    const at = APP_CODE.indexOf("function useFold");
    expect(at).toBeGreaterThan(0);
    const block = APP_CODE.slice(at, APP_CODE.indexOf("\n}", at));
    expect(block).not.toMatch(/setFolded\(\s*\(prev\)/);
  });

  it("기본은 펼침이다", () => {
    // 처음 온 사람에게 접힌 카드를 보이면 그건 빈 화면이다.
    expect(APP_CODE).toMatch(/useState\(\(\) => readFolded\(\)\[id\] === true\)/);
  });
});

// ─────────────────── 4. 오른쪽은 탭이다 ───────────────────

describe("홈 오른쪽 카드는 탭으로 갈아 끼운다", () => {
  it("탭 다섯 갈래가 있다", () => {
    for (const id of ['"record"', '"meta"', '"feedback"', '"account"', '"admin"']) {
      expect(APP_CODE, `${id} 탭이 없다`).toContain(id);
    }
    expect(APP_CODE).toContain('className="home-tabpanel"');
  });

  it("고른 탭만 렌더한다", () => {
    // 전부 그려 놓고 CSS로 감추면 안 보이는 표·목록을 계속 그린다.
    for (const t of ["record", "meta", "feedback", "account"]) {
      expect(APP_CODE).toContain(`tab === "${t}" ?`);
    }
  });

  it("관리 탭은 관리자에게만 열린다", () => {
    // 탭 목록에서 빠지는 것만으로는 부족하다 — 저장된 값이 "admin"일 수 있다.
    expect(APP_CODE).toContain('tab === "admin" && props.auth.isAdmin');
    expect(APP_CODE).toMatch(/ok\.find\(\(t\) => t === raw\) \?\? "record"/);
  });

  it("고른 탭은 localStorage에 남고, 지우는 목록에도 들어 있다", () => {
    expect(APP_CODE).toContain('"majak.homeTab"');
    expect(STORAGE).toContain('"majak.homeTab"');
  });

  it("패널은 격자로 서고, 짧은 탭에서 상자가 튀지 않는다", () => {
    const panel = rule(".home-tabpanel");
    expect(panel).toMatch(/display:\s*grid/);
    expect(panel).toMatch(/align-content:\s*start/);
    // `.home-top`은 align-items: start다 — 탭 열만 예외로 늘려 높이가 안 튀게 한다.
    expect(rule(".home-tabs")).toMatch(/align-self:\s*stretch/);
  });

  it("규칙·도감은 탭 밖(상단 바)에 있다", () => {
    // 카드 안에만 두면 다른 탭을 보는 사람에게는 없는 문이 된다.
    expect(APP_CODE).toMatch(/home-nav-link"\s+onClick=\{props\.onOpenHelp\}/);
    expect(APP_CODE).toMatch(/home-nav-link"\s+onClick=\{props\.onOpenCodex\}/);
  });

  it("좁은 화면 상단 바 축소는 `.home-nav` 기본 규칙보다 **뒤**에 있다", () => {
    // 앞에 두면 뒤에 오는 기본값이 이겨서 조용히 죽는다(실측 375px, gap 12px).
    const base = CSS_CODE.indexOf(".home-nav {");
    const shrink = CSS_CODE.indexOf(".home-nav { gap: 6px");
    expect(base).toBeGreaterThanOrEqual(0);
    expect(shrink).toBeGreaterThan(base);
  });
});
