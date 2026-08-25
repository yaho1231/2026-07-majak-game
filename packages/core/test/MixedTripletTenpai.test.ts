/**
 * 동수의 결속(mixedTriplets) / 무너진 국경(mixedRuns) 대기 계산.
 *
 * **열리는 것은 커쯔뿐이다 — 머리(작두)는 무늬를 가린다** (2026-08-25 사용자 확정).
 * 잠깐 `mixedTriplets`가 `mixedPairs`를 함께 켜게 둔 적이 있는데(혼색 샹퐁을 살리려던
 * 것), 사용자가 그 확장을 물렀다. 이 파일은 그 경계를 양쪽에서 못박는다 —
 * 혼색 **커쯔**는 서고, 혼색 **머리**는 안 선다.
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

describe("mixedTriplets — 커쯔만 열리고 머리는 무늬를 가린다", () => {
  /*
   * 후로 2 + 7만7통7통·1통1삭·5만5삭.
   * 커쯔 둘을 세우려면 남은 한 쌍이 **머리**가 되어야 하는데 그 쌍이 혼색이라
   * (1통+1삭 / 5만+5삭) 화료형이 만들어지지 않는다 — 의도된 동작이다.
   */
  const mixedPairHand = h("7m7p7p1p1s5m5s");
  it("혼색 머리가 필요한 샹퐁은 완성형이 아니다", () => {
    expect(isWinningShape([...mixedPairHand, ...h("1m")], 2, { mixedTriplets: true })).toBe(
      false,
    );
  });
  it("혼색 머리가 필요한 샹퐁은 대기로 서지 않는다", () => {
    const w = winningKinds(mixedPairHand, 2, undefined, { mixedTriplets: true }).map(key);
    expect(w).not.toContain("man1");
    expect(w).not.toContain("pin5");
  });

  /*
   * 머리가 **같은 무늬**면 혼색 커쯔가 정상적으로 몸통이 된다 — 이 카드가 실제로 여는 것.
   * 후로 2 + 1만1통(혼색 쌍) + 5통5통(머리) + 9통9통9통 → 랭크 1이 무늬를 안 가리고 대기.
   */
  const properPairHand = h("1m1p5p5p999p");
  it("머리가 같은 무늬면 혼색 커쯔로 화료형이 선다", () => {
    expect(isWinningShape([...properPairHand, ...h("1s")], 2, { mixedTriplets: true })).toBe(
      true,
    );
  });
  it("머리가 같은 무늬면 랭크 1이 무늬를 안 가리고 대기로 선다", () => {
    const w = winningKinds(properPairHand, 2, undefined, { mixedTriplets: true }).map(key);
    expect(w).toContain("man1");
    expect(w).toContain("pin1");
    expect(w).toContain("sou1");
    // 5통은 대기가 아니다 — 그러려면 남은 1만1통이 **혼색 머리**가 되어야 한다
    expect(w).not.toContain("pin5");
  });
});

const registry = new YakuRegistry();
registerStandardYaku(registry);
const mixedPon = (spec: string): WinContext["melds"][number] =>
  ({ kind: "pon", tiles: h(spec), tileIds: [], from: 1 }) as WinContext["melds"][number];

describe("mixedTriplets — 실제 론 화료 (머리는 같은 무늬)", () => {
  it("1s 론으로 화료가 성립하고 혼색 커쯔가 몸통으로 채점된다", () => {
    const r = evaluateWin(
      {
        hand: [...h("1m1p5p5p999p"), ...h("1s")],
        melds: [mixedPon("2m2p2s"), mixedPon("3m3p3s")],
        winningTile: h("1s")[0] as TileKind,
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

  it("옵션이 꺼져 있으면 대기가 없다 (회귀 가드)", () => {
    expect(winningKinds(h("1m1p5p5p999p"), 2, undefined, {})).toHaveLength(0);
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
