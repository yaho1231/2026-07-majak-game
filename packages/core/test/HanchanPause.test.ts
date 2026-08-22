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
    /**
     * 첫 결정 **직전**에 한 번 부른다 — «판이 결정 루프 안에서 돌고 있는 순간»의
     * 유일하게 정확한 지점이다. 관리자가 화면을 보고 손잡이를 누르는 시점이 여기다.
     */
    private readonly onFirstDecide?: () => void,
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
    if (this.tally.decides === 1) this.onFirstDecide?.();
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

/**
 * 국 무효 (docs/36 B4) — 강제 종료와 무효 사이의 손잡이.
 *
 * 규칙이 판정하는 도중유국과 **같은 문**으로 나가야 한다. 여기서 새 정산 경로를
 * 만들면 점수·본장·친 로테이션이 규칙 쪽과 언젠가 어긋난다.
 */
describe("HanchanController — 이 국만 물리기", () => {
  it("물린 국은 점수가 오가지 않고, 판은 그대로 이어져 끝난다", async () => {
    const tally = { decides: 0 };
    /*
     * **국 안에서** 건다 (`onFirstDecide`) — 관리자가 화면을 보고 누르는 시점이다.
     *
     * 예전에는 `run()` 직후에 동기로 걸었다. 그 자리는 첫 국의 결정 루프에 들어가기
     * **전**, 즉 «국과 국 사이»와 같은 창이라 지금은 거절된다 — 그 창에서 걸어 둔
     * 요청이 다음 국을 물리던 것이 바로 고친 결함이다(아래 테스트). 손잡이의 뜻은
     * 「지금 도는 이 국을 물린다」이므로, 도는 중에 거는 것이 이 테스트의 제자리다.
     */
    let requested: boolean | null = null;
    const agents = ["p0", "p1", "p2", "p3"].map(
      (id, i) =>
        new CountingAgent(id, i + 1, tally, false, () => {
          requested = ctrl.requestRoundVoid();
        }),
    );
    const settled: { outcome: string; deltas: Record<string, number> }[] = [];
    const ctrl: HanchanController = new HanchanController(agents, CFG, {
      // 이벤트는 리플레이용 JSON 문자열로 흘러나온다 — 정산만 골라 읽는다.
      onEvent: (json) => {
        const ev = JSON.parse(json) as { type: string; payload?: unknown };
        if (ev.type !== "RoundSettled") return;
        const p = ev.payload as { outcome: string; deltas: Record<string, number> };
        settled.push({ outcome: p.outcome, deltas: p.deltas });
      },
    });
    const rankings = await ctrl.run();

    // 국 안에서 걸었으므로 요청이 받아들여졌다.
    expect(requested, "국이 도는 중인데 요청이 거절됐다").toBe(true);
    // 판은 끝까지 갔다 — 이건 «판을 접는 것»이 아니다.
    expect(rankings).toHaveLength(4);
    // 물린 국이 하나 있고, 그 국에서는 아무도 주고받지 않았다.
    const voided = settled.filter((r) => r.outcome === "abort");
    expect(voided.length).toBeGreaterThanOrEqual(1);
    expect(Object.values(voided[0]!.deltas).every((d) => d === 0)).toBe(true);
  }, 30_000);

  /**
   * **국과 국 사이에 건 요청은 다음 국을 물리지 않는다** (QA 2차 admin 확정 1).
   *
   * `roundVoid` 플래그는 `runRound()`의 결정 루프 **안에서만** 소비된다. 결과 화면이
   * 떠 있는 «국 사이»는 그 루프 밖이라, 예전에는 걸어 둔 플래그가 그대로 살아남아
   * **다음 국의 첫 결정 지점**에서 터졌다 — 물리려던 국은 점수까지 그대로 정산되고,
   * 무고한 다음 국이 배패 직후 adminVoid 도중유국이 됐다(본장만 하나 붙는다).
   * 그러면서 대국자에게 나간 안내는 "이 국을 물렸습니다"였다. 관리자는 그 문구를
   * 믿고 오심이 정리됐다고 판단하므로, 조용히 어긋나는 것이 가장 나쁘다.
   *
   * 결과 화면은 사람이 «다음 국»을 누를 때까지 떠 있다 — 노려서 맞히기 어려운 창이
   * 아니라, 오히려 «국이 끝난 걸 보고 나서» 누르는 것이 자연스러운 순서다.
   */
  it("국 사이(결과 화면)에 건 요청은 거절되고, 다음 국을 물리지 않는다", async () => {
    const tally = { decides: 0 };
    const agents = ["p0", "p1", "p2", "p3"].map(
      (id, i) => new CountingAgent(id, i + 1, tally),
    );
    /** 국이 끝난 자리(= 결정 루프 밖)에서 건 요청의 반환값들. */
    const requestedBetween: boolean[] = [];
    const outcomes: string[] = [];
    const ctrl: HanchanController = new HanchanController(agents, CFG, {
      onRoundEnd: (_game, outcome) => {
        outcomes.push(outcome);
        // 여기가 정확히 «결과 화면» 자리다 — `runRound()`이 막 반환한 직후.
        requestedBetween.push(ctrl.requestRoundVoid());
      },
    });
    const rankings = await ctrl.run();

    expect(rankings).toHaveLength(4);
    expect(requestedBetween.length, "국이 하나도 안 끝났다 — 이 테스트가 노리는 자리가 아니다")
      .toBeGreaterThan(0);
    // 1) 국 사이의 요청은 전부 거절된다 — 걸어 두지 않는다.
    expect(
      requestedBetween.every((r) => r === false),
      "국 사이의 요청이 받아들여졌다 — 그 요청은 다음 국을 물린다",
    ).toBe(true);
    // 2) 그래서 어느 국도 물리지 않았다. (예전에는 매 국 끝마다 건 요청이 곧바로
    //    다음 국을 abort 로 만들어, 결과가 abort 로 도배됐다.)
    expect(outcomes, `국 결과: ${outcomes.join(",")}`).not.toContain("abort");
  }, 30_000);

  it("이미 무효로 끝난 판에는 걸리지 않는다", async () => {
    const tally = { decides: 0 };
    const agents = ["p0", "p1", "p2", "p3"].map(
      (id, i) => new CountingAgent(id, i + 1, tally),
    );
    const ctrl = new HanchanController(agents, CFG);
    const run = ctrl.run();
    ctrl.requestAbort();
    // 아무 일도 일어나지 않아야 한다 (던지지도 않는다). 물릴 국이 없으므로 false 다.
    expect(ctrl.requestRoundVoid()).toBe(false);
    await run;
  });
});
