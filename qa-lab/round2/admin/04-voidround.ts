/**
 * 04 — 국 무효(adminVoidRound)의 타이밍.
 *
 * 가설: 국이 이미 끝나 결과 화면이 떠 있는 사이(runRound 밖)에 «이 국을 물린다»를
 * 누르면, 요청이 남아 있다가 **다음 국**의 첫 결정 지점에서 소비되어 다음 국이
 * 시작하자마자 도중유국이 된다. 관리자가 물리려던 국은 그대로 정산된다.
 */
import { check, cleanup, connectAs, newHarness, report, sleep } from "./lab.js";

async function main(): Promise<void> {
  const h = await newHarness();
  const admin = await connectAs(h, "Boss", { admin: true });
  const p1 = await connectAs(h, "Alice", { autoRespond: true });
  const p2 = await connectAs(h, "Bob", { autoRespond: true });

  // roundOver 자동응답을 끈다 — 결과 화면에 판을 세워 두기 위해
  p1.holdRoundOver = true;
  p2.holdRoundOver = true;

  p1.clientSend({ type: "createRoom" });
  await p1.waitFor((m) => m.type === "roomCreated");
  const code = p1.last("roomCreated").code as string;
  p2.clientSend({ type: "joinRoom", code });
  await p2.waitFor((m) => m.type === "lobby");
  p1.clientSend({ type: "addBot" });
  p1.clientSend({ type: "addBot" });
  await p1.waitFor((m) => m.type === "lobby" && m.players?.length === 4);
  p1.clientSend({ type: "ready", ready: true });
  p2.clientSend({ type: "ready", ready: true });
  p1.clientSend({ type: "startGame" });
  await p1.waitFor((m) => m.type === "view");

  admin.clientSend({ type: "spectate", code });
  await admin.waitFor((m) => m.type === "spectateStarted", 5000);

  // 첫 국이 끝날 때까지 (roundOver) 기다린다.
  await p1.waitFor((m) => m.type === "roundOver", 60_000);
  const firstOver = p1.last("roundOver");
  console.log("첫 국 결과:", JSON.stringify(firstOver).slice(0, 300));

  // ★ 결과 화면이 떠 있는 «국 사이»에 국 무효를 건다.
  //   두 사람은 autoRespond 라 roundContinue 를 이미 보냈을 수 있으므로
  //   roundOver 직후 최대한 빨리 보낸다.
  admin.clientSend({ type: "adminVoidRound", code });
  console.log("→ 결과 화면 중 adminVoidRound 전송");
  await sleep(200);
  // 이제 결과 화면을 닫는다 → 다음 국 시작
  p1.holdRoundOver = false;
  p2.holdRoundOver = false;
  p1.clientSend({ type: "roundContinue" });
  p2.clientSend({ type: "roundContinue" });

  // 다음 국을 지켜본다
  const overs0 = p1.all("roundOver").length;
  await p1.waitFor((m) => m.type === "roundOver" && p1.all("roundOver").length > overs0, 60_000);
  const secondOver = p1.all("roundOver")[overs0];
  console.log("둘째 국 결과:", JSON.stringify(secondOver).slice(0, 400));

  await sleep(400);
  for (const [i, m] of p1.all("roundOver").entries()) {
    console.log(`roundOver#${i}`, m.outcome, "reason=", (m as any).settle?.reason ?? (m as any).reason ?? "-",
      "round=", m.settle?.roundNumber, "honba=", m.settle?.honba);
  }
  const s = JSON.stringify(p1.all("roundOver"));
  const voided = s.includes("adminVoid");
  check(
    "결과 화면 중에 건 «국 무효»가 다음 국을 즉시 물리지 않는다",
    !voided,
    voided ? "다음 국이 adminVoid 로 도중유국 처리됐다" : "정상",
  );

  report();
  await cleanup();
  process.exit(0);
}
void main();
