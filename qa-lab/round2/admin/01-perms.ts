/**
 * 01 — 모든 관리자 명령을 비관리자 3종(일반 로그인 · 게스트 · 미인증)으로 호출한다.
 * 기대: 전부 거절. "조용히 무시"도 실패로 본다(거절 응답이 있어야 한다).
 */
import { check, cleanup, connectAnon, connectAs, connectGuest, newHarness, report, sleep, startRealGame } from "./lab.js";

const ADMIN_CMDS = (code: string, seat: string, userId: number): any[] => [
  { type: "adminUsers" },
  { type: "adminAnalytics" },
  { type: "adminAugmentTiers" },
  { type: "adminDeleteUser", userId },
  { type: "liveGames" },
  { type: "adminAbortGame", code },
  { type: "adminSetNotice", title: "HACK", body: "pwned" },
  { type: "adminPauseGame", code, paused: true },
  { type: "adminRoomNotice", code, text: "HACK" },
  { type: "adminExtendTime", code, seat, seconds: 60 },
  { type: "adminVoidRound", code },
  { type: "spectate", code },
  { type: "sandboxStart" },
  { type: "sandboxGrant", augmentId: "spy" },
  { type: "sandboxReset" },
  { type: "sandboxBotRules", rules: {} },
  { type: "sandboxControl", enabled: true },
  { type: "sandboxViewAs", seat: "p1" },
  { type: "feedbackUpdate", id: 1, status: "done", reply: "x" },
];

async function main(): Promise<void> {
  const h = await newHarness();
  const admin = await connectAs(h, "Boss", { admin: true, autoRespond: true });
  const p2 = await connectAs(h, "Mate", { autoRespond: true });
  const code = await startRealGame(h, admin, p2);
  const seat = admin.last("view").view.playerId as string;

  // 대상 방이 실제로 돌고 있는지 확인
  admin.clientSend({ type: "liveGames" });
  await admin.waitFor((m) => m.type === "liveGames");
  check("사전조건: liveGames에 대상 방이 있다",
    admin.last("liveGames").rooms.some((r: any) => r.code === code), code);

  const normal = await connectAs(h, "Normie");
  const guest = await connectGuest(h);
  const anon = connectAnon(h);

  const victimUserId = (h.db as any).findUser?.("Boss")?.id ?? 1;

  for (const [label, sock] of [["일반", normal], ["게스트", guest], ["미인증", anon]] as const) {
    for (const cmd of ADMIN_CMDS(code, seat, victimUserId)) {
      sock.clear();
      sock.clientSend(cmd);
      await sleep(25);
      const err = sock.last("error");
      const leaked = sock.sent.find(
        (m: any) =>
          m.type === cmd.type ||
          ["adminUsers", "adminAnalytics", "adminAugmentTiers", "liveGames", "sandbox",
            "spectateStarted", "view", "roomCreated"].includes(m.type),
      );
      const refused = err !== undefined && leaked === undefined;
      check(
        `${label} → ${cmd.type} 거절`,
        refused,
        refused ? err.code : `err=${err?.code ?? "없음"} leaked=${leaked?.type ?? "-"}`,
      );
    }
  }

  // 판이 여전히 정상인가 (거절이 판을 흔들지 않았는가)
  admin.clientSend({ type: "liveGames" });
  await sleep(50);
  check("공격 뒤에도 방이 살아 있다",
    admin.last("liveGames").rooms.some((r: any) => r.code === code));
  check("공격 뒤에도 방이 서 있지 않다",
    admin.last("liveGames").rooms.find((r: any) => r.code === code)?.paused !== true);

  // 전역 공지가 세워지지 않았는지
  const notice = (h.db as any).getNotice?.() ?? null;
  check("전역 공지가 위조되지 않았다", notice === null, JSON.stringify(notice));

  report();
  await cleanup();
  process.exit(0);
}
void main();
