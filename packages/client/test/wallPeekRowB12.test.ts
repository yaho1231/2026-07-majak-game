/**
 * docs/59 B12 «패산 정보 한 줄 + 밑장 스트립 클릭» 회귀 가드 (2026-09-25).
 *
 * U50 예지·삼세 예지·밑장빼기의 «곧 나올 패»를 손패 위 한 줄(WallPeekRow)로 모으고
 *     «오른쪽 끝 = 가장 먼저 나올 패 + 다음 뱃지»로 방향을 통일한다. 예지는 focusAv에서 읽어
 *     관전자에게도 보인다. 재배열 탭(모달)은 ActiveAugmentControl에 남고 여닫이는 OwnArea가 쥔다.
 * U35 밑장빼기는 그 줄의 태그·밑장 칸을 눌러 바로 예약한다(관전·강제 선택·예약됨이면 못 누른다).
 *
 * 다른 클라 테스트와 같은 **정적 소스 스캔**이다(렌더하지 않는다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);

/** `function name(` 부터 다음 최상위 `\n}\n` 까지 */
function fnBody(name: string): string {
  const at = APP_CODE.indexOf(`function ${name}(`);
  expect(at, `${name} 함수가 없다`).toBeGreaterThan(-1);
  return APP_CODE.slice(at, APP_CODE.indexOf("\n}\n", at));
}

describe("B12 U50 — 패산 정보 한 줄", () => {
  const row = fnBody("WallPeekRow");
  const own = fnBody("OwnArea");
  const ctl = fnBody("ActiveAugmentControl");

  it("세 스트립이 한 컴포넌트로 모였다 — 옛 클래스는 코드·CSS 어디에도 없다", () => {
    for (const cls of ["next-tsumo-strip", "bottom-deal-strip", "foresight-strip"]) {
      expect(APP_CODE, cls).not.toContain(cls);
      expect(CSS, cls).not.toMatch(new RegExp(`\\.${cls}\\b`));
    }
    expect(row).toContain('className="wall-peek-sec wall-peek-foresight"');
    expect(row).toContain('className="wall-peek-sec wall-peek-triple"');
    expect(row).toContain("wall-peek-sec wall-peek-bottom");
  });

  it("OwnArea가 손패 레일 바로 위(액션 바·타이머 뒤)에 한 번 그린다", () => {
    expect(own.split("<WallPeekRow").length - 1).toBe(1);
    const at = own.indexOf("<WallPeekRow");
    expect(at).toBeGreaterThan(own.indexOf("<PromptTimer"));
    expect(at).toBeLessThan(own.indexOf('className="own-hand-rail"'));
  });

  it("방향 통일 — 예지·삼세 예지는 뒤집어 그리고, 가장 먼저 나올 패에 «다음» 뱃지", () => {
    expect(row).toContain('<span className="wall-peek-badge">다음</span>');
    // 예지·삼세 예지 둘 다 .reverse() — 오른쪽 끝이 앞(pos/i === 0)
    expect(row.split(".reverse()").length - 1).toBe(2);
    expect(row).toContain('pos === 0 ? " wall-peek-next" : ""');
    expect(row).toContain('i === 0 ? " wall-peek-next" : ""');
    // 밑장빼기는 원래 오른쪽 끝(마지막)이 맨 밑장이다
    expect(row).toContain("const isNext = i === bottom.ids.length - 1;");
  });

  it("미니 패 26×37 하나, 좁은 화면은 아이콘만 + 줄 넘김", () => {
    expect(CSS).toMatch(/\.wall-peek-cell \.tile-mini \{\s*width: 26px;\s*height: 37px;/);
    expect(CSS).toMatch(/\.wall-peek-row \{[^}]*flex-wrap: wrap;/);
    const narrow = CSS.slice(CSS.indexOf("@container ui (max-width: 700px) {\n  .wall-peek-sec"));
    expect(narrow.slice(0, 400)).toContain(".wall-peek-name");
  });

  it("예지는 OwnArea가 focusAv에서 읽는다 — 관전자에게도 보인다", () => {
    expect(own).toContain("const foresightPeek = useMemo<TileKind[]>(() => foresightPeekOf(focusAv), [focusAv]);");
    // 자리 라벨은 초점 좌석(me) 기준
    expect(own).toContain("relativeSeatLabel(me.seat, s, dir, seatCount)");
    // 컨트롤 안의 공개 패 스트립은 걷혔다 — 탭만 남는다
    expect(ctl).not.toContain("wall-peek");
    expect(ctl).toContain('className="rinshan-pick-panel foresight-tab"');
  });

  it("재배열 탭 여닫이는 OwnArea가 쥐고, 재배열이 열리면 탭이 곧바로 뜬다(자동 열기 유지)", () => {
    expect(own).toContain("const [foresightTab, setForesightTab] = useState(false);");
    const eff = own.indexOf("setForesightTab(foresightReorderable);");
    expect(eff).toBeGreaterThan(0);
    expect(own.slice(eff, eff + 80)).toContain("[foresightReorderable]");
    // 컨트롤은 props로 받는다 — 자기 상태를 따로 두면 줄의 [순서 바꾸기]와 탭이 어긋난다
    expect(own).toContain("foresightTabOpen={foresightTab}");
    expect(own).toContain("onForesightTab={setForesightTab}");
    expect(ctl).toContain("const foresightTab = props.foresightTabOpen === true;");
    expect(ctl).toContain("{foresightTab && foresightReorderable");
  });

  it("[순서 바꾸기]는 줄에 있고 관전·강제 선택 중엔 없다", () => {
    expect(row).toContain("순서 바꾸기 (국에 1회)");
    expect(ctl).not.toContain("순서 바꾸기 (국에 1회)");
    expect(own).toContain("!isSpectator && foresightReorderable && !foresightTab ? () => setForesightTab(true) : null");
    const at = own.indexOf("const foresightReorderable =");
    expect(own.slice(at, own.indexOf(";", at))).toContain("!forcedPick");
  });
});

describe("B12 U35 — 밑장 칸을 눌러 예약", () => {
  const row = fnBody("WallPeekRow");
  const own = fnBody("OwnArea");

  it("예약 콜백은 관전·강제 선택·예약됨·후보 없음이면 null이다", () => {
    const at = own.indexOf("const reserveBottomDeal =");
    expect(at).toBeGreaterThan(0);
    const body = own.slice(at, own.indexOf(": null;", at));
    expect(body).toContain("!isSpectator");
    expect(body).toContain("!forcedPick");
    expect(body).toContain("!bottomDealArmed");
    expect(body).toContain("bottomDealOpt !== undefined");
    // ✦ 경로(activate)와 같다 — 리치 모드를 풀고 즉시 제출
    expect(body.indexOf("sel.exitRiichiMode();")).toBeLessThan(body.indexOf("sel.submit(bottomDealOpt);"));
    expect(own).toContain('(myPrompt?.options ?? []).find((o) => o.type === "bottom_deal")');
    expect(own).toContain("onReserve: reserveBottomDeal");
  });

  it("누르는 곳은 태그와 밑장 칸뿐이다 — 섹션 전체가 버튼이 아니다", () => {
    expect(row.split("onClick={bottom.onReserve}").length - 1).toBe(2);
    expect(row).toContain("— 눌러서 다음 쯔모 예약");
    expect(row).toContain('className="wall-peek-cell wall-peek-next wall-peek-arm-cell"');
    // 섹션 div 자체에는 onClick이 없다
    const sec = row.indexOf("wall-peek-sec wall-peek-bottom");
    expect(row.slice(sec, row.indexOf(">", sec))).not.toContain("onClick");
  });

  it("예약 뒤 «(예약됨)»과 bottom-deal-armed 표시가 남는다", () => {
    expect(row).toContain('bottom.armed ? " bottom-deal-armed" : ""');
    expect(row).toContain("(예약됨)");
    expect(CSS).toContain(".wall-peek-bottom.bottom-deal-armed");
  });

  it("좁은 화면에서도 «(예약됨)» 글자는 숨기지 않는다 — 테두리 색만으로는 예약 여부를 못 읽는다(리뷰)", () => {
    const start = CSS.indexOf("@container ui (max-width: 700px) {\n  .wall-peek-sec");
    expect(start).toBeGreaterThan(-1);
    const narrow = CSS.slice(start, CSS.indexOf("\n}\n", start));
    expect(narrow).toContain(".wall-peek-name");
    expect(narrow).not.toContain(".wall-peek-armed-note");
  });

  it("밑장 «다음» 뱃지는 예약 뒤에만 — 예약 전엔 «밑»이라 예지·삼세 예지의 «다음»과 겹치지 않는다(리뷰)", () => {
    expect(row).toContain('const bottomBadge = bottom.armed ? nextBadge : <span className="wall-peek-badge">밑</span>;');
    const sec = row.indexOf("{bottom.ids.length > 0 ? (");
    expect(sec).toBeGreaterThan(-1);
    // 밑장 섹션은 nextBadge를 직접 쓰지 않는다
    expect(row.slice(sec)).not.toContain("{nextBadge}");
    expect(row.slice(sec)).not.toContain("? nextBadge");
  });

  it("예지 맨 앞 칸의 «다음»은 내 쯔모일 때만 — 남의 쯔모에 달면 삼세 예지의 «다음»과 둘이 된다(라운드 2 리뷰)", () => {
    expect(row).toContain("{pos === 0 && isMine ? nextBadge : null}");
    expect(row).not.toContain("{pos === 0 ? nextBadge : null}");
  });

  it("밑장 태그는 괄호를 둘 잇지 않는다 — 예약 뒤엔 «(밑에서)»를 뗀다(라운드 2 리뷰)", () => {
    expect(row).toContain('밑장빼기{bottom.armed ? "" : " (밑에서)"}');
    expect(row).not.toContain("밑장빼기 (밑에서)</span>");
  });

  it("재배열 가능 여부는 OwnArea 한 곳에서 계산해 컨트롤에 prop으로 내린다(라운드 2 리뷰)", () => {
    const ctl = fnBody("ActiveAugmentControl");
    expect(own).toContain("foresightReorderable={foresightReorderable}");
    expect(ctl).toContain("const foresightReorderable = props.foresightReorderable === true && foresightPeek.length === 4;");
    // 컨트롤에는 foresight_order 후보 검사 식이 더는 없다
    expect(ctl).not.toContain('.some((o) => o.type === "foresight_order")');
  });

  it("예약 태그 버튼은 좁은 화면에서도 접근 가능한 이름이 있다(리뷰)", () => {
    expect(row).toContain('aria-label="밑장빼기 — 다음 쯔모를 패산 맨 밑장으로 예약"');
    expect(row).not.toContain('className="wall-peek-cta-short" aria-hidden');
  });
});

describe("B12 U50 리뷰 — 관전 화면의 예지 자리 라벨", () => {
  it("관전자에게는 초점 좌석 자기 칸을 «나»가 아니라 «본인»으로 적는다", () => {
    const row = fnBody("WallPeekRow");
    const own = fnBody("OwnArea");
    expect(own).toContain('selfLabel: isSpectator ? "본인" : "나",');
    expect(row).toContain("const shown = isMine ? foresight.selfLabel : seatLabel;");
    // ★·푸른 테두리(isMine)는 그대로 «나» 판정으로 붙는다
    expect(row).toContain('const isMine = seatLabel === "나";');
  });
});
