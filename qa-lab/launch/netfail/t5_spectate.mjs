import WebSocket from "ws";
const URL = "ws://127.0.0.1:3107";
const now = Date.now();
function connect() { return new WebSocket(URL); }
class Player {
  constructor(name) { this.name = name; this.log = []; this.autoplay = true; }
  attach(ws) { this.ws = ws; ws.on("message", (data) => this.handle(JSON.parse(data.toString()))); }
  async register() {
    this.attach(connect());
    await new Promise((r) => this.ws.on("open", r));
    this.ws.send(JSON.stringify({ type: "register", username: this.name, password: "pw12345678", ...(this.admin ? { adminCode: "9KcURQ_OItbNkksJjpFBIg" } : {}) }));
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
    if (msg.type === "joined") { this.playerId = msg.playerId; this.roomCode = msg.roomId; }
    if (msg.type === "view") this.lastView = msg.view;
    if (msg.type === "roundOver") console.log(this.name, "ROUND OVER");
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
  async reconnect() {
    this.attach(connect());
    await new Promise((r) => this.ws.on("open", r));
    this.ws.send(JSON.stringify({ type: "tokenLogin", sessionToken: this.sessionToken }));
    await this.waitFor((m) => m.type === "authOk");
  }
}
function hand(view, id) { return view?.zones?.[`hand:${id}`]?.tileIds; }
async function main() {
  const suf = String(now).slice(-6);
  const names = ["uA" + suf, "uB" + suf, "uC" + suf, "uD" + suf, "uSpec" + suf];
  const players = names.map((n) => new Player(n)); players[4].admin = true;
  for (const p of players) await p.register();
  const host = players[0];
  const spec = players[4];
  host.ws.send(JSON.stringify({ type: "createRoom" }));
  await host.waitFor((m) => m.type === "joined");
  console.log("room:", host.roomCode);
  for (const p of players.slice(1, 4)) p.ws.send(JSON.stringify({ type: "joinRoom", code: host.roomCode }));
  await Promise.all(players.slice(1, 4).map((p) => p.waitFor((m) => m.type === "joined")));
  for (const p of players.slice(1, 4)) p.ws.send(JSON.stringify({ type: "ready", ready: true }));
  await new Promise((r) => setTimeout(r, 300));
  host.ws.send(JSON.stringify({ type: "startGame" }));
  const waitForHand = async (p, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (hand(p.lastView, p.playerId)?.length >= 13) return true; await new Promise((r) => setTimeout(r, 300)); }
    return false;
  };
  await waitForHand(host, 60000);
  console.log("in round, now spectator joins");
  spec.ws.send(JSON.stringify({ type: "spectate", code: host.roomCode, delaySeconds: 0 }));
  const sres = await spec.waitFor((m) => m.type === "spectateStarted" || m.type === "error", 5000).catch((e)=>{console.log("spectate join failed:", e.message); return null;});
  console.log("spectate result type:", sres?.type, JSON.stringify(sres).slice(0,150));
  await new Promise((r) => setTimeout(r, 1500));
  console.log("spectator got view:", spec.lastView !== null, "players:", spec.lastView?.players?.map(p=>p.id));

  console.log("### spectator disconnect 3s then reconnect+respectate");
  spec.ws.close();
  await new Promise((r) => setTimeout(r, 3000));
  await spec.reconnect();
  spec.ws.send(JSON.stringify({ type: "spectate", code: host.roomCode, delaySeconds: 0 }));
  const sres2 = await spec.waitFor((m) => m.type === "spectateStarted" || m.type === "error", 5000).catch((e)=>{console.log("re-spectate failed:", e.message); return null;});
  console.log("re-spectate result:", sres2?.type);
  await new Promise((r) => setTimeout(r, 1500));
  console.log("spectator view after re-spectate:", spec.lastView !== null);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
