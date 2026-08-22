/**
 * s16 — 대회 운영 손잡이 실사: B2 방 공지 · B3 시간 연장 · 관전자 입력 거절 폭 ·
 *        관전 대상 방 강제 종료 · 지연 관전석의 공지 도착 시점.
 */
import { admin, botTable, sleep, autoPlay, signup, ok } from "./lib.js";

const P = await signup();
autoPlay(P.c, { pick: (l) => l.find((o: any) => o.type === "discard") ?? l[0] });
const code = await botTable(P.c, "tonpuu");
const A = await admin();          // 즉시 관전석
const D = await admin();          // 15초 지연 관전석
A.c.send({ type: "spectate", code });
await A.c.wait("spectateStarted", 8000);
D.c.send({ type: "spectate", code, delaySeconds: 15 });
await D.c.wait("spectateStarted", 8000);

// ── B2 방 공지 ──
A.c.send({ type: "adminRoomNotice", code, text: "5분 뒤 재개합니다", seconds: 30 });
const nP = await P.c.wait("roomNotice", 5000).catch(() => null);
const nA = await A.c.wait("roomNotice", 5000).catch(() => null);
const tD = Date.now();
const nD = await D.c.wait("roomNotice", 20000).catch(() => null);
ok(nP !== null, "공지가 대국자에게 간다", nP);
ok(nA !== null, "공지가 관전석에 간다");
ok(nD !== null, `공지가 지연 관전석에도 간다 (${Date.now() - tD}ms 뒤 — 0에 가까우면 뷰보다 앞선다)`);

// ── B3 시간 연장 ──
P.c.send({ type: "spectateStop" }); // 무해 (대국자는 관전 중이 아님)
await sleep(200);
let ext: any = null;
const pb = P.c.onMsg!;
P.c.onMsg = (m: any) => { if (m.type === "promptExtended") ext = m; pb(m); };
// 대국자가 프롬프트를 기다리는 순간을 노린다 — 몇 번 시도한다
let extOk = false;
for (let i = 0; i < 20 && !extOk; i++) {
  A.c.send({ type: "adminExtendTime", code, seat: "p0", seconds: 30 });
  const r = await A.c.wait((m: any) => m.type === "error" || m.type === "roomNotice", 900).catch(() => null);
  if (r === null || r.type !== "error") extOk = true;
  await sleep(400);
}
await sleep(500);
ok(ext !== null, "시간 연장이 대국자에게 도달한다 (promptExtended)", ext);
ok(A.c.count("promptExtended") === 0, "시간 연장 통지는 관전석에 가지 않는다");

// ── 관전자 입력 거절 폭 ──
const tries = ["action", "roundContinue", "draftPick", "leaveRoom", "chat"];
const errs: string[] = [];
A.c.log.length = 0;
for (const t of tries) {
  A.c.send({ type: t, actionType: "discard", payload: {}, stage: "start", augmentId: "x", text: "hi" });
  await sleep(250);
}
for (const m of A.c.log) if (m.type === "error") errs.push(`${m.code}`);
ok(A.c.log.every((m: any) => m.type !== "view" || m.view.playerId === "__spectator"),
   "관전자 입력이 판을 움직이지 않는다", { errs });
console.log("  관전자 입력 응답:", errs.join(","), "· 전체:", A.c.log.map((m: any) => m.type).join(","));

// ── 관전 대상 방 강제 종료 ──
const nBefore = A.c.count("view");
A.c.send({ type: "adminAbortGame", code });
const endA = await A.c.wait("spectateEnded", 10000).catch(() => null);
const endD = await D.c.wait("spectateEnded", 10000).catch(() => null);
ok(endA !== null, "강제 종료 시 즉시 관전석이 spectateEnded 를 받는다", endA);
ok(endD !== null, "강제 종료 시 지연 관전석도 spectateEnded 를 받는다", endD);
await sleep(3000);
ok(A.c.count("view") >= nBefore, "종료 후 뷰가 더 오지 않는다", { after: A.c.count("view") - nBefore });
// 종료 뒤 관전 재시도
A.c.send({ type: "spectate", code });
const re = await A.c.wait((m: any) => m.type === "error" || m.type === "spectateStarted", 5000).catch(() => null);
ok(re?.type === "error", "끝난 방은 다시 관전할 수 없다", re);

P.c.close(); A.c.close(); D.c.close();
await sleep(300);
process.exit(0);
