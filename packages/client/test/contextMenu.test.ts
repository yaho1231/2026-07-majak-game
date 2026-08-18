/**
 * 우클릭 차단 — 판에서는 막고, 글자 치는 칸에서는 그대로 둔다.
 *
 * 이 패키지에는 jsdom이 없다(a11yPerfGuards.test.ts와 같은 사정). 그래서 판정 함수만
 * 가짜 요소로 직접 부르고, 부팅 배선은 소스 스캔으로 못을 박는다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { isTypingTarget } from "../src/contextMenu.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const MAIN = readFileSync(join(HERE, "../src/main.tsx"), "utf8");
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

/** `closest`만 가진 최소 요소 — 실제 DOM 없이 선택자 매칭 여부만 흉내 낸다. */
function el(matches: boolean): EventTarget {
  return { closest: (sel: string) => (matches && sel.includes("input") ? {} : null) } as unknown as EventTarget;
}

describe("우클릭 차단 — 글자 치는 칸은 예외", () => {
  it("입력 칸 안이면 브라우저 메뉴를 살려 둔다 (붙여넣기·비밀번호 관리자)", () => {
    expect(isTypingTarget(el(true))).toBe(true);
  });

  it("판 위(입력 칸 밖)에서는 막는다", () => {
    expect(isTypingTarget(el(false))).toBe(false);
  });

  it("target이 없거나 요소가 아니면 막는 쪽으로 떨어진다", () => {
    expect(isTypingTarget(null)).toBe(false);
    expect(isTypingTarget({} as EventTarget)).toBe(false);
  });

  it("부팅 때 실제로 걸린다", () => {
    expect(MAIN).toContain("blockContextMenu()");
  });
});

/**
 * 우클릭 쯔모기리 — **판 어디서든** 오른쪽 버튼이면 쯔모패가 나간다.
 *
 * 처음엔 손패 상자에만 걸려 있었는데, 그 상자는 화면 맨 아래 80px 남짓한 띠라
 * 판을 보다가 누르면 거의 다 빗나갔다("작동을 안 한다"의 실체). 그래서 게임판 전체로
 * 올렸고, 아래는 **그게 조용히 손패로 되돌아가지 않게** 못 박는 테스트다.
 */
describe("우클릭 쯔모기리", () => {
  /** rightClickTsumogiri 핸들러 본문 */
  const body = (() => {
    const fn = APP.slice(APP.indexOf("function rightClickTsumogiri("));
    return fn.slice(0, fn.indexOf("\n  }"));
  })();

  // 기본은 **꺼짐**이다 (2026-08-08 사용자 지시). 판 전체가 대상이라, 켜져 있는 줄 모르고
  // 오른쪽 버튼을 누르면 의도 없이 패가 나간다 — 켜는 것은 설정에서 스스로 하게 둔다.
  it("설정으로 켤 수 있고, 기본은 꺼져 있다", () => {
    expect(APP).toContain("rightClickTsumogiri: false"); // DEFAULT_SETTINGS
    expect(APP).not.toContain("rightClickTsumogiri: true");
    expect(APP).toContain('key: "rightClickTsumogiri"'); // 설정 패널의 한 줄
    expect(body).toContain("!props.settings.rightClickTsumogiri");
  });

  it("손패 상자가 아니라 **게임판 전체**에 걸린다", () => {
    /*
     * 예전에는 이 자리의 JSX 한 줄을 **문자열 그대로** 박아 두었다. 그래서 판
     * 루트에 속성이 하나 늘어(§7-4의 `data-hl`) 줄이 여러 줄로 갈리자, 배선은
     * 그대로인데 이 가드가 깨졌다. 지키려는 뜻은 "판 루트에 걸려 있는가"이므로
     * 그 뜻만 본다 — `className="table"` 여는 태그 안에 핸들러가 있는가.
     */
    const open = /<div\s+className="table"[\s\S]{0,300}?>/.exec(APP)?.[0] ?? "";
    expect(open).toContain("ref={tableRef}");
    expect(open).toContain("onContextMenu={rightClickTsumogiri}");
    // 손패 상자에 다시 걸리면 판 핸들러와 이중으로 제출된다
    expect(APP).not.toContain("onContextMenu={rightClickDiscard}");
  });

  it("버리는 것은 우클릭한 자리가 아니라 **쯔모패**다", () => {
    expect(body).toContain("view.round.myDrawnTile");
    expect(body).toContain("tileId?: unknown }).tileId === drawnId");
  });

  it("쯔모패가 손패에 없으면(후로 직후 등) 아무것도 내지 않는다", () => {
    expect(body).toContain("hand:${me.id}");
    expect(body).toContain("includes(drawnId)");
  });

  it("오른쪽 버튼이 이미 다른 뜻인 자리에서는 듣지 않는다", () => {
    expect(body).toContain("props.spectator === true || view.playerId === SPECTATOR_ID");
    expect(body).toContain("props.riichiMode || selection.armedType !== null");
    expect(body).toContain("isTypingTarget(e.target)"); // 글자 치는 칸
  });
});
