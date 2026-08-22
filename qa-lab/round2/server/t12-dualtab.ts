/**
 * 같은 계정 2중 접속(다른 탭)이 대국 중에 정확히 무엇을 하는가.
 *  - 탭2가 joinRoom 하면 탭1은 끊기는가? 프롬프트는 누구에게 가는가?
 *  - 탭1(옛 소켓)이 보낸 action 이 좌석에 먹히는가?
 * 실행: tsx qa-lab/round2/server/t12-dualtab.ts
 */
process.env.QA_WS = process.env.QA_WS ?? "ws://127.0.0.1:3922";
process.env.QA_HTTP = process.env.QA_HTTP ?? "http://127.0.0.1:3922";
const { signup, login, sleep, uniq, health } = await import("./lib.js");

const { c: t1, name, pw } = await signup(uniq("X"));
t1.send({ type: "createRoom" });
const rc = await t1.wait("roomCreated", 60000);
t1.send({ type: "setGameMode", mode: "tonpuu" });
for (let k = 0; k < 3; k++) { t1.send({ type: "addBot" }); await sleep(60); }
await sleep(300);
t1.send({ type: "startGame" });
// 드래프트는 탭1이 처리
t1.onMsg = (m) => { if (m.type === "draftOffer") t1.send({ type: "draftPick", stage: m.stage, augmentId: m.choices[0].id }); };
const p1 = await t1.wait("prompt", 120000);
console.log("탭1 첫 prompt:", p1.prompt.kind ?? "?", "옵션", p1.prompt.options?.length);

// 탭2 등장
const { c: t2 } = await login(name, pw);
t2.send({ type: "joinRoom", code: rc.code });
const j = await t2.wait((m) => m.type === "joined" || m.type === "error", 20000);
console.log("탭2 joinRoom →", j.type, j.playerId ?? j.code);
await sleep(1500);
console.log("탭1 closed?", t1.closed, t1.closeInfo ? JSON.stringify(t1.closeInfo) : "");
const t2p = t2.last("prompt");
console.log("탭2가 prompt 를 받았나?", t2p !== undefined);

// ── 탭1(옛 소켓)이 아직 살아 있다면, 그 소켓으로 액션을 보내 본다 ──
if (!t1.closed) {
  const n1 = t1.log.length, n2 = t2.log.length;
  const opt = (t2p ?? p1).prompt.options?.find((o: any) => o.type === "discard");
  t1.send({ type: "action", actionType: opt.type, payload: opt.payload ?? {} });
  await sleep(1500);
  const r1 = t1.log.slice(n1).map((m) => m.type + (m.code ? `(${m.code})` : ""));
  const r2 = t2.log.slice(n2).map((m) => m.type + (m.code ? `(${m.code})` : ""));
  console.log("옛 소켓(탭1)이 액션을 보낸 뒤 — 탭1 수신:", r1.join(",") || "없음");
  console.log("                                  탭2 수신:", r2.join(",") || "없음");
  const accepted = r2.some((x) => x.startsWith("view")) || r1.some((x) => x.startsWith("view"));
  console.log(accepted ? "  ⚠ 옛 소켓의 액션이 좌석에 **먹혔다**" : "  옛 소켓의 액션은 무시됐다");
}
console.log("health", JSON.stringify(await health()));
t1.close(); t2.close();
process.exit(0);
