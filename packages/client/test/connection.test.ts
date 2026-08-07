/**
 * 소켓 수명 회귀 가드.
 *
 * 이 패키지에는 jsdom이 없어 실제 WebSocket을 태울 수 없다(a11yPerfGuards.test.ts와 같은 사정).
 * 대신 **한 줄만 지워도 조용히 되살아나는** 배선을 소스에서 못 박는다.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = readFileSync(join(HERE, "../src/App.tsx"), "utf8");

describe("소켓 close 처리 — 지나간 소켓이 살아 있는 소켓을 지우지 않는다", () => {
  it("close 핸들러가 '지금 쓰는 소켓인가'를 먼저 본다", () => {
    const at = APP.indexOf('ws.addEventListener("close"');
    expect(at).toBeGreaterThan(0);
    const body = APP.slice(at, at + 1400);
    // 이 가드가 없으면: 겹쳐 열린 옛 소켓의 close가 wsRef를 null로 만들고(=살아 있는
    // 소켓의 참조가 사라져 send가 조용히 버려진다) 재연결까지 예약해 소켓이 또 늘어난다.
    const guardAt = body.indexOf("if (wsRef.current !== ws) return;");
    const clearAt = body.indexOf("wsRef.current = null;");
    expect(guardAt).toBeGreaterThan(0);
    expect(guardAt).toBeLessThan(clearAt);
  });
});

/**
 * 재전송 정책의 **배선** — 정책 자체(분류·TTL·상한)는 resendPolicy.test.ts가 본다.
 * 여기서는 App이 그 정책을 실제로 부르고 있는지만 확인한다.
 */
describe("재전송 정책 — App 배선", () => {
  it("버려질 때 조용히 사라지지 않는다 — 토스트로 알린다 (ping 제외)", () => {
    const at = APP.indexOf("function send(");
    const body = APP.slice(at, at + 1600);
    expect(body).toContain('msg.type !== "ping" && !sendFailNotified.current');
    expect(body).toContain("showToast(");
  });

  it("큐는 인증이 끝난 뒤에 비운다 — 방 입장 같은 것이 미인증으로 거절되지 않게", () => {
    const at = APP.indexOf('if (msg.type === "authOk")');
    expect(at).toBeGreaterThan(0);
    expect(APP.slice(at, at + 600)).toContain("flushPendingSends()");
  });

  it("담을 때도 보낼 때도 정책 모듈을 거친다 (App이 규칙을 따로 갖지 않는다)", () => {
    const send = APP.slice(APP.indexOf("function send("), APP.indexOf("function flushPendingSends("));
    expect(send).toContain("isResendable(msg.type)");
    expect(send).toContain("enqueueSend(pendingSends.current, msg, Date.now())");
    const flush = APP.slice(APP.indexOf("function flushPendingSends("), APP.indexOf("function flushPendingSends(") + 600);
    expect(flush).toContain("dueForResend(queued, Date.now())");
  });
});
