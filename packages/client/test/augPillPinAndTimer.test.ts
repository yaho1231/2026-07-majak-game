/**
 * 증강 pill 고정(📌)과 결정 타이머 숫자 자리의 회귀 가드.
 *
 * 둘 다 **한 줄만 되돌려도 조용히 되살아나는** 배치 문제다:
 *   ① `.prompt-timer-count` 를 게이지 위(`bottom: …`)로 올리면 액션 바 버튼의
 *      설명(`.act-target`) 자리를 파고든다 (1280×800 실측: 숫자 y=528–544 ×
 *      액션 바 아래끝 y=534). 게이지가 5~8px짜리 실선이라 위아래로 숨통이 없다.
 *   ② `.nameplate-turn` 이 opacity 로 깜빡이면 **쌓임 맥락**이 생겨, 눌러 고정한
 *      설명(`.aug-tip`, z-index 80)이 이름표 밖으로 못 올라간다 — 바로 위 액션 바
 *      밑에 깔려 읽히지 않고, 고정한 설명까지 2.4초 주기로 같이 흐려진다.
 *
 * qaPredeployClient.test.ts 와 같은 **정적 소스 스캔**이다 (이 패키지에는 jsdom이
 * 없다). 실제 겹침은 브라우저에서 좌표로 재서 확인했고, 여기서는 그 배치를
 * 성립시키는 장치가 사라지지 않았는지만 지킨다.
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

/** `.selector {` 부터 그 블록이 닫히는 `}` 까지 */
function rule(selector: string): string {
  const start = CSS_CODE.indexOf(`${selector} {`);
  expect(start, `${selector} 규칙을 못 찾았다`).toBeGreaterThanOrEqual(0);
  const rest = CSS_CODE.slice(start);
  return rest.slice(0, rest.indexOf("}") + 1);
}

describe("결정 타이머 — 남은 초는 게이지 옆에 선다", () => {
  it("게이지 위로 올라가지 않는다", () => {
    const r = rule(".prompt-timer-count");
    expect(r).toContain("left: 100%");
    // 옛 형태 — 게이지 위에 띄우면 액션 바의 설명 줄과 겹친다
    expect(r).not.toMatch(/bottom:\s*\d/);
  });

  it("가로로 접히지 않는다", () => {
    // left:100% 라 남는 폭이 0으로 잡힌다 — nowrap이 없으면 "3.2 / 초"로 갈라진다
    expect(rule(".prompt-timer-count")).toContain("white-space: nowrap");
  });
});

describe("증강 pill — 눌러서 설명을 고정한다", () => {
  it("클릭이 고정을 토글한다", () => {
    expect(APP_CODE).toContain("togglePin(a)");
    expect(APP_CODE).toContain("aug-pill-pinned");
  });

  it("고정한 것은 손을 떼도 그린다", () => {
    // 툴팁 속을 만드는 조건(hover 상태 tipFor)에 고정이 함께 들어 있어야 한다
    expect(APP_CODE).toContain("tipFor === a || pinned.has(a)");
    // CSS 쪽 display 규칙도 같이 있어야 한다 — 하나만 있으면 안 보이거나 안 그려진다
    expect(CSS_CODE).toMatch(/\.aug-pill-pinned \.aug-tip,?[^{]*\{[\s\S]*?display:\s*flex/);
  });

  it("툴팁 안쪽을 눌러도 고정이 풀리지 않는다", () => {
    // "자세히" 칩·용어 링크는 툴팁 안에 있다 — 그 클릭이 pill까지 올라오면 안 된다
    expect(APP_CODE).toContain('closest(".aug-tip")');
  });

  it("Esc로 한 번에 걷을 수 있다", () => {
    expect(APP_CODE).toContain('if (e.key !== "Escape") return;');
    expect(APP_CODE).toContain("setPinned(new Set())");
  });

  it("차례 이름표가 opacity로 깜빡이지 않는다 (쌓임 맥락)", () => {
    const r = rule(".nameplate-turn");
    // turn-pulse는 opacity 애니메이션이다 — 이름표에 걸면 안쪽 툴팁이 갇힌다
    expect(r).not.toContain("animation: turn-pulse");
    expect(r).toContain("nameplate-turn-pulse");
    // 대체 애니메이션은 투명도를 건드리지 않는다
    const kf = CSS_CODE.slice(CSS_CODE.indexOf("@keyframes nameplate-turn-pulse"));
    expect(kf.slice(0, kf.indexOf("}\n}") + 3)).not.toContain("opacity");
  });
});
