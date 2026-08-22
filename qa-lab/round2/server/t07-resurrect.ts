/**
 * 확정 재현: **끝난 판이 `live_games` 에 되살아난다** → 재시작하면 이미 기록된 판이
 * 다시 서고, 다시 끝나면서 `games`·전적이 **두 번** 기록된다.
 *
 * 창(window): `onGameOver` 는 `forgetLiveGame()` 을 먼저 부르지만, 방을 대기실로
 * 되돌리는 `resetRoomAfterGame()` 은 `finishStats()` 가 끝난 **뒤** `.finally` 에서
 * 돈다. 그 사이 방은 여전히 `phase==="playing" && controller!==null && writer!==null`
 * 이라, `sweepIdleRooms()` 가 한 번만 돌면 `rememberLiveGame()` 이 행을 다시 넣는다.
 *
 * 서버:
 *   PORT=3922 DB_PATH=<임시> ROOM_SWEEP_INTERVAL_MS=1000 INTER_ROUND_DELAY_MS=0
 *   (운영 기본값은 60000 이라 창이 좁을 뿐 같은 코드다 — 실제로 운영과 같은
 *    기본값 60000 으로 돌린 서버에서도 한 판이 이 방식으로 되살아났다.)
 * 실행: QA_DB=<임시DB> tsx qa-lab/round2/server/t07-resurrect.ts
 */
process.env.QA_WS = process.env.QA_WS ?? "ws://127.0.0.1:3922";
process.env.QA_HTTP = process.env.QA_HTTP ?? "http://127.0.0.1:3922";
const { signup, autoPlay, sleep, uniq } = await import("./lib.js");
import { execSync } from "node:child_process";

const DB = process.env.QA_DB!;
const q = (s: string) => execSync(`sqlite3 "${DB}" "${s}"`).toString().trim();

const { c } = await signup(uniq("R"));
autoPlay(c);
c.send({ type: "createRoom" });
const rc = await c.wait("roomCreated", 60000);
const code = rc.code as string;
c.send({ type: "setGameMode", mode: "tonpuu" });
for (let k = 0; k < 3; k++) { c.send({ type: "addBot" }); await sleep(60); }
await sleep(300);
c.send({ type: "startGame" });
console.log("room", code, "— 게임 시작");
await c.wait("gameOver", 900_000);
const t0 = Date.now();
console.log("gameOver 수신. 지금부터 live_games 를 감시한다 (기대: 이 코드가 다시 나타나면 안 된다)");

let seen = false;
for (let i = 0; i < 120; i++) {
  const live = q("select code from live_games;").split("\n").filter(Boolean);
  const games = q(`select count(*) from games where code='${code}';`);
  if (live.includes(code)) {
    console.log(`  +${Date.now() - t0}ms  ❌ live_games 에 ${code} 가 되살아났다 (games=${games})`);
    seen = true;
    break;
  }
  await sleep(500);
}
if (!seen) console.log("  이번 판은 창을 비껴갔다 (다시 돌려 볼 것)");
console.log("최종 live_games =", q("select code from live_games;").replace(/\n/g, " "));
console.log("최종 games      =", q("select id||':'||code from games;").replace(/\n/g, " "));
c.close();
process.exit(seen ? 1 : 0);
