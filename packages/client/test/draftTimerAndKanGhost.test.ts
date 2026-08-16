/**
 * 2026-08-17 사용자 지적 두 건의 회귀 가드 — 둘 다 한 줄이면 조용히 되돌아간다.
 *
 * ① **증강 선택 타이머가 서버보다 늦게 출발했다.** 선택창은 개막 연출(2.1초)이나 아직
 *    안 닫힌 결과 화면 뒤에서 뜨는데, 카운트다운을 *창이 마운트된 시점*부터 30초 다시
 *    셌다. 화면은 "3초 남음"인데 서버 타이머는 이미 0이라, 남은 시간이 있는데 랜덤으로
 *    결정돼 버리는 것처럼 보였다. 오퍼가 **도착한** 시각에 마감을 굳혀야 한다.
 *
 * ② **평범한 안깡까지 반투명 얼굴을 겹쳐 그렸다.** 겹치기는 랭크가 섞이는 특수깡
 *    (장사진 1-2-3-4, 바람의 계보 동남서북)이 `( )2 3( )`로 읽히지 않아 넣은 장치다.
 *    같은 패 넉 장은 가운데 둘만 봐도 다 읽히므로 겹치지 않는다 — 반투명은 "여기 뭔가
 *    다르다"는 신호로만 남긴다.
 *
 * roundResultPanel.test.ts 와 같은 **정적 소스 스캔**이다 (이 패키지에는 jsdom이 없다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

/** `function <이름>(` 부터 다음 최상위 함수 선언 직전까지 */
function fnSource(name: string): string {
  const start = SRC.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(0);
  const rest = SRC.slice(start + 1);
  const end = rest.indexOf("\nfunction ");
  expect(end).toBeGreaterThan(0);
  return rest.slice(0, end);
}

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

describe("증강 선택 타이머 — 오퍼 도착 시각에 굳힌다", () => {
  it("오퍼를 받는 자리에서 마감 시각을 굳힌다", () => {
    const handler = SRC.slice(SRC.indexOf('if (msg.type === "draftOffer")'));
    const body = handler.slice(0, handler.indexOf("\n    }"));
    expect(body).toContain("draftDeadline.current");
    expect(body).toContain("performance.now() + msg.deadlineMs");
  });

  it("선택창은 도착 시각 기준 마감(deadlineAt)만 보고, 자기 마운트 시각부터 다시 세지 않는다", () => {
    const body = code(fnSource("DraftOverlay"));
    expect(body).toContain("deadlineAt");
    // 마운트 시점을 기준으로 삼는 옛 형태(start = performance.now())가 되살아나면 실패
    expect(/start\s*=\s*performance\.now\(\)/.test(body)).toBe(false);
    // 남은 시간을 draft.deadlineMs에서 직접 세면 창이 늦게 뜬 만큼 시간이 늘어난다
    expect(body).not.toContain("draft.deadlineMs");
  });

  it("오퍼가 오면 아직 떠 있는 결과 화면을 걷는다 (선택창을 가린 채 타이머만 흐르지 않게)", () => {
    const handler = SRC.slice(SRC.indexOf('if (msg.type === "draftOffer")'));
    const body = handler.slice(0, handler.indexOf("\n    }"));
    expect(body).toContain("setRoundResult(null)");
  });
});

describe("안깡 표기 — 반투명 얼굴은 특수깡에만", () => {
  it("kan_closed 가지가 ghost를 무조건 넘기지 않는다 (같은 패 넉 장 판정을 거친다)", () => {
    const body = code(fnSource("MeldGroup"));
    const branch = body.slice(body.indexOf('meld.kind === "kan_closed"'));
    const kanBranch = branch.slice(0, branch.indexOf("</span>"));
    // 네 장이 같은 종류인지 대조하는 장치가 있어야 한다
    expect(kanBranch).toContain("kindKey");
    // ghost는 그 판정을 거친 값으로만 넘어간다 — view.tiles를 바로 꽂으면 예전 형태다
    expect(/ghost=\{view\.tiles\[/.test(kanBranch)).toBe(false);
  });
});
