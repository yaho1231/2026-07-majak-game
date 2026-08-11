/**
 * 후로 핑후형의 부 (01 §7).
 *
 * 후로했는데 가산(멘쯔·작두·대기)이 하나도 없는 손은
 *   - 론  → 30부 (20부 론은 인정하지 않는 표준 보정)
 *   - 쯔모 → **20부** (천봉 등 온라인·작장 통용 룰)
 *
 * 예전 구현은 쯔모 2부를 먼저 더해 fu가 22가 되는 바람에 `fu === 20` 보정이
 * 영영 걸리지 않아 후로 핑후형 쯔모가 30부로 나왔다. 이 파일은 그 회귀를 막는다.
 */

import { describe, expect, it } from "vitest";
import { calculateFu } from "../src/mahjong/scoring/fu.js";
import type { MeldInfo, WinContext } from "../src/mahjong/scoring/WinContext.js";
import { buildVariants } from "../src/mahjong/scoring/WinContext.js";
import { evaluateWin } from "../src/mahjong/scoring/evaluate.js";
import { YakuRegistry } from "../src/mahjong/scoring/YakuRegistry.js";
import { registerStandardYaku } from "../src/mahjong/scoring/standardYaku.js";
import type { TileKind } from "../src/mahjong/tiles/Tile.js";

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

/** 후로 핑후형: 치 123m + 손패 456m789m234p55s, 화료패 4p (양면) */
const CHI_123M: MeldInfo = { kind: "chi", tiles: h("123m") };
function openPinfuCtx(winType: "tsumo" | "ron"): WinContext {
  return {
    hand: h("456m789m234p55s"),
    melds: [CHI_123M],
    winningTile: t("4p"),
    winType,
    seatWind: 2,
    prevalentWind: 1,
    riichi: null,
  };
}

/** 손패 전체를 쓴 실제 채점 경로에서 나온 부 */
function fuOf(ctx: WinContext): number {
  const ev = evaluateWin(ctx, registry);
  if (ev === null) throw new Error("화료형이 아니다");
  return ev.fu;
}

describe("후로 핑후형", () => {
  it("론은 30부 그대로다", () => {
    expect(fuOf(openPinfuCtx("ron"))).toBe(30);
  });

  it("쯔모는 20부다 (쯔모 2부를 붙이지 않는다)", () => {
    expect(fuOf(openPinfuCtx("tsumo"))).toBe(20);
  });

  it("변형 단위로 봐도 론 30 / 쯔모 20", () => {
    for (const winType of ["ron", "tsumo"] as const) {
      const ctx = openPinfuCtx(winType);
      const open = buildVariants(ctx).filter(
        (v) => !v.isClosed && v.waitType === "ryanmen",
      );
      expect(open.length).toBeGreaterThan(0);
      for (const v of open) {
        expect(calculateFu(v, ctx, false)).toBe(winType === "ron" ? 30 : 20);
      }
    }
  });
});

describe("핑후처럼 보이는 손에 20부가 새지 않는다", () => {
  it("후로 + 간짱 대기 쯔모는 가산이 있으므로 30부", () => {
    // 치 123m + 456m789m245p55s, 화료패 3p (간짱 +2)
    const ctx: WinContext = {
      hand: h("456m789m234p55s"),
      melds: [CHI_123M],
      winningTile: t("3p"),
      winType: "tsumo",
      seatWind: 2,
      prevalentWind: 1,
      riichi: null,
    };
    // 20 + 2(간짱) + 2(쯔모) = 24 → 30
    expect(fuOf(ctx)).toBe(30);
  });

  it("후로 + 자패 커쯔 쯔모는 30부 (가산 4부)", () => {
    // 펑 백(5z) + 123m456m789m55s, 화료패 3m (양면)
    const ctx: WinContext = {
      hand: h("123m456m789m55s"),
      melds: [{ kind: "pon", tiles: h("555z") }],
      winningTile: t("3m"),
      winType: "tsumo",
      seatWind: 2,
      prevalentWind: 1,
      riichi: null,
    };
    // 20 + 4(자패 명각) + 2(쯔모) = 26 → 30
    expect(fuOf(ctx)).toBe(30);
  });

  it("멘젠 핑후 쯔모는 20부 그대로다", () => {
    const ctx: WinContext = {
      hand: h("123m456m789m234p55s"),
      melds: [],
      winningTile: t("4p"),
      winType: "tsumo",
      seatWind: 2,
      prevalentWind: 1,
      riichi: null,
    };
    expect(fuOf(ctx)).toBe(20);
  });

  it("멘젠 핑후 론은 30부 그대로다", () => {
    const ctx: WinContext = {
      hand: h("123m456m789m234p55s"),
      melds: [],
      winningTile: t("4p"),
      winType: "ron",
      seatWind: 2,
      prevalentWind: 1,
      riichi: null,
    };
    expect(fuOf(ctx)).toBe(30);
  });

  it("치또이는 25부 고정 (쯔모·론 모두)", () => {
    for (const winType of ["ron", "tsumo"] as const) {
      const ctx: WinContext = {
        hand: h("1133m5577p99s1122z"),
        melds: [],
        winningTile: t("2z"),
        winType,
        seatWind: 2,
        prevalentWind: 1,
        riichi: null,
      };
      expect(fuOf(ctx)).toBe(25);
    }
  });
});
