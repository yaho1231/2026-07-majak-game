/**
 * 두 회귀 가드 (2026-08-30 사용자 보고).
 *
 * ① **도라는 전부 한 순간에 반짝인다.** CSS 애니메이션은 요소가 붙는 순간부터
 *    시작하므로, 패마다 각자 광택을 돌리면 손패(패를 뽑을 때마다 다시 붙는다)·
 *    바닥패·후로패·도라 표시패의 위상이 제각각으로 흩어진다. 시계를 `:root` 한
 *    곳으로 모으고 상속되는 커스텀 속성으로 자리만 읽게 해야 «동시에 시작하고
 *    동시에 끝난다»가 성립한다.
 *
 * ② **제한 시간은 «은행 + 유예»로 갈라 보인다.** 서버 마감은 매 순 초기화되는
 *    유예(30초)와 국 하나짜리 은행(10초)의 합인데, 합만 그리면 「40초」한 덩어리라
 *    지금 닳는 쪽이 어디인지가 사라진다. 매 순 초기화되며 먼저 닳는 유예를 **뒤**에
 *    둬서 「서 있는 잔액 + 이번 순의 카운트다운」으로 읽히게 한다.
 *
 * 이 패키지에는 jsdom이 없다 — 저장소의 다른 클라이언트 가드들과 같은 정적 소스
 * 스캔이다(augPillPinAndTimer.test.ts).
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

describe("도라 광택 — 화면의 모든 도라가 같은 위상으로 반짝인다", () => {
  it("시계는 :root 하나뿐이다 — 패마다 각자 도는 애니메이션이 아니다", () => {
    expect(CSS_CODE).toContain("animation: dora-shine-clock 2.2s ease-in-out infinite;");
    // 광택 자체에는 애니메이션이 붙지 않는다(붙는 순간 = 위상이 갈리는 순간)
    const shine = CSS_CODE.slice(
      CSS_CODE.indexOf(".tile-dora::before,"),
      CSS_CODE.indexOf(".tile-dora::before {"),
    );
    expect(shine).not.toContain("animation");
  });

  it("광택은 상속된 커스텀 속성으로 자기 자리를 읽는다", () => {
    expect(CSS_CODE).toContain("transform: translateX(var(--dora-shine-x)) skewX(-20deg);");
    expect(CSS_CODE).toContain("opacity: var(--dora-shine-o);");
    // 보간되려면 등록돼 있어야 한다 (@property 없이는 값이 계단으로 튄다)
    expect(CSS_CODE).toContain("@property --dora-shine-x");
    expect(CSS_CODE).toContain("@property --dora-shine-o");
    expect(CSS_CODE).toContain("inherits: true;");
  });

  it("움직임을 줄이면 시계도 함께 선다 — 아무도 안 읽는 값을 초당 60번 갱신하지 않는다", () => {
    expect(CSS_CODE).toContain(":root { animation: none; }");
  });
});

describe("결정 타이머 — 「30 + 10초」로 갈라 센다", () => {
  it("은행 몫은 서버가 실어 보낸 값이다 (화면이 지어내지 않는다)", () => {
    expect(APP_CODE).toContain("const PromptBankContext = createContext(0);");
    expect(APP_CODE).toContain("setPromptBankMs(msg.bankMs !== undefined && msg.bankMs > 0 ? msg.bankMs : 0);");
    expect(APP_CODE).toContain("const bankMs = useContext(PromptBankContext);");
  });

  it("뒷 숫자(매 순 초기화되는 유예)부터 줄고, 그것이 0이 된 뒤에야 은행이 준다", () => {
    expect(APP_CODE).toContain("const bank = Math.min(bankMs, left);");
    expect(APP_CODE).toContain("const grace = Math.max(0, left - bank);");
    // 흐르는 숫자는 **뒤**, 서 있는 잔액이 앞이다 (「10 + 30초」→「10 + 29초」)
    expect(APP_CODE).toContain("`${whole(bank)} + ${precise ? tenth(grace) : whole(grace)}초`");
    expect(APP_CODE).toContain("`${precise ? tenth(bank) : whole(bank)} + 0초`");
  });

  it("갈라 셀 것이 없으면(은행 0·구 서버) 예전처럼 한 덩어리다", () => {
    expect(APP_CODE).toContain("bankMs <= 0");
    expect(APP_CODE).toContain("`${precise ? tenth(left) : whole(left)}초`");
  });
});
