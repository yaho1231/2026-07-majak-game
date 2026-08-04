import { describe, expect, it } from "vitest";
import {
  HanchanController,
  DEFAULT_HANCHAN_CONFIG,
  hanchanConfigForMode,
  agariYameTriggers,
} from "../src/match/HanchanController.js";
import type { HanchanConfig } from "../src/match/HanchanController.js";
import type { PlayerAgent } from "../src/match/PlayerAgent.js";
import type { PlayerView } from "../src/information/PlayerView.js";
import type { ActionOption, DecisionPrompt } from "../src/mahjong/flow/FlowController.js";
import { installAugment } from "../src/augment/Augment.js";
import type { AugmentDef } from "../src/augment/Augment.js";
import type { DraftStage } from "../src/network/protocol.js";
import { Prng } from "../src/engine/random/Prng.js";
import { createInitialGameState } from "../src/engine/state/GameState.js";
import { createStandardGameFromState } from "../src/mahjong/flow/standardGame.js";
import { DEAD_WALL, WALL, createZone, handZone } from "../src/engine/zones/Zone.js";
import { kindKey } from "../src/mahjong/tiles/Tile.js";
import type {
  GameConfig,
  GameState,
  InitialStateOptions,
} from "../src/engine/state/GameState.js";
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

// ─────────────────────────── §1.5 리치 강제 수 자동 처리 ───────────────────────────

describe("HanchanController — 리치 쯔모기리 자동 처리", () => {
  /** 받은 프롬프트를 기록하는 봇 — "무엇을 물어봤는가"를 검사한다 */
  class SpyAgent extends TestBotAgent {
    asked: DecisionPrompt[] = [];

    override async decide(prompt: DecisionPrompt): Promise<ActionOption> {
      this.asked.push(prompt);
      return super.decide(prompt);
    }
  }

  /**
   * p0가 리치를 건 채 자기 차례(쯔모 직전)를 맞는 국 중간 상태.
   * p0 손패는 겹치는 패가 없는 13종이라 무엇을 뽑아도 화료·안깡이 되지 않는다 —
   * 즉 p0의 모든 순은 쯔모기리 하나뿐인 강제 수다.
   */
  function riichiMidRoundState(): GameState {
    const ids = ["p0", "p1", "p2", "p3"];
    const base = createInitialGameState(
      { seed: 3, playerIds: ids },
      { startScore: 25000, redFivesPerSuit: 1 },
    );
    const pool = new Map<string, number[]>();
    for (const tile of Object.values(base.tiles)) {
      const key = kindKey(tile.kind);
      pool.set(key, [...(pool.get(key) ?? []), tile.id]);
    }
    const take = (key: string): number => {
      const id = pool.get(key)?.shift();
      if (id === undefined) throw new Error(`no tile left: ${key}`);
      return id;
    };

    const zones = { ...base.zones };
    zones[handZone("p0")] = {
      ...createZone(handZone("p0"), "hand", "p0"),
      tileIds: [
        "man1", "man4", "man7", "pin1", "pin4", "pin7",
        "sou1", "sou4", "sou7", "wind1", "wind2", "wind3", "wind4",
      ].map(take),
    };
    // 나머지 셋은 세 갈래로 번갈아 나눈다 — id순으로 뭉텅이를 떼어 주면 같은 패
    // 넉 장이 한 손에 몰려 국이 첫 순에 끝나 버린다(강제 수 표본이 1장뿐).
    let rest = [...pool.values()].flat().sort((a, b) => a - b);
    ids.slice(1).forEach((p, i) => {
      zones[handZone(p)] = {
        ...createZone(handZone(p), "hand", p),
        tileIds: rest.filter((_, k) => k % 3 === i).slice(0, 13),
      };
    });
    const dealt = new Set(ids.slice(1).flatMap((p) => zones[handZone(p)]!.tileIds));
    rest = rest.filter((id) => !dealt.has(id));
    zones[DEAD_WALL] = { ...createZone(DEAD_WALL, "deadWall"), tileIds: rest.slice(0, 14) };
    zones[WALL] = { ...createZone(WALL, "wall"), tileIds: rest.slice(14) };

    return {
      ...base,
      zones,
      round: {
        ...base.round,
        phase: "turn.draw",
        turnSeat: 0,
        firstTurn: false,
        doraIndicators: [zones[DEAD_WALL].tileIds[4] as number],
        byPlayer: {
          ...base.round.byPlayer,
          p0: {
            ...base.round.byPlayer["p0"]!,
            riichi: { double: false, ippatsu: false, discardIndex: 0 },
          },
        },
      },
    };
  }

  it("리치 후 쯔모기리는 에이전트에게 묻지 않고 컨트롤러가 대신 둔다", async () => {
    const agents = ["p0", "p1", "p2", "p3"].map((id, i) => new SpyAgent(id, (i + 1) * 13));
    const game = createStandardGameFromState(riichiMidRoundState());

    // 첫 국이 끝나는 시점의 기록만 본다 (다음 국의 p0는 리치가 아니다)
    let askedInRound1: number | null = null;
    let discardsInRound1 = 0;
    const ctrl = new HanchanController(
      agents,
      {
        ...DEFAULT_HANCHAN_CONFIG,
        maxWind: 1,
        westEntry: false,
        dobi: false,
        draftSchedules: [],
        seed: 5150,
        autoMoveDelayMs: 5, // 실서버처럼 한 박자 쉬는 경로도 함께 태운다
      },
      {
        onRoundEnd: (g) => {
          askedInRound1 ??= agents[0]!.asked.length;
          if (discardsInRound1 === 0) {
            discardsInRound1 = g.engine.state.round.byPlayer["p0"]?.discardedKinds.length ?? 0;
          }
        },
      },
    );
    await ctrl.resume(game);

    // 리치 중인 p0는 자기 순마다 버렸지만, 단 한 번도 결정을 요청받지 않았다
    expect(discardsInRound1).toBeGreaterThan(3);
    expect(askedInRound1).toBe(0);
    // 다른 국·다른 좌석에서도 강제 수 프롬프트가 새어 나가지 않는다
    for (const agent of agents) {
      expect(agent.asked.filter((p) => p.auto === true)).toHaveLength(0);
    }
  }, 15000);
});

// ─────────────────────────── §2 반장전 완주 ───────────────────────────

describe("HanchanController — 반장전 완주 (드래프트 포함)", () => {
  const cfg: Partial<HanchanConfig> = {
    ...DEFAULT_HANCHAN_CONFIG,
    maxWind: 2,
    westEntry: false,
    dobi: false,
    draftSchedules: ["gameStart", "eastThird", "southEntry", "southThird"],
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

  it("드래프트가 동1·동3·남1·남3국 진입 4회 발동한다", async () => {
    const draftStages: string[] = [];
    const agents = makeAgents([9, 18, 27, 36]);
    const ctrl = new HanchanController(
      agents,
      {
        ...DEFAULT_HANCHAN_CONFIG,
        ...hanchanConfigForMode("hanchan"),
        westEntry: false,
        dobi: false,
        agariYame: false, // 오라스 아가리야메로 조기 종국하면 남3 드래프트만 확인된다
        seed: 4242,
      },
      { onDraftStart: (stage) => draftStages.push(stage) },
    );
    await ctrl.run();

    expect(draftStages).toEqual(["gameStart", "eastThird", "southEntry", "southThird"]);
  }, 20000);
});

// ─────────────────────────── §2.5 동풍전 완주 ───────────────────────────

describe("HanchanController — 동풍전 완주 (드래프트 3회)", () => {
  it("봇 4명이 동풍전(동 4국)을 완주하고, 드래프트가 동1·동3·동4국 진입 3회 발동한다", async () => {
    const draftStages: string[] = [];
    const roundEnds: string[] = [];
    const agents = makeAgents([11, 22, 33, 44]);
    const ctrl = new HanchanController(
      agents,
      {
        ...DEFAULT_HANCHAN_CONFIG,
        ...hanchanConfigForMode("tonpuu"), // mode·maxWind=1·westEntry=false·drafts
        dobi: false,
        seed: 123,
      },
      {
        onDraftStart: (stage) => draftStages.push(stage),
        onRoundEnd: (_, outcome) => roundEnds.push(outcome),
      },
    );
    const rankings = await ctrl.run();

    expect(rankings).toHaveLength(4);
    // 드래프트는 동1(게임 시작)·동3·동4 진입, 정확히 3회
    expect(draftStages).toEqual(["gameStart", "eastThird", "eastFourth"]);
    // 동풍전은 최소 4국(동1~4). 연장(본장)으로 더 길어질 수 있으나 4 이상.
    expect(roundEnds.length).toBeGreaterThanOrEqual(4);
    const totalRaw = rankings.reduce((s, r) => s + r.rawScore, 0);
    expect(totalRaw).toBe(100000);
  }, 15000);

  it("결정론: 같은 시드 동풍전 = 같은 순위·점수", async () => {
    const run = async () => {
      const agents = makeAgents([5, 6, 7, 8]);
      const ctrl = new HanchanController(agents, {
        ...DEFAULT_HANCHAN_CONFIG,
        ...hanchanConfigForMode("tonpuu"),
        dobi: false,
        seed: 456,
      });
      return ctrl.run();
    };
    const [r1, r2] = await Promise.all([run(), run()]);
    expect(JSON.stringify(r1)).toBe(JSON.stringify(r2));
  }, 15000);

  it("아무도 반환점(30000)에 못 미치면 남장(남입)으로 연장했다가 남4국에서 종료한다", async () => {
    // returnScore를 아주 높게 잡아 서든데스가 절대 끝나지 않게 → 동4국 후 남장 전체 진행,
    // 남4국(장=3 진입)에서 강제 종료. 동4국 하드 종료였다면 국 수가 4에 그친다.
    const roundEnds: string[] = [];
    const agents = makeAgents([2, 4, 6, 8]);
    const ctrl = new HanchanController(
      agents,
      {
        ...DEFAULT_HANCHAN_CONFIG,
        ...hanchanConfigForMode("tonpuu"),
        dobi: false,
        returnScore: 10_000_000, // 아무도 도달 불가 → 서든데스 최대치까지
        seed: 321,
      },
      { onRoundEnd: (_, outcome) => roundEnds.push(outcome) },
    );
    const rankings = await ctrl.run();
    expect(rankings).toHaveLength(4);
    // 동1~4 + 남1~4 = 최소 8국(연장·본장으로 더 늘 수 있음). 연장이 없었다면 4에 그친다.
    expect(roundEnds.length).toBeGreaterThanOrEqual(8);
  }, 20000);
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
      // ⚠ 증강은 자기 이벤트 타입의 Reducer를 install에서 등록한다(RecallPerformed 등).
      // 드래프트되는 순간 설치하지 않으면 이후 그 증강이 만든 이벤트에서 재구성이 죽는다
      // — ReplayReader의 readReplay·reconstructGame과 같은 규약이다.
      if (event.type === "AugmentDrafted") {
        const p = event.payload as { player: string; augmentId: string };
        const def = game.augments.get(p.augmentId);
        if (def !== undefined) installAugment(game.engine, def, p.player, { yaku: game.yaku });
      }
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

// ─────────────────────── 버림 자리(lastDiscardFrom) ───────────────────────

describe("HanchanController — 버림이 나온 손패 자리", () => {
  it("모든 버림에 자리가 실리고, 자리·장수·쯔모기리 여부가 실제와 맞는다", async () => {
    // 상대 화면에서 "13장 중 몇 번째에서 뺐는지 / 떨어져 있던 쯔모패를 흘렸는지"를
    // 그리는 근거다. 자리가 비거나 범위를 벗어나면 화면의 빈 칸이 엉뚱한 곳에 뜬다.
    const bots = makeAgents([11, 22, 33, 44], "discardOnly");
    let seen = 0;
    let sawTedashi = false;
    let sawTsumogiri = false;
    const ctrl = new HanchanController(bots, {
      ...DEFAULT_HANCHAN_CONFIG,
      maxWind: 1,
      westEntry: false,
      dobi: false,
      draftSchedules: [],
      seed: 909,
    });
    // 뷰가 갈 때마다 검사한다 — sendView를 가로채 누적
    for (const agent of bots as TestBotAgent[]) {
      const orig = agent.sendView.bind(agent);
      agent.sendView = (view: PlayerView): void => {
        orig(view);
        const from = view.round.lastDiscardFrom;
        const last = view.round.lastDiscard;
        if (from === null || last === null) return;
        seen++;
        // 표식은 항상 지금 바닥에 놓인 그 버림패의 것이어야 한다
        expect(from.tileId).toBe(last.tileId);
        expect(from.player).toBe(last.player);
        // 자리는 그때의 손패 안이어야 한다
        expect(from.index).toBeGreaterThanOrEqual(0);
        expect(from.index).toBeLessThan(from.handSize);
        // 쯔모기리면 떨어져 있던 마지막 자리에서 나왔다
        if (from.tsumogiri) {
          sawTsumogiri = true;
          expect(from.index).toBe(from.handSize - 1);
        } else {
          sawTedashi = true;
        }
      };
    }
    await ctrl.run();
    expect(seen).toBeGreaterThan(0);
    // 한 국을 다 돌면 손버림·쯔모기리가 둘 다 나온다 (무작위 버림 정책)
    expect(sawTedashi).toBe(true);
    expect(sawTsumogiri).toBe(true);
  });
});

// ─────────────────────────── 아가리야메 ───────────────────────────

describe("agariYameTriggers — 아가리야메/텐파이야메 종국 판정", () => {
  // 오야 자리=0, 정산 후 장풍·국번이 그대로면 렌짱(오야 유지)로 본다.
  const scores = (s0: number, s1: number, s2: number, s3: number) => [
    { seat: 0, score: s0 },
    { seat: 1, score: s1 },
    { seat: 2, score: s2 },
    { seat: 3, score: s3 },
  ];

  it("반장 남4국: 오야 렌짱 + 오야 단독 1위 → 종국", () => {
    expect(
      agariYameTriggers(true, 2, { wind: 2, roundNumber: 4, dealerSeat: 0 }, {
        prevalentWind: 2,
        roundNumber: 4,
        dealerSeat: 0,
        players: scores(40000, 20000, 20000, 20000),
      }),
    ).toBe(true);
  });

  it("동풍 동4국: 오야 렌짱 + 오야 단독 1위 → 종국", () => {
    expect(
      agariYameTriggers(true, 1, { wind: 1, roundNumber: 4, dealerSeat: 0 }, {
        prevalentWind: 1,
        roundNumber: 4,
        dealerSeat: 0,
        players: scores(40000, 20000, 20000, 20000),
      }),
    ).toBe(true);
  });

  it("오야가 1위가 아니면 계속 (연장)", () => {
    expect(
      agariYameTriggers(true, 2, { wind: 2, roundNumber: 4, dealerSeat: 0 }, {
        prevalentWind: 2,
        roundNumber: 4,
        dealerSeat: 0,
        players: scores(20000, 40000, 20000, 20000),
      }),
    ).toBe(false);
  });

  it("오야가 1위지만 동점(단독 아님)이면 계속", () => {
    expect(
      agariYameTriggers(true, 2, { wind: 2, roundNumber: 4, dealerSeat: 0 }, {
        prevalentWind: 2,
        roundNumber: 4,
        dealerSeat: 0,
        players: scores(35000, 35000, 15000, 15000),
      }),
    ).toBe(false);
  });

  it("렌짱이 아니면(정산 후 국번이 넘어감) 미적용", () => {
    expect(
      agariYameTriggers(true, 2, { wind: 2, roundNumber: 4, dealerSeat: 0 }, {
        prevalentWind: 3, // 서1로 넘어감 = 오야 교대
        roundNumber: 1,
        dealerSeat: 1, // 오야가 다음 자리로 넘어갔다
        players: scores(40000, 20000, 20000, 20000),
      }),
    ).toBe(false);
  });

  it("최종 국이 아니면(남3국 등) 미적용", () => {
    expect(
      agariYameTriggers(true, 2, { wind: 2, roundNumber: 3, dealerSeat: 0 }, {
        prevalentWind: 2,
        roundNumber: 3,
        dealerSeat: 0,
        players: scores(40000, 20000, 20000, 20000),
      }),
    ).toBe(false);
  });

  it("반장에서 동4국(최종 아님)은 미적용", () => {
    expect(
      agariYameTriggers(true, 2, { wind: 1, roundNumber: 4, dealerSeat: 0 }, {
        prevalentWind: 1,
        roundNumber: 4,
        dealerSeat: 0,
        players: scores(40000, 20000, 20000, 20000),
      }),
    ).toBe(false);
  });

  it("agariYame=false면 항상 미적용", () => {
    expect(
      agariYameTriggers(false, 2, { wind: 2, roundNumber: 4, dealerSeat: 0 }, {
        prevalentWind: 2,
        roundNumber: 4,
        dealerSeat: 0,
        players: scores(40000, 20000, 20000, 20000),
      }),
    ).toBe(false);
  });
});

/**
 * 오야 자리를 옮기는 증강(만년 오야·찬탈자)과 아가리야메 (docs/25 국면 #5).
 *
 * 연장 판정은 "정산 후 장풍·국번이 그대로"인데, 1위 조회는 **국 시작 시점의 오야**를
 * 봤다. 오야 자리가 옮겨가면 연장한 사람과 점수를 조회하는 사람이 서로 달라진다.
 */
describe("아가리야메 — 오야 자리가 옮겨가는 경우", () => {
  const scores2 = (s0: number, s1: number, s2: number, s3: number) => [
    { seat: 0, score: s0 },
    { seat: 1, score: s1 },
    { seat: 2, score: s2 },
    { seat: 3, score: s3 },
  ];

  it("연장한 새 오야가 단독 1위면 종국이다", () => {
    // 남4국: 시작 오야는 자리 0이었지만 정산 후 오야가 자리 2로 옮겨갔고,
    // 자리 2가 단독 1위다 → 연장한 본인이 1위이므로 종국.
    expect(
      agariYameTriggers(
        true,
        2,
        { wind: 2, roundNumber: 4, dealerSeat: 0 },
        {
          prevalentWind: 2,
          roundNumber: 4,
          dealerSeat: 2,
          players: scores2(20000, 20000, 40000, 20000),
        },
      ),
    ).toBe(true);
  });

  it("옛 오야가 1위여도 새 오야가 1위가 아니면 종국이 아니다", () => {
    // 예전에는 played.dealerSeat(자리 0)의 점수를 봐서 **엉뚱한 사람의 1위**로
    // 게임이 끝났다.
    expect(
      agariYameTriggers(
        true,
        2,
        { wind: 2, roundNumber: 4, dealerSeat: 0 },
        {
          prevalentWind: 2,
          roundNumber: 4,
          dealerSeat: 2,
          players: scores2(40000, 20000, 20000, 20000),
        },
      ),
    ).toBe(false);
  });
});
