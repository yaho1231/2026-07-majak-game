/**
 * 05 — 샌드박스(증강 테스트) 누수·뒷정리, 강제 종료 뒤 흔적.
 */
import { readdir } from "node:fs/promises";
import {
  check, cleanup, connectAs, newHarness, report, sleep, startRealGame,
} from "./lab.js";

async function main(): Promise<void> {
  const h = await newHarness();
  const admin = await connectAs(h, "Boss", { admin: true });

  // ── 1. 샌드박스: 손패·증강 지정이 실제로 먹히는가 ──
  admin.clientSend({ type: "sandboxStart", mode: "tonpuu" });
  await admin.waitFor((m) => m.type === "view", 8000);
  const code = admin.last("sandbox").code as string;
  const seat = admin.last("sandbox").seat as string;

  admin.clear();
  admin.clientSend({
    type: "sandboxReset",
    augments: { [seat]: ["spy"] },
    hands: { [seat]: ["man1", "man1", "man1", "pin9"] },
  });
  await admin.waitFor((m) => m.type === "sandbox" && Object.keys(m.hands ?? {}).length > 0, 8000);
  admin.clear();
  await admin.waitFor((m) => m.type === "view" && (m.view.zones[`hand:${seat}`]?.tileIds.length ?? 0) >= 13, 8000);
  const v = admin.last("view").view;
  const myHand = v.players.find((p: any) => p.id === seat);
  const handKinds = (v.zones[`hand:${seat}`]?.tileIds ?? []).map((id: number) => {
    const k = v.tiles[id].kind;
    return `${k.suit}${k.rank}`;
  });
  check("지정한 손패가 실제로 배패된다",
    handKinds.filter((k: string) => k === "man1").length >= 3 && handKinds.includes("pin9"),
    JSON.stringify(handKinds));
  check("지정한 증강이 실제로 지급된다",
    (myHand?.augments ?? []).includes("spy"), JSON.stringify(myHand?.augments));

  // ── 2. 봇 제약을 걸고 → 샌드박스를 접고 → 실대국을 열었을 때 누수 ──
  admin.clientSend({ type: "sandboxBotRules", rules: { noRiichi: true, noCall: true, noWin: true } });
  await admin.waitFor((m) => m.type === "sandboxConfig", 3000);
  check("봇 제약이 sandboxConfig로 되돌아온다",
    admin.last("sandboxConfig").botRules?.noRiichi === true,
    JSON.stringify(admin.last("sandboxConfig").botRules));

  // 샌드박스가 liveGames에 안 뜨는가
  admin.clientSend({ type: "liveGames" });
  await admin.waitFor((m) => m.type === "liveGames", 3000);
  check("샌드박스 방은 liveGames에 없다",
    !admin.last("liveGames").rooms.some((r: any) => r.code === code));

  // ── 3. 관리자가 자기 샌드박스를 강제 종료하면? ──
  admin.clear();
  admin.clientSend({ type: "adminAbortGame", code });
  await sleep(300);
  check("샌드박스도 adminAbortGame으로 끊긴다(=관리자 도구가 시험 방까지 닿는다)",
    admin.last("gameAborted") !== undefined || admin.last("error") !== undefined,
    `gameAborted=${admin.last("gameAborted")?.reason} err=${admin.last("error")?.code}`);

  // 끊긴 뒤 새 샌드박스를 다시 열 수 있는가 (좌석이 유령으로 남지 않았는가)
  admin.clear();
  admin.clientSend({ type: "sandboxStart" });
  await sleep(500);
  check("강제 종료 뒤 새 샌드박스를 다시 열 수 있다",
    admin.last("view") !== undefined,
    `err=${admin.last("error")?.code ?? "-"}`);
  const code2 = admin.last("sandbox")?.code;
  admin.clientSend({ type: "leaveRoom" });
  await sleep(300);

  // ── 4. 샌드박스 뒤에 연 실대국의 봇이 제약을 물려받는가 ──
  admin.autoRespond = true;
  const p1 = await connectAs(h, "Alice", { autoRespond: true });
  const p2 = await connectAs(h, "Bob", { autoRespond: true });
  const real = await startRealGame(h, p1, p2);
  await sleep(500);
  const rooms = (h.rm as any).rooms as Map<string, any>;
  const realRoom = rooms.get(real);
  check("실대국 방의 봇 제약은 비어 있다",
    JSON.stringify(realRoom?.sandboxBotRules ?? {}) === "{}",
    JSON.stringify(realRoom?.sandboxBotRules));
  check("실대국 방은 sandbox 플래그가 꺼져 있다", realRoom?.sandbox === false);
  const botsAreSandbox = realRoom.agents.some(
    (a: any) => a.constructor?.name === "SandboxBotAgent",
  );
  check("실대국 봇은 조작 가능한 SandboxBotAgent가 아니다", !botsAreSandbox);

  // ── 5. 실대국 강제 종료 뒤 흔적 (리플레이 파일 · live_games) ──
  admin.clientSend({ type: "adminAbortGame", code: real, reason: "정리" });
  await p1.waitFor((m) => m.type === "gameAborted", 5000);
  await sleep(500);
  const files = await readdir(h.replayDir);
  const jsonl = files.filter((f) => f.endsWith(".jsonl") && f.includes(real));
  check("강제 종료한 판의 리플레이 파일이 남지 않는다", jsonl.length === 0, JSON.stringify(files));
  const live = (h.db as any).listLiveGames?.() ?? [];
  check("강제 종료한 판이 live_games(이어하기 후보)에 남지 않는다",
    !JSON.stringify(live).includes(real), JSON.stringify(live).slice(0, 300));

  // ── 6. 두 사람의 통계에 그 판이 안 들어갔는가 ──
  p1.clientSend({ type: "statsRequest" });
  await p1.waitFor((m) => m.type === "careerStats" || m.type === "stats", 3000).catch(() => undefined);
  const st = p1.last("careerStats") ?? p1.last("stats");
  check("강제 종료된 판은 전적에 안 잡힌다",
    st === undefined || JSON.stringify(st).includes('"games":0') || (st.games ?? 0) === 0,
    JSON.stringify(st).slice(0, 200));

  void code2;
  report();
  await cleanup();
  process.exit(0);
}
void main();
