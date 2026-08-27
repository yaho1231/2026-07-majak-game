/**
 * BacklogDecompose56 — 56차 백로그 배치 1의 코어 분해 확장 회귀.
 *  - 동수의 결속 (scoring.mixedTriplets, 이미 broken_border가 쓰는 규칙)
 *  - 왕의 징표 (scoring.kokushiDupes, 신규) — 국사 중복 허용
 * 표준 분해가 옵션 없이는 완전히 종전과 같은지(회귀)도 함께 못박는다.
 */

import { describe, expect, it } from "vitest";
import type { TileKind } from "../src/mahjong/tiles/Tile.js";
import { decompose } from "../src/mahjong/scoring/decompose.js";
import { winningKinds } from "../src/mahjong/scoring/waits.js";
import { YakuRegistry } from "../src/mahjong/scoring/YakuRegistry.js";
import { registerStandardYaku } from "../src/mahjong/scoring/standardYaku.js";
import { evaluateWin } from "../src/mahjong/scoring/evaluate.js";
import type { WinContext } from "../src/mahjong/scoring/WinContext.js";

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

describe("동수의 결속 (mixedTriplets)", () => {
  it("혼색 커쯔(1만1통1삭)로 표준형이 성립한다", () => {
    // 1m1p1s(혼색 커쯔) + 234m + 567p + 789s + 55z(머리) = 4멘쯔 1작두
    const hand = h("1m1p1s234m567p789s55z");
    expect(decompose(hand, 0)).toHaveLength(0); // 옵션 없으면 불성립
    const d = decompose(hand, 0, { mixedTriplets: true });
    expect(d.some((x) => x.form === "standard")).toBe(true);
  });

  it("슌쯔는 여전히 무늬를 가린다 — mixedTriplets는 커쯔에만 적용", () => {
    // 2m3p4s(혼색 슌쯔) 시도 — mixedTriplets만으로는 불성립
    const hand = h("2m3p4s234m567p789s55z");
    expect(decompose(hand, 0, { mixedTriplets: true })).toHaveLength(0);
  });
});

describe("왕의 징표 (kokushiDupes)", () => {
  it("dupes=0(표준)에서 12종 국사는 불성립", () => {
    // 9만 빠지고 1만이 3장 — 12종. 표준 국사 아님.
    const hand = h("111m19p19s1234567z"); // 1m×3 + 19p 19s 7자패 = 14장, 12종
    expect(decompose(hand, 0)).toHaveLength(0);
  });

  it("dupes=1이면 12종 + 중복으로 국사가 성립한다", () => {
    const hand = h("111m19p19s1234567z");
    const d = decompose(hand, 0, { kokushiDupes: 1 });
    expect(d.some((x) => x.form === "kokushi")).toBe(true);
  });

  it("표준 13종 국사는 dupes와 무관하게 그대로 성립(회귀)", () => {
    const std = h("119m19p19s1234567z"); // 1m 2장 = 표준 국사
    expect(decompose(std, 0)[0]?.form).toBe("kokushi");
    expect(decompose(std, 0, { kokushiDupes: 1 })[0]?.form).toBe("kokushi");
  });

  it("dupes=1이면 국사 대기가 넓어진다(12종에서 요구패 아무거나)", () => {
    // 11만 + 19통 19삭 + 6자패(중 빠짐) = 13장. 표준이면 13면(중 대기 유일 아님)…
    // 여기선 dupes로 이미 중복이 있어 아무 요구패나 오름패가 되는지만 확인.
    const hand13 = h("11m19p19s123456z"); // 13장: 1m×2, 19p,19s, 동남서북백발(중 없음)
    const stdWaits = winningKinds(hand13, 0);
    const dupWaits = winningKinds(hand13, 0, undefined, { kokushiDupes: 1 });
    expect(dupWaits.length).toBeGreaterThanOrEqual(stdWaits.length);
  });
});

describe("양극 (polarEnds)", () => {
  it("199 혼합 커쯔로 표준형이 성립한다", () => {
    // 1m1m9m(혼합 커쯔) + 234p + 567p + 789s + 55z(머리) = 4멘쯔 1작두
    const hand = h("119m234p567p789s55z");
    expect(decompose(hand, 0)).toHaveLength(0); // 옵션 없으면 불성립
    const d = decompose(hand, 0, { polarEnds: true });
    expect(d.some((x) => x.form === "standard")).toBe(true);
  });

  it("199·119 두 몸통이 모두 인정된다", () => {
    // 1m1m1m9m9m9m(6장) + 234p + 567p + 55z(머리) = 14장
    // → 111+999(순수) 그리고 119+199(혼합) 등 여러 분해가 나온다
    const hand = h("111999m234p567p55z");
    const d = decompose(hand, 0, { polarEnds: true });
    expect(d.length).toBeGreaterThanOrEqual(2);
  });

  it("무늬가 다른 1·9는 몸통이 아니다(무늬는 그대로)", () => {
    // 1m1p9s는 무늬가 다 달라 양극 몸통이 아니다
    const hand = h("1m1p9s234p567p789s55z");
    expect(decompose(hand, 0, { polarEnds: true })).toHaveLength(0);
  });

  it("머리는 여전히 같은 패 2장 — 1·9 혼합 머리는 불가", () => {
    // 19m을 머리로 쓰려는 손 — 성립하면 안 된다
    const hand = h("19m123p456p789p111s");
    expect(decompose(hand, 0, { polarEnds: true })).toHaveLength(0);
  });
});

describe("비대칭 치또이 (chiitoiMixedPairs)", () => {
  it("무늬 무관 rank 쌍(1만+1통)으로 치또이가 성립한다", () => {
    // 1m1p(rank1 이종쌍) 2s2s 3m3m 4p4p 5s5s 6m6m 7z7z = 7쌍(수패 6쌍 + 자패 1쌍)
    const hand = h("11m22s33m44p55s66m77z"); // 각 랭크/종류 2장씩
    // 위 표기는 동종쌍이라 표준으로도 성립 — 이종쌍 케이스를 따로 만든다
    const mixed = h("1m1p2s2s3m3m4p4p5s5s6m6m7z7z"); // 1m1p = 이종쌍
    expect(decompose(mixed, 0)).toHaveLength(0); // 표준으로는 불성립(1m·1p 각 1장)
    const d = decompose(mixed, 0, { chiitoiMixedPairs: true });
    expect(d.some((x) => x.form === "chiitoitsu")).toBe(true);
    // 표준 동종쌍 손은 옵션과 무관하게 성립(회귀)
    expect(decompose(hand, 0)[0]?.form).toBe("chiitoitsu");
    expect(decompose(hand, 0, { chiitoiMixedPairs: true })[0]?.form).toBe("chiitoitsu");
  });

  it("같은 패 3장은 «한 쌍 + 교차 쌍»으로 갈라진다 (3삭3장 + 3만)", () => {
    // 3s×3 + 3m → 3삭3삭 · 3삭3만. 나머지 다섯 쌍은 평범한 동종쌍. 14장.
    const hand = h("333s3m11m22m44p55p66p");
    const chiitoi = decompose(hand, 0, { chiitoiMixedPairs: true }).filter(
      (x) => x.form === "chiitoitsu",
    );
    expect(chiitoi.length).toBeGreaterThan(0);
    // 옵션이 없으면 여전히 불성립(3s가 3장이라 표준 7쌍이 안 된다)
    expect(decompose(hand, 0).filter((x) => x.form === "chiitoitsu")).toHaveLength(0);
  });

  it("같은 패 4장은 2쌍으로 쓰지 못한다", () => {
    // 1m×4 + 2m·3p·4p·5s·6s 각 2장 = 14장. 같은 패 4장은 금지.
    const bad = h("1111m22m33p44p55s66s");
    const chiitoi = decompose(bad, 0, { chiitoiMixedPairs: true }).filter(
      (x) => x.form === "chiitoitsu",
    );
    expect(chiitoi).toHaveLength(0);
  });

  it("홀수 랭크가 남으면 불성립", () => {
    // rank1이 3장(1m1p1s), rank2가 1장(2m) — 짝이 안 맞는다. 14장.
    const hand = h("1m1p1s2m3m3m4p4p5s5s6m6m7z7z");
    const chiitoi = decompose(hand, 0, { chiitoiMixedPairs: true }).filter(
      (x) => x.form === "chiitoitsu",
    );
    expect(chiitoi).toHaveLength(0);
  });
});

const t = (spec: string): TileKind => h(spec)[0] as TileKind;

const registry = new YakuRegistry();
registerStandardYaku(registry);
function ctxOf(
  partial: Partial<WinContext> & Pick<WinContext, "hand" | "winningTile">,
): WinContext {
  return {
    melds: [],
    winType: "ron",
    seatWind: 2,
    prevalentWind: 1,
    riichi: null,
    ...partial,
  };
}
function yakuIds(e: { yaku: { id: string }[] } | null): string[] {
  return (e?.yaku ?? []).map((y) => y.id).sort();
}

describe("비대칭 치또이 — 역 판정 정확성(allKinds가 실제 손패를 본다)", () => {
  it("만·통이 섞인 이종 쌍 치또이는 혼일색이 아니다", () => {
    // 대표 쌍의 첫 타일이 모두 '만'이라, allKinds가 pairs를 펼치면 혼일색으로 오판한다.
    // handKinds(실제 손패)를 봐야 만+통 두 무늬라 혼일색이 성립하지 않는다.
    const hand = h("1m1p2m2p3m3p4m4p5m5p6m6p7z7z"); // 만6 + 통6 + 중2
    const r = evaluateWin(
      ctxOf({ hand, winningTile: t("7z"), options: { chiitoiMixedPairs: true } }),
      registry,
    );
    const yk = yakuIds(r);
    expect(yk).toContain("chiitoitsu");
    expect(yk).not.toContain("honitsu");
    expect(yk).not.toContain("chinitsu");
  });
});

describe("양극 — 199 몸통은 삼색동각이 아니다", () => {
  it("199만 커쯔가 '1 커쯔'로 오인돼 삼색동각이 붙지 않는다", () => {
    // 199m(양극 커쯔) + 111p + 111s + 동동동 + 서서(머리). 199m을 rank1로 오인하면
    // 111p·111s와 함께 삼색동각(1)이 헛성립한다 — isSameRankTriplet 가드가 막아야 한다.
    const hand = h("119m111p111s111z33z"); // 1m1m9m·111p·111s·동동동·서서
    const r = evaluateWin(
      ctxOf({ hand, winningTile: t("9m"), options: { polarEnds: true } }),
      registry,
    );
    // 화료가 성립하든(다른 역으로) 안 하든, 삼색동각은 절대 붙으면 안 된다
    expect(yakuIds(r)).not.toContain("sanshoku_doukou");
  });
});

describe("동수의 결속 — 혼색 커쯔 후로가 커쯔로 채점된다", () => {
  const mixedPon = (spec: string): WinContext["melds"][number] =>
    ({ kind: "pon", tiles: h(spec), tileIds: [], from: 1 }) as WinContext["melds"][number];

  it("혼색 펑만으로 또이또이가 성립한다", () => {
    // 1m1p1s(손) + 2m2p2s·3m3p3s·4m4p4s(혼색 펑) + 5z5z(머리)
    const r = evaluateWin(
      ctxOf({
        hand: h("1m1p1s55z"),
        melds: [mixedPon("2m2p2s"), mixedPon("3m3p3s"), mixedPon("4m4p4s")],
        winningTile: t("1s"),
        options: { mixedTriplets: true },
      }),
      registry,
    );
    expect(yakuIds(r)).toContain("toitoi");
  });

  it("혼색 깡이 슌쯔로 오분류돼 또이또이가 날아가지 않는다", () => {
    // 랭크가 같고 무늬만 섞인 깡(4m4p4s4m)은 진짜 커쯔다. 랭크가 다른 깡
    // (동남서북·4연속)만 슌쯔성 몸통으로 내보내야 한다.
    const kan = {
      kind: "kan_open",
      tiles: h("4m4p4s4m"),
      tileIds: [],
      from: 1,
    } as unknown as WinContext["melds"][number];
    const r = evaluateWin(
      ctxOf({
        hand: h("1m1p1s55z"),
        melds: [mixedPon("2m2p2s"), mixedPon("3m3p3s"), kan],
        winningTile: t("1s"),
        options: { mixedTriplets: true },
      }),
      registry,
    );
    expect(r?.ok).toBe(true);
    expect(yakuIds(r)).toContain("toitoi");
  });

  it("혼색 펑이 대표 3장으로 뭉개져 청일색이 헛성립하지 않는다", () => {
    // 손패는 전부 만수지만 1m1p1s 펑이 있다 — 대표를 1m 3장으로 복제하면 청일색이 붙는다.
    const r = evaluateWin(
      ctxOf({
        hand: h("234m567m99m"),
        melds: [mixedPon("1m1p1s"), mixedPon("8m8m8m")],
        winningTile: t("7m"),
        options: { mixedTriplets: true },
      }),
      registry,
    );
    expect(yakuIds(r)).not.toContain("chinitsu");
    expect(yakuIds(r)).not.toContain("honitsu");
  });
});

describe("양극 — 1·9 혼합 깡도 커쯔로 채점된다", () => {
  const meldOf = (kind: string, spec: string): WinContext["melds"][number] =>
    ({ kind, tiles: h(spec), tileIds: [], from: 1 }) as unknown as WinContext["melds"][number];

  it("양극 가깡(1만1만9만9만)이 또이또이를 깨지 않는다", () => {
    // 양극 펑(1m1m9m)에 9m을 더한 가깡. 랭크가 섞였다고 슌쯔성 몸통으로 내보내면
    // 또이또이가 통째로 날아간다 — 같은 무늬의 1·9만이면 진짜 커쯔다.
    const r = evaluateWin(
      ctxOf({
        hand: h("111p111s55z"),
        melds: [meldOf("kan_added", "1m1m9m9m"), meldOf("pon", "999s")],
        winningTile: t("1p"),
        options: { polarEnds: true },
      }),
      registry,
    );
    expect(r?.ok).toBe(true);
    expect(yakuIds(r)).toContain("toitoi");
    expect(yakuIds(r)).not.toContain("sanshoku_doukou"); // 199를 '1 커쯔'로 오인 금지
  });

  /*
   * 2026-08-19 사용자 지시로 뒤집힌 규칙: 장사진의 4연속 깡은 **커쯔로도 셀 수 있다.**
   * 예전에는 슌쯔 해석 하나뿐이라 이 손이 또이또이를 못 받고 역 없음으로 떨어졌다.
   */
  it("장사진의 4연속 깡은 커쯔로도 세어 또이또이가 성립한다", () => {
    const r = evaluateWin(
      ctxOf({
        hand: h("111p111s55z"),
        melds: [meldOf("kan_closed", "1m2m3m4m"), meldOf("pon", "999s")],
        winningTile: t("1p"),
      }),
      registry,
    );
    expect(r?.ok).toBe(true);
    expect(yakuIds(r)).toContain("toitoi");
    // 랭크가 섞인 몸통은 '같은 숫자'를 요구하는 역에는 들어가지 않는다
    expect(yakuIds(r)).not.toContain("sanshoku_doukou");
  });

  it("장사진 깡의 슌쯔 해석도 살아 있다 — 비싼 쪽이 잡힌다(일기통관)", () => {
    // 123m 슌쯔 + 456m·789m + 장사진 깡(1m2m3m4m)이면 커쯔로 세는 순간 일통이 죽는다.
    // 두 해석을 다 내놓으므로 이쪽은 슌쯔 해석이 이긴다.
    const r = evaluateWin(
      ctxOf({
        hand: h("456m789m123p11s"),
        melds: [meldOf("kan_closed", "1m2m3m4m")],
        winningTile: t("1s"),
      }),
      registry,
    );
    expect(r?.ok).toBe(true);
    expect(yakuIds(r)).toContain("ittsuu");
  });

  it("바람의 계보 동남서북 안깡은 핑후도 아니다(깡은 슌쯔가 아니다)", () => {
    // 슌쯔성 몸통으로 내보내는 탓에 sets.every(run)만 보면 핑후가 헛성립한다.
    const r = evaluateWin(
      ctxOf({
        hand: h("234m567m234p55p"),
        melds: [meldOf("kan_closed", "1234z")],
        winningTile: t("4p"),
      }),
      registry,
    );
    expect(yakuIds(r)).not.toContain("pinfu");
    expect(yakuIds(r)).not.toContain("toitoi");
  });

  /*
   * 바람의 계보의 극단 — 동남서북 안깡 4개(바람 16장 전부) + 백 머리 단기 쯔모.
   *
   * 몸통이 전부 **슌쯔성**이라는 점이 여기서 한꺼번에 갈린다. 대사희·스안커는 "커쯔"를
   * 요구하므로 붙지 않고(동남서북은 커쯔가 아니다), 장수·종류만 보는 자일색과 깡 수만
   * 세는 스깡즈는 그대로 붙는다. meldToSet이 랭크 섞인 깡을 커쯔로 되돌리면 이 손이
   * 한순간에 3배 역만이 되므로 네 방향을 함께 못박는다.
   */
  it("동남서북 안깡 4개 + 백 단기는 자일색·스깡즈만 (대사희·스안커 X)", () => {
    const kan = meldOf("kan_closed", "1234z");
    const r = evaluateWin(
      ctxOf({
        hand: h("55z"),
        melds: [kan, kan, kan, kan],
        winningTile: t("5z"),
        winType: "tsumo",
      }),
      registry,
    );
    expect(yakuIds(r)).toContain("tsuuiisou"); // 자일색 — 전부 자패
    expect(yakuIds(r)).toContain("suukantsu"); // 스깡즈 — 깡 4개
    expect(yakuIds(r)).not.toContain("daisuushii"); // 대사희 — 바람 커쯔가 하나도 없다
    expect(yakuIds(r)).not.toContain("suuankou"); // 스안커 — 몸통이 커쯔가 아니다
    expect(yakuIds(r)).not.toContain("suuankou_tanki");
  });
});

describe("옵션 없는 표준 분해 회귀", () => {
  it("표준형·치또이·국사가 종전과 동일", () => {
    expect(decompose(h("123m456m789p234s55z"), 0)).toHaveLength(1);
    expect(decompose(h("1122m3344p5566p77z"), 0)[0]?.form).toBe("chiitoitsu");
    expect(decompose(h("119m19p19s1234567z"), 0)[0]?.form).toBe("kokushi");
    expect(decompose(h("123m456p789s1245s3z"), 0)).toHaveLength(0);
  });
});
