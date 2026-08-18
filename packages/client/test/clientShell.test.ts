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
    "바로 한 판",
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
