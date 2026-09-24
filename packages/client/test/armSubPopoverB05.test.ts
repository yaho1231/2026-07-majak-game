/**
 * docs/59 B05 «armSub → 앵커 팝오버» 회귀 가드 (2026-09-25).
 *
 * U12 한 패의 변형 고르기(염색·연금술·분열·위조)는 화면을 덮는 전면 모달이 아니라 누른 패
 *     바로 위에 붙는 팝오버다 — 나머지 손패가 보인 채로 고른다.
 * U13 분열은 재료로 사라질 패를 팝오버와 손패(✕) 양쪽에 확정 직전까지 보여 준다.
 * U15 위조는 머리 줄이 «간파한 대기패 중»이라는 맥락을 적는다.
 *
 * 다른 클라 테스트와 같은 **정적 소스 스캔**이다(렌더하지 않는다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (p: string): string => readFileSync(join(HERE, p), "utf8");

const APP = read("../src/App.tsx");
const CSS = read("../src/styles.css");

/** 주석을 걷어낸 코드만 — 주석에 적힌 옛 형태가 검사에 걸리지 않게 한다 */
function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);
const CSS_CODE = CSS.replace(/\/\*[\s\S]*?\*\//g, "");

/** CSS 규칙 하나의 본문 (선택자가 정확히 일치하는 첫 블록) */
function rule(sel: string): string {
  const at = CSS_CODE.indexOf(`\n${sel} {`);
  expect(at, `${sel} 규칙이 없다`).toBeGreaterThan(-1);
  return CSS_CODE.slice(at, CSS_CODE.indexOf("}", at));
}

/** armSub 팝오버 JSX — 여는 분기부터 body 포털까지 */
function popover(): string {
  const at = APP_CODE.indexOf("{armSub !== null ? (() => {");
  expect(at, "armSub 팝오버 분기가 없다").toBeGreaterThan(-1);
  return APP_CODE.slice(at, APP_CODE.indexOf("document.body,", at) + "document.body,".length);
}

describe("U12 한 패의 변형 고르기는 누른 패 위 팝오버다", () => {
  it("전면 오버레이 없이 body 포털 + data-arm-zone 으로 붙는다", () => {
    const pop = popover();
    expect(pop).toContain('className="arm-sub-pop"');
    // 2026-08-07: 무장 해제 pointerdown 감시가 후보 클릭을 가로채지 않게
    expect(pop).toContain('data-arm-zone="1"');
    // 2026-08-06: `.own-area` transform이 fixed를 가두지 않게
    expect(pop.trimEnd().endsWith("document.body,")).toBe(true);
    expect(pop).not.toContain("rinshan-pick-overlay");
  });

  it("리뷰 1차: 손패 위라 PromptTimer를 덮으므로 머리 줄에 남은 시간을 세운다", () => {
    expect(popover()).toContain("<PickTimer deadline={props.promptDeadline} />");
    // «자동으로 선택됩니다»는 이 창에선 틀린 말(시간이 다 되면 쯔모패를 버린다) — 숨긴다
    expect(CSS_CODE).toMatch(/\.arm-sub-pop \.pick-timer-note \{\s*display: none;/);
  });

  it("칸마다 결과 패만 그린다 — 원래 패는 손패에서 들어 올린다", () => {
    const pop = popover();
    expect(pop).not.toContain("view.tiles[armSub.tileId]");
    expect(pop).toContain("splitPreview(view, o)");
    expect(pop).toContain("morphedTile(view, o)");
    expect(pop).toContain('{optionDetail(view, o) || "이렇게 바꾸기"}');
    expect(APP_CODE).toContain('armSub?.tileId === id ? " hand-sub-open" : ""');
    expect(rule(".hand-sub-open")).toContain("translateY(-14px)");
  });

  it("앵커는 화면 좌표를 레이아웃 좌표로 되돌려 잡는다", () => {
    expect(APP_CODE).toContain("const r = e.currentTarget.getBoundingClientRect();");
    expect(APP_CODE).toContain(
      "anchor: { x: toLayoutPx(r.left + r.width / 2), top: toLayoutPx(box.top) },",
    );
    // 좌우 8px 안으로 접는다
    expect(APP_CODE).toContain(
      "setArmSubLeft(Math.min(Math.max(armSub.anchor.x, half + 8), v.w - half - 8));",
    );
  });

  it("배경·흐림 없이 위로 세운다 — 후보가 넘치면 한 줄 가로 스크롤", () => {
    const pop = rule(".arm-sub-pop");
    expect(pop).toContain("position: fixed");
    expect(pop).toContain("transform: translate(-50%, -100%)");
    expect(pop).toContain("z-index: 120");
    expect(pop).not.toContain("inset: 0");
    expect(pop).not.toContain("backdrop-filter");
    const row = rule(".arm-sub-pop-row");
    expect(row).toContain("flex-wrap: nowrap");
    expect(row).toContain("overflow-x: auto");
  });

  it("Esc·바깥 누르기·크기/스크롤 변화·새 프롬프트로 닫되, 무장은 건드리지 않는다", () => {
    const at = APP_CODE.indexOf("const armSubRef = useRef<HTMLDivElement | null>(null);");
    expect(at).toBeGreaterThan(-1);
    const block = APP_CODE.slice(at, APP_CODE.indexOf("}, [armSub !== null]);", at));
    expect(block).toContain("setArmSub(null);\n  }, [props.promptSeq]);");
    expect(block).toContain('e.key !== "Escape"');
    expect(block).toContain('document.addEventListener("pointerdown", onDown, true);');
    expect(block).toContain('window.addEventListener("resize", close);');
    expect(block).toContain('window.addEventListener("scroll", onScroll, true);');
    // 손패와 무관한 스크롤(기록창 자동 스크롤·팝오버 안 가로 스크롤)로는 닫지 않는다
    expect(block).toContain("!t.contains(hand)");
    // 다른 후보 패를 누르면 그 패의 click이 팝오버를 옮긴다
    expect(block).toContain('.closest(".hand-armable")');
    expect(block).not.toContain("sel.arm(null)");
  });

  it("리뷰 1차: 손패를 끌기 시작하면 닫는다 — 팝오버가 옛 자리에 남지 않게", () => {
    expect(APP_CODE).toContain("const handDragMoved = drag?.moved === true;");
    expect(APP_CODE).toMatch(/if \(handDragMoved\) setArmSub\(null\);\s*\}, \[handDragMoved\]\);/);
  });

  it("리뷰 1차: 키보드로 열면 첫 후보로 초점, Esc·✕로 닫으면 누른 손패로 되돌린다", () => {
    expect(APP_CODE).toContain("armSubFocusBack.current = e.detail === 0 ? e.currentTarget : null;");
    expect(APP_CODE).toContain('?.querySelector<HTMLElement>(".arm-sub-pop-opt")?.focus();');
    expect(APP_CODE).toContain("if (back?.isConnected === true) back.focus();");
    // Esc와 ✕가 같은 길로 닫는다
    const at = APP_CODE.indexOf("const armSubRef = useRef<HTMLDivElement | null>(null);");
    const block = APP_CODE.slice(at, APP_CODE.indexOf("}, [armSub !== null]);", at));
    expect(block).toMatch(/e\.stopPropagation\(\);\s*closeArmSubToHand\(\);/);
    expect(popover()).toContain("onClick={closeArmSubToHand}");
  });

  it("리뷰 2차: 후보 확정도 같은 길로 닫고, 어느 길로 닫혔든 돌려줄 곳을 비운다", () => {
    // 키보드로 고르면 팝오버가 사라지며 초점이 body로 떨어졌다
    expect(popover()).toMatch(/sel\.submit\(o\);\s*closeArmSubToHand\(\);/);
    expect(APP_CODE).toMatch(
      /if \(armSub === null\) \{\s*armSubFocusBack\.current = null;\s*return;\s*\}/,
    );
  });

  it("리뷰 2차: 열린 패를 한 번 더 누르면 접는다 — 확정 분기 뒤, 여는 분기 앞", () => {
    const submit = APP_CODE.indexOf("sel.submit(opts[0]!);");
    expect(submit).toBeGreaterThan(-1);
    const toggle = APP_CODE.indexOf("} else if (armSub?.tileId === id) {", submit);
    expect(toggle).toBeGreaterThan(submit);
    const open = APP_CODE.indexOf("setArmSub({", submit);
    expect(open).toBeGreaterThan(toggle);
    // 무장은 그대로 — 팝오버만 접는다
    const body = APP_CODE.slice(toggle, open);
    expect(body).toMatch(/\{\s*closeArmSubToHand\(\);\s*\} else \{/);
    expect(body).not.toContain("sel.arm(null)");
  });
});

describe("U13 분열 — 사라질 재료가 확정 직전까지 보인다", () => {
  it("팝오버 머리에 재료 한 칸 — 서버 채널(doomedTileIdsOf)을 그대로 읽는다", () => {
    const pop = popover();
    expect(pop).toContain(
      'subType === "split_tile" ? doomedTileIdsOf(view, "split_tile", armSub.tileId)[0] : undefined;',
    );
    expect(pop).toContain("재료로 사라짐:");
    // 재료가 없으면 줄을 숨긴다
    expect(pop).toContain("material !== undefined");
  });

  it("팝오버가 열린 동안 손패의 ✕는 그 대상 기준으로 고정된다", () => {
    // B06(U16): 두 번 누르기로 들어 올린 패(armedTileId)도 hover보다 앞서 고정한다
    expect(APP_CODE).toContain("const t = armSub?.tileId ?? armedTileId ?? hoverId;");
    expect(APP_CODE).toContain("}, [armedAug, armSub, armedTileId, hoverId, view, doomedHint]);");
    // armSub가 doomedNow보다 먼저 선언돼야 한다
    expect(APP_CODE.indexOf("const [armSub, setArmSub] = useState<")).toBeLessThan(
      APP_CODE.indexOf("const doomedNow = useMemo<"),
    );
  });
});

describe("U15 위조 — 머리 줄이 맥락을 적는다", () => {
  it("peek_forge 는 «간파한 대기패 중»", () => {
    expect(popover()).toContain('"간파한 대기패 중 무엇으로 바꿀까요"');
  });
});
