/**
 * 동수의 결속 — **커쯔만 무늬를 안 가리고, 머리(작두)는 무늬를 가린다** (2026-08-25 확정).
 *
 * 잠깐 `mixedTriplets`가 `mixedPairs`까지 함께 켜게 둔 적이 있다(혼색 샹퐁을 살리려던
 * 것). 사용자가 그 확장을 물렀다 — 머리는 표준대로 같은 무늬 2장이어야 한다. 그 제약은
 * 카드 `detail`에 명시돼 있다.
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
 * p0: 혼색 퐁 둘(2만2통2삭 · 3만3통3삭) + 손패 1만1통(혼색 쌍) · 5통5통(머리) · 9통9통9통.
 * 랭크 1이 **무늬를 안 가리고** 대기다. p1이 1만을 쳐서 p0가 론한다.
 */
function scene(): GameState {
  return craft({
    hands: {
      p0: "1m1p5p5p999p4s",
      p1: "1m999m111s123s456s",
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

describe("동수의 결속 — 커쯔는 혼색, 머리는 동일 무늬 (2026-08-25)", () => {
  it("발동 중이면 랭크 1이 무늬를 안 가리고 대기로 잡힌다", () => {
    const s = withAugments(scene(), "p0", ["mixed_triplet"]);
    const game = createStandardGameFromState(s);
    installAugment(game.engine, mixedTriplet, "p0", { yaku: game.yaku });
    armed(game);

    // 쯔모패 4s를 뺀 7장이 대기를 판정할 손패다
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

    // 혼색 쌍(1만1통)을 커쯔로 채우는 랭크 1은 **무늬를 가리지 않고** 전부 대기다
    expect(waits).toContain("man1");
    expect(waits).toContain("pin1");
    expect(waits).toContain("sou1");
    // ⚠ 5통은 대기가 아니다 — 그러려면 남은 1만1통이 **혼색 머리**가 되어야 한다.
    //   머리는 무늬를 가린다(2026-08-25 사용자 확정).
    expect(waits).not.toContain("pin5");
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
    expect(waits).not.toContain("sou1");
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

    // p1이 **자기 순으로 버릴 수 있게 될 때까지** 흘려보낸다.
    // (p0의 버림에 p1이 치·퐁 후보로 먼저 불릴 수 있어, «p1 프롬프트가 있다»만으로는
    //  아직 버릴 수 있는 순이 아니다.)
    const p1CanDiscard = (): boolean =>
      status.kind === "awaiting" &&
      (status.prompts
        .find((p) => p.player === "p1")
        ?.options.some((o) => o.type === "discard") ?? false);
    while (status.kind === "awaiting" && !p1CanDiscard()) {
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
    expect(win, "혼색 커쯔 론이 후보로 떠야 한다").toBeDefined();

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
