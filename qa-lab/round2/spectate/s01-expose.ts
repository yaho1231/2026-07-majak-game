/**
 * s01 — 관전 뷰의 정보 노출 정확성.
 *
 * 1) 관전 뷰가 네 좌석 손패·패산·도라를 전부 보여주는가
 * 2) 관전자 전용 정보(spectateInsight)가 대국자에게 새지 않는가
 * 3) 관전자가 대국에 영향을 주는 입력을 보낼 수 있는가 (거절되어야 한다)
 */
import { admin, botTable, ok, sleep, autoPlay, signup, type Msg } from "./lib.js";

const P = await signup();
autoPlay(P.c);
const code = await botTable(P.c, "tonpuu");
console.log("room", code, "host", P.name);

const A = await admin();
A.c.send({ type: "spectate", code });
await A.c.wait("spectateStarted", 8000);
const v = (await A.c.waitNext("view", 10000))["view"] as any;

console.log("playerId:", v.playerId);
console.log("zones:", Object.keys(v.zones).join(" "));

// 1) 네 좌석 손패
let allOpen = true;
for (const p of v.players) {
  const z = v.zones[`hand:${p.id}`];
  const n = z?.tileIds.filter((t: number) => t >= 0).length ?? 0;
  const hid = z?.hiddenCount ?? -1;
  if (hid !== 0 || n < 13) allOpen = false;
  console.log(`  ${p.id} hand tiles=${n} hidden=${hid}`);
}
ok(allOpen, "네 좌석 손패가 전부 공개");
const wall = v.zones["wall"];
ok((wall?.tileIds.filter((t: number) => t >= 0).length ?? 0) > 0, "패산(wall) 공개", {
  ids: wall?.tileIds.length,
  hidden: wall?.hiddenCount,
});
const dead = v.zones["deadwall"];
ok((dead?.tileIds.filter((t: number) => t >= 0).length ?? 0) > 0, "왕패(deadwall) 공개", {
  ids: dead?.tileIds.length,
  hidden: dead?.hiddenCount,
});
ok((v.round.doraIndicators?.length ?? 0) > 0, "도라 표시패");
console.log("  scoringOptions:", JSON.stringify(v.scoringOptions));

// 2) 대국자에게 관전 전용 메시지가 가는가
await sleep(1500);
ok(P.c.count("spectateInsight") === 0, "대국자는 spectateInsight를 받지 않는다", {
  n: P.c.count("spectateInsight"),
});
ok(A.c.count("spectateInsight") > 0, "관전자는 spectateInsight를 받는다", { n: A.c.count("spectateInsight") });
const sp = P.c.last("spectated");
ok(sp?.["count"] === 1, "대국자에게 중계 중 고지", sp);

// 3) 관전자가 판에 손대는 입력
const before = A.c.log.length;
const inputs: Msg[] = [
  { type: "action", actionType: "discard", payload: { tileId: v.zones[`hand:${v.players[0].id}`].tileIds[0] } },
  { type: "roundContinue" },
  { type: "draftPick", stage: "round", augmentId: "spy" },
  { type: "draftReroll", stage: "round" },
  { type: "emote", id: "nice" },
  { type: "handOrder", ids: [1, 2, 3] },
  { type: "voteAbort", vote: "agree" },
  { type: "leaveRoom" },
  { type: "chat", text: "x" },
];
for (const m of inputs) A.c.send(m);
await sleep(1200);
const replies = A.c.log.slice(before).filter((m) => m.type === "error");
console.log("  관전자 입력에 대한 응답:", JSON.stringify(replies.map((r) => [r["code"], r["message"]])));
ok(!A.c.closed, "관전자 소켓이 살아 있다");

// 게임이 계속 도는지
const seq0 = (A.c.last("view") as any).view.round.turnSeat;
await sleep(2500);
const seq1 = (A.c.last("view") as any).view.round;
console.log("  판 진행:", seq0, "→", seq1.turnSeat, "turn", seq1.turnCount ?? "?");

P.c.close();
A.c.close();
await sleep(400);
process.exit(0);
