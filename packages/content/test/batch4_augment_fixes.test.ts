/**
 * 4단계 개별 결함 — 짝수의 세계 / 절벽 위에 피어난 꽃 (docs/25 역/점수 #11, 벽패 #5).
 */

import { describe, expect, it } from "vitest";
import {
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, TileKind } from "@majak/core";
import { craft } from "./helpers.js";
import { evenWorld } from "../src/augments/even_world.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 도라 표시패를 지정한 종류로 세운 게임 (표시패 → 도라는 +1) */
function gameWithDoraIndicator(hand: string, indicator: TileKind): Game {
  const base = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  // 왕패의 도라 표시패 자리를 원하는 종류로 바꾼다
  const deadWall = base.zones["deadWall"]?.tileIds ?? [];
  const idx = deadWall.length - 10; // doraIndicatorIndex(state, 0)
  const indicatorId = deadWall[idx];
  if (indicatorId === undefined) throw new Error("no dora indicator slot");
  const state: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["even_world"] } : p,
    ),
    tiles: {
      ...base.tiles,
      [indicatorId]: { ...base.tiles[indicatorId]!, kind: indicator },
    },
  };
  const game = createStandardGameFromState(state, undefined, [evenWorld]);
  installAugment(game.engine, evenWorld, "p0", { yaku: game.yaku });
  return game;
}

/** 손패에서 그 종류가 몇 장인가 */
function countKind(game: Game, spec: TileKind): number {
  const s = game.engine.state;
  return handIdsOf(s, "p0").filter((id) => kindKey(kindOf(s, id)) === kindKey(spec))
    .length;
}

describe("짝수의 세계 — 예외 없이 전부 짝수 (도라를 만드는 것도 막지 않는다)", () => {
  it("변환 결과가 도라가 되는 패도 그대로 바뀐다 (2026-08-15 조건 삭제)", () => {
    // 표시패 7p → 도라는 8p. 손의 7p·9p는 짝수로 바꾸면 8p가 되어 도라가 생긴다 —
    // 예전에는 이걸 막았지만 지금은 의도된 이득이다.
    // (지켜지는 것은 "지금 도라인 패", 즉 8p뿐이다. 표시패 7p는 도라가 아니다.)
    const game = gameWithDoraIndicator("77p99p123m456m11s", { suit: "pin", rank: 7 });
    const before8p = countKind(game, { suit: "pin", rank: 8 });

    const res = game.engine.submit({ player: "p0", type: "even_world_flip", payload: {} });
    if (!res.ok) throw new Error(`even_world_flip rejected: ${res.reason}`);
    // 7p 두 장·9p 두 장이 모두 8p(도라)가 된다
    expect(countKind(game, { suit: "pin", rank: 8 })).toBe(before8p + 4);
    expect(countKind(game, { suit: "pin", rank: 7 })).toBe(0);
  });

  it("도라와 무관한 홀수 패는 종전대로 짝수가 된다", () => {
    // 표시패 1z(동) → 도라는 남. 수패와 무관하므로 변환이 정상 동작해야 한다
    const game = gameWithDoraIndicator("123m456m789m13s11p", { suit: "wind", rank: 1 });
    const res = game.engine.submit({ player: "p0", type: "even_world_flip", payload: {} });
    if (!res.ok) throw new Error(`even_world_flip rejected: ${res.reason}`);
    const s = game.engine.state;
    // 2026-08-31 사양 변경: 예외가 없다 — 적도라(빨간 5)도 함께 짝수가 된다.
    const odd = handIdsOf(s, "p0").filter((id) => {
      const k = kindOf(s, id);
      return k.suit !== "wind" && k.suit !== "dragon" && k.rank % 2 === 1;
    });
    expect(odd).toEqual([]);
  });
});

describe("절벽 위에 피어난 꽃 — 만개 손이 이페코를 만들지 않는다", () => {
  it("멘쯔 배치의 (무늬, 시작 랭크)가 전부 서로 다르다", async () => {
    // 구현의 배치표를 직접 검사한다 — 만개 손을 실제로 세우려면 깡·왕패 상태가
    // 필요해 조립 비용이 크고, 결함의 본질은 배치표의 중복이다.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../src/augments/cliff_bloom.ts", import.meta.url),
        "utf8",
      ),
    );
    const rows = [...src.matchAll(/\{ suit: "(man|pin|sou)", start: (\d+) \}/g)].map(
      (m) => `${m[1]}:${m[2]}`,
    );
    expect(rows.length).toBeGreaterThanOrEqual(5);
    expect(new Set(rows).size).toBe(rows.length); // 이페코 회피
  });

  it("삼색동순·일기통관도 만들지 않는다", async () => {
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(
        new URL("../src/augments/cliff_bloom.ts", import.meta.url),
        "utf8",
      ),
    );
    const rows = [...src.matchAll(/\{ suit: "(man|pin|sou)", start: (\d+) \}/g)].map(
      (m) => ({ suit: m[1] as string, start: Number(m[2]) }),
    );
    // 삼색동순: 같은 시작이 세 무늬에 걸치면 안 된다
    const bySuitOfStart = new Map<number, Set<string>>();
    for (const r of rows) {
      const set = bySuitOfStart.get(r.start) ?? new Set<string>();
      set.add(r.suit);
      bySuitOfStart.set(r.start, set);
    }
    for (const suits of bySuitOfStart.values()) expect(suits.size).toBeLessThan(3);

    // 일기통관: 한 무늬 안의 시작이 {1,4,7}을 전부 포함하면 안 된다
    const byStartOfSuit = new Map<string, Set<number>>();
    for (const r of rows) {
      const set = byStartOfSuit.get(r.suit) ?? new Set<number>();
      set.add(r.start);
      byStartOfSuit.set(r.suit, set);
    }
    for (const starts of byStartOfSuit.values()) {
      expect([1, 4, 7].every((x) => starts.has(x))).toBe(false);
    }
  });
});
