/**
 * QA 2차 aug-3 확정건의 회귀 그물 (2026-08-22).
 *
 * 세 건 모두 「카드 문구가 약속한 것 ↔ 코드가 실제로 하는 것」의 어긋남이었다.
 *
 * ① **격(rank_gate)에 잠긴 론에도 후리텐이 찍혔다.** 코어는 "규칙이 론을 막았으면
 *    후리텐을 찍지 않는다"는 원칙을 이미 갖고 있는데(`win.ronImmune` 예외) 최소 판
 *    쪽에는 없었다. 그래서 격은 카드에 적힌 "5판 이상이 아니면 화료할 수 없다"에
 *    더해, **손을 키워 5판을 넘긴 뒤에도 그 대기로는 영영 론할 수 없게 만드는**
 *    두 번째 벌을 몰래 얹고 있었다.
 *
 * ② **불가침 조약이 파혼으로 되살아났다.** 리치 파기는 이력으로 판정해 되돌릴 수
 *    없게 막아 뒀는데(`declaredKey`) 멘쯔 파기만 현재 상태에서 파생해서, 멘쯔가
 *    사라지면 조약이 부활했다.
 *
 * ③ **선언 간파의 위조가 세상에 없는 5번째 장을 만들었다.** 형제 증강 `off_by_one`이
 *    같은 함정을 이미 막아 뒀는데 이쪽에는 그 검사가 없었다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
  kindKey,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { rankGate } from "../src/augments/rank_gate.js";
import { copiesLeftUndrawn } from "../src/util.js";
import { h } from "./helpers.js";

/**
 * p0가 국 첫 순에 4삭을 들고 있고, **p2**는 그 4삭이 오름패인 싼 손(탕야오 1판)이다.
 * p0가 지목해 두면 p2의 론은 최소 판에 막힌다 — 막힌 론에 후리텐이 찍히는지가 이 장면의 전부다.
 *
 * ⚠ 기다리는 쪽을 p1이 아니라 **p2**로 둔 이유: 일시 후리텐은 자기 순이 오면 풀린다.
 * p0의 바로 다음이 p1이라 p1로 두면 리액션이 닫히자마자 그 순이 와서, 찍혔는지
 * 안 찍혔는지를 구분할 수 없다(대조군이 늘 false가 된다).
 */
function markScene(): GameState {
  const base = craft({
    hands: {
      p0: "234m235m567p678p44s", // 14장 · 화료형 아님 · 4s 두 장
      p1: "*",
      p2: "234m345p678s22s56s", // 13장 · 4s/7s 대기 · 전부 중장패(탕야오)
      p3: "*",
    },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["rank_gate"] } : p,
    ),
    round: { ...base.round, firstTurn: true, goAroundBroken: false },
  };
}

/** p0의 손패에서 그 종류의 첫 타일 id */
function idInHand(state: GameState, player: PlayerId, spec: string): TileId {
  const want = kindKey(h(spec)[0]!);
  for (const id of state.zones[`hand:${player}`]?.tileIds ?? []) {
    const k = state.tiles[id]?.kind;
    if (k !== undefined && kindKey(k) === want) return id;
  }
  throw new Error(`${player} has no ${spec}`);
}

/**
 * 리액션 창이 열려 있으면 전원 «넘김»으로 닫는다 — 후리텐 마킹은 그 창이 닫힐 때
 * 돈다(`markPassFuriten`). 창이 안 열렸으면(제시된 것이 없으면) 아무것도 하지 않는다.
 */
function passReactions(
  flow: FlowController,
  status: { kind: string; prompts?: { player: PlayerId; options: { type: string }[] }[] },
): void {
  let cur = status;
  for (let i = 0; i < 8 && cur.kind === "awaiting"; i++) {
    const next = (cur.prompts ?? []).find((pr) => pr.options.some((o) => o.type === "pass"));
    if (next === undefined) break;
    cur = flow.submit(next.player, { type: "pass", payload: {} }) as typeof cur;
  }
}

/** 일시·영구를 가리지 않고 「지금 이 사람에게 후리텐이 찍혀 있는가」 */
function furitenOf(state: GameState, player: PlayerId): boolean {
  const rs = state.round.byPlayer[player];
  return rs?.furiten === true || rs?.temporaryFuriten === true || rs?.riichiFuriten === true;
}

describe("격에 잠긴 론에는 후리텐이 찍히지 않는다", () => {
  it("지목당한 사람의 오름패가 지나가도 후리텐이 아니다", () => {
    const game = createStandardGameFromState(markScene());
    installAugment(game.engine, rankGate, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    });
    const flow = new FlowController(game.engine);
    flow.begin();

    expect(
      flow.submit("p0", { type: "rank_gate_mark", payload: { target: "p2" as PlayerId } }).kind,
    ).toBe("awaiting");

    const tileId = idInHand(game.engine.state, "p0", "4s");
    passReactions(flow, flow.submit("p0", { type: "discard", payload: { tileId } }));
    // 잠긴 론은 넘긴 화료가 아니다 — 손을 키워 5판을 넘겼을 때 그 대기가 살아 있어야 한다.
    expect(furitenOf(game.engine.state, "p2")).toBe(false);
  });

  it("대조군 — 지목이 없으면 같은 장면에서 후리텐이 찍힌다 (과잉 억제가 아니다)", () => {
    const game = createStandardGameFromState(markScene());
    installAugment(game.engine, rankGate, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    });
    const flow = new FlowController(game.engine);
    flow.begin();

    // 지목하지 않고 그냥 버린다 — 이번에는 p2가 진짜로 화료를 넘긴 것이다.
    const tileId = idInHand(game.engine.state, "p0", "4s");
    passReactions(flow, flow.submit("p0", { type: "discard", payload: { tileId } }));
    expect(furitenOf(game.engine.state, "p2")).toBe(true);
  });
});

describe("copiesLeftUndrawn — 없는 5번째 장을 막는 공용 자", () => {
  it("손·바닥·후로로 다 나온 종류는 0을 돌려준다", () => {
    // 1z 네 장을 전부 손과 바닥에 꺼내 둔다 → 패산·왕패에는 한 장도 없다.
    const state = craft({
      hands: { p0: "123m456m789m123p1z", p1: "*", p2: "*", p3: "*" },
      discards: { p1: "1z", p2: "1z", p3: "1z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    expect(copiesLeftUndrawn(state, h("1z")[0]!)).toBe(0);
    // 아직 한 장도 안 나온 종류는 네 장 그대로 남아 있다.
    expect(copiesLeftUndrawn(state, h("5z")[0]!)).toBe(4);
  });
});

describe("불가침 조약 — 멘쯔가 사라져도 부활하지 않는다", () => {
  /**
   * 파혼(meld_dissolve)이나 좌석 바꿈처럼 **후로 존을 비우는** 길이 여럿이라,
   * 여기서는 그 결과 상태를 그대로 만든다: 「이 국에 멘쯔가 있었다」는 이력이 남아
   * 있고 지금은 멘쯔가 0인 상태. 조약은 그래도 죽어 있어야 한다.
   */
  it("멘쯔 이력이 남아 있으면 지금 멘쯔가 0이어도 론 면역이 아니다", async () => {
    const { noRonPact } = await import("../src/augments/no_ron_pact.js");
    const { roundScopedKey } = await import("../src/augments/roundScope.js");

    const base = craft({
      hands: { p0: "234m345p678s22s56s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["no_ron_pact"] } : p,
      ),
      augmentData: {
        ...base.augmentData,
        // 「이 국에 멘쯔가 있었다」 — 파혼으로 지금은 0장이 된 상태
        [roundScopedKey("no_ron_pact", "melded", base, "p0")]: true,
      },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, noRonPact, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    });
    expect(game.engine.state.round.byPlayer.p0?.melds.length ?? 0).toBe(0);
    expect(
      game.engine.rules.resolve<boolean>("win.ronImmune", {
        playerId: "p0" as PlayerId,
        state: game.engine.state,
      }),
    ).toBe(false);
  });

  it("이력이 없고 멘쯔도 없는 첫 순에는 조약이 살아 있다 (대조군)", async () => {
    const { noRonPact } = await import("../src/augments/no_ron_pact.js");
    const base = craft({
      hands: { p0: "234m345p678s22s56s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["no_ron_pact"] } : p,
      ),
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, noRonPact, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    });
    expect(
      game.engine.rules.resolve<boolean>("win.ronImmune", {
        playerId: "p0" as PlayerId,
        state: game.engine.state,
      }),
    ).toBe(true);
  });
});
