/**
 * 마작의 거신병 (giant_god) 동작 테스트.
 *
 * 핵심 계약:
 *  1. 내 바닥에 국사무쌍 13종이 다 깔리지 않으면 버튼이 켜지지 않는다.
 *  2. 13종이 전부 깔리면 액티브가 제시된다.
 *  3. 발동하면 그 13장이 손으로 올라오고 손패는 그대로 13장 — 국사 13면 대기가 된다.
 *  4. **국당 1회** — 발동은 턴을 넘기지 않으므로 카운터가 유일한 리미트다.
 *  5. 발동 다음 순의 정상 쯔모가 오름패로 와서 화료가 보장된다.
 *  6. **쯔모패는 내보내지 않는다** — 14장에서 발동해도 화료 경로가 산다.
 *  7. **13면 대기 전체의 후리텐이 풀린다** — 같은 요구패를 두 번 버렸어도.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  isFuriten,
  kindKey,
  kindOf,
  scoringOptionsOf,
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

/** "다음 쯔모를 오름패로" 예약 키 (국 스코프) */
const tsumoKeyOf = (st: GameState): string =>
  `giant_god:tsumo:${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}:p0#round`;

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

  it("발동 뒤에는 버튼이 꺼진다 (바닥에 13종이 남지 않는다)", () => {
    const { flow, prompt } = startWithGiantGod(scene(FULL_POND));
    const status = flow.submit("p0", godOptions(prompt)[0] as {
      type: string;
      payload: unknown;
    });
    // 스왑은 국을 끝내지 않으므로 같은 턴 프롬프트가 다시 열린다
    expect(status.kind).toBe("awaiting");
    if (status.kind !== "awaiting") return;
    const next = status.prompts.find((p) => p.player === "p0");
    // 요구패 13장이 손으로 올라갔으니 바닥에는 더 이상 13종이 없다 → 버튼이 꺼진다
    expect(godOptions(next as { options: { type: string }[] })).toHaveLength(0);
  });

  /**
   * 회귀 (hand-b 확정 3): 예전에는 "발동하면 조건이 스스로 무너진다"를 리미트로 삼았는데,
   * 손패가 순국사면 내려간 13장이 바닥을 다시 덮어 **같은 순에 무한히 다시 눌렸다**.
   * 이제는 국당 1회 카운터가 막는다.
   */
  it("국당 1회 — 손패가 순국사라 조건이 유지돼도 두 번 발동되지 않는다", () => {
    const base = craft({
      hands: { p0: "19m19p19s1234567z", p1: "*", p2: "*", p3: "*" }, // 순국사 13장
      discards: { p0: FULL_POND },
      phase: "turn.act",
      turnSeat: 0,
    });
    const { game, flow, prompt } = startWithGiantGod(withAugments(base, "p0", ["giant_god"]));
    expect(godOptions(prompt)).toHaveLength(1);

    const status = flow.submit("p0", godOptions(prompt)[0] as {
      type: string;
      payload: unknown;
    });
    // 바닥은 다시 국사 13종을 덮고 있다 — 조건은 살아 있다
    const st = game.engine.state;
    const pondKeys = new Set(
      (st.zones[discardsZone("p0")]?.tileIds ?? []).map((id: TileId) =>
        kindKey(kindOf(st, id)),
      ),
    );
    expect(pondKeys).toEqual(KOKUSHI_KEYS);
    // 그래도 버튼은 꺼져 있다 (국당 1회 소진)
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const next = status.prompts.find((p) => p.player === "p0");
    expect(godOptions(next as { options: { type: string }[] })).toHaveLength(0);
    // 직접 요청해도 반려된다
    const again = game.engine.submit({ player: "p0", type: "giant_god", payload: {} });
    expect(again.ok).toBe(false);
  });

  it("발동하면 '다음 쯔모를 오름패로' 예약이 선다", () => {
    const { game, flow, prompt } = startWithGiantGod(scene(FULL_POND));
    flow.submit("p0", godOptions(prompt)[0] as { type: string; payload: unknown });
    expect(game.engine.state.augmentData[tsumoKeyOf(game.engine.state)]).toBe(true);
  });

  it("다음 정상 쯔모가 오름패로 와서 국사무쌍 화료가 선다", () => {
    // p0는 이미 국사 13면 대기(순수 요구패 13장). 예약만 세워 두고 p3의 버림 뒤
    // 자연 쯔모까지 몬다 — 뽑히는 실물 패가 무엇이든 오름패로 물질화되어야 한다.
    const base = craft({
      hands: { p0: "19m19p19s1234567z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 3,
      drawnLastFor: "p3",
    });
    const primed: GameState = {
      ...withAugments(base, "p0", ["giant_god"]),
      augmentData: { [tsumoKeyOf(base)]: true },
    };
    const game = createStandardGameFromState(primed);
    installAugment(game.engine, giantGod, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");

    // p3가 쯔모패를 버리고, 리액션은 전부 패스 → 턴이 p0에게 넘어가 자연 쯔모
    const p3drawn = game.engine.state.round.lastDrawnTile as TileId;
    status = flow.submit("p3", { type: "discard", payload: { tileId: p3drawn } });
    for (let i = 0; i < 8 && status.kind === "awaiting"; i++) {
      const pr = status.prompts[0];
      if (pr === undefined) break;
      if (!pr.options.some((o) => o.type === "pass")) break; // p0의 턴 프롬프트 도달
      status = flow.submit(pr.player, { type: "pass", payload: {} });
    }

    const st = game.engine.state;
    expect(st.round.turnSeat).toBe(0);
    const drawn = st.round.lastDrawnTile as TileId;
    // 뽑은 패가 요구패(국사 13종 중 하나)로 물질화됐다
    expect(KOKUSHI_KEYS.has(kindKey(kindOf(st, drawn)))).toBe(true);
    // 예약은 한 번으로 소비된다
    expect(st.augmentData[tsumoKeyOf(st)]).toBeNull();
    // 그 손으로 실제 화료(쯔모)가 성립한다
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const mine = status.prompts.find((p) => p.player === "p0");
    expect(mine?.options.some((o) => o.type === "win")).toBe(true);
  });

  /**
   * 회귀 (hand-b 확정 2): 예전 `handIdsOf(...).slice(0, 13)`은 "배열 앞 13장"이라
   * 쯔모패가 배열 끝이 아니면(개벽처럼 손패를 재배열하는 증강 뒤) 쯔모패를 바닥으로
   * 내던졌다. `lastDrawnTile`이 손 밖을 가리키면 채점 손패가 15장이 되어
   * **완성된 국사무쌍인데 화료가 제시되지 않았다.**
   */
  it("쯔모패가 배열 중간이어도 내보내지 않는다 — 완성형이면 그 자리에서 화료가 뜬다", () => {
    const base = craft({
      // 14장. 첫 장(dragon3)을 쯔모패로 세워 "배열 끝이 아닌" 배치를 만든다.
      hands: { p0: "7z234567m2345p234s", p1: "*", p2: "*", p3: "*" },
      discards: { p0: FULL_POND },
      phase: "turn.act",
      turnSeat: 0,
    });
    const drawnId = (base.zones[handZone("p0")]?.tileIds ?? [])[0] as TileId;
    const state: GameState = {
      ...withAugments(base, "p0", ["giant_god"]),
      round: { ...base.round, lastDrawnTile: drawnId },
    };
    const { game, flow, prompt } = startWithGiantGod(state);
    const status = flow.submit("p0", godOptions(prompt)[0] as {
      type: string;
      payload: unknown;
    });

    const st = game.engine.state;
    const hand = st.zones[handZone("p0")]?.tileIds ?? [];
    const pond = st.zones[discardsZone("p0")]?.tileIds ?? [];
    // 쯔모패는 손에 그대로, 바닥에는 없다
    expect(st.round.lastDrawnTile).toBe(drawnId);
    expect(hand).toContain(drawnId);
    expect(pond).not.toContain(drawnId);
    expect(hand).toHaveLength(14);
    expect(pond).toHaveLength(13);
    // 손패 = 국사 13종 + 쯔모한 요구패 1장 = 국사무쌍 13면 완성형 → 화료가 제시된다
    expect(new Set(hand.map((id: TileId) => kindKey(kindOf(st, id))))).toEqual(
      KOKUSHI_KEYS,
    );
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const mine = status.prompts.find((p) => p.player === "p0");
    expect(mine?.options.some((o) => o.type === "win")).toBe(true);
  });

  /**
   * 회귀 (text 확정 33): 예전에는 되가져온 종류를 버림 이력에서 **한 장씩만** 뺐다.
   * 같은 요구패를 두 번 흘렸으면 두 번째 기록이 남아 **13면 대기 전체가 후리텐**이 되어
   * detail이 약속한 "론으로 먼저 끝낼 수도 있다"가 통째로 거짓이 됐다.
   */
  it.each([
    ["요구패를 한 장씩만 버렸다", "19m19p19s1234z567z"],
    ["1m을 두 번 버렸다", "119m19p19s1234z567z"],
    ["요구패 여럿을 두 번씩 버렸다", "1199m19p119s11234z567z"],
  ])("후리텐이 13면 전체에서 풀린다 (%s)", (_label, pond) => {
    const base = craft({
      // 손패는 전부 수패(요구패 없음) 14장 — 내보내도 이력에 요구패가 안 들어간다
      hands: { p0: "234567m234567p22s", p1: "*", p2: "*", p3: "*" },
      discards: { p0: pond },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const { game, flow, prompt } = startWithGiantGod(withAugments(base, "p0", ["giant_god"]));
    flow.submit("p0", godOptions(prompt)[0] as { type: string; payload: unknown });

    // 발동 뒤 손패 14장 = 국사 13장 + 남은 쯔모패. 그 한 장을 버려 13면 대기를 세운다.
    const mid = game.engine.state;
    const leftover = (mid.zones[handZone("p0")]?.tileIds ?? []).find(
      (id: TileId) => !KOKUSHI_KEYS.has(kindKey(kindOf(mid, id))),
    ) as TileId;
    flow.submit("p0", { type: "discard", payload: { tileId: leftover } });

    const st = game.engine.state;
    const history = st.round.byPlayer.p0?.discardedKinds ?? [];
    // 요구패는 이력에서 통째로 사라졌다 (중복까지)
    expect(history.filter((k: string) => KOKUSHI_KEYS.has(k))).toEqual([]);
    expect(
      isFuriten(st, "p0", scoringOptionsOf(st, game.engine.rules, "p0"), game.engine.rules),
    ).toBe(false);
  });
});
