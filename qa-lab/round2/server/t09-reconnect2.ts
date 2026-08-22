/** 드래프트 중 끊김·대기실 방장 이탈·강퇴 재입장 시나리오. */
process.env.QA_WS = process.env.QA_WS ?? "ws://127.0.0.1:3922";
process.env.QA_HTTP = process.env.QA_HTTP ?? "http://127.0.0.1:3922";
const { C, signup, login, sleep, uniq, health } = await import("./lib.js");

const hdr = (s: string) => console.log("\n=== " + s + " ===");

// ── 1) 드래프트 오퍼가 떠 있는 상태에서 소켓 단절 → 재접속 ──
hdr("1) 드래프트 중 끊김 → 재접속");
{
  const { c, name, pw } = await signup(uniq("D"));
  c.send({ type: "createRoom" });
  const rc = await c.wait("roomCreated", 60000);
  c.send({ type: "setGameMode", mode: "tonpuu" });
  for (let k = 0; k < 3; k++) { c.send({ type: "addBot" }); await sleep(60); }
  await sleep(300);
  c.send({ type: "startGame" });
  const offer = await c.wait("draftOffer", 90000);
  console.log("draftOffer 도착:", offer.choices.map((x: any) => x.id).join(","), "deadline", offer.deadlineMs, "rerollable", JSON.stringify(offer.rerollable));
  // 슬롯 0 새로고침을 한 번 쓴다 — 재접속 뒤에도 잠겨 있어야 한다
  c.send({ type: "draftReroll", stage: offer.stage, slot: 0 });
  const rr = await c.wait("draftRerolled", 20000).catch(() => null);
  console.log("draftRerolled:", rr ? `slot${rr.slot} -> ${rr.choice.id}` : "없음");
  await sleep(300);
  c.kill();
  await sleep(1200);
  const { c: c2 } = await login(name, pw);
  c2.send({ type: "joinRoom", code: rc.code });
  const j = await c2.wait((m) => m.type === "joined" || m.type === "error", 30000);
  console.log("재접속:", j.type, j.playerId ?? j.message);
  const offer2 = await c2.wait("draftOffer", 30000).catch((e) => { console.log("  ❌ 재접속 후 draftOffer 없음:", e.message); return null; });
  if (offer2) {
    console.log("  복원된 오퍼:", offer2.choices.map((x: any) => x.id).join(","), "deadline", offer2.deadlineMs, "rerollable", JSON.stringify(offer2.rerollable));
    const same = JSON.stringify(offer2.choices.map((x: any) => x.id));
    const expect = JSON.stringify(offer.choices.map((x: any, i: number) => (rr && i === rr.slot ? rr.choice.id : x.id)));
    console.log("  카드 동일?", same === expect, same, expect);
  }
  c2.send({ type: "leaveRoom" });
  await sleep(200);
  c2.close();
}

// ── 2) 대기실 방장 이탈 → 방장 승계 ──
hdr("2) 대기실 방장 이탈 → 승계");
{
  const a = await signup(uniq("H"));
  const b = await signup(uniq("G"));
  a.c.send({ type: "createRoom" });
  const rc = await a.c.wait("roomCreated", 30000);
  b.c.send({ type: "joinRoom", code: rc.code });
  await b.c.wait("joined", 20000);
  await sleep(400);
  const lob0 = b.c.last("lobby");
  console.log("초기 host:", lob0?.hostId, "players", lob0?.players?.map((p: any) => p.nickname).join(","));
  a.c.send({ type: "leaveRoom" });
  await sleep(700);
  const lob1 = b.c.last("lobby");
  console.log("방장 이탈 후 host:", lob1?.hostId, "players", lob1?.players?.map((p: any) => p.nickname).join(","));
  // 새 방장이 실제로 봇 추가·시작을 할 수 있나
  b.c.send({ type: "addBot" });
  await sleep(400);
  console.log("새 방장 addBot 반영:", b.c.last("lobby")?.players?.length);

  // ── 3) 강퇴 후 재입장 ──
  hdr("3) 강퇴 → 같은 방 재입장 시도");
  const d = await signup(uniq("K"));
  d.c.send({ type: "joinRoom", code: rc.code });
  await d.c.wait("joined", 20000);
  await sleep(300);
  const dSeat = d.c.last("joined")!.playerId;
  b.c.send({ type: "kickPlayer", playerId: dSeat });
  await sleep(600);
  console.log("강퇴 대상 받은 것:", d.c.log.slice(-2).map((m) => m.type + (m.code ? `(${m.code})` : "")).join(","));
  d.c.send({ type: "joinRoom", code: rc.code });
  const re = await d.c.wait((m) => m.type === "error" && m.code === "KICKED", 10000).catch(() => null);
  console.log("재입장 결과:", re ? "KICKED (기대대로)" : "❌ 막히지 않았다: " + d.c.log.slice(-2).map((m) => m.type).join(","));
  for (const x of [a.c, b.c, d.c]) x.close();
}

console.log("\nhealth", JSON.stringify(await health()));
process.exit(0);
