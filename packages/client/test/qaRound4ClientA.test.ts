/**
 * QA 4차 클라이언트 수리 — 1차 배치(client-fix-A) 회귀 가드.
 *
 * 출처: `qa-lab/round4/ingame-ux.md` · `qa-lab/round4/mobile-a11y.md`.
 *
 * 여기 걸린 것들은 대부분 «어느 조건에서만 드러나는 배치·상태 누수»라 화면을 열어
 * 보는 것으로는 다시 못 찾는다 — 되돌아가면 조용히 되돌아간다. 그래서 못을 박는다.
 * `qaRound2Client.test.ts`와 같은 방식(정적 소스 스캔)이다.
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

/** `selector {` 부터 짝이 맞는 `}` 직전까지 — 한 규칙 블록의 본문 */
function ruleBody(selector: string): string {
  const at = CSS_CODE.indexOf(`${selector} {`);
  expect(at, `${selector} 규칙이 없다`).toBeGreaterThan(-1);
  const start = CSS_CODE.indexOf("{", at);
  return CSS_CODE.slice(start, CSS_CODE.indexOf("}", start));
}

// ─────────────── P1: 증강 선택 모달이 제한시간을 가린다 ───────────────

describe("증강 선택 모달이 남은 시간을 스스로 보여 준다", () => {
  it("PickTimer 가 있고, 마감이 없으면 아무것도 그리지 않는다", () => {
    expect(APP_CODE).toContain("function PickTimer(props: { deadline: number | null })");
    // 평시 국(마감 없음)에 빈 알약이 서면 그게 더 나쁘다.
    expect(APP_CODE).toContain("if (deadline === null || left === null) return null;");
  });

  it("모든 `.rinshan-pick-panel` 모달이 PickTimer 를 하나씩 갖는다", () => {
    /*
     * 이 모달들은 전면 오버레이(z 120)라 남은 시간을 보여 주는 유일한 장치인
     * `PromptTimer`(`.own-area`, z 10)를 통째로 덮는다. 그런데 서버 마감은 그대로
     * 흐른다 — 초읽기 국은 5~10초라 시간 초과 → 서버 폴백이 거의 확정이었다.
     * 새 모달이 생겼을 때 이 줄을 빼먹지 않도록 **개수로** 못을 박는다.
     */
    const panels = APP_CODE.match(/className="rinshan-pick-panel/g) ?? [];
    const timers = APP_CODE.match(/<PickTimer deadline=/g) ?? [];
    expect(panels.length).toBeGreaterThanOrEqual(10);
    expect(timers.length).toBe(panels.length);
  });

  it("모달 안 타이머 알약이 드래프트 창과 같은 겉모습을 쓴다", () => {
    expect(APP_CODE).toContain('className={`draft-timer pick-timer');
    expect(CSS_CODE).toContain(".pick-timer {");
  });

  it("ActiveAugmentControl 까지 마감이 배선돼 있다", () => {
    expect(APP_CODE).toContain("promptDeadline={props.promptDeadline}");
  });
});

// ─────────────── P1: 리플레이 재생 바가 하단 손패를 덮는다 ───────────────

describe("리플레이 재생 바가 하단 좌석 손패를 덮지 않는다", () => {
  it("`--own-band-full` + safe-area 로 비켜선다", () => {
    const body = ruleBody(".replayer-bar");
    expect(body).toContain("--own-band-full");
    expect(body).toContain("env(safe-area-inset-bottom");
    // `bottom: 10px` 고정으로 되돌아가면 손패와 48px 겹친다.
    expect(body).not.toMatch(/bottom:\s*10px;/);
  });

  it("좁은 폭에서 줄이 넘치면 접힌다", () => {
    expect(ruleBody(".replayer-bar")).toContain("flex-wrap: wrap");
  });
});

// ─────────────── P1: 폰 우상단 아이콘 5개가 4px씩 겹친다 ───────────────

describe("터치 기기의 우상단 아이콘 줄이 겹치지 않는다", () => {
  it("min-width 44px 를 강제하는 곳에서 피치도 48px 로 벌린다", () => {
    /*
     * 좁은 판/가로 폰 블록은 40px 피치(8/48/88/128/168)로 세우는데, `min-width: 44px`
     * 는 선언 순서와 무관하게 `width` 를 이긴다 → 쌍마다 4px 겹침. 가장자리를 짚으면
     * 이웃이 열리고, 그중 하나가 «나가기»다.
     */
    const at = CSS_CODE.indexOf("--icon-x");
    expect(at).toBeGreaterThan(-1);
    const block = CSS_CODE.slice(at);
    for (const px of ["+ 48px", "+ 96px", "+ 144px", "+ 192px"]) {
      expect(block).toContain(px);
    }
  });

  it("겹침 수리가 40px 피치 선언보다 **뒤에** 있다 (순서가 뒤집히면 무효)", () => {
    const pitch = CSS_CODE.lastIndexOf(".help-btn { right: 168px; }");
    const fix = CSS_CODE.indexOf("--icon-x");
    expect(pitch).toBeGreaterThan(-1);
    expect(fix).toBeGreaterThan(pitch);
  });
});

// ─────────────── P1: 규칙·계산식 설명이 `title=` 에만 있다 ───────────────

describe("규칙·계산식 설명이 터치에서도 열린다", () => {
  it("InfoNote 가 hover 말고 탭·키보드로도 열린다", () => {
    expect(APP_CODE).toContain("function InfoNote(props: {");
    expect(APP_CODE).toContain('tabIndex={0}');
    expect(APP_CODE).toContain("aria-expanded={open}");
    // hover · focus-within · 탭 고정 세 통로 (`.aug-tip` 과 같은 식)
    expect(CSS_CODE).toContain(".info-note:hover .info-note-tip");
    expect(CSS_CODE).toContain(".info-note:focus-within .info-note-tip");
    expect(CSS_CODE).toContain(".info-note-open .info-note-tip");
    // 원래 `title` 에 들어 있던 줄바꿈이 살아야 한다(여러 줄이 특히 터치에서 안 떴다)
    expect(ruleBody(".info-note-tip")).toContain("white-space: pre-line");
  });

  it("보고서가 지목한 다섯 곳이 전부 InfoNote 로 옮겨졌다", () => {
    // ① 오름패 위 숫자의 계산식 — 보이는 글자는 "남은 장수"뿐이다
    expect(APP_CODE).toContain('className="waits-badge-hint"');
    expect(APP_CODE).toMatch(/<InfoNote\s+className="waits-badge-hint"/);
    // ② 티어표 열 머리의 계산식
    expect(APP_CODE).toContain('<InfoNote align="right" note="타점×3 + 속도×3 + 무대응×2 + 빈도×2">');
    // ③ 서든데스 규칙 (모드 뱃지)
    expect(APP_CODE).toMatch(/<InfoNote\s+className="mode-badge"/);
    // ④·⑤ 증강 설명 전문 (중계 · 드래프트 보유 목록)
    expect(APP_CODE).toContain(
      "note={\n              catalog[id] === undefined\n                ? id\n                : forMode(catalog[id].description, view.round.mode)\n            }",
    );
    expect(APP_CODE).toContain("note={entry === undefined ? id : forMode(entry.description, mode)}");
    // 옛 형태(맨 span 의 title)가 돌아오면 실패한다
    expect(APP_CODE).not.toContain('title="타점×3 + 속도×3 + 무대응×2 + 빈도×2"');
    expect(APP_CODE).not.toContain("title={catalog[id]?.description ?? id}");
  });

  it("모드 뱃지는 배치를 유지한 채로 손가락을 받는다", () => {
    // `.mode-badge` 는 absolute + pointer-events:none 이라 애초에 눌릴 수 없었다.
    const body = ruleBody(".mode-badge.info-note");
    expect(body).toContain("position: absolute");
    expect(body).toContain("pointer-events: auto");
  });

  it("「왜 지금 못 쓰는가」를 물을 수 있다 — 액티브 증강 버튼이 진짜 disabled 가 아니다", () => {
    /*
     * `disabled` 면 포커스도 클릭도 안 잡혀 이유를 물을 방법 자체가 없다.
     * `aria-disabled` 로 바꾸고, 누르면 이유를 토스트로 읽어 준다.
     */
    expect(APP_CODE).toContain("aria-disabled={!usable}");
    // `aria-disabled` 는 이 부분문자열을 포함하므로 줄 시작까지 함께 본다
    expect(APP_CODE).not.toMatch(/\n\s*disabled=\{!usable\}/);
    expect(APP_CODE).toContain("지금은 사용할 수 없습니다. ${activeIds.map(blockedNote).join(\", \")}");
    expect(CSS_CODE).toContain('.aug-btn[aria-disabled="true"]');
  });
});

// ─────────────── P2: «건너뛰기» 알약이 최신 토스트를 덮는다 ───────────────

describe("건너뛰기 알약과 토스트가 같은 자리에 서지 않는다", () => {
  it("알약이 떠 있는 동안 토스트가 그만큼 올라간다", () => {
    expect(CSS_CODE).toContain("body:has(.prod-skip) .toast-stack");
    expect(ruleBody("body:has(.prod-skip) .toast-stack")).toContain("52px");
  });

  it("토스트도 safe-area 를 얹는다 (아이폰에서 토스트만 홈 인디케이터로 내려갔다)", () => {
    expect(ruleBody(".toast-stack")).toContain("env(safe-area-inset-bottom");
  });
});

// ─────────────── P2: 내 차례 알림이 시각뿐 ───────────────

describe("내 차례·화료·거절이 손끝에도 전해진다", () => {
  it("죽은 코드였던 haptics.turn / win / reject 가 전부 호출된다", () => {
    // 보고서 시점에는 저장소 전체에서 호출부가 0건이었다.
    expect(APP_CODE).toContain("haptics.turn()");
    expect(APP_CODE).toContain("haptics.win()");
    expect(APP_CODE).toContain("haptics.reject()");
  });

  it("내 턴의 버림 프롬프트에서만 turn 이 울린다 (리액션 프롬프트는 제외)", () => {
    const at = APP_CODE.indexOf("haptics.turn()");
    expect(at).toBeGreaterThan(-1);
    const cond = APP_CODE.slice(Math.max(0, at - 400), at);
    expect(cond).toContain('opts.some((o) => o.type === "discard")');
    expect(cond).toContain('!opts.some((o) => o.type === "pass")');
  });

  it("소리는 초읽기 국에서만 붙는다 (매 순 울리면 시끄럽다)", () => {
    const at = APP_CODE.indexOf("haptics.turn()");
    const after = APP_CODE.slice(at, at + 300);
    expect(after).toContain("msg.deadlineMs <= 12_000");
    expect(after).toContain("sfx.callPrompt()");
  });

  it("봉인패·쿠이카에·코치 차단은 토스트와 함께 reject 를 울린다", () => {
    const rejects = APP_CODE.match(/haptics\.reject\(\)/g) ?? [];
    expect(rejects.length).toBeGreaterThanOrEqual(3);
  });
});

// ─────────────── P2: 터치 44px 명단 누락 ───────────────

describe("터치 44px 명단의 구멍을 메운다", () => {
  it("리플레이 조작 버튼", () => {
    expect(CSS_CODE).toContain(".rp-btn { min-width: 44px; min-height: 44px; }");
  });

  it("판 위 공지의 「✕」 — 공지를 내리는 유일한 수단이다", () => {
    const body = ruleBody(".notice-close");
    // 파일 끝의 coarse 블록 쪽을 본다 (본체 규칙에는 min-* 가 없다)
    expect(CSS_CODE).toContain(".notice-close {\n    min-width: 44px;");
    expect(body).toBeTruthy();
    // 과녁이 커진 만큼 머리줄 여백도 함께 늘어나야 제목을 안 덮는다
    expect(CSS_CODE).toContain("padding-right: 46px");
  });
});

// ─────────────── mobile-a11y P2: 색 말고 다른 채널 ───────────────

describe("판 위 표식이 색 하나에 매달리지 않는다", () => {
  /** 9-5 블록 — 색 말고 다른 채널을 얹는 규칙들이 사는 곳(파일 끝) */
  const a11yBlock = CSS_CODE.slice(CSS_CODE.indexOf(".tile-dora-own {\n  outline: 4px double"));

  it("적5(전용 그림)의 비색 표식은 고대비에서만 켠다", () => {
    // 여태 `.tile-red` 를 **일부러** 빼는 바람에 forced-colors 의 유일한 비색 표식도
    // 5에는 안 걸렸다 — 고대비에서 붉은 잉크마저 평탄화되면 평범한 5와 같아진다.
    // 다만 평상시에 파선을 두르면 도라 금테와 겹쳐 다른 도라들과 다르게 보인다
    // (2026-08-23 사용자 보고) — 그래서 표식은 고대비 계열 안에서만 산다.
    expect(APP_CODE).toContain('" tile-red-art"');
    expect(CSS_CODE).not.toContain(".tile-red-art {\n  border");
    const contrast = CSS_CODE.slice(CSS_CODE.indexOf("@media (prefers-contrast: more)"));
    expect(contrast).toContain(".tile-red-art {\n    border-style: dashed;");
    const forced = CSS_CODE.slice(CSS_CODE.lastIndexOf("@media (forced-colors: active)"));
    expect(forced).toContain(".tile-red-art");
  });

  it("공통 도라와 개인 도라가 색조 말고 모양으로도 갈린다", () => {
    // 색조만 다르고 테두리 굵기·글로우 반경·광택은 바이트 단위로 같았다.
    expect(a11yBlock).toContain(".tile-dora-own {");
    expect(a11yBlock.slice(a11yBlock.indexOf(".tile-dora-own {"))).toContain("double");
  });

  it("중계 위험도 2단계가 선종·굵기로 갈린다", () => {
    const md = a11yBlock.slice(a11yBlock.indexOf(".spec-danger-md {"));
    expect(md.slice(0, 200)).toContain("dashed");
    const hi = a11yBlock.slice(a11yBlock.indexOf(".spec-danger-hi {"));
    expect(hi.slice(0, 200)).toContain("solid");
  });

  it("`prefers-contrast: more` 가 판 위 규칙에도 닿는다", () => {
    // 여태 토큰 5개만 재정의하고 판 위 규칙은 0건이었다.
    const blocks = CSS_CODE.split("@media (prefers-contrast: more)");
    expect(blocks.length).toBeGreaterThanOrEqual(3); // 원래 블록 + 새 블록
    const added = blocks[blocks.length - 1] ?? "";
    for (const sel of [
      ".plate-dealer",
      ".plate-turn",
      ".tile-dora",
      ".tile-red",
      ".hand-danger",
      ".spec-danger-hi",
      ".hand-riichi",
    ]) {
      expect(added, `${sel} 이 고대비 블록에 없다`).toContain(sel);
    }
  });
});

// ─────────────── mobile-a11y P3: 화면과 스크린리더가 다른 판을 말한다 ───────────────

describe("TileImg 의 alt 가 화면과 같은 판을 말한다", () => {
  it("이미지 갈래도 owner 를 넘긴다", () => {
    // 각인 적도라(redFor)는 **그 주인의 손에서만** 붉게 그리는데, alt 만 owner 를
    // 안 넘겨 남의 손의 같은 패를 「赤5만」으로 읽었다.
    expect(APP_CODE).toContain("alt={formatTile(tile, owner)}");
    expect(APP_CODE).not.toContain("alt={formatTile(tile)}");
  });
});
