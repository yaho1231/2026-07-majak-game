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
import { DECISION_TIMEOUT_MS, EXTEND_LEFT_MAX_MS, HumanAgent } from "../src/HumanAgent.js";

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

  /**
   * **정지 중 재접속이 결과 화면 대기를 먹지 않는다** (QA 2차 spectate 확정 4).
   *
   * 형제 호출부 셋(`armDecision`·`armDraft`·`awaitContinue`)은 전부 `paused`를 먼저
   * 보는데 `reconnect()`의 국간 대기 재무장만 그 검사가 없었다. 그래서 정지 중에
   * 좌석 하나가 끊겼다 붙으면 결과 화면 대기가 **정지 중에** 정상 상한으로 다시 걸려
   * 그대로 만료됐다. 다음 국 시작 자체는 컨트롤러의 `gatePaused()`가 막아 주므로
   * 정지 중에 판이 넘어가지는 않지만, **재개하는 순간** 결과 화면이 0초 만에 사라지고
   * 다음 국이 시작된다.
   *
   * 대회에서 정지를 거는 이유의 절반이 "결과 화면을 띄워 놓고 해설한다"이다. 그 사이
   * 선수 한 명의 회선이 한 번만 끊겼다 붙어도(대회장 와이파이에서 흔하다) 중계가
   * 결과를 못 보여 준 채 넘어간다 — 정지가 길수록 반드시 만료되므로 사실상 100%다.
   *
   * 위 「정지 중 재접속이 시계를 되살리지 않는다」의 **결정 시계** 판박이인데, 국간
   * 대기만 빠져 있었다. 대조군(정지 없이 재접속하면 다시 걸린다)도 함께 둔다 —
   * 아니면 «그냥 안 거는 것»으로 고쳐도 이 테스트가 통과한다.
   */
  it("정지 중 재접속이 결과 화면 대기를 다시 걸지 않는다 (재개해야 이어진다)", async () => {
    vi.useFakeTimers();
    const agent = new HumanAgent("p0", "Alice", new FakeSocket().asWs());
    let done = false;
    void agent.awaitContinue(20_000).then(() => {
      done = true;
    });
    agent.setPaused(true);

    // 정지 한가운데에서 소켓이 한 번 끊겼다 붙는다.
    agent.reconnect(new FakeSocket().asWs());
    await vi.advanceTimersByTimeAsync(60_000);
    expect(
      done,
      "정지 중에 결과 화면 대기가 스스로 만료됐다 — 재개하는 순간 결과가 사라진다",
    ).toBe(false);

    // 재개하면 그제야 상한이 흐른다 — 통째로 사라지지도, 영영 서 있지도 않는다.
    agent.setPaused(false);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(done, "재개하자마자 결과 화면이 0초 만에 사라졌다").toBe(false);
    await vi.advanceTimersByTimeAsync(2_000);
    expect(done, "재개했는데 결과 화면 대기가 영영 안 끝난다").toBe(true);
  });

  /**
   * **정지 중에 끊긴 것만으로도 결과 화면이 사라지면 안 된다** (확정 4의 나머지 반쪽).
   *
   * `reconnect`만 고쳤을 때 실서버에서 여전히 샜다. 진짜 경로는 그 앞이었다:
   * `noticeDisconnect()`가 「화면 뒤에 아무도 없는데 기다릴 이유가 없다」며 국간 대기를
   * **즉시** 해소한다(2026-08-08 QA 2-6에서 일부러 넣은 것이다). 그 근거가 정지
   * 중에는 성립하지 않는다 — 결과 화면을 띄워 놓고 해설하려고 운영자가 일부러 세운
   * 것이고, 보고 있는 사람은 좌석이 아니라 중계석이다.
   *
   * 즉 이 결함은 **두 자리**였다: 끊길 때(여기)와 돌아올 때(위). 한쪽만 막으면
   * 다른 쪽으로 그대로 샌다.
   */
  it("정지 중 끊김이 결과 화면 대기를 즉시 해소하지 않는다", async () => {
    vi.useFakeTimers();
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    let done = false;
    void agent.awaitContinue(20_000).then(() => {
      done = true;
    });
    agent.setPaused(true);

    sock.readyState = 3; // CLOSED — 소켓이 끊겼다
    agent.noticeDisconnect();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(
      done,
      "정지 중 끊김이 결과 화면을 걷어 갔다 — 재개하는 순간 결말이 사라진다",
    ).toBe(false);

    agent.setPaused(false);
    await vi.advanceTimersByTimeAsync(21_000);
    expect(done, "재개했는데 대기가 영영 안 끝난다").toBe(true);
  });

  it("정지가 아닐 때의 끊김은 종전대로 즉시 해소한다 (대조군)", async () => {
    vi.useFakeTimers();
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    let done = false;
    void agent.awaitContinue(20_000).then(() => {
      done = true;
    });
    // 화면 뒤에 정말로 아무도 없다 — 남은 셋이 20초를 꽉 채울 이유가 없다.
    sock.readyState = 3;
    agent.noticeDisconnect();
    await vi.advanceTimersByTimeAsync(10);
    expect(done, "아무도 안 보는 결과 화면에 남은 셋이 붙들렸다").toBe(true);
  });

  it("정지가 아니면 재접속이 결과 화면 대기를 정상대로 다시 건다 (대조군)", async () => {
    vi.useFakeTimers();
    const agent = new HumanAgent("p0", "Alice", new FakeSocket().asWs());
    let done = false;
    void agent.awaitContinue(20_000).then(() => {
      done = true;
    });
    // 세워 둔 1인 방 경로(`suspend`)에서 돌아온 사람은 원래 상한으로 다시 걸려야 한다.
    agent.suspend(60_000);
    agent.reconnect(new FakeSocket().asWs());
    await vi.advanceTimersByTimeAsync(21_000);
    expect(done, "정지가 아닌데 결과 화면 대기가 다시 걸리지 않았다").toBe(true);
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

/**
 * 시간 연장 (docs/36 B3) — 판 전체를 세우지 않고 한 자리에만 몇 초를 준다.
 * 프롬프트를 다시 보내지 않는 것이 핵심이다: 클라이언트는 새 프롬프트를 «여기부터가
 * 진짜다»로 읽고 골라 둔 패를 비운다.
 */
describe("HumanAgent — 시간 연장", () => {
  it("기다리는 결정의 남은 시간에 더한다 (프롬프트를 다시 보내지 않는다)", async () => {
    vi.useFakeTimers();
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    let chosen: unknown = null;
    void agent.decide(prompt("p0", "discard")).then((o) => {
      chosen = o;
    });
    const promptsBefore = sock.sent.filter((m) => m.type === "prompt").length;

    await vi.advanceTimersByTimeAsync(10_000); // 20초 남았다
    const res = agent.extendTime(30_000);
    expect(res).toMatchObject({ kind: "decision", seat: "p0" });
    expect(res!.leftMs).toBeGreaterThan(45_000);
    expect(sock.sent.filter((m) => m.type === "prompt")).toHaveLength(promptsBefore);

    // 원래 마감(총 30초)을 지나도 살아 있어야 한다
    await vi.advanceTimersByTimeAsync(25_000);
    expect(chosen).toBeNull();
    await vi.advanceTimersByTimeAsync(30_000);
    expect(chosen).not.toBeNull();
  });

  it("아무것도 기다리지 않는 자리에는 줄 시계가 없다", () => {
    const agent = new HumanAgent("p0", "Alice", new FakeSocket().asWs());
    expect(agent.extendTime(30_000)).toBeNull();
  });

  it("세워 둔 판에서도 남은 시간이 늘어난다 (재개하면 늘어난 채로 흐른다)", async () => {
    vi.useFakeTimers();
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    let chosen: unknown = null;
    void agent.decide(prompt("p0", "discard")).then((o) => {
      chosen = o;
    });
    agent.setPaused(true);
    const res = agent.extendTime(30_000);
    expect(res!.leftMs).toBe(DECISION_TIMEOUT_MS + 30_000);
    // 정지 중에는 그 늘어난 시간도 흐르지 않는다
    await vi.advanceTimersByTimeAsync(DECISION_TIMEOUT_MS * 3);
    expect(chosen).toBeNull();

    agent.setPaused(false);
    await vi.advanceTimersByTimeAsync(DECISION_TIMEOUT_MS + 29_000);
    expect(chosen).toBeNull();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(chosen).not.toBeNull();
  });

  /**
   * **연타로 한 좌석을 무한히 붙들 수 없다** (QA 2차 server 의심 1 → 확정).
   *
   * 상한(`EXTEND_SECONDS_MAX`)은 «한 번에 주는 초»에만 걸려 있었고, `extendTime`은
   * `남은 시간 + 더 주는 시간`으로 타이머를 다시 건다. 그래서 관리자가 손잡이를
   * 연타하면 그 좌석의 결정 시한이 사실상 무한이 됐다 — 나머지 세 사람에게는
   * «판이 굳었다»와 구분되지 않는다. 그보다 길게 붙들어야 하는 상황을 위한 도구는
   * 따로 있다(일시정지). 잘린 사실은 돌려주는 `leftMs`에 그대로 드러난다.
   */
  it("연타해도 남은 시간이 천장을 넘지 않는다 (무한 연장 불가)", async () => {
    vi.useFakeTimers();
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    let chosen: unknown = null;
    void agent.decide(prompt("p0", "discard")).then((o) => {
      chosen = o;
    });

    let last = 0;
    for (let i = 0; i < 40; i++) {
      const res = agent.extendTime(120_000); // 매번 상한만큼 — 40번 연타
      expect(res).not.toBeNull();
      last = res!.leftMs;
    }
    expect(last, "연타가 천장을 넘겼다 — 한 좌석이 판 전체를 무한히 붙든다").toBeLessThanOrEqual(
      EXTEND_LEFT_MAX_MS,
    );
    // 그리고 천장까지는 실제로 올라간다 (손잡이가 죽으면 안 된다).
    expect(last).toBe(EXTEND_LEFT_MAX_MS);

    // 천장을 지나면 판은 다시 흐른다 — 영영 멈추지 않는다.
    await vi.advanceTimersByTimeAsync(EXTEND_LEFT_MAX_MS + 1_000);
    expect(chosen, "천장을 지나도 결정이 끝나지 않았다").not.toBeNull();
  });

  it("이미 천장 위인 시계를 줄이지는 않는다", async () => {
    vi.useFakeTimers();
    const sock = new FakeSocket();
    const agent = new HumanAgent("p0", "Alice", sock.asWs());
    void agent.decide(prompt("p0", "discard"));
    // 정지 중에 한 번에 천장을 훌쩍 넘겨 놓고(다른 경로로 커진 시계를 흉내 낸다)
    agent.setPaused(true);
    for (let i = 0; i < 3; i++) agent.extendTime(120_000);
    const atCap = agent.extendTime(1_000)!.leftMs;
    expect(atCap).toBe(EXTEND_LEFT_MAX_MS);
    // 한 번 더 걸어도 값이 **줄지 않는다** — 연장이 단축이 되면 그게 더 나쁘다.
    expect(agent.extendTime(1_000)!.leftMs).toBeGreaterThanOrEqual(atCap);
  });
});
