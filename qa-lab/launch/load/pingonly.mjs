// 순수 ping 지연 측정 — 게임 로직 없이 N개 소켓만 열고 ping/pong 왕복만 잰다.
import WebSocket from "ws";
const N = Number(process.argv[2] ?? 64);
const PORT = Number(process.argv[3] ?? 3103);
const DURATION = Number(process.argv[4] ?? 30);
const socks = [];
const lat = [];
let connected = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  ws._lastPing = null;
  ws.on("open", () => { connected++; });
  ws.on("message", (raw) => {
    let m; try { m = JSON.parse(raw.toString()); } catch { return; }
    if (m.type === "pong" && ws._lastPing) {
      lat.push(Date.now() - ws._lastPing);
      ws._lastPing = null;
    }
  });
  socks.push(ws);
}
await new Promise(r => setTimeout(r, 2000));
console.log(`connected=${connected}/${N} in ${Date.now()-t0}ms`);
const pinger = setInterval(() => {
  for (const ws of socks) {
    if (ws.readyState === 1 && !ws._lastPing) {
      ws._lastPing = Date.now();
      try { ws.send(JSON.stringify({type:"ping"})); } catch {}
    }
  }
}, 1000);
await new Promise(r => setTimeout(r, DURATION*1000));
clearInterval(pinger);
const s = [...lat].sort((a,b)=>a-b);
const pct = p => s.length ? s[Math.min(s.length-1, Math.floor(p/100*s.length))] : NaN;
console.log(JSON.stringify({N, samples: s.length, p50: pct(50), p95: pct(95), p99: pct(99), max: s[s.length-1]}, null, 2));
for (const ws of socks) try{ws.close();}catch{}
process.exit(0);
