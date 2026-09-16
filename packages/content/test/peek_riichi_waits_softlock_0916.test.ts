/**
 * 선언 간파(peek_riichi_waits) × 노텐 리치 — 같은 대상을 무한히 간파하던 소프트락의
 * 회귀 테스트 (2026-09-16, QA 5라운드 B-2 조합 스위프 idx 329·2643·3025).
 *
 *   세 판의 공통점: «증강을 늘 누르는» 페르소나가 선언 간파를 들고, 상대가 공성계
 *   (siege_riichi)로 **노텐 리치**를 걸었다. 노텐 리치 간파는 빈 대기를 돌려주고
 *   국당 1회를 소모하지 않는다(2026-08-23 확정 8) — 그런데 사용 플래그가 안 서니
 *   같은 대상의 peek_waits 후보가 그대로 다시 떴고 validate도 통과했다. 상태를 전혀
 *   바꾸지 않는 합법 액션이 무한히 반복 가능해져 한 턴에서 영원히 돌았다(동기 무한
 *   루프라 하네스의 withTimeout·agentDecideTimeout 어느 것도 못 울렸다).
 *
 * 재현 스크립트: qa-lab/round5/repro/combo_hang.ts <idx> <k>
 *
 * 고친 것(peek_riichi_waits.ts): 이 국에 이미 본 대상(대상별 뷰 키가 배열로 존재 —
 * 빈 배열 포함)은 후보에서 빼고 validate도 막는다. 빈 간파가 횟수를 안 깎는 계약은
 * 그대로다 — 다른 리치 상대는 여전히 볼 수 있다.
 */

import { describe, expect, it } from "vitest";
import { FlowController, createStandardGameFromState, installAugment } from "@majak/core";
import type { ActionOption, GameState, PlayerId } from "@majak/core";
import { peekRiichiWaits } from "../src/augments/peek_riichi_waits.js";
import { craft } from "./helpers.js";

/** 13장 노텐(멀찍이 흩어진 손) + 쯔모패 — 리치 중이라도 대기 0종 */
const NOTEN = "159m159p159s1234z";

function scene(riichiSeats: PlayerId[]): GameState {
  const s = craft({
    hands: { p0: "*", p1: NOTEN, p2: NOTEN, p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const byPlayer = { ...s.round.byPlayer };
  for (const seat of riichiSeats) {
    byPlayer[seat] = {
      ...s.round.byPlayer[seat]!,
      riichi: { double: false, ippatsu: false, discardIndex: 0, cost: 1000 },
    };
  }
  return {
    ...s,
    players: s.players.map((p) => (p.id === "p0" ? { ...p, augments: ["peek_riichi_waits"] } : p)),
    round: { ...s.round, byPlayer },
  };
}

function setup(riichiSeats: PlayerId[]) {
  const game = createStandardGameFromState(scene(riichiSeats), undefined, [peekRiichiWaits]);
  installAugment(game.engine, peekRiichiWaits, "p0", { yaku: game.yaku, catalog: game.augments });
  const flow = new FlowController(game.engine);
  return { game, flow };
}

function promptOf(status: ReturnType<FlowController["begin"]>) {
  if (status.kind !== "awaiting") throw new Error(`expected awaiting, got ${status.kind}`);
  const prompt = status.prompts.find((p) => p.player === "p0");
  if (prompt === undefined) throw new Error("p0 프롬프트가 없다");
  return prompt;
}

const peekTargets = (options: readonly ActionOption[]): PlayerId[] =>
  options.filter((o) => o.type === "peek_waits").map((o) => (o.payload as { target: PlayerId }).target).sort();

const usedFlag = (st: GameState): unknown =>
  Object.entries(st.augmentData).find(([k]) => k.startsWith("peek_riichi_waits:used") && k.includes("p0"))?.[1];

describe("선언 간파 × 노텐 리치 — 같은 대상을 다시 간파할 수 없다 (소프트락 회귀)", () => {
  it("빈 대기를 받은 뒤 같은 대상의 후보가 사라지고 validate도 막는다; 횟수는 살아 있다", () => {
    const { game, flow } = setup(["p1"]);
    const first = promptOf(flow.begin());
    expect(peekTargets(first.options)).toEqual(["p1"]);
    const peek = first.options.find((o) => o.type === "peek_waits")!;

    const status = flow.submit("p0", peek);
    const st = game.engine.state;
    // 노텐 리치 간파: 대기 0종, 국당 1회는 소모되지 않는다 (2026-08-23 계약 유지)
    expect(st.augmentData["view:p0:waits:p1"]).toEqual([]);
    expect(usedFlag(st)).toBeUndefined();

    // 되돌리면 실패하는 자리: 후보가 다시 떠 무한 반복이 가능했다
    const second = promptOf(status);
    expect(peekTargets(second.options)).toEqual([]);
    const r = game.engine.submit({ player: "p0", type: "peek_waits", payload: { target: "p1" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/already peeked this target/);
  });

  it("다른 리치 상대는 여전히 볼 수 있다 — 빈 간파가 횟수를 안 깎는 의미가 남는다", () => {
    const { game, flow } = setup(["p1", "p2"]);
    const first = promptOf(flow.begin());
    expect(peekTargets(first.options)).toEqual(["p1", "p2"]);
    const peekP1 = first.options.find(
      (o) => o.type === "peek_waits" && (o.payload as { target: PlayerId }).target === "p1",
    )!;
    const status = flow.submit("p0", peekP1);
    expect(usedFlag(game.engine.state)).toBeUndefined();
    const second = promptOf(status);
    expect(peekTargets(second.options)).toEqual(["p2"]);
  });

  it("증강을 늘 누르는 봇이 한 턴에서 유한 번 안에 버림으로 넘어간다", () => {
    const { flow } = setup(["p1"]);
    let status = flow.begin();
    let peeks = 0;
    for (let guard = 0; guard < 20; guard++) {
      const prompt = promptOf(status);
      const peek = prompt.options.find((o) => o.type === "peek_waits");
      if (peek === undefined) break;
      peeks++;
      status = flow.submit("p0", peek);
    }
    expect(peeks).toBe(1);
  });
});
