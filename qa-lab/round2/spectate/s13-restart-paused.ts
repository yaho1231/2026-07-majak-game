/**
 * s13 — 세워 둔 판이 있는 채로 서버를 재시작한다.
 *
 * 대회 중 «판을 세워 놓고 서버를 손본다»는 실제로 있는 순간이다.
 * 확인할 것: 종료가 걸리지 않는가(정지 게이트에 매달린 컨트롤러가 shutdown 을
 * 막지 않는가), 대국자·관전자가 이유를 듣는가, 리플레이가 남는가.
 *
 * 이 스크립트는 판을 세운 뒤 그대로 둔다. 호출자가 서버에 SIGTERM 을 보내고
 * 종료 시간을 잰다.
 */
import { admin, botTable, sleep, autoPlay, signup } from "./lib.js";

const P = await signup();
autoPlay(P.c);
const code = await botTable(P.c, "tonpuu");
const A = await admin();
A.c.send({ type: "spectate", code });
await A.c.wait("spectateStarted", 8000);
await sleep(2500);
A.c.send({ type: "adminPauseGame", code, paused: true, reason: "재시작 점검" });
await A.c.wait("gamePaused", 5000);
console.log(`READY ${code} — 판을 세웠다. 지금 서버에 SIGTERM 을 보내라.`);

const t0 = Date.now();
await Promise.race([
  P.c.wait("gameAborted", 60000).then(() => console.log(`대국자 gameAborted ${Date.now() - t0}ms`)),
  sleep(60000),
]);
await sleep(1000);
console.log("대국자 마지막 메시지:", P.c.log.slice(-3).map((m) => `${m.type}${m["reason"] ? `(${m["reason"]})` : ""}`).join(","));
console.log("관전석 마지막 메시지:", A.c.log.slice(-3).map((m) => `${m.type}${m["reason"] ? `(${m["reason"]})` : ""}`).join(","));
process.exit(0);
