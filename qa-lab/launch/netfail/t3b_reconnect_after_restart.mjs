import WebSocket from "ws";
import fs from "node:fs";
const URL = "ws://127.0.0.1:3107";
const pre = JSON.parse(fs.readFileSync("/tmp/qa-launch-netfail/pre_kill_snapshot.json", "utf-8"));

function connect() { return new WebSocket(URL); }

class Player {
  constructor(name, sessionToken) { this.name = name; this.sessionToken = sessionToken; this.log = []; }
  attach(ws) { this.ws = ws; ws.on("message", (data) => this.handle(JSON.parse(data.toString()))); }
  handle(msg) {
    this.log.push(msg.type);
    if (msg.type === "error") console.log(this.name, "ERROR:", msg.code, msg.message);
    if (msg.type === "joined") { this.playerId = msg.playerId; }
    if (msg.type === "view") this.lastView = msg.view;
  }
  waitFor(pred, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(this.name + " timeout: " + pred.toString())), timeoutMs);
      const h = (data) => {
        const msg = JSON.parse(data.toString());
        if (pred(msg)) { this.ws.off("message", h); clearTimeout(t); resolve(msg); }
      };
      this.ws.on("message", h);
    });
  }
  async reconnect(roomCode) {
    this.attach(connect());
    await new Promise((r) => this.ws.on("open", r));
    this.ws.send(JSON.stringify({ type: "tokenLogin", sessionToken: this.sessionToken }));
    await this.waitFor((m) => m.type === "authOk" || m.type === "error");
    this.ws.send(JSON.stringify({ type: "joinRoom", code: roomCode }));
    await this.waitFor((m) => m.type === "joined" || m.type === "error");
  }
}

function score(view, id) { return view?.players?.find((p) => p.id === id)?.score; }
function hand(view, id) { return view?.zones?.[`hand:${id}`]?.tileIds; }
function discards(view, id) { return view?.zones?.[`discards:${id}`]?.tileIds; }

async function main() {
  const players = pre.names.map((n, i) => new Player(n, pre.sessionTokens[i]));
  for (const p of players) {
    await p.reconnect(pre.roomCode);
    await new Promise((r) => setTimeout(r, 300));
  }
  await new Promise((r) => setTimeout(r, 1000));
  const post = players.map((p) => ({
    name: p.name, id: p.playerId,
    score: score(p.lastView, p.playerId),
    hand: [...(hand(p.lastView, p.playerId) ?? [])].sort(),
    discards: discards(p.lastView, p.playerId),
  }));
  console.log("PRE :", JSON.stringify(pre.snapshot));
  console.log("POST:", JSON.stringify(post));
  for (let i = 0; i < pre.snapshot.length; i++) {
    const a = pre.snapshot[i], b = post[i];
    console.log(a.name, "score match:", a.score === b.score, a.score, b.score,
      "| hand match:", JSON.stringify(a.hand) === JSON.stringify(b.hand),
      "| discards match:", JSON.stringify(a.discards) === JSON.stringify(b.discards));
  }
  console.log("POST round:", JSON.stringify(players[0].lastView?.round));
  console.log("PRE  round:", JSON.stringify(pre.round));
  process.exit(0);
}
main().catch((e) => { console.error("FATAL", e); process.exit(1); });
