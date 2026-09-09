/**
 * 클라이언트 셸 가드 (2026-08-19).
 *
 * 판 밖의 화면들(첫 화면·홈·도감·규칙·제보·티어표)을 **게임 클라이언트의 창**으로
 * 통일하면서 생긴 규칙들이다. 셋 다 "깨져도 콘솔은 조용한" 종류라 정적 스캔으로
 * 못을 박는다 (이 패키지에는 jsdom이 없다 — homeCardLayout과 같은 방식).
 *
 * 1. **창틀이 찌그러진다** — `.site-bar` 는 세로 flex 컨테이너(`.home`·`.codex`)의
 *    첫 자식이라 기본 `flex-shrink: 1` 을 갖는다. 좁은 화면에서 내용이 두 줄로
 *    접히면 컨테이너가 이 줄을 `min-height` 까지 눌러, 안의 44px 단추들이 아래
 *    도구줄 위로 넘쳐 겹쳤다 (375px 실측: 내용 60px → 상자 40px).
 * 2. **첫 화면이 가운데로 쪼그라든다** — `.lobby` 가 `place-items: center` 라,
 *    display 를 block/flex 로 되돌려도 Chrome 123+ 는 블록 컨테이너에서도
 *    `justify-items` 를 적용해 자식을 shrink-to-fit 시킨다 (1280px 실측:
 *    상태 줄이 439px 로 쪼그라들어 화면 한가운데 떴다).
 * 3. **이모지가 돌아온다** — 아이콘 자리의 이모지는 기기마다 다른 그림·다른
 *    기준선이 와서 줄이 흔들린다. 판 밖 화면에서는 CSS 로 그린 표식(`.mk-*`)만 쓴다.
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
const CSS_CODE = code(CSS);

/**
 * 이 선택자가 **선택자 목록의 한 항목으로** 들어 있는 모든 블록의 선언부.
 *
 * ⚠ `indexOf(sel + " {")` 로 찾으면 두 가지를 놓친다: 여럿을 쉼표로 묶은 규칙
 * (`.kv > dd,\n.kv > .kv-v {`) 은 아예 못 찾고, 같은 선택자가 여러 번 나오면
 * (기본 규칙 + 좁은 화면 덮어쓰기) 파일에서 먼저 나온 쪽만 본다 — 실제로
 * `.home-join input` 은 모바일 블록이 먼저 걸려서 기본 규칙을 못 봤다.
 */
function rule(sel: string): string {
  const out: string[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  for (let m = re.exec(CSS_CODE); m !== null; m = re.exec(CSS_CODE)) {
    // 캡처 그룹은 타입상 `string | undefined` 다 (noUncheckedIndexedAccess) — 기본값으로 받는다
    const [, selPart = "", decls = ""] = m;
    const sels = selPart.split(",").map((x) => x.trim().replace(/\s+/g, " "));
    if (sels.includes(sel)) out.push(decls);
  }
  return out.join("\n");
}

describe("창틀은 눌리지 않는다", () => {
  it("`.site-bar` 는 flex 컨테이너 안에서 줄어들지 않는다", () => {
    // 이게 빠지면 좁은 화면에서 상단 바가 min-height 까지 눌려 안의 단추가
    // 아래 줄 위로 넘친다. `flex: none` = shrink 0.
    expect(rule(".site-bar")).toMatch(/flex:\s*none/);
  });

  it("첫 화면은 `.lobby` 의 가운데 정렬을 되돌린다", () => {
    // `place-items: center` 가 남아 있으면 블록 자식이 shrink-to-fit 된다
    // (Chrome 123+ 의 블록 컨테이너 justify-items 적용).
    expect(rule(".lobby-landing")).toMatch(/place-items:\s*normal/);
  });

  it("상태 줄은 첫 화면과 홈이 같은 것을 쓴다", () => {
    // 로그인 전후로 창틀이 달라지면 같은 클라이언트로 읽히지 않는다.
    expect(APP_CODE).toContain('<header className="site-bar landing-bar">');
    expect(APP_CODE).toContain('<header className="site-bar home-nav">');
    // 도감·규칙·티어표도 같은 줄을 쓴다 (전체화면으로 덮이는 화면들)
    expect(APP_CODE.match(/<header className="site-bar home-nav codex-nav">/g)?.length).toBe(3);
  });
});

describe("판 밖 화면에는 이모지 아이콘이 없다", () => {
  /**
   * 검사 대상은 **판 밖 화면의 마크업**이다. 판 위(액티브 버튼·드래프트 카드·
   * 지목 관계 표식)는 이번 정리 대상이 아니라 그대로 두었고, `CATEGORY_META.icon`
   * 처럼 양쪽이 함께 쓰는 값도 남아 있다 — 그래서 파일 전체가 아니라 **이 화면들의
   * 버튼·제목 문자열**만 본다.
   */
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{1F004}]/u;

  const SCREEN_STRINGS = [
    // 첫 화면 · 홈의 버튼과 제목
    "튜토리얼",
    "체험하기",
    "방 만들기",
    "진행하던 방으로 재접속",
    "연습 대국",
    "증강 도감 전체 보기",
    "증강 도감 열기",
    "티어표 전체 보기",
    "제보 게시판",
    "증강 테스트",
  ];

  for (const s of SCREEN_STRINGS) {
    it(`"${s}" 앞뒤에 이모지가 붙지 않는다`, () => {
      const at = APP_CODE.indexOf(s);
      expect(at).toBeGreaterThanOrEqual(0);
      // 앞 12자 안에 이모지가 있으면 아이콘으로 붙여 둔 것이다
      expect(APP_CODE.slice(Math.max(0, at - 12), at)).not.toMatch(EMOJI);
    });
  }

  it("홈 탭 이름은 글자만이다", () => {
    const at = APP_CODE.indexOf('{ id: "record"');
    expect(at).toBeGreaterThanOrEqual(0);
    expect(APP_CODE.slice(at, APP_CODE.indexOf("];", at))).not.toMatch(EMOJI);
  });

  it("표식은 CSS 로 그린다", () => {
    // 규칙과 도감은 **서로 다른** 표식이어야 한다 — 같으면 상단 바에 같은 단추가
    // 두 개 있는 것처럼 보인다(11px 로 줄면 구별이 안 된다).
    expect(CSS_CODE).toContain(".mk-doc");
    expect(CSS_CODE).toContain(".mk-grid");
    expect(APP_CODE).toMatch(/mk mk-doc[\s\S]{0,80}규칙/);
    expect(APP_CODE).toMatch(/mk-grid[\s\S]{0,80}도감/);
  });
});

describe("수치는 자리가 흔들리지 않는다", () => {
  it("고정폭 토큰이 있다", () => {
    expect(CSS_CODE).toMatch(/--mono:/);
    expect(rule(".num")).toMatch(/font-variant-numeric:\s*tabular-nums/);
  });

  it("방 코드는 고정폭이다", () => {
    // 사람이 옮겨 적는 값이다 — O 와 0, I 와 1 이 갈려야 한다.
    expect(rule(".home-join input")).toMatch(/font-family:\s*var\(--mono\)/);
  });

  it("사양표 값은 숫자만 고정폭 자리로 세운다", () => {
    // 글꼴 자체를 mono 로 두면 한글이 대체 글꼴로 떨어져 한 줄에 두 벌이 섞인다.
    const kv = rule(".kv > dd");
    expect(kv).toMatch(/font-variant-numeric:\s*tabular-nums/);
    expect(kv).not.toMatch(/font-family/);
  });
});

/**
 * 대기실 (2026-08-19, 2차).
 *
 * 첫 정리에서 대기실은 창틀(패널 기하)만 맞추고 안은 그대로 뒀더니, 판 위의 문법과
 * 판 밖의 문법이 한 화면에 섞여 남았다 (사용자 지적: "대기실도 애매하게 남아있어").
 * 남아 있던 것: 카드 위에 떠 있는 `.icon-btn` 넷, 그 아래 얹힌 정형구 단추, 점선
 * 두른 방 코드 상자, 둥근 상자로 흩어진 좌석 넷, 세로 그라디언트 시작 버튼.
 */
describe("대기실은 판 밖의 문법을 쓴다", () => {
  /**
   * 대기실 컴포넌트의 마크업만.
   *
   * ⚠ 끝 표시로 주석(`// ── 게임 테이블 ──`)을 쓰면 안 된다 — `code()` 가 주석을
   * 걷어내므로 indexOf 가 -1 을 돌려주고, `slice(start, -1)` 은 **파일 끝까지**를
   * 잘라 와서 판 위의 `.icon-btn` 이 딸려 들어온다(그래서 검사가 늘 실패했다).
   * 실제 식별자로 끊는다.
   */
  const WR_FROM = APP_CODE.indexOf('<div className="waitroom-card">');
  const WR_TO = APP_CODE.indexOf("function useDoraFx", WR_FROM);
  const WR = APP_CODE.slice(WR_FROM, WR_TO);

  it("머리 단추는 판 위 절대배치(.icon-btn)를 쓰지 않는다", () => {
    // `.icon-btn` 은 `position: absolute` 라 카드 위에 떠 버린다. 판이 없는 화면에서
    // 단추가 허공에 뜰 이유가 없다 — 창의 타이틀바로 내렸다.
    expect(WR_FROM).toBeGreaterThanOrEqual(0);
    expect(WR_TO).toBeGreaterThan(WR_FROM);
    expect(WR).not.toContain("icon-btn");
    expect(WR).toContain('<div className="wr-head">');
  });

  it("머리에 규칙·도감·설정·나가기가 모두 있다", () => {
    const head = WR.slice(WR.indexOf('<div className="wr-head">'), WR.indexOf("</div>", WR.indexOf("wr-head-x")));
    for (const fn of ["props.onOpenHelp", "props.onOpenCodex", "props.onLeave"]) {
      expect(head).toContain(fn);
    }
    expect(head).toContain("setSettingsOpen");
  });

  it("정형구 단추는 머리줄 안에서 흐름 배치다", () => {
    // 예전에는 `.waitroom-card .emote-bar { top: 64px }` 로 카드 위에 얹혀 방 코드
    // 상자를 가렸다. 파일 뒤쪽 규칙이라 앞의 흐름 배치를 덮는다 — 좌표를 비워 둔다.
    expect(rule(".wr-head .emote-bar")).toMatch(/position:\s*relative/);
    const late = rule(".waitroom-card .emote-bar");
    expect(late).toMatch(/top:\s*auto/);
    expect(late).not.toMatch(/top:\s*\d/);
  });

  it("방 코드는 눌러서 복사하는 **버튼**이다", () => {
    // `<div onClick>` 이었다 — 키보드로 닿지 않고 스크린리더에 누를 것으로 안 읽혔다.
    expect(WR).toMatch(/<button[^>]*className="waitroom-code"/);
  });

  it("좌석 넷은 한 목록이다", () => {
    // 저마다 둥근 상자로 띄우면 서로 무관한 카드 넷으로 보인다.
    const list = rule(".seat-list");
    expect(list).toMatch(/border:\s*1px solid var\(--chrome-line\)/);
    expect(rule(".seat-row")).toMatch(/border-top:/);
    // 빈 자리에 점선을 두르지 않는다 (점선 = 임시로 그려 둔 것)
    expect(rule(".seat-row.seat-empty")).not.toMatch(/dashed/);
    expect(rule(".waitroom-code")).not.toMatch(/dashed/);
  });

  it("자리 옮기기는 손패와 같은 포인터 드래그다 (HTML5 drag 아님)", () => {
    /*
     * 처음에는 HTML5 drag-and-drop(`draggable` + `onDragStart`)이었다. 그래서
     * **터치에서는 아예 끌리지 않았고**(모바일에 drag 이벤트가 오지 않는다),
     * 끄는 동안 줄이 움직이지 않아 판 위의 손패와 감각이 달랐다. 자리표 줄은
     * 손패와 같은 물건이어야 한다 — 포인터 이벤트로 잡고, 이웃 줄이 비켜선다.
     */
    expect(WR).toMatch(/onPointerDown=\{[\s\S]{0,80}beginSeatDrag/);
    // `seat-draggable`(클래스 이름)은 남는다 — 막는 것은 **속성** `draggable` 이다
    expect(WR).not.toMatch(/\sdraggable(=|[\s/>])/);
    expect(WR).not.toMatch(/onDragStart|onDrop\b/);
    // 손가락이 끄는 동안 브라우저가 그 제스처를 스크롤로 가져가면 줄이 안 따라온다
    expect(rule(".seat-row.seat-draggable")).toMatch(/touch-action:\s*none/);
    // 잡은 줄이 이웃 위로 올라오려면 배치 컨텍스트가 있어야 한다 (z-index는 인라인)
    expect(rule(".seat-row")).toMatch(/position:\s*relative/);
  });

  it("내가 끌어 옮긴 자리는 알림을 띄우지 않는다", () => {
    /*
     * 자리가 바뀌면 «당신은 O가입니다»를 알린다 — 자리 섞기·방장이 옮겨 준 경우에는
     * 내가 하지 않은 일이라 알려야 한다. 그런데 **내가 직접 끌어 옮길 때마다** 그
     * 알림이 떴다 (2026-09-09 사용자 지적). 표식은 `lobby` 하나로 소진돼야 한다 —
     * 남의 자리만 옮겼을 때 남아 있으면 바로 뒤의 「자리 섞기」 알림까지 삼킨다.
     */
    expect(APP_CODE).toMatch(/seatMoveByMe\.current = Date\.now\(\) \+ SEAT_MOVE_MUTE_MS/);
    expect(APP_CODE).toMatch(/const seatMovedByMe = Date\.now\(\) < seatMoveByMe\.current;\s*\n\s*seatMoveByMe\.current = 0;/);
    expect(APP_CODE).toMatch(/if \(!seatMovedByMe\) \{\s*\n\s*showToast\(`자리가 바뀌었습니다/);
  });

  it("빈자리도 진짜 자리다 — 방장이 눌러서 그 방위로 간다", () => {
    /*
     * 예전에는 자리 = 앉은 사람 목록의 몇 번째인가라, 동남서가 비어 있으면 방장은
     * 무조건 동가였다 (2026-09-09 사용자 지시: "북 빈자리를 클릭해서 들어가면 거기
     * 고정"). 서버 자리표(`seatOrder`)와 짝을 이루는 화면 쪽 손잡이다.
     */
    expect(WR).toMatch(/canPickEmptySeat && p === null/);
    expect(WR).toMatch(/props\.onMoveSeat\(lobby\.youId, i\)/);
    // ＋(친구 초대)와 그 목록을 누른 것은 자리 고르기가 아니다
    expect(WR).toMatch(/closest\("button,\.seat-invite"\)/);
    expect(rule(".seat-row.seat-pickable")).toMatch(/cursor:\s*pointer/);
  });

  it("끄는 동안 화면은 드래그 시작 시점의 자리표로 그린다", () => {
    /*
     * 서버가 되쏘는 `lobby`를 바로 그리면 안착 애니메이션 도중에 줄들이 새 순서로
     * 다시 그려져 «새로고침되면서 툭 들어가는» 모습이 됐다 (2026-09-09 사용자 지적).
     */
    expect(APP_CODE).toMatch(/const slots[^\n]*seatDrag !== null \? seatDrag\.snapshot : liveSlots/);
    expect(APP_CODE).toMatch(/snapshot: \[\.\.\.slots\]/);
  });

  it("시작·준비 버튼에 세로 그라디언트가 없다", () => {
    // 판 밖의 주 동작은 전부 평평한 채움 + 위 1px 하이라이트다(.btn-key).
    for (const sel of [".wr-start", ".wr-ready", ".wr-unready"]) {
      expect(rule(sel)).not.toMatch(/linear-gradient/);
    }
  });
});

describe("설정 표식은 작은 크기에서 살아남는다", () => {
  it("톱니 다각형이 아니라 슬라이더다", () => {
    // 24점 톱니 폴리곤은 11~14px 로 줄면 얼룩이 된다 (2026-08-19 실측).
    expect(CSS_CODE).toContain(".mk-sliders");
    expect(CSS_CODE).not.toContain(".mk-gear");
    expect(APP_CODE).not.toContain("mk-gear");
    // px 좌표로 그리므로 크기를 고정해 둬야 부모가 줄여도 손잡이가 안 잘린다
    expect(rule(".mk-sliders")).toMatch(/width:\s*14px/);
  });
});
