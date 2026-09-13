/**
 * 천리안 (tenpai_scan) 동작 테스트.
 *
 * 핵심 계약:
 *  1. 자기 턴에 선언할 수 있고(매 국 1회), 선언하면 텐파이인 상대 목록이
 *     보유자 전용 채널(view:{holder}:tenpai_scan)에 `{ players, turn }`으로만 실린다.
 *  2. 텐파이인 상대(p1)는 목록에 들고, 노텐인 상대(p2)는 들지 않는다.
 *  3. 매 국 1회 — 같은 국에 두 번은 못 쓰고, 국이 바뀌면 다시 열린다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { tenpaiScan } from "../src/augments/tenpai_scan.js";

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
 * p0(천리안 보유)의 턴. p1은 1p 단기 텐파이, p2는 완전 노텐(고립패 뭉치).
 */
function scene(): GameState {
  const base = craft({
    hands: {
      p0: "123456789m123p1s",
      p1: "123m456m789m123p1p", // 1p 단기 텐파이(멘젠)
      p2: "147m147p147s1234z", // 고립패뿐 — 확실한 노텐
      p3: "*",
    },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return withAugments(base, "p0", ["tenpai_scan"]);
}

function startFlow(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, tenpaiScan, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return { game, flow, status };
}

const VIEW_KEY = "view:p0:tenpai_scan#round";

describe("천리안 (tenpai_scan)", () => {
  it("자기 턴에 선언 후보가 제시된다", () => {
    const { status } = startFlow(scene());
    const prompt = status.prompts.find((p) => p.player === "p0");
    const scans =
      prompt?.options.filter((o) => o.type === "tenpai_scan_use") ?? [];
    expect(scans.length).toBe(1);
  });

  it("선언하면 텐파이 상대만 보유자 전용 채널에 실린다", () => {
    const { game, flow } = startFlow(scene());
    flow.submit("p0", { type: "tenpai_scan_use", payload: {} });

    const result = game.engine.state.augmentData[VIEW_KEY] as {
      players: PlayerId[];
      turn: number;
    };
    expect(Array.isArray(result.players)).toBe(true);
    const ids = result.players;
    expect(ids).toContain("p1"); // 텐파이
    expect(ids).not.toContain("p2"); // 노텐
    expect(ids).not.toContain("p0"); // 자기 자신은 제외
  });

  it("스캔한 순(turnCount)을 함께 실어 화면이 'N순 기준'을 밝힐 수 있다", () => {
    // 이 결과는 갱신되지 않는 스냅샷이라 국이 끝날 때까지 그대로 떠 있다 —
    // 몇 순 기준인지 없으면 시간이 지날수록 조용히 틀린 정보가 된다.
    const base = scene();
    const atTurn7: GameState = {
      ...base,
      round: { ...base.round, turnCount: 7 },
    };
    const { game, flow } = startFlow(atTurn7);
    flow.submit("p0", { type: "tenpai_scan_use", payload: {} });
    const result = game.engine.state.augmentData[VIEW_KEY] as { turn: number };
    expect(result.turn).toBe(7);
  });

  it("같은 국에는 한 번 쓰면 다시 제시되지 않는다", () => {
    const { game, flow } = startFlow(scene());
    flow.submit("p0", { type: "tenpai_scan_use", payload: {} });

    // 사용 카운터는 **국 단위 키**에 선다 (`{id}:uses:{roundKey}:{holder}`)
    const usesKeys = Object.keys(game.engine.state.augmentData).filter((k) =>
      k.startsWith("tenpai_scan:uses:"),
    );
    expect(usesKeys).toHaveLength(1);
    expect(usesKeys[0]!.endsWith(":p0#round")).toBe(true);
    expect(game.engine.state.augmentData[usesKeys[0]!]).toBe(1);

    // 사용 후의 state를 새 게임에 재설치 → p0 턴이어도 스캔 후보가 뜨지 않는다
    const used = withAugments(game.engine.state, "p0", ["tenpai_scan"]);
    const game2 = createStandardGameFromState({
      ...used,
      round: { ...used.round, phase: "turn.act", turnSeat: 0 },
    });
    installAugment(game2.engine, tenpaiScan, "p0", { yaku: game2.yaku });
    const status2 = new FlowController(game2.engine).begin();
    if (status2.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status2.prompts.find((p) => p.player === "p0");
    expect(
      prompt?.options.filter((o) => o.type === "tenpai_scan_use") ?? [],
    ).toHaveLength(0);
  });

  it("국이 바뀌면 다시 쓸 수 있다 (매 국 1회)", () => {
    const { game, flow } = startFlow(scene());
    flow.submit("p0", { type: "tenpai_scan_use", payload: {} });

    // 다음 국(동2국)으로 넘어간 상태 — 사용 카운터 키가 달라져 후보가 되살아난다
    const used = withAugments(game.engine.state, "p0", ["tenpai_scan"]);
    const game2 = createStandardGameFromState({
      ...used,
      round: { ...used.round, phase: "turn.act", turnSeat: 0, roundNumber: 2 },
    });
    installAugment(game2.engine, tenpaiScan, "p0", { yaku: game2.yaku });
    const status2 = new FlowController(game2.engine).begin();
    if (status2.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status2.prompts.find((p) => p.player === "p0");
    expect(
      prompt?.options.filter((o) => o.type === "tenpai_scan_use") ?? [],
    ).toHaveLength(1);
  });
});

/**
 * 대기 폭 힌트 (2026-08-27 사용자 지시 "대기폭 힌트 지급").
 *
 * 계약:
 *  - `widths[i]`가 `players[i]`와 짝이다.
 *  - 값은 `"narrow" | "mid" | "wide"` 세 단계뿐 — **정확한 종류 수도, 대기패 자체도
 *    실리지 않는다**(그건 선언 간파 peek_riichi_waits의 무대다).
 */
describe("천리안 — 대기 폭 힌트", () => {
  /** p1은 1p 단기(1종 = 좁음), p3는 구련보등 13면 대기(9종 = 넓음) */
  function widthScene(): GameState {
    const base = craft({
      hands: {
        p0: "123456789m123p1s",
        p1: "123m456m789m123p1p", // 1p 단기 — 대기 1종
        p2: "147m147p258s1234z", // 노텐 (1s는 p3의 구련보등이 다 쓴다)
        p3: "1112345678999s", // 구련보등 — 소자 9종 전부가 대기(가장 넓다)
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withAugments(base, "p0", ["tenpai_scan"]);
  }

  it("텐파이 상대마다 폭이 3단계로만 실린다 (숫자·대기패는 안 나간다)", () => {
    const { game, flow } = startFlow(widthScene());
    flow.submit("p0", { type: "tenpai_scan_use", payload: {} });

    const result = game.engine.state.augmentData[VIEW_KEY] as {
      players: PlayerId[];
      widths: string[];
      turn: number;
    };
    expect(result.widths).toHaveLength(result.players.length);
    for (const w of result.widths) {
      expect(["narrow", "mid", "wide"]).toContain(w);
    }
    // 채널에 실린 것은 목록 · 폭 · 순뿐 — 대기패가 새어 나가면 안 된다
    expect(Object.keys(result).sort()).toEqual(["players", "turn", "widths"]);

    // 1p 단기(1종)는 반드시 "좁음"
    const i1 = result.players.indexOf("p1");
    expect(i1).toBeGreaterThanOrEqual(0);
    expect(result.widths[i1]).toBe("narrow");

    // 구련보등 13면 대기는 9종이라 "넓음"
    const i3 = result.players.indexOf("p3");
    expect(i3).toBeGreaterThanOrEqual(0);
    expect(result.widths[i3]).toBe("wide");
  });
});
