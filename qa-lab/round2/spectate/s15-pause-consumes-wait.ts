/**
 * s15 — 정지 중 재접속이 「결과 화면 대기」를 **정지 중에 다 써 버린다**.
 * 재개하는 순간 결과 화면이 즉시 사라지고 다음 국이 시작된다.
 *
 * 대조군: 재접속이 없으면 재개 후 남은 상한만큼 결과 화면이 유지되어야 한다.
 */
import { admin, botTable, sleep, autoPlay, signup, login, ok } from "./lib.js";

const RECONNECT = process.argv.includes("--reconnect");

const P = await signup();
const name = P.name;
autoPlay(P.c, { pick: (l) => l.find((o: any) => o.type === "discard") ?? l[0] });
const base = P.c.onMsg!;
let roundOverAt = 0, autoContinueMs = 0;
P.c.onMsg = (m: any) => {
  if (m.type === "roundOver") { if (roundOverAt === 0) { roundOverAt = Date.now(); autoContinueMs = m.autoContinueMs ?? 0; } return; }
  base(m);
};

const code = await botTable(P.c, "tonpuu");
const A = await admin();
A.c.send({ type: "spectate", code });
await A.c.wait("spectateStarted", 8000);

const t0 = Date.now();
while (roundOverAt === 0 && Date.now() - t0 < 180000) await sleep(500);
if (roundOverAt === 0) { console.log("roundOver 안 옴"); process.exit(1); }
console.log(`roundOver · autoContinueMs=${autoContinueMs}`);

// 결과 화면이 뜨자마자(=대기 상한이 거의 그대로 남은 채) 판을 세운다
A.c.send({ type: "adminPauseGame", code, paused: true, reason: "QA" });
await A.c.wait((m: any) => m.type === "gamePaused" && m.paused === true, 8000);
const pausedAt = Date.now();
console.log(`정지 — 결과 화면 뜬 지 ${pausedAt - roundOverAt}ms (남은 대기 ≈ ${autoContinueMs - (pausedAt - roundOverAt)}ms)`);

let live = P.c;
if (RECONNECT) {
  P.c.close();
  await sleep(1000);
  const R = await login(name);
  autoPlay(R.c, { pick: (l) => l.find((o: any) => o.type === "discard") ?? l[0] });
  const rb = R.c.onMsg!;
  R.c.onMsg = (m: any) => { if (m.type === "roundOver") return; rb(m); };
  R.c.send({ type: "joinRoom", code });
  await R.c.wait((m: any) => m.type === "joined" || m.type === "view", 10000);
  live = R.c;
  console.log("복귀했다");
}

// 정지를 상한보다 길게 유지한다
await sleep(autoContinueMs + 5000);
console.log(`정지 유지 ${Date.now() - pausedAt}ms — 그동안 새 국 시작 없음(관전 뷰 흐름 정지 확인)`);

// 재개 — 결과 화면이 얼마나 더 남는가
const nView = A.c.count("view");
A.c.send({ type: "adminPauseGame", code, paused: false });
await A.c.wait((m: any) => m.type === "gamePaused" && m.paused === false, 8000);
const resumedAt = Date.now();
let firstNewView = 0;
A.c.onMsg = (m: any) => { if (m.type === "view" && firstNewView === 0) firstNewView = Date.now(); };
await sleep(Math.min(autoContinueMs + 3000, 26000));
const held = firstNewView === 0 ? -1 : firstNewView - resumedAt;
console.log(`재개 후 첫 새 뷰까지: ${held}ms  (기대: 남은 대기 ≈ ${autoContinueMs - (pausedAt - roundOverAt)}ms 뒤)`);
ok(held < 0 || held > 3000, "재개 후에도 결과 화면 대기가 남아 있다", { heldMs: held, autoContinueMs });
void nView;
live.close(); A.c.close();
await sleep(300);
process.exit(0);
