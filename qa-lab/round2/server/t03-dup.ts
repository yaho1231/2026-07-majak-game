/** 중복 접속 / 좌석 탈취 / 대기실 방장 이탈 시나리오. */
import { C, signup, login, autoPlay, sleep, health, uniq } from "./lib.js";

function hdr(s: string) { console.log("\n=== " + s + " ==="); }

// --- 1) 같은 계정 두 소켓이 대기실 방을 각자 만들 수 있나 ---
hdr("1) 같은 계정 2소켓 · 각자 createRoom");
const { c: a1, name, pw } = await signup();
const { c: a2 } = await login(name, pw);
a1.send({ type: "createRoom" });
const r1 = await a1.wait("roomCreated", 8000);
a2.send({ type: "createRoom" });
const r2 = await a2.wait((m) => m.type === "roomCreated" || m.type === "error", 8000);
console.log("소켓1 방:", r1.code, "| 소켓2:", r2.type, r2.code ?? r2.message);
console.log("health rooms:", (await health()).rooms);

// --- 2) 같은 계정 2소켓이 같은 대기실에 → reseat ---
hdr("2) 같은 계정 2소켓 · 같은 방 joinRoom (reseat)");
a2.send({ type: "joinRoom", code: r1.code });
const j = await a2.wait((m) => m.type === "joined" || m.type === "error", 8000);
console.log("소켓2 join:", j.type, j.playerId ?? j.message);
await sleep(300);
console.log("소켓1이 아직 lobby를 받나 / 소켓1 살아있나:", !a1.closed, "lobby수", a1.count("lobby"));
// 소켓1(떨어져 나간 옛 연결)이 여전히 방 조작을 할 수 있나?
a1.send({ type: "addBot" });
await sleep(400);
const lob = a2.last("lobby");
console.log("옛 소켓의 addBot 반영?", lob ? lob.players?.length : "?", "| a1 err:", a1.last("error")?.code);

// --- 3) 남의 진행 중 방에 join ---
hdr("3) 제3자가 진행 중 방 코드로 join");
const { c: h, name: hn, pw: hp } = await signup();
autoPlay(h);
h.send({ type: "createRoom" });
const hr = await h.wait("roomCreated");
for (let i = 0; i < 3; i++) { h.send({ type: "addBot" }); await sleep(60); }
await sleep(200);
h.send({ type: "startGame" });
await h.wait("view", 20000);
const { c: stranger } = await signup().then(r => ({ c: r.c }));
stranger.send({ type: "joinRoom", code: hr.code });
const sj = await stranger.wait((m) => m.type === "joined" || m.type === "error", 8000);
console.log("제3자 join:", sj.type, sj.code ?? "", sj.message ?? "");

// --- 4) 같은 계정으로 두 번째 소켓이 진행 중 방에 join (탭 2개) ---
hdr("4) 같은 계정 두 번째 탭이 진행 중 방 join");
const { c: h2 } = await login(hn, hp);
autoPlay(h2);
h2.send({ type: "joinRoom", code: hr.code });
const hj = await h2.wait((m) => m.type === "joined" || m.type === "error", 8000);
console.log("두번째 탭:", hj.type, hj.playerId ?? hj.message);
await sleep(500);
console.log("첫 탭 소켓 닫힘?", h.closed, "첫 탭 마지막 메시지:", h.log.slice(-2).map(m=>m.type).join(","));
// 첫 탭이 leaveRoom을 보내면 (떨어져 나간 연결) 지금 앉은 사람이 쫓겨나나?
h.send({ type: "leaveRoom" });
await sleep(1000);
console.log("두번째 탭 여전히 살아있나:", !h2.closed, "| 최근:", h2.log.slice(-3).map(m=>m.type).join(","));
h2.send({ type: "voteAbort", vote: "agree" });
await sleep(500);
console.log("두번째 탭 abortVote:", JSON.stringify(h2.last("abortVote")));

console.log("\nfinal health", await health());
for (const x of [a1,a2,h,h2,stranger]) x.close();
await sleep(300);
process.exit(0);
