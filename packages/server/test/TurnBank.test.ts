/**
 * 초읽기 은행 — 매 순 유예 + 국마다 차는 은행.
 *
 * 규칙(사용자 확정):
 * - 매 순 기본 유예. 그 안에 두면 은행은 그대로다.
 * - 유예를 넘긴 만큼만 은행에서 깎이고, 그 차감은 순이 바뀌어도 되돌아오지 않는다.
 * - 은행이 바닥나면 그 뒤로는 순마다 유예 안에 둬야 한다.
 * - 국이 바뀌면 은행을 다시 채운다(`resetBank`).
 *
 * ⚠ **숫자를 박지 않는다.** 실제 값은 방이 고른 속도(`ROOM_PACES`)가 정하고 여기
 * 상수는 «숙련자» 칸을 읽을 뿐이라(2026-08-27부터 30 + 10초), 이 파일이 검사하는
 * 것은 값이 아니라 **구조**다. 속도별 실제 값은 `RoomPace.test.ts`가 못박는다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { HumanAgent, TURN_BANK_MS, TURN_GRACE_MS } from "../src/HumanAgent.js";

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

/** 한 순을 `elapsed`ms 만에 두고, 그 순에 실렸던 마감을 돌려준다. */
const playTurn = async (
  agent: HumanAgent,
  sock: FakeSocket,
  elapsed: number,
): Promise<number> => {
  sock.sent.length = 0;
  void agent.decide(prompt("p0", "discard"));
  const deadline = sock.sent.find((m) => m.type === "prompt").deadlineMs;
  await vi.advanceTimersByTimeAsync(elapsed);
  agent.handleMessage({ type: "action", actionType: "discard", payload: {} } as never);
  await vi.advanceTimersByTimeAsync(0);
  return deadline;
};

describe("HumanAgent — 초읽기 은행(매 순 유예 + 국마다 차는 은행)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("유예 안에 두면 은행이 줄지 않는다", async () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    expect(await playTurn(agent, sock, TURN_GRACE_MS - 2_000)).toBe(TURN_GRACE_MS + TURN_BANK_MS);
    expect(await playTurn(agent, sock, TURN_GRACE_MS - 1_000)).toBe(TURN_GRACE_MS + TURN_BANK_MS);
  });

  it("유예를 넘긴 만큼만 깎이고, 다음 순에 되돌아오지 않는다", async () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    // 유예 + 5초 사용 → 초과분 5초만 은행에서 빠진다.
    await playTurn(agent, sock, TURN_GRACE_MS + 5_000);
    expect(await playTurn(agent, sock, 1_000)).toBe(TURN_GRACE_MS + (TURN_BANK_MS - 5_000));
    // 빨리 뒀다고 은행이 다시 차지는 않는다.
    expect(await playTurn(agent, sock, 1_000)).toBe(TURN_GRACE_MS + (TURN_BANK_MS - 5_000));
  });

  it("은행을 다 쓰면 그 뒤로는 매 순 유예뿐이다", async () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    await playTurn(agent, sock, TURN_GRACE_MS + TURN_BANK_MS - 1_000);
    expect(await playTurn(agent, sock, 1_000)).toBe(TURN_GRACE_MS + 1_000);
    await playTurn(agent, sock, TURN_GRACE_MS + 1_000);
    expect(await playTurn(agent, sock, 1_000)).toBe(TURN_GRACE_MS);
  });

  it("국이 바뀌면(resetBank) 은행이 다시 찬다", async () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    await playTurn(agent, sock, TURN_GRACE_MS + TURN_BANK_MS - 5_000);
    expect(await playTurn(agent, sock, 1_000)).toBeLessThan(TURN_GRACE_MS + TURN_BANK_MS);
    agent.resetBank();
    expect(await playTurn(agent, sock, 1_000)).toBe(TURN_GRACE_MS + TURN_BANK_MS);
  });
});
