/**
 * **관전자도 「증강 사용 패널」을 실시간으로 본다** (2026-09-03 사용자 보고).
 *
 * 증강의 액티브 선택 판(연금술사 …)이 뜨면 그 사람 화면에는 모달이 서지만
 * 관전자에게는 아무것도 가지 않아, 중계 화면에서는 탁자가 그냥 얼어붙은 것처럼
 * 보였다. 증강 드래프트가 같은 문제를 `SpectateDraftMessage`로 이미 풀어 두었고,
 * 이건 그 설계를 그대로 옮긴 것이다.
 *
 * 이 파일이 못박는 계약:
 *  1. **증강이 세운 선택지**가 있는 프롬프트만 중계된다 — 평범한 버림·후로는 아니다
 *     (그건 매 순 나가는 소음이고 관전 화면이 이미 그린다).
 *  2. 끝나면 `spectateChoiceEnd`가 간다 — 고른 것이 있으면 `picked`가 실리고,
 *     시간 초과·취소면 실리지 않는다.
 *  3. **선택 도중에 합류한 관전석**은 열려 있는 판을 그대로 받는다.
 *  4. 대국자에게는 한 글자도 가지 않는다 (관전 전용 fan-out).
 */

import { describe, expect, it } from "vitest";
import { HanchanController, DEFAULT_HANCHAN_CONFIG } from "../src/match/HanchanController.js";
import type { HanchanConfig, SpectatorSink } from "../src/match/HanchanController.js";
import type { PlayerAgent, SeatChoiceEvent } from "../src/match/PlayerAgent.js";
import type { ActionOption, DecisionPrompt } from "../src/mahjong/flow/FlowController.js";
import type { DraftStage, ServerMessage } from "../src/network/protocol.js";
import type { AugmentDef } from "../src/augment/Augment.js";
import type { PlayerView } from "../src/information/PlayerView.js";
import { Prng } from "../src/engine/random/Prng.js";

/** 최소 봇 — 첫 좌석만 중계 창구를 붙잡아 둔다(사람 좌석 흉내). */
class Seat implements PlayerAgent {
  readonly nickname: string;
  readonly isBot = true;
  readonly seen: ServerMessage[] = [];
  watch: ((ev: SeatChoiceEvent) => void) | null = null;
  private readonly rng: Prng;

  constructor(readonly id: string, seed: number) {
    this.nickname = `Bot-${id}`;
    this.rng = new Prng(seed);
  }

  sendView(): void {}
  notify(msg: ServerMessage): void {
    this.seen.push(msg);
  }
  watchChoices(watch: (ev: SeatChoiceEvent) => void): void {
    this.watch = watch;
  }
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    return prompt.options[this.rng.int(prompt.options.length)] as ActionOption;
  }
  async decideDraft(_stage: DraftStage, choices: AugmentDef[]): Promise<string> {
    return choices[0]?.id ?? "";
  }
}

class RecordingSink implements SpectatorSink {
  readonly msgs: ServerMessage[] = [];
  constructor(readonly id: string) {}
  sendView(_view: PlayerView): void {}
  notify(msg: ServerMessage): void {
    this.msgs.push(msg);
  }
  ofType(type: string): any[] {
    return this.msgs.filter((m) => m.type === type);
  }
}

const CFG: Partial<HanchanConfig> = { ...DEFAULT_HANCHAN_CONFIG, maxWind: 1, seed: 7 };

function harness(): { ctrl: HanchanController; seat: Seat; sink: RecordingSink } {
  const agents = ["p0", "p1", "p2", "p3"].map((id, i) => new Seat(id, i + 1));
  const ctrl = new HanchanController(agents, CFG);
  const sink = new RecordingSink("spec");
  ctrl.addSpectator(sink);
  return { ctrl, seat: agents[0]!, sink };
}

const DISCARD: ActionOption = { type: "discard", payload: { tileId: 3 } };
const PON: ActionOption = { type: "pon", payload: {} };
/** 증강이 세운 선택지 — 표준 마작 액션이 아닌 타입이면 무엇이든 그렇게 본다 */
const ALCHEMY_UP: ActionOption = { type: "alchemy", payload: { tileId: 3, delta: 1 } };
const ALCHEMY_DOWN: ActionOption = { type: "alchemy", payload: { tileId: 3, delta: -1 } };

describe("관전 중계 — 증강 선택 판", () => {
  it("평범한 버림·후로 프롬프트는 **중계하지 않는다**", () => {
    const { seat, sink } = harness();
    seat.watch!({ open: true, seat: "p0", options: [DISCARD, PON] });
    expect(sink.ofType("spectateChoice")).toHaveLength(0);
    // 열린 적이 없으니 닫는 메시지도 나가지 않는다
    seat.watch!({ open: false, seat: "p0", picked: DISCARD });
    expect(sink.ofType("spectateChoiceEnd")).toHaveLength(0);
  });

  it("증강 선택지가 섞이면 관전석에 판이 선다 (증강 선택지만 실린다)", () => {
    const { seat, sink } = harness();
    const deadline = Date.now() + 20_000;
    seat.watch!({
      open: true,
      seat: "p0",
      options: [DISCARD, ALCHEMY_UP, ALCHEMY_DOWN],
      deadline,
    });
    const msgs = sink.ofType("spectateChoice");
    expect(msgs).toHaveLength(1);
    expect(msgs[0].seat).toBe("p0");
    expect(msgs[0].deadline).toBe(deadline);
    // 평범한 버림은 선택지 목록에 섞이지 않는다 — 그건 관전 화면이 이미 그린다
    expect(msgs[0].options).toHaveLength(2);
    for (const o of msgs[0].options) expect(o.label).toContain("alchemy");
    // 이름을 못 찾으면(카탈로그 밖 액션) "선택"이 기본값이다
    expect(typeof msgs[0].title).toBe("string");
    expect(msgs[0].title.length).toBeGreaterThan(0);
  });

  it("고른 것이 있으면 picked가, 시간 초과·취소면 없이 끝을 알린다", () => {
    const { seat, sink } = harness();
    seat.watch!({ open: true, seat: "p0", options: [ALCHEMY_UP, ALCHEMY_DOWN] });
    seat.watch!({ open: false, seat: "p0", picked: ALCHEMY_UP });
    const end = sink.ofType("spectateChoiceEnd");
    expect(end).toHaveLength(1);
    expect(end[0].seat).toBe("p0");
    expect(end[0].picked).toContain("alchemy");

    // 두 번째 판은 시간 초과로 끝난다 — 고른 것이 없으므로 picked가 없다
    seat.watch!({ open: true, seat: "p0", options: [ALCHEMY_UP] });
    seat.watch!({ open: false, seat: "p0" });
    const end2 = sink.ofType("spectateChoiceEnd");
    expect(end2).toHaveLength(2);
    expect(end2[1].picked).toBeUndefined();

    // 안전 폴백(패스)으로 접힌 것도 «고른 것»으로 적지 않는다
    seat.watch!({ open: true, seat: "p0", options: [ALCHEMY_UP] });
    seat.watch!({ open: false, seat: "p0", picked: { type: "pass", payload: {} } });
    expect(sink.ofType("spectateChoiceEnd")[2].picked).toBeUndefined();
  });

  it("대국자에게는 한 글자도 가지 않는다", () => {
    const { seat } = harness();
    seat.watch!({ open: true, seat: "p0", options: [ALCHEMY_UP] });
    for (const m of seat.seen) {
      expect(m.type).not.toBe("spectateChoice");
      expect(m.type).not.toBe("spectateChoiceEnd");
    }
  });

  it("선택 도중에 합류한 관전석도 열려 있는 판을 받는다", async () => {
    const agents = ["p0", "p1", "p2", "p3"].map((id, i) => new Seat(id, i + 1));
    const ctrl = new HanchanController(agents, CFG);
    const late = new RecordingSink("late");
    /*
     * 판이 실제로 돌고 있어야 합류 스냅샷 경로가 열린다(`addSpectator`는 게임이
     * 없으면 아무것도 재생하지 않는다). 첫 뷰가 나가는 자리에서 선택 판을 세우고
     * 그 자리에 붙는다.
     */
    let armed = false;
    agents[0]!.sendView = (): void => {
      if (armed) return;
      armed = true;
      agents[0]!.watch!({ open: true, seat: "p0", options: [ALCHEMY_UP, ALCHEMY_DOWN] });
      ctrl.addSpectator(late);
    };
    await ctrl.run();

    expect(armed, "판이 한 번도 안 돌았다 — 이 테스트가 노리는 자리가 아니다").toBe(true);
    const replay = late.ofType("spectateChoice");
    expect(
      replay.length,
      `선택 도중에 붙었는데 열려 있는 판을 못 받았다 — 화면이 빈다. 받은 것=${late.msgs.map((m) => m.type).join(",")}`,
    ).toBeGreaterThan(0);
    expect(replay[0].seat).toBe("p0");
  }, 30_000);
});
