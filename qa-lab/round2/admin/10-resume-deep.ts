/**
 * 10 — 일시정지→재개가 국을 끝까지 굴리는가. 대조군(정지 없음)과 나란히 본다.
 */
import { check, cleanup, connectAs, newHarness, report, sleep, startRealGame } from "./lab.js";

async function run(pauseIt: boolean, label: string): Promise<void> {
  const h = await newHarness();
  const admin = await connectAs(h, "Boss", { admin: true });
  const p1 = await connectAs(h, "Alice", { autoRespond: true });
  const p2 = await connectAs(h, "Bob", { autoRespond: true });
  const code = await startRealGame(h, p1, p2);
  await sleep(1200);

  if (pauseIt) {
    admin.clientSend({ type: "adminPauseGame", code, paused: true, reason: "점검" });
    await p1.waitFor((m) => m.type === "gamePaused" && m.paused === true, 3000);
    await sleep(800);
    admin.clientSend({ type: "adminPauseGame", code, paused: false });
    await p1.waitFor((m) => m.type === "gamePaused" && m.paused === false, 3000);
  }

  let done = false;
  try {
    await p1.waitFor((m) => m.type === "roundOver" || m.type === "gameOver", 40_000);
    done = true;
  } catch { /* 굳었다 */ }
  const room = ((h.rm as any).rooms as Map<string, any>).get(code);
  check(`${label}: 국이 끝난다`, done,
    done ? "" : `views=${p1.all("view").length} lastPrompt=${JSON.stringify(p1.last("prompt")?.prompt?.player)} paused=${room?.controller?.isPaused}`);
}

async function main(): Promise<void> {
  await run(false, "대조군(정지 없음)");
  await run(true, "정지→재개");
  report();
  await cleanup();
  process.exit(0);
}
void main();
