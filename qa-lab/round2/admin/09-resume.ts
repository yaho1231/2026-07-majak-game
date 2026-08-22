/**
 * 09 — 일시정지 → 재개 뒤 판이 실제로 다시 흐르는가 (최소 재현).
 */
import { check, cleanup, connectAs, newHarness, report, sleep, startRealGame } from "./lab.js";

async function main(): Promise<void> {
  const h = await newHarness();
  const admin = await connectAs(h, "Boss", { admin: true });
  const p1 = await connectAs(h, "Alice", { autoRespond: true });
  const p2 = await connectAs(h, "Bob", { autoRespond: true });
  const code = await startRealGame(h, p1, p2);
  await sleep(1500);
  const room = ((h.rm as any).rooms as Map<string, any>).get(code);

  const v0 = p1.all("view").length;
  console.log("정지 전 view 수:", v0, "prompt 대기:", p1.last("prompt") !== undefined);

  admin.clientSend({ type: "adminPauseGame", code, paused: true, reason: "점검" });
  await p1.waitFor((m) => m.type === "gamePaused" && m.paused === true, 3000);
  await sleep(1200);
  const v1 = p1.all("view").length;
  check("정지 중 판이 멈춘다", v1 === p1.all("view").length && v1 >= v0, `${v0} → ${v1}`);
  console.log("controller.isPaused =", room.controller.isPaused);

  admin.clientSend({ type: "adminPauseGame", code, paused: false });
  await p1.waitFor((m) => m.type === "gamePaused" && m.paused === false, 3000);
  console.log("재개 직후 controller.isPaused =", room.controller.isPaused);
  // 정지 중 눌러 거절당한 답을 다시 보낸다 (실제 클라이언트는 화면 잠금이 풀리면 다시 누른다)
  const pend = p1.last("prompt");
  if (pend !== undefined) {
    const opts = pend.prompt.options as any[];
    const pick = opts.find((o: any) => o.type === "pass") ?? opts.find((o: any) => o.type === "discard") ?? opts[0];
    p1.clientSend({ type: "action", actionType: pick.type, payload: pick.payload, seat: pend.prompt.player });
  }
  await sleep(3000);
  const v2 = p1.all("view").length;
  check("재개하면 판이 다시 흐른다", v2 > v1, `정지중 ${v1} → 재개후 ${v2}`);

  // 끝까지 완주하는가
  const overs0 = p1.all("roundOver").length;
  let done = false;
  try {
    await p1.waitFor(
      (m) => m.type === "gameOver" || (m.type === "roundOver" && p1.all("roundOver").length > overs0),
      30_000,
    );
    done = true;
  } catch { /* 굳었다 */ }
  check("재개한 판이 국 끝까지 간다", done);

  report();
  await cleanup();
  process.exit(0);
}
void main();
