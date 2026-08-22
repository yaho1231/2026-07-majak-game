/**
 * 리소스 누수 계측 — 연결·방·좌석 맵이 실제로 풀리는가.
 * 사이클마다: 가입 → 방 생성 → 봇 3 → (게임은 안 켜고) 소켓을 그냥 끊는다.
 * 기대: rooms/connections 가 0 으로 돌아오고 RSS 가 선형으로 늘지 않는다.
 * 실행: QA_CYCLES=60 tsx qa-lab/round2/server/t14-leak.ts
 */
process.env.QA_WS = process.env.QA_WS ?? "ws://127.0.0.1:3922";
process.env.QA_HTTP = process.env.QA_HTTP ?? "http://127.0.0.1:3922";
const { signup, sleep, uniq, health } = await import("./lib.js");
import { execSync } from "node:child_process";

const N = Number(process.env.QA_CYCLES ?? 60);
const pid = execSync("lsof -tPan -i:3922 -sTCP:LISTEN").toString().trim().split("\n")[0];
const rss = () => Number(execSync(`ps -o rss= -p ${pid}`).toString().trim());

const h0 = await health();
console.log("시작 rooms", h0.rooms, "conns", h0.connections, "RSS", rss(), "KB");

for (let i = 0; i < N; i++) {
  const { c } = await signup(uniq("L"));
  c.send({ type: "createRoom" });
  await c.wait("roomCreated", 30000);
  for (let k = 0; k < 3; k++) c.send({ type: "addBot" });
  await sleep(50);
  // 절반은 정상 종료, 절반은 네트워크 단절처럼 파괴
  if (i % 2 === 0) c.close(); else c.kill();
  if ((i + 1) % 20 === 0) {
    await sleep(1500);
    const h = await health();
    console.log(`#${i + 1}  rooms=${h.rooms} conns=${h.connections} ws=${h.wsClients} RSS=${rss()}KB faults=${JSON.stringify(h.faults)}`);
  }
}
await sleep(4000);
const h1 = await health();
console.log("끝 rooms", h1.rooms, "conns", h1.connections, "ws", h1.wsClients, "RSS", rss(), "KB");
if (h1.rooms > h0.rooms) console.log(`  ❌ 방이 ${h1.rooms - h0.rooms}개 남았다 (대기실 방이 즉시 정리되지 않는다)`);
if (h1.connections > 0) console.log(`  ❌ 연결 ${h1.connections}개가 남았다`);
process.exit(0);
