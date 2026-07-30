import { describe, expect, it } from "vitest";
import type { TileKind } from "../src/mahjong/tiles/Tile.js";
import { decompose } from "../src/mahjong/scoring/decompose.js";
import { winningKinds } from "../src/mahjong/scoring/waits.js";
import type { MeldInfo, WinContext } from "../src/mahjong/scoring/WinContext.js";
import { YakuRegistry } from "../src/mahjong/scoring/YakuRegistry.js";
import { registerStandardYaku } from "../src/mahjong/scoring/standardYaku.js";
import { evaluateWin } from "../src/mahjong/scoring/evaluate.js";
import { doraKindFor, countDora } from "../src/mahjong/scoring/dora.js";
import { calculateScore } from "../src/mahjong/scoring/score.js";

/** "123m45p6z" 표기 → TileKind[]. z: 1~4 = 동남서북, 5~7 = 백발중 */
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
const t = (spec: string): TileKind => h(spec)[0] as TileKind;

const registry = new YakuRegistry();
registerStandardYaku(registry);

function ctxOf(partial: Partial<WinContext> & Pick<WinContext, "hand" | "winningTile">): WinContext {
  return {
    melds: [],
    winType: "ron",
    seatWind: 2,
    prevalentWind: 1,
    riichi: null,
    ...partial,
  };
}

function ids(evaluation: { yaku: { id: string }[] } | null): string[] {
  return (evaluation?.yaku ?? []).map((y) => y.id).sort();
}

describe("decompose", () => {
  it("표준형 한 가지 분해", () => {
    const d = decompose(h("123m456m789p234s55z"), 0);
    expect(d).toHaveLength(1);
    expect(d[0]?.form).toBe("standard");
    expect(d[0]?.pair).toEqual(t("5z"));
  });

  it("111222333m은 암각×3과 슌쯔×3 두 해석이 나온다", () => {
    const d = decompose(h("111222333m456p99s"), 0);
    expect(d).toHaveLength(2);
    const types = d.map((x) => x.sets.filter((s) => s.type === "run").length).sort();
    expect(types).toEqual([1, 4]); // 456p만 슌쯔 vs 123m×3+456p
  });

  it("치토이·국사·불완성형", () => {
    expect(decompose(h("1122m3344p5566p77z"), 0)[0]?.form).toBe("chiitoitsu");
    expect(decompose(h("119m19p19s1234567z"), 0)[0]?.form).toBe("kokushi");
    expect(decompose(h("123m456p789s1245s3z"), 0)).toHaveLength(0);
  });

  it("후로 수만큼 손패 멘쯔 요구가 줄어든다", () => {
    // 펑 1개 → 손패는 3멘쯔 + 작두 = 11장
    expect(decompose(h("123m456p789s55z"), 1)).toHaveLength(1);
  });
});

describe("winningKinds (대기)", () => {
  it("양면 대기: 1m/4m", () => {
    const waits = ids0(winningKinds(h("23m456p789s111z22z"), 0));
    expect(waits).toEqual(["man1", "man4"]);
  });

  it("국사 13면 대기", () => {
    expect(winningKinds(h("19m19p19s1234567z"), 0)).toHaveLength(13);
  });

  it("노텐이면 빈 배열", () => {
    expect(winningKinds(h("129m456p789s1223z"), 0)).toHaveLength(0);
  });

  function ids0(kinds: TileKind[]): string[] {
    return kinds.map((k) => `${k.suit}${k.rank}`).sort();
  }
});

describe("evaluateWin — 일반 역", () => {
  it("탕야오+핑후+멘젠쯔모: 3판 20부", () => {
    const r = evaluateWin(
      ctxOf({ hand: h("234m345p456s678s22s"), winningTile: t("6s"), winType: "tsumo" }),
      registry,
    );
    expect(ids(r)).toEqual(["menzen_tsumo", "pinfu", "tanyao"]);
    expect(r?.han).toBe(3);
    expect(r?.fu).toBe(20);
  });

  it("역패(중) 후로: 1판 30부", () => {
    const melds: MeldInfo[] = [{ kind: "pon", tiles: h("777z") }];
    const r = evaluateWin(
      ctxOf({ hand: h("234m567p345s99s"), winningTile: t("3s"), melds }),
      registry,
    );
    expect(ids(r)).toEqual(["yakuhai_chun"]);
    expect(r?.han).toBe(1);
    expect(r?.fu).toBe(30); // 20 + 명각(중) 4 → 24 → 올림 30
  });

  it("리치+일발+쯔모+핑후+탕야오, 뒷도라 2 + 적도라 1 = 8판", () => {
    const r = evaluateWin(
      ctxOf({
        hand: h("234m345p456s678s22s"),
        winningTile: t("6s"),
        winType: "tsumo",
        riichi: { double: false, ippatsu: true },
        uraDoraKinds: [t("2s")],
        redCount: 1,
      }),
      registry,
    );
    expect(ids(r)).toEqual(["ippatsu", "menzen_tsumo", "pinfu", "riichi", "tanyao"]);
    expect(r?.uraHan).toBe(2); // 2s 작두 2장
    expect(r?.redHan).toBe(1);
    expect(r?.han).toBe(8);
  });

  it("치토이츠: 2판 25부", () => {
    const r = evaluateWin(
      ctxOf({ hand: h("1122m3344p5566p77z"), winningTile: t("7z") }),
      registry,
    );
    expect(ids(r)).toEqual(["chiitoitsu"]);
    expect(r?.fu).toBe(25);
  });

  it("량페코+핑후가 치토이 해석을 이긴다", () => {
    const r = evaluateWin(
      ctxOf({ hand: h("112233m445566p77s"), winningTile: t("6p") }),
      registry,
    );
    expect(ids(r)).toEqual(["pinfu", "ryanpeiko"]);
    expect(r?.han).toBe(4);
    expect(r?.fu).toBe(30); // 멘젠 론
  });

  it("혼일색(후로)+자풍+일기통관", () => {
    const melds: MeldInfo[] = [{ kind: "pon", tiles: h("222z") }];
    const r = evaluateWin(
      ctxOf({ hand: h("123m456m789m55z"), winningTile: t("9m"), melds }),
      registry,
    );
    expect(ids(r)).toEqual(["honitsu", "ittsuu", "yakuhai_seat"]);
    expect(r?.han).toBe(4); // 2 + 1 + 1
  });

  it("삼색동순+핑후 (멘젠)", () => {
    const r = evaluateWin(
      ctxOf({ hand: h("234m234p234s678m99s"), winningTile: t("2m") }),
      registry,
    );
    expect(ids(r)).toContain("sanshoku");
    expect(ids(r)).toContain("pinfu");
    expect(r?.han).toBe(3);
  });

  it("준찬타+핑후 (자패 없음 → 찬타 아님, 1m은 양면)", () => {
    const r = evaluateWin(
      ctxOf({ hand: h("123m789m123p789s99p"), winningTile: t("1m") }),
      registry,
    );
    expect(ids(r)).toEqual(["junchan", "pinfu"]);
    expect(r?.han).toBe(4);
  });

  it("청일색+일기통관 멘젠: 8판", () => {
    const r = evaluateWin(
      ctxOf({ hand: h("123m234m456m789m55m"), winningTile: t("5m") }),
      registry,
    );
    expect(ids(r)).toContain("chinitsu");
    expect(ids(r)).toContain("ittsuu");
    expect(r?.han).toBe(8);
  });

  it("장풍패 암각 + 간짱: 1판 40부", () => {
    const r = evaluateWin(
      ctxOf({ hand: h("123m678p99s234s111z"), winningTile: t("3s") }),
      registry,
    );
    expect(ids(r)).toEqual(["yakuhai_prevalent"]);
    expect(r?.fu).toBe(40); // 20 +멘젠론10 +동암각8 +간짱2 = 40
  });

  it("형태는 화료지만 역 없음 → ok:false", () => {
    const melds: MeldInfo[] = [{ kind: "chi", tiles: h("123m") }];
    const r = evaluateWin(
      ctxOf({ hand: h("456m789p456s99s"), winningTile: t("4m"), melds }),
      registry,
    );
    expect(r?.ok).toBe(false);
    expect(r?.yaku).toEqual([]);
  });

  it("화료 형태가 아니면 null", () => {
    const r = evaluateWin(
      ctxOf({ hand: h("123m456p789s1245s3z"), winningTile: t("3z") }),
      registry,
    );
    expect(r).toBeNull();
  });
});

describe("evaluateWin — 역만과 암각 판정", () => {
  const suuankouHand = h("111m222p333s99s55z");

  it("쯔모면 스안커 (역만)", () => {
    const r = evaluateWin(
      ctxOf({ hand: [...suuankouHand, t("5z")], winningTile: t("5z"), winType: "tsumo" }),
      registry,
    );
    expect(r?.yakumanCount).toBe(1);
    expect(ids(r)).toEqual(["suuankou"]);
  });

  it("같은 손이 론이면 산안커+또이또이+역패 (론 커쯔는 명각)", () => {
    const r = evaluateWin(
      ctxOf({ hand: [...suuankouHand, t("5z")], winningTile: t("5z"), winType: "ron" }),
      registry,
    );
    expect(r?.yakumanCount).toBe(0);
    expect(ids(r)).toEqual(["sanankou", "toitoi", "yakuhai_haku"]);
    expect(r?.han).toBe(5);
  });

  it("국사무쌍 — 단면 대기(머리 ≠ 화료패)는 단일 역만", () => {
    // 1m 2장을 이미 쥔 채 9m만 기다린 손 — 13종 중 9m 한 장으로만 화료했다
    const r = evaluateWin(
      ctxOf({ hand: h("119m19p19s1234567z"), winningTile: t("9m") }),
      registry,
    );
    expect(r?.yakumanCount).toBe(1);
    expect(ids(r)).toEqual(["kokushi"]);
  });

  it("국사무쌍 13면 대기 — 더블 역만 (kokushi와 배타)", () => {
    // 요구패 13종 ×1장에서 1m을 더 받았다 = 13종 어디로도 화료할 수 있던 손
    const r = evaluateWin(
      ctxOf({ hand: h("119m19p19s1234567z"), winningTile: t("1m") }),
      registry,
    );
    expect(r?.yakumanCount).toBe(2);
    expect(ids(r)).toEqual(["kokushi_13"]);
  });

  it("대사희 — 더블 역만", () => {
    // 북을 론으로 받아 그 커쯔가 명각이 된다 → 스안커는 서지 않고 대사희만 남는다
    const r = evaluateWin(
      ctxOf({ hand: h("111z222z333z444z55p"), winningTile: t("4z") }),
      registry,
    );
    expect(r?.yakumanCount).toBe(2);
    expect(ids(r)).toEqual(["daisuushii"]);
  });

  it("대사희 배수는 복합 합산과 같은 축이다 — 스안커까지 서면 3배", () => {
    // 5p 단기 론: 바람 커쯔 4개가 전부 암각으로 남아 스안커(1배)가 더 붙는다
    const r = evaluateWin(
      ctxOf({ hand: h("111z222z333z444z55p"), winningTile: t("5p") }),
      registry,
    );
    expect(r?.yakumanCount).toBe(3);
    expect(ids(r)).toEqual(["daisuushii", "suuankou"]);
  });

  it("소사희는 단일 역만 그대로", () => {
    const r = evaluateWin(
      ctxOf({ hand: h("111z222z333z44z789p"), winningTile: t("9p") }),
      registry,
    );
    expect(r?.yakumanCount).toBe(1);
    expect(ids(r)).toEqual(["shousuushii"]);
  });

  it("대삼원 — 역만이면 일반 역·도라를 세지 않는다", () => {
    const r = evaluateWin(
      ctxOf({
        hand: h("555z666z777z123m44p"),
        winningTile: t("1m"),
        doraKinds: [t("4p")],
      }),
      registry,
    );
    expect(r?.yakumanCount).toBe(1);
    expect(ids(r)).toEqual(["daisangen"]);
    expect(r?.doraHan).toBe(0);
  });
});

describe("dora", () => {
  it("표시패의 다음 패가 도라 (순환 포함)", () => {
    expect(doraKindFor(t("9m"))).toEqual(t("1m"));
    expect(doraKindFor(t("4z"))).toEqual(t("1z")); // 북 → 동
    expect(doraKindFor(t("7z"))).toEqual(t("5z")); // 중 → 백
    expect(doraKindFor(t("5s"))).toEqual(t("6s"));
  });

  it("중복 표시패는 도라를 중첩시킨다", () => {
    expect(countDora(h("55m123p"), [t("5m"), t("5m")])).toBe(4);
  });
});

describe("calculateScore", () => {
  it("자 3판 30부 론 = 3900", () => {
    const r = calculateScore({ han: 3, fu: 30, isDealer: false, winType: "ron" });
    expect(r.total).toBe(3900);
  });

  it("친 4판 30부 론 = 11600 (절상 없음)", () => {
    const r = calculateScore({ han: 4, fu: 30, isDealer: true, winType: "ron" });
    expect(r.total).toBe(11600);
    expect(r.limit).toBeNull();
  });

  it("4판 40부는 만관", () => {
    const r = calculateScore({ han: 4, fu: 40, isDealer: true, winType: "ron" });
    expect(r.total).toBe(12000);
    expect(r.limit).toBe("mangan");
  });

  it("자 만관 쯔모 = 2000/4000", () => {
    const r = calculateScore({ han: 5, fu: 30, isDealer: false, winType: "tsumo" });
    expect(r.payments).toEqual({ dealer: 4000, others: 2000 });
    expect(r.total).toBe(8000);
  });

  it("친 역만 론 = 48000, 역만 2개 복합 자 론 = 64000", () => {
    expect(
      calculateScore({ han: 0, fu: 0, yakumanCount: 1, isDealer: true, winType: "ron" }).total,
    ).toBe(48000);
    expect(
      calculateScore({ han: 0, fu: 0, yakumanCount: 2, isDealer: false, winType: "ron" }).total,
    ).toBe(64000);
  });

  it("13판 이상은 셈수 역만", () => {
    const r = calculateScore({ han: 13, fu: 30, isDealer: false, winType: "ron" });
    expect(r.limit).toBe("kazoe_yakuman");
    expect(r.total).toBe(32000);
  });
});
