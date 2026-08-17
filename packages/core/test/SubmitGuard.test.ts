/**
 * 상태 전이 예외가 판을 죽이지 않는다 — 감사 2026-08-17 §2-7 회귀 가드.
 *
 * `safeDecide`는 에이전트의 예외·무응답·범위 밖 응답을 완벽히 흡수하는데, 정작 그
 * 결정을 엔진에 넣는 **다음 한 줄**(`flow.submit`)이 맨몸이었다. 거기서 던지면
 * `run()`이 거부되고 서버는 방을 통째로 지운다 — 사람 넷의 반장전이 점수·기록·
 * 리플레이 없이 사라진다.
 *
 * 이 파일이 지키는 것은 두 가지다.
 * 1. 한 수가 엔진에서 거부돼도 **판은 끝까지 간다** (안전 폴백으로 다시 넣는다).
 * 2. 폴백조차 통하지 않으면 **감추지 않는다** — 엔진이 어떤 선택도 못 받는 상태를
 *    억지로 이어 가면 다음 국의 점수가 거짓이 된다.
 */

import { describe, expect, it, vi, afterEach } from "vitest";
import {
  HanchanController,
  DEFAULT_HANCHAN_CONFIG,
} from "../src/match/HanchanController.js";
import { FlowController } from "../src/mahjong/flow/FlowController.js";
import type { ActionOption, DecisionPrompt } from "../src/mahjong/flow/FlowController.js";
import type { PlayerAgent } from "../src/match/PlayerAgent.js";
import type { AugmentDef } from "../src/augment/Augment.js";
import type { DraftStage } from "../src/network/protocol.js";

class QuietAgent implements PlayerAgent {
  readonly isBot = true;
  readonly nickname: string;
  constructor(readonly id: string) {
    this.nickname = `Bot-${id}`;
  }
  sendView(): void {
    /* 이 파일은 흐름만 본다 — 뷰는 버린다 */
  }
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    return (
      prompt.options.find((o) => o.type === "pass") ??
      prompt.options.find((o) => o.type === "discard") ??
      prompt.options[0]!
    );
  }
  async decideDraft(_stage: DraftStage, choices: AugmentDef[]): Promise<string> {
    return choices[0]!.id;
  }
}

/** 증강 없는 동풍 1국짜리 설정 — 이 파일은 흐름만 본다. */
const ONE_ROUND = {
  ...DEFAULT_HANCHAN_CONFIG,
  maxWind: 1,
  westEntry: false,
  dobi: false,
  draftSchedules: [],
  seed: 7717,
};

function agents(): PlayerAgent[] {
  return ["p0", "p1", "p2", "p3"].map((id) => new QuietAgent(id));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("flow.submit 예외 — 판이 살아남는다 (§2-7)", () => {
  it("첫 버림이 엔진에서 거부돼도 반장전은 끝까지 간다", async () => {
    const real = FlowController.prototype.submit;
    let sabotaged = false;
    const spy = vi
      .spyOn(FlowController.prototype, "submit")
      .mockImplementation(function (this: FlowController, player, option) {
        // 딱 한 번, 첫 버림에만 던진다 — "제시할 때는 합법이었는데 넣을 때는
        // 아니게 된 수"(증강 validate가 두 시점 사이에 답을 바꾸는 경우)의 재현.
        if (!sabotaged && option.type === "discard") {
          sabotaged = true;
          throw new Error("테스트: 상태 전이 실패");
        }
        return real.call(this, player, option);
      });

    const rankings = await new HanchanController(agents(), ONE_ROUND).run();

    expect(sabotaged).toBe(true); // 방해가 실제로 걸렸는지부터 확인한다
    expect(rankings).toHaveLength(4);
    expect(rankings.map((r) => r.rank).sort()).toEqual([1, 2, 3, 4]);
    // 점수는 제로섬 그대로 — 한 수를 폴백으로 바꿔도 정산이 새지 않는다.
    expect(rankings.reduce((s, r) => s + r.rawScore, 0)).toBe(100_000);
    spy.mockRestore();
  });

  it("폴백까지 거부되면 감추지 않고 그대로 올려 보낸다", async () => {
    vi.spyOn(FlowController.prototype, "submit").mockImplementation(() => {
      throw new Error("테스트: 무엇을 넣어도 실패");
    });
    await expect(new HanchanController(agents(), ONE_ROUND).run()).rejects.toThrow(
      /무엇을 넣어도 실패/,
    );
  });

  it("평시에는 가드가 아무 일도 하지 않는다 (고른 수가 그대로 들어간다)", async () => {
    const errs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const real = FlowController.prototype.submit;
    const chosen: string[] = [];
    vi.spyOn(FlowController.prototype, "submit").mockImplementation(function (
      this: FlowController,
      player,
      option,
    ) {
      chosen.push(option.type);
      return real.call(this, player, option);
    });

    const rankings = await new HanchanController(agents(), ONE_ROUND).run();

    expect(rankings).toHaveLength(4);
    expect(chosen.length).toBeGreaterThan(0);
    // 가드는 실패했을 때만 말한다 — 평시에 이 문구가 나오면 조용한 되돌림이 있다는 뜻이다.
    const guardTalked = errs.mock.calls.some((c) => String(c[0] ?? "").includes("submit("));
    expect(guardTalked).toBe(false);
  });
});
