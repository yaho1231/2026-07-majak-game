/**
 * HumanAgent.awaitContinue — 국 사이 "다음 국으로" ack 게이트 단위 테스트.
 *
 * 결과 화면 닫힘(roundContinue) 신호로 resolve, maxWait 초과 시 자동 resolve,
 * 포기(abandon) 시 즉시 resolve 를 검증한다.
 */

import { describe, expect, it } from "vitest";
import type { WebSocket } from "ws";
import { HumanAgent, safeFallbackOption } from "../src/HumanAgent.js";

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

/**
 * 봇 좌석 조종(증강 테스트) — 한 소켓이 **좌석 두 개**의 결정을 동시에 기다릴 수 있다.
 * 리액션 프롬프트는 여러 자리에 동시에 나가므로, 단일 슬롯이면 나중 것이 앞의 것을
 * 덮어써 한쪽이 영원히 응답을 못 받는다.
 */
describe("HumanAgent — 좌석별 결정 대기 (봇 좌석 조종)", () => {
  const prompt = (player: string, ...types: string[]): any => ({
    player,
    options: types.map((t) => ({ type: t, payload: {} })),
  });

  it("내 좌석과 조종 중인 봇 좌석의 결정을 동시에 들고, seat으로 갈라 답한다", async () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Boss", sock.asWs());
    const mine = agent.decide(prompt("p0", "pass", "pon"));
    const bots = agent.decideAs("p2" as never, prompt("p2", "pass", "chi"));
    await tick();
    // 두 좌석의 프롬프트가 모두 나갔다
    expect(sock.sent.filter((m) => m.type === "prompt").map((m) => m.prompt.player))
      .toEqual(["p0", "p2"]);

    agent.handleMessage({ type: "action", actionType: "chi", payload: {}, seat: "p2" } as never);
    expect((await bots).type).toBe("chi");

    agent.handleMessage({ type: "action", actionType: "pon", payload: {}, seat: "p0" } as never);
    expect((await mine).type).toBe("pon");
  });

  it("seat 없이 온 응답은 내 좌석의 것으로 본다 (평소·구 클라이언트)", async () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Boss", sock.asWs());
    const mine = agent.decide(prompt("p0", "pass", "pon"));
    void agent.decideAs("p2" as never, prompt("p2", "pass"));
    agent.handleMessage({ type: "action", actionType: "pon", payload: {} } as never);
    expect((await mine).type).toBe("pon");
  });

  it("한 좌석만 취소해도 다른 좌석의 대기는 살아 있다", async () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Boss", sock.asWs());
    const mine = agent.decide(prompt("p0", "pass", "pon"));
    const bots = agent.decideAs("p2" as never, prompt("p2", "pass", "chi"));
    agent.cancelDecisionFor("p2" as never);
    expect((await bots).type).toBe("pass"); // 안전 폴백
    // 취소 통지에는 좌석이 실려, 클라이언트가 내 프롬프트를 지우지 않는다
    expect(sock.sent.filter((m) => m.type === "promptCancel")).toEqual([
      { type: "promptCancel", seat: "p2" },
    ]);
    agent.handleMessage({ type: "action", actionType: "pon", payload: {}, seat: "p0" } as never);
    expect((await mine).type).toBe("pon");
  });
});

/**
 * 등가교환은 대상을 지정하는 순간 상대 손패가 공개된다 — 시간이 다 됐다고 패스·쯔모기리로
 * 흘려보내면 "정보만 보고 교환은 안 한다"가 성립한다(2026-08-02 사용자 지시로 클라이언트의
 * 닫기 버튼도 없앴다). 폴백은 남은 조합 중 하나를 무작위로 골라 교환을 끝내야 한다.
 */
describe("safeFallbackOption — 되돌릴 수 없는 다단계 선택은 무작위로라도 끝맺는다", () => {
  const opt = (type: string, payload: unknown = {}): any => ({ type, payload });

  it("swap3_give/take 후보가 있으면 그중에서 고른다 (패스·버림보다 우선)", () => {
    for (const forced of ["swap3_give", "swap3_take"]) {
      const options = [
        opt("discard", { tileId: 1 }),
        opt("discard", { tileId: 2 }),
        opt(forced, { a: 1 }),
        opt(forced, { a: 2 }),
      ];
      for (let i = 0; i < 20; i++) {
        expect(safeFallbackOption(options).type).toBe(forced);
      }
    }
  });

  it("강제 후보가 없으면 종전대로 패스 > 마지막 버림 순이다", () => {
    expect(
      safeFallbackOption([opt("discard", { tileId: 1 }), opt("pass")]).type,
    ).toBe("pass");
    expect(
      safeFallbackOption([opt("discard", { tileId: 1 }), opt("discard", { tileId: 2 })])
        .payload,
    ).toEqual({ tileId: 2 });
  });
});
