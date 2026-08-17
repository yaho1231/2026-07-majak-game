/**
 * winShape — 결과 화면이 "어떻게 화료가 됐는가"를 그리는 근거.
 *
 * 손 모양 규칙을 바꾸는 증강(동수의 결속·비대칭 치또이·무너진 국경·양극·조커)으로 난 손은
 * 정렬만 늘어놓으면 화면에 아무 근거도 안 남는다(2026-08-18 사용자 보고). 채점이 채택한
 * 분해를 몸통 단위로 되돌려 주는지, 그리고 **평범한 손이 그대로인지**를 고정한다.
 */

import { describe, expect, it } from "vitest";
import type { TileKind } from "../src/mahjong/tiles/Tile.js";
import { kindKey } from "../src/mahjong/tiles/Tile.js";
import type { WinContext } from "../src/mahjong/scoring/WinContext.js";
import { YakuRegistry } from "../src/mahjong/scoring/YakuRegistry.js";
import { registerStandardYaku } from "../src/mahjong/scoring/standardYaku.js";
import { evaluateWin } from "../src/mahjong/scoring/evaluate.js";
import type { WinShape } from "../src/mahjong/scoring/winShape.js";

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

function shapeOf(
  spec: string,
  win: string,
  options?: WinContext["options"],
): WinShape {
  const ctx: WinContext = {
    hand: h(spec),
    winningTile: t(win),
    melds: [],
    winType: "ron",
    seatWind: 2,
    prevalentWind: 1,
    riichi: null,
    ...(options !== undefined ? { options } : {}),
  };
  const ev = evaluateWin(ctx, registry);
  if (ev?.shape === undefined) throw new Error("no shape");
  return ev.shape;
}

/** 몸통을 "123m"·"2m2s" 같은 짧은 표기로 — 순서까지 본다 (h()의 역함수) */
function render(shape: WinShape): string[] {
  const suitOf = (k: TileKind): string =>
    k.suit === "man" ? "m" : k.suit === "pin" ? "p" : k.suit === "sou" ? "s" : "z";
  const rankOf = (k: TileKind): number => (k.suit === "dragon" ? k.rank + 4 : k.rank);
  return shape.groups.map((g) => {
    let out = "";
    let digits = "";
    g.tiles.forEach((k, i) => {
      digits += String(rankOf(k));
      const next = g.tiles[i + 1];
      if (next === undefined || suitOf(next) !== suitOf(k)) {
        out += digits + suitOf(k);
        digits = "";
      }
    });
    return out;
  });
}

/** 몸통들의 패를 모두 합치면 손패와 같은가 (장수·종류 보존) */
function coversHand(shape: WinShape, spec: string): boolean {
  const count = (kinds: TileKind[]): string =>
    kinds.map(kindKey).sort().join(",");
  return count(shape.groups.flatMap((g) => g.tiles)) === count(h(spec));
}

describe("평범한 손 (회귀 방지)", () => {
  it("표준형 4멘쯔 1작두를 몸통으로 끊는다", () => {
    const shape = shapeOf("123m456m789m234p55p", "5p");
    expect(shape.form).toBe("standard");
    expect(render(shape)).toEqual(["123m", "456m", "789m", "234p", "55p"]);
    expect(shape.groups.filter((g) => g.type === "pair")).toHaveLength(1);
  });

  it("치또이 7쌍", () => {
    const shape = shapeOf("11m33m55m77p99p22s44s", "4s");
    expect(shape.form).toBe("chiitoitsu");
    expect(shape.groups).toHaveLength(7);
    expect(shape.groups.every((g) => g.type === "pair")).toBe(true);
    expect(render(shape)).toEqual(["11m", "33m", "55m", "77p", "99p", "22s", "44s"]);
  });

  it("국사무쌍 — 머리만 2장, 나머지는 한 장씩", () => {
    const shape = shapeOf("19m19p19s1234567z1z", "1z");
    expect(shape.form).toBe("kokushi");
    expect(shape.groups.filter((g) => g.type === "pair")).toHaveLength(1);
    expect(shape.groups.filter((g) => g.type === "single")).toHaveLength(12);
  });

  it("후로가 있으면 손패 몸통만 담는다 (후로는 화면이 따로 그린다)", () => {
    const ctx: WinContext = {
      hand: h("123m456m789m55p"),
      winningTile: t("5p"),
      melds: [{ kind: "pon", tiles: h("222s") }],
      winType: "ron",
      seatWind: 2,
      prevalentWind: 1,
      riichi: null,
    };
    const shape = evaluateWin(ctx, registry)?.shape;
    expect(shape).toBeDefined();
    expect(render(shape as WinShape)).toEqual(["123m", "456m", "789m", "55p"]);
  });
});

describe("증강이 만든 모양", () => {
  it("동수의 결속 — 무늬가 섞인 커쯔가 한 몸통으로 묶인다", () => {
    const spec = "2m2p2s5m5p5s123m789m99p";
    const shape = shapeOf(spec, "9p", { mixedTriplets: true });
    expect(render(shape)).toEqual(["123m", "2m2p2s", "5m5p5s", "789m", "99p"]);
    expect(coversHand(shape, spec)).toBe(true);
  });

  it("비대칭 치또이 — 이종 쌍이 짝지어진다 (2만2삭 5만5통 …)", () => {
    const spec = "2m2s5m5p6m6s8m8p1m1p4m4s33z";
    const shape = shapeOf(spec, "3z", { chiitoiMixedPairs: true });
    expect(shape.form).toBe("chiitoitsu");
    expect(render(shape)).toEqual([
      "1m1p",
      "2m2s",
      "4m4s",
      "5m5p",
      "6m6s",
      "8m8p",
      "33z",
    ]);
    expect(coversHand(shape, spec)).toBe(true);
  });

  it("무너진 국경 — 무늬가 섞인 슌쯔", () => {
    const spec = "1m2p3s456m789m234s11p";
    const shape = shapeOf(spec, "1p", { mixedRuns: true });
    expect(
      shape.groups.some(
        (g) => g.type === "run" && new Set(g.tiles.map((k) => k.suit)).size > 1,
      ),
    ).toBe(true);
    expect(coversHand(shape, spec)).toBe(true);
  });

  it("부숴진 벽 — 순환 슌쯔는 8-9-1 순서를 지킨다 (정렬하면 못 읽는다)", () => {
    const spec = "891m234p567p234s99s";
    const shape = shapeOf(spec, "9s", { wrapRuns: true });
    expect(render(shape)).toContain("891m");
  });

  it("혼색 머리 — 머리도 무늬가 섞일 수 있다 (2만+2통)", () => {
    const spec = "2m2p123m456m789m111s";
    const shape = shapeOf(spec, "1s", { mixedPairs: true });
    const pair = shape.groups.find((g) => g.type === "pair");
    expect(pair?.tiles.map(kindKey).sort()).toEqual([kindKey(t("2m")), kindKey(t("2p"))]);
    expect(coversHand(shape, spec)).toBe(true);
  });

  it("조커 — shape에는 조커가 **변한 뒤**의 패가 실린다", () => {
    // 백 한 장이 3통 자리를 메운다. 몸통 합계는 손패와 다르다(백 → 무엇인가)
    const shape = shapeOf("123m456m789m12p11p5z", "1p", {
      wildKinds: [{ suit: "dragon", rank: 1 }],
    });
    const all = shape.groups.flatMap((g) => g.tiles);
    expect(all).toHaveLength(14);
    // 백은 어느 몸통에도 그대로 남지 않는다 — 무언가로 변해 자리를 메웠다
    expect(all.filter((k) => kindKey(k) === kindKey(t("5z")))).toHaveLength(0);
    // 그 자리는 3통이었다 (123p가 채워진다)
    expect(render(shape)).toEqual(["123m", "456m", "789m", "123p", "11p"]);
  });
});
