/** lobby QA #1 — 방/대기실 기본 경로 훑기. */
import { newHarness, cleanup, reg, chk, summary, tick } from "./h.js";

const h = await newHarness();

// ── 1. 봇 강퇴 시 archetype 지정이 남는가 (removeBot과 비교) ──
{
  const host = await reg(h, "Host1");
  host.clientSend({ type: "createRoom" });
  await host.waitFor((m) => m.type === "lobby");
  const code = host.last("roomCreated").code;
  host.clientSend({ type: "addBot" });
  await tick();
  const bot = host.last("lobby").players.find((p: any) => p.isBot);
  host.clientSend({ type: "setBotArchetype", playerId: bot.playerId, archetype: "attacker" });
  await tick();
  const room: any = (h.rm as any).rooms.get(code);
  console.log("archetype set:", [...room.botArchetypes.entries()]);

  // kickPlayer 로 봇을 지운다
  host.clientSend({ type: "kickPlayer", playerId: bot.playerId });
  await tick();
  console.log("after kickPlayer, botArchetypes:", [...room.botArchetypes.entries()]);
  chk("kickPlayer(봇)이 botArchetypes 지정을 지운다", room.botArchetypes.size === 0,
    `남음: ${JSON.stringify([...room.botArchetypes.entries()])}`);

  // 다시 봇을 넣으면 같은 자리 id 에 지정이 되살아나는가
  host.clientSend({ type: "addBot" });
  await tick();
  const nb = host.last("lobby").players.find((p: any) => p.isBot);
  console.log("new bot after re-add:", nb.playerId, nb.archetype);
  chk("새 봇이 지운 봇의 성향을 물려받지 않는다",
    !(nb.playerId === bot.playerId && nb.archetype === "attacker"),
    `${nb.playerId} archetype=${nb.archetype}`);
}

// ── 2. 방 정원/없는 코드/이미 시작한 방 ──
{
  const a = await reg(h, "Cap1");
  a.clientSend({ type: "joinRoom", code: "ZZZZZZ" });
  await tick();
  chk("없는 코드 → ROOM_NOT_FOUND", a.last("error")?.code === "ROOM_NOT_FOUND", JSON.stringify(a.last("error")));
  a.clientSend({ type: "createRoom" });
  await a.waitFor((m) => m.type === "lobby");
  const code = a.last("roomCreated").code;
  const others = [];
  for (const n of ["Cap2", "Cap3", "Cap4"]) {
    const s = await reg(h, n);
    s.clientSend({ type: "joinRoom", code });
    await s.waitFor((m) => m.type === "joined" || m.type === "error");
    others.push(s);
  }
  const e = await reg(h, "Cap5");
  e.clientSend({ type: "joinRoom", code });
  await tick();
  chk("5번째 → ROOM_FULL", e.last("error")?.code === "ROOM_FULL", JSON.stringify(e.last("error")));
}

// ── 3. 방장 이탈 후 방장 승계 ──
{
  const a = await reg(h, "HostL");
  a.clientSend({ type: "createRoom" });
  await a.waitFor((m) => m.type === "lobby");
  const code = a.last("roomCreated").code;
  const b = await reg(h, "GuestL");
  b.clientSend({ type: "joinRoom", code });
  await b.waitFor((m) => m.type === "lobby");
  a.clientSend({ type: "leaveRoom" });
  await tick();
  const lob = b.last("lobby");
  chk("방장 이탈 → 남은 사람이 방장", lob.hostId === lob.youId, JSON.stringify(lob.players));
  chk("방장 이탈 → 떠난 사람이 목록에서 빠짐", lob.players.length === 1, JSON.stringify(lob.players.map((p:any)=>p.nickname)));
}

// ── 4. 강퇴당한 사람의 재입장 ──
{
  const a = await reg(h, "HostK");
  a.clientSend({ type: "createRoom" });
  await a.waitFor((m) => m.type === "lobby");
  const code = a.last("roomCreated").code;
  const b = await reg(h, "Victim");
  b.clientSend({ type: "joinRoom", code });
  await b.waitFor((m) => m.type === "lobby");
  const vid = b.last("lobby").youId;
  a.clientSend({ type: "kickPlayer", playerId: vid });
  await tick();
  chk("강퇴 통보 도착", b.last("kicked") !== undefined);
  b.clear();
  b.clientSend({ type: "joinRoom", code });
  await tick();
  chk("강퇴자 재입장 거부", b.last("error")?.code === "KICKED", JSON.stringify(b.last("error")));
}

summary();
await cleanup();
process.exit(0);
