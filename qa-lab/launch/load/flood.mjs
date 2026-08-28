// 악성/오작동 클라 시뮬레이션: 인증 후 초당 수백 메시지(ping)를 쏟아붓는다.
// 토큰버킷(80 용량/40rps)이 실제로 막는지, 방 전체(다른 소켓)에 지연을 주는지 확인.
import WebSocket from "ws";
const PORT = Number(process.argv[2] ?? 3103);
const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
let pongCount = 0, sent = 0;
const username = "Flood" + Date.now().toString(36).slice(-6);
ws.on("open", () => ws.send(JSON.stringify({type:"register", username, password:"loadtest123!"})));
ws.on("message", (raw) => {
  const m = JSON.parse(raw.toString());
  if (m.type === "authOk") {
    // 3초간 최대한 빨리 ping을 쏜다 (초당 목표 500회)
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (Date.now() - t0 > 3000) { clearInterval(iv); report(); return; }
      for (let i=0;i<50;i++){ ws.send(JSON.stringify({type:"ping"})); sent++; }
    }, 100);
  }
  if (m.type === "pong") pongCount++;
});
function report(){
  setTimeout(()=>{
    console.log(JSON.stringify({sent, pongCount, droppedByBucket: sent - pongCount}));
    ws.close();
    process.exit(0);
  }, 1500);
}
ws.on("error", e=>console.log("ERR",e.message));
