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
    if (msg.type === "joined") { this.playerId = msg.playerId; this.roomCode = msg.roomId; }
    if (msg.type === "view") this.lastView = msg.view;
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
    this.ws.send(JSON.stringify({ type: "joinRoom", code: this.roomCode }));
  }
}
function hand(view, id) { return view?.zones?.[`hand:${id}`]?.tileIds; }
async function main() {
  const suf = String(now).slice(-6);
  const names = ["tA" + suf, "tB" + suf, "tC" + suf, "tD" + suf];
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
  const waitForHand = async (p, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) { if (hand(p.lastView, p.playerId)?.length >= 13) return true; await new Promise((r) => setTimeout(r, 300)); }
    return false;
  };
  const ok = await waitForHand(host, 60000);
  console.log("in round:", ok);
  await new Promise((r) => setTimeout(r, 1000));

  console.log("\n### storm: disconnecting all 4 simultaneously");
  for (const p of players) { p.autoplay = false; p.ws.close(); }
  await new Promise((r) => setTimeout(r, 1500));
  console.log("### storm: reconnecting all 4 simultaneously");
  const results = await Promise.allSettled(players.map((p) => p.reconnect()));
  console.log(results.map((r) => r.status));
  await new Promise((r) => setTimeout(r, 2000));
  for (const p of players) {
    console.log(p.name, "log tail:", p.log.slice(-6), "hand:", hand(p.lastView, p.playerId)?.length);
  }
  // check server didn't crash: ping host
  host.ws.send(JSON.stringify({ type: "ping" }));
  const pong = await host.waitFor((m) => m.type === "pong", 3000).catch(() => null);
  console.log("server alive after storm (pong received):", pong !== null);
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
