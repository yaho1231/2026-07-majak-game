/**
 * uiScale — 자동 맞춤(transform) × 수동 크기 배수(--ui-mag).
 *
 * 이 패키지에는 jsdom이 없다(a11yPerfGuards.test.ts 참고). uiScale.ts가 건드리는
 * 전역이 몇 개 안 되므로 **손으로 만든 최소 window/document**를 세워 놓고 실제 함수를
 * 돌린다 — 소스 문자열 스캔이 아니라 계산 결과를 본다.
 *
 * 여기서 못 박는 것(2026-08-12 모델):
 *  · 수동 배수는 **transform 에 곱해지지 않는다** — --ui-scale 은 자동값 하나뿐이다.
 *    (곱해 두면 판·손패가 1px도 안 커지면서 고정 px만 뭉갠다. 그게 옛 모델의 버그였다.)
 *  · 수동 배수는 --ui-mag 로 따로 나가고, 좌표 변환(toLayoutPx)은 그걸 보지 않는다.
 *  · 사다리는 창과 무관하다 — 어느 창에서든 같은 칸을 고를 수 있다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Uis = typeof import("../src/uiScale.js");

const store = new Map<string, string>();
let cssVars: Record<string, string> = {};
let keyHandlers: ((e: unknown) => void)[] = [];

/** 창 크기·포인터·dpr을 정해 놓고 모듈을 새로 읽어 온다. */
async function boot(opts: {
  w: number;
  h: number;
  fine?: boolean;
  dpr?: number;
  stored?: string;
}): Promise<Uis> {
  store.clear();
  if (opts.stored !== undefined) store.set("majak.uiZoom", opts.stored);
  cssVars = {};
  keyHandlers = [];
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
  vi.stubGlobal("document", {
    body: { style: { setProperty: (k: string, v: string) => void (cssVars[k] = v) } },
    documentElement: {},
  });
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

/** body에 실제로 쓰인 --ui-mag (styles.css의 크기 토큰들이 곱하는 수). */
function appliedMag(): number {
  return Number(cssVars["--ui-mag"]);
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

describe("수동 배수는 transform 에 곱해지지 않는다 (뭉개짐 없음)", () => {
  it("+ 를 눌러도 --ui-scale 은 자동값 그대로다", async () => {
    const m = await boot({ w: 1440, h: 900 });
    expect(m.stepUiZoom(1)).toBe(true);
    expect(m.getUiZoom()).toBe(1.1);
    // 여기가 핵심 — 예전에는 1.1이 되면서 body 전체가 컴포지터 확대로 뭉갰다
    expect(m.getUiScale()).toBe(1);
    expect(appliedScale()).toBe(1);
    expect(appliedMag()).toBeCloseTo(1.1, 5);
  });

  it("자동으로 줄어든 창에서도 두 값은 따로 논다", async () => {
    const m = await boot({ w: 990, h: 680 }); // 자동 0.9
    m.setUiZoom(1.4);
    expect(m.getUiScale()).toBe(0.9);
    expect(appliedScale()).toBe(0.9);
    expect(appliedMag()).toBeCloseTo(1.4, 5);
  });

  it("최대 확대에서도 body 배율은 1을 넘지 않는다", async () => {
    const m = await boot({ w: 1920, h: 1080 });
    m.setUiZoom(1.6);
    expect(m.getUiScale()).toBe(1);
    expect(appliedMag()).toBeCloseTo(1.6, 5);
  });

  it("기본값으로 되돌리면 배수가 1이 된다", async () => {
    const m = await boot({ w: 990, h: 680 });
    m.setUiZoom(1.4);
    expect(m.resetUiZoom()).toBe(true);
    expect(m.getUiZoom()).toBe(1);
    expect(appliedMag()).toBe(1);
    expect(m.getUiScale()).toBe(0.9);
  });
});

describe("사다리 — 창과 무관하게 같은 칸을 고른다", () => {
  it("양 끝에서만 멈춘다", async () => {
    const m = await boot({ w: 1440, h: 900 });
    m.setUiZoom(1.6);
    expect(m.canStepUiZoom(1)).toBe(false);
    expect(m.stepUiZoom(1)).toBe(false);
    m.setUiZoom(0.8);
    expect(m.canStepUiZoom(-1)).toBe(false);
    expect(m.canStepUiZoom(1)).toBe(true);
  });

  it("범위 밖을 요청해도 사다리 안에서 멈춘다", async () => {
    const m = await boot({ w: 1440, h: 900 });
    m.setUiZoom(9);
    expect(m.getUiZoom()).toBe(1.6);
    m.setUiZoom(0.1);
    expect(m.getUiZoom()).toBe(0.8);
  });

  it("작은 창에서도 큰 창과 똑같은 칸이 열린다", async () => {
    // 예전 모델은 자동 배율과 곱해져 작은 창에서 칸이 잘려 나갔다.
    // 지금은 크기 토큰을 곱할 뿐이라(넘치는 몫은 CSS의 --board-fit-v·--hand-fit이
    // 받아 낸다) 잘라 낼 이유가 없다 — 작은 화면 사람이야말로 축소가 필요하다.
    for (const [w, h] of [[1920, 1080], [1100, 680], [660, 620]] as const) {
      const m = await boot({ w, h });
      expect(m.canStepUiZoom(-1), `${w}×${h}`).toBe(true);
      expect(m.canStepUiZoom(1), `${w}×${h}`).toBe(true);
      for (let i = 0; i < 12; i++) m.stepUiZoom(-1);
      expect(m.getUiZoom(), `${w}×${h}`).toBe(0.8);
      for (let i = 0; i < 12; i++) m.stepUiZoom(1);
      expect(m.getUiZoom(), `${w}×${h}`).toBe(1.6);
    }
  });

  it("저장된 취향은 어느 창에서도 그대로 보인다", async () => {
    const m = await boot({ w: 660, h: 620, stored: "0.8" });
    expect(m.getUiZoom()).toBe(0.8);
    expect(store.get("majak.uiZoom")).toBe("0.8");
    const wide = await boot({ w: 1920, h: 1080, stored: "0.8" });
    expect(wide.getUiZoom()).toBe(0.8);
  });

  it("옛 사다리의 값(0.7)은 가장 가까운 칸으로 스냅된다", async () => {
    const m = await boot({ w: 1440, h: 900, stored: "0.7" });
    expect(m.getUiZoom()).toBe(0.8);
  });
});

describe("좌표 변환은 자동 배율만 본다", () => {
  it("확대해도 toLayoutPx·layoutViewport가 안 흔들린다", async () => {
    const m = await boot({ w: 1440, h: 900 });
    const before = m.toLayoutPx(600);
    m.setUiZoom(1.6);
    // 수동 배수는 transform 이 아니므로 화면↔레이아웃 좌표계가 그대로다.
    // 여기가 어긋나면 확대 상태에서 패 드래그가 밀린다.
    expect(m.toLayoutPx(600)).toBe(before);
    expect(m.toLayoutPx(600)).toBe(600);
    expect(m.layoutViewport().w).toBe(1440);
  });

  it("자동 축소가 걸린 창에서는 그 값만큼 되돌린다", async () => {
    const m = await boot({ w: 990, h: 680 }); // 자동 0.9
    m.setUiZoom(1.3);
    expect(m.toLayoutPx(600)).toBeCloseTo(600 / 0.9, 5);
    expect(m.layoutViewport().w).toBeCloseTo(990 / 0.9, 5);
  });
});

describe("배치 안내는 '디자인 공간'을 본다", () => {
  it("확대하면 넓은 창도 좁아진 것처럼 취급된다", async () => {
    // 1100×680 가상 뷰포트를 1.6배로 키우면 디자인이 보기엔 688×425 — CRAMPED 아래다.
    const m = await boot({ w: 1100, h: 680 });
    expect(m.isLayoutCramped()).toBe(false);
    m.setUiZoom(1.6);
    expect(m.isLayoutCramped()).toBe(true);
    m.resetUiZoom();
    expect(m.isLayoutCramped()).toBe(false);
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
