/**
 * uiScale — 자동 맞춤 × 수동 −/+ 배수.
 *
 * 이 패키지에는 jsdom이 없다(a11yPerfGuards.test.ts 참고). uiScale.ts가 건드리는
 * 전역이 몇 개 안 되므로 **손으로 만든 최소 window/document**를 세워 놓고 실제 함수를
 * 돌린다 — 소스 문자열 스캔이 아니라 계산 결과를 본다.
 *
 * 여기서 못 박는 것: 수동 배수가 자동값을 **덮지 않고 곱한다**, 최종 배율이 읽히는
 * 범위를 못 벗어난다, 새 localStorage 키를 쓰고 옛 키는 계속 지운다, 그리고 배율을
 * **무엇으로 거는지**(zoom / transform)를 엔진을 재서 고른다.
 */

import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Uis = typeof import("../src/uiScale.js");

const store = new Map<string, string>();
let cssVars: Record<string, string> = {};
let keyHandlers: ((e: unknown) => void)[] = [];
/** `<html>`에 실제로 쓰인 data-ui-scale-mode. */
let modeAttr: string | null = null;
/** 프로브가 재게 될 `100cqw` — 엔진 흉내. 100 = zoom을 아는 엔진, 200 = 모르는 엔진. */
let probeCq = 100;
/** `CSS.supports("zoom", "2")` 가 참인가. */
let zoomSupported = true;

/** 창 크기·포인터·dpr을 정해 놓고 모듈을 새로 읽어 온다. */
async function boot(opts: {
  w: number;
  h: number;
  fine?: boolean;
  dpr?: number;
  stored?: string;
  /** 프로브가 잴 100cqw (기본 100 = 크로뮴처럼 zoom을 아는 엔진). */
  cq?: number;
  /** `zoom` 자체를 지원하는가 (기본 참). */
  zoom?: boolean;
}): Promise<Uis> {
  store.clear();
  if (opts.stored !== undefined) store.set("majak.uiZoom", opts.stored);
  cssVars = {};
  keyHandlers = [];
  modeAttr = null;
  probeCq = opts.cq ?? 100;
  zoomSupported = opts.zoom ?? true;
  const fine = opts.fine ?? true;
  const win = {
    innerWidth: opts.w,
    innerHeight: opts.h,
    devicePixelRatio: opts.dpr ?? 1,
    matchMedia: (q: string) => ({ matches: q.includes("pointer: fine") ? fine : false }),
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    },
    addEventListener: (type: string, fn: (e: unknown) => void) => {
      if (type === "keydown") keyHandlers.push(fn);
    },
  };
  vi.stubGlobal("window", win);
  // 배율 방식 프로브가 쓰는 만큼만 세운다: createElement → appendChild → offsetWidth.
  vi.stubGlobal("document", {
    body: {
      style: { setProperty: (k: string, v: string) => void (cssVars[k] = v) },
      appendChild: () => {},
    },
    documentElement: {
      setAttribute: (k: string, v: string) => void (k === "data-ui-scale-mode" && (modeAttr = v)),
    },
    createElement: () => ({
      setAttribute: () => {},
      appendChild: () => {},
      remove: () => {},
      get offsetWidth(): number {
        return probeCq;
      },
    }),
  });
  vi.stubGlobal("CSS", { supports: (p: string) => (p === "zoom" ? zoomSupported : true) });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe(): void {}
    },
  );
  vi.stubGlobal("HTMLElement", class {});
  vi.resetModules();
  const mod: Uis = await import("../src/uiScale.js");
  mod.startUiScale();
  return mod;
}

/** body에 실제로 쓰인 --ui-scale (getUiScale()과 같아야 한다). */
function appliedScale(): number {
  return Number(cssVars["--ui-scale"]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("자동 맞춤은 그대로다", () => {
  it("기준 창(1100×680) 이상이면 1", async () => {
    const m = await boot({ w: 1440, h: 900 });
    expect(m.getUiScale()).toBe(1);
    expect(appliedScale()).toBe(1);
  });

  it("좁은 창은 줄인다 (소수 둘째 자리로 끊는다)", async () => {
    // 990/1100 = 0.9 → 가상 뷰포트 1100×756, CRAMPED(900×620) 위라 그대로 적용
    const m = await boot({ w: 990, h: 680 });
    expect(m.getUiScale()).toBe(0.9);
  });

  it("마우스가 없는 기기는 손대지 않는다", async () => {
    const m = await boot({ w: 400, h: 800, fine: false });
    expect(m.getUiScale()).toBe(1);
  });
});

describe("수동 배수는 자동값을 덮지 않고 곱한다", () => {
  it("자동 1인 창에서 +는 그대로 배수가 된다", async () => {
    const m = await boot({ w: 1440, h: 900 });
    expect(m.stepUiZoom(1)).toBe(true);
    expect(m.getUiZoom()).toBe(1.1);
    expect(m.getUiScale()).toBeCloseTo(1.1, 5);
    expect(appliedScale()).toBeCloseTo(1.1, 5);
  });

  it("자동으로 줄어든 창에서는 그 값에 곱해진다", async () => {
    const m = await boot({ w: 990, h: 680 }); // 자동 0.9
    m.setUiZoom(1.2);
    expect(m.getUiScale()).toBeCloseTo(0.9 * 1.2, 3);
  });

  it("−는 자동값 아래로 내려간다 (넓은 창)", async () => {
    const m = await boot({ w: 1440, h: 900 });
    m.stepUiZoom(-1);
    expect(m.getUiScale()).toBeCloseTo(0.9, 5);
  });

  it("기본값으로 되돌리면 자동값만 남는다", async () => {
    const m = await boot({ w: 990, h: 680 });
    m.setUiZoom(1.4);
    expect(m.resetUiZoom()).toBe(true);
    expect(m.getUiZoom()).toBe(1);
    expect(m.getUiScale()).toBe(0.9);
  });
});

describe("고를 수 있는 칸은 전부 화면을 움직인다 (막다른 칸 없음)", () => {
  it("자동이 이미 하한(0.6)이면 −가 꺼진다", async () => {
    // 660/1100 = 0.6 → 가상 뷰포트 1100×1033 (CRAMPED 위)
    const m = await boot({ w: 660, h: 620 });
    expect(m.getUiScale()).toBe(0.6);
    expect(m.canStepUiZoom(-1)).toBe(false);
    expect(m.stepUiZoom(-1)).toBe(false);
    expect(m.getUiScale()).toBe(0.6);
    // 그래도 +는 살아 있어야 한다 — 양쪽이 다 막히면 갇힌다
    expect(m.canStepUiZoom(1)).toBe(true);
    expect(m.stepUiZoom(1)).toBe(true);
    expect(m.getUiScale()).toBeGreaterThan(0.6);
  });

  it("사다리 끝에서는 더 못 간다", async () => {
    const m = await boot({ w: 1440, h: 900 });
    m.setUiZoom(2);
    expect(m.canStepUiZoom(1)).toBe(false);
    expect(m.stepUiZoom(1)).toBe(false);
    m.setUiZoom(0.6);
    expect(m.canStepUiZoom(-1)).toBe(false);
  });

  it("상한 2.0을 넘겨 달라고 해도 2.0에서 멈춘다", async () => {
    const m = await boot({ w: 1440, h: 900 });
    m.setUiZoom(9);
    expect(m.getUiZoom()).toBe(2);
    expect(m.getUiScale()).toBeLessThanOrEqual(2);
  });

  it("어느 창에서든 −/+ 를 눌러 봐도 배율이 [0.6, 2.0] 밖으로 안 나간다", async () => {
    for (const [w, h] of [[1920, 1080], [1440, 900], [1100, 680], [990, 680], [660, 620]] as const) {
      const m = await boot({ w, h });
      for (const dir of [-1, 1] as const) {
        for (let i = 0; i < 14; i++) m.stepUiZoom(dir);
        expect(m.getUiScale(), `${w}×${h} dir=${dir}`).toBeGreaterThanOrEqual(0.6);
        expect(m.getUiScale(), `${w}×${h} dir=${dir}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("작은 창에서 잠깐 당겨져도 저장된 취향은 안 잃는다", async () => {
    // 큰 모니터에서 140%로 맞춰 둔 사람이 작은 창을 열었다 (자동 0.6 → 최대 2.0/0.6 = 3.3,
    // 즉 1.4도 그대로 고를 수 있다). 반대로 70%를 저장해 둔 사람은 당겨진다.
    const m = await boot({ w: 660, h: 620, stored: "0.7" });
    expect(m.getUiZoom()).toBe(1); // 이 창에서는 70%를 고를 수 없다 → 당겨서 보여 준다
    expect(m.getUiScale()).toBe(0.6);
    // 저장값은 그대로 — 넓은 창으로 돌아가면 다시 70%다
    expect(store.get("majak.uiZoom")).toBe("0.7");
    const wide = await boot({ w: 1440, h: 900, stored: "0.7" });
    expect(wide.getUiZoom()).toBe(0.7);
  });
});

describe("좌표 변환이 최종 배율 하나만 본다", () => {
  it("toLayoutPx·layoutViewport가 수동 배수까지 반영한다", async () => {
    const m = await boot({ w: 1440, h: 900 });
    m.setUiZoom(1.2);
    const s = m.getUiScale();
    expect(s).toBeCloseTo(1.2, 5);
    // 화면 좌표 600px → 레이아웃 좌표 500px. 여기가 어긋나면 패 드래그가 밀린다.
    expect(m.toLayoutPx(600)).toBeCloseTo(600 / s, 5);
    expect(m.layoutViewport().w).toBeCloseTo(1440 / s, 5);
  });
});

describe("저장", () => {
  it("새 키에 저장하고 다음 부팅에 살아난다", async () => {
    const m = await boot({ w: 1440, h: 900 });
    m.setUiZoom(1.3);
    expect(store.get("majak.uiZoom")).toBe("1.3");
    // 같은 저장값으로 다시 부팅
    const m2 = await boot({ w: 1440, h: 900, stored: "1.3" });
    expect(m2.getUiZoom()).toBe(1.3);
  });

  it("기본값이면 키를 남기지 않는다 (다음에 자동에 맡긴다)", async () => {
    const m = await boot({ w: 1440, h: 900, stored: "1.3" });
    m.resetUiZoom();
    expect(store.has("majak.uiZoom")).toBe(false);
  });

  it("옛 키(majak.uiScale)는 계속 지우고, 재활용하지 않는다", async () => {
    store.set("majak.uiScale", "0.5");
    const m = await boot({ w: 1440, h: 900 });
    // boot()이 store를 비우므로 다시 넣고 재부팅한다
    store.set("majak.uiScale", "0.5");
    m.startUiScale();
    expect(store.has("majak.uiScale")).toBe(false);
    expect(m.getUiZoom()).toBe(1);
  });

  it("망가진 저장값은 무시한다", async () => {
    const m = await boot({ w: 1440, h: 900, stored: "abc" });
    expect(m.getUiZoom()).toBe(1);
  });
});

describe("단축키는 브라우저 확대와 겹치지 않는다", () => {
  let mod: Uis;
  beforeEach(async () => {
    mod = await boot({ w: 1440, h: 900 });
  });

  function press(e: Record<string, unknown>): void {
    const ev = { altKey: false, ctrlKey: false, metaKey: false, target: null, preventDefault() {}, ...e };
    keyHandlers.forEach((fn) => fn(ev));
  }

  it("Alt + = / − / 0 으로 움직인다", () => {
    press({ altKey: true, code: "Equal" });
    expect(mod.getUiZoom()).toBe(1.1);
    press({ altKey: true, code: "Minus" });
    press({ altKey: true, code: "Minus" });
    expect(mod.getUiZoom()).toBe(0.9);
    press({ altKey: true, code: "Digit0" });
    expect(mod.getUiZoom()).toBe(1);
  });

  it("Ctrl/⌘ + = 는 건드리지 않는다 (브라우저 확대는 브라우저 것)", () => {
    press({ altKey: true, ctrlKey: true, code: "Equal" });
    press({ altKey: true, metaKey: true, code: "Equal" });
    press({ code: "Equal" });
    expect(mod.getUiZoom()).toBe(1);
  });
});

/**
 * 배율을 zoom으로 걸지 transform으로 걸지 — `zoom` 지원 여부만 보면 안 된다.
 *
 * WebKit(사파리)은 `zoom`을 지원하면서 **cq 단위를 컨테이너의 화면 크기로 푼다**.
 * styles.css는 화면 비례 길이를 전부 cq로 쓰므로, 그 엔진에서 zoom을 걸면 판 전체가
 * 배율만큼 작아진 채 창 위쪽에 붙는다 (2026-08-19 사용자 보고 · WebKit 26.5 실측:
 * 1905×985 배율 0.7에서 `.game-root` 가 1905×690).
 */
describe("배율을 무엇으로 거는가", () => {
  it("cq 단위가 zoom을 아는 엔진(크로뮴)은 zoom", async () => {
    // zoom 2인 100px 컨테이너 안의 100cqw = 100 (레이아웃 px)
    await boot({ w: 1440, h: 900, cq: 100 });
    expect(modeAttr).toBe("zoom");
  });

  it("cq 단위가 zoom을 무시하는 엔진(WebKit)은 transform", async () => {
    // 같은 자리에서 200 (화면 px)이 나온다 → zoom과 cq가 어긋난다
    await boot({ w: 1440, h: 900, cq: 200 });
    expect(modeAttr).toBe("transform");
  });

  it("`zoom` 자체가 없으면 transform (Firefox 125 이하)", async () => {
    await boot({ w: 1440, h: 900, zoom: false, cq: 100 });
    expect(modeAttr).toBe("transform");
  });

  it("배율이 1이어도 표식은 붙는다 — 나중에 −/+ 를 눌러도 걸려야 한다", async () => {
    const m = await boot({ w: 1920, h: 1080, cq: 100 });
    expect(m.getUiScale()).toBe(1);
    expect(modeAttr).toBe("zoom");
  });
});

describe("styles.css가 그 표식만 보고 갈래를 고른다", () => {
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

  /** `<선택자> { … }` 한 덩어리를 꺼낸다 (중첩 없는 평범한 규칙 전용). */
  function ruleBody(selector: string): string {
    const at = css.indexOf(selector + " {");
    expect(at, `${selector} 규칙이 없다`).toBeGreaterThan(-1);
    const open = css.indexOf("{", at);
    return css.slice(open + 1, css.indexOf("}", open));
  }

  it("맨 body에는 zoom을 걸지 않는다 (표식 없이 걸리면 WebKit에서 판이 깨진다)", () => {
    expect(ruleBody("body")).not.toMatch(/zoom:/);
  });

  it("zoom 갈래는 zoom만 걸고 크기는 100% 그대로 둔다", () => {
    // 퍼센트는 zoom 아래에서 자기 단위로 풀린다 — 여기서 또 나누면 배율이 제곱된다.
    const body = ruleBody('html[data-ui-scale-mode="zoom"] body');
    expect(body).toMatch(/zoom:\s*var\(--ui-scale, 1\)/);
    expect(body).not.toMatch(/calc\(100% \/ var\(--ui-scale/);
  });

  it("transform 갈래는 배율만큼 상자를 키우고 transform으로 줄인다", () => {
    const body = ruleBody('html[data-ui-scale-mode="transform"] body');
    expect(body).toMatch(/width:\s*calc\(100% \/ var\(--ui-scale, 1\)\)/);
    expect(body).toMatch(/height:\s*calc\(100% \/ var\(--ui-scale, 1\)\)/);
    expect(body).toMatch(/transform:\s*scale\(var\(--ui-scale, 1\)\)/);
    expect(body).toMatch(/transform-origin:\s*0 0/);
  });

  it("가상 뷰포트를 재는 컨테이너는 그대로 body다", () => {
    expect(ruleBody("body")).toMatch(/container:\s*ui \/ size/);
  });
});
