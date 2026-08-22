/**
 * 동시성·경합 묶음.
 *  1) 대국 중 같은 계정 2중 접속 (다른 탭)
 *  2) 마지막 한 자리에 동시 입장
 *  3) 같은 액션 연타(중복 전송)
 *  4) 게임 종료 직후에 도착한 조작 (voteAbort/action)
 *  5) 일시정지 중 들어온 조작
 * 실행: tsx qa-lab/round2/server/t11-concurrency.ts   (임시 서버 3922)
 */
process.env.QA_WS = process.env.QA_WS ?? "ws://127.0.0.1:3922";
process.env.QA_HTTP = process.env.QA_HTTP ?? "http://127.0.0.1:3922";
const { C, signup, login, sleep, uniq, health, autoPlay } = await import("./lib.js");

const hdr = (s: string) => console.log("\n=== " + s + " ===");
const BAD: string[] = [];
const bad = (s: string) => { BAD.push(s); console.log("  ❌ " + s); };

// ── 1) 대국 중 같은 계정 2중 접속 ─────────────────────────────
hdr("1) 대국 중 같은 계정 2중 접속");
{
  const { c, name, pw } = await signup(uniq("T"));
  c.send({ type: "createRoom" });
  const rc = await c.wait("roomCreated", 60000);
  c.send({ type: "setGameMode", mode: "tonpuu" });
  for (let k = 0; k < 3; k++) { c.send({ type: "addBot" }); await sleep(60); }
  await sleep(300);
  c.send({ type: "startGame" });
  await c.wait((m) => m.type === "prompt" || m.type === "draftOffer", 90000);
  console.log("첫 프롬프트/드래프트 도착 — 이제 두 번째 탭으로 로그인한다");

  const { c: c2 } = await login(name, pw);
  await sleep(1200);
  console.log("탭1 살아있나?", !c.closed, c.closed ? JSON.stringify(c.closeInfo) : "");
  console.log("탭1 마지막 메시지:", c.log.slice(-3).map((m) => m.type + (m.code ? `(${m.code})` : "")).join(","));
  console.log("탭2가 받은 것:", c2.log.map((m) => m.type).join(","));
  // 탭2가 방 안으로 자동 복귀하는가?
  const active = c2.last("activeGame") ?? c2.last("joined");
  console.log("탭2 activeGame/joined:", active ? JSON.stringify(active).slice(0, 200) : "없음");
  c2.send({ type: "joinRoom", code: rc.code });
  const j = await c2.wait((m) => m.type === "joined" || m.type === "error", 20000).catch(() => null);
  console.log("탭2 joinRoom:", j ? j.type + " " + (j.code ?? j.playerId) : "무응답");
  if (j?.type === "joined" && !c.closed) {
    bad("같은 계정의 두 소켓이 동시에 같은 좌석에 붙어 있다 (탭1이 안 끊겼다)");
  }
  // 두 소켓이 동시에 액션을 보내면?
  autoPlay(c2);
  autoPlay(c);
  await sleep(4000);
  console.log("탭1 closed:", c.closed, "| 탭2 closed:", c2.closed);
  const h = await health();
  console.log("health", JSON.stringify(h.faults), "rooms", h.rooms);
  if (h.faults.uncaught > 0 || h.faults.rejection > 0) bad("2중 접속으로 서버 예외 발생: " + JSON.stringify(h.faults));
  c.send({ type: "voteAbort", vote: true }); c2.send({ type: "voteAbort", vote: true });
  await sleep(800);
  c.close(); c2.close();
}

// ── 2) 마지막 한 자리에 동시 입장 ─────────────────────────────
hdr("2) 마지막 한 자리에 동시 입장 (4명이 한꺼번에)");
{
  const host = await signup(uniq("A"));
  host.c.send({ type: "createRoom" });
  const rc = await host.c.wait("roomCreated", 30000);
  const others = await Promise.all([1, 2, 3, 4, 5].map(() => signup(uniq("B"))));
  // 전부 같은 tick 에 보낸다
  for (const o of others) o.c.send({ type: "joinRoom", code: rc.code });
  await sleep(2000);
  const ok = others.filter((o) => o.c.last("joined") !== undefined);
  const err = others.filter((o) => o.c.last("error") !== undefined);
  console.log(`joined ${ok.length} / error ${err.length} (기대: joined 3, error 2)`);
  const lob = host.c.last("lobby");
  const seats = lob?.players?.map((p: any) => p.id) ?? [];
  console.log("좌석:", seats.join(","), "인원", seats.length);
  if (seats.length > 4) bad(`방 정원(4)을 넘겼다 — ${seats.length}명`);
  if (new Set(seats).size !== seats.length) bad("같은 좌석 id 가 중복 배정됐다: " + seats.join(","));
  if (ok.length > 3) bad(`정원 초과 입장 허용 — joined ${ok.length}명`);
  for (const o of [host, ...others]) o.c.close();
}

// ── 3) 같은 액션 연타 ────────────────────────────────────────
hdr("3) 같은 액션 연타 (중복 전송 20회)");
{
  const { c } = await signup(uniq("D"));
  c.send({ type: "createRoom" });
  await c.wait("roomCreated", 30000);
  c.send({ type: "setGameMode", mode: "tonpuu" });
  for (let k = 0; k < 3; k++) { c.send({ type: "addBot" }); await sleep(60); }
  await sleep(300);
  c.send({ type: "startGame" });
  // 드래프트가 있으면 넘긴다
  let dbl = 0;
  c.onMsg = (m) => {
    if (m.type === "draftOffer") {
      // 같은 픽을 20번 보낸다
      for (let i = 0; i < 20; i++) c.send({ type: "draftPick", stage: m.stage, augmentId: m.choices[0].id });
      dbl++;
    } else if (m.type === "prompt") {
      const o = m.prompt.options?.find((x: any) => x.type === "discard") ?? m.prompt.options?.[0];
      if (o) for (let i = 0; i < 20; i++) c.send({ type: "action", actionType: o.type, payload: o.payload ?? {} });
    } else if (m.type === "roundOver") {
      for (let i = 0; i < 5; i++) c.send({ type: "roundContinue" });
    }
  };
  const over = await c.wait("gameOver", 240000).catch((e) => { console.log("  gameOver 대기 실패:", e.message); return null; });
  console.log("연타 드래프트 횟수:", dbl, "| gameOver:", over ? "정상" : "없음");
  const errs = c.log.filter((m) => m.type === "error");
  console.log("받은 error:", errs.slice(0, 6).map((m) => m.code).join(",") || "없음", `(총 ${errs.length})`);
  const h = await health();
  if (h.faults.uncaught > 0 || h.faults.rejection > 0) bad("연타로 서버 예외: " + JSON.stringify(h.faults));
  if (!over) bad("액션 연타 후 게임이 끝나지 않았다 (소프트락 의심)");
  // ── 4) 게임 종료 직후 도착한 조작 ──
  hdr("4) 게임 종료 직후 도착한 조작");
  c.onMsg = null;
  const before = c.log.length;
  c.send({ type: "voteAbort", vote: true });
  c.send({ type: "action", actionType: "discard", payload: { tileId: 1 } });
  c.send({ type: "roundContinue" });
  c.send({ type: "handOrder", tileIds: [1, 2, 3] });
  await sleep(1500);
  console.log("종료 직후 응답:", c.log.slice(before).map((m) => m.type + (m.code ? `(${m.code})` : "")).join(",") || "없음");
  const h2 = await health();
  console.log("health", JSON.stringify(h2.faults), "rooms", h2.rooms);
  if (h2.faults.uncaught > 0 || h2.faults.rejection > 0) bad("종료 직후 조작으로 서버 예외: " + JSON.stringify(h2.faults));
  c.close();
}

await sleep(500);
const fin = await health();
console.log("\n최종 health:", JSON.stringify(fin));
console.log(BAD.length === 0 ? "\n(이 묶음에서는 확정 이상 없음)" : `\n확정 후보 ${BAD.length}건:\n` + BAD.map((b) => " - " + b).join("\n"));
process.exit(0);
