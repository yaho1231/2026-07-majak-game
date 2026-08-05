/**
 * 역 읽기 — 봇이 **손이 얼마짜리인지** 제대로 세는가.
 *
 * 값어치 추정은 역을 **네 종류밖에 몰랐다**(역패·탕야오·혼일색·토이토이). 그 넷에
 * 안 걸리는 손은 전부 "멘젠 기본 1판"이었다. 그래서 청일색이 혼일색으로, 치또이가
 * 1판으로 잡혔고, 산색·일통·찬타는 아예 없는 역이었다.
 *
 * 값어치는 봇의 **모든** 판단에 들어간다(밀기/접기·리치/다마텐·후로·깡·증강).
 * 값을 절반으로 세면 그 손은 전부의 판단에서 절반만큼만 대접받는다.
 */

import { describe, expect, it } from "vitest";
import { bestYakuHan, guessYaku } from "../src/bot/yaku.js";
import { estimateHandValue } from "../src/bot/value.js";
import { h } from "./botTestView.js";

const names = (spec: string, menzen = true): string[] =>
  guessYaku(h(spec), menzen).map((g) => g.name);

describe("색 계열", () => {
  it("청일색을 혼일색과 구분한다 (3판이 아니라 6판이다)", () => {
    expect(names("123456789m11m22m")).toContain("chinitsu");
    expect(bestYakuHan(h("123456789m11m22m"), true)).toBe(6);
  });

  it("자패가 섞이면 혼일색이다", () => {
    expect(names("123456789m11z22z")).toContain("honitsu");
    expect(bestYakuHan(h("123456789m11z22z"), true)).toBe(3);
  });

  it("열린 손은 한 판 깎인다", () => {
    expect(bestYakuHan(h("123456789m11m22m"), false)).toBe(5);
    expect(bestYakuHan(h("123456789m11z22z"), false)).toBe(2);
  });

  it("색이 흩어져 있으면 색 역이 아니다", () => {
    expect(names("123m456p789s11z22z")).not.toContain("honitsu");
    expect(names("123m456p789s11z22z")).not.toContain("chinitsu");
  });
});

describe("치또이", () => {
  it("작두 다섯이면 치또이 방향으로 본다", () => {
    expect(names("11m22m33p44p55s9s")).toContain("chiitoitsu");
  });

  it("열린 손에는 없는 역이다", () => {
    expect(names("11m22m33p44p55s9s", false)).not.toContain("chiitoitsu");
  });
});

describe("일기통관 · 산색동순", () => {
  it("한 색의 1~9가 거의 모이면 일통으로 본다", () => {
    expect(names("123456789m11p2p")).toContain("ittsu");
  });

  it("세 덩이 중 하나가 비면 일통이 아니다", () => {
    // 123456 + 9 — 789가 통째로 비었다 (예전 판정은 이걸 일통으로 읽었다)
    expect(names("1234569m11p22p")).not.toContain("ittsu");
    // 2345678 — 양 끝이 비었다
    expect(names("2345678m11p22p33p")).not.toContain("ittsu");
  });

  it("같은 숫자대가 세 색에 걸치면 산색으로 본다", () => {
    expect(names("123m123p12s11z22z")).toContain("sanshoku");
  });

  it("두 색뿐이면 산색이 아니다", () => {
    expect(names("123m123p11z22z33z")).not.toContain("sanshoku");
  });
});

describe("찬타 계열", () => {
  it("요구패가 손의 대부분이면 찬타로 본다", () => {
    expect(names("111m999m111p99p1z")).toContain("chanta");
  });

  it("자패가 없으면 준찬타 (한 판 더)", () => {
    const junchan = guessYaku(h("111m999m111p999p11s"), true).find(
      (g) => g.name === "junchan",
    );
    expect(junchan?.han).toBe(3);
  });

  it("중장패가 섞이면 찬타가 아니다", () => {
    expect(names("111m999m456p99p1z")).not.toContain("chanta");
  });
});

describe("과대평가하지 않는다", () => {
  it("겹치는 역을 다 더하지 않고 가장 비싼 하나만 센다", () => {
    // 청일색(6) + 일통(2)이 겹치는 손 — 8이 아니라 6으로 센다
    expect(bestYakuHan(h("123456789m11m99m"), true)).toBe(6);
  });

  it("아무 모양도 아니면 0 (예전처럼 멘젠 기본판만 붙는다)", () => {
    expect(bestYakuHan(h("147m258p369s1z2z"), true)).toBe(0);
  });
});

describe("값어치에 실제로 반영된다", () => {
  const base = { handDora: 0, meldCount: 0, isDealer: false, riichiDeclared: false } as const;

  it("청일색 손은 손패를 넘겼을 때 훨씬 비싸게 잡힌다", () => {
    const blind = estimateHandValue({ ...base, plan: null });
    const seeing = estimateHandValue({ ...base, plan: null, kinds: h("123456789m11m22m") });
    expect(seeing.points).toBeGreaterThan(blind.points * 3);
  });

  it("방향이 아는 역보다 손이 더 비싸면 손 쪽을 쓴다", () => {
    // 방향은 혼일색(3판)이라고 보지만 실제로는 청일색(6판)이다
    const v = estimateHandValue({
      ...base,
      plan: { yaku: "honitsu", suit: "man" },
      kinds: h("123456789m11m22m"),
    });
    expect(v.han).toBe(6);
  });

  it("손패를 안 넘기면 예전 계산 그대로다 (역 읽기는 더하기이지 갈아치우기가 아니다)", () => {
    const a = estimateHandValue({ ...base, plan: { yaku: "tanyao" } });
    const b = estimateHandValue({ ...base, plan: { yaku: "tanyao" }, kinds: h("234m567p88s") });
    expect(b.points).toBe(a.points);
  });

  it("봇이 실제로 이 경로를 탄다 (읽기에 손패가 실려 나간다)", async () => {
    const { buildRead } = await import("../src/bot/read.js");
    const { botScene } = await import("./botTestView.js");
    // 청일색 텐파이 — 예전에는 1판(1500점)으로 셌다
    const s2 = botScene({ hand: "123456789m1122m", turnCount: 5 });
    expect(buildRead(s2.view, "p0").valueOf({ plan: null }).han).toBe(6);
  });
});
