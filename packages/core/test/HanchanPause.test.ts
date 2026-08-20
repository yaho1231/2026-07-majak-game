/**
 * HanchanController 일시정지 — 관리자 중계용 «판 세우기» (docs/36 §7).
 *
 * 여기서 못 박는 것은 **판이 한 칸도 나아가지 않는다**는 것 하나다. 사람의 제한
 * 시간은 좌석(HumanAgent)이 따로 세우지만, 봇에게는 제 시계가 없어 컨트롤러의
 * 문이 유일한 제동이다 — 문이 새면 세워 둔 판에서 봇 셋이 저희끼리 국을 끝낸다.
 *
 * 무응답 안전망(`agentDecideTimeoutMs`)도 함께 봐야 한다. 그 타이머가 정지 중에도
 * 흐르면, 아무도 답하지 않는 그 몇 분 동안 안전망이 폴백을 밀어 넣어 **세워 둔 판을
 * 서버가 대신 두게 된다**.
 */

import { describe, expect, it } from "vitest";
import { HanchanController, DEFAULT_HANCHAN_CONFIG } from "../src/match/HanchanController.js";
import type { HanchanConfig } from "../src/match/HanchanController.js";
import type { PlayerAgent } from "../src/match/PlayerAgent.js";
import type { ActionOption, DecisionPrompt } from "../src/mahjong/flow/FlowController.js";
import type { AugmentDef } from "../src/augment/Augment.js";
import type { DraftStage } from "../src/network/protocol.js";
import { Prng } from "../src/engine/random/Prng.js";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 결정 횟수를 함께 세는 최소 봇 — "판이 움직였는가"의 유일한 관측점이다. */
class CountingAgent implements PlayerAgent {
  readonly nickname: string;
  readonly isBot = true;
  private readonly rng: Prng;
  pausedCalls: boolean[] = [];

  constructor(
    readonly id: string,
    seed: number,
    private readonly tally: { decides: number },
    /** 첫 결정에 영영 답하지 않는다 — 안전망만이 판을 밀 수 있는 상태를 만든다 */
    private readonly hangFirst = false,
  ) {
    this.nickname = `Bot-${id}`;
    this.rng = new Prng(seed);
  }

  sendView(): void {
    /* 뷰는 보지 않는다 */
  }

  setPaused(paused: boolean): void {
    this.pausedCalls.push(paused);
  }

  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    this.tally.decides++;
    if (this.hangFirst && this.tally.decides === 1) return new Promise<ActionOption>(() => {});
    const opts = prompt.options;
    return opts[this.rng.int(opts.length)] as ActionOption;
  }

  async decideDraft(_stage: DraftStage, choices: AugmentDef[]): Promise<string> {
    return choices[0]!.id;
  }
}

const CFG: Partial<HanchanConfig> = {
  ...DEFAULT_HANCHAN_CONFIG,
  maxWind: 1,
  westEntry: false,
  dobi: false,
  draftSchedules: [],
  seed: 7,
};

describe("HanchanController — 일시정지", () => {
  it("세우면 판이 한 칸도 나아가지 않고, 재개하면 그대로 이어져 끝난다", async () => {
    const tally = { decides: 0 };
    const agents = ["p0", "p1", "p2", "p3"].map(
      (id, i) => new CountingAgent(id, i + 1, tally),
    );
    const ctrl = new HanchanController(agents, CFG);
    const run = ctrl.run();

    ctrl.setPaused(true);
    expect(ctrl.isPaused).toBe(true);
    // 세우는 순간 이미 답을 만들고 있던 결정 하나는 나갈 수 있다 — 그것까지 가라앉힌 뒤
    // 센 값이 기준선이다.
    await sleep(30);
    const settled = tally.decides;
    await sleep(120);
    expect(tally.decides).toBe(settled); // 그동안 아무도 두지 않았다

    ctrl.setPaused(false);
    const rankings = await run;
    expect(ctrl.isPaused).toBe(false);
    expect(rankings).toHaveLength(4);
    expect(tally.decides).toBeGreaterThan(settled); // 재개 뒤에 판이 다시 굴렀다
  });

  it("좌석에도 정지·재개를 그대로 전달한다 (사람의 제한 시간은 좌석이 세운다)", async () => {
    const tally = { decides: 0 };
    const agents = ["p0", "p1", "p2", "p3"].map(
      (id, i) => new CountingAgent(id, i + 1, tally),
    );
    const ctrl = new HanchanController(agents, CFG);
    const run = ctrl.run();
    ctrl.setPaused(true);
    ctrl.setPaused(false);
    await run;
    for (const a of agents) expect(a.pausedCalls).toEqual([true, false]);
  });

  it("같은 상태로 두 번 걸어도 좌석을 두 번 흔들지 않는다", async () => {
    const tally = { decides: 0 };
    const agents = ["p0", "p1", "p2", "p3"].map(
      (id, i) => new CountingAgent(id, i + 1, tally),
    );
    const ctrl = new HanchanController(agents, CFG);
    const run = ctrl.run();
    ctrl.setPaused(true);
    ctrl.setPaused(true);
    ctrl.setPaused(false);
    await run;
    for (const a of agents) expect(a.pausedCalls).toEqual([true, false]);
  });

  it("무응답 안전망도 함께 선다 — 세워 둔 판을 서버가 대신 두지 않는다", async () => {
    const tally = { decides: 0 };
    // 첫 결정에 영영 답하지 않는 좌석 — 이 판을 밀 수 있는 것은 안전망뿐이다.
    const agents = ["p0", "p1", "p2", "p3"].map(
      (id, i) => new CountingAgent(id, i + 1, tally, true),
    );
    const ctrl = new HanchanController(agents, { ...CFG, agentDecideTimeoutMs: 120 });
    const run = ctrl.run();
    await sleep(20);
    expect(tally.decides).toBe(1); // 첫 결정이 매달려 있다
    ctrl.setPaused(true);

    // 안전망이 살아 있었다면 120ms 안에 폴백이 나가 판이 계속 굴렀을 시간.
    await sleep(400);
    expect(tally.decides).toBe(1);

    ctrl.setPaused(false);
    const rankings = await run; // 재개하면 남은 100ms 뒤 안전망이 제 일을 한다
    expect(rankings).toHaveLength(4);
  }, 30_000);

  it("무효로 끝난 판은 세우지 않는다 — 되살릴 수 없는 판에 문만 잠긴다", async () => {
    const tally = { decides: 0 };
    const agents = ["p0", "p1", "p2", "p3"].map(
      (id, i) => new CountingAgent(id, i + 1, tally),
    );
    const ctrl = new HanchanController(agents, CFG);
    const run = ctrl.run();
    ctrl.requestAbort();
    ctrl.setPaused(true);
    expect(ctrl.isPaused).toBe(false);
    await run;
  });
});
