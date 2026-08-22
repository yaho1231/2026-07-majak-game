/**
 * s14 — 실서버: 「결과 화면에서 판을 세운다 → 대국자 소켓이 한 번 끊겼다 붙는다」
 *        → 정지 중인데 다음 국이 시작되는가.
 *
 * s03 은 HumanAgent 단위 재현이었다. 이건 그것이 실제 방에서도 일어나는지 본다.
 */
import { admin, botTable, sleep, autoPlay, signup, login, ok } from "./lib.js";

const P = await signup();
const name = P.name;
// roundOver 가 와도 roundContinue 를 **보내지 않는다** — 자동 대기 상한만 남긴다.
autoPlay(P.c, { pick: (l) => l.find((o: any) => o.type === "discard") ?? l[0] });
const oldOnMsg = P.c.onMsg!;
let roundOverAt = 0;
let autoContinueMs = 0;
P.c.onMsg = (m: any) => {
  if (m.type === "roundOver") { roundOverAt = Date.now(); autoContinueMs = m.autoContinueMs ?? 0; return; }
  oldOnMsg(m);
};

const code = await botTable(P.c, "tonpuu");
const A = await admin();
A.c.send({ type: "spectate", code });
await A.c.wait("spectateStarted", 8000);

console.log("첫 국이 끝나기를 기다린다…");
const t0 = Date.now();
while (roundOverAt === 0 && Date.now() - t0 < 180000) await sleep(500);
if (roundOverAt === 0) { console.log("roundOver 안 옴 — 중단"); process.exit(1); }
console.log(`roundOver 도착 · autoContinueMs=${autoContinueMs}`);

// 결과 화면이 떠 있는 동안 관리자가 판을 세운다
A.c.send({ type: "adminPauseGame", code, paused: true, reason: "QA 정지" });
await A.c.wait((m: any) => m.type === "gamePaused" && m.paused === true, 8000);
console.log("정지 걸었다");

// 대국자 소켓이 끊겼다 붙는다 (대회장 와이파이)
P.c.close();
await sleep(1500);
const R = await login(name);
autoPlay(R.c, { pick: (l) => l.find((o: any) => o.type === "discard") ?? l[0] });
const ro = R.c.onMsg!;
R.c.onMsg = (m: any) => { if (m.type === "roundOver") return; ro(m); };
R.c.send({ type: "joinRoom", code });
await R.c.wait((m: any) => m.type === "joined" || m.type === "view", 10000);
console.log("복귀했다");

// 다음 국이 시작되는지 본다 — 자동 대기 상한보다 넉넉히 기다린다
const wait = Math.max(12000, autoContinueMs + 6000);
let started = false;
let label0: string | null = null;
A.c.onMsg = (m: any) => {
  if (m.type !== "view") return;
  const lbl = `${m.view.round?.wind}-${m.view.round?.dealerSeat}-${m.view.round?.honba}#${m.view.round?.turnCount}`;
  if (label0 === null) { label0 = lbl; return; }
  if (m.view.phase !== "round.over") started = true;
};
await sleep(wait);
ok(!started, `정지 중에는 다음 국이 시작되지 않는다 (${wait}ms 대기, autoContinue=${autoContinueMs}ms)`, { started });
console.log("관전석 마지막 뷰 phase:", (A.c.log.filter((m: any) => m.type === "view").pop() as any)?.view?.phase);

R.c.close(); A.c.close();
await sleep(300);
process.exit(0);
