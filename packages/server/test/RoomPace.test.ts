/**
 * 대기실 제한 시간 묶음 (`ROOM_PACES`) — 2026-08-27 사용자 지시.
 *
 * 규칙(사용자 확정):
 * - 숙련자 = 증강 50초, 타패 30 + 10초.
 * - 초심자 = 증강 120초, 타패 60 + 20초.
 * - 왕초보 = 증강 300초, 타패 300 + 30초.
 * - 남은 시간은 «다 고르면/두면» 취소된다 — 프로미스가 그 자리에서 풀린다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { ROOM_PACES, paceMaxSeatMs } from "@majak/core/network/protocol.js";
import {
  HumanAgent,
  TURN_BANK_MS,
  TURN_GRACE_MS,
  DECISION_TIMEOUT_MS,
  FIRST_DRAFT_TIMEOUT_MS,
} from "../src/HumanAgent.js";

class FakeSocket {
  readyState = 1; // OPEN
  sent: any[] = [];
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  on(): void {
    /* no-op */
  }
  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

const prompt = (player: string, ...types: string[]): any => ({
  player,
  options: types.map((t) => ({ type: t, payload: {} })),
});

const augment = (id: string): any => ({ id, name: id, tier: "C", category: "hand", desc: "" });

/** 이 좌석이 다음 타패에 받는 마감(ms). */
const turnDeadline = (agent: HumanAgent, sock: FakeSocket): number => {
  sock.sent.length = 0;
  void agent.decide(prompt("p0", "discard"));
  return sock.sent.find((m) => m.type === "prompt").deadlineMs;
};

/** 이 좌석이 다음 증강 선택에 받는 마감(ms). */
const draftDeadline = (agent: HumanAgent, sock: FakeSocket, stage: any): number => {
  sock.sent.length = 0;
  void agent.decideDraft(stage, [augment("a"), augment("b"), augment("c")]);
  return sock.sent.find((m) => m.type === "draftOffer").deadlineMs;
};

describe("ROOM_PACES — 사용자가 못박은 값", () => {
  it("숙련자 = 증강 50초 · 타패 30 + 10초", () => {
    expect(ROOM_PACES.expert).toEqual({
      turnGraceMs: 30_000,
      turnBankMs: 10_000,
      draftMs: 50_000,
      firstDraftMs: 50_000,
    });
    // 서버의 옛 상수는 이 칸을 그대로 읽는다 — 값이 두 벌로 갈라지지 않게.
    expect([TURN_GRACE_MS, TURN_BANK_MS, FIRST_DRAFT_TIMEOUT_MS]).toEqual([
      30_000, 10_000, 50_000,
    ]);
    // 초읽기 증강(time_pressure)의 상한은 이 표와 무관하게 그대로다.
    expect(DECISION_TIMEOUT_MS).toBe(30_000);
  });

  it("초심자 = 증강 120초 · 타패 60 + 20초", () => {
    expect(ROOM_PACES.beginner).toEqual({
      turnGraceMs: 60_000,
      turnBankMs: 20_000,
      draftMs: 120_000,
      firstDraftMs: 120_000,
    });
  });

  it("왕초보 = 증강 300초 · 타패 300 + 30초", () => {
    expect(ROOM_PACES.novice).toEqual({
      turnGraceMs: 300_000,
      turnBankMs: 30_000,
      draftMs: 300_000,
      firstDraftMs: 300_000,
    });
  });

  it("좌석 최대 대기는 컨트롤러 그물(90초)을 넘어설 수 있음을 알린다", () => {
    // 이 값이 90초를 넘는 방은 `agentDecideTimeoutMs`를 함께 늘려야 한다.
    expect(paceMaxSeatMs("expert")).toBe(50_000);
    expect(paceMaxSeatMs("beginner")).toBe(120_000);
    expect(paceMaxSeatMs("novice")).toBe(330_000);
  });
});

describe("HumanAgent.setPace", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("기본(안 꽂으면)은 숙련자 — 종전 마감 그대로", () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    expect(turnDeadline(agent, sock)).toBe(40_000); // 30 + 10
  });

  it("초심자 좌석은 타패 80초(60 + 은행 20) · 증강 120초를 받는다", () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    agent.setPace("beginner");
    expect(turnDeadline(agent, sock)).toBe(80_000);
    expect(draftDeadline(agent, sock, "gameStart")).toBe(120_000);
    // 두 번째 스테이지도 같은 값 — 초심자는 첫 판만 넉넉할 이유가 없다.
    expect(draftDeadline(agent, sock, "eastThird")).toBe(120_000);
  });

  it("왕초보 좌석은 타패 330초(300 + 은행 30) · 증강 300초를 받는다", () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    agent.setPace("novice");
    expect(turnDeadline(agent, sock)).toBe(330_000);
    expect(draftDeadline(agent, sock, "gameStart")).toBe(300_000);
  });

  it("은행은 그 속도의 값으로 다시 찬다 (resetBank)", async () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    agent.setPace("beginner");
    // 유예(60초)를 5초 넘겨 두면 은행에서 그만큼만 깎인다.
    void agent.decide(prompt("p0", "discard"));
    await vi.advanceTimersByTimeAsync(65_000);
    agent.handleMessage({ type: "action", actionType: "discard", payload: {} } as never);
    await vi.advanceTimersByTimeAsync(0);
    expect(turnDeadline(agent, sock)).toBe(80_000 - 5_000);
    agent.resetBank();
    expect(turnDeadline(agent, sock)).toBe(80_000);
  });

  it("시간 연장의 천장도 속도를 따라간다 — 느린 방에서 손잡이가 죽지 않게", async () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    agent.setPace("novice");
    void agent.decide(prompt("p0", "discard"));
    // 남은 시간(330초)이 숙련자 천장(150초)보다 이미 크다 — 고정 천장이면 여기서
    // 연장이 아무 일도 못 한다.
    const r = agent.extendTime(60_000);
    expect(r?.leftMs).toBe(330_000 + 60_000);
  });

  it("답을 보내면 남은 시간은 그 자리에서 취소된다 (타패·증강 모두)", async () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    agent.setPace("novice");
    const turn = agent.decide(prompt("p0", "discard"));
    agent.handleMessage({ type: "action", actionType: "discard", payload: {} } as never);
    expect((await turn).type).toBe("discard");

    const draft = agent.decideDraft("gameStart" as any, [augment("a"), augment("b")]);
    agent.handleMessage({ type: "draftPick", augmentId: "b" } as never);
    expect(await draft).toBe("b");
    // 300초를 흘려도 이미 끝난 결정이 다시 답하지 않는다(폴백 없음).
    await vi.advanceTimersByTimeAsync(400_000);
  });
});
