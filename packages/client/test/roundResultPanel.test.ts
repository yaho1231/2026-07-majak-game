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
    /*
     * **대국자 화면에서는** onClose 가 사람이 누르는 자리(onClick)에서만 불린다.
     *
     * 2026-09-03에 딱 한 가지 예외가 생겼다: `autoClose`(관전석 전용)다. 관전자는
     * 누를 수 있는 사람이 아니다 — 눌러도 서버에 아무것도 가지 않고(`closeRoundResult`),
     * 증강 드래프트가 열리는 국에서는 창을 걷어 줄 «새 국 뷰»가 수십 초 뒤에나 온다.
     * 그래서 관전석에서만 마감이 지나면 스스로 내려간다. 그 예외가 대국자 경로로
     * 새지 않도록 **조건에 autoClose 가 반드시 걸려 있어야 한다**는 것을 여기서 못 박는다.
     */
    const autoCloseCalls = [...body.matchAll(/onClose\s*\(/g)];
    expect(autoCloseCalls).toHaveLength(1);
    expect(body).toContain("if (autoClose !== true || deadlineAt === null || paused) return;");
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

describe("국 결과 화면 — 역 이름에는 밑줄을 긋지 않는다", () => {
  // 한때 역 이름을 용어 사전(TermText)에 물렸는데, 역이 대여섯 줄 쌓이면 화면이
  // 온통 점선 밑줄이 되어 정작 어느 역이 큰지가 안 보였다. 결과창은 점수를 읽는
  // 자리다 — 용어 풀이는 도감과 규칙 설명이 맡는다.
  it("역 줄이 TermText를 쓰지 않는다", () => {
    const body = panelSource();
    expect(body).toContain("<span className=\"result-yaku-name\">{r.label}</span>");
    expect(body).not.toContain("<TermText text={r.label} />");
  });
});

describe("유국 결과 화면 — 오름패까지 보여준다", () => {
  // "텐파이였다"만 찍고 끝나면 무엇을 기다렸는지는 공개된 손패를 각자 눈으로 세라는
  // 뜻이 된다. 정작 그게 이 화면의 핵심 정보다 — 왜 저 사람이 안 접었는지, 내
  // 버림패가 통과한 게 운이었는지가 여기서 갈린다.
  it("텐파이 행에 오름패 줄을 그린다", () => {
    const body = panelSource();
    expect(body).toContain("drawWaitsOf(view, p, revealed.hand)");
    expect(body).toContain("result-draw-waits");
    expect(body).toContain("오름패");
  });

  it("대기를 못 잡으면 빈칸이 아니라 그 사실을 적는다", () => {
    // 증강이 분해 규칙을 바꾼 손은 클라 계산이 못 잡을 수 있다. 빈칸으로 두면
    // "대기가 없었다"로 읽힌다 — 화면이 거짓말을 하는 쪽이 가장 나쁘다.
    expect(panelSource()).toContain("result-draw-waits-none");
  });

  it("공개·고정된 대기가 물리 손패 계산보다 우선한다", () => {
    // 자유 선언은 손패와 대기가 어긋나 있고, 오픈 리치는 서버가 확정해 공개한 값이다.
    // 판 위의 오름패 표시(OpponentHand)와 같은 우선순위를 쓴다.
    const start = SRC.indexOf("function drawWaitsOf(");
    expect(start).toBeGreaterThan(0);
    const fn = SRC.slice(start, SRC.indexOf("\nfunction ", start + 1));
    expect(fn.indexOf("openRiichiWaits")).toBeLessThan(fn.indexOf("freeDeclareWaits"));
    expect(fn.indexOf("freeDeclareWaits")).toBeLessThan(fn.indexOf("winningKinds"));
    // 멘쯔 수는 뷰에서 가져온다 — 공개 손패 장수로 되짚으면 깡이 섞일 때 틀린다.
    expect(fn).toContain("meldCount");
  });
});
