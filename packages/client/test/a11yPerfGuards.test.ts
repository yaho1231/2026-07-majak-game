/**
 * 접근성·성능 회귀 가드 (2026-08 UI 감사 대응분).
 *
 * 여기서 지키는 것들은 전부 **한 줄만 지워도 조용히 사라지는** 종류다.
 * 포커스 링이 없어도 화면은 멀쩡해 보이고, 인터벌이 다시 세션 내내 돌아도 아무 경고가
 * 안 뜬다. 그래서 못을 박아 둔다.
 *
 * 클라를 렌더하지 않는 **정적 소스 스캔**이다 — 이 패키지에는 jsdom·testing-library가
 * 없다(roundResultPanel.test.ts·helpAugment.test.ts와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");
const UISCALE = readFileSync(join(HERE, "../src/uiScale.ts"), "utf8");
const HTML = readFileSync(join(HERE, "../index.html"), "utf8");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/** `이름(` 또는 `const 이름 = memo(function 이름(` 부터 다음 최상위 선언 직전까지 */
function bodyOf(marker: string): string {
  const start = APP.indexOf(marker);
  expect(start, `${marker} 를 못 찾았다`).toBeGreaterThan(0);
  const rest = APP.slice(start + marker.length);
  const end = rest.search(/\n(?:function |const \w+ = memo\()/);
  expect(end).toBeGreaterThan(0);
  return rest.slice(0, end);
}

// ─────────────────────────── 1. 연출 건너뛰기 ───────────────────────────

describe("연출 — 건너뛸 수 있고, 화면 효과를 끄면 짧아진다", () => {
  it("건너뛰기 손잡이가 있다 (버튼 + Esc/Space)", () => {
    expect(APP).toContain("prod-skip");
    expect(APP).toContain("function skipProduction");
    // 키 핸들러가 Esc·Space 둘 다 받는지
    expect(APP).toMatch(/e\.key !== "Escape" && e\.key !== " "/);
  });

  it("화면 효과를 끄면 체류 시간이 실제로 줄어든다", () => {
    expect(APP).toContain("function effectiveProdTtl");
    // ttl을 그대로 타이머에 넣는 옛 형태로 되돌아가지 않게 한다
    expect(APP).not.toMatch(/setTimeout\(\s*\(\) => setActiveProd\(null\),\s*(activeP|p)rod\.ttl\s*\)/);
    expect(APP).toContain("effectiveProdTtl(prod.ttl, settingsRef.current.screenFx)");
  });

  it("체류 시간을 화면에 그려진 뒤부터 잰다 (막힌 프레임이 연출을 삼키지 않게)", () => {
    // rAF 두 번 = 첫 페인트 뒤. 이펙트 시점부터 재면 메인 스레드가 막힌 사이 ttl이
    // 흘러 연출이 통째로 사라진다 (2026-08-07 조커 발동 연출 실종 보고).
    expect(APP).toContain("requestAnimationFrame(() => rafs.push(window.requestAnimationFrame(start)))");
    // 백그라운드 탭에는 rAF가 오지 않는다 — 받침 타이머가 없으면 큐가 그 자리에 선다
    expect(APP).toContain("PROD_PAINT_FALLBACK_MS");
  });

  it("CSS의 --prod-ttl도 줄어든 값을 받는다 (연출 길이와 체류가 어긋나지 않게)", () => {
    expect(APP).not.toContain('"--prod-ttl": `${activeProd.ttl}ms`');
    expect([...APP.matchAll(/"--prod-ttl": `\$\{prodTtl\}ms`/g)].length).toBe(2);
  });
});

// ─────────────────────────── 2. 사건 기록 ───────────────────────────

describe("📜 기록 — 상태 스냅샷이 아니라 append-only 로그", () => {
  it("연출을 큐에 넣는 그 자리에서 기록도 쌓는다", () => {
    const body = bodyOf("function enqueueProduction(");
    expect(body).toContain("setLogEvents");
    // 재생 시점이 아니라 발생 시점의 시각이어야 한다
    expect(body).toContain("at: Date.now()");
  });

  it("국이 바뀐다고 기록을 비우지 않는다 — 판이 끝날 때만 비운다", () => {
    expect(bodyOf("function clearProductions(")).toContain("setLogEvents([])");
    // 그 외에 비우는 자리가 더 생기면 스크롤백이 다시 사라진다
    expect([...APP.matchAll(/setLogEvents\(\[\]\)/g)].length).toBe(1);
  });

  it("기록 줄에 시각과 국 구분이 붙는다", () => {
    expect(APP).toContain("function logTime");
    expect(APP).toContain("auglog-round");
    expect(CSS).toContain(".auglog-time");
  });
});

// ─────────────────────────── 3. UI 배율 ───────────────────────────

describe("UI 배율 — 자동 맞춤 위에 −/+ 를 얹고, Ctrl + 를 되돌리지 않는다", () => {
  it("배율 손잡이는 설정 패널이 아니라 화면 위에 있다 (2026-08-07 지시로 설정에서 걷어냈다)", () => {
    expect(APP).not.toContain("UiScaleRow");
    expect(UISCALE).not.toContain("export function setUiScaleSetting");
    expect(CSS).not.toContain(".uiscale-auto");
  });

  it("예전에 못 박아 둔 배율에 갇히지 않는다 — 부팅 때 지운다", () => {
    expect(UISCALE).toContain("LEGACY_OVERRIDE_KEY");
    expect(UISCALE).toContain("localStorage.removeItem(LEGACY_OVERRIDE_KEY)");
  });

  it("브라우저 확대를 감지해 자동 축소를 접는다 (WCAG 1.4.4)", () => {
    expect(UISCALE).toContain("function userZoomedIn");
    expect(UISCALE).toContain("devicePixelRatio");
    expect(UISCALE).toContain("if (userZoomedIn()) return 1;");
  });

  it("−/+ 버튼이 어느 화면에서나 뜬다 (게임 루트 최상단, 로그인·로비 포함)", () => {
    expect(APP).toContain("function ScaleControl(");
    expect(APP).toContain("<ScaleControl />");
    expect(CSS).toContain(".ui-zoom");
  });

  it("버튼이 화면과 함께 작아지지 않는다 — 되돌리기 scale", () => {
    // 가장 작아서 손잡이가 가장 필요한 순간에 손잡이도 작아지면 안 된다
    expect(CSS).toContain("transform: scale(calc(1 / var(--ui-scale, 1)))");
  });

  it("단축키가 브라우저 확대(Ctrl/⌘ +/−)를 가로채지 않는다", () => {
    expect(code(UISCALE)).toContain("if (!e.altKey || e.ctrlKey || e.metaKey) return;");
  });

  it("옛 키를 재활용하지 않는다 — 새 키를 쓴다", () => {
    expect(UISCALE).toContain('const ZOOM_KEY = "majak.uiZoom"');
    expect(code(UISCALE)).not.toMatch(/ZOOM_KEY\s*=\s*LEGACY_OVERRIDE_KEY/);
  });

  it("viewport에 확대 금지가 걸려 있지 않다", () => {
    expect(HTML).not.toContain("user-scalable=no");
    expect(HTML).not.toMatch(/maximum-scale\s*=/);
    expect(HTML).toContain("viewport-fit=cover");
  });
});

// ─────────────────────────── 4. 리렌더 ───────────────────────────

describe("리렌더 — 판 전체가 매번 다시 그려지지 않는다", () => {
  it("무거운 잎 컴포넌트가 memo 뒤에 있다", () => {
    for (const name of ["TileImg", "River", "OppHandSlot", "NamePlate", "ActiveInfoBadges", "GameTable"]) {
      expect(APP, `${name} 의 memo가 풀렸다`).toContain(`const ${name} = memo(function ${name}`);
    }
  });

  it("GameTable에 넘기는 콜백이 JSX 안에서 매번 새로 만들어지지 않는다", () => {
    expect(APP).toContain("function useStableFn");
    const open = APP.indexOf("<GameTable");
    const close = APP.indexOf("/>", open);
    const jsx = APP.slice(open, close);
    // 인라인 화살표(`onX={(...) => ...}`)가 하나라도 있으면 memo가 헛돈다
    expect(jsx).not.toMatch(/on[A-Z]\w*=\{\(/);
  });

  it("증강 툴팁 속은 올려놨거나 고정했을 때만 만든다", () => {
    expect(APP).toContain("setTipFor");
    // 고정(📌)한 것도 그려야 하지만, 그 둘 말고는 여전히 아무것도 안 만든다 —
    // 이름표 4개 × 증강 4개면 16벌이 상시로 살아 판을 다시 그릴 때마다 따라 그려진다.
    expect(APP).toMatch(/\{tipFor === a \|\| pinned\.has\(a\) \? \(/);
  });

  it("ActiveInfoBadges가 augmentView를 한 번만 훑는다", () => {
    const body = code(bodyOf("const ActiveInfoBadges = memo(function ActiveInfoBadges("));
    expect([...body.matchAll(/Object\.entries\(av\)/g)].length).toBe(1);
  });
});

describe("PeekButton — 10Hz 측정이 오버레이가 떠 있을 때만 돈다", () => {
  const body = bodyOf("function PeekButton(");

  it("인터벌 effect가 오버레이 유무(hasPanel)에 물려 있다", () => {
    expect(body).toContain("const [hasPanel, setHasPanel]");
    expect(body).toContain("MutationObserver");
    // setInterval을 거는 effect의 의존성이 [] 로 되돌아가면 로비에서도 다시 돈다
    const iv = body.indexOf("window.setInterval(measure, 100)");
    expect(iv).toBeGreaterThan(0);
    const after = body.slice(iv);
    expect(after.slice(0, after.indexOf("}, [") + 40)).toContain("}, [hasPanel]);");
  });

  it("오버레이가 없으면 곧바로 빠져나온다", () => {
    expect(body).toContain("if (!hasPanel)");
  });
});

// ─────────────────────────── 5. 움직임 줄이기 ───────────────────────────

describe("prefers-reduced-motion — 끝나지 않는 애니메이션이 남지 않는다", () => {
  /** reduce 블록들 안에 든 텍스트만 이어 붙인다 */
  function reduceBlocks(): string {
    const out: string[] = [];
    const re = /@media \(prefers-reduced-motion: reduce\) \{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(CSS)) !== null) {
      let depth = 1;
      let i = m.index + m[0].length;
      const start = i;
      while (i < CSS.length && depth > 0) {
        if (CSS[i] === "{") depth++;
        else if (CSS[i] === "}") depth--;
        i++;
      }
      out.push(CSS.slice(start, i));
    }
    return out.join("\n");
  }

  it("가장 눈에 띄는 경고·상태 반복이 전부 reduce에서 잡힌다", () => {
    const r = reduceBlocks();
    for (const sel of [
      ".hand-danger .tile-face", // 방총 위험패 (1.3s ∞)
      ".tile-hl .tile-face", // 오름패 강조 (6px↔16px)
      ".rt.rt-win-armable", // 무덤에서 화료
      ".hand-armable",
      ".opp-armable",
      ".waits-badge-open",
      ".waits-badge-peek",
      ".tile-red::after",
      ".tile-conjured::after",
      ".nameplate-turn",
      ".center-panel::after",
      ".reconnect-spin",
    ]) {
      expect(r, `${sel} 가 reduce에서 안 잡힌다`).toContain(sel);
    }
  });

  it("정보를 나르는 애니메이션(제한시간 게이지)까지 꺼 버리지 않는다", () => {
    const r = reduceBlocks();
    // `* { animation: none }` 류의 전면 차단이 들어오면 남은 시간이 안 보인다
    expect(r).not.toMatch(/^\s*\*\s*\{[^}]*animation[^}]*\}/m);
    expect(r).not.toContain(".prompt-timer-fill");
  });
});

// ─────────────────────────── 6. 포커스·키보드·보조기술 ───────────────────────────

describe("키보드로 둘 수 있고, 어디에 서 있는지 보인다", () => {
  it("전역 :focus-visible 규칙이 있다", () => {
    expect(CSS).toMatch(/:where\(a, button, input, select, textarea, summary, \[tabindex\]\):focus-visible/);
    // 2px + 2px 두 겹 링 — 어떤 배경에서도 3:1 (WCAG 2.4.11)
    expect(CSS).toContain("0 0 0 4px var(--brass-bright)");
  });

  it("UA 기본 포커스 링을 지우는 규칙이 남아 있지 않다", () => {
    // 전역 규칙 자신의 outline:none(box-shadow로 대체)만 예외
    const offenders = [...code(CSS).matchAll(/outline:\s*none/g)];
    expect(offenders.length).toBe(1);
  });

  it("액션 바에 단축키가 걸려 있다", () => {
    expect(APP).toContain("function ActionHotkeys");
    // 숫자 칩은 버튼에서 뺐다 (2026-08-07 사용자 지시) — 안내는 툴팁이 맡는다
    expect(APP).not.toContain('className="act-key"');
    expect(APP).toMatch(/단축키 \$\{hotIndex\(i\)\}/);
    // 연출 건너뛰기(Esc·Space)와 겹치면 컷인을 넘기려다 패스가 나간다
    const body = bodyOf("function ActionHotkeys(");
    expect(body).not.toContain('"Escape"');
    expect(body).not.toMatch(/e\.key === " "/);
  });

  it("게임 사건이 aria-live로 흐른다", () => {
    expect(APP).toContain('className="sr-only" aria-live="polite"');
    expect(CSS).toContain(".sr-only");
  });
});

// ─────────────────────────── 7. 자동 화료 ───────────────────────────

describe("자동 화료 — 켜기 전에 되묻는다", () => {
  it("확인 없이 켜지는 경로가 없다", () => {
    expect(APP).toContain("function confirmAutoWin");
    // 빠른 토글과 설정 패널 두 곳 모두에서 부른다
    expect([...APP.matchAll(/confirmAutoWin\(\)/g)].length).toBe(3); // 정의 1 + 호출 2
  });

  it("설명이 '되묻지 않는다'는 사실을 먼저 말한다", () => {
    expect(APP).toContain("AUTO_WIN_DESC");
    expect(APP).toContain("되묻지 않고");
  });
});

// ─────────────────────────── 8. 모바일 ───────────────────────────

describe("모바일 — 폰 크기 기준 규칙이 존재한다", () => {
  it("크기 기준 @media 가 있다 (예전엔 hover/reduced-motion 뿐이었다)", () => {
    const sizeQueries = [...CSS.matchAll(/@media[^{]*max-width:\s*(\d+)px/g)].map((m) => Number(m[1]));
    expect(sizeQueries.length).toBeGreaterThan(0);
    // iPhone SE(375)·12(390)·Pixel(412)를 실제로 덮는 폭이 있어야 한다
    expect(Math.min(...sizeQueries)).toBeLessThanOrEqual(480);
  });

  it("안전 영역을 존중한다 (iOS 홈 인디케이터)", () => {
    expect(CSS).toContain("env(safe-area-inset-bottom");
    expect(CSS).toContain("env(safe-area-inset-top");
  });

  it("손가락 목표 크기를 coarse pointer에서 키운다", () => {
    expect(CSS).toContain("@media (pointer: coarse)");
    expect(CSS).toMatch(/min-height:\s*4[4-9]px/);
  });

  it("세로 폰에 회전 안내가 뜬다", () => {
    expect(CSS).toContain(".rotate-hint");
    expect(CSS).toContain("orientation: portrait");
    expect(APP).toContain('className="rotate-hint"');
  });

  it("넘친 내용에 닿을 수 있다 (WCAG 1.4.10)", () => {
    expect(CSS).toContain("overscroll-behavior: contain");
  });

  it("예지 재배열이 터치에서도 된다 (HTML5 draggable 단독 금지)", () => {
    expect(APP).toContain("moveForesight");
    // 드래그 말고 누르는 길이 함께 있어야 한다
    const strip = APP.slice(APP.indexOf('className="foresight-strip"'));
    expect(strip.slice(0, 4000)).toContain("onClick={() => {");
  });

  it("타패 미리보기가 마우스 전용이 아니다", () => {
    expect(APP).toContain('if (e.pointerType !== "mouse") setHoverId(id);');
  });
});

// ─────────────────────────── 9. 대비·색 ───────────────────────────

describe("대비 — 펠트 위 2·3차 텍스트가 4.5:1 을 넘는다", () => {
  /** 상대 휘도 (WCAG) */
  function lum(hex: string): number {
    const h = hex.replace("#", "");
    const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const lin = ch.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lin[0]! + 0.7152 * lin[1]! + 0.0722 * lin[2]!;
  }
  function ratio(a: string, b: string): number {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p) as [number, number];
    return (x + 0.05) / (y + 0.05);
  }
  function token(name: string): string {
    const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`).exec(CSS);
    expect(m, `--${name} 토큰이 없다`).not.toBeNull();
    return m![1]!;
  }

  it("--ink-3 / --ink-4 가 가장 밝은 펠트 위에서도 4.5:1 이상", () => {
    const feltLightest = token("felt-3");
    for (const ink of ["ink-1", "ink-2", "ink-3", "ink-4"]) {
      expect(ratio(token(ink), feltLightest), `${ink} 대비 미달`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("단계 차이는 그대로 남는다 (1 > 2 > 3 > 4)", () => {
    const f = token("felt-3");
    const rs = ["ink-1", "ink-2", "ink-3", "ink-4"].map((k) => ratio(token(k), f));
    for (let i = 1; i < rs.length; i++) expect(rs[i]!).toBeLessThan(rs[i - 1]!);
  });

  it("고대비·강제 색 모드를 다룬다", () => {
    expect(CSS).toContain("@media (prefers-contrast: more)");
    expect(CSS).toContain("@media (forced-colors: active)");
    // 강제 색에서는 패의 정체를 색이 아니라 테두리 모양으로 말한다
    expect(CSS).toContain("outline-style: double");
  });
});

describe("작은 것들", () => {
  it("오야 표식이 오야의 차례에도 남는다", () => {
    expect(CSS).toContain(".plate-turn .plate-wind.plate-dealer");
  });

  it("도감 카드가 계열 색을 쓴다 (폐기된 등급 상수 제거)", () => {
    expect(APP).not.toContain("codex-card codex-card-prism");
    expect(APP).toContain("codex-card-cat aug-cat-");
    expect(CSS).toContain(".codex-card-cat { --rarity: var(--fx-color");
  });
});
