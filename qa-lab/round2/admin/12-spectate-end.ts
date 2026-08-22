/**
 * 12 — 게임이 끝나서 관전이 끊길 때(endSpectating)의 뒷정리.
 * stopSpectating(사람이 접는 길)과 endSpectating(판이 끝나는 길)이 다른 일을 한다.
 */
import { check, cleanup, connectAs, newHarness, report, sleep, startRealGame } from "./lab.js";

async function main(): Promise<void> {
  const h = await newHarness();
  const logs: string[] = [];
  const origLog = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.join(" ")); origLog(...a); };

  const admin = await connectAs(h, "Boss", { admin: true });
  const a1 = await connectAs(h, "A1", { autoRespond: true });
  const a2 = await connectAs(h, "A2", { autoRespond: true });
  const codeA = await startRealGame(h, a1, a2);

  admin.clientSend({ type: "spectate", code: codeA, delaySeconds: 15 });
  await admin.waitFor((m) => m.type === "spectateStarted", 5000);
  await sleep(600);

  const conns = [...((h.rm as any).conns ?? (h.rm as any).connections ?? [])];
  const findConn = (): any =>
    [...((h.rm as any).rooms as Map<string, any>).values()]
      .flatMap((r: any) => [...r.spectators])[0];
  const spConn = findConn() ?? conns[0];

  const before = logs.length;
  admin.clientSend({ type: "adminAbortGame", code: codeA, reason: "정리" });
  await admin.waitFor((m) => m.type === "spectateEnded", 5000);
  await sleep(300);
  const after = logs.slice(before).join("\n");

  check("판이 끝나 관전이 끊길 때도 «관전 종료» 감사 로그가 남는다 (docs/36 C3)",
    after.includes("관전 종료"), after.replace(/\n/g, " | ").slice(0, 200));

  check("판이 끝나 관전이 끊기면 spectateSince 가 0으로 돌아간다",
    spConn?.spectateSince === 0, `spectateSince=${spConn?.spectateSince}`);
  check("판이 끝나 관전이 끊기면 지연 송출 대기분(spectateTimers)이 걷힌다",
    (spConn?.spectateTimers?.size ?? -1) === 0, `timers=${spConn?.spectateTimers?.size}`);

  // 두 번째 방을 잠깐만 본 뒤 접는다 → 로그의 «본 시간»이 맞는가
  const b1 = await connectAs(h, "B1", { autoRespond: true });
  const b2 = await connectAs(h, "B2", { autoRespond: true });
  const codeB = await startRealGame(h, b1, b2);
  const t0 = logs.length;
  admin.clientSend({ type: "spectate", code: codeB });
  await admin.waitFor((m) => m.type === "spectateStarted" && m.code === codeB, 5000);
  await sleep(1000);
  admin.clientSend({ type: "spectateStop" });
  await sleep(200);
  const stopLog = logs.slice(t0).find((l) => l.includes("관전 종료")) ?? "";
  const secs = Number(/\((\d+)초\)/.exec(stopLog)?.[1] ?? "-1");
  check("두 번째 관전의 «본 시간»이 실제 본 시간(1~3초)과 맞는다", secs >= 0 && secs <= 3,
    `${stopLog.trim()}`);

  console.log = origLog;
  report();
  await cleanup();
  process.exit(0);
}
void main();
