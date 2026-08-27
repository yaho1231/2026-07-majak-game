/**
 * 무덤 도굴 (grave_rob) 동작 테스트.
 *
 * 핵심 계약 4가지:
 *  1. 상대 바닥 깊숙이 묻힌 과거의 패라도 화료가 성립하면 후보로 제시된다.
 *  2. 화료가 성립하지 않는 패는 후보에 없다 ('두 번째 날치기'가 아니다).
 *  3. 자기 바닥은 절대 도굴 불가 (후리텐 존중).
 *  4. 발동 = 그 자리에서 화료. 지불은 쯔모 취급으로 전원 분담이고, 게임당 1회 소진.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  createStandardGameFromState,
  discardsZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type {
  GameEvent,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { graveRob } from "../src/augments/grave_rob.js";
import { briefFog } from "../src/augments/brief_fog.js";

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
 * p0은 3만 단기 대기(13장) + 쯔모패 9통(불필요).
 * p1의 바닥 첫 장(가장 오래된 버림)이 3만 — 무덤 깊숙이 묻혀 있다.
 */
function scene(): GameState {
  const base = craft({
    hands: {
      p0: "123m456m789m123p3m9p", // 13장 + 쯔모패 9p → 3만은 이미 손에 하나
      p1: "*",
      p2: "*",
      p3: "*",
    },
    // p1 바닥 맨 앞에 3만을 묻어 둔다 (뒤이어 버려진 패들에 덮인 과거의 패)
    discards: { p0: "1z", p1: "3m2z3z4z", p2: "5z", p3: "6z" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return withAugments(base, "p0", ["grave_rob"]);
}

function startWithGraveRob(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, graveRob, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const prompt = status.prompts.find((p) => p.player === "p0");
  if (prompt === undefined) throw new Error("no prompt for p0");
  return { game, flow, prompt };
}

const robOptions = (prompt: { options: readonly { type: string; payload: unknown }[] }) =>
  prompt.options.filter((o) => o.type === "grave_rob");

/** 마지막 RoundSettled 페이로드 (정산 분배 확인용) */
function lastSettled(flow: FlowController): RoundSettledPayload {
  const log = (flow as unknown as { engine: { eventLog: GameEvent[] } }).engine.eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) return log[i]!.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

describe("무덤 도굴 (grave_rob)", () => {
  it("상대 바닥에 묻힌 과거의 화료패를 후보로 제시한다", () => {
    const state = scene();
    const { game, prompt } = startWithGraveRob(state);
    const opts = robOptions(prompt);
    expect(opts.length).toBeGreaterThan(0);

    // 제시된 패는 전부 p1의 바닥에 있는 3만이어야 한다
    for (const o of opts) {
      const p = o.payload as { graveId: TileId; fromPlayer: PlayerId };
      expect(p.fromPlayer).toBe("p1");
      expect(kindKey(kindOf(game.engine.state, p.graveId))).toBe(
        kindKey({ suit: "man", rank: 3 }),
      );
    }
  });

  it("화료가 성립하지 않는 패는 후보에 없다", () => {
    const state = scene();
    const { game, prompt } = startWithGraveRob(state);
    const offered = new Set(
      robOptions(prompt).map((o) => (o.payload as { graveId: TileId }).graveId),
    );
    // p1의 바닥에는 3만 외에 2z·3z·4z가 있다 — 전부 화료와 무관하므로 제시되면 안 된다
    const pond = game.engine.state.zones[discardsZone("p1")]?.tileIds ?? [];
    const junk = pond.filter(
      (id) => kindKey(kindOf(game.engine.state, id)) !== kindKey({ suit: "man", rank: 3 }),
    );
    expect(junk.length).toBeGreaterThan(0);
    for (const id of junk) expect(offered.has(id)).toBe(false);
  });

  it("최근 6장보다 깊이 묻힌 패는 파낼 수 없다 (2026-08-27 무덤 깊이 10 → 6)", () => {
    // p1 바닥 맨 앞의 3만 뒤로 상대 셋이 12장을 더 버린다 → 3만은 창(6장) 밖으로 밀려난다
    const base = craft({
      hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z", p1: "3m2z3z4z5z", p2: "1z2z3z4z", p3: "5z6z7z1z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const { game, prompt } = startWithGraveRob(withAugments(base, "p0", ["grave_rob"]));
    expect(robOptions(prompt)).toHaveLength(0);

    // 직접 제출해도 거부된다 (후보 목록과 validate가 같은 판정을 쓴다)
    const buried = (game.engine.state.zones[discardsZone("p1")]?.tileIds ?? [])[0] as TileId;
    const res = game.engine.submit({
      player: "p0",
      type: "grave_rob",
      payload: { graveId: buried, fromPlayer: "p1" },
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("that tile is buried too deep");
  });

  /**
   * 깊이 경계를 **정확히 6**에 못 박는다 (2026-08-27 밸런스: 10 → 6).
   * 상대 셋의 바닥을 시간 순(순번 → 자리 순)으로 늘어놓았을 때 뒤에서 6번째까지가 창이다.
   */
  it("창 경계는 정확히 6장이다 — 6번째면 파낼 수 있고 7번째면 못 판다", () => {
    const withTail = (p1: string, p2: string, p3: string): GameState =>
      withAugments(
        craft({
          hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
          discards: { p0: "1z", p1, p2, p3 },
          phase: "turn.act",
          turnSeat: 0,
          drawnLastFor: "p0",
        }),
        "p0",
        ["grave_rob"],
      );

    // 상대 바닥 합계 6장, 3만이 그중 가장 오래된 한 장 → 아슬아슬하게 창 안
    const inWindow = startWithGraveRob(withTail("3m2z3z", "5z6z", "7z"));
    expect(robOptions(inWindow.prompt).length).toBeGreaterThan(0);

    // 한 장만 더 쌓이면(합계 7장) 3만이 창 밖으로 밀려난다
    const outOfWindow = startWithGraveRob(withTail("3m2z3z", "5z6z", "7z1z"));
    expect(robOptions(outOfWindow.prompt)).toHaveLength(0);
  });

  it("자기 바닥은 도굴 대상이 아니다 (후리텐 존중)", () => {
    // p0의 바닥에도 3만을 놓아 둔다 — 그래도 자기 것은 제시되지 않아야 한다
    const base = craft({
      hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "3m", p1: "3m2z", p2: "5z", p3: "6z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const { game, prompt } = startWithGraveRob(withAugments(base, "p0", ["grave_rob"]));
    const ownPond = new Set(game.engine.state.zones[discardsZone("p0")]?.tileIds ?? []);
    for (const o of robOptions(prompt)) {
      const p = o.payload as { graveId: TileId; fromPlayer: PlayerId };
      expect(p.fromPlayer).not.toBe("p0");
      expect(ownPond.has(p.graveId)).toBe(false);
    }
  });

  it("도굴 직후 같은 턴에 쯔모 옵션이 열린다 (막힌 상태가 없다)", () => {
    const state = scene();
    const { game, flow, prompt } = startWithGraveRob(state);
    const opt = robOptions(prompt)[0];
    expect(opt).toBeDefined();

    const status = flow.submit("p0", opt as { type: string; payload: unknown });
    // 도굴은 버림을 소비하지 않으므로 같은 턴 프롬프트가 다시 열린다
    expect(status.kind).toBe("awaiting");
    if (status.kind !== "awaiting") return;
    const next = status.prompts.find((p) => p.player === "p0");
    expect(next?.options.some((o) => o.type === "win")).toBe(true);
    // 파낸 패가 새 쯔모패가 됐다
    const robbed = (opt as { payload: { graveId: TileId } }).payload.graveId;
    expect(game.engine.state.round.lastDrawnTile).toBe(robbed);
    // 게임당 1회 — 같은 국에서 두 번 제시되지 않는다
    expect(robOptions(next as { options: { type: string; payload: unknown }[] })).toHaveLength(0);
  });

  it("이어서 화료하면 지불은 쯔모처럼 전원이 분담한다", () => {
    const state = scene();
    const { flow, prompt } = startWithGraveRob(state);
    flow.submit("p0", robOptions(prompt)[0] as { type: string; payload: unknown });
    const status = flow.submit("p0", { type: "win", payload: {} });

    expect(status.kind).toBe("roundOver");
    if (status.kind !== "roundOver") return;
    expect(status.outcome).toBe("win");

    // 쯔모 취급 — 화료자만 이득, 나머지 셋이 모두 지불(방총자 단독 지불이 아니다)
    const settled = lastSettled(flow);
    expect(settled.deltas["p0"] ?? 0).toBeGreaterThan(0);
    for (const pid of ["p1", "p2", "p3"] as PlayerId[]) {
      expect(settled.deltas[pid] ?? 0).toBeLessThan(0);
    }
    const info = settled.winInfos?.[0];
    expect(info?.winType).toBe("tsumo");
    expect(info?.from).toBeNull();
  });

  it("게임당 1회 — 소진 후에는 제시되지 않는다", () => {
    const state = scene();
    const used: GameState = {
      ...state,
      augmentData: { ...state.augmentData, "grave_rob:uses:p0": 2 },
    };
    const { prompt } = startWithGraveRob(used);
    expect(robOptions(prompt)).toHaveLength(0);
  });
});

describe("안개를 친 본인도 안개 속 바닥은 파낼 수 없다", () => {
  /**
   * QA 2차 aug-2 의심 6. 후보 판정이 «보유자에게 보이는 바닥»이었다. 박무·숨은 강은
   * `visibility.discards`를 **비보유자에게만** 내리므로, 안개를 친 본인이 도굴을 함께
   * 들면 남에게는 가려진 바닥을 **자기만 보고** 파낼 수 있었다 — 게다가 파낸 패는
   * 전원 공개 채널로 나가므로 자기가 감춰 둔 정보를 자기 손으로 흘리면서 규칙까지
   * 우회한다. detail은 "안개로 가려진 바닥의 패도 파낼 수 없다"고 못 박고 있다.
   *
   * 대조군(안개 없음)이 같은 장면에서 후보를 내는 것까지 함께 검사한다 — 그래야
   * 「후보가 없다」가 안개 때문인지 장면이 애초에 안 되는 것인지 갈린다.
   */
  it("박무 + 도굴을 함께 든 좌석에게 후보가 뜨지 않는다", () => {
    const base = scene();
    const control = startWithGraveRob(base);
    expect(robOptions(control.prompt).length).toBeGreaterThan(0);

    const fogged = withAugments(base, "p0", ["grave_rob", "brief_fog"]);
    const game = createStandardGameFromState(fogged);
    installAugment(game.engine, graveRob, "p0", { yaku: game.yaku });
    installAugment(game.engine, briefFog, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const fogOption = status.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "declare_brief_fog");
    expect(fogOption, "박무 선언 후보가 있어야 장면이 성립한다").toBeDefined();
    // 안개를 친다 — 이제 남의 바닥은 나만 보인다.
    status = flow.submit("p0", fogOption!);
    if (status.kind !== "awaiting") throw new Error("expected awaiting after fog");
    const prompt = status.prompts.find((p) => p.player === "p0");
    expect(prompt).toBeDefined();
    expect(robOptions(prompt!).length).toBe(0);
  });
});
