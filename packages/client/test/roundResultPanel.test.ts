/**
 * 국 결과 화면 회귀 가드 — "5초 뒤 강제로 닫힌다"로 되돌아가지 않게 못을 박는다.
 *
 * 배경: `RoundResultPanel`이 마운트되자마자 `setTimeout(onClose, 5000)`을 걸었고,
 * `onClose`는 화면을 닫으면서 서버에 roundContinue까지 보냈다. 그런데 이 화면 하나에
 * 공개 손패(스태거 애니메이션)·역 목록·도라 줄·증강 점수 내역·판/부 원·점수 카운트업
 * (0.4초 뒤 시작해 최대 2초)·증감표가 다 들어 있고, 황패유국은 네 사람의 손패를 싣는다.
 * `.result-panel`은 스크롤까지 되는 상자다 — 5초는 읽는 시간이 아니라 그리는 시간이었다.
 *
 * 클라를 렌더하지 않는 **정적 소스 스캔**이다(jsdom·testing-library 의존 없음).
 * `packages/content/test/client_active_augment_wiring.test.ts`가 같은 방식으로 클라
 * 소스를 검사한다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { splitTerms } from "../src/glossary.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

/** `function RoundResultPanel(` 부터 다음 최상위 함수 선언 직전까지 */
function panelSource(): string {
  const start = SRC.indexOf("function RoundResultPanel(");
  expect(start).toBeGreaterThan(0);
  const rest = SRC.slice(start + 1);
  const end = rest.indexOf("\nfunction ");
  expect(end).toBeGreaterThan(0);
  return rest.slice(0, end);
}

describe("국 결과 화면 — 스스로 닫지 않는다", () => {
  it("패널 안에 자동 닫힘 타이머(setTimeout → onClose)가 없다", () => {
    const body = panelSource();
    // onClose를 타이머에 물린 흔적 자체를 금지한다 (5000이든 다른 값이든)
    expect(/setTimeout\([^)]*onClose/.test(body)).toBe(false);
    expect(body).not.toContain("onCloseRef");
    // onClose는 오직 사람이 누르는 자리(onClick)에서만 불린다 — 코드에서 직접
    // 호출하는 형태(`onClose()`)는 어디에도 없어야 한다.
    expect(/onClose\s*\(/.test(body)).toBe(false);
    expect([...body.matchAll(/onClick=\{onClose\}/g)]).toHaveLength(1);
  });

  it("확인 버튼과 남은 시간 안내가 있다", () => {
    const body = panelSource();
    expect(body).toContain("다음 국으로");
    expect(body).toContain("result-close-count");
    expect(body).toContain("result-close-note");
  });

  it("카운트다운은 서버가 보낸 상한(deadlineAt)만 본다 — 숫자를 클라가 따로 들지 않는다", () => {
    const body = panelSource();
    expect(body).toContain("deadlineAt");
    // 남은 시간의 길이를 정하는 상수가 패널 안에 박혀 있으면 서버 상한과 어긋난다.
    // (밀리초 단위 상수는 네 자리 이상 — 초 환산에 쓰는 1000만 예외로 둔다.)
    const code = body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
    const consts = [...code.matchAll(/\b(\d{4,})\b/g)].map((m) => m[1]);
    expect(consts.filter((n) => n !== "1000")).toEqual([]);
  });

  it("서버의 autoContinueMs를 받아 마감 시각으로 굳힌다", () => {
    // 결과창은 컷인이 끝난 뒤에야 열린다 — 열릴 때 상한을 새로 세면 그만큼 거짓말이 된다.
    expect(SRC).toContain("msg.autoContinueMs");
    expect(SRC).toContain("roundResultDeadline");
  });
});

describe("국 결과 화면 — 역 이름을 용어 사전에 물린다", () => {
  it("역 줄이 TermText를 쓴다", () => {
    expect(panelSource()).toContain("<TermText text={r.label} />");
  });

  it("대표 역 이름이 실제로 사전에 걸린다", () => {
    for (const label of ["핑후", "탕야오", "치토이츠", "일기통관", "국사무쌍"]) {
      const terms = splitTerms(label).filter((c) => c.kind === "term");
      expect(terms.length, `${label}이 용어로 안 걸린다`).toBeGreaterThan(0);
    }
  });
});
