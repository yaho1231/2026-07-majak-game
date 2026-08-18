/**
 * 성능 §J 회귀 가드 — 감사 2026-08-17 §7-4·7-5·7-6·7-7·7-8·7-9·7-10·7-11·7-12·7-13.
 *
 * 성능 수정은 **되돌아가기가 가장 쉬운 종류**다. 되돌려도 화면은 똑같이 그려지고
 * 테스트도 전부 통과한다 — 느려질 뿐이다. 그래서 "무엇을 하지 않기로 했는가"를
 * 여기에 못 박는다.
 *
 * 정적 소스 스캔 + 순수 함수 실측을 섞는다 (이 패키지에는 jsdom이 없다).
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { splitTerms } from "../src/glossary.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");
const CSS = readFileSync(join(HERE, "../src/styles.css"), "utf8");
const SERVER_INDEX = readFileSync(join(HERE, "../../server/src/index.ts"), "utf8");
// §L 에서 이 판단을 `httpCache.ts` 로 갈라 냈다 — index.ts 를 import 하면 서버가
// 통째로 뜨는 탓에 테스트가 못 부르기 때문이다. 지키려는 뜻은 그대로다.
const HTTP_CACHE = readFileSync(join(HERE, "../../server/src/httpCache.ts"), "utf8");
const HUMAN_AGENT = readFileSync(join(HERE, "../../server/src/HumanAgent.ts"), "utf8");
const HELPERS = readFileSync(
  join(HERE, "../../core/src/mahjong/flow/helpers.ts"),
  "utf8",
);
const SHANTEN = readFileSync(join(HERE, "../../core/src/mahjong/scoring/shanten.ts"), "utf8");

function code(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}
const APP_CODE = code(APP);

// ─────────────── §7-4 hover 강조 ───────────────

describe("손패 hover가 판을 다시 그리지 않는다", () => {
  it("강조를 React 컨텍스트로 내려보내지 않는다", () => {
    // 컨텍스트 값이 바뀌면 소비자 전부가 리렌더된다 — 화면에 패가 150~250장인데
    // 그게 마우스가 손패 위를 지날 때마다(=매 순) 일어났다.
    expect(APP_CODE).not.toContain("HighlightContext");
    expect(APP_CODE).not.toContain("kindMatches");
  });

  it("판 루트의 data-hl 하나로 표현한다", () => {
    expect(APP_CODE).toMatch(/data-hl=\{hoverKind === null \? undefined :/);
  });

  it("공개패에 종류 키를 달아 둔다 (버림·상대 공개패·후로)", () => {
    expect(APP_CODE.match(/data-k=\{/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it("CSS가 34종을 짝맞춘다 (변수를 못 쓰니 되풀이가 답이다)", () => {
    const pairs = CSS.match(/\.table\[data-hl="[a-z0-9]+"\] \[data-k="[a-z0-9]+"\]/g) ?? [];
    expect(pairs).toHaveLength(34); // 수패 27 + 풍패 4 + 삼원패 3
    // 좌우가 같은 종류여야 한다 — 어긋나면 엉뚱한 패가 빛난다.
    for (const p of pairs) {
      const [a, b] = p.match(/"([a-z0-9]+)"/g)!;
      expect(a).toBe(b);
    }
  });
});

// ─────────────── §7-5 뷰 생성 중복 계산 ───────────────

describe("같은 상태를 두 번 계산하지 않는다", () => {
  it("대기·가상 론 평가를 상태에 매달아 캐시한다", () => {
    expect(HELPERS).toContain("WeakMap<GameState, Map<string, TileKind[]>>");
    expect(HELPERS).toContain("WeakMap<GameState, Map<string, boolean>>");
  });

  it("두 판정이 가상 론 평가를 **나눠 쓴다**", () => {
    // tenpaiNoYaku 와 yakulessWaits 가 같은 대기에 대해 각자 evaluateWin 을 돌던 것이
    // 이 항목의 절반이었다.
    const uses = HELPERS.match(/hasYakuOnWait\(state, id, rules, yaku, tileId\)/g) ?? [];
    expect(uses.length).toBe(2);
  });

  it("캐시 키가 상태 객체 자체다 (무효화 규칙을 만들지 않는다)", () => {
    // GameState 는 불변이고 이벤트마다 새 객체로 갈린다 — "언제 지우나"가 없다.
    expect(HELPERS).not.toMatch(/WAITS_CACHE\.clear\(\)/);
  });
});

// ─────────────── §7-6 무변경 뷰 스킵 ───────────────

describe("안 바뀐 뷰는 보내지 않는다", () => {
  it("직전 프레임과 같으면 그대로 돌아간다", () => {
    expect(HUMAN_AGENT).toContain("if (frame === this.lastViewFrame) return;");
  });

  it("재접속하면 기준을 비운다 (새 소켓은 받은 적이 없다)", () => {
    const at = HUMAN_AGENT.indexOf("reconnect(ws: WebSocket");
    expect(at).toBeGreaterThan(0);
    expect(HUMAN_AGENT.slice(at, at + 500)).toContain("this.lastViewFrame = null");
  });

  it("델타 프로토콜을 만들지 않았다 (매 프레임이 완결된 진실로 남는다)", () => {
    // 델타는 클라이언트에 "이전 상태"를 들여오고, 어긋나면 화면이 조용히 거짓말한다.
    expect(HUMAN_AGENT).not.toMatch(/type: "viewDelta"/);
  });
});

// ─────────────── §7-7 WS 압축 ───────────────

describe("나가는 뷰 프레임을 압축한다", () => {
  it("perMessageDeflate 가 켜져 있다", () => {
    expect(SERVER_INDEX).not.toContain("perMessageDeflate: false");
    expect(SERVER_INDEX).toContain("perMessageDeflate: {");
  });

  it("클라이언트 압축 컨텍스트 이어가기는 막는다 (증폭 방어)", () => {
    expect(SERVER_INDEX).toContain("clientNoContextTakeover: true");
  });

  it("짧은 프레임은 그냥 보낸다", () => {
    // pong·promptCancel 에 압축을 걸면 헤더가 본문보다 커진다.
    expect(SERVER_INDEX).toMatch(/threshold: \d+/);
  });

  it("maxPayload 상한은 그대로다 (zip bomb 의 실질 상한)", () => {
    expect(SERVER_INDEX).toContain("maxPayload: 64 * 1024");
  });
});

// ─────────────── §7-8 도라 반짝임 ───────────────

describe("도라 글로우가 매 프레임 페인트를 부르지 않는다", () => {
  it("box-shadow 를 애니메이션하지 않는다", () => {
    expect(CSS).not.toContain("@keyframes dora-glow");
    expect(CSS).not.toContain("@keyframes dora-own-glow");
    expect(CSS).not.toMatch(/\.tile-dora \{[^}]*animation:/);
  });

  it("합성 가능한 광택 훑기는 남아 있다 (신호를 없애지 않았다)", () => {
    expect(CSS).toContain("@keyframes dora-shine");
    // transform·opacity 만 쓰는지 — 이 애니메이션이 이 파일의 올바른 예다.
    const kf = CSS.slice(CSS.indexOf("@keyframes dora-shine"));
    const body = kf.slice(0, kf.indexOf("}\n\n"));
    expect(body).not.toContain("box-shadow");
  });
});

// ─────────────── §7-9 봇 샹텐 ───────────────

describe("샹텐을 같은 손에 대해 다시 재지 않는다", () => {
  it("순수 함수 캐시가 있다", () => {
    expect(SHANTEN).toContain("SHANTEN_CACHE");
  });

  it("패 배치가 달라도 같은 손이면 같은 키다", () => {
    expect(SHANTEN).toContain(".sort()");
  });

  it("구별할 수 없는 옵션이 오면 캐시하지 않는다", () => {
    // Set(sequenceSuits)이 섞이면 JSON으로 구별이 안 된다 — 조용히 틀리느니 느린 편이 낫다.
    expect(SHANTEN).toContain("function cacheableOpts");
    expect(SHANTEN).toContain("opts?.sequenceSuits === undefined");
  });
});

// ─────────────── §7-10 용어 스캐너 ───────────────

describe("거대 정규식을 뷰마다 다시 돌리지 않는다", () => {
  it("같은 문장은 같은 배열을 그대로 돌려준다", () => {
    const text = "슌쯔 3개와 커쯔 1개, 그리고 머리가 있으면 화료형입니다.";
    const a = splitTerms(text);
    const b = splitTerms(text);
    expect(b).toBe(a); // 참조가 같다 = 다시 돌지 않았다
  });

  it("결과 자체는 달라지지 않는다", () => {
    const chunks = splitTerms("슌쯔와 커쯔");
    expect(chunks.filter((c) => c.kind === "term").map((c) => c.text)).toEqual([
      "슌쯔",
      "커쯔",
    ]);
  });

  it("이름표 툴팁은 올려놓기 전까지 만들지 않는다", () => {
    // pill 마다 이름·계열·쿨다운·설명이 상시 DOM에 서 있으면 이름표 4개 × 증강 4개가
    // 매 뷰마다 함께 다시 그려진다.
    expect(APP_CODE).toContain("tipFor === a || pinned.has(a)");
  });
});

// ─────────────── §7-11·7-12·7-13 ───────────────

describe("첫 화면이 안 쓰는 것을 받지 않는다", () => {
  it("타일 프리로드는 인증 뒤에 시작한다", () => {
    // 예전에는 모듈 최상위에서 즉시 실행돼, 로그인 화면만 보고 나가는 사람도
    // 타일 38장을 받았다.
    expect(APP_CODE).not.toMatch(/^preloadTileImages\(\);$/m);
    const at = APP_CODE.indexOf('if (msg.type === "authOk")');
    expect(at).toBeGreaterThan(0);
    expect(APP_CODE.slice(at, at + 400)).toContain("preloadTileImages()");
  });

  it("해시 없는 정적 파일에 재검증 캐시를 준다 (immutable 은 주지 않는다)", () => {
    expect(HTTP_CACHE).toContain("function cacheControlFor");
    expect(HTTP_CACHE).toContain("stale-while-revalidate");
    // 응답 헤더가 실제로 이 판단을 지나는지 — 갈라 낸 뒤에도 배선이 남아 있어야 한다.
    expect(SERVER_INDEX).toContain('"Cache-Control": cacheControlFor(filePath)');
    // 이름이 고정인 파일에 1년 immutable 을 주면 되돌릴 방법이 없다.
    expect(HTTP_CACHE).toContain('"/tiles/"');
    expect(HTTP_CACHE).toContain('"/sfx/"');
    // 주석은 걷어내고 센다 — 이 파일의 머리말이 immutable 을 여러 번 **설명**한다.
    expect(code(HTTP_CACHE).match(/immutable/g) ?? []).toHaveLength(1); // /assets/ 하나뿐
  });

  it("개발용 랩은 색인되지 않는다", () => {
    // 랩 자체는 남긴다 — 효과음·연출을 고르는 실제 도구다(sfx-lab-bump.sh 흐름).
    // 지켜야 할 것은 그것이 **검색 결과에 뜨지 않는 것**이다.
    const robots = readFileSync(join(HERE, "../public/robots.txt"), "utf8");
    expect(robots).toContain("Disallow: /fx-lab.html");
    expect(robots).toContain("Disallow: /sfx-lab.html");
    for (const f of ["fx-lab.html", "sfx-lab.html"]) {
      expect(readFileSync(join(HERE, "../public", f), "utf8")).toContain(
        'name="robots" content="noindex',
      );
    }
  });
});
