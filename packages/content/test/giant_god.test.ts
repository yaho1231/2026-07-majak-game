/**
 * 마작의 거신병 (giant_god) 동작 테스트.
 *
 * 핵심 계약:
 *  1. 내 바닥에 국사무쌍 13종이 다 깔리지 않으면 버튼이 켜지지 않는다.
 *  2. 13종이 전부 깔리면 액티브가 제시된다.
 *  3. 발동하면 그 13장이 손으로 올라오고 손패는 그대로 13장 — 국사 13면 대기가 된다.
 *  4. 게임당 1회 — 발동 후에는 다시 제시되지 않는다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { giantGod } from "../src/augments/giant_god.js";

const KOKUSHI_KEYS = new Set(
  [
    { suit: "man", rank: 1 },
    { suit: "man", rank: 9 },
    { suit: "pin", rank: 1 },
    { suit: "pin", rank: 9 },
    { suit: "sou", rank: 1 },
    { suit: "sou", rank: 9 },
    { suit: "wind", rank: 1 },
    { suit: "wind", rank: 2 },
    { suit: "wind", rank: 3 },
    { suit: "wind", rank: 4 },
    { suit: "dragon", rank: 1 },
    { suit: "dragon", rank: 2 },
    { suit: "dragon", rank: 3 },
  ].map(kindKey),
);

function withAugments(
  state: GameState,
  player: PlayerId,
  augments: string[],
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...augments] } : p,
    ),
  };
}

/**
 * p0: 배패 상태(손패 13장, 아직 안 뽑음)의 요구패 없는 손 +
 * 바닥에 국사 13종을 각 1장씩 깔아 둔다. discards로 국사 커버 여부를 바꾼다.
 */
function scene(pondSpec: string): GameState {
  const base = craft({
    hands: {
      p0: "234567m2345p234s", // 13장, 국사 요구패(1·9·자패) 없음
      p1: "*",
      p2: "*",
      p3: "*",
    },
    discards: { p0: pondSpec },
    phase: "turn.act",
    turnSeat: 0,
  });
  return withAugments(base, "p0", ["giant_god"]);
}

/** 국사 13종 전부 (z1~4=동남서북, z5~7=백발중) */
const FULL_POND = "19m19p19s1234z567z";

function startWithGiantGod(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, giantGod, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const prompt = status.prompts.find((p) => p.player === "p0");
  if (prompt === undefined) throw new Error("no prompt for p0");
  return { game, flow, prompt };
}

const godOptions = (prompt: { options: readonly { type: string }[] }) =>
  prompt.options.filter((o) => o.type === "giant_god");

describe("마작의 거신병 (giant_god)", () => {
  it("바닥에 국사 한 종류라도 빠지면 발동되지 않는다", () => {
    // 9m을 빼 12종만 깔린 바닥
    const { prompt } = startWithGiantGod(scene("1m19p19s1234z567z"));
    expect(godOptions(prompt)).toHaveLength(0);
  });

  it("국사 13종이 전부 깔리면 액티브가 제시된다", () => {
    const { prompt } = startWithGiantGod(scene(FULL_POND));
    expect(godOptions(prompt)).toHaveLength(1);
  });

  it("발동하면 국사 13장이 손으로 올라오고 손패는 13장 그대로다", () => {
    const { game, flow, prompt } = startWithGiantGod(scene(FULL_POND));
    const opt = godOptions(prompt)[0];
    expect(opt).toBeDefined();

    flow.submit("p0", opt as { type: string; payload: unknown });

    const state = game.engine.state;
    const hand = state.zones[handZone("p0")]?.tileIds ?? [];
    // 손패 장수 불변
    expect(hand).toHaveLength(13);
    // 손패가 국사 13종을 정확히 이룬다 (13면 대기)
    const handKeys = hand.map((id: TileId) => kindKey(kindOf(state, id)));
    expect(new Set(handKeys)).toEqual(KOKUSHI_KEYS);
    expect(handKeys).toHaveLength(13); // 중복 없음 = 순수 국사
  });

  it("게임당 1회 — 발동 후에는 다시 제시되지 않는다", () => {
    const { flow, prompt } = startWithGiantGod(scene(FULL_POND));
    const status = flow.submit("p0", godOptions(prompt)[0] as {
      type: string;
      payload: unknown;
    });
    // 스왑은 국을 끝내지 않으므로 같은 턴 프롬프트가 다시 열린다
    expect(status.kind).toBe("awaiting");
    if (status.kind !== "awaiting") return;
    const next = status.prompts.find((p) => p.player === "p0");
    expect(godOptions(next as { options: { type: string }[] })).toHaveLength(0);
  });

  it("소진 플래그가 서 있으면 제시되지 않는다", () => {
    const state = scene(FULL_POND);
    const used: GameState = {
      ...state,
      augmentData: { ...state.augmentData, "giant_god:uses:p0": 2 },
    };
    const { prompt } = startWithGiantGod(used);
    expect(godOptions(prompt)).toHaveLength(0);
  });
});
