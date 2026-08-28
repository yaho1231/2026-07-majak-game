import WebSocket from "ws";
const ws = new WebSocket("ws://127.0.0.1:3103");
const username = "Dbg" + Date.now().toString(36).slice(-6);
ws.on("open", () => ws.send(JSON.stringify({type:"register", username, password:"loadtest123!"})));
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  console.log(msg.type, JSON.stringify(msg).slice(0,200));
  if (msg.type === "authOk") ws.send(JSON.stringify({type:"createRoom"}));
  if (msg.type === "roomCreated") {
    ws.send(JSON.stringify({type:"addBot"}));
    ws.send(JSON.stringify({type:"addBot"}));
    ws.send(JSON.stringify({type:"addBot"}));
    setTimeout(()=>ws.send(JSON.stringify({type:"startGame"})), 300);
  }
});
ws.on("error", e => console.log("ERR", e.message));
setTimeout(()=>process.exit(0), 15000);
