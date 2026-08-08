/**
 * 우는 국사 — **평범한 후로가 있으면 kokushi_pon 자체를 막는다** (2026-08-08 QA BLOCKER-1).
 *
 * 잠금(`kokushiOnly`)은 첫 kokushi_pon 시점부터 걸리므로, 그전에 만든 치·펑·깡은
 * 손에 그대로 남는다. 국사는 요구패 묶음만으로 이루어져야 해서, 요구패가 아닌
 * 멘쯔가 섞이면 `decompose`의 멜드 국사 분기(`K === meldCount*3`)가 영영 안 맞고
 * 동시에 표준형·치또이도 막혀 **화료도 텐파이도 불가능**해진다(확정 노텐).
 *
 * 요구패 중복(open_kokushi_dup_pon.test.ts)과 같은 함정이 반대 방향에서 열려
 * 있던 것이라, 같은 방식으로 후보 생성과 validate 양쪽에서 막는다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  decompose,
  handIdsOf,
  installAugment,
  kindOf,
} from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { openKokushi } from "../src/augments/open_kokushi.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/**
 * p1이 4z(北)를 버린 장면. p0의 손에는 東·南이 있어 "北東南" 조합이 성립한다.
 *
 * @param meld p0가 미리 가지고 있는 후로. `"normal"`은 평범한 펑(9만 3장),
 *             `"none"`은 후로 없음(기준선).
 */
function scene(meld: "none" | "normal"): Game {
  const base = craft({
    hands: { p0: "123z19m19p19s5m", p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "4z" },
    ...(meld === "normal"
      ? { melds: { p0: [{ kind: "pon" as const, spec: "999m" }] } }
      : {}),
  });
  const state: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["open_kokushi"] } : p,
    ),
  };
  const game = createStandardGameFromState(state, undefined, [openKokushi]);
  installAugment(game.engine, openKokushi, "p0", { yaku: game.yaku });
  return game;
}

function idOfKind(game: Game, suit: string, rank: number): TileId {
  const s = game.engine.state;
  const id = handIdsOf(s, "p0").find((t) => {
    const k = kindOf(s, t);
    return k.suit === suit && k.rank === rank;
  });
  if (id === undefined) throw new Error(`no ${suit}${rank} in hand`);
  return id;
}

describe("우는 국사 — 평범한 후로가 있으면 못 부른다", () => {
  it("후로가 없으면 종전대로 kokushi_pon이 제시된다 (기준선)", () => {
    const game = scene("none");
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("setup");
    const mine = status.prompts.find((p) => p.player === "p0");
    expect(mine?.options.some((o) => o.type === "kokushi_pon")).toBe(true);
  });

  it("평범한 펑이 있으면 후보에 뜨지 않는다", () => {
    const game = scene("normal");
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("setup");
    const mine = status.prompts.find((p) => p.player === "p0");
    expect((mine?.options ?? []).filter((o) => o.type === "kokushi_pon")).toEqual([]);
  });

  it("제출 경로(validate)도 독립적으로 막는다", () => {
    const game = scene("normal");
    const res = game.engine.submit({
      player: "p0",
      type: "kokushi_pon",
      payload: {
        tileIds: [idOfKind(game, "wind", 1), idOfKind(game, "wind", 2)],
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("already has a non-kokushi meld");
  });

  it("막지 않았다면 실제로 화료 불가였다 — 이 가드가 지키는 것", () => {
    // 평범한 펑 1개 + 국사 퐁 1개 = meldCount 2, 요구패 kind 3종.
    // 멜드 국사 분기는 K === meldCount*3 을 요구하므로 3 !== 6 → 분해 실패.
    const game = scene("normal");
    const s = game.engine.state;
    const handKinds = handIdsOf(s, "p0").map((id) => kindOf(s, id));
    const forms = decompose(handKinds, 2, {
      kokushiOnly: true,
      kokushiMeldKinds: [
        { suit: "wind", rank: 1 },
        { suit: "wind", rank: 2 },
        { suit: "wind", rank: 4 },
      ],
    });
    expect(forms).toEqual([]);
  });
});
