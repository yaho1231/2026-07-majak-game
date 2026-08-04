/**
 * 증강 요약·용어 사전 가드.
 *
 * 게임 화면에 **기본으로** 뜨는 설명은 `packages/client/src/augmentBrief.ts`의 한 줄이다.
 * 원문 `description`은 조건·예외까지 담느라 최대 157자여서, 드래프트 카드(240~290px)에
 * 넣으면 열 줄 가까이 흘렀다 — 고르는 몇 초 동안 읽히지 않는다. 그래서 요약을 앞에 세우고
 * 원문은 Shift/"자세히"로 물렸다.
 *
 * 이 표는 증강 정의와 **떨어져 있어서** tsc가 누락을 못 잡는다. 새 증강을 추가하고 요약을
 * 빠뜨리면 원문 첫 문장으로 대체 표시되는데(화면은 안 깨진다) 길고 어려운 문장이 그대로
 * 노출된다. 그 조용한 퇴행을 여기서 막는다.
 */

import { standardAugments } from "@majak/core";
import { describe, expect, it } from "vitest";
import { contentAugments } from "../src/index.js";
import { AUGMENT_BRIEF, briefOf } from "../../client/src/augmentBrief.js";
import { GLOSSARY, splitTerms } from "../../client/src/glossary.js";

const ALL = [...standardAugments, ...contentAugments];

/** 툴팁·드래프트 카드에서 다섯 줄을 넘지 않는 상한 (좁은 쪽 기준 대략 20자/줄) */
const BRIEF_MAX = 60;

describe("증강 요약 (클라이언트 기본 설명)", () => {
  it("모든 증강에 요약이 있다", () => {
    const missing = ALL.filter((a) => AUGMENT_BRIEF[a.id] === undefined).map((a) => `${a.id}(${a.name})`);
    expect(missing).toEqual([]);
  });

  it("요약 표에 사라진 증강이 남아 있지 않다", () => {
    const live = new Set(ALL.map((a) => a.id));
    expect(Object.keys(AUGMENT_BRIEF).filter((id) => !live.has(id))).toEqual([]);
  });

  it(`요약 본문이 ${BRIEF_MAX}자를 넘지 않는다`, () => {
    const over = Object.entries(AUGMENT_BRIEF)
      .filter(([, b]) => b.text.length > BRIEF_MAX)
      .map(([id, b]) => `${id}: ${b.text.length}자`);
    expect(over).toEqual([]);
  });

  it("요약에 사용 빈도 배지가 있고, 본문에 머리말 괄호가 남아 있지 않다", () => {
    const bad = Object.entries(AUGMENT_BRIEF)
      .filter(([, b]) => b.use.trim() === "" || b.text.startsWith("("))
      .map(([id]) => id);
    expect(bad).toEqual([]);
  });

  it("요약이 없는 증강은 원문 머리말을 배지로 떼어내 대체한다", () => {
    const b = briefOf("__unknown__", "(매 국 1회) 첫 문장이다. 두 번째 문장은 버린다.");
    expect(b.use).toBe("매 국 1회");
    expect(b.text).toBe("첫 문장이다.");
  });
});

describe("마작 용어 사전", () => {
  it("항목 key가 중복되지 않는다", () => {
    const keys = GLOSSARY.map((g) => g.key);
    expect(keys.length).toBe(new Set(keys).size);
  });

  it("풀이는 한 문장이고 용어 자신을 되풀이하지 않는다", () => {
    const bad = GLOSSARY.filter((g) => g.short.trim() === "" || g.short.startsWith(g.label)).map((g) => g.key);
    expect(bad).toEqual([]);
  });

  it("매칭 표기에 캡처 그룹이 없다 (있으면 그룹 번호로 항목을 되찾지 못한다)", () => {
    // 이스케이프한 괄호 `\(`와 전방탐색 `(?!)`은 그룹이 아니다 — 문자열로 세지 말고
    // 실제로 컴파일해서 그룹 수를 센다 (`|` 를 붙이면 빈 문자열에 항상 매칭된다)
    const groupCount = (source: string): number => (new RegExp(`${source}|`).exec("")?.length ?? 1) - 1;
    const bad = GLOSSARY.filter((g) => (g.match ?? []).some((m) => groupCount(m) > 0)).map((g) => g.key);
    expect(bad).toEqual([]);
  });

  it("긴 표기가 짧은 표기에 잡아먹히지 않는다", () => {
    const pick = (text: string): string[] =>
      splitTerms(text).filter((c) => c.kind === "term").map((c) => (c.kind === "term" ? c.entry.key : ""));
    expect(pick("뒷도라가 도라 표시패보다 세다")).toEqual(["ura_dora", "dora_indicator"]);
    expect(pick("더블리치는 리치의 두 배")).toEqual(["double_riichi", "riichi"]);
    expect(pick("안깡·가깡·대명깡은 전부 깡이다")).toEqual(["ankan", "kakan", "daiminkan", "kan"]);
    expect(pick("역만은 역이 아니다")).toEqual(["yakuman", "yaku"]);
    expect(pick("황패유국과 유국만관")).toEqual(["ryuukyoku", "nagashi"]);
  });

  it("쪼갠 조각을 도로 이으면 원문이 된다", () => {
    for (const a of ALL) {
      const joined = splitTerms(a.description).map((c) => c.text).join("");
      expect(joined, a.id).toBe(a.description);
    }
  });

  it("요약 본문에서 전문 용어를 실제로 잡아낸다", () => {
    // 요약 전체에서 한 번도 안 걸리면 사전이 본문 표기와 어긋났다는 뜻이다
    const hit = new Set<string>();
    for (const b of Object.values(AUGMENT_BRIEF)) {
      for (const c of splitTerms(b.text)) if (c.kind === "term") hit.add(c.entry.key);
    }
    for (const key of ["shuntsu", "koutsu", "winning_tile", "riichi", "furiten", "tenpai", "dora"]) {
      expect(hit.has(key), key).toBe(true);
    }
  });

  it("게임 텍스트에 한 번도 안 나오는 항목은 싣지 않는다", () => {
    // 사전의 수록 기준은 "이 게임이 실제로 쓰는 말"이다. 마작 용어 전체를 옮겨 오면
    // 안 쓰는 말이 사전의 대부분을 차지해, 쓰는 말을 고칠 때 어디를 볼지 흐려진다.
    // 증강 설명이 바뀌어 더는 안 쓰는 말이 되면 여기서 걸린다 — 항목을 빼거나,
    // 그 말을 다시 쓰는 증강과 함께 남긴다.
    const corpus = [
      ...ALL.map((a) => a.description),
      ...ALL.map((a) => a.detail ?? ""),
      ...Object.values(AUGMENT_BRIEF).map((b) => b.text),
    ].join("\n");
    const hit = new Set<string>();
    for (const c of splitTerms(corpus)) if (c.kind === "term") hit.add(c.entry.key);
    expect(GLOSSARY.filter((g) => !hit.has(g.key)).map((g) => g.key)).toEqual([]);
  });
});
