/**
 * 결과 화면 어휘 가드 — 화료 한 번에 처음 보는 이름이 줄줄이 뜨는 자리다.
 *
 * 배경: 결과 화면의 역 이름표(`YAKU_NAMES`)와 용어 사전(`glossary.ts`)은 서로 모르는
 * 두 표였다. 스안커·대사희처럼 한 판을 통째로 뒤집는 역이 사전에 없는데 산안커·대삼원은
 * 있었고, 표기가 갈린 역(산깡쯔/산깡즈)은 뒤의 "깡쯔"만 걸려 정작 그 역은 안 잡혔다.
 * 역을 하나 더 붙이거나 이름을 고칠 때 사전 쪽을 잊지 않도록 여기서 못을 박는다.
 *
 * 함께 지키는 것: 투시(xray_hand)의 액티브 등록. 액션 이름표(ACTION_LABEL)와
 * 소유 증강 표(ACTION_AUGMENT)에는 처음부터 있었는데 판정 집합 두 개에만 빠져 있어,
 * 버튼이 액티브 증강 메뉴가 아니라 일반 액션 바로 새어 나갔다(docs/25 §397).
 *
 * 클라를 렌더하지 않는 **정적 소스 스캔**이다(jsdom 의존 없음) — `roundResultPanel.test.ts`와
 * 같은 방식이다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GLOSSARY, splitTerms } from "../src/glossary.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

/** App.tsx의 `const NAME = new Set([...])` 또는 `= {...}` 블록 본문 */
function block(header: string, open: string, close: string): string {
  const at = SRC.indexOf(header);
  expect(at, header).toBeGreaterThan(0);
  const from = SRC.indexOf(open, at);
  const to = SRC.indexOf(close, from);
  expect(to, header).toBeGreaterThan(from);
  return SRC.slice(from, to);
}

/** 결과 화면 역 이름표 — `id: "이름",` 줄만 걷는다 */
function yakuNames(): { id: string; label: string }[] {
  const body = block("const YAKU_NAMES: Record<string, string> = {", "{", "\n};");
  const rows = [...body.matchAll(/^\s*(\w+):\s*"([^"]+)",/gm)];
  return rows.map((m) => ({ id: m[1]!, label: m[2]! }));
}

/**
 * 구현 없는 이름표를 담아 두는 자리 — 지금은 비어 있다.
 *
 * 한때 `gomonsei`·`sanshoku_tsuukan`·`isshoku_sanjun` 셋이 이 표에만 있고 그 id로 역을
 * 세우는 코드가 어디에도 없었다(2026-08-07 확인). 무슨 역인지 코드가 말해 주지 않아
 * 사전에 뜻을 지어 넣을 수도 없었고, 사용자 판정으로 **이름표 자체를 지웠다.**
 *
 * 이 집합이 비어 있다는 것 자체가 규율이다 — 여기에 무언가를 넣으려 한다면 그 역은
 * 이름만 있고 구현이 없다는 뜻이므로, 넣지 말고 구현하거나 이름표를 지워라.
 */
const NOT_IMPLEMENTED = new Set<string>();

/**
 * 이름표 안에 사전에 없는 꾸밈말이 섞이는 것들 — 핵심 낱말만 걸리면 된다.
 * ("역패 백"의 백, "탕야오 해방"의 해방, "우는 국사무쌍"의 우는)
 */
const COMPOUND = new Set([
  "yakuhai_haku",
  "yakuhai_hatsu",
  "yakuhai_chun",
  "tanyao_break",
  "kokushi_open",
]);

describe("결과 화면 역 이름 — 사전이 전부 받는다", () => {
  it("이름표를 읽어 왔다", () => {
    const names = yakuNames();
    expect(names.length).toBeGreaterThan(40);
    // 표기가 갈리기 쉬운 것들이 실제로 이 표에 있는지 (regex가 헛돌지 않았다는 확인)
    expect(names.map((n) => n.id)).toContain("suuankou");
    expect(names.map((n) => n.id)).toContain("daisuushii");
  });

  it("구현이 있는 역은 모두 사전에 걸린다", () => {
    const missing = yakuNames()
      .filter((n) => !NOT_IMPLEMENTED.has(n.id))
      .filter((n) => !splitTerms(n.label).some((c) => c.kind === "term"))
      .map((n) => `${n.id}(${n.label})`);
    expect(missing).toEqual([]);
  });

  it("이름표 전체가 통째로 걸린다 — 뒷글자만 밑줄 그이지 않는다", () => {
    // 예전에 "산깡쯔"는 뒤의 "깡쯔"만 걸려, 정작 그 역이 무엇인지는 안 떴다.
    const partial = yakuNames()
      .filter((n) => !NOT_IMPLEMENTED.has(n.id) && !COMPOUND.has(n.id))
      .filter((n) =>
        splitTerms(n.label).some((c) => c.kind === "text" && c.text.trim() !== ""),
      )
      .map((n) => `${n.id}(${n.label})`);
    expect(partial).toEqual([]);
  });

  it("한 판을 뒤집는 역만은 빠짐없이 실려 있다", () => {
    const keys = new Set(GLOSSARY.map((g) => g.key));
    for (const k of [
      "suuankou",
      "suuankou_tanki",
      "daisuushii",
      "shousuushii",
      "tsuuiisou",
      "ryuuiisou",
      "chinroutou",
      "suukantsu",
      "tenhou",
      "chihou",
      "kokushi_13",
      "chuuren_junsei",
    ]) {
      expect(keys.has(k), k).toBe(true);
    }
  });

  it("이 게임이 만든 말도 실려 있다 — 정의가 여기밖에 없다", () => {
    const keys = new Set(GLOSSARY.map((g) => g.key));
    for (const k of [
      "bank",
      "stake",
      "karma_gauge",
      "conjured_tile",
      "triple_riichi",
      "snake_kan",
      "sanma",
      "kazoe_yakuman",
    ]) {
      expect(keys.has(k), k).toBe(true);
    }
  });
});

describe("투시(xray_hand) — 액티브 증강으로 등록돼 있다", () => {
  it("액션 타입 네 표에 모두 있다", () => {
    expect(block("const ACTION_LABEL", "{", "\n};")).toContain("xray_reveal");
    expect(block("const ACTION_AUGMENT: Record<string, string> = {", "{", "\n};")).toContain(
      "xray_reveal",
    );
    // 이 둘이 비어 있던 자리다 — 버튼이 일반 액션 바로 새어 나갔다.
    expect(block("const AUGMENT_ACTION_TYPES = new Set([", "[", "\n]);")).toContain(
      '"xray_reveal"',
    );
    expect(block("const ACTIVE_AUGMENT_IDS = new Set([", "[", "\n]);")).toContain(
      '"xray_hand"',
    );
  });
});
