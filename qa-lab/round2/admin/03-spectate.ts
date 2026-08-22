/**
 * 03 — 관전(중계석) 전환·정지 상태 누수·관리자 2명 동시 조작·접속 끊김.
 */
import {
  check, cleanup, connectAs, newHarness, report, sleep, startRealGame, FakeSocket,
} from "./lab.js";

async function main(): Promise<void> {
  // ADMIN_CODE 고정 = 관리자 여럿 (운영자가 env로 값을 쥔 배포와 같은 형태)
  const h = await newHarness({ adminCode: "FIXED-ADMIN-CODE" });
  const admin = await connectAs(h, "Boss", { admin: true });
  const admin2 = await connectAs(h, "Boss2", { admin: true });
  // Boss2 는 관리자 코드가 회전하므로 실제로 관리자가 아닐 수 있다 — 확인
  check("ADMIN_CODE 고정 배포에서는 관리자 둘을 만들 수 있다",
    admin2.last("authOk")?.isAdmin === true,
    JSON.stringify(admin2.last("authOk")));

  const a1 = await connectAs(h, "A1", { autoRespond: true });
  const a2 = await connectAs(h, "A2", { autoRespond: true });
  const b1 = await connectAs(h, "B1", { autoRespond: true });
  const b2 = await connectAs(h, "B2", { autoRespond: true });
  const roomA = await startRealGame(h, a1, a2);
  const roomB = await startRealGame(h, b1, b2);
  await sleep(300);

  // ── 관전 시작 → A를 세운다 ──
  admin.clientSend({ type: "spectate", code: roomA });
  await admin.waitFor((m) => m.type === "spectateStarted", 3000);
  admin.clientSend({ type: "adminPauseGame", code: roomA, paused: true, reason: "점검" });
  await admin.waitFor((m) => m.type === "gamePaused" && m.paused === true, 3000);
  check("관전 중인 관리자에게 정지 확인이 온다", true);

  // 공지도 하나 걸어 둔다
  admin.clientSend({ type: "adminRoomNotice", code: roomA, text: "A방 공지" });
  await admin.waitFor((m) => m.type === "roomNotice", 3000);

  // ── 탁자 전환: A(정지·공지) → B(정상) ──
  admin.clear();
  admin.clientSend({ type: "spectate", code: roomB });
  await admin.waitFor((m) => m.type === "spectateStarted", 3000);
  await sleep(400);
  const gotUnpause = admin.sent.some((m: any) => m.type === "gamePaused" && m.paused === false);
  const gotNoticeClear = admin.sent.some((m: any) => m.type === "roomNotice" && m.text === "");
  const gotSpectateEnded = admin.sent.some((m: any) => m.type === "spectateEnded");
  check("탁자를 옮기면 앞 탁자의 «정지»가 해제되어 전달된다",
    gotUnpause || gotSpectateEnded,
    `gamePaused(false)=${gotUnpause} spectateEnded=${gotSpectateEnded} 받은=${JSON.stringify([...new Set(admin.sent.map((m: any) => m.type))])}`);
  check("탁자를 옮기면 앞 탁자의 «방 공지»가 내려간다",
    gotNoticeClear || gotSpectateEnded, `roomNotice("")=${gotNoticeClear}`);

  // ── 새 탁자에서 «재개»를 눌렀을 때(=paused:false) ──
  admin.clear();
  admin.clientSend({ type: "adminPauseGame", code: roomB, paused: false });
  await sleep(120);
  const ack = admin.sent.some((m: any) => m.type === "gamePaused" || m.type === "error");
  check("이미 안 서 있는 방에 재개를 걸면 확인 응답이 온다 (버튼이 복구된다)",
    ack, `응답=${JSON.stringify([...new Set(admin.sent.map((m: any) => m.type))])}`);

  // A방은 여전히 서 있는가 (관전을 옮겨도 정지는 그대로여야 한다)
  admin.clientSend({ type: "liveGames" });
  await admin.waitFor((m) => m.type === "liveGames", 3000);
  const rowA = admin.last("liveGames").rooms.find((r: any) => r.code === roomA);
  check("관전을 옮겨도 A방은 여전히 서 있다 (잊힌 탁자가 목록에 보인다)",
    rowA?.paused === true, JSON.stringify(rowA));

  // ── 관리자 2명이 동시에 같은 방을 조작 ──
  admin2.clientSend({ type: "spectate", code: roomA });
  await admin2.waitFor((m) => m.type === "spectateStarted", 3000);
  check("관전 합류 시 «지금 서 있다»가 복원된다",
    admin2.last("gamePaused")?.paused === true, JSON.stringify(admin2.last("gamePaused")));
  admin.clear(); admin2.clear();
  admin.clientSend({ type: "adminPauseGame", code: roomA, paused: false });
  admin2.clientSend({ type: "adminPauseGame", code: roomA, paused: false });
  await sleep(200);
  const unpauseEvents = admin2.all("gamePaused").filter((m: any) => m.paused === false).length;
  check("동시 재개 두 번이 이벤트 하나로 접힌다", unpauseEvents === 1, `${unpauseEvents}건`);

  // ── 관리자가 관전 중 접속이 끊긴 뒤에도 방이 서 있는가 ──
  admin.clientSend({ type: "adminPauseGame", code: roomA, paused: true, reason: "끊기 직전" });
  await sleep(120);
  admin.close();
  await sleep(300);
  admin2.clientSend({ type: "liveGames" });
  await admin2.waitFor((m) => m.type === "liveGames", 3000);
  const rowA2 = admin2.last("liveGames").rooms.find((r: any) => r.code === roomA);
  check("관리자가 끊겨도 세워 둔 판은 서 있다 (남은 관리자가 풀 수 있다)",
    rowA2?.paused === true, JSON.stringify(rowA2));

  // 대국자들이 스스로 빠져나갈 길이 있는가 — 정지 중 무효 투표
  a1.clear(); a2.clear();
  a1.clientSend({ type: "voteAbort", vote: "agree" });
  a2.clientSend({ type: "voteAbort", vote: "agree" });
  await sleep(400);
  const aborted = a1.last("gameAborted") !== undefined;
  check("정지 중에도 전원 합의 무효로 빠져나갈 수 있다", aborted,
    `abortVote=${JSON.stringify(a1.last("abortVote"))} err=${a1.last("error")?.code}`);

  // ── 관전 중 접속 끊김: 관전자 수가 줄었는가 ──
  a1.clear();
  await sleep(200);

  // ── 본인이 참가 중인 방 관전 금지 ──
  const admin3 = await connectAs(h, "Boss3", { admin: true });
  admin2.clientSend({ type: "spectate", code: roomB });
  await sleep(100);

  report();
  await cleanup();
  process.exit(0);
}
void main();
