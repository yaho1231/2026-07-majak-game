/**
 * s09 — 대회 운영 시나리오.
 *  · 관전석 여러 개(중계석·감독석)가 같은 방을 본다
 *  · 한 관전석이 두 탁자를 번갈아 옮긴다 (D4 전환기) — 옛 방의 스트림이 남는가
 *  · 옮긴 뒤 대국자에게 보이는 관전자 수가 정확한가
 */
import { admin, botTable, ok, sleep, autoPlay, signup } from "./lib.js";

const P1 = await signup();
autoPlay(P1.c);
const A1 = await botTable(P1.c, "tonpuu");
const P2 = await signup();
autoPlay(P2.c);
const A2 = await botTable(P2.c, "tonpuu");
console.log("탁자", A1, A2);

// ── 관전석 3개가 같은 탁자를 본다 ──
const specs = [await admin(), await admin(), await admin()];
for (const s of specs) {
  s.c.send({ type: "spectate", code: A1 });
  await s.c.wait("spectateStarted", 8000);
}
await sleep(4000);
for (const [i, s] of specs.entries()) {
  ok(s.c.count("view") > 0, `관전석 ${i + 1} 이 뷰를 받는다`, { n: s.c.count("view") });
}
await sleep(500);
ok(P1.c.last("spectated")?.["count"] === 3, "대국자가 보는 관전자 수 = 3", P1.c.last("spectated"));

// ── 탁자 전환 30회 ──
const sw = specs[0]!;
for (let i = 0; i < 30; i++) {
  sw.c.send({ type: "spectate", code: i % 2 === 0 ? A2 : A1 });
  await sw.c.waitNext("spectateStarted", 8000);
}
await sleep(2500);
const n0 = sw.c.log.length;
await sleep(6000);
const after = sw.c.log.slice(n0).filter((m) => m.type === "view");
console.log(`전환 30회 뒤 6초: 뷰 ${after.length}장`);
ok(after.length > 0, "전환 뒤에도 뷰가 온다");

// 마지막에 앉은 탁자만 보고 있어야 한다 — 두 탁자의 뷰가 섞이면 옛 sink 가 남은 것이다
const codes = new Set(
  after.map((m: any) => `${m.view.players.map((p: any) => p.nickname).join("/")}`),
);
console.log("  섞인 탁자 수:", codes.size, [...codes]);
ok(codes.size === 1, "옛 탁자의 스트림이 남지 않는다");

await sleep(600);
console.log("탁자1 관전자 수:", P1.c.last("spectated")?.["count"], "· 탁자2:", P2.c.last("spectated")?.["count"]);
// 마지막 전환(i=29)은 탁자1이다 → 탁자1에 3명, 탁자2는 0명이어야 한다.
ok(P1.c.last("spectated")?.["count"] === 3, "마지막에 앉은 탁자의 관전자 수가 맞다");
ok(P2.c.last("spectated")?.["count"] === 0, "떠난 탁자의 관전자 수가 0으로 돌아온다");

// ── 관전석이 그냥 죽는다 (탭을 닫는다) ──
specs[1]!.c.kill();
specs[2]!.c.close();
await sleep(2000);
console.log("두 관전석이 사라진 뒤 탁자1 관전자 수:", P1.c.last("spectated")?.["count"]);
ok(P1.c.last("spectated")?.["count"] === 1, "끊긴 관전석은 목록에서 빠진다 (남은 하나만)");

P1.c.close();
P2.c.close();
sw.c.close();
await sleep(400);
process.exit(0);
