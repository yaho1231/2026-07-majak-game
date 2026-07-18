/**
 * HumanAgent.awaitContinue — 국 사이 "다음 국으로" ack 게이트 단위 테스트.
 *
 * 결과 화면 닫힘(roundContinue) 신호로 resolve, maxWait 초과 시 자동 resolve,
 * 포기(abandon) 시 즉시 resolve 를 검증한다.
 */

import { describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import { HumanAgent } from "../src/HumanAgent.js";

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

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe("HumanAgent.awaitContinue — 다음 국 ack 게이트", () => {
  it("roundContinue 신호를 받으면 resolve 한다", async () => {
    const agent = new HumanAgent("p1", "Alice", new FakeSocket().asWs());
    let resolved = false;
    const p = agent.awaitContinue(10_000).then(() => {
      resolved = true;
    });
    await tick();
    expect(resolved).toBe(false); // 아직 신호 전
    agent.handleMessage({ type: "roundContinue" });
    await p;
    expect(resolved).toBe(true);
  });

  it("maxWait 초과 시 신호가 없어도 자동 resolve 한다 (AFK·끊김 안전망)", async () => {
    const agent = new HumanAgent("p1", "Alice", new FakeSocket().asWs());
    const start = Date.now();
    await agent.awaitContinue(20);
    expect(Date.now() - start).toBeGreaterThanOrEqual(15);
  });

  it("포기(abandon)한 좌석은 즉시 resolve 한다", async () => {
    const agent = new HumanAgent("p1", "Alice", new FakeSocket().asWs());
    agent.abandon();
    // 이미 포기 → 대기 없이 resolve
    await agent.awaitContinue(10_000);
  });

  it("대기 도중 포기하면 pending 대기가 즉시 해소된다", async () => {
    const agent = new HumanAgent("p1", "Alice", new FakeSocket().asWs());
    let resolved = false;
    const p = agent.awaitContinue(10_000).then(() => {
      resolved = true;
    });
    await tick();
    expect(resolved).toBe(false);
    agent.abandon();
    await p;
    expect(resolved).toBe(true);
  });
});
