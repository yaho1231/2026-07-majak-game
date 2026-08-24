/**
 * 접근성 회귀 가드 (감사 2026-08-17 §6 대응분).
 *
 * 이 묶음이 특히 조용하다. 키보드로 못 누르는 버튼도 마우스로는 멀쩡히 눌리고,
 * 이름 없는 스위치도 눈으로는 무엇인지 보이고, 탭 순서에 남은 게임판도 화면에는
 * 안 보인다. **쓰는 사람이 아니면 아무도 눈치채지 못한다** — 그래서 못을 박는다.
 *
 * 정적 소스 스캔이다(이 패키지에는 jsdom이 없다 — a11yPerfGuards와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");
const UISCALE = readFileSync(join(HERE, "../src/uiScale.ts"), "utf8");

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);

// ─────────────── 6-1 · 6-9 키보드로 누를 수 있는가 ───────────────

describe("마우스 없이도 누를 수 있다", () => {
  it("role=button 을 붙이는 자리는 clickableProps 를 쓴다", () => {
    /*
     * `role="button"` + `onClick` 만 붙이면 스크린리더는 "버튼"이라고 읽어 주는데
     * **포커스가 가지 않아 누를 수가 없다** — 아무것도 안 붙인 것보다 나쁘다.
     * 헬퍼 하나로 role·tabIndex·click·키를 함께 준다.
     */
    const at = APP_CODE.indexOf("function clickableProps(");
    expect(at).toBeGreaterThan(0);
    // 헬퍼 **바깥**에 손으로 쓴 role:"button" 이 남아 있으면 안 된다.
    // (헬퍼 안에는 반환 타입과 객체 리터럴 두 곳에 정당하게 등장한다.)
    const outside = APP_CODE.slice(0, at) + APP_CODE.slice(at + 1200);
    const stray = [...outside.matchAll(/role:\s*"button"/g)].length;
    expect(stray, 'clickableProps 를 거치지 않은 role:"button" 이 있다').toBe(0);
    expect([...APP_CODE.matchAll(/clickableProps\(/g)].length).toBeGreaterThanOrEqual(4);
  });

  it("헬퍼가 Enter 와 Space 를 모두 받는다", () => {
    const at = APP_CODE.indexOf("function clickableProps(");
    const block = APP_CODE.slice(at, at + 900);
    expect(block).toContain('e.key === "Enter"');
    expect(block).toContain('e.key === " "');
    // Space 는 기본 동작이 스크롤이다 — 안 막으면 누를 때마다 판이 튄다.
    expect(block).toContain("preventDefault");
    expect(block).toContain("tabIndex: 0");
  });
});

// ─────────────── 6-2 · 6-5 오버레이 ───────────────

describe("오버레이가 뒤 화면을 진짜로 덮는다", () => {
  it("전체 오버레이는 ScreenOverlay 를 쓴다 (맨손 div 금지)", () => {
    // 맨손 div 면 뒤의 게임판이 탭 순서에 남는다 — 도감에서 Tab 을 계속 누르면
    // 보이지 않는 손패 버튼에 닿고, Enter 를 누르면 그대로 타패가 나갔다.
    expect(APP_CODE).not.toContain('<div className="screen-overlay">');
    expect(APP_CODE).toContain("function ScreenOverlay(");
  });

  it("inert 로 뒤를 비활성화하고, 닫을 때 되돌린다", () => {
    const at = APP_CODE.indexOf("function ScreenOverlay(");
    const block = APP_CODE.slice(at, at + 2200);
    expect(block).toContain('setAttribute("inert"');
    expect(block).toContain('removeAttribute("inert")');
    // 이미 inert 인 형제는 건드리지 않는다 — 겹쳐 뜬 오버레이의 뒤를 되살리면 안 된다.
    expect(block).toContain('hasAttribute("inert")');
  });

  it("aria-modal · Esc · 포커스 복귀를 갖춘다", () => {
    const at = APP_CODE.indexOf("function ScreenOverlay(");
    const block = APP_CODE.slice(at, at + 2400);
    expect(block).toContain('aria-modal="true"');
    expect(block).toContain('e.key !== "Escape"');
    expect(block).toContain("restore?.focus");
  });

  it("비모달 패널에는 aria-modal 을 붙이지 않는다", () => {
    // 판은 뒤에서 계속 돌고 결정 타이머도 흐른다 — "뒤는 없는 셈"이라고 말하면 거짓이다.
    const settings = APP_CODE.indexOf('aria-label="설정"');
    const log = APP_CODE.indexOf('aria-label="기록"');
    for (const at of [settings, log]) {
      expect(at).toBeGreaterThan(0);
      expect(APP_CODE.slice(at - 400, at + 400)).not.toContain("aria-modal");
    }
  });
});

// ─────────────── 6-3 알림 ───────────────

describe("차례를 보조기술에도 알린다", () => {
  it("내 차례·쯔모가 live region 으로 나간다", () => {
    // 예전에는 live region 이 연출 큐 하나뿐이라, 가장 자주 알아야 할 두 가지가 빠져 있었다.
    expect(APP_CODE).toContain("turnAnnounce");
    const at = APP_CODE.indexOf("const turnAnnounce");
    const block = APP_CODE.slice(at, at + 400);
    expect(block).toContain("내 차례입니다");
    expect(block).toContain("쯔모");
  });

  it("같은 문장을 반복해 읽지 않게 메모한다", () => {
    const at = APP_CODE.indexOf("const turnAnnounce");
    expect(APP_CODE.slice(at, at + 120)).toContain("useMemo");
  });
});

// ─────────────── 6-4 확대 ───────────────

describe("브라우저 확대를 자동 맞춤이 되돌리지 않는다", () => {
  /*
   * 확대 z 는 CSS 픽셀 창을 정확히 1/z 로 줄인다 → 자동 맞춤이 배율을 1/z 로 낮추면
   * 요구한 확대가 **정확히 상쇄된다**(Ctrl+ 를 눌러도 아무 일이 없다, WCAG 1.4.4 위반).
   * 그래서 z 를 도로 곱한다.
   *
   * ⚠ 예전에는 "이 사람은 확대를 쓴다"를 localStorage 에 적어 두고 자동 맞춤을
   *   **통째로 껐다.** 한 번 붙으면 안 떨어져 창이 무엇이든 배율이 1로 굳었다
   *   (2026-08-24 사용자 보고 · docs/42 §6). 저장하는 방식으로 되돌리면 안 된다.
   */
  it("확대를 상쇄하지 않고 그 위에 곱한다", () => {
    expect(UISCALE).toContain("function browserZoomFactor");
    expect(UISCALE).toContain("devicePixelRatio");
    expect(UISCALE).toMatch(/fit \* browserZoomFactor\(\)/);
  });

  it("자동 맞춤을 끄는 상태를 저장하지 않는다 (굳는 자리를 만들지 않는다)", () => {
    expect(UISCALE).not.toMatch(/setItem\(\s*ZOOMED_KEY/);
    expect(UISCALE).not.toContain("zoomedInSticky");
    // 이미 붙어 있는 사람이 있으므로 옛 표식은 부팅 때 지운다
    expect(UISCALE).toContain('const LEGACY_ZOOMED_KEY = "majak.browserZoomed"');
  });
});

// ─────────────── 6-6 · 6-7 · 6-8 · 6-10 이름과 상태 ───────────────

describe("눈으로만 알 수 있는 것을 이름에도 싣는다", () => {
  it("설정 스위치에 접근 가능한 이름이 있다", () => {
    // 버튼 내용이 빈 span 이고 감싼 label 은 button 에 이름을 주지 못한다 →
    // 예전에는 "스위치, 켬" 만 읽혔다.
    const at = APP_CODE.indexOf('role="switch"');
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 400)).toContain("aria-label={r.label}");
  });

  it("손패가 잠김·쯔모·위험·봉인을 이름으로 말한다", () => {
    expect(APP_CODE).toContain("방금 쯔모");
    expect(APP_CODE).toContain("봉인됨");
    expect(APP_CODE).toContain("지금 버릴 수 없음");
    // 잠긴 패도 포커스는 받아야 한다 — 왜 못 버리는지 읽을 수 있어야 하므로.
    expect(APP_CODE).toContain("aria-disabled={!clickable}");
  });

  it("남은 패 수가 무엇의 수인지 말한다", () => {
    expect(APP_CODE).toContain("패산에 남은 패");
  });

  it("손패 미리보기가 포커스에도 뜬다", () => {
    // 증강 pill·액션 메뉴는 onFocus 를 짝으로 달았는데 손패만 빠져 있었다.
    expect(APP_CODE).toContain("onFocus={() => setHoverId(id)}");
    expect(APP_CODE).toContain("onBlur={() => setHoverId(");
  });
});

// ─────────────── 6-11 · 6-12 터치 ───────────────

describe("터치에서 잃는 것이 없다", () => {
  it("손패 위에서도 핀치 확대가 된다", () => {
    // `touch-action: none` 이 두 손가락 확대까지 막아, 저시력 사용자가 자기 패를
    // 키우려는 동작이 하필 손패 위에서만 통하지 않았다.
    const at = CSS.indexOf(".hand-tile {");
    expect(at).toBeGreaterThan(0);
    const block = CSS.slice(at, at + 700);
    expect(block).toContain("touch-action: pinch-zoom");
    expect(block).not.toMatch(/touch-action:\s*none/);
  });

  it("세로 안내가 태블릿 세로까지 덮는다", () => {
    // 상한이 560px 이라 iPad 세로(768)가 안내에도 좁은 배치에도 안 걸렸다 → 900px.
    // ⚠ 크기는 **가상 뷰포트**(@container ui)로 잰다. 실제 창(@media)으로 재면
    //   배율이 1이 아닐 때 둘이 어긋나, 안내가 보드를 밀어내는 보정만 빠지고
    //   안내는 그대로 떠서 보드를 도로 덮는다 (2026-08-24 모바일 QA · docs/43 §4).
    expect(CSS).toMatch(/@media \(orientation: portrait\) and \(pointer: coarse\)/);
    expect(CSS).toMatch(/@container ui \(max-width: 900px\)/);
    // 크기로 배치를 가르는 @media 는 이 파일에 하나도 남아 있으면 안 된다
    expect(code(CSS)).not.toMatch(/@media \([^)]*(?:max|min)-(?:width|height):/);
  });
});
