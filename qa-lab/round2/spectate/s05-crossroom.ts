/**
 * s05 — 대국 중인 연결이 그대로 관전을 시작한다 (스트림 충돌).
 *
 * `spectate()`는 «본인이 참가 중인 그 방»만 막는다. 지금 다른 방에서 두고 있는지는
 * 보지 않고, `joinRoom`/`createRoom`도 `stopSpectating()`을 부르지 않는다.
 * 그래서 한 소켓에 «내 판의 뷰»와 «남의 판의 전체공개 뷰»가 섞여 흐른다 —
 * 클라이언트는 view 를 상태 하나에 담으므로 화면이 두 판 사이에서 튄다.
 */
import { admin, botTable, ok, sleep, autoPlay, signup } from "./lib.js";

// 관전 대상 방 (남의 판)
const V = await signup();
autoPlay(V.c);
const codeB = await botTable(V.c, "tonpuu");

// 관리자이면서 자기 판을 두고 있는 사람
const A = await admin();
autoPlay(A.c);
const codeA = await botTable(A.c, "tonpuu");
console.log("내 방", codeA, "· 관전할 방", codeB);

A.c.send({ type: "spectate", code: codeB });
const r = await A.c.wait((m) => m.type === "spectateStarted" || m.type === "error", 8000);
console.log("대국 중 관전 시작 →", r.type, r["code"] ?? "");
ok(r.type === "error", "대국 중인 연결은 관전을 시작할 수 없다");

if (r.type === "spectateStarted") {
  const n0 = A.c.log.length;
  await sleep(8000);
  const after = A.c.log.slice(n0).filter((m) => m.type === "view");
  const mine = after.filter((m) => (m as any).view.playerId !== "__spectator").length;
  const spec = after.filter((m) => (m as any).view.playerId === "__spectator").length;
  console.log(`  8초 동안 한 소켓에 내 뷰 ${mine}장 + 남의 판 전체공개 뷰 ${spec}장이 섞여 왔다`);
  ok(spec === 0, "내 판을 두는 동안 남의 판 뷰는 오지 않는다");
  // 그리고 내 방의 프롬프트도 계속 온다 — 즉 남의 손패를 보면서 내 판을 둘 수 있다
  console.log("  내 방 프롬프트 수신:", A.c.log.slice(n0).filter((m) => m.type === "prompt").length, "건");
}

V.c.close();
A.c.close();
await sleep(400);
process.exit(0);
