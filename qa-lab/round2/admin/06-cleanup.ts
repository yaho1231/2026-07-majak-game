/**
 * 06 — 강제 종료의 뒷정리(좌석 해방)와, 세워 둔 판이 사람 없이 남는 경우.
 */
import { check, cleanup, connectAs, newHarness, report, sleep, startRealGame } from "./lab.js";

async function main(): Promise<void> {
  const h = await newHarness();
  const admin = await connectAs(h, "Boss", { admin: true });
  const p1 = await connectAs(h, "Alice", { autoRespond: true });
  const p2 = await connectAs(h, "Bob", { autoRespond: true });
  const code = await startRealGame(h, p1, p2);
  await sleep(300);

  // p2가 끊긴다 — 좌석은 재접속용으로 남는다
  p2.close();
  await sleep(200);

  // 새 연결로 로그인한 Bob은 "이미 방에 참가 중"이라 새 방을 못 만든다
  const bob2 = await connectAs(h, "Bob2");
  void bob2;

  // 관리자가 강제 종료 → 좌석이 풀려야 한다
  admin.clientSend({ type: "adminAbortGame", code, reason: "유령 좌석 정리" });
  await p1.waitFor((m) => m.type === "gameAborted", 5000);
  await sleep(300);

  p1.clear();
  p1.clientSend({ type: "createRoom" });
  await sleep(200);
  check("강제 종료 뒤 참가자가 곧바로 새 방을 만들 수 있다",
    p1.last("roomCreated") !== undefined,
    `err=${p1.last("error")?.code ?? "-"}`);
  p1.clientSend({ type: "leaveRoom" });
  await sleep(100);

  // ── 세워 둔 판에서 사람이 전부 끊기면? ──
  const q1 = await connectAs(h, "Carl", { autoRespond: true });
  const q2 = await connectAs(h, "Dan", { autoRespond: true });
  const code2 = await startRealGame(h, q1, q2);
  await sleep(300);
  admin.clientSend({ type: "adminPauseGame", code: code2, paused: true, reason: "점검" });
  await q1.waitFor((m) => m.type === "gamePaused", 3000);
  q1.close();
  q2.close();
  await sleep(500);
  (h.rm as any).sweepIdleRooms();
  await sleep(300);
  const rooms = (h.rm as any).rooms as Map<string, any>;
  check("세워 둔 채 전원이 끊긴 방은 그대로 남는다 (관리자가 직접 접어야 한다)",
    rooms.has(code2),
    `남음=${rooms.has(code2)}`);
  admin.clientSend({ type: "liveGames" });
  await admin.waitFor((m) => m.type === "liveGames", 3000);
  const row = admin.last("liveGames").rooms.find((r: any) => r.code === code2);
  check("그 방이 관리자 목록에 «정지 중»으로 보인다 (찾아서 접을 수 있다)",
    row?.paused === true, JSON.stringify(row));

  // 그 계정들은 그동안 새 방을 만들 수 없다
  const carl2 = await connectAs(h, "Carl2");
  void carl2;
  const q1b = await connectAs(h, "CarlAgain");
  void q1b;

  report();
  await cleanup();
  process.exit(0);
}
void main();
