/**
 * 11 — 시간 연장(adminExtendTime): 안 서 있을 때 / 서 있을 때.
 */
import { check, cleanup, connectAs, newHarness, report, sleep, startRealGame } from "./lab.js";

async function main(): Promise<void> {
  const h = await newHarness();
  const admin = await connectAs(h, "Boss", { admin: true });
  const p1 = await connectAs(h, "Alice", { autoRespond: true });
  p1.skipSeats.add("p0"); // 드래프트·리액션엔 답하되 자기 타패는 붙잡아 둔다
  const p2 = await connectAs(h, "Bob", { autoRespond: true });
  const code = await startRealGame(h, p1, p2);
  await p1.waitFor((m) => m.type === "prompt", 15_000);
  const seat = p1.last("prompt").prompt.player as string;
  console.log("기다리는 좌석:", seat);

  // (1) 안 서 있는 판에서 연장
  admin.clear(); p1.clear();
  admin.clientSend({ type: "adminExtendTime", code, seat, seconds: 60 });
  await sleep(200);
  check("정상 진행 중 시간 연장이 먹는다", p1.last("promptExtended") !== undefined,
    `err=${admin.last("error")?.code ?? "-"} ext=${JSON.stringify(p1.last("promptExtended"))}`);

  // (2) 세워 놓고 연장
  admin.clientSend({ type: "adminPauseGame", code, paused: true, reason: "회선사고" });
  await p1.waitFor((m) => m.type === "gamePaused" && m.paused === true, 3000);
  admin.clear(); p1.clear();
  admin.clientSend({ type: "adminExtendTime", code, seat, seconds: 60 });
  await sleep(200);
  check("세워 둔 판에서도 시간 연장이 먹는다 (docs/36 B3: 회선사고 구제)",
    p1.last("promptExtended") !== undefined,
    `err=${admin.last("error")?.code ?? "-"}`);

  report();
  await cleanup();
  process.exit(0);
}
void main();
