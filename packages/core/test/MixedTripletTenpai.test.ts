/**
 * 동수의 결속(mixedTriplets) / 무너진 국경(mixedRuns) 대기 계산 회귀.
 * 사용자 보고: 몸통 하나를 울고 7m7p7p1p1s5m5s 상태에서 1·5 샹퐁 대기가
 * 텐파이로 안 잡힌다.
 */
import { describe, expect, it } from "vitest";
import type { TileKind } from "../src/mahjong/tiles/Tile.js";
import { decompose, isWinningShape } from "../src/mahjong/scoring/decompose.js";
import { winningKinds } from "../src/mahjong/scoring/waits.js";
import { YakuRegistry } from "../src/mahjong/scoring/YakuRegistry.js";
import { registerStandardYaku } from "../src/mahjong/scoring/standardYaku.js";
import { evaluateWin } from "../src/mahjong/scoring/evaluate.js";
import type { WinContext } from "../src/mahjong/scoring/WinContext.js";

function h(spec: string): TileKind[] {
  const out: TileKind[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") { digits += ch; continue; }
    for (const d of digits) {
      const r = Number(d);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else if (ch === "z") out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
      else throw new Error(`bad suit: ${ch}`);
    }
    digits = "";
  }
  return out;
}
const key = (t: TileKind) => `${t.suit}${t.rank}`;

describe("mixedTriplets 샹퐁 대기", () => {
  const hand13 = h("7m7p7p1p1s5m5s"); // 7장 + 2후로
  it("완성형: 1p 추가 → 화료형", () => {
    expect(isWinningShape([...hand13, ...h("1m")], 2, { mixedTriplets: true })).toBe(true);
  });
  it("텐파이: 1·5 대기가 나온다", () => {
    const w = winningKinds(hand13, 2, undefined, { mixedTriplets: true }).map(key);
    expect(w.length).toBeGreaterThan(0);
    expect(w).toContain("man1");
    expect(w).toContain("pin5");
  });
});

const registry = new YakuRegistry();
registerStandardYaku(registry);
const mixedPon = (spec: string): WinContext["melds"][number] =>
  ({ kind: "pon", tiles: h(spec), tileIds: [], from: 1 }) as WinContext["melds"][number];

describe("mixedTriplets 샹퐁 — 실제 론 화료", () => {
  it("1m 론으로 화료가 성립하고 커쯔 몸통으로 채점된다", () => {
    const r = evaluateWin(
      {
        hand: [...h("7m7p7p1p1s5m5s"), ...h("1m")],
        melds: [mixedPon("2m2p2s"), mixedPon("3m3p3s")],
        winningTile: h("1m")[0] as TileKind,
        winType: "ron",
        seatWind: 2,
        prevalentWind: 1,
        riichi: null,
        options: { mixedTriplets: true },
      },
      registry,
    );
    expect(r?.ok).toBe(true);
    expect((r?.yaku ?? []).map((y) => y.id)).toContain("toitoi");
  });

  it("옵션이 꺼져 있으면 여전히 대기가 없다 (회귀 가드)", () => {
    expect(winningKinds(h("7m7p7p1p1s5m5s"), 2, undefined, {})).toHaveLength(0);
  });
});

describe("mixedRuns 대기", () => {
  it("혼색 슌쯔 대기(3s)가 잡힌다", () => {
    const w = winningKinds(h("1m2p456m789m111z99p"), 0, undefined, {
      mixedRuns: true,
    }).map(key);
    expect(w).toContain("sou3");
  });
});
