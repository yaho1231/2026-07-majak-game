import WebSocket from "ws";

const URL = "ws://127.0.0.1:3107";
const now = Date.now();

function connect() {
  return new WebSocket(URL);
}

class Player {
  constructor(name) {
    this.name = name;
    this.sessionToken = null;
    this.playerId = null;
    this.roomToken = null; // per-room reconnect token ("joined".token)
    this.roomCode = null;
    this.lastView = null;
    this.log = [];
    this.autoplay = true;
  }
  attach(ws) {
    this.ws = ws;
    ws.on("message", (data) => {
      const msg = JSON.parse(data.toString());
      this.handle(msg);
    });
  }
  async register() {
    this.attach(connect());
    await new Promise((r) => this.ws.on("open", r));
    this.ws.send(JSON.stringify({ type: "register", username: this.name, password: "pw12345678" }));
    await this.waitFor((m) => m.type === "authOk" || m.type === "error");
  }
  waitFor(pred, timeoutMs = 8000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(this.name + " timeout waiting for: " + pred.toString())), timeoutMs);
      const h = (data) => {
        const msg = JSON.parse(data.toString());
        if (pred(msg)) {
          this.ws.off("message", h);
          clearTimeout(t);
          resolve(msg);
        }
      };
      this.ws.on("message", h);
    });
  }
  handle(msg) {
    this.log.push(msg.type);
    if (msg.type === "error") console.log(this.name, "ERROR:", msg.code, msg.message);
    if (msg.type === "authOk") this.sessionToken = msg.sessionToken;
    if (msg.type === "joined") { this.playerId = msg.playerId; this.roomCode = msg.roomId; this.roomToken = msg.token; }
    if (msg.type === "lobby") this.lastLobby = msg;
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
  createRoom() {
    this.ws.send(JSON.stringify({ type: "createRoom" }));
  }
  joinRoomByCode(code, reconnectToken) {
    this.ws.send(JSON.stringify({ type: "joinRoom", code, ...(reconnectToken ? { reconnectToken } : {}) }));
  }
  disconnect() {
    this.ws.close();
  }
  async reconnect() {
    this.attach(connect());
    await new Promise((r) => this.ws.on("open", r));
    this.ws.send(JSON.stringify({ type: "tokenLogin", sessionToken: this.sessionToken }));
    await this.waitFor((m) => m.type === "authOk");
    this.joinRoomByCode(this.roomCode, this.roomToken);
  }
}

function score(view, id) {
  return view?.players?.find((p) => p.id === id)?.score;
}
function hand(view, id) {
  return view?.zones?.[`hand:${id}`]?.tileIds;
}
function discards(view, id) {
  return view?.zones?.[`discards:${id}`]?.tileIds;
}
function riichiSticks(view) {
  return view?.round?.riichiSticks ?? view?.round;
}

async function main() {
  const suf = String(now).slice(-6);
  const names = ["qA" + suf, "qB" + suf, "qC" + suf, "qD" + suf];
  const players = names.map((n) => new Player(n));
  for (const p of players) await p.register();
  console.log("registered all 4:", players.map((p) => p.sessionToken?.slice(0, 6)));

  // host creates room
  const host = players[0];
  host.createRoom();
  await host.waitFor((m) => m.type === "joined");
  console.log("room created:", host.roomCode);

  for (const p of players.slice(1)) {
    p.joinRoomByCode(host.roomCode);
  }
  await Promise.all(players.slice(1).map((p) => p.waitFor((m) => m.type === "joined")));
  console.log("all joined room", host.roomCode);
  await new Promise((r) => setTimeout(r, 500));
  console.log("lobby seen by host:", JSON.stringify(host.lastLobby));

  for (const p of players.slice(1)) {
    p.ws.send(JSON.stringify({ type: "ready", ready: true }));
  }
  await new Promise((r) => setTimeout(r, 500));
  host.ws.send(JSON.stringify({ type: "startGame" }));
  await new Promise((r) => setTimeout(r, 2000));
  console.log("host log after start:", host.log.slice(-10));
  console.log("host hand:", hand(host.lastView, host.playerId));

  // Run the round with autoplay for a while so hand/discards/scores diverge from initial
  await new Promise((r) => setTimeout(r, 8000));
  console.log("\n=== snapshot before disconnect tests ===");
  for (const p of players) {
    console.log(p.name, p.playerId, "score=", score(p.lastView, p.playerId), "handLen=", hand(p.lastView, p.playerId)?.length, "discardsLen=", discards(p.lastView, p.playerId)?.length, "round=", JSON.stringify(p.lastView?.round).slice(0,150));
  }

  const results = { name: "netfail-t1", roomCode: host.roomCode };

  // ---- Test A: disconnect target for 2s (within 5s grace), verify exact restoration
  {
    const target = players[0];
    const pre = {
      hand: JSON.stringify([...(hand(target.lastView, target.playerId) ?? [])].sort()),
      score: score(target.lastView, target.playerId),
      discards: JSON.stringify(discards(target.lastView, target.playerId)),
      othersScores: JSON.stringify(target.lastView?.players?.map((p) => [p.id, p.score])),
    };
    target.autoplay = false;
    target.disconnect();
    console.log(`\n### [A] disconnect ${target.name}, wait 2s, reconnect (grace=5000ms)`);
    await new Promise((r) => setTimeout(r, 2000));
    const t0 = Date.now();
    await target.reconnect();
    const gotView = await target.waitFor((m) => m.type === "view", 5000).catch(() => null);
    console.log("reconnect RTT to view:", Date.now() - t0, "ms");
    target.autoplay = true;
    await new Promise((r) => setTimeout(r, 500));
    const post = {
      hand: JSON.stringify([...(hand(target.lastView, target.playerId) ?? [])].sort()),
      score: score(target.lastView, target.playerId),
      discards: JSON.stringify(discards(target.lastView, target.playerId)),
      othersScores: JSON.stringify(target.lastView?.players?.map((p) => [p.id, p.score])),
    };
    console.log("[A] pre :", JSON.stringify(pre));
    console.log("[A] post:", JSON.stringify(post));
    console.log("[A] hand match:", pre.hand === post.hand);
    console.log("[A] score match:", pre.score === post.score);
    console.log("[A] discards match:", pre.discards === post.discards);
    console.log("[A] other scores match:", pre.othersScores === post.othersScores);
    results.A = { pre, post };
  }

  await new Promise((r) => setTimeout(r, 3000));

  // ---- Test B: disconnect for ~50s (past GRACE_TIMEOUTS_BEFORE_ABANDON*5s=40s), verify abandon+reconnect still works (reason=timeout => canRejoin)
  {
    const target = players[1];
    console.log(`\n### [B] disconnect ${target.name} for 50s (expect abandon after ~40s of consecutive grace timeouts, then check reconnect/reinstate)`);
    const preScore = score(target.lastView, target.playerId);
    const preHand = JSON.stringify([...(hand(target.lastView, target.playerId) ?? [])].sort());
    target.autoplay = false;
    target.disconnect();
    await new Promise((r) => setTimeout(r, 50_000));
    console.log("[B] other players' view of target connection state after 50s:", JSON.stringify(players[2].lastView?.players?.find(p=>p.id===target.playerId)));
    await target.reconnect();
    const got = await target.waitFor((m) => m.type === "view", 5000).catch((e) => { console.log("[B] no view on reconnect:", e.message); return null; });
    target.autoplay = true;
    await new Promise((r) => setTimeout(r, 500));
    const postScore = score(target.lastView, target.playerId);
    const postHand = JSON.stringify([...(hand(target.lastView, target.playerId) ?? [])].sort());
    console.log("[B] pre score/hand:", preScore, preHand);
    console.log("[B] post score/hand:", postScore, postHand);
    console.log("[B] reconnect after abandon worked (got a view):", got !== null);
    results.B = { preScore, postScore, reconnected: got !== null };
  }

  console.log("\n=== FINAL host round state ===");
  console.log(JSON.stringify(host.lastView?.round));

  await new Promise((r) => setTimeout(r, 1000));
  console.log("\nRESULTS_JSON=" + JSON.stringify(results));
  process.exit(0);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
