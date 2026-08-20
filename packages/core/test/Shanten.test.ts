/**
 * 샹텐·우케이레 계산 검증.
 *
 * 봇의 버림·후로 판단이 전부 이 값 위에 서 있어서, 여기가 틀리면 봇이 조용히 이상해진다.
 * 손으로 답을 아는 형태들을 표준형·치또이·국사·후로 손별로 박아 둔다.
 */

import { describe, expect, it } from "vitest";
import { shantenOf, ukeireOf } from "../src/index.js";
import type { TileKind } from "../src/index.js";

/** "123m45p6s11z" → TileKind[] */
function h(spec: string): TileKind[] {
  const out: TileKind[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
      continue;
    }
    for (const d of digits) {
      const r = Number(d);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else if (ch === "z")
        out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
      else throw new Error(`bad suit: ${ch}`);
    }
    digits = "";
  }
  return out;
}

describe("shantenOf — 표준형", () => {
  it("완성형은 -1", () => {
    expect(shantenOf(h("123m456m789m123p11s"), 0)).toBe(-1);
  });

  it("량면 대기 텐파이는 0", () => {
    expect(shantenOf(h("123m456m789m11p56s"), 0)).toBe(0);
  });

  it("단기 대기 텐파이는 0 (4멘쯔 + 외톨이 1장)", () => {
    expect(shantenOf(h("123m456m789m123p5s"), 0)).toBe(0);
  });

  it("1샹텐 — 3멘쯔 + 작두 + 부분멘쯔 하나가 모자란다", () => {
    expect(shantenOf(h("123m456m789m11p47s"), 0)).toBe(1);
  });

  it("배패 수준의 흩어진 손은 5샹텐 이상", () => {
    expect(shantenOf(h("1479m2589p369s12z"), 0)).toBeGreaterThanOrEqual(5);
  });
});

describe("shantenOf — 후로 손", () => {
  it("후로 1개 + 3멘쯔 + 작두 = 텐파이", () => {
    // 손패 10장 (13 - 3), 후로 1개
    expect(shantenOf(h("123m456m789m11p"), 1)).toBe(-1);
    expect(shantenOf(h("123m456m789m1p"), 1)).toBe(0);
  });

  it("후로 2개 + 2멘쯔 + 작두 = 텐파이", () => {
    expect(shantenOf(h("123m456m1p"), 2)).toBe(0);
  });
});

describe("shantenOf — 치또이·국사", () => {
  it("6또이쯔는 치또이 텐파이", () => {
    expect(shantenOf(h("1122m3344p5566s7z"), 0)).toBe(0);
  });

  it("요구패 13종은 국사 텐파이", () => {
    expect(shantenOf(h("19m19p19s1234567z"), 0)).toBe(0);
  });

  it("요구패 12종 + 중복 하나는 국사 화료형", () => {
    expect(shantenOf(h("19m19p19s11234567z"), 0)).toBe(-1);
  });

  it("후로한 손은 치또이·국사로 세지 않는다", () => {
    // 같은 13장이라도 후로가 있으면 표준형만 남아 한참 멀다
    expect(shantenOf(h("19m19p19s1234z"), 1)).toBeGreaterThan(3);
  });
});

/*
 * 우는 국사(open_kokushi) — 특수 퐁을 한 순간 `scoringOptionsOf`가 `kokushiOnly`와
 * `kokushiMeldKinds`를 켠다(helpers.ts). 그 손은 국사로만 화료할 수 있는데,
 * 예전 `shantenOf`는 두 옵션을 보지 않고 표준형 값을 그대로 답으로 썼다 —
 * 국사 텐파이가 샹텐 6으로 읽혀 봇이 자기 역만 텐파이를 노텐으로 봤다
 * (read.ts의 `if (shanten <= 0)`이 대기·리치·푸시 판단의 문지기다). 2026-08-20 QA 확정.
 */
describe("shantenOf — 우는 국사 (kokushiOnly · kokushiMeldKinds)", () => {
  /** kokushi_pon 세 장 = 1m·7z(중)·9s 를 덮개로 잡은 손 */
  const MELD = h("1m9s7z");
  const opts = { kokushiOnly: true as const, kokushiMeldKinds: MELD };

  it("남은 10종을 다 모은 손은 텐파이(0) — 표준형 값(6)이 답이 아니다", () => {
    // 손 11장: 남은 10종 + 후로가 덮은 9s 한 장(쓸모없는 여분)
    const hand = h("9m19p19s123456z");
    expect(shantenOf(hand, 1, opts)).toBe(0);
    expect(shantenOf(hand, 1)).toBe(6); // 대조: 옵션 없는 표준형
  });

  it("한 종류가 비면 1샹텐", () => {
    expect(shantenOf(h("9m19p19s12345z5m"), 1, opts)).toBe(1);
  });

  it("남은 10종 + 그중 하나가 짝이면 화료형(-1)", () => {
    expect(shantenOf(h("9m19p19s1234566z"), 1, opts)).toBe(-1);
  });

  it("후로가 없어도 kokushiOnly면 표준형·치또이 값을 쓰지 않는다", () => {
    // 표준형으로는 화료 직전이지만, 국사 외길이면 국사 샹텐이 답이다
    const hand = h("123m456m789m11p22s");
    expect(shantenOf(hand, 0)).toBe(0); // 표준형: 텐파이
    expect(shantenOf(hand, 0, { kokushiOnly: true })).toBeGreaterThan(5);
  });

  it("표준 손은 옵션이 없으면 예전 그대로다 (회귀 방지)", () => {
    expect(shantenOf(h("19m19p19s1234567z"), 0)).toBe(0);
    expect(shantenOf(h("123m456m789m123p1s"), 0)).toBe(0);
  });
});

describe("ukeireOf — 받는 패의 실제 장수", () => {
  const all4 = (): number => 4;

  it("량면 대기는 두 종류 8장을 받는다", () => {
    const u = ukeireOf(h("123m456m789m11p56s"), 0, all4);
    expect(u.kinds).toHaveLength(2); // 4s · 7s
    expect(u.tiles).toBe(8);
  });

  it("이미 보이는 패는 세지 않는다 (장 세기)", () => {
    // 4s가 전부 나갔다면 7s 4장만 남는다
    const u = ukeireOf(h("123m456m789m11p56s"), 0, (k) =>
      k.suit === "sou" && k.rank === 4 ? 0 : 4,
    );
    expect(u.tiles).toBe(4);
  });

  it("중장패를 든 1샹텐이 끝패만 든 1샹텐보다 많이 받는다", () => {
    // 3멘쯔 + 작두 + 외톨이 둘 — 외톨이가 4s·7s면 붙는 패가 8종, 1s·9s면 6종이다
    const wide = ukeireOf(h("234m567m345p22s47s"), 0, all4);
    const narrow = ukeireOf(h("234m567m345p22s19s"), 0, all4);
    expect(wide.tiles).toBeGreaterThan(narrow.tiles);
  });
});
