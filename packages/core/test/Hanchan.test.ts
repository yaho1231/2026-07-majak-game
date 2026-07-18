import { describe, expect, it } from "vitest";
import { HanchanController, DEFAULT_HANCHAN_CONFIG } from "../src/match/HanchanController.js";
import type { HanchanConfig } from "../src/match/HanchanController.js";
import type { PlayerAgent } from "../src/match/PlayerAgent.js";
import type { PlayerView } from "../src/information/PlayerView.js";
import type { ActionOption, DecisionPrompt } from "../src/mahjong/flow/FlowController.js";
import type { AugmentDef } from "../src/augment/Augment.js";
import type { DraftStage } from "../src/network/protocol.js";
import { Prng } from "../src/engine/random/Prng.js";
import { createInitialGameState } from "../src/engine/state/GameState.js";
import { createStandardGameFromState } from "../src/mahjong/flow/standardGame.js";
import type { GameConfig, InitialStateOptions } from "../src/engine/state/GameState.js";
import type { GameEvent } from "../src/engine/events/GameEvent.js";

// ─────────────────────────── 테스트용 봇 에이전트 ───────────────────────────

/**
 * 인라인 봇 에이전트.
 * decide: win > 그 외 랜덤 or discardOnly
 * decideDraft: 첫 번째 선택지를 항상 선택
 */
class TestBotAgent implements PlayerAgent {
  readonly id: string;
  readonly nickname: string;
  readonly isBot = true;
  private readonly rng: Prng;
  private readonly policy: "any" | "discardOnly";
  lastView: PlayerView | null = null;

  constructor(id: string, seed: number, policy: "any" | "discardOnly" = "any") {
    this.id = id;
    this.nickname = `Bot-${id}`;
    this.rng = new Prng(seed);
    this.policy = policy;
  }

  sendView(view: PlayerView): void {
    this.lastView = view;
  }

  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    // win 먼저 선택
    const winOpt = prompt.options.find((o) => o.type === "win");
    if (winOpt && this.policy !== "discardOnly") return winOpt;

    const candidates =
      this.policy === "discardOnly"
        ? prompt.options.filter((o) => o.type === "discard" || o.type === "pass")
        : prompt.options;

    const idx = this.rng.int(candidates.length);
    return candidates[idx] as ActionOption;
  }

  async decideDraft(_stage: DraftStage, choices: AugmentDef[]): Promise<string> {
    return choices[0]!.id;
  }
}

function makeAgents(
  seeds: [number, number, number, number],
  policy: "any" | "discardOnly" = "any",
): PlayerAgent[] {
  return ["p0", "p1", "p2", "p3"].map((id, i) => new TestBotAgent(id, seeds[i]!, policy));
}

// ─────────────────────────── §1 단국 완주 ───────────────────────────

describe("HanchanController — 단국 완주", () => {
  const cfg: Partial<HanchanConfig> = {
    ...DEFAULT_HANCHAN_CONFIG,
    maxWind: 1,        // 동장만 (4국)
    westEntry: false,
    dobi: false,
    draftSchedules: [],
    seed: 42,
  };

  it("봇 4명이 동장 4국을 마치고 최종 순위를 반환한다", async () => {
    const agents = makeAgents([1, 2, 3, 4]);
    const ctrl = new HanchanController(agents, cfg);
    const rankings = await ctrl.run();

    expect(rankings).toHaveLength(4);
    // 순위는 1~4
    const ranks = rankings.map((r) => r.rank).sort((a, b) => a - b);
    expect(ranks).toEqual([1, 2, 3, 4]);
    // 전체 점수 합계는 우마·오카 반영 후에도 일정 (우마는 0섬 이동이므로 합산 0)
    const totalRaw = rankings.reduce((s, r) => s + r.rawScore, 0);
    expect(totalRaw).toBe(100000); // 25000 × 4
  });

  it("결정론: 같은 시드 = 같은 순위·점수", async () => {
    const run = async () => {
      const agents = makeAgents([10, 20, 30, 40]);
      const ctrl = new HanchanController(agents, { ...cfg, seed: 99 });
      return ctrl.run();
    };
    const [r1, r2] = await Promise.all([run(), run()]);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  });
});

// ─────────────────────────── §2 반장전 완주 ───────────────────────────

describe("HanchanController — 반장전 완주 (드래프트 포함)", () => {
  const cfg: Partial<HanchanConfig> = {
    ...DEFAULT_HANCHAN_CONFIG,
    maxWind: 2,
    westEntry: false,
    dobi: false,
    draftSchedules: ["gameStart", "southEntry"],
    seed: 7,
  };

  it("봇 4명이 반장전(동+남 8국)을 완주하고 순위를 반환한다", async () => {
    const agents = makeAgents([7, 14, 21, 28]);
    const ctrl = new HanchanController(agents, cfg);
    const rankings = await ctrl.run();

    expect(rankings).toHaveLength(4);
    const totalRaw = rankings.reduce((s, r) => s + r.rawScore, 0);
    expect(totalRaw).toBe(100000);
  }, 15000); // 반장전은 시간이 걸릴 수 있음
});

// ─────────────────────────── §3 이벤트 콜백 ───────────────────────────

describe("HanchanController — 이벤트 콜백", () => {
  it("onRoundStart/onRoundEnd 콜백이 국 수만큼 호출된다", async () => {
    const starts: number[] = [];
    const ends: string[] = [];

    const agents = makeAgents([3, 6, 9, 12]);
    const ctrl = new HanchanController(
      agents,
      {
        ...DEFAULT_HANCHAN_CONFIG,
        maxWind: 1,
        westEntry: false,
        dobi: false,
        draftSchedules: [],
        seed: 5,
      },
      {
        onRoundStart: (_, idx) => starts.push(idx),
        onRoundEnd: (_, outcome) => ends.push(outcome),
      },
    );
    await ctrl.run();

    // 동장 4국
    expect(starts).toHaveLength(4);
    expect(starts).toEqual([0, 1, 2, 3]);
    expect(ends).toHaveLength(4);
    for (const o of ends) {
      expect(["win", "draw", "abort"]).toContain(o);
    }
  });

  it("onEvent(리플레이) 콜백이 __init__ 이벤트를 포함한다", async () => {
    const log: string[] = [];
    const agents = makeAgents([5, 10, 15, 20]);
    const ctrl = new HanchanController(
      agents,
      {
        ...DEFAULT_HANCHAN_CONFIG,
        maxWind: 1,
        westEntry: false,
        dobi: false,
        draftSchedules: [],
        seed: 11,
      },
      {
        onEvent: (json) => log.push(json),
      },
    );
    await ctrl.run();

    expect(log.length).toBeGreaterThan(0);
    const initEntry = log.find((e) => JSON.parse(e).type === "__init__");
    expect(initEntry).toBeDefined();
  });

  it("리플레이 라운드트립: 이벤트 로그만으로 최종 점수를 재구성한다 (드래프트 포함)", async () => {
    const log: string[] = [];
    const agents = makeAgents([5, 10, 15, 20]);
    const ctrl = new HanchanController(
      agents,
      {
        ...DEFAULT_HANCHAN_CONFIG,
        maxWind: 1,
        westEntry: false,
        dobi: false,
        draftSchedules: ["gameStart"], // 드래프트 이벤트도 로그에 포함되는지 검증
        seed: 11,
      },
      { onEvent: (json) => log.push(json) },
    );
    const rankings = await ctrl.run();

    // 첫 줄은 __init__, 이후 실제 게임 이벤트가 다수 존재해야 한다
    expect(JSON.parse(log[0]!).type).toBe("__init__");
    const gameEvents = log.slice(1).map((l) => JSON.parse(l) as GameEvent);
    expect(gameEvents.length).toBeGreaterThan(20); // __init__ 하나만 있으면 실패
    expect(gameEvents.some((e) => e.type === "AugmentDrafted")).toBe(true);
    expect(gameEvents.some((e) => e.type === "RoundStarted")).toBe(true);

    // seq는 1부터 빠짐없이 증가해야 한다 (누락 시 재구성 불가)
    gameEvents.forEach((e, i) => expect(e.seq).toBe(i + 1));

    // 순수 Reducer 재적용만으로 최종 상태를 재구성
    const init = JSON.parse(log[0]!) as {
      payload: { config: GameConfig; options: InitialStateOptions };
    };
    let state = createInitialGameState(init.payload.config, init.payload.options);
    const game = createStandardGameFromState(state);
    for (const event of gameEvents) {
      state = game.engine.reducers.dispatch(state, event);
    }

    // 재구성 점수 == 라이브 최종 점수
    const liveByPlayer = Object.fromEntries(
      rankings.map((r) => [r.playerId, r.rawScore]),
    );
    for (const p of state.players) {
      expect(p.score).toBe(liveByPlayer[p.id]);
    }
    // 드래프트 픽도 상태에 재구성된다
    expect(state.players.every((p) => p.augments.length === 1)).toBe(true);
  });

  it("sendView가 각 국 시작·종료 시 호출된다 (PlayerView 브로드캐스트)", async () => {
    const agents = makeAgents([2, 4, 6, 8]).map((a) => a as TestBotAgent);
    const ctrl = new HanchanController(agents as unknown as PlayerAgent[], {
      ...DEFAULT_HANCHAN_CONFIG,
      maxWind: 1,
      westEntry: false,
      dobi: false,
      draftSchedules: [],
      seed: 13,
    });
    await ctrl.run();

    for (const agent of agents) {
      expect(agent.lastView).not.toBeNull();
      // PlayerView의 핵심 필드가 있다
      expect(agent.lastView?.playerId).toBe(agent.id);
    }
  });
});

// ─────────────────────────── §4 도비(破産) 조기 종료 ───────────────────────────

describe("HanchanController — 도비 조기 종료", () => {
  it("dobi=true이면 0점 이하 플레이어 발생 시 즉시 종료된다 (4국 미만 가능)", async () => {
    const agents = makeAgents([9, 18, 27, 36], "any");
    let roundCount = 0;
    const ctrl = new HanchanController(
      agents,
      {
        ...DEFAULT_HANCHAN_CONFIG,
        maxWind: 2,
        westEntry: false,
        dobi: true,
        draftSchedules: [],
        seed: 999,
      },
      {
        onRoundEnd: () => roundCount++,
      },
    );
    const rankings = await ctrl.run();

    // 종료 조건: 도비 or 남장 4국 완료
    expect(rankings).toHaveLength(4);
    expect(roundCount).toBeGreaterThanOrEqual(1);
    // 총점 불변
    const totalRaw = rankings.reduce((s, r) => s + r.rawScore, 0);
    expect(totalRaw).toBe(100000);
  }, 20000);
});

// ─────────────────────────── §5 PlayerView 가시성 통합 ───────────────────────────

describe("HanchanController — PlayerView 가시성 통합", () => {
  it("각 플레이어에게 자신의 viewerId가 포함된 PlayerView가 전달된다", async () => {
    const bots = makeAgents([100, 200, 300, 400]);
    const ctrl = new HanchanController(bots, {
      ...DEFAULT_HANCHAN_CONFIG,
      maxWind: 1,
      westEntry: false,
      dobi: false,
      draftSchedules: [],
      seed: 77,
    });
    await ctrl.run();

    for (const agent of bots as TestBotAgent[]) {
      expect(agent.lastView?.playerId).toBe(agent.id);
      // 각 플레이어는 자신의 손패를 볼 수 있다
      expect(agent.lastView?.players).toHaveLength(4);
    }
  });

  it("실게임 경로에서 가시성 규칙이 적용된다 — 내 손패 공개, 상대 손패 hidden, 버림패 전원 공개", async () => {
    // 회귀 방지: defineVisibilityRules가 createStandardGame에 등록되지 않으면
    // 모든 Zone이 hidden 폴백되어 이 테스트가 실패한다 (2026-07-15 실버그)
    const bots = makeAgents([1, 2, 3, 4]);
    let checked = 0;
    const ctrl = new HanchanController(bots, {
      ...DEFAULT_HANCHAN_CONFIG,
      maxWind: 1,
      westEntry: false,
      dobi: false,
      draftSchedules: [],
      seed: 5,
    }, {
      onRoundEnd: () => {
        for (const agent of bots as TestBotAgent[]) {
          const view = agent.lastView;
          if (view === null) continue;
          const ownHand = view.zones[`hand:${agent.id}`];
          // 국 진행 중 최소 한 번은 자기 손패가 보였어야 한다
          if ((ownHand?.tileIds.length ?? 0) > 0) checked++;
          // 상대 손패는 hidden
          for (const p of ["p0", "p1", "p2", "p3"]) {
            if (p === agent.id) continue;
            expect(view.zones[`hand:${p}`]?.tileIds ?? []).toHaveLength(0);
          }
          // 버림패는 hiddenCount 없이 공개
          for (const p of ["p0", "p1", "p2", "p3"]) {
            expect(view.zones[`discards:${p}`]?.hiddenCount).toBe(0);
          }
        }
      },
    });
    await ctrl.run();
    expect(checked).toBeGreaterThan(0);
  });
});
