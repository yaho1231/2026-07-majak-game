/**
 * 결과 화면 — **0점 증강 노트도 근거로 보인다**.
 *
 * 배경(QA verify-score 확정 2, 2026-08-20): 마왕의 진군(devils_advance)의 폭발은
 * 걷은 9,000점을 뱅크로 보내고 보유자 deltas는 건드리지 않는다(설계). 무슨 일이
 * 있었는지는 `withAugPoint(…, 0)` 노트 한 줄로만 전해지는데, 클라의 두 렌더 경로가
 * 그 노트를 양쪽에서 걸러 냈다.
 *   ① 화료자 블록: `.filter(a => a.player === w.winner && a.points !== 0)`
 *   ② 증감표    : `<AugDeltaNotes … skipWinners={winnerIds} />` → 사람 단위로 return null
 * 폭발은 화료 정산에서만 일어나 보유자는 **언제나** 승자라, 9,000점이 근거 한 줄 없이
 * 테이블에서 사라졌다. `AugDeltaNotes`의 주석은 "points === 0인 노트도 싣는다 —
 * 마왕의 진군처럼"이라고 약속하고 있었는데 실제로는 절대 그 경로에 닿지 못했다.
 *
 * 수정: `skipWinners`를 **승자 블록이 이미 적는 줄(points !== 0)에만** 적용한다.
 *
 * 클라를 렌더하지 않는 **정적 소스 스캔**이다(roundResultPanel.test.ts와 같은 방식).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

/** `function AugDeltaNotes(` 부터 다음 최상위 함수 선언 직전까지 */
function notesSource(): string {
  const start = SRC.indexOf("function AugDeltaNotes(");
  expect(start).toBeGreaterThan(0);
  const rest = SRC.slice(start + 1);
  const end = rest.indexOf("\nfunction ");
  expect(end).toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe("AugDeltaNotes — 승자라고 사람 통째로 건너뛰지 않는다", () => {
  it("skipWinners가 사람 단위 조기 return을 하지 않는다", () => {
    const body = notesSource();
    // ★ 회귀 지점: `if (skipWinners?.has(player)) return null;` 로 되돌아가면
    //   0점 노트가 화면 어디에도 남지 않는다.
    expect(/skipWinners\?\.has\([^)]*\)[^\n]*return null/.test(body)).toBe(false);
  });

  it("승자에게는 0점 노트만 남긴다 — 필터에 points === 0 이 들어 있다", () => {
    const body = notesSource();
    expect(body).toContain("a.points === 0");
    // 노트 목록을 만드는 필터가 skip과 함께 쓰인다(사람 단위가 아니라 노트 단위).
    const filter = body.slice(body.indexOf("augPoints ?? []"));
    expect(filter.slice(0, 200)).toContain("a.points === 0");
  });

  it("화료자 블록은 0점 노트를 빼되, **판수로 세어지는 줄**만 예외로 남긴다", () => {
    /*
     * 2026-08-31(B-7) — 판수 표식은 환산액이 0원이어도 남는다(밴드가 델타를 흡수한
     * 경우). 그 줄까지 빼면 제목의 총 판수(`settleBonusHanOf`)는 올라가는데 상세
     * 목록에 근거가 하나도 없는 화면이 된다. 그래서 승자 블록의 기준을
     * «금액이 움직였거나, 판수로 세어지거나»로 넓혔다 — 판수가 없는 0점 노트
     * (마왕의 진군)는 예전 그대로 증감표 쪽에만 남아 중복되지 않는다.
     */
    expect(SRC).toContain("a.points !== 0 || countsHan");
    expect(SRC).toContain("w.yakumanCount === 0 && (a.han ?? 0) > 0");
  });
});
