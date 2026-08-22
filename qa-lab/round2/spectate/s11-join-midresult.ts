/**
 * s11 — 국 결과 화면이 떠 있는 동안 관전을 시작하면 «결과»가 오지 않는다.
 *
 * `addSpectator()`는 카탈로그와 현재 뷰만 즉시 보낸다. 국 결과(roundOver — 역·판·부·
 * 점수 이동·우라도라)는 `notifyAll`로 **그 순간에 한 번** 나갈 뿐이라, 결과 화면이
 * 떠 있는 동안(운영 기본 20초) 합류한 관전석은 그 국의 결과를 영영 못 본다.
 * 대회 중계에서 탁자를 옮기는 순간이 정확히 이 창이다(D4 전환기).
 */
import { admin, botTable, ok, sleep, signup } from "./lib.js";

const P = await signup();
const code = await botTable(P.c, "tonpuu");

let sawRoundOver = false;
P.c.onMsg = (m: any) => {
  if (m.type === "prompt") {
    const list: any[] = m.prompt.options ?? [];
    const ch = list.find((o) => o.type === "discard") ?? list.find((o) => o.type === "pass") ?? list[0];
    if (ch) setTimeout(() => P.c.send({ type: "action", actionType: ch.type, payload: ch.payload ?? {} }), 5);
  } else if (m.type === "draftOffer") {
    const ch = m.choices?.[0];
    if (ch) setTimeout(() => P.c.send({ type: "draftPick", stage: m.stage, augmentId: ch.id }), 5);
  } else if (m.type === "roundOver") {
    sawRoundOver = true; // roundContinue 를 보내지 않는다 — 결과 화면을 띄워 둔다
  }
};

console.log("첫 국이 끝나기를 기다린다…");
await P.c.wait("roundOver", 300000);
console.log("roundOver 도착 —", JSON.stringify(P.c.last("roundOver")).slice(0, 120));
ok(sawRoundOver, "결과 화면이 떠 있다");

// 결과 화면이 떠 있는 그 순간 관전 시작
const A = await admin();
A.c.send({ type: "spectate", code });
await A.c.wait("spectateStarted", 8000);
await sleep(5000);

const got = A.c.log.map((m) => m.type);
console.log("합류 직후 5초 동안 관전석이 받은 것:", got.join(","));
ok(A.c.count("roundOver") > 0, "합류한 관전석도 지금 떠 있는 국 결과를 받는다");
const v = (A.c.last("view") as any)?.view;
console.log("  관전 뷰 phase:", v?.round?.phase, "· 우라도라:", v?.round?.uraDoraIndicators);

P.c.close();
A.c.close();
await sleep(400);
process.exit(0);
