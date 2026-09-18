/**
 * 뒤섞인 아홉 개의 연꽃 (mixed_nine_gates) — 상시 → **동풍전 1회 · 반장전 2회** (2026-09-19).
 *
 * 버튼이 없는 자동 증강이다. 횟수가 남아 있는 동안은 종전과 똑같이 무늬를 지우고
 * 후로를 닫으며 역이 붙는다. 실제로 이 역으로 화료했을 때만 횟수가 1 준다.
 * 다 쓰면 ① 무늬 지우기(=후로 봉쇄)가 꺼지고 ② 역 판정도 닫힌다 —
 * 111m 234m 567p 88s 999s 처럼 무늬별로 몸통이 서는 손은 규칙 없이도 화료형이라
 * blockedYaku로 막지 않으면 역만이 그대로 붙는다.
 */

import { describe, expect, it } from "vitest";
import {
  buildWinContext,
  createStandardGameFromState,
  discardsZone,
  evaluateWin,
  installAugment,
  SYSTEM_PLAYER,
} from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { mixedNineGates } from "../src/augments/mixed_nine_gates.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 무늬가 흩어진 구련 뼈대 13장 (랭크 1112345678999) */
const SKELETON = "11m1p2s3m4p5s6m7p8s9m9p9s";
/** 무늬별로 몸통이 서는 뼈대 — 111m 234m 567p 999s + 8s (8s 대기) */
const SUITED = "111m234m567p8s999s";
const USES = "mixed_nine_gates:uses:p0";

function scene(
  hand: string,
  discard: string,
  opts: { mode?: "tonpuu" | "hanchan"; uses?: number; from?: "p1" | "p3" } = {},
): Game {
  const from = opts.from ?? "p1";
  const base: GameState = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: from === "p1" ? 1 : 3,
    lastDiscard: { player: from, spec: discard },
  });
  const st: GameState = {
    ...base,
    config: { ...base.config, mode: opts.mode ?? "hanchan" },
    augmentData: {
      ...base.augmentData,
      ...(opts.uses !== undefined ? { [USES]: opts.uses } : {}),
    },
  };
  const game = createStandardGameFromState(st);
  installAugment(game.engine, mixedNineGates, "p0", { yaku: game.yaku });
  return game;
}

function ronTile(game: Game): TileId {
  return game.engine.state.zones[discardsZone("p1")]?.tileIds[0] as TileId;
}

function yakuIds(game: Game): string[] {
  const ev = evaluateWin(
    buildWinContext(game.engine.state, "p0", "ron", ronTile(game), {
      rules: game.engine.rules,
      from: "p1",
    }),
    game.yaku,
  );
  return ev?.ok ? ev.yaku.map((y) => y.id) : [];
}

function settleRon(game: Game): void {
  const r = game.engine.submit({
    player: SYSTEM_PLAYER,
    type: "sys.settleWin",
    payload: { wins: [{ winner: "p0", from: "p1", tileId: ronTile(game), winType: "ron" }] },
  });
  if (!r.ok) throw new Error(r.reason);
}

describe("뒤섞인 아홉 개의 연꽃 — 동풍전 1회 · 반장전 2회 (자동)", () => {
  it("횟수가 남아 있으면 종전처럼 역만이 서고, 화료하면 횟수가 1 준다", () => {
    const game = scene(SKELETON, "5p");
    expect(yakuIds(game)).toContain("mixed_nine_gates");
    expect(game.engine.state.augmentData[USES]).toBeUndefined();
    settleRon(game);
    expect(game.engine.state.augmentData[USES]).toBe(1);
    const view = game.engine.state.augmentData["view:p0:uses:mixed_nine_gates"] as {
      left: number;
      total: number;
    };
    expect(view.left).toBe(1);
    expect(view.total).toBe(2);
  });

  it("동풍전은 1회다 — 한 번 화료하면 잔량 0", () => {
    const game = scene(SKELETON, "5p", { mode: "tonpuu" });
    settleRon(game);
    const view = game.engine.state.augmentData["view:p0:uses:mixed_nine_gates"] as {
      left: number;
      total: number;
    };
    expect(view.left).toBe(0);
    expect(view.total).toBe(1);
  });

  it("이 역이 아닌 화료로는 횟수가 줄지 않는다", () => {
    // 탕야오 — 이 증강과 무관한 평범한 화료
    const game = scene("234m456p678s22p33s", "3s");
    settleRon(game);
    expect(game.engine.state.augmentData[USES]).toBeUndefined();
  });

  it("다 쓰면 무늬 지우기가 꺼진다 — 흩어진 뼈대는 화료형이 아니다", () => {
    expect(yakuIds(scene(SKELETON, "5p", { uses: 2 }))).toEqual([]);
    // 동풍전은 1회 소진으로 끝
    expect(yakuIds(scene(SKELETON, "5p", { mode: "tonpuu", uses: 1 }))).toEqual([]);
  });

  it("다 쓰면 무늬별로 몸통이 서는 뼈대에도 역이 붙지 않는다 (blockedYaku)", () => {
    expect(yakuIds(scene(SUITED, "8s"))).toContain("mixed_nine_gates");
    const spent = yakuIds(scene(SUITED, "8s", { uses: 2 }));
    expect(spent).not.toContain("mixed_nine_gates");
  });

  it("다 쓰면 뼈대 위에서도 동색 치가 다시 열린다 (후로 봉쇄 해제)", () => {
    // 뼈대 + 8s 대기에서 7s·9s 대신 — 동색 치 재료가 있는 손으로 본다
    const hand = "11m1p2s3m4p5s6m7s8s9m9p9s";
    const chiOf = (game: Game): string | null => {
      const def = game.engine.actions.get("chi");
      if (def === undefined) throw new Error("no chi");
      const st = game.engine.state;
      const ids = st.zones["hand:p0"]?.tileIds ?? [];
      const pick = (r: number): TileId => {
        const id = ids.find((t) => {
          const k = st.tiles[t]?.kind;
          return k?.suit === "sou" && k.rank === r;
        });
        if (id === undefined) throw new Error(`no sou${r}`);
        return id;
      };
      return def.validate(
        { player: "p0", type: "chi", payload: { tileIds: [pick(7), pick(8)] } } as never,
        { state: st, rules: game.engine.rules } as never,
      );
    };
    // 상가(p3)가 6s를 버렸다 — 7s8s로 치. 이 손은 뼈대라 횟수가 남아 있으면 닫힌다
    expect(chiOf(scene(hand, "6s", { from: "p3" }))).not.toBeNull();
    expect(chiOf(scene(hand, "6s", { from: "p3", uses: 2 }))).toBeNull();
  });
});
