import WebSocket from "ws";
import fs from "node:fs";
const URL = "ws://127.0.0.1:3107";
const now = Date.now();

function connect() { return new WebSocket(URL); }

class Player {
  constructor(name) { this.name = name; this.log = []; this.autoplay = true; }
  attach(ws) { this.ws = ws; ws.on("message", (data) => this.handle(JSON.parse(data.toString()))); ws.on("close", () => { this.connected = false; }); this.connected = true; }
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
  async reconnectFresh() {
    this.attach(connect());
    await new Promise((r) => this.ws.on("open", r));
    this.ws.send(JSON.stringify({ type: "tokenLogin", sessionToken: this.sessionToken }));
    await this.waitFor((m) => m.type === "authOk");
    this.ws.send(JSON.stringify({ type: "joinRoom", code: this.roomCode }));
  }
}

function score(view, id) { return view?.players?.find((p) => p.id === id)?.score; }
function hand(view, id) { return view?.zones?.[`hand:${id}`]?.tileIds; }
function discards(view, id) { return view?.zones?.[`discards:${id}`]?.tileIds; }

async function main() {
  const suf = String(now).slice(-6);
  const names = ["sA" + suf, "sB" + suf, "sC" + suf, "sD" + suf];
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
  // wait until we are clearly inside a round with hand tiles (poll)
  const waitForHand = async (p, ms) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      if (hand(p.lastView, p.playerId)?.length >= 13) return true;
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  };
  const ok = await waitForHand(host, 60000);
  console.log("got into round with hand:", ok);
  await new Promise((r) => setTimeout(r, 3000)); // let a couple discards happen

  const snapshot = players.map((p) => ({
    name: p.name, id: p.playerId,
    score: score(p.lastView, p.playerId),
    hand: [...(hand(p.lastView, p.playerId) ?? [])].sort(),
    discards: discards(p.lastView, p.playerId),
  }));
  console.log("PRE-KILL snapshot:", JSON.stringify(snapshot));
  console.log("ROOMCODE=" + host.roomCode);
  console.log("ROUND=" + JSON.stringify(host.lastView?.round));
  fs.writeFileSync("/tmp/qa-launch-netfail/pre_kill_snapshot.json", JSON.stringify({ roomCode: host.roomCode, snapshot, round: host.lastView?.round, names: names, sessionTokens: players.map(p=>p.sessionToken) }, null, 2));
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
