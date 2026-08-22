/**
 * 확정 재현(부하판) — 여러 판이 비슷한 시각에 끝나면 `StatsStore.save()` 의 전역
 * 저장 체인이 직렬화되어 `finishStats()` 가 수 초~수십 초 걸린다. 그 사이 방은
 * 여전히 `phase==="playing"` 이라, 유휴 청소(`sweepIdleRooms` → `rememberLiveGame`)
 * 가 **이미 끝나서 `games` 에 기록된 판**을 `live_games` 에 다시 넣는다.
 *
 * 실행: QA_DB=<임시DB> QA_N=6 tsx qa-lab/round2/server/t10-resurrect-load.ts
 * 그 뒤 서버를 재시작하면 그 방이 다시 서고, 다시 끝나면서 `games` 에 **중복 행**이 생긴다.
 */
process.env.QA_WS = process.env.QA_WS ?? "ws://127.0.0.1:3922";
process.env.QA_HTTP = process.env.QA_HTTP ?? "http://127.0.0.1:3922";
const { signup, autoPlay, sleep, uniq } = await import("./lib.js");
import { execSync } from "node:child_process";

const DB = process.env.QA_DB!;
const N = Number(process.env.QA_N ?? 6);
const q = (s: string) => execSync(`sqlite3 "${DB}" "${s}"`).toString().trim();

async function one(i: number): Promise<string> {
  const { c } = await signup(uniq("W"));
  autoPlay(c);
  c.send({ type: "createRoom" });
  const rc = await c.wait("roomCreated", 120000);
  c.send({ type: "setGameMode", mode: "tonpuu" });
  for (let k = 0; k < 3; k++) { c.send({ type: "addBot" }); await sleep(60); }
  await sleep(300);
  c.send({ type: "startGame" });
  try {
    await c.wait("gameOver", 1_800_000);
  } catch (e) {
    c.close();
    return `#${i} ${rc.code} TIMEOUT`;
  }
  c.close();
  return `#${i} ${rc.code} done`;
}

const res = await Promise.all(Array.from({ length: N }, (_, i) => one(i).catch((e) => `#${i} ERR ${e.message}`)));
console.log(res.join("\n"));
const codes = res.map((r) => r.split(" ")[1]!);
await sleep(3000);
for (let i = 0; i < 40; i++) {
  const live = q("select code from live_games;").split("\n").filter(Boolean);
  const bad = live.filter((cde) => codes.includes(cde) && q(`select count(*) from games where code='${cde}';`) !== "0");
  if (bad.length > 0) {
    console.log(`❌ 이미 games 에 기록된 판이 live_games 에 남아 있다: ${bad.join(",")}`);
    console.log("   → 서버를 재시작하면 이 방들이 되살아나고, 끝나면서 games 에 중복 행이 생긴다.");
    break;
  }
  await sleep(1000);
}
console.log("live_games =", q("select code from live_games;").replace(/\n/g, " "));
console.log("games      =", q("select id||':'||code from games;").replace(/\n/g, " "));
process.exit(0);
