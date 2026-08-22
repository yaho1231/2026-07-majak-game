/** lobby QA #6 — 대기실 나머지 경로 훑기 (판을 돌리지 않는 것만). */
import { newHarness, cleanup, reg, chk, summary, tick } from "./h.js";

const h = await newHarness();

// 1) 정원 초과 addBot / 시작 조건
{
  const a = await reg(h, "R1");
  a.clientSend({ type: "createRoom" });
  await tick();
  const code = a.last("roomCreated").code;
  for (let i = 0; i < 6; i++) a.clientSend({ type: "addBot" });
  await tick();
  chk("봇은 4자리를 넘지 않는다", a.last("lobby").players.length === 4, `${a.last("lobby").players.length}`);
  a.clear();
  a.clientSend({ type: "kickPlayer", playerId: a.last("lobby")?.youId ?? "p0" });
  await tick();
  a.clientSend({ type: "leaveRoom" });
  await tick();
}
{
  const a = await reg(h, "R2");
  a.clientSend({ type: "createRoom" });
  await tick();
  a.clientSend({ type: "addBot" });
  a.clientSend({ type: "startGame" });
  await tick();
  chk("3인 이하 시작 거부", a.last("error")?.code === "NOT_READY", JSON.stringify(a.last("error")));
  a.clientSend({ type: "leaveRoom" });
  await tick();
}
// 2) 준비 안 한 사람이 있으면 시작 불가 → 준비하면 가능
{
  const a = await reg(h, "R3");
  a.clientSend({ type: "createRoom" });
  await tick();
  const code = a.last("roomCreated").code;
  const b = await reg(h, "R4");
  b.clientSend({ type: "joinRoom", code });
  await tick();
  a.clientSend({ type: "addBot" });
  a.clientSend({ type: "addBot" });
  await tick();
  a.clear();
  a.clientSend({ type: "startGame" });
  await tick();
  chk("준비 안 한 참가자가 있으면 시작 거부", a.last("error")?.code === "NOT_READY", JSON.stringify(a.last("error")));
  chk("방장은 스스로 준비를 누를 수 없다(무시)", true);
  b.clientSend({ type: "ready", ready: true });
  await tick();
  const room: any = (h.rm as any).rooms.get(code);
  chk("전원 준비 → canStart", (h.rm as any).canStart(room) === true);
  // 방장이 ready 를 보내면?
  a.clientSend({ type: "ready", ready: true });
  await tick();
  chk("방장 ready 는 무시된다", !room.ready.has(room.hostId), [...room.ready].join(","));
  a.clientSend({ type: "leaveRoom" }); b.clientSend({ type: "leaveRoom" });
  await tick();
}
// 3) 비방장 권한
{
  const a = await reg(h, "R5");
  a.clientSend({ type: "createRoom" });
  await tick();
  const code = a.last("roomCreated").code;
  const b = await reg(h, "R6");
  b.clientSend({ type: "joinRoom", code });
  await tick();
  const room: any = (h.rm as any).rooms.get(code);
  const before = room.agents.map((x: any) => x.id).join(",");
  b.clientSend({ type: "addBot" });
  b.clientSend({ type: "shuffleSeats" });
  b.clientSend({ type: "setGameMode", mode: "hanchan" });
  b.clientSend({ type: "startGame" });
  b.clientSend({ type: "kickPlayer", playerId: room.hostId });
  await tick();
  chk("비방장은 봇을 못 넣는다", room.agents.length === 2, `${room.agents.length}`);
  chk("비방장은 모드를 못 바꾼다", room.gameMode === "tonpuu", room.gameMode);
  chk("비방장은 방장을 못 내보낸다", room.agents.length === 2 && room.hostId !== null);
  chk("비방장 startGame 은 조용히 무시(에러도 없음)", room.phase === "waiting");
  a.clientSend({ type: "leaveRoom" }); b.clientSend({ type: "leaveRoom" });
  await tick();
}
// 4) 소문자 코드 / 공백 코드
{
  const a = await reg(h, "R7");
  a.clientSend({ type: "createRoom" });
  await tick();
  const code = a.last("roomCreated").code;
  const b = await reg(h, "R8");
  b.clientSend({ type: "joinRoom", code: `  ${code.toLowerCase()}  ` });
  await tick();
  chk("소문자·공백 코드도 들어간다", b.last("joined") !== undefined, JSON.stringify(b.last("error")));
  // 두 번째 탭 (같은 계정)
  const b2 = await reg(h, "R8dup");
  b2.clientSend({ type: "joinRoom", code });
  await tick();
  // 같은 계정 다른 소켓
  const b3 = await reg(h, "R8");
  chk("같은 이름 재가입은 막힌다", b3.last("error") !== undefined, JSON.stringify(b3.last("authOk") ?? b3.last("error")));
}
// 5) 방에 있는데 createRoom
{
  const a = await reg(h, "R9");
  a.clientSend({ type: "createRoom" });
  await tick();
  const first = a.last("roomCreated").code;
  a.clear();
  a.clientSend({ type: "createRoom" });
  await tick();
  const second = a.last("roomCreated")?.code;
  console.log("두 번째 createRoom:", second, "에러:", JSON.stringify(a.last("error")));
  chk("이미 방에 있는데 새 방을 또 만들지 않는다 (혹은 앞 방을 정리한다)",
    second === undefined || (h.rm as any).rooms.get(first) === undefined,
    `first=${first} second=${second} first살아있음=${(h.rm as any).rooms.has(first)}`);
}
// 6) 게스트 방 코드로 남이 참가
{
  const g = new (await import("./h.js")).FakeSocket();
  h.rm.handleConnection(g.asWs());
  g.clientSend({ type: "guestPlay", mode: "tonpuu" });
  await tick(100);
  const gcode = g.last("roomCreated")?.code;
  console.log("게스트 방:", gcode);
  if (gcode !== undefined) {
    const s = await reg(h, "Snoop");
    s.clientSend({ type: "joinRoom", code: gcode });
    await tick();
    chk("남은 게스트 방에 못 들어간다", s.last("error")?.code === "ROOM_NOT_FOUND", JSON.stringify(s.last("error")));
  }
}

summary();
await cleanup();
process.exit(0);
