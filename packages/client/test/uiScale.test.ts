/**
 * uiScale — 창 하나만 보고 정하는 자동 맞춤.
 *
 * 이 패키지에는 jsdom이 없다(a11yPerfGuards.test.ts 참고). uiScale.ts가 건드리는
 * 전역이 몇 개 안 되므로 **손으로 만든 최소 window/document**를 세워 놓고 실제 함수를
 * 돌린다 — 소스 문자열 스캔이 아니라 계산 결과를 본다.
 *
 * 여기서 못 박는 것: 배율이 **창을 원판(1920×1080)에 맞춘 값 하나**라는 것, 가상
 * 뷰포트가 원판보다 좁아지지 않는다는 것, 옛 수동 배수 키를 계속 지운다는 것,
 * 그리고 배율을 **무엇으로 거는지**(zoom / transform)를 엔진을 재서 고른다는 것.
 */

import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";

type Uis = typeof import("../src/uiScale.js");

const store = new Map<string, string>();
let cssVars: Record<string, string> = {};
let keyHandlers: ((e: unknown) => void)[] = [];
let resizeHandlers: (() => void)[] = [];
/** 지금 세워 둔 가짜 window — 세션 중 확대(창 크기 + dpr)를 흉내 낼 때 직접 고친다. */
let win: {
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  [k: string]: unknown;
};
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
  /** 프로브가 잴 100cqw (기본 100 = 크로뮴처럼 zoom을 아는 엔진). */
  cq?: number;
  /** `zoom` 자체를 지원하는가 (기본 참). */
  zoom?: boolean;
  /** 부팅 전에 넣어 둔 저장값을 지우지 않는다 (확대 표식 시험용). */
  keepStore?: boolean;
}): Promise<Uis> {
  if (opts.keepStore !== true) store.clear();
  cssVars = {};
  keyHandlers = [];
  resizeHandlers = [];
  modeAttr = null;
  probeCq = opts.cq ?? 100;
  zoomSupported = opts.zoom ?? true;
  const fine = opts.fine ?? true;
  win = {
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
      if (type === "resize") resizeHandlers.push(fn as () => void);
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

/**
 * 세션 중 브라우저 확대를 흉내 낸다 — Ctrl/⌘ +/− 는 **두 가지를 함께** 움직인다:
 * CSS 픽셀 창이 1/z 로 줄고, devicePixelRatio 가 z 배가 된다.
 */
function browserZoom(z: number, base: { w: number; h: number; dpr: number }): void {
  win.innerWidth = Math.round(base.w / z);
  win.innerHeight = Math.round(base.h / z);
  win.devicePixelRatio = base.dpr * z;
  resizeHandlers.forEach((fn) => fn());
}

/** body에 실제로 쓰인 --ui-scale (getUiScale()과 같아야 한다). */
function appliedScale(): number {
  return Number(cssVars["--ui-scale"]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("배율은 창을 원판(1920×1080)에 맞춘 값 하나다", () => {
  it("원판 그대로면 1", async () => {
    const m = await boot({ w: 1920, h: 1080 });
    expect(m.getUiScale()).toBe(1);
    expect(appliedScale()).toBe(1);
  });

  it("16:9 창은 크기가 달라도 같은 가상 뷰포트로 수렴한다", async () => {
    // 이게 이 설계의 요점이다 — 1366이든 4K든 «같은 그림이 크기만 다르게» 선다.
    for (const [w, h] of [[2560, 1440], [3840, 2160], [1600, 900]] as const) {
      const m = await boot({ w, h });
      const s = m.getUiScale();
      // 배율을 소수 둘째 자리로 «버리»므로 가상 뷰포트는 원판보다 조금 넓을 뿐이다.
      expect(w / s, `${w}×${h}`).toBeGreaterThanOrEqual(1920);
      expect(w / s, `${w}×${h}`).toBeLessThan(1920 * 1.02);
      expect(h / s, `${w}×${h}`).toBeGreaterThanOrEqual(1080);
      expect(h / s, `${w}×${h}`).toBeLessThan(1080 * 1.02);
    }
  });

  it("가상 뷰포트는 어느 쪽도 원판보다 좁아지지 않는다 (하한에 걸리기 전까지)", async () => {
    for (const [w, h] of [[1920, 1080], [2560, 1080], [1600, 900], [1512, 982], [1850, 860]] as const) {
      const v = (await boot({ w, h })).layoutViewport();
      expect(v.w, `${w}×${h}`).toBeGreaterThanOrEqual(1920);
      expect(v.h, `${w}×${h}`).toBeGreaterThanOrEqual(1080);
    }
  });

  it("큰 모니터에서는 1을 넘어 판이 화면을 따라 커진다", async () => {
    expect((await boot({ w: 2560, h: 1440 })).getUiScale()).toBeGreaterThan(1);
    // 4K 는 상한 2.0 — 원판을 정확히 두 배로 그린다
    expect((await boot({ w: 3840, h: 2160 })).getUiScale()).toBe(2);
    expect((await boot({ w: 7680, h: 4320 })).getUiScale()).toBe(2);
  });

  it("납작한 창은 1 아래로 내려가되 하한 0.75에서 멈춘다", async () => {
    // 1850×860: 세로 쪽이 먼저 걸린다 → 860/1080 = 0.796 → 0.79
    expect((await boot({ w: 1850, h: 860 })).getUiScale()).toBe(0.79);
    // 1920×600: 0.556 → 하한
    expect((await boot({ w: 1920, h: 600 })).getUiScale()).toBe(0.75);
    expect((await boot({ w: 800, h: 600 })).getUiScale()).toBe(0.75);
  });

  it("어느 창에서도 [0.75, 2] 를 벗어나지 않는다", async () => {
    for (const [w, h] of [[320, 480], [800, 600], [1366, 768], [1920, 1080], [5120, 2880]] as const) {
      const s = (await boot({ w, h })).getUiScale();
      expect(s, `${w}×${h}`).toBeGreaterThanOrEqual(0.75);
      expect(s, `${w}×${h}`).toBeLessThanOrEqual(2);
    }
  });

  it("마우스가 없는 기기는 손대지 않는다", async () => {
    const m = await boot({ w: 400, h: 800, fine: false });
    expect(m.getUiScale()).toBe(1);
  });

  it("숨은 탭(0×0)에서는 아무것도 하지 않는다", async () => {
    const m = await boot({ w: 0, h: 0 });
    expect(m.getUiScale()).toBe(1);
  });

});

/*
 * 브라우저 확대(Ctrl/⌘ +/−)는 CSS 픽셀 창을 정확히 1/z 로 줄인다. 자동 맞춤이 그걸
 * "작은 창"으로 읽고 배율을 1/z 로 낮추면 **사람이 요구한 확대가 정확히 상쇄된다** —
 * Ctrl+ 를 눌러도 아무 일이 안 일어난다(WCAG 1.4.4 위반). 그래서 z 를 도로 곱한다.
 */
describe("브라우저 확대는 상쇄하지 않고 그 위에 곱한다", () => {
  it("200% 로 키우면 배율이 그대로 남는다 = 화면에서는 두 배로 보인다", async () => {
    const base = { w: 1920, h: 1080, dpr: 1 };
    const m = await boot({ w: base.w, h: base.h, dpr: base.dpr });
    expect(m.getUiScale()).toBe(1);
    browserZoom(2, base);
    // 창은 960×540 이 됐지만(맞춤만 보면 0.5 → 하한 0.75) 확대 배수 2가 곱해져 1.0.
    // CSS px 자체가 두 배로 그려지므로 화면에서는 정확히 200%가 된다.
    expect(m.getUiScale()).toBe(1);
    expect(appliedScale()).toBe(1);
  });

  it("50% 로 줄이면 배율도 함께 내려간다", async () => {
    const base = { w: 1920, h: 1080, dpr: 1 };
    const m = await boot({ w: base.w, h: base.h, dpr: base.dpr });
    browserZoom(0.5, base);
    // 창 3840×2160 → 맞춤 2.0, 확대 배수 0.5 → 1.0. 화면에서는 절반 크기.
    expect(m.getUiScale()).toBe(1);
  });

  it("Ctrl+0 으로 되돌리면 순수 자동 맞춤으로 돌아온다", async () => {
    const base = { w: 1827, h: 852, dpr: 1 };
    const m = await boot({ w: base.w, h: base.h, dpr: base.dpr });
    expect(m.getUiScale()).toBe(0.78);
    browserZoom(1.5, base);
    browserZoom(1, base);
    expect(m.getUiScale()).toBe(0.78);
  });

  it("dpr 이 미세하게 흔들리는 것은 확대로 읽지 않는다", async () => {
    const m = await boot({ w: 1920, h: 1080, dpr: 1 });
    win.devicePixelRatio = 1.01;
    resizeHandlers.forEach((fn) => fn());
    expect(m.getUiScale()).toBe(1);
  });

  it("모니터를 옮겨 dpr 이 크게 튀어도 배수가 [0.5, 2] 를 못 벗어난다", async () => {
    const m = await boot({ w: 1920, h: 1080, dpr: 1 });
    win.devicePixelRatio = 8;
    resizeHandlers.forEach((fn) => fn());
    expect(m.getUiScale()).toBeLessThanOrEqual(2);
    win.devicePixelRatio = 0.05;
    resizeHandlers.forEach((fn) => fn());
    expect(m.getUiScale()).toBeGreaterThanOrEqual(0.75);
  });

  /*
   * 2026-08-24 사용자 보고 회귀 — 예전에는 "이 사람은 확대를 쓴다"를 localStorage 에
   * 적어 두고 그 표식이 있으면 자동 맞춤을 **통째로 껐다.** 한 번 붙으면 안 떨어져
   * 1827×852 에서 배율이 0.78 이 아니라 1로 굳었다(= 판이 깨진 그 화면).
   */
  it("옛 «확대 사용자» 표식이 있어도 자동 맞춤이 걸린다 — 그리고 표식을 지운다", async () => {
    store.set("majak.browserZoomed", "1");
    const m = await boot({ w: 1827, h: 852, keepStore: true });
    expect(m.getUiScale()).toBe(0.78);
    expect(store.has("majak.browserZoomed")).toBe(false);
  });

  it("부팅 직후의 배수는 언제나 1 — 세션을 넘기는 상태가 없다", async () => {
    // dpr 이 2인 기기(Retina)에서 열어도 그 자체는 확대가 아니다.
    const m = await boot({ w: 1920, h: 1080, dpr: 2 });
    expect(m.getUiScale()).toBe(1);
  });
});

describe("좌표 변환이 최종 배율 하나만 본다", () => {
  it("toLayoutPx·layoutViewport 가 지금 걸린 배율을 그대로 쓴다", async () => {
    const m = await boot({ w: 2560, h: 1440 });
    const s = m.getUiScale();
    expect(s).toBeCloseTo(1.33, 2);
    // 화면 좌표 → 레이아웃 좌표. 여기가 어긋나면 패 드래그가 밀린다.
    expect(m.toLayoutPx(600)).toBeCloseTo(600 / s, 5);
    expect(m.layoutViewport().w).toBeCloseTo(2560 / s, 5);
    expect(m.layoutViewport().h).toBeCloseTo(1440 / s, 5);
  });
});

describe("갇히는 저장값을 남기지 않는다", () => {
  /*
   * 손잡이가 두 번 사라졌다 — 설정 패널의 "화면 크기"(2026-08-07)와 화면의 −/+
   * (2026-08-24). 둘 다 localStorage 에 값을 남겼고, 그 값이 살아 있으면 **손잡이
   * 없이 그 배율에 갇힌다**. 그래서 부팅 때마다 둘 다 지운다.
   */
  it("옛 키 둘(majak.uiScale · majak.uiZoom)을 부팅 때 지운다", async () => {
    store.set("majak.uiScale", "0.5");
    store.set("majak.uiZoom", "0.6");
    const m = await boot({ w: 1920, h: 1080, keepStore: true });
    expect(store.has("majak.uiScale")).toBe(false);
    expect(store.has("majak.uiZoom")).toBe(false);
    // 지워진 뒤에는 자동값만 남는다
    expect(m.getUiScale()).toBe(1);
  });

  it("옛 값이 있어도 배율에 영향을 주지 않는다", async () => {
    store.set("majak.uiZoom", "0.6");
    const m = await boot({ w: 1600, h: 900, keepStore: true });
    expect(m.getUiScale()).toBe(0.83);
  });

  it("단축키를 걸지 않는다 — 만질 배수가 없다", async () => {
    await boot({ w: 1920, h: 1080 });
    expect(keyHandlers.length).toBe(0);
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
