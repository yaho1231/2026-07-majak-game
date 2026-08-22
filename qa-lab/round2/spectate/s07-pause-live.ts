/**
 * s07 — 일시정지가 실제 봇 탁자에서 어떻게 동작하는지 (docs/36 B1).
 *  · 봇까지 서는가 (뷰가 멈추는가)
 *  · 정지 중 조작이 GAME_PAUSED 로 거절되는가
 *  · 재개하면 이어지는가
 *  · liveGames 에 정지 표식이 실리는가
 *  · 정지시킨 관전자가 사라지면 어떻게 되는가
 */
import { admin, botTable, ok, sleep, autoPlay, signup } from "./lib.js";

const P = await signup();
autoPlay(P.c);
const code = await botTable(P.c, "tonpuu");
const A = await admin();
A.c.send({ type: "spectate", code });
await A.c.wait("spectateStarted", 8000);
await sleep(2000);

// ── 정지 ──
A.c.send({ type: "adminPauseGame", code, paused: true, reason: "QA 점검" });
const gp = await A.c.wait("gamePaused", 5000);
console.log("gamePaused(관전석):", JSON.stringify(gp));
await sleep(500); // 두 소켓 사이의 도착 순서는 보장이 없다
const gpP = P.c.last("gamePaused");
ok(gpP?.["paused"] === true, "대국자에게도 정지가 간다", gpP);

await sleep(1500);
const n0 = A.c.count("view");
const p0 = P.c.count("view");
await sleep(9000);
console.log(`정지 9초 동안 관전 뷰 ${A.c.count("view") - n0}장 · 대국자 뷰 ${P.c.count("view") - p0}장`);
ok(A.c.count("view") - n0 === 0, "정지 중에는 판이 한 칸도 움직이지 않는다 (봇 포함)");

// ── 정지 중 조작 ──
P.c.onMsg = null; // autoPlay 끄기
P.c.send({ type: "action", actionType: "pass", payload: {} });
P.c.send({ type: "roundContinue" });
await sleep(600);
const errs = P.c.log.filter((m) => m.type === "error" && m["code"] === "GAME_PAUSED");
ok(errs.length >= 2, "정지 중 조작은 GAME_PAUSED 로 거절된다", { n: errs.length });

// ── liveGames 표식 ──
A.c.send({ type: "liveGames" });
const lg = await A.c.waitNext("liveGames", 5000);
const row = (lg["rooms"] as any[]).find((r) => r.code === code);
ok(row?.paused === true, "liveGames 에 정지 표식", row);

// ── 정지 상태에서 관전자가 사라진다 ──
A.c.close();
await sleep(3000);
const B = await admin();
B.c.send({ type: "liveGames" });
const lg2 = await B.c.wait("liveGames", 5000);
const row2 = (lg2["rooms"] as any[]).find((r) => r.code === code);
console.log("관전자가 사라진 뒤에도 방은:", JSON.stringify(row2));
ok(row2 !== undefined && row2.paused === true, "정지한 관전자가 떠나도 판은 세워진 채로 남는다(설계상)");

// ── 재개 ──
autoPlay(P.c);
B.c.send({ type: "adminPauseGame", code, paused: false });
await P.c.waitNext((m) => m.type === "gamePaused" && m["paused"] === false, 5000);
const r0 = P.c.count("view");
await sleep(6000);
console.log(`재개 6초 동안 대국자 뷰 ${P.c.count("view") - r0}장`);
ok(P.c.count("view") - r0 > 0, "재개하면 판이 다시 흐른다");

P.c.close();
B.c.close();
await sleep(400);
process.exit(0);
