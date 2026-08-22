/**
 * 14 — 경합: 관리자 2명이 같은 방을, 그리고 정지 중 강제 종료 / 정지 중 국 무효.
 */
import { check, cleanup, connectAs, newHarness, report, sleep, startRealGame } from "./lab.js";

async function main(): Promise<void> {
  const h = await newHarness();
  const a1 = await connectAs(h, "Boss1", { admin: true });
  // 두 번째 관리자: 코드가 회전했으므로 DB를 직접 승급시킨다
  const a2 = await connectAs(h, "Boss2");
  (h.db as any).stmt("UPDATE users SET is_admin = 1 WHERE username = 'Boss2'").run();
  a2.clientSend({ type: "logout" });
  await sleep(50);
  const a2b = await connectAs(h, "Boss2b", { admin: false });
  // 대신 harness 의 adminCode 를 고정해 두 번째 관리자를 만든다
  const h2 = await newHarness({ adminCode: "FIXEDCODE" });
  const b1 = await connectAs(h2, "Boss1", { admin: true });
  const b2 = await connectAs(h2, "Boss2", { admin: true });
  const p1 = await connectAs(h2, "Alice", { autoRespond: true });
  const p2 = await connectAs(h2, "Bob", { autoRespond: true });
  const code = await startRealGame(h2, p1, p2);
  await sleep(800);

  // ① 두 관리자가 동시에 정지
  b1.clear(); b2.clear(); p1.clear();
  b1.clientSend({ type: "adminPauseGame", code, paused: true, reason: "B1" });
  b2.clientSend({ type: "adminPauseGame", code, paused: true, reason: "B2" });
  await sleep(300);
  const pauses = p1.all("gamePaused").filter((m: any) => m.paused === true);
  check("동시 정지 두 번이 이벤트 하나로 접힌다", pauses.length === 1,
    JSON.stringify(pauses));
  check("두 번째 관리자에게 «이미 서 있다»는 확인이 온다 (버튼이 «재개»로 바뀐다)",
    b2.sent.some((m: any) => m.type === "gamePaused" || m.type === "error"),
    JSON.stringify(b2.sent.map((m: any) => m.type)));

  // ② 정지 중 강제 종료
  b1.clear(); p1.clear();
  b1.clientSend({ type: "adminAbortGame", code, reason: "정지 중 종료" });
  let aborted = false;
  try { await p1.waitFor((m) => m.type === "gameAborted" || m.type === "roundOver", 5000); aborted = true; } catch { /* */ }
  check("세워 둔 판도 강제 종료로 접힌다 (굳은 방이 남지 않는다)", aborted,
    `err=${b1.last("error")?.code ?? "-"} 받은=${JSON.stringify(p1.sent.map((m: any) => m.type))}`);
  await sleep(300);
  check("강제 종료된 방이 실제로 사라졌다",
    !((h2.rm as any).rooms as Map<string, any>).has(code));

  report();
  await cleanup();
  process.exit(0);
}
void main();
