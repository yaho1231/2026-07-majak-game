/**
 * backlog_56_soul_hunt — 혼 사냥 역 판정.
 * 보유자가 론했고 방총자가 리치 중일 때만 soul_hunt(+1판)이 붙는다.
 * (뒷도라는 buildWinContext가 rule로 uraAlways를 켜는 경로라 여기선 역 성립만 검증)
 */

import { describe, expect, it } from "vitest";
import {
  createStandardGame,
  installAugment,
  evaluateWin,
} from "@majak/core";
import type { TileKind, WinContext } from "@majak/core";
import { soulHunt } from "../src/augments/soul_hunt.js";

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
    }
    digits = "";
  }
  return out;
}
const t = (spec: string): TileKind => h(spec)[0] as TileKind;

/** soulHunt를 p0에 설치한 게임의 YakuRegistry를 만든다 */
function yakuWithSoulHunt() {
  const game = createStandardGame({ seed: 1, extraAugments: [soulHunt] });
  installAugment(game.engine, soulHunt, "p0", { yaku: game.yaku });
  return game.yaku;
}

function ctx(partial: Partial<WinContext> & Pick<WinContext, "hand" | "winningTile">): WinContext {
  return {
    melds: [],
    winType: "ron",
    seatWind: 2,
    prevalentWind: 1,
    riichi: null,
    winnerId: "p0",
    ...partial,
  };
}

function ids(e: { yaku: { id: string }[] } | null): string[] {
  return (e?.yaku ?? []).map((y) => y.id).sort();
}

describe("혼 사냥 (soul_hunt)", () => {
  // 탕야오 손(2~8만 슌쯔·커쯔) — 기본 역이 하나 있어 화료 성립
  const hand = "234m567m234p678p55s";
  const winTile = "5s";

  it("론 + 방총자 리치면 soul_hunt(+1판)이 붙는다", () => {
    const yaku = yakuWithSoulHunt();
    const r = evaluateWin(
      ctx({ hand: h(hand), winningTile: t(winTile), fromRiichi: true, fromPlayerId: "p1" }),
      yaku,
    );
    expect(ids(r)).toContain("soul_hunt");
  });

  it("방총자가 리치가 아니면 붙지 않는다", () => {
    const yaku = yakuWithSoulHunt();
    const r = evaluateWin(
      ctx({ hand: h(hand), winningTile: t(winTile), fromRiichi: false, fromPlayerId: "p1" }),
      yaku,
    );
    expect(ids(r)).not.toContain("soul_hunt");
  });

  it("쯔모(론이 아님)에는 붙지 않는다", () => {
    const yaku = yakuWithSoulHunt();
    const r = evaluateWin(
      ctx({ hand: h(hand), winningTile: t(winTile), winType: "tsumo", fromRiichi: true }),
      yaku,
    );
    expect(ids(r)).not.toContain("soul_hunt");
  });

  it("보유자가 아닌 승자에겐 붙지 않는다", () => {
    const yaku = yakuWithSoulHunt();
    const r = evaluateWin(
      ctx({ hand: h(hand), winningTile: t(winTile), fromRiichi: true, winnerId: "p2" }),
      yaku,
    );
    expect(ids(r)).not.toContain("soul_hunt");
  });
});
