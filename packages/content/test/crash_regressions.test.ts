/**
 * 크래시 회귀 (2026-07-29 감사) — 실게임에서 매치를 죽이던 경로들.
 *
 * 셋 다 "증강 1개 × 1명 × 1국" 스위프로는 절대 도달할 수 없던 조합이라,
 * 여기서는 각 크래시의 **최소 조건**을 직접 조립해 고정한다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGame,
  createStandardGameFromState,
  discardsZone,
  handIdsOf,
  installAugment,
  meldsZone,
  WALL,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  FlowStatus,
  PlayerId,
  StandardGame,
} from "@majak/core";
import { frameUp } from "../src/augments/frame_up.js";
import { tableFlip } from "../src/augments/table_flip.js";
import { takeBack } from "../src/augments/take_back.js";
import { craft } from "./helpers.js";

/** 드래프트와 같은 경로로 보유를 상태에 기록하고 설치한다 */
function equip(game: StandardGame, augs: AugmentDef[], holder: PlayerId): void {
  for (const a of augs) {
    const r = game.engine.submit({
      player: holder,
      type: "draftPick",
      payload: { augmentId: a.id },
    });
    if (!r.ok) throw new Error(`draftPick ${a.id}: ${r.reason}`);
    installAugment(game.engine, a, holder, { yaku: game.yaku });
  }
}

/** 리액션 페이즈는 반응자 전원의 결정이 모여야 해소된다 — 우선 액션 하나만 고르고 나머지는 pass */
function resolveReactions(
  flow: FlowController,
  start: FlowStatus,
  prefer: string,
): FlowStatus {
  let cur = start;
  let guard = 0;
  while (cur.kind === "awaiting" && guard++ < 20) {
    const prompt = cur.prompts[0]!;
    const wanted = prompt.options.find((o) => o.type === prefer);
    const pass = prompt.options.find((o) => o.type === "pass");
    const pick = wanted ?? pass;
    if (pick === undefined) break;
    cur = flow.submit(prompt.player, pick);
  }
  return cur;
}

describe("크래시 회귀 — 누명(frame_up)으로 심은 패를 울 수 있어야 한다", () => {
  /** p0 턴, p1은 3m 2장 보유 → p0가 3m을 p3 명의로 심으면 p1이 펑할 수 있다 */
  function setup() {
    const state = craft({
      hands: {
        p0: "3m123456789p11s2s",
        p1: "33m123456789p1s",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    // 누명은 첫 바퀴에는 못 쓴다(사풍연타 판정 보호) — craft가 firstTurn:false로 준다
    expect(state.round.firstTurn).toBe(false);
    const withAug = {
      ...state,
      players: state.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["frame_up"] } : p,
      ),
    };
    const game = createStandardGameFromState(withAug, undefined, [frameUp]);
    installAugment(game.engine, frameUp, "p0", { yaku: game.yaku });
    return game;
  }

  it("심은 패는 지목 대상의 바닥에 놓이고 방총 책임은 실제 버린 사람에게 남는다", () => {
    const game = setup();
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    expect(status.kind).toBe("awaiting");
    if (status.kind !== "awaiting") return;

    const frame = status.prompts[0]!.options.find(
      (o) =>
        o.type === "frame_discard" &&
        (o.payload as { target: string }).target === "p3",
    );
    expect(frame).toBeDefined();
    const tileId = (frame!.payload as { tileId: number }).tileId;

    flow.submit("p0", frame!);
    const s = game.engine.state;
    expect(s.zones[discardsZone("p3")]?.tileIds).toContain(tileId);
    expect(s.round.lastDiscard).toEqual({ player: "p0", tileId });
  });

  it("심은 패를 펑해도 엔진이 죽지 않고 멜드가 정상 성립한다", () => {
    const game = setup();
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("setup");

    const frame = status.prompts[0]!.options.find((o) => {
      if (o.type !== "frame_discard") return false;
      const pl = o.payload as { tileId: number; target: string };
      if (pl.target !== "p3") return false;
      const k = game.engine.state.tiles[pl.tileId]?.kind;
      return k?.suit === "man" && k.rank === 3;
    });
    expect(frame).toBeDefined();
    const planted = (frame!.payload as { tileId: number }).tileId;

    const after = flow.submit("p0", frame!);
    if (after.kind !== "awaiting") throw new Error("flip ended round");
    expect(after.prompts.some((p) => p.options.some((o) => o.type === "pon"))).toBe(
      true,
    );

    // 예전에는 여기서 `Tile N is not in zone discards:p0`로 throw했다
    expect(() => resolveReactions(flow, after, "pon")).not.toThrow();

    const s = game.engine.state;
    // 심긴 패가 p3 바닥에서 p1 멜드로 정확히 이동했다
    expect(s.zones[meldsZone("p1")]?.tileIds).toContain(planted);
    expect(s.zones[discardsZone("p3")]?.tileIds ?? []).not.toContain(planted);
    // 멜드의 '가져온 곳'은 방총 책임자(실제 버린 사람) 그대로다
    expect(s.round.byPlayer["p1"]?.melds.at(-1)?.calledFrom).toBe("p0");
  });

  it("첫 바퀴에는 심을 수 없다 (사풍연타 판정 보호)", () => {
    const game = createStandardGame({ seed: 1, extraAugments: [frameUp] });
    equip(game, [frameUp], "p0");
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("setup");
    expect(game.engine.state.round.firstTurn).toBe(true);
    expect(status.prompts[0]!.options.some((o) => o.type === "frame_discard")).toBe(
      false,
    );
  });
});

describe("크래시 회귀 — 밥상 뒤엎기(table_flip)가 쯔모패를 정합하게 남긴다", () => {
  function boot(augs: AugmentDef[]) {
    const game = createStandardGame({ seed: 1, extraAugments: augs });
    equip(game, augs, "p0");
    return game;
  }

  it("뒤엎은 뒤 lastDrawnTile이 새 손패 안의 패를 가리킨다", () => {
    const game = boot([tableFlip]);
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("setup");

    const flip = status.prompts[0]!.options.find((o) => o.type === "table_flip_do");
    expect(flip).toBeDefined();
    flow.submit("p0", flip as ActionOption);

    const s = game.engine.state;
    const drawn = s.round.lastDrawnTile;
    expect(drawn).not.toBeNull();
    expect(handIdsOf(s, "p0")).toContain(drawn);
    expect(s.zones[WALL]?.tileIds ?? []).not.toContain(drawn);
  });

  it("밥상 뒤엎기 + 무르기를 함께 보유해도 무르기가 엔진을 죽이지 않는다", () => {
    const game = boot([tableFlip, takeBack]);
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("setup");

    const flip = status.prompts[0]!.options.find((o) => o.type === "table_flip_do");
    expect(flip).toBeDefined();
    const next = flow.submit("p0", flip as ActionOption);
    if (next.kind !== "awaiting") throw new Error("flip ended round");

    const tb = next.prompts[0]!.options.find((o) => o.type === "take_back");
    expect(tb).toBeDefined();
    // 예전에는 여기서 `Tile N is not in zone hand:p0`로 throw했다
    expect(() => flow.submit("p0", tb as ActionOption)).not.toThrow();

    const s = game.engine.state;
    expect(handIdsOf(s, "p0")).toContain(s.round.lastDrawnTile);
  });
});
