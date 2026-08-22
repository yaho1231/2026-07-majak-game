/**
 * s03 — 일시정지 중 재접속이 «국간 결과 화면 대기» 시계를 되살린다.
 *
 * docs/36 §5(2차 일시정지)는 이렇게 적는다:
 *   "정지 중에 걸리는 새 타이머도 걸지 않는다 — 재접속 복원이 세워 둔 판의
 *    시계를 되살리던 구멍이다."
 * armDecision·armDraft·awaitContinue 는 실제로 `paused`를 본다. 그런데
 * `reconnect()` 안의 국간 대기 재무장만 그 검사가 없다.
 *
 *   HumanAgent.ts:353  if (this.pendingContinue !== null && this.continueTimeout === null) {
 *                        this.continueTimeout = setTimeout(() => this.resolveContinue(), ...)
 *
 * 실행: tsx qa-lab/round2/spectate/s03-pause-continue.ts   (서버 불필요)
 */
import type { WebSocket } from "ws";
import { HumanAgent } from "../../../packages/server/src/HumanAgent.js";

class Sock {
  readyState = 1;
  sent: any[] = [];
  send(d: string): void {
    this.sent.push(JSON.parse(d));
  }
  on(): void {}
  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── 1. 정지 중 재접속 → 국간 대기 시계가 되살아나는가 ──
{
  const a = new HumanAgent("p0", "Alice", new Sock().asWs());
  let done = false;
  void a.awaitContinue(600).then(() => (done = true));
  a.setPaused(true); // 관리자가 결과 화면에서 판을 세웠다
  await sleep(300);
  console.log("정지만 했을 때 600ms 지나기 전:", done);
  a.reconnect(new Sock().asWs()); // 대국자의 소켓이 한 번 끊겼다 붙는다
  await sleep(900);
  console.log(`정지 중인데 국간 대기가 스스로 풀렸는가: ${done}  ← true 면 버그`);
}

// ── 2. 대조군: 결정 제한 시간은 정지 중 재접속에도 서 있다 (armDecision 은 막는다) ──
{
  const a = new HumanAgent("p1", "Bob", new Sock().asWs());
  let chosen: unknown = null;
  void a
    .decide({ player: "p1", options: [{ type: "discard", payload: {} }] } as any)
    .then((o) => (chosen = o));
  a.setPaused(true);
  a.reconnect(new Sock().asWs());
  await sleep(800);
  console.log("대조군 — 결정은 정지 중 재접속에도 서 있는가:", chosen === null);
}

// ── 3. 재개 뒤 타이머가 두 개가 된다 (누수) ──
{
  const a = new HumanAgent("p2", "Carol", new Sock().asWs());
  let n = 0;
  void a.awaitContinue(400).then(() => n++);
  a.setPaused(true);
  a.reconnect(new Sock().asWs()); // ① 여기서 타이머가 하나 걸린다
  a.setPaused(false); // ② setPaused(false)가 pausedContinue 를 보고 하나 더 건다
  await sleep(1200);
  console.log("resolveContinue 호출 횟수(1이어야 정상):", n);
  console.log(
    "  ※ 두 타이머 중 늦게 남은 쪽은 «다음 국»의 결과 화면 대기를 조기 해소할 수 있다",
  );
}
process.exit(0);
