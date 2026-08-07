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
