/**
 * **울고 난 손이 어떤 역으로 갈 수 있는가** — 콜 게이트의 역 읽기.
 *
 * 2026-08-06까지 어휘가 두 벌이었다. 손 값어치(`bot/yaku.ts`)는 청일색·치또이·일통·
 * 삼색동순·찬타까지 읽는데, 후로 게이트(`call.yakuPathAfter`)는 역패·탕야오·혼일색·
 * 토이토이 넷만 알았다. 그래서 산색으로 갈 수 있는 손도, 일통이 보이는 손도 게이트가
 * 모르니 "역 없음"으로 잘렸다 — 콜 기회의 36.6%가 거기서 끝났다(#152 집계).
 *
 * 여기서 잡는 것은 둘이다.
 *   1. 새로 알아본 역들이 실제로 판정된다 (그리고 **없는 역을 지어내지 않는다**)
 *   2. 열린 손으로 갈 수 없는 역(치또이·산안커)은 콜 경로에서 빠진다
 */

import { describe, expect, it } from "vitest";
import { guessYaku, hanOf, bestYakuHan } from "../src/bot/yaku.js";
import type { YakuName } from "../src/bot/yaku.js";
import { h } from "./botTestView.js";

/** 2026-08-06에 더한 넷까지 읽는다 (`extended`) — 재는 중이라 스위치 뒤에 있다 */
const names = (spec: string, menzen: boolean): YakuName[] =>
  guessYaku(h(spec), menzen, true).map((g) => g.name);

describe("역 읽기 — 새로 알아본 역들", () => {
  it("토이토이 — 커쯔가 될 덩이가 넷 이상 모였을 때", () => {
    expect(names("111m333p555s77z99m", false)).toContain("toitoi");
  });

  it("또이쯔가 둘뿐인 손은 토이토이가 아니다", () => {
    expect(names("123m456p789s11m22p", false)).not.toContain("toitoi");
  });

  it("산안커 — 암각 셋. 멘젠에서만 센다", () => {
    expect(names("111m333p555s79m2p", true)).toContain("sanankou");
    expect(names("111m333p555s79m2p", false)).not.toContain("sanankou");
  });

  it("삼색동각 — 같은 숫자의 커쯔·또이쯔가 세 색에 걸칠 때", () => {
    expect(names("333m333p33s123m9p", false)).toContain("sanshokuDoukou");
  });

  it("한 색이라도 비면 삼색동각이 아니다", () => {
    expect(names("333m333p123m456s9p", false)).not.toContain("sanshokuDoukou");
  });

  it("탕야오 — 요구패·자패가 한 장도 없을 때", () => {
    expect(names("234m567p345s22m56p", false)).toContain("tanyao");
  });

  it("1이 한 장이라도 있으면 탕야오가 아니다", () => {
    expect(names("123m567p345s22m56p", false)).not.toContain("tanyao");
  });

  it("색 계열은 어느 색으로 갈지도 함께 알려 준다", () => {
    const g = guessYaku(h("123456789m1234m"), false, true).find((x) => x.name === "chinitsu");
    expect(g?.suit).toBe("man");
  });
});

describe("판수 표는 하나뿐이다 — 열린 손의 쿠이사가리까지", () => {
  it("멘젠에서 깎이지 않고 열린 손에서 한 판 깎이는 역들", () => {
    for (const name of ["honitsu", "chinitsu", "ittsu", "sanshoku", "chanta", "junchan"] as const) {
      expect(hanOf(name, false)).toBe(hanOf(name, true) - 1);
    }
  });

  it("커쯔 계열·1판역은 울어도 안 깎인다", () => {
    for (const name of ["sanankou", "sanshokuDoukou", "yakuhai", "tanyao"] as const) {
      expect(hanOf(name, false)).toBe(hanOf(name, true));
    }
  });

  it("토이토이만 멘젠이 한 판 높다 — 쿠이사가리가 아니라 암각이 따라붙기 때문", () => {
    // 토이토이 자체는 열고 닫고 2판이다. 멘젠 3판은 "커쯔로 몰린 멘젠 손에는
    // 삼암각·역패가 대개 함께 붙는다"는 어림이고, 재작성 전부터 쓰던 값이다.
    expect(hanOf("toitoi", false)).toBe(2);
    expect(hanOf("toitoi", true)).toBe(3);
  });

  it("가장 비싼 역 하나만 센다 — 겹침을 더하면 낙관 쪽으로 기운다", () => {
    // 청일색(멘젠 6판)이면서 일통이기도 한 손
    const kinds = h("123456789m1199m");
    expect(bestYakuHan(kinds, true)).toBe(hanOf("chinitsu", true));
  });
});
