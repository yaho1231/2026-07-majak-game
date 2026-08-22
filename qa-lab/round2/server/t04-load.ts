/**
 * 부하·누수 계측 — 사람1+봇3 동풍전을 N판씩 R회전 연속으로 돌린다.
 * 매 회전마다 /healthz + 프로세스 RSS·핸들 수를 찍는다.
 */
import { C, signup, autoPlay, sleep, health, uniq } from "./lib.js";
import { execSync } from "node:child_process";

const PID = process.env.QA_PID!;
const N = Number(process.env.QA_N ?? 8);
const R = Number(process.env.QA_R ?? 4);

function proc(): string {
  try {
    const rss = execSync(`ps -o rss= -p ${PID}`).toString().trim();
    const fds = execSync(`lsof -p ${PID} 2>/dev/null | wc -l`).toString().trim();
    return `rss=${(Number(rss)/1024).toFixed(0)}MB fds=${fds}`;
  } catch { return "?"; }
}

let crashes = 0;
async function oneGame(i: number): Promise<string> {
  const { c, name } = await signup(uniq("L"));
  autoPlay(c);
  c.send({ type: "createRoom" });
  const rc = await c.wait("roomCreated", 15000);
  c.send({ type: "setGameMode", mode: "tonpuu" });
  for (let k = 0; k < 3; k++) { c.send({ type: "addBot" }); await sleep(40); }
  await sleep(150);
  c.send({ type: "startGame" });
  try {
    await c.wait("gameOver", 180000);
  } catch (e) {
    crashes++;
    return `#${i} ${rc.code} FAIL ${(e as Error).message}`;
  }
  const errs = c.log.filter((m) => m.type === "error");
  c.send({ type: "leaveRoom" });
  await sleep(50);
  c.close();
  return `#${i} ${rc.code} ok rounds=${c.count("roundOver")} errs=${errs.length ? JSON.stringify(errs.slice(0,3)) : 0}`;
}

console.log("start", proc(), JSON.stringify(await health()));
for (let r = 0; r < R; r++) {
  const t0 = Date.now();
  const res = await Promise.all(Array.from({ length: N }, (_, i) => oneGame(r * N + i).catch((e) => `#${i} THROW ${e.message}`)));
  console.log(res.join("\n"));
  await sleep(2000);
  console.log(`--- round ${r + 1}/${R} ${(Date.now()-t0)/1000}s ${proc()} ${JSON.stringify(await health())}`);
}
console.log("crashes:", crashes);
process.exit(0);
