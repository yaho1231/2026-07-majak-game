/**
 * 관리자 중계 일시정지 — 좌석의 시계 (docs/36 §7).
 *
 * 세운다는 것은 «아무 시계도 흐르지 않는다»는 뜻이다. 여기서 보는 것은 좌석이 든
 * 시계 셋이다: 결정 제한 시간 · 증강 드래프트 · 국 사이 결과 화면 대기.
 *
 * 세울 때 **대기 자체는 남긴다** — 화면에 떠 있는 선택창이 사라지면 안 되고,
 * 재개했을 때 그 자리에서 이어져야 한다. 그래서 남은 시간을 적어 두고 타이머만 뗀다.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { DECISION_TIMEOUT_MS, HumanAgent } from "../src/HumanAgent.js";

class FakeSocket {
  readyState = 1; // OPEN
  sent: any[] = [];
  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  on(): void {
    /* no-op */
  }
  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
  }
  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

const prompt = (player: string, ...types: string[]): any => ({
  player,
  options: types.map((t) => ({ type: t, payload: {} })),
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HumanAgent — 일시정지", () => {
  it("정지 중에는 결정 제한 시간이 흐르지 않는다 (재개하면 남은 시간 그대로)", async () => {
    vi.useFakeTimers();
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    let chosen: unknown = null;
    void agent.decide(prompt("p0", "discard")).then((o) => {
      chosen = o;
    });

    agent.setPaused(true);
    // 제한 시간의 두 배를 흘려보내도 아무 일이 없어야 한다.
    await vi.advanceTimersByTimeAsync(DECISION_TIMEOUT_MS * 2);
    expect(chosen).toBeNull();
    expect(sock.last("promptCancel")).toBeUndefined();

    agent.setPaused(false);
    // 정지 시점에 30초가 통째로 남아 있었으므로 그만큼이 그대로 남아 있다.
    await vi.advanceTimersByTimeAsync(DECISION_TIMEOUT_MS - 200);
    expect(chosen).toBeNull();
    await vi.advanceTimersByTimeAsync(400);
    expect(chosen).not.toBeNull();
    expect(sock.last("promptCancel")?.reason).toBe("timeout");
  });

  it("정지 중에는 국 사이 결과 화면 대기도 서 있다", async () => {
    vi.useFakeTimers();
    const agent = new HumanAgent("p0", "Alice", new FakeSocket().asWs());
    agent.setPaused(true);
    let done = false;
    void agent.awaitContinue(1_000).then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(done).toBe(false);

    agent.setPaused(false);
    await vi.advanceTimersByTimeAsync(1_200);
    expect(done).toBe(true);
  });

  it("정지 중 재접속이 시계를 되살리지 않는다", async () => {
    vi.useFakeTimers();
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    void agent.decide(prompt("p0", "discard"));
    agent.setPaused(true);

    // 돌아온 사람에게 화면은 복원되지만(프롬프트 재전송) 시계는 여전히 서 있어야 한다.
    const back = new FakeSocket();
    agent.reconnect(back.asWs());
    expect(back.last("prompt")).toBeDefined();

    await vi.advanceTimersByTimeAsync(DECISION_TIMEOUT_MS * 2);
    expect(back.last("promptCancel")).toBeUndefined();
    expect(sock.last("promptCancel")).toBeUndefined();
  });

  it("정지·재개를 같은 값으로 두 번 걸어도 시계가 겹쳐 걸리지 않는다", async () => {
    vi.useFakeTimers();
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    void agent.decide(prompt("p0", "discard"));
    agent.setPaused(true);
    agent.setPaused(true);
    agent.setPaused(false);
    agent.setPaused(false);
    await vi.advanceTimersByTimeAsync(DECISION_TIMEOUT_MS + 500);
    // 정확히 한 번만 만료된다 (타이머가 두 벌 걸렸다면 취소 메시지도 두 번 나간다)
    expect(sock.sent.filter((m) => m.type === "promptCancel")).toHaveLength(1);
  });
});
