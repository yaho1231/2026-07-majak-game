/**
 * HumanAgent.awaitContinue — 국 사이 "다음 국으로" ack 게이트 단위 테스트.
 *
 * 결과 화면 닫힘(roundContinue) 신호로 resolve, maxWait 초과 시 자동 resolve,
 * 포기(abandon) 시 즉시 resolve 를 검증한다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { TIME_PRESSURE_CHANNEL, TIME_PRESSURE_SECONDS } from "@majak/content";
import {
  DECISION_TIMEOUT_MS,
  DISCONNECT_GRACE_MS,
  HumanAgent,
  safeFallbackOption,
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

  /**
   * 결과 화면이 스스로 닫히지 않게 되면서 서버 상한이 20초로 늘었다(index.ts).
   * 그만큼, 아무도 보고 있지 않은 끊긴 좌석 하나가 매 국 20초를 통째로 세우면
   * 나머지 셋이 그 값을 다 치른다 — 끊긴 좌석에는 애초에 닫을 화면이 없다.
   */
  it("소켓이 끊긴 좌석은 즉시 resolve 한다 (남은 셋을 붙잡지 않는다)", async () => {
    const sock = new FakeSocket();
    sock.readyState = 3; // CLOSED
    const agent = new HumanAgent("p1", "Alice", sock.asWs());
    const start = Date.now();
    await agent.awaitContinue(30_000);
    // 상한(30초)을 기다리지 않고 곧바로 통과한다
    expect(Date.now() - start).toBeLessThan(1_000);
  });

  it("접속 중인 좌석은 여전히 신호를 기다린다 (끊김 예외가 전부를 삼키지 않는다)", async () => {
    const agent = new HumanAgent("p1", "Alice", new FakeSocket().asWs());
    let resolved = false;
    void agent.awaitContinue(10_000).then(() => {
      resolved = true;
    });
    await tick();
    expect(resolved).toBe(false);
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
    // 취소 통지에는 좌석이 실려, 클라이언트가 내 프롬프트를 지우지 않는다.
    // 사유도 함께 간다 — 시간이 남았는데 접힌 것이므로 "더 높은 선언이 확정됐다"다.
    expect(sock.sent.filter((m) => m.type === "promptCancel")).toEqual([
      { type: "promptCancel", seat: "p2", reason: "preempted" },
    ]);
    agent.handleMessage({ type: "action", actionType: "pon", payload: {}, seat: "p0" } as never);
    expect((await mine).type).toBe("pon");
  });
});

/**
 * 등가교환은 대상을 지정하는 순간 상대 손패가 공개된다 — 시간이 다 됐다고 패스·쯔모기리로
 * 흘려보내면 "정보만 보고 교환은 안 한다"가 성립한다(2026-08-02 사용자 지시로 클라이언트의
 * 닫기 버튼도 없앴다). 폴백은 남은 조합 중 하나를 골라 교환을 끝내야 하고, 그 선택은
 * **후보 목록에서 결정론적으로** 나와야 한다(리플레이·resume 재현).
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

  it("같은 후보 목록이면 항상 같은 것을 고른다 — 리플레이·resume 재현 가능", () => {
    // Math.random을 쓰던 시절에는 타임아웃이 한 번만 끼어도 그 판을 재현할 수 없었다
    // (게임 경로의 유일한 비결정 지점, docs/25 시스템 횡단 #14).
    const options = [
      opt("discard", { tileId: 1 }),
      opt("swap3_give", { a: 1 }),
      opt("swap3_give", { a: 2 }),
      opt("swap3_give", { a: 3 }),
    ];
    const first = safeFallbackOption(options);
    for (let i = 0; i < 50; i++) {
      expect(safeFallbackOption(options)).toEqual(first);
    }
  });

  it("후보가 달라지면 고르는 것도 달라진다 — '항상 첫 번째'가 아니다", () => {
    // 후보 목록이 다르면 해시도 달라져, 상대가 결과를 내다볼 수 있는 고정 규칙이 아니다.
    const picked = new Set<string>();
    for (let n = 2; n <= 12; n++) {
      const options = Array.from({ length: n }, (_v, i) => opt("swap3_take", { a: i }));
      const chosen = safeFallbackOption(options) as { payload: { a: number } };
      picked.add(`${n}:${chosen.payload.a}`);
      // 항상 유효한 후보 안에서 고른다
      expect(chosen.payload.a).toBeGreaterThanOrEqual(0);
      expect(chosen.payload.a).toBeLessThan(n);
    }
    // 목록 크기별 선택이 전부 인덱스 0으로 쏠려 있지는 않다
    const zeros = [...picked].filter((k) => k.endsWith(":0")).length;
    expect(zeros).toBeLessThan(picked.size);
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

/**
 * 끊긴 좌석 — 게임 루프가 알아채야 한다 (QA P0-3).
 *
 * 탭을 닫으면 좌석은 남지만(재접속용) 아무도 그 사실을 게임 루프에 알려 주지 않아,
 * 남은 셋이 그 자리의 결정마다 30초를 꽉 채워 기다렸다. 한 국에 결정 지점이 60~70개다.
 */
describe("HumanAgent — 끊긴 좌석의 결정은 짧은 유예 뒤 자동 진행된다", () => {
  const prompt = (player: string, ...types: string[]): any => ({
    player,
    options: types.map((t) => ({ type: t, payload: {} })),
  });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("소켓이 닫혀 있으면 5초 유예 뒤 안전 폴백으로 끝난다 (30초가 아니다)", async () => {
    const sock = new FakeSocket();
    sock.readyState = 3; // CLOSED
    const agent = new HumanAgent("p0", "Ghost", sock.asWs());
    let done: any = null;
    void agent.decide(prompt("p0", "pass", "ron")).then((o) => (done = o));

    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_MS - 100);
    expect(done).toBeNull(); // 유예 안에는 아직 기다린다 (새로고침 복귀 여지)
    await vi.advanceTimersByTimeAsync(200);
    expect(done?.type).toBe("pass"); // 절대 론을 대신 선언하지 않는다
  });

  it("접속된 좌석은 종전대로 30초를 기다린다", async () => {
    const agent = new HumanAgent("p0", "Alice", new FakeSocket().asWs());
    let done: any = null;
    void agent.decide(prompt("p0", "pass", "ron")).then((o) => (done = o));
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_MS + 1000);
    expect(done).toBeNull();
    await vi.advanceTimersByTimeAsync(DECISION_TIMEOUT_MS);
    expect(done?.type).toBe("pass");
  });

  it("유예 안에 재접속하면 제한 시간이 정상(30초)으로 되돌아온다", async () => {
    const dead = new FakeSocket();
    dead.readyState = 3;
    const agent = new HumanAgent("p0", "Alice", dead.asWs());
    let done: any = null;
    void agent.decide(prompt("p0", "pass", "ron")).then((o) => (done = o));

    await vi.advanceTimersByTimeAsync(3000);
    const fresh = new FakeSocket();
    agent.reconnect(fresh.asWs());
    // 재전송된 프롬프트에는 되돌린 제한 시간이 실린다 (2초짜리 유령 프롬프트 금지)
    const resent = fresh.sent.filter((m) => m.type === "prompt");
    expect(resent).toHaveLength(1);
    expect(resent[0].deadlineMs).toBe(DECISION_TIMEOUT_MS);

    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_MS);
    expect(done).toBeNull(); // 유예 타이머는 해제됐다
    agent.handleMessage({ type: "action", actionType: "ron", payload: {} } as never);
    await vi.advanceTimersByTimeAsync(0);
    expect(done?.type).toBe("ron");
  });

  it("접속 중에 걸린 타이머는 재접속으로 늘어나지 않고 남은 시간만 알려 준다", async () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    void agent.decide(prompt("p0", "pass"));
    await vi.advanceTimersByTimeAsync(10_000);
    const fresh = new FakeSocket();
    agent.reconnect(fresh.asWs());
    const resent = fresh.sent.filter((m) => m.type === "prompt");
    expect(resent[0].deadlineMs).toBeGreaterThan(19_000);
    expect(resent[0].deadlineMs).toBeLessThanOrEqual(20_000);
  });

  it("포기(abandon)한 좌석은 유예도 없이 즉시 폴백한다", async () => {
    const agent = new HumanAgent("p0", "Alice", new FakeSocket().asWs());
    agent.abandon();
    expect((await agent.decide(prompt("p0", "pass", "pon"))).type).toBe("pass");
  });

  // 자동 선택은 **랜덤**이다(armDraft) — 자리를 비운 사람이 매번 맨 왼쪽 카드를 받아
  // 가지 않도록 2026-08-12에 바뀌었다. 그래서 어느 하나가 뽑혔는지만 본다.
  it("끊긴 좌석의 드래프트도 유예 뒤 자동 선택된다", async () => {
    const sock = new FakeSocket();
    sock.readyState = 3;
    const agent = new HumanAgent("p0", "Ghost", sock.asWs());
    let picked: string | null = null;
    void agent
      .decideDraft("gameStart", [{ id: "a" }, { id: "b" }] as never)
      .then((id) => (picked = id));
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_MS + 100);
    expect(["a", "b"]).toContain(picked);
  });
});

/** 제한 시간이 화면에 보여야 한다 (QA P0-5) — 안 보이면 자리를 비운 사람이 론을 흘린다. */
describe("HumanAgent — 마감(deadlineMs)은 모든 프롬프트에 실린다", () => {
  const prompt = (player: string, ...types: string[]): any => ({
    player,
    options: types.map((t) => ({ type: t, payload: {} })),
  });

  it("평범한 프롬프트에도 30초 마감이 실린다", () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    void agent.decide(prompt("p0", "discard"));
    const sent = sock.sent.find((m) => m.type === "prompt");
    expect(sent.deadlineMs).toBe(DECISION_TIMEOUT_MS);
  });

  it("초읽기(time_pressure)가 걸린 국에는 그 짧은 쪽이 이긴다", () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    agent.sendView({
      players: [{ id: "p0" }],
      augmentView: { [TIME_PRESSURE_CHANNEL]: TIME_PRESSURE_SECONDS },
    } as never);
    void agent.decide(prompt("p0", "discard"));
    const sent = sock.sent.find((m) => m.type === "prompt");
    expect(sent.deadlineMs).toBe(TIME_PRESSURE_SECONDS * 1000);
  });
});

/** 좌석 접속 상태는 뷰의 이름표로 실려 나간다 (QA P0-3b) — 새 메시지 타입 없이. */
describe("HumanAgent — 좌석 접속 상태가 PlayerView에 실린다", () => {
  it("끊김·기권이 players[].connection 으로 나간다", () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    agent.setSeatConnectionSource(() => ({
      p0: "connected",
      p1: "disconnected",
      p2: "abandoned",
    }));
    agent.sendView({ players: [{ id: "p0" }, { id: "p1" }, { id: "p2" }] } as never);
    const view = sock.sent.find((m) => m.type === "view").view;
    expect(view.players.map((p: any) => p.connection)).toEqual([
      "connected",
      "disconnected",
      "abandoned",
    ]);
  });

  it("전원이 정상이면 뷰를 건드리지 않는다 (불필요한 복사 없음)", () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    agent.setSeatConnectionSource(() => ({ p0: "connected" }));
    const original: any = { players: [{ id: "p0" }] };
    agent.sendView(original);
    expect(sock.sent.find((m) => m.type === "view").view.players[0].connection).toBeUndefined();
  });

  it("connectionState()는 소켓 상태와 포기 여부를 그대로 비춘다", () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    expect(agent.connectionState()).toBe("connected");
    sock.readyState = 3;
    expect(agent.connectionState()).toBe("disconnected");
    agent.abandon();
    expect(agent.connectionState()).toBe("abandoned"); // 기권이 끊김보다 우선
  });
});

/** 결정을 들고 있는 도중에 끊긴 경우 — 그 한 번도 30초를 세우면 안 된다. */
describe("HumanAgent.noticeDisconnect — 대기 중이던 결정도 유예로 줄인다", () => {
  const prompt = (player: string, ...types: string[]): any => ({
    player,
    options: types.map((t) => ({ type: t, payload: {} })),
  });

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("내 차례에 탭을 닫으면 남은 30초가 아니라 유예 뒤에 폴백한다", async () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    let done: any = null;
    void agent.decide(prompt("p0", "pass", "ron")).then((o) => (done = o));
    await vi.advanceTimersByTimeAsync(1000);
    sock.readyState = 3; // 소켓 사망
    agent.noticeDisconnect();
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_MS + 100);
    expect(done?.type).toBe("pass");
  });

  it("소켓이 살아 있으면 아무 것도 건드리지 않는다", async () => {
    const agent = new HumanAgent("p0", "Alice", new FakeSocket().asWs());
    let done: any = null;
    void agent.decide(prompt("p0", "pass")).then((o) => (done = o));
    agent.noticeDisconnect();
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_MS + 1000);
    expect(done).toBeNull();
  });

  it("줄인 뒤 재접속하면 정상 시간으로 되돌아온다", async () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    let done: any = null;
    void agent.decide(prompt("p0", "pass", "ron")).then((o) => (done = o));
    sock.readyState = 3;
    agent.noticeDisconnect();
    await vi.advanceTimersByTimeAsync(2000);
    const fresh = new FakeSocket();
    agent.reconnect(fresh.asWs());
    expect(fresh.sent.filter((m) => m.type === "prompt")[0].deadlineMs).toBe(
      DECISION_TIMEOUT_MS,
    );
    await vi.advanceTimersByTimeAsync(DISCONNECT_GRACE_MS);
    expect(done).toBeNull();
  });
});

/**
 * 리치를 선언한 상대의 손패는 건드릴 수 없다 — 서버가 한국어로 거절한다.
 *
 * 판정 자체는 증강의 validate(riichiBlocksSwap)가 하고, FlowController가 통과한 후보만
 * 프롬프트에 담으므로 리치 상대는 애초에 목록에 없다. 그래도 요청이 들어왔을 때
 * (구 화면·조작된 클라이언트) "화면을 새로 받아 주세요"는 거짓말이 된다 — 새로 받아도
 * 리치가 풀리기 전까지 그 상대는 영영 대상이 아니다.
 */
describe("HumanAgent — 리치 상대에게 손패 조작 증강을 쓰려 하면", () => {
  const prompt = (player: string, ...types: string[]): any => ({
    player,
    options: types.map((t) => ({ type: t, payload: {} })),
  });

  /** p1이 (보이는) 리치를 선언해 둔 뷰 */
  const riichiView = {
    players: [{ id: "p0" }, { id: "p1" }],
    round: { byPlayer: { p0: { riichiDeclared: false }, p1: { riichiDeclared: true } } },
  } as never;

  for (const actionType of ["hand_swap", "swap3", "seat_swap"]) {
    it(`${actionType} — 이유를 밝힌 한국어 오류로 거절한다`, () => {
      const sock = new FakeSocket();
      const agent = new HumanAgent("p0", "Alice", sock.asWs());
      agent.sendView(riichiView);
      void agent.decide(prompt("p0", "discard"));
      agent.handleMessage({ type: "action", actionType, payload: { target: "p1" } } as never);
      const err = sock.sent.filter((m) => m.type === "error").at(-1);
      expect(err.code).toBe("TARGET_IN_RIICHI");
      expect(err.message).toContain("리치");
    });
  }

  it("리치가 아닌 상대에게는 종전의 일반 오류가 나간다", () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    agent.sendView(riichiView);
    void agent.decide(prompt("p0", "discard"));
    agent.handleMessage({
      type: "action",
      actionType: "hand_swap",
      payload: { target: "p0" },
    } as never);
    expect(sock.sent.filter((m) => m.type === "error").at(-1).code).toBe("INVALID_ACTION");
  });

  /**
   * 숨은 리치(스텔스)는 남의 뷰에서 riichiDeclared가 false다 — 이 문구가 나가면
   * 그 자체가 "저 사람이 리치다"라는 누설이 된다.
   */
  it("숨은 리치는 이 문구를 끌어내지 못한다 (문구가 곧 누설이므로)", () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    agent.sendView({
      players: [{ id: "p0" }, { id: "p1" }],
      round: { byPlayer: { p1: { riichiDeclared: false } } },
    } as never);
    void agent.decide(prompt("p0", "discard"));
    agent.handleMessage({
      type: "action",
      actionType: "hand_swap",
      payload: { target: "p1" },
    } as never);
    expect(sock.sent.filter((m) => m.type === "error").at(-1).code).toBe("INVALID_ACTION");
  });
});

/**
 * 슬롯별 새로고침 (2026-08-17) — 마음에 안 드는 카드 한 장을 **한 번씩만** 갈아 끼운다.
 *
 * 교체분은 컨트롤러가 제시와 같은 추첨에서 미리 뽑아 넘긴다(좌석 간 겹침 금지가
 * 교체된 카드에도 걸린다 — 검증은 content/draft_reroll_diversity). 여기서 보는 것은
 * **좌석이 그 교체분을 어떻게 쓰는가**다: 슬롯당 1회, 화면과 서버의 후보가 어긋나지 않기,
 * 재접속·자동 선택이 갈아 낀 뒤의 화면을 따라가기.
 */
describe("HumanAgent — 드래프트 슬롯 새로고침", () => {
  const def = (id: string): any => ({ id, tier: "prism", name: id, description: `${id} 설명` });
  const CHOICES = [def("a"), def("b"), def("c")];
  const REROLLS = [def("x"), def("y"), def("z")];

  function armed(): { sock: FakeSocket; agent: HumanAgent; picked: () => string | null } {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    let picked: string | null = null;
    void agent.decideDraft("gameStart", CHOICES, REROLLS).then((id) => (picked = id));
    return { sock, agent, picked: () => picked };
  }

  it("제안에 슬롯별 새로고침 가능 여부가 실린다", () => {
    const { sock } = armed();
    const offer = sock.sent.find((m) => m.type === "draftOffer");
    expect(offer.rerollable).toEqual([true, true, true]);
  });

  it("새로고침하면 그 슬롯만 교체분으로 바뀐다", () => {
    const { sock, agent } = armed();
    agent.handleMessage({ type: "draftReroll", stage: "gameStart", slot: 1 } as never);
    const rerolled = sock.sent.filter((m) => m.type === "draftRerolled");
    expect(rerolled).toHaveLength(1);
    expect(rerolled[0].slot).toBe(1);
    expect(rerolled[0].choice.id).toBe("y");
  });

  it("같은 슬롯을 두 번은 못 간다 (연타해도 한 번)", () => {
    const { sock, agent } = armed();
    for (let i = 0; i < 5; i++) {
      agent.handleMessage({ type: "draftReroll", stage: "gameStart", slot: 0 } as never);
    }
    expect(sock.sent.filter((m) => m.type === "draftRerolled")).toHaveLength(1);
    expect(agent.rerolledDraftSlots()).toEqual([0]);
  });

  it("범위 밖·정수가 아닌 슬롯은 조용히 무시한다", () => {
    const { sock, agent } = armed();
    for (const slot of [-1, 3, 99, 1.5, NaN, "1" as never]) {
      agent.handleMessage({ type: "draftReroll", stage: "gameStart", slot } as never);
    }
    expect(sock.sent.filter((m) => m.type === "draftRerolled")).toHaveLength(0);
    expect(sock.sent.filter((m) => m.type === "error")).toHaveLength(0);
  });

  it("갈아 낸 옛 카드는 더 이상 픽할 수 없고, 새 카드는 픽된다", async () => {
    const { sock, agent, picked } = armed();
    agent.handleMessage({ type: "draftReroll", stage: "gameStart", slot: 2 } as never);
    // 화면에서 사라진 c
    agent.handleMessage({ type: "draftPick", stage: "gameStart", augmentId: "c" } as never);
    await tick();
    expect(picked()).toBeNull();
    expect(sock.sent.at(-1).code).toBe("INVALID_DRAFT_PICK");
    // 갈아 낀 z
    agent.handleMessage({ type: "draftPick", stage: "gameStart", augmentId: "z" } as never);
    await tick();
    expect(picked()).toBe("z");
  });

  it("자동 선택은 갈아 낀 뒤의 화면에서 고른다 (사라진 카드를 주지 않는다)", async () => {
    vi.useFakeTimers();
    try {
      const { agent, picked } = armed();
      agent.handleMessage({ type: "draftReroll", stage: "gameStart", slot: 0 } as never);
      agent.handleMessage({ type: "draftReroll", stage: "gameStart", slot: 1 } as never);
      agent.handleMessage({ type: "draftReroll", stage: "gameStart", slot: 2 } as never);
      await vi.advanceTimersByTimeAsync(DECISION_TIMEOUT_MS + 100);
      expect(["x", "y", "z"]).toContain(picked());
    } finally {
      vi.useRealTimers();
    }
  });

  it("재접속하면 갈아 낀 카드와 소진된 버튼이 그대로 복원된다", () => {
    const { agent } = armed();
    agent.handleMessage({ type: "draftReroll", stage: "gameStart", slot: 1 } as never);
    const fresh = new FakeSocket();
    agent.reconnect(fresh.asWs());
    const offer = fresh.sent.find((m) => m.type === "draftOffer");
    expect(offer.choices.map((c: any) => c.id)).toEqual(["a", "y", "c"]);
    expect(offer.rerollable).toEqual([true, false, true]);
  });

  it("대기 중이 아니면 새로고침 요청이 아무 일도 하지 않는다", () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    agent.handleMessage({ type: "draftReroll", stage: "gameStart", slot: 0 } as never);
    expect(sock.sent).toHaveLength(0);
  });

  it("교체분을 안 넘긴 판(봇 전용 경로)에서는 새로고침이 아예 없다", () => {
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    void agent.decideDraft("gameStart", CHOICES);
    expect(sock.sent.find((m) => m.type === "draftOffer").rerollable).toEqual([
      false,
      false,
      false,
    ]);
    agent.handleMessage({ type: "draftReroll", stage: "gameStart", slot: 0 } as never);
    expect(sock.sent.filter((m) => m.type === "draftRerolled")).toHaveLength(0);
  });

  it("다음 스테이지는 새로고침이 다시 3칸 모두 살아난다", async () => {
    const { agent } = armed();
    agent.handleMessage({ type: "draftReroll", stage: "gameStart", slot: 0 } as never);
    agent.handleMessage({ type: "draftPick", stage: "gameStart", augmentId: "x" } as never);
    await tick();
    const sock2 = new FakeSocket();
    agent.reconnect(sock2.asWs());
    void agent.decideDraft("eastThird", CHOICES, REROLLS);
    const offer = sock2.sent.filter((m) => m.type === "draftOffer").at(-1);
    expect(offer.rerollable).toEqual([true, true, true]);
    expect(agent.rerolledDraftSlots()).toEqual([]);
  });
});
