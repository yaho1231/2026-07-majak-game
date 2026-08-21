/**
 * `fx/` 연출 모듈 가드 — **설정을 안 보는 연출이 다시 생기지 않게 한다.**
 *
 * 2026-08-22 QA 에서 같은 결함이 두 명에게 각각 잡혔다: 손패 정렬 FLIP 이
 * `screenFx` 도 `prefers-reduced-motion` 도 **양쪽 다 안 보는 유일한 연출**이었다.
 * 예전에는 손패 재배치가 순간이동이라 CSS 에 reduce 가드를 걸 대상 자체가 없었고,
 * 새로 만든 GSAP 쪽도 검사를 빠뜨려서 **어디에도 안 걸렸다.**
 *
 * 기존 `a11yPerfGuards.test.ts` 의 reduce 검사는 **CSS 만** 스캔한다. 연출이 JS 로
 * 옮겨간 이상 그 가드만으로는 부족하다 — 누가 `canDecorate()` 한 줄을 지워도 테스트가
 * 전부 통과한다. 이 파일이 그 자리를 메운다.
 *
 * 이 패키지에는 jsdom 이 없어 다른 클라이언트 테스트와 같은 **정적 소스 스캔**이다.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const FX = join(HERE, "../src/fx");
const EFFECTS = join(FX, "effects");

/**
 * 설정을 안 봐도 되는 것 — **이유와 함께** 적는다.
 * 목록에 이름만 늘리지 말 것: 왜 예외인지 못 적겠으면 예외가 아니다.
 */
const GATE_EXEMPT: Record<string, string> = {
  captureHand: "측정만 한다 — 아무것도 그리지 않는다",
  playHand: "runHandFlip 에 위임한다 (거기서 검사한다)",
  reflowHand: "runHandFlip 에 위임한다 (거기서 검사한다)",
  killHandFlip: "정리 함수 — 오히려 설정과 무관하게 항상 돌아야 한다",
  playBanner:
    "배너에는 걷어낼 장식 조각이 없다 — 글자와 밴드뿐이다. " +
    "체류·재생 속도는 다른 연출과 같이 설정을 따르므로 끌 것이 남지 않는다.",
};

/** `export function 이름(` 목록 */
function exportedFns(src: string): string[] {
  return [...src.matchAll(/export function (\w+)\(/g)].map((m) => m[1] as string);
}

/** 그 함수의 본문 (다음 최상위 `export function` 또는 파일 끝까지) */
function bodyOf(src: string, name: string): string {
  const at = src.indexOf(`export function ${name}(`);
  const rest = src.slice(at + 1);
  const next = rest.indexOf("\nexport function ");
  return next === -1 ? rest : rest.slice(0, next);
}

const effectFiles = readdirSync(EFFECTS).filter((f) => f.endsWith(".ts"));

describe("fx/effects — 모든 연출은 설정 창구를 지난다", () => {
  it("검사 대상 파일이 실제로 있다 (경로가 바뀌면 이 테스트가 조용히 무력해진다)", () => {
    expect(effectFiles.length).toBeGreaterThan(0);
  });

  for (const file of effectFiles) {
    const src = readFileSync(join(EFFECTS, file), "utf8");
    for (const name of exportedFns(src)) {
      const reason = GATE_EXEMPT[name];
      it(`${file} · ${name}${reason !== undefined ? " (예외)" : ""}`, () => {
        if (reason !== undefined) {
          expect(reason.length, "예외에는 이유가 있어야 한다").toBeGreaterThan(5);
          return;
        }
        const body = bodyOf(src, name);
        const gated = /fxEnabled\(|canDecorate\(/.test(body);
        expect(
          gated,
          `${name} 이 fxEnabled()/canDecorate() 를 안 본다 — 화면 효과를 끄거나 ` +
            `동작 줄이기를 켠 사람에게 그대로 나간다. 정말 예외라면 GATE_EXEMPT 에 이유와 함께 적을 것.`,
        ).toBe(true);
      });
    }
  }
});

describe("fx/settings — 접근성 배선", () => {
  const settings = readFileSync(join(FX, "settings.ts"), "utf8");

  it("reduced 는 모듈 로드 시점에 이미 읽혀 있다", () => {
    // 기본값 false 로 두면 App 의 useEffect 가 처음 돌기 전까지 "안 켠 것"으로 취급된다.
    // 손패 FLIP 은 useLayoutEffect 라 passive effect 보다 **먼저** 돈다.
    expect(settings).toMatch(/let reduced = readReducedMotion\(\);/);
  });

  it("OS 설정이 설정 스위치를 이긴다", () => {
    // 전정기관 문제로 움직임 자체가 증상인 사람에게는 이쪽이 이겨야 한다.
    expect(settings).toMatch(/return current\.screenFx && !reduced;/);
  });
});

describe("연출 예산 — 자주 보이는 것에 세게 쓰지 않는다", () => {
  const motion = readFileSync(join(FX, "motion.ts"), "utf8");
  const app = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

  /**
   * 2026-08-22 사용자 보고: "화면 흔들림이 너무 강해. 전체적으로 볼 때마다 어지러워."
   *
   * 처음에는 옛 CSS 키프레임의 변위를 그대로 옮겨 왔는데(최대 14px), 한 번 볼 때
   * 적당한 세기와 한 국에 여러 번 겪을 때 견딜 수 있는 세기는 다르다. 연출을 만들 때는
   * 앞의 것만 보게 되므로, 상한을 **숫자로 못 박아** 다음 사람이 슬금슬금 올리는 것을 막는다.
   *
   * ⚠ `amp` 는 실제 변위의 절반이다(CustomWiggle 이 구간을 넘어 진동한다 — 실측 ×1.95).
   *   그래서 상한도 `amp` 기준으로 적는다.
   */
  const AMP_CAP = { 1: 0.5, 2: 1, 3: 2, 4: 3 } as const;

  for (const [lv, cap] of Object.entries(AMP_CAP)) {
    it(`흔들림 ${lv}단의 진폭이 ${cap} 이하다 (실측 변위 약 ${(cap * 1.95).toFixed(1)}px)`, () => {
      const m = new RegExp(`${lv}: \\{ amp: ([\\d.]+),`).exec(motion);
      expect(m, `SHAKE ${lv}단 정의를 못 찾았다`).not.toBeNull();
      expect(Number(m?.[1])).toBeLessThanOrEqual(cap);
    });
  }

  it("폰·치에는 흔들림을 걸지 않는다 (한 국에 여러 번 일어난다)", () => {
    const at = app.indexOf("const callSfx = m.kind === \"chi\"");
    expect(at).toBeGreaterThan(0);
    const body = app.slice(at, at + 500);
    // 깡만 흔든다 — pon 가지가 살아 있으면 안 된다
    expect(body).toMatch(/isKan \? \{ impact: \{ shake: 1 as const \} \} : \{\}/);
    expect(body).not.toContain('m.kind === "pon" ? { impact:');
  });

  it("유국은 흔들지 않는다 (아무도 화료하지 않은 사건이다)", () => {
    const at = app.indexOf('msg.outcome === "draw" ? "유 국"');
    expect(at).toBeGreaterThan(0);
    expect(app.slice(at, at + 220)).not.toContain("impact");
  });

  it("매 순 일어나는 동작은 짧다 (한 국에 70순이 넘는다)", () => {
    const tick = /tick: ([\d.]+),/.exec(motion);
    const tile = /tile: ([\d.]+),/.exec(motion);
    const layout = /layout: ([\d.]+),/.exec(motion);
    expect(Number(tick?.[1])).toBeLessThanOrEqual(0.14);
    expect(Number(tile?.[1])).toBeLessThanOrEqual(0.28);
    expect(Number(layout?.[1])).toBeLessThanOrEqual(0.3);
  });
});
