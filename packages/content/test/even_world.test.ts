/**
 * 짝수의 세계 (even_world) 테스트.
 * (1) 자기 턴 버튼으로 발동하면 손패의 홀수 수패가 전부 한 칸 위 짝수로 바뀐다(1→2 … 7→8, 9→8).
 * (2) 자패·이미 짝수인 수패는 그대로, 새로 만든 패는 conjured 표시.
 * (3) 게임당 1회(usedKey) — 두 번째 발동은 제시되지도, 통과되지도 않는다.
 * (4) 손패 장수 불변 — 제자리 종류 변경이라 늘지도 줄지도 않는다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  isHonor,
  isNumberSuit,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { evenWorld } from "../src/augments/even_world.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 크래프트 상태에 보유 증강을 직접 주입한다 (드래프트 이벤트 생략) */
function withAugment(state: GameState, pid: PlayerId, augId: string): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === pid ? { ...p, augments: [...p.augments, augId] } : p,
    ),
  };
}

function evenValidate(game: Game, player: PlayerId): string | null {
  const def = game.engine.actions.get("even_world_flip");
  if (def === undefined) throw new Error("no even_world_flip action");
  return def.validate(
    { player, type: "even_world_flip", payload: {} },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

/**
 * 홀수 수패(만5)·짝수 수패(통4)·자패(2)가 섞인 14장 손패로 자기 턴을 만든다.
 * 변환의 결정성을 위해 **도라 표시패를 비우고 손패의 적도라(빨간 5)를 해제**한다 —
 * 도라·적도라 제외는 별도 테스트에서 검증한다.
 */
function craftHand(): GameState {
  const base = craft({
    // 13579m(홀 만5) 2468p(짝 통4) 9s(홀 삭1) 11z(동풍2) 55z(백2)  = 14장
    hands: { p0: "13579m2468p9s11z55z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
    seed: 7,
  });
  // 도라 표시패 제거 + 손패 적도라 해제 → 홀수 수패가 예외 없이 전부 변환되도록
  const tiles = { ...base.tiles };
  for (const id of handIdsOf(base, "p0")) {
    const t = tiles[id];
    if (t?.attrs.red === true) tiles[id] = { ...t, attrs: { ...t.attrs, red: false } };
  }
  const scened: GameState = {
    ...base,
    tiles,
    round: { ...base.round, doraIndicators: [] },
  };
  return withAugment(scened, "p0", "even_world");
}

describe("even_world (짝수의 세계)", () => {
  it("홀수 수패가 전부 한 칸 위 짝수로 바뀐다 (9→8), 자패·짝수는 그대로, conjured 표시", () => {
    const game = createStandardGameFromState(craftHand());
    installAugment(game.engine, evenWorld, "p0", { yaku: game.yaku });

    const before = game.engine.state;
    const sizeBefore = handIdsOf(before, "p0").length;
    // 발동 전 자패 종류 스냅샷 (불변 검증용)
    const honorsBefore = handIdsOf(before, "p0")
      .map((id) => kindOf(before, id))
      .filter((k) => isHonor(k))
      .map((k) => `${k.suit}${k.rank}`)
      .sort();

    const res = game.engine.submit({ player: "p0", type: "even_world_flip", payload: {} });
    expect(res.ok).toBe(true);

    const state = game.engine.state;
    const hand = handIdsOf(state, "p0");

    // (d) 손패 장수 불변
    expect(hand.length).toBe(sizeBefore);

    // (a) 모든 수패가 짝수 — 홀수 수패가 하나도 남지 않는다
    for (const id of hand) {
      const kind = kindOf(state, id);
      if (isNumberSuit(kind)) {
        expect(kind.rank % 2).toBe(0);
      }
    }

    // (a) 만수는 전부 짝수로: 1→2,3→4,5→6,7→8,9→8 → 정렬 시 [2,4,6,8,8]
    const manRanks = hand
      .map((id) => kindOf(state, id))
      .filter((k) => k.suit === "man")
      .map((k) => k.rank)
      .sort((x, y) => x - y);
    expect(manRanks).toEqual([2, 4, 6, 8, 8]);

    // (a) 9→8 예외: 유일한 홀수 삭수 9s가 8s로 내려왔다
    const souRanks = hand
      .map((id) => kindOf(state, id))
      .filter((k) => k.suit === "sou")
      .map((k) => k.rank);
    expect(souRanks).toEqual([8]);

    // 이미 짝수인 통수는 그대로 2,4,6,8
    const pinRanks = hand
      .map((id) => kindOf(state, id))
      .filter((k) => k.suit === "pin")
      .map((k) => k.rank)
      .sort((x, y) => x - y);
    expect(pinRanks).toEqual([2, 4, 6, 8]);

    // (b) 자패는 불변
    const honorsAfter = hand
      .map((id) => kindOf(state, id))
      .filter((k) => isHonor(k))
      .map((k) => `${k.suit}${k.rank}`)
      .sort();
    expect(honorsAfter).toEqual(honorsBefore);

    // 새로 만든 홀→짝 패는 conjured, 원래 짝수·자패는 표시 없음
    for (const id of hand) {
      const kind = kindOf(state, id);
      const conjured = state.tiles[id]?.attrs.conjured === true;
      if ((kind.suit === "man") || (kind.suit === "sou")) {
        // 이 손패의 만·삭은 전부 홀수였다가 바뀐 것
        expect(conjured).toBe(true);
      } else {
        expect(conjured).toBe(false);
      }
    }

    // 발동됐음을 전원 공개, 사용 카운터 +1
    expect(state.augmentData["view:*:even_world:p0#round"]).toBe(true);
    expect(state.augmentData["even_world:uses:p0"]).toBe(1);
  });

  it("동풍전 1회 — 두 번째 발동은 버튼으로 제시되지 않고 validate도 거부한다", () => {
    // 동풍전(tonpuu)이면 사용 횟수가 1회 → 두 번째는 거부
    const base = craftHand();
    const tonpuu: GameState = { ...base, config: { ...base.config, mode: "tonpuu" } };
    const game = createStandardGameFromState(tonpuu);
    installAugment(game.engine, evenWorld, "p0", { yaku: game.yaku });

    // 처음엔 발동 가능
    expect(evenValidate(game, "p0")).toBeNull();

    // 자기 턴 프롬프트에 버튼이 뜬다
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0")!;
    const option = prompt.options.find((o) => o.type === "even_world_flip");
    expect(option).toBeDefined();

    flow.submit("p0", option as { type: string; payload: unknown });

    // 동풍전 1회 — 두 번째는 거부
    expect(evenValidate(game, "p0")).toBe("no uses left this game");
  });

  it("바꿀 홀수 수패가 없으면(짝수·자패뿐) 발동할 수 없다", () => {
    const base = craft({
      // 2468m 2468p 224466z = 14장, 홀수 수패 없음 (자패는 동남서북/삼원 아무거나)
      hands: { p0: "2468m2468p224466z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      seed: 7,
    });
    const game = createStandardGameFromState(withAugment(base, "p0", "even_world"));
    installAugment(game.engine, evenWorld, "p0", { yaku: game.yaku });
    expect(evenValidate(game, "p0")).toBe("no odd suited tiles to change");
  });
});
