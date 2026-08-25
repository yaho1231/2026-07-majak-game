/**
 * 동수의 결속 — **혼색 샹퐁 대기**가 실제 판에서 텐파이·론까지 간다 (2026-08-25 사용자 보고).
 *
 * 증상: 몸통 둘을 울고 손패가 `7m7p7p 1p1s 5m5s`인데 1·5 샹퐁 대기가 텐파이로 안 잡히고,
 * 머리 단기대기만 인정됐다.
 *
 * 원인: `decompose.normalizeOptions`가 `mixedTriplets`로 **커쯔만** 열고 **머리(작두)는
 * 여전히 "완전히 같은 패 2장"** 을 요구했다. 샹퐁은 정의상 «두 쌍 중 하나가 커쯔, 다른
 * 하나가 머리»라, 머리가 혼색이면 화료형 자체가 만들어지지 않는다.
 * "커쯔는 안커여야 한다" 같은 전제는 어디에도 없었다 — 순수하게 분해 규칙의 구멍이었다.
 *
 * 이 파일은 코어 단위 테스트(`packages/core/test/MixedTripletTenpai.test.ts`)와 달리
 * **증강을 실제로 설치하고 FlowController로 론까지 굴려** 확인한다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  handKindsOf,
  installAugment,
  meldCountOf,
  scoringOptionsOf,
  winningKinds,
  kindKey,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { mixedTriplet } from "../src/augments/mixed_triplet.js";

function withAugments(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...p.augments, ...ids] } : p,
    ),
  };
}

/**
 * 사용자가 올린 그 판.
 * p0: 혼색 퐁 둘(2만2통2삭 · 3만3통3삭) + 손패 7m7p7p 1p1s 5m5s → 1·5 샹퐁.
 * p1이 1만을 쳐서 p0가 론한다.
 */
function scene(): GameState {
  return craft({
    hands: {
      p0: "7m7p7p1p1s5m5s9s",
      p1: "1m999m111p123s456s",
      p2: "*",
      p3: "*",
    },
    melds: {
      p0: [
        { kind: "pon", spec: "2m2p2s", from: "p1" },
        { kind: "pon", spec: "3m3p3s", from: "p2" },
      ],
    },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

/** 「이번 국 동수의 결속 발동 중」 상태를 만든다 (액션 대신 규칙 배선을 그대로 켠다) */
function armed(game: ReturnType<typeof createStandardGameFromState>): void {
  const r = game.engine.submit({
    player: "p0",
    type: "declare_mixed_triplet",
    payload: {},
  });
  expect(r.ok, `발동 실패: ${r.ok ? "" : r.reason}`).toBe(true);
}

describe("동수의 결속 — 혼색 샹퐁 대기 (2026-08-25)", () => {
  it("발동 중이면 1·5 샹퐁이 대기로 잡힌다 (머리 단기만 남지 않는다)", () => {
    const s = withAugments(scene(), "p0", ["mixed_triplet"]);
    const game = createStandardGameFromState(s);
    installAugment(game.engine, mixedTriplet, "p0", { yaku: game.yaku });
    armed(game);

    // 쯔모패 9s를 뺀 7장이 사용자가 올린 그 손패다 — 그 상태의 대기를 본다
    const drawn = game.engine.state.round.lastDrawnTile as TileId;
    const flow0 = new FlowController(game.engine);
    flow0.begin();
    flow0.submit("p0", { type: "discard", payload: { tileId: drawn } });
    const st = game.engine.state;
    const waits = winningKinds(
      handKindsOf(st, "p0"),
      meldCountOf(st, "p0"),
      undefined,
      scoringOptionsOf(st, game.engine.rules, "p0"),
    ).map(kindKey);

    // 커쯔 쪽을 완성하는 1·5가 **무늬를 가리지 않고** 전부 대기다
    expect(waits).toContain("man1");
    expect(waits).toContain("pin1");
    expect(waits).toContain("sou1");
    expect(waits).toContain("man5");
    expect(waits).toContain("pin5");
    expect(waits).toContain("sou5");
    // 머리 단기(7)만 남아 있던 것이 이 버그의 증상이었다
    expect(waits.length).toBeGreaterThan(1);
  });

  it("발동하지 않으면 그 대기는 서지 않는다 (회귀 가드)", () => {
    const s = withAugments(scene(), "p0", ["mixed_triplet"]);
    const game = createStandardGameFromState(s);
    installAugment(game.engine, mixedTriplet, "p0", { yaku: game.yaku });
    const flow0 = new FlowController(game.engine);
    flow0.begin();
    flow0.submit("p0", {
      type: "discard",
      payload: { tileId: game.engine.state.round.lastDrawnTile as TileId },
    });
    const st = game.engine.state;
    const waits = winningKinds(
      handKindsOf(st, "p0"),
      meldCountOf(st, "p0"),
      undefined,
      scoringOptionsOf(st, game.engine.rules, "p0"),
    ).map(kindKey);
    expect(waits).not.toContain("man1");
    expect(waits).not.toContain("man5");
  });

  it("상대의 1만을 실제로 론해서 화료까지 간다", () => {
    const s = withAugments(scene(), "p0", ["mixed_triplet"]);
    // ① p0 순에 발동 → ② 쯔모패를 버려 순을 넘긴다 → ③ p1이 1만을 친다
    const game = createStandardGameFromState(s);
    installAugment(game.engine, mixedTriplet, "p0", { yaku: game.yaku });
    armed(game);

    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    status = flow.submit("p0", {
      type: "discard",
      payload: { tileId: game.engine.state.round.lastDrawnTile as TileId },
    });

    // p1의 순 — 1만을 쳐서 p0에게 쏜다
    while (status.kind === "awaiting" && status.prompts.every((p) => p.player !== "p1")) {
      const pr = status.prompts[0];
      if (pr === undefined) throw new Error("no prompts");
      const pass = pr.options.find((o) => o.type === "pass");
      if (pass === undefined) throw new Error(`stuck at ${pr.player}`);
      status = flow.submit(pr.player, pass);
    }
    const oneMan = (game.engine.state.zones["hand:p1"]?.tileIds ?? []).find(
      (id) => kindKey(game.engine.state.tiles[id]!.kind) === "man1",
    ) as TileId;
    expect(oneMan).toBeDefined();
    status = flow.submit("p1", { type: "discard", payload: { tileId: oneMan } });
    if (status.kind !== "awaiting") throw new Error("expected reaction prompts");
    const win = status.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "win");
    expect(win, "혼색 샹퐁 론이 후보로 떠야 한다").toBeDefined();

    status = flow.submit("p0", win!);
    // 나머지 좌석의 반응을 흘려보내야 정산이 확정된다
    while (status.kind === "awaiting") {
      const pr = status.prompts[0];
      if (pr === undefined) break;
      const pass = pr.options.find((o) => o.type === "pass");
      if (pass === undefined) break;
      status = flow.submit(pr.player, pass);
    }
    const p0 = game.engine.state.players.find((p) => p.id === "p0")!;
    expect(p0.score).toBeGreaterThan(25000);
  });
});
