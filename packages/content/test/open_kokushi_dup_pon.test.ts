/**
 * 우는 국사 — 같은 요구패를 두 번 울면 그 국이 잠긴다 (docs/25 역/점수 #4).
 *
 * 국사는 13종을 하나씩 모으는 손이라, 요구패가 겹치는 kokushi_pon을 두 번 부르면
 * 국사 분해가 영구 실패한다. 게다가 이 증강은 커밋 후 `kokushiOnly`로 표준형·치토이를
 * 막으므로 **화료도 텐파이도 불가능**해지고 노텐 벌점까지 확정된다.
 *
 * 봇은 `committed`면 조건 없이 콜하므로(open_kokushi.ts 봇 정책) 반드시 밟는 함정이었다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { openKokushi } from "../src/augments/open_kokushi.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/**
 * p0가 이미 東南西를 kokushi_pon으로 잡아 둔 상태에서, p1이 北을 버린 장면.
 * p0의 손에는 南·西가 또 있어 "北南西" 조합이 형태상 성립한다 — 예전에는 이게 통과했다.
 */
function scene(withMeld: boolean): Game {
  const base = craft({
    hands: { p0: "1122334z19m19p19s", p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "4z" },
    ...(withMeld
      ? { melds: { p0: [{ kind: "kokushi_pon" as const, spec: "123z" }] } }
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

/** 손패에서 그 종류의 패 id */
function idOfKind(game: Game, spec: { suit: string; rank: number }): TileId {
  const s = game.engine.state;
  const id = handIdsOf(s, "p0").find((t) => {
    const k = kindOf(s, t);
    return k.suit === spec.suit && k.rank === spec.rank;
  });
  if (id === undefined) throw new Error(`no ${spec.suit}${spec.rank} in hand`);
  return id;
}

describe("우는 국사 — 요구패 중복 후로 차단", () => {
  it("후로가 없으면 종전대로 kokushi_pon이 제시된다 (기준선)", () => {
    const game = scene(false);
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("setup");
    const mine = status.prompts.find((p) => p.player === "p0");
    expect(mine?.options.some((o) => o.type === "kokushi_pon")).toBe(true);
  });

  it("이미 후로한 요구패가 섞인 조합은 후보에 뜨지 않는다", () => {
    const game = scene(true);
    const melded = new Set(
      (game.engine.state.round.byPlayer["p0"]?.melds ?? []).flatMap((m) =>
        m.tileIds.map((id) => kindKey(kindOf(game.engine.state, id))),
      ),
    );
    expect(melded.size).toBe(3); // 東南西를 이미 잡았다

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("setup");
    const mine = status.prompts.find((p) => p.player === "p0");
    const opts = (mine?.options ?? []).filter((o) => o.type === "kokushi_pon");
    // 北南西·北東南 등 전부 이미 잡은 kind를 포함하므로 하나도 남지 않는다
    expect(opts).toEqual([]);
  });

  it("제출 경로(validate)도 독립적으로 막는다", () => {
    const game = scene(true);
    const res = game.engine.submit({
      player: "p0",
      type: "kokushi_pon",
      payload: {
        tileIds: [
          idOfKind(game, { suit: "wind", rank: 2 }),
          idOfKind(game, { suit: "wind", rank: 3 }),
        ],
      },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("that orphan is already melded");
  });
});
