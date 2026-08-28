import WebSocket from "ws";
const ws = new WebSocket("ws://127.0.0.1:3103");
const username = "Dbg2" + Date.now().toString(36).slice(-5);
ws.on("open", () => ws.send(JSON.stringify({type:"register", username, password:"loadtest123!"})));
ws.on("message", (raw) => {
  const msg = JSON.parse(raw.toString());
  if (msg.type === "authOk") ws.send(JSON.stringify({type:"createRoom"}));
  if (msg.type === "roomCreated") {
    ws.send(JSON.stringify({type:"addBot"}));
    ws.send(JSON.stringify({type:"addBot"}));
    ws.send(JSON.stringify({type:"addBot"}));
    setTimeout(()=>ws.send(JSON.stringify({type:"startGame"})), 300);
  }
  if (msg.type === "draftOffer") {
    const c = msg.choices[0];
    ws.send(JSON.stringify({type:"draftPick", stage: msg.stage, augmentId: c.id}));
    console.log("picked", c.id);
  }
  if (msg.type === "prompt") {
    console.log("PROMPT", JSON.stringify(msg.prompt).slice(0,150));
    const opt = msg.prompt.options[0];
    ws.send(JSON.stringify({type:"action", actionType: opt.type, payload: opt.payload}));
  }
  if (msg.type === "error") console.log("ERROR", msg.code, msg.message);
});
ws.on("error", e => console.log("ERR", e.message));
setTimeout(()=>process.exit(0), 25000);
