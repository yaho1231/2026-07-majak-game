/**
 * 02 — 일시정지/재개, 방 공지, 시간 연장, 국 무효, 강제 종료의 실동작·경계.
 */
import {
  check, cleanup, connectAs, newHarness, report, sleep, startRealGame, FakeSocket,
} from "./lab.js";

async function main(): Promise<void> {
  const h = await newHarness();
  const admin = await connectAs(h, "Boss", { admin: true });
  const p1 = await connectAs(h, "Alice", { autoRespond: true });
  const p2 = await connectAs(h, "Bob", { autoRespond: true });
  // 관리자는 대국에 끼지 않는다 — 별도 방을 Alice가 만든다
  const code = await startRealGame(h, p1, p2);
  await sleep(1500);
  const seat = p1.last("view").view.playerId as string;

  // ── 1. 일시정지가 봇까지 세우는가 ──
  const before = p1.all("view").length;
  admin.clientSend({ type: "adminPauseGame", code, paused: true, reason: "점검" });
  await p1.waitFor((m) => m.type === "gamePaused" && m.paused === true, 3000);
  check("일시정지 알림이 대국자에게 간다", p1.last("gamePaused")?.by === "Boss");
  const atPause = p1.all("view").length;
  await sleep(1500);
  const afterWait = p1.all("view").length;
  check("정지 중에는 판이 한 칸도 안 움직인다",
    afterWait === atPause, `views ${before}→${atPause}→${afterWait}`);

  // ── 2. 정지 중 중복 일시정지 → 응답이 있는가 ──
  admin.clear();
  admin.clientSend({ type: "adminPauseGame", code, paused: true, reason: "또" });
  await sleep(80);
  check("중복 일시정지에 서버가 아무 응답도 안 준다 (관리자 화면 desync 위험)",
    admin.sent.length > 0, `응답 ${JSON.stringify(admin.sent.map((m: any) => m.type))}`);

  // ── 3. 정지 중 조작 거부 ──
  const pending = p1.last("prompt") ?? p2.last("prompt");   // 재개 뒤 다시 눌러 볼 그 프롬프트
  p1.clear();
  p1.clientSend({ type: "action", actionType: "discard", payload: { tileId: 0 } });
  await sleep(80);
  check("정지 중 action은 GAME_PAUSED로 거절", p1.last("error")?.code === "GAME_PAUSED",
    p1.last("error")?.code ?? "무응답");

  // ── 4. 정지 중 방 공지 ──
  p1.clear();
  admin.clientSend({ type: "adminRoomNotice", code, text: "5분 뒤 재개", seconds: 300 });
  await p1.waitFor((m) => m.type === "roomNotice", 3000);
  check("방 공지가 대국자에게 닿는다", p1.last("roomNotice")?.text === "5분 뒤 재개");
  p1.clear();
  admin.clientSend({ type: "adminRoomNotice", code, text: "   " });
  await p1.waitFor((m) => m.type === "roomNotice", 3000);
  check("빈 글은 공지를 내린다", p1.last("roomNotice")?.text === "");

  // ── 5. 시간 연장 (정지 중) — 지금 실제로 기다리고 있는 좌석에 준다 ──
  const waitingSeat = (pending?.prompt?.player as string | undefined) ?? seat;
  admin.clear(); p1.clear(); p2.clear();
  admin.clientSend({ type: "adminExtendTime", code, seat: waitingSeat, seconds: 60 });
  await sleep(150);
  const ext = p1.last("promptExtended") ?? p2.last("promptExtended");
  check("시간 연장이 실제로 반영된다(promptExtended)",
    ext !== undefined,
    `기다리는 좌석=${waitingSeat} admin err=${admin.last("error")?.code ?? "-"}`);

  // ── 6. 재개 ──
  admin.clientSend({ type: "adminPauseGame", code, paused: false });
  await p1.waitFor((m) => m.type === "gamePaused" && m.paused === false, 3000);
  // 정지 중 거절당한 조작은 클라이언트가 다시 눌러야 한다 — 다시 보내면 판이 흐른다.
  p1.clear(); p2.clear();
  if (pending !== undefined) {
    const opts = pending.prompt.options as any[];
    const pick = opts.find((o: any) => o.type === "pass") ?? opts.find((o: any) => o.type === "discard") ?? opts[0];
    const who = pending.prompt.player === p2.last("view")?.view?.playerId ? p2 : p1;
    who.clientSend({ type: "action", actionType: pick.type, payload: pick.payload, seat: pending.prompt.player });
  }
  let flowed = false;
  try {
    await p1.waitFor((m) => m.type === "view" || m.type === "roundOver", 15_000);
    flowed = true;
  } catch { /* 흐르지 않았다 */ }
  check("재개하면 판이 다시 흐른다 (정지 중 거절된 조작을 다시 누르면 이어진다)",
    flowed, `views=${p1.all("view").length}`);

  // ── 7. 없는 방 조작 ──
  for (const cmd of [
    { type: "adminPauseGame", code: "ZZZZZZ", paused: true },
    { type: "adminRoomNotice", code: "ZZZZZZ", text: "x" },
    { type: "adminExtendTime", code: "ZZZZZZ", seat: "p0", seconds: 10 },
    { type: "adminVoidRound", code: "ZZZZZZ" },
    { type: "adminAbortGame", code: "ZZZZZZ" },
  ]) {
    admin.clear();
    admin.clientSend(cmd);
    await sleep(40);
    check(`없는 방 ${cmd.type} 거절`, admin.last("error") !== undefined,
      admin.last("error")?.code ?? "무응답");
  }

  // ── 8. 봇 좌석에 시간 연장 ──
  admin.clear();
  admin.clientSend({ type: "adminExtendTime", code, seat: "p3", seconds: 10 });
  await sleep(40);
  check("봇 좌석 연장은 거절", admin.last("error")?.code === "BAD_REQUEST",
    admin.last("error")?.code ?? "무응답");

  // ── 9. 없는 좌석 ──
  admin.clear();
  admin.clientSend({ type: "adminExtendTime", code, seat: "p9", seconds: 10 });
  await sleep(40);
  check("없는 좌석 연장은 거절", admin.last("error") !== undefined,
    admin.last("error")?.code ?? "무응답");

  // ── 10. 국 무효 ──
  p1.clear();
  const roundBefore = p1.last("view")?.view?.round ?? JSON.stringify(p1.last("view")?.view?.roundLabel);
  admin.clientSend({ type: "adminVoidRound", code });
  await sleep(1500);
  check("국 무효 안내가 대국자에게 간다",
    p1.all("roomNotice").some((m: any) => m.text.includes("물렸")),
    JSON.stringify(p1.all("roomNotice").map((m: any) => m.text)));

  // ── 11. 강제 종료 ──
  p1.clear(); p2.clear();
  admin.clientSend({ type: "adminAbortGame", code, reason: "테스트" });
  await p1.waitFor((m) => m.type === "gameAborted", 3000);
  check("강제 종료 사유가 실린다", (p1.last("gameAborted")?.reason ?? "").includes("테스트"),
    p1.last("gameAborted")?.reason);
  await sleep(200);

  // ── 12. 이미 끝난 방 재조작 ──
  for (const cmd of [
    { type: "adminAbortGame", code },
    { type: "adminPauseGame", code, paused: true },
    { type: "adminVoidRound", code },
    { type: "adminRoomNotice", code, text: "x" },
    { type: "spectate", code },
  ]) {
    admin.clear();
    admin.clientSend(cmd);
    await sleep(40);
    check(`끝난 방 ${cmd.type} 거절`, admin.last("error") !== undefined,
      admin.last("error")?.code ?? "무응답");
  }

  // 뒷정리 확인: 리플레이/게임 인덱스에 남지 않았는가
  const games = (h.db as any).listGames?.(1, 50) ?? [];
  check("강제 종료된 판은 게임 인덱스에 남지 않는다",
    !JSON.stringify(games).includes(code), JSON.stringify(games).slice(0, 200));

  report();
  await cleanup();
  process.exit(0);
}
void main();
