/**
 * QA 2차 lobby 확정 5·6의 회귀 그물 (2026-08-22).
 *
 * 둘 다 «있다고 적힌 것이 실제로는 없던» 종류다.
 *
 * ① 리플레이 국 결과 패널이 `uraDoraIndicators: []` 를 **고정으로** 넣어, 역 목록에
 *    「뒷도라 2판」이 뜨는데 그 두 장이 화면에 없었다. 점수의 절반을 설명하는 근거가
 *    정확히 그 자리에서 빈다.
 * ② 제보 «제출»의 잠금이 `useRef` 라 **리렌더가 없다** — 막으려던 이중 제출이 그대로
 *    열려 있었고, 반대로 실패하면(시간당 10건 상한은 실제로 걸린다) 잠금을 풀 길이
 *    없어 «올리는 중…»에 영구히 갇혔다.
 *
 * 소스 정적 검사 방식은 이 디렉터리의 다른 가드 테스트와 같다.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SRC = join(__dirname, "..", "src");
const replayRebuild = readFileSync(join(SRC, "replayRebuild.ts"), "utf8");
const app = readFileSync(join(SRC, "App.tsx"), "utf8");

describe("리플레이 결과 패널 — 뒷도라", () => {
  it("uraDoraIndicators를 빈 배열로 고정하지 않는다", () => {
    // 주석에 옛 코드를 인용해 두었으므로 **실제 필드 자리**만 본다.
    expect(replayRebuild).toMatch(/^\s*uraDoraIndicators: (?!\[\]).+$/m);
    expect(replayRebuild).not.toMatch(/^\s*uraDoraIndicators: \[\],\s*$/m);
  });

  it("생방과 같은 함수(uraIndicatorIds)로 뽑는다", () => {
    expect(replayRebuild).toContain("uraIndicatorIds");
    // 화료가 아닌 국에는 뒷도라가 없다 — 그 구분이 남아 있어야 한다.
    expect(replayRebuild).toMatch(/outcome === "win"[\s\S]{0,60}uraIndicatorIds/);
  });

  it("뽑은 표시패를 tiles에도 넣는다 (안 넣으면 그림이 안 뜬다)", () => {
    expect(replayRebuild).toMatch(/const ura =[\s\S]{0,200}for \(const id of ura\) add\(id\);/);
  });
});

describe("제보 제출 — 잠금", () => {
  it("잠금이 ref가 아니라 state다 (ref면 리렌더가 없어 버튼이 안 잠긴다)", () => {
    expect(app).not.toContain("submittedRef");
    expect(app).toContain("const [pendingTitle, setPendingTitle] = useState<string | null>(null);");
  });

  it("실패했을 때 풀어 주는 그물이 있다", () => {
    // pendingTitle 을 시간이 지나면 되돌리는 타이머가 있어야 한다.
    expect(app).toMatch(/setTimeout\(\(\) => setPendingTitle\(null\), 12_000\)/);
  });
});
