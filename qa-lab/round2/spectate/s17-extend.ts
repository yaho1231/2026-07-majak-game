/** s17 — B3 시간 연장: 실제로 기다리는 좌석에 +30초가 붙는가. */
import { admin, botTable, sleep, signup, ok } from "./lib.js";

const P = await signup();
let prompts = 0, ext: any = null, deadline0 = 0;
P.c.onMsg = (m: any) => {
  if (m.type === "prompt") { prompts++; deadline0 = m.prompt?.deadlineMs ?? m.deadlineMs ?? 0; }
  if (m.type === "promptExtended") ext = m;
  if (m.type === "draftOffer") { const ch = m.choices?.[0]; if (ch) P.c.send({ type: "draftPick", stage: m.stage, augmentId: ch.id }); }
  if (m.type === "roundOver") P.c.send({ type: "roundContinue" });
};
const code = await botTable(P.c, "tonpuu");
const A = await admin();
A.c.send({ type: "spectate", code });
await A.c.wait("spectateStarted", 8000);

// 대국자는 아무것도 안 한다 → 프롬프트가 서 있다
const t0 = Date.now();
while (prompts === 0 && Date.now() - t0 < 30000) await sleep(200);
ok(prompts > 0, "대국자에게 프롬프트가 섰다", { prompts, deadline0 });
await sleep(1000);

A.c.send({ type: "adminExtendTime", code, seat: "p0", seconds: 30 });
const r = await A.c.wait((m: any) => m.type === "error", 2500).catch(() => null);
await sleep(600);
ok(r === null, "기다리는 좌석에 연장 요청이 통한다", r);
ok(ext !== null, "대국자가 promptExtended 를 받는다", ext);

// 봇 좌석 · 없는 좌석
A.c.send({ type: "adminExtendTime", code, seat: "p1", seconds: 30 });
const rb = await A.c.wait((m: any) => m.type === "error", 3000).catch(() => null);
ok(rb?.code === "BAD_REQUEST", "봇 좌석 연장은 거절된다", rb);
A.c.send({ type: "adminExtendTime", code, seat: "p9", seconds: 30 });
const rz = await A.c.wait((m: any) => m.type === "error", 3000).catch(() => null);
ok(rz !== null, "없는 좌석 연장은 거절된다", rz);
// 상한
A.c.send({ type: "adminExtendTime", code, seat: "p0", seconds: 999999 });
const rc = await A.c.wait((m: any) => m.type === "error" || m.type === "promptExtended", 3000).catch(() => null);
console.log("  큰 값 요청 결과:", JSON.stringify(rc), "· 대국자 최신:", JSON.stringify(ext));

P.c.close(); A.c.close(); await sleep(300); process.exit(0);
