/**
 * docs/59 B14 «재배열·영상패 모달·타이머 문구» 회귀 가드 (2026-09-25).
 *
 * U44 영상 정찰: 칸마다 ◀▶·[이 패와 교환]을 걷고 «내 쯔모패» 칸 하나로 교환을 모은다. 항등 순서 +
 *     교환 없음이면 확정이 꺼진다(국 1회 사용권이 효과 없이 타고 거짓 공개가 나가던 구멍).
 * U45 예지 탭 닫기 «이 창 유지 (닫기)»(1504e1b 일괄 치환 사고) → «바꾸지 않고 닫기».
 * U46 닫기 문구 통일 + 닫기가 있는 고르기 창의 Esc(연출 건너뛰기에 양보, 등가교환엔 없음).
 * U47·U48 절벽 위 꽃: 지금 뽑은 패 칸 = 그대로 두기, 재열기는 손패 위 안내 줄로(플로팅 알약 제거).
 * U49 PickTimer의 «자동으로 선택됩니다» → 실제 폴백 문구.
 * U06 단색 세계·편식 행 라벨에 바뀌는 장수.
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
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** `function name(` 부터 다음 최상위 `\n}\n` 까지 */
function fnBody(name: string): string {
  const at = APP_CODE.indexOf(`function ${name}(`);
  expect(at, `${name} 함수가 없다`).toBeGreaterThan(-1);
  return APP_CODE.slice(at, APP_CODE.indexOf("\n}\n", at));
}

/** 표식부터 그 창의 포털 끝(`document.body,`)까지 */
function portalFrom(src: string, marker: string): string {
  const at = src.indexOf(marker);
  expect(at, `${marker} 가 없다`).toBeGreaterThan(-1);
  return src.slice(at, src.indexOf("document.body,", at));
}

describe("B14 U44 — 영상 정찰 창", () => {
  const ctl = fnBody("ActiveAugmentControl");
  const modal = portalFrom(ctl, '{pickModal === "rinshan_arrange" && rinshanCount > 0 ? createPortal(');

  it("칸마다 붙던 ◀▶·[이 패와 교환]이 없다 — 코드·CSS 어디에도", () => {
    // (새 표식 rinshan-arr-taken과 앞머리가 같아 «뒤에 n이 오지 않는» 꼴로 찾는다)
    for (const cls of ["rinshan-arr-nudge", "rinshan-arr-take", "rinshan-arr-grab"]) {
      const re = new RegExp(`${cls}(?!n)`);
      expect(APP_CODE).not.toMatch(re);
      expect(CSS_CODE).not.toMatch(re);
    }
    expect(ctl).not.toContain("submitRinshan(");
    expect(modal).not.toContain("이 패와 교환");
  });

  it("칸은 버튼 하나 — 드래그·탭-탭·←/→ 키가 한 칸에 모인다", () => {
    expect(modal).toContain("data-reorder-pos={pos}");
    expect(modal).toContain("draggable");
    expect(modal).toContain("onKeyDown={(e) => reorderArrowKey(e, pos, rinshanCount, moveRinshan)}");
    expect(modal).toContain("moveRinshan(rinshanDragFrom, pos)");
  });

  it("«내 쯔모패» 칸이 교환 대상을 받는다 — 교환 후보가 있을 때만 선다", () => {
    expect(ctl).toContain("const rinshanDrawnId = view.round.myDrawnTile;");
    // 교환 후보(서버의 canTake)가 하나라도 있어야 칸·교환 문장이 선다
    expect(ctl).toContain('[...rinshanArrByKey.keys()].some((k) => !k.endsWith("|-"))');
    expect(modal).toContain("{rinshanTakeable && rinshanDrawnTile !== undefined ? (");
    expect(modal).toContain("{rinshanTakeable ? (");
    expect(modal).toContain('className={`foresight-tab-cell rinshan-arr-drawn');
    // 끌어 놓기와 «집은 뒤 누르기» 두 길
    const cell = modal.slice(modal.indexOf("rinshan-arr-drawn"), modal.indexOf("{rinshanOrder.map("));
    expect(cell).toContain("markRinshanTake(rinshanDragFrom)");
    expect(cell).toContain("onDrop=");
    expect(cell).toContain("setRinshanTake(null)");
    // 끌어 놓기는 «여기에 둔다» — 토글하지 않는다(누르기만 토글, 라운드 2 리뷰)
    expect(cell).toContain("markRinshanTake(rinshanDragFrom, false)");
    expect(ctl).toContain("setRinshanTake((cur) => (toggle && cur === orig ? null : orig));");
  });

  it("교환 대상은 원래 인덱스로 들고, 제출 때 재배열 후 자리로 바꾼다(take 규약)", () => {
    expect(ctl).toContain("const [rinshanTake, setRinshanTake] = useState<number | null>(null);");
    expect(ctl).toContain("const pos = rinshanOrder.indexOf(rinshanTake);");
    expect(ctl).toContain(
      '`${rinshanOrder.join(",")}|${rinshanTakePos === null ? "-" : String(rinshanTakePos)}`',
    );
  });

  it("항등 순서 + 교환 없음이면 확정이 꺼지고 «아직 바꾼 것이 없습니다»", () => {
    expect(ctl).toContain("const rinshanChanged = rinshanMoved || rinshanTakePos !== null;");
    expect(modal).toContain("disabled={!rinshanChanged || rinshanConfirmOpt === undefined}");
    expect(modal).toContain("아직 바꾼 것이 없습니다");
    const confirm = ctl.slice(ctl.indexOf("const confirmRinshan = (): void => {"));
    expect(confirm.slice(0, 200)).toContain("if (!rinshanChanged || rinshanConfirmOpt === undefined) return;");
  });

  it("하단은 [확정]·[닫기] 둘 — 교환이 있으면 확정 라벨이 말한다", () => {
    const actions = modal.slice(modal.indexOf('className="foresight-tab-actions"'));
    expect(actions.match(/<button/g)?.length).toBe(2);
    expect(actions).toContain('"이 순서로 확정 + 고른 패와 교환" : "이 순서로 확정"');
    expect(actions).toContain("사용하지 않고 닫기");
  });

  it("쯔모패는 맨 앞이 아니라 **그 패가 있던 자리**에 들어간다(리듀서와 같은 말)", () => {
    expect(modal).not.toContain("맨 앞자리에 들어갑니다");
    expect(modal).toContain("그 패가 있던 자리에 들어갑니다");
  });
});

describe("B14 U45 — 예지 재배열 탭", () => {
  const ctl = fnBody("ActiveAugmentControl");
  const tab = portalFrom(ctl, 'className="rinshan-pick-panel foresight-tab"');

  it("닫기는 «바꾸지 않고 닫기» — «이 창 유지 (닫기)»는 없다", () => {
    expect(APP_CODE).not.toContain("이 창 유지 (닫기)");
    expect(tab).toContain("바꾸지 않고 닫기");
    expect(tab).toContain("onClick={closeForesightTab}");
  });

  it("부제가 닫으면 옮긴 순서가 버려진다고 미리 말한다", () => {
    expect(tab).toContain("닫으면 옮긴 순서는 버려집니다");
  });

  it("영상 정찰과 같은 ←/→ 키", () => {
    expect(tab).toContain("data-reorder-pos={pos}");
    expect(tab).toContain("onKeyDown={(e) => reorderArrowKey(e, pos, foresightOrder.length, moveForesight)}");
  });

  it("1504e1b 일괄 치환에 망가진 주석을 되돌렸다", () => {
    expect(APP).toContain("값이 그대로면 객체도 그대로 두기 위한 비교");
    expect(APP).not.toContain("객체도 이 창 유지 위한 비교");
  });
});

describe("B14 U46 — 닫기 문구·Esc", () => {
  it("«발동하지 않고 닫기»·«가져오지 않고 진행»이 코드에 없다", () => {
    expect(APP_CODE).not.toContain("발동하지 않고 닫기");
    expect(APP_CODE).not.toContain("가져오지 않고 진행");
  });

  it("useModalEsc — 입력 칸·연출 건너뛰기·다른 창에 양보한다", () => {
    const hook = fnBody("useModalEsc");
    expect(hook).toContain('if (e.key !== "Escape" || e.defaultPrevented || isTypingTarget(e.target)) return;');
    expect(hook).toContain("document.querySelector(MODAL_ESC_YIELD_SELECTOR) !== null");
    const sel = APP_CODE.slice(APP_CODE.indexOf("const MODAL_ESC_YIELD_SELECTOR ="));
    expect(sel.slice(0, 200)).toContain(".prod-skip");
    // 고르기 창 자신에게 비켜서면 영영 안 닫힌다
    expect(sel.slice(0, 200)).not.toContain(".rinshan-pick-overlay");
  });

  it("ActionHotkeys 밖에 있다(그쪽은 Esc를 쓰지 않는다)", () => {
    expect(fnBody("ActionHotkeys")).not.toContain("useModalEsc");
  });

  it("닫기가 있는 창에만 건다 — 등가교환 take(닫기 없음)는 아니다", () => {
    const own = fnBody("OwnArea");
    expect(own).toContain("useModalEsc(() => setRinshanDismissed(true), canPickRinshan && !rinshanDismissed);");
    expect(own).not.toMatch(/useModalEsc\([^;]*swap/);
    const ctl = fnBody("ActiveAugmentControl");
    expect(ctl).toContain("pickModal !== null || (foresightTab && foresightReorderable),");
    // 재배열 창의 Esc는 집은 패부터 내려놓는다
    const esc = ctl.slice(ctl.indexOf("useModalEsc("));
    expect(esc.slice(0, 500)).toContain("if (foresightDragFrom !== null) setForesightDragFrom(null);");
    expect(esc.slice(0, 500)).toContain('if (pickModal === "rinshan_arrange" && rinshanDragFrom !== null) {');
    // 전체에서 호출은 두 곳뿐(+ 정의)
    expect(APP_CODE.match(/useModalEsc\(/g)?.length).toBe(3);
  });
});

describe("B14 U47·U48 — 절벽 위 꽃", () => {
  const own = fnBody("OwnArea");
  const modal = portalFrom(own, "{canPickRinshan && !rinshanDismissed ? createPortal(");

  it("지금 뽑은 패 칸이 있고, 그 칸이 곧 «그대로 두기»다", () => {
    expect(own).toContain("const bloomDrawnTile = hasDrawn && drawnId !== null ? view.tiles[drawnId] : undefined;");
    expect(modal).toContain("rinshan-slot-drawn");
    expect(modal).toContain("지금 패 그대로 두기");
    expect(modal).toContain("고른 영상패가 지금 뽑은 패와 맞바뀝니다");
    expect(CSS_CODE).toContain(".rinshan-slot-drawn {");
  });

  it("플로팅 재열기 알약(.rinshan-reopen)이 코드·CSS에서 사라졌다", () => {
    expect(APP_CODE).not.toContain("rinshan-reopen");
    expect(CSS_CODE).not.toContain("rinshan-reopen");
  });

  it("재열기는 손패 위 안내 줄 — 다른 무장 안내가 먼저다", () => {
    const at = own.indexOf(") : canPickRinshan && rinshanDismissed ? (");
    expect(at).toBeGreaterThan(-1);
    // 일반 무장 안내 분기보다 뒤(= 우선순위가 낮다)
    expect(own.indexOf(") : armedAug !== null ? (")).toBeLessThan(at);
    const line = own.slice(at, at + 600);
    expect(line).toContain('className="arm-hint arm-bloom"');
    expect(line).toContain("setRinshanDismissed(false)");
    expect(line).toContain("영상패 고르기");
  });
});

describe("B14 U49 — 모달 타이머 문구", () => {
  it("«자동으로 선택됩니다»가 없고, 기본 문구는 실제 폴백(버림 + 미사용)", () => {
    expect(APP_CODE).not.toContain("자동으로 선택됩니다");
    expect(APP_CODE).toContain(
      'const PICK_TIMER_FALLBACK = "시간이 다 되면 패 한 장이 자동으로 버려지고 이 증강은 사용되지 않습니다";',
    );
    expect(fnBody("PickTimer")).toContain("{props.fallback ?? PICK_TIMER_FALLBACK}");
  });

  it("등가교환 take(서버가 대신 고르는 유일한 창)와 예지 탭은 제 문구를 넘긴다", () => {
    expect(APP_CODE).toContain(
      '<PickTimer deadline={props.promptDeadline} fallback="시간이 다 되면 남은 조합 중 하나로 자동 교환합니다" />',
    );
    expect(APP_CODE).toContain("<PickTimer deadline={props.promptDeadline ?? null} fallback={FORESIGHT_TIMER_FALLBACK} />");
    expect(APP_CODE).toContain("재배열 기회도 함께 사라집니다");
  });

  it("deadline은 늘 첫 속성 — 모든 <PickTimer 가 `<PickTimer deadline=` 꼴", () => {
    const all = APP_CODE.match(/<PickTimer\b/g)?.length ?? 0;
    const first = APP_CODE.match(/<PickTimer deadline=/g)?.length ?? 0;
    expect(all).toBeGreaterThan(0);
    expect(first).toBe(all);
  });
});

describe("B14 U06 — 단색 세계·편식 행 라벨", () => {
  it("무늬 이름 옆에 바뀌는 장수", () => {
    const ctl = fnBody("ActiveAugmentControl");
    expect(ctl).toContain("const changed = preview.filter((p) => p.tile.attrs.conjured === true).length;");
    expect(ctl).toContain("{` — ${changed}장 바뀜`}");
  });
});
