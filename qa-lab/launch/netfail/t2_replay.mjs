import WebSocket from "ws";
const URL = "ws://127.0.0.1:3107";
const now = Date.now();

function connect() { return new WebSocket(URL); }

class Player {
  constructor(name) { this.name = name; this.log = []; this.autoplay = true; }
  attach(ws) {
    this.ws = ws;
    ws.on("message", (data) => this.handle(JSON.parse(data.toString())));
  }
  async register() {
    this.attach(connect());
    await new Promise((r) => this.ws.on("open", r));
    this.ws.send(JSON.stringify({ type: "register", username: this.name, password: "pw12345678" }));
    await this.waitFor((m) => m.type === "authOk" || m.type === "error");
  }
  waitFor(pred, timeoutMs = 20000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(this.name + " timeout: " + pred.toString())), timeoutMs);
      const h = (data) => {
        const msg = JSON.parse(data.toString());
        if (pred(msg)) { this.ws.off("message", h); clearTimeout(t); resolve(msg); }
      };
      this.ws.on("message", h);
    });
  }
  handle(msg) {
    this.log.push(msg.type);
    if (msg.type === "error") console.log(this.name, "ERROR:", msg.code, msg.message);
    if (msg.type === "authOk") this.sessionToken = msg.sessionToken;
    if (msg.type === "joined") { this.playerId = msg.playerId; this.roomCode = msg.roomId; this.roomToken = msg.token; }
    if (msg.type === "view") this.lastView = msg.view;
    if (msg.type === "roundOver") { this.roundOver = msg; console.log(this.name, "ROUND OVER settle=", JSON.stringify(msg.settle)); }
    if (this.autoplay) {
      if (msg.type === "prompt") this.answerPrompt(msg);
      if (msg.type === "draftOffer") this.answerDraft(msg);
    }
  }
  answerPrompt(msg) {
    const opts = msg.prompt.options;
    const pass = opts.find((o) => o.type === "pass");
    const discard = opts.find((o) => o.type === "discard");
    const pick = pass ?? discard ?? opts[0];
    if (pick) this.ws.send(JSON.stringify({ type: "action", payload: pick }));
  }
  answerDraft(msg) {
    const id = msg.choices[0]?.id;
    if (id) this.ws.send(JSON.stringify({ type: "draftPick", augmentId: id, stage: msg.stage }));
  }
}

async function main() {
  const suf = String(now).slice(-6);
  const names = ["rA" + suf, "rB" + suf, "rC" + suf, "rD" + suf];
  const players = names.map((n) => new Player(n));
  for (const p of players) await p.register();
  const host = players[0];
  host.ws.send(JSON.stringify({ type: "createRoom" }));
  await host.waitFor((m) => m.type === "joined");
  console.log("room:", host.roomCode);
  for (const p of players.slice(1)) p.ws.send(JSON.stringify({ type: "joinRoom", code: host.roomCode }));
  await Promise.all(players.slice(1).map((p) => p.waitFor((m) => m.type === "joined")));
  for (const p of players.slice(1)) p.ws.send(JSON.stringify({ type: "ready", ready: true }));
  await new Promise((r) => setTimeout(r, 300));
  host.ws.send(JSON.stringify({ type: "startGame" }));

  // wait for roundOver on host, up to 90s
  const ro = await host.waitFor((m) => m.type === "roundOver", 90000).catch((e) => { console.log("no roundOver:", e.message); return null; });
  if (ro) {
    console.log("LIVE roundOver settle:", JSON.stringify(ro.settle));
    console.log("LIVE final players scores (from view players list at round end):", JSON.stringify(host.lastView?.players?.map(p=>[p.id,p.score])));
  }
  console.log("host log:", host.log);
  console.log("ROOMCODE=" + host.roomCode);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
