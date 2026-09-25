/**
 * docs/59 W5 통합 리뷰 회귀 가드 (2026-09-25).
 *
 * interaction-1 — 짝수의 세계 제자리 미리보기(onFlipHint)가 «두 번 눌러 버리기» 첫 탭 뒤 키보드로
 *   손패에 가도 남았다. 첫 탭 해제가 pointerdown에만 걸려 있었다 → focusin·keydown으로도 푼다.
 * regression-2 — 리플레이·공유 링크의 마지막 정산이 생방과 달리 «친 넘어감·리치봉 이월»을 말했다
 *   → replaySettlements가 마지막 정산에 gameEnds를 싣는다.
 * regression-3 — 미래를 보는 자 안내 줄에 시간 초과 문장이 붙어 확인 꼬리가 그 뒤로 떨어졌다
 *   → 시간 초과는 PromptTimer onTimeout에만 둔다.
 *
 * 다른 클라 테스트와 같은 **정적 소스 스캔**이다(렌더하지 않는다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(HERE, p), "utf8");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(read("../src/App.tsx"));
const REBUILD_CODE = code(read("../src/replayRebuild.ts"));

function fnBody(src: string, name: string): string {
  const at = src.indexOf(`function ${name}(`);
  expect(at, `${name} 함수가 없다`).toBeGreaterThan(-1);
  return src.slice(at, src.indexOf("\n}\n", at));
}
const CONTROL = fnBody(APP_CODE, "ActiveAugmentControl");

describe("interaction-1 — 첫 탭(primed)은 키보드로 자리를 떠나도 풀린다", () => {
  /** primed가 있을 때만 거는 해제 effect 본문 */
  const effect = (() => {
    const at = CONTROL.indexOf("if (primed === null) return;");
    expect(at).toBeGreaterThan(-1);
    return CONTROL.slice(at, CONTROL.indexOf("}, [primed, onHint, onDoomed, onFlip]);", at));
  })();

  it("pointerdown·focusin·keydown 세 길 모두 capture로 건다(그리고 모두 걷는다)", () => {
    for (const ev of ["pointerdown", "focusin", "keydown"]) {
      expect(effect).toMatch(new RegExp(`document\\.addEventListener\\("${ev}", on\\w+, true\\)`));
      expect(effect).toMatch(new RegExp(`document\\.removeEventListener\\("${ev}", on\\w+, true\\)`));
    }
  });

  it("해제는 첫 탭과 함께 제자리 미리보기(onFlip)까지 끈다", () => {
    const rel = effect.slice(effect.indexOf("const release = (): void => {"));
    const body = rel.slice(0, rel.indexOf("};"));
    expect(body).toContain("setPrimed(null);");
    expect(body).toContain("onFlip?.(false);");
    expect(body).toContain("onDoomed?.(null);");
    expect(body).toContain("onHint?.(null);");
  });

  it("초점이 ✦ 자리 밖으로 가면 풀고, 자리 안의 Enter·Space는 두 번째 누르기로 남긴다", () => {
    expect(effect).toMatch(/const onFocusIn = \(e: FocusEvent\): void => \{\s*if \(insidePrimed\(e\.target\)\) return;\s*release\(\);/);
    // 숫자 단축키·Esc는 어디서 눌러도 푼다 — ✦ 버튼에 초점이 있어도 [리치] 단축키가 먹힌다
    expect(effect).toContain('if (insidePrimed(e.target) && !/^[0-9]$/.test(e.key) && e.key !== "Escape") return;');
    // 자리 판정은 액션 바 표식이 아니라 이쪽 표식 + 루트
    expect(effect).toContain("t.closest('[data-confirm-pending=\"aug\"]') !== null");
    expect(effect).toContain("rootRef.current.contains(t)");
  });
});

describe("regression-2 — 리플레이 마지막 정산도 «이 국으로 대국이 끝납니다»", () => {
  it("replaySettlements가 마지막 정산 결과에 gameEnds를 싣는다", () => {
    const body = fnBody(REBUILD_CODE, "replaySettlements");
    expect(body).toMatch(/const last = out\[out\.length - 1\];\s*if \(last !== undefined\) last\.result = \{ \.\.\.last\.result, gameEnds: "normal" \};\s*return out;/);
  });

  it("결과 패널은 여전히 gameEnds 유무로 다음 국 안내·이월을 가른다", () => {
    expect(APP_CODE).toContain("const gameEnds = result.gameEnds !== undefined;");
    expect(APP_CODE).toContain("(gameEnds ? [] : carryOverOf(view, p.id)).map((c) => (");
  });
});

describe("regression-3 — 미래를 보는 자 안내 줄에 시간 초과 문장이 없다", () => {
  it("ARM_PROMPT.future_exchange는 3장 중 버릴 패·나머지 행방까지만 말한다", () => {
    const m = APP_CODE.match(/\n  future_exchange:\s*\n\s*"([^"]+)",/);
    expect(m, "ARM_PROMPT.future_exchange가 없다").not.toBeNull();
    const text = m![1]!;
    expect(text).toContain("빛나는 3장 중 바닥에 버릴 패를 클릭하세요");
    expect(text).toContain("패산 맨 밑으로");
    expect(text).not.toContain("시간이 다 되면");
  });

  it("시간 초과 안내는 PromptTimer 쪽에 그대로 있다", () => {
    const fut = APP_CODE.indexOf('myPrompt.options.some((o) => o.type === "future_exchange")');
    expect(fut).toBeGreaterThan(0);
    expect(APP_CODE.slice(fut, fut + 200)).toContain('"시간이 다 되면 무작위로 한 장을 골라 교환합니다"');
  });
});
