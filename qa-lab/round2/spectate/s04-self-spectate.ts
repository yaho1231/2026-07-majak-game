/**
 * s04 — 자기 판 관전 차단이 뚫린다 (완전정보 치트).
 *
 * `spectate()`는 "본인이 참가 중인 게임은 관전할 수 없습니다"로 막는다. 그런데
 * 그 판정(`isActiveHuman`)은 **`!isAbandoned`** 를 요구한다. 끊겨서 이탈 확정된
 * 좌석(`abandonReason === "timeout"`)은 «참가 중»으로 보지 않으므로,
 *
 *   1) 대국 중 끊어서 좌석을 timeout 이탈로 만든다 (돌아올 수 있는 이탈)
 *   2) 같은 계정으로 자기 방을 **관전**한다 → 네 사람 손패·패산·도라가 다 보인다
 *   3) 같은 연결로 `joinRoom` 해서 그 좌석에 **복귀**한다 (canRejoin=true)
 *      → joinRoom 은 stopSpectating 을 하지 않는다. 관전 스트림이 그대로 남는다.
 *
 * 즉 대국자가 남의 손패를 보면서 둔다.
 */
import { admin, botTable, ok, sleep, autoPlay, login, type Msg } from "./lib.js";

const A = await admin(); // 방장이자 관리자 (대회 운영자가 직접 두는 자리)
autoPlay(A.c);
const code = await botTable(A.c, "tonpuu");
console.log("room", code, "as", A.name);
await sleep(2000);

// 1) 네트워크가 끊긴 것처럼 소켓을 죽인다 → 유예 8회(≈40초) 뒤 timeout 이탈
console.log("소켓 강제 종료 — 이탈 확정을 기다린다(최대 90초)");
A.c.kill();

let re: { c: any; auth: Msg } | null = null;
let abandoned = false;
for (let i = 0; i < 30; i++) {
  await sleep(3000);
  const probe = await login(A.name);
  probe.c.send({ type: "liveGames" });
  const lg = await probe.c.wait("liveGames", 5000);
  const g = (lg["rooms"] as any[]).find((x) => x.code === code);
  // 관전이 허용되면 이탈이 확정된 것이다 (그 자체가 이 버그의 신호)
  probe.c.send({ type: "spectate", code });
  const r = await probe.c.wait((m) => m.type === "spectateStarted" || m.type === "error", 5000);
  if (r.type === "spectateStarted") {
    abandoned = true;
    re = probe;
    console.log(`  ${(i + 1) * 3}초: 자기 방 관전이 **허용**됐다`, JSON.stringify(g).slice(0, 160));
    break;
  }
  console.log(`  ${(i + 1) * 3}초: 아직 거절 — ${r["code"]} ${r["message"]}`);
  probe.c.close();
}
ok(!abandoned, "이탈 확정된 좌석의 계정도 자기 판을 관전할 수 없다");
if (re === null) {
  console.log("이탈이 확정되지 않아 재현 실패 (시간 부족)");
  process.exit(0);
}

// 2) 관전 뷰 — 남의 손패가 보이는가
const v1 = (await re.c.waitNext("view", 8000))["view"] as any;
console.log("  관전 뷰 playerId:", v1.playerId, "p1 손패:", v1.zones["hand:p1"].tileIds.length, "장 hidden", v1.zones["hand:p1"].hiddenCount);

// 3) 같은 연결로 그 좌석에 복귀한다
re.c.send({ type: "joinRoom", code });
const j = await re.c.wait((m) => m.type === "joined" || m.type === "error", 8000);
console.log("  joinRoom →", j.type, j["code"] ?? "", j["message"] ?? "");
if (j.type !== "joined") {
  console.log("복귀가 막혔다 — 치트는 «관전만»으로 끝난다");
  process.exit(0);
}
autoPlay(re.c);

// 4) 복귀한 뒤에도 관전 스트림(전원 손패)이 계속 오는가
const before = re.c.log.length;
await sleep(6000);
const after = re.c.log.slice(before);
const specViews = after.filter((m) => m.type === "view" && (m as any).view.playerId === "__spectator");
const ownViews = after.filter((m) => m.type === "view" && (m as any).view.playerId !== "__spectator");
const insights = after.filter((m) => m.type === "spectateInsight");
console.log(`  복귀 후 6초: 관전(전체공개) 뷰 ${specViews.length}장 · 본인 뷰 ${ownViews.length}장 · spectateInsight ${insights.length}건`);
if (specViews.length > 0) {
  const z = (specViews.at(-1) as any).view.zones;
  const opp = Object.keys(z).filter((k) => k.startsWith("hand:"));
  console.log(
    "  → 확정: 대국 중인 연결이 전 좌석 손패를 계속 받는다:",
    opp.map((k) => `${k}=${z[k].tileIds.filter((t: number) => t >= 0).length}장`).join(" "),
  );
}
ok(specViews.length === 0, "복귀하면 관전 스트림이 끊긴다");

re.c.close();
await sleep(400);
process.exit(0);
