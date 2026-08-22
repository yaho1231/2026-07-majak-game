/**
 * 08 — 계정 조회·삭제, 공지, 티어표·집계, 그리고 «대국 중인 사람을 지우면?»
 */
import { check, cleanup, connectAs, newHarness, report, sleep, startRealGame } from "./lab.js";

async function main(): Promise<void> {
  const h = await newHarness();
  const admin = await connectAs(h, "Boss", { admin: true });
  const p1 = await connectAs(h, "Alice", { autoRespond: true });
  const p2 = await connectAs(h, "Bob", { autoRespond: true });

  admin.clientSend({ type: "adminUsers" });
  await admin.waitFor((m) => m.type === "adminUsers", 3000);
  const users = admin.last("adminUsers").users;
  check("계정 목록이 온다", Array.isArray(users) && users.length === 3, JSON.stringify(users?.length));
  check("계정 목록에 비밀번호 관련 필드가 없다",
    !/pass_|hash|salt/i.test(JSON.stringify(users)), JSON.stringify(users[0]));

  // 자기 자신 삭제
  const me = users.find((u: any) => u.username === "Boss");
  admin.clear();
  admin.clientSend({ type: "adminDeleteUser", userId: me.id });
  await sleep(100);
  check("본인 계정은 못 지운다", admin.last("error")?.code === "CANNOT_DELETE_SELF",
    admin.last("error")?.code ?? "무응답");

  // 없는 계정
  admin.clear();
  admin.clientSend({ type: "adminDeleteUser", userId: 99999 });
  await sleep(100);
  check("없는 계정 삭제는 거절", admin.last("error") !== undefined, admin.last("error")?.code);

  // 이상한 타입
  admin.clear();
  admin.clientSend({ type: "adminDeleteUser", userId: "1" });
  await sleep(100);
  check("문자열 userId는 거절", admin.last("error")?.code === "BAD_REQUEST",
    admin.last("error")?.code ?? "무응답");

  // ── 대국 중인 사람을 지우면 ──
  const code = await startRealGame(h, p1, p2);
  await sleep(300);
  const bob = users.find((u: any) => u.username === "Bob");
  p2.clear();
  admin.clientSend({ type: "adminDeleteUser", userId: bob.id });
  await sleep(300);
  check("삭제된 사람은 강제 로그아웃된다",
    p2.last("error")?.code === "SESSION_REVOKED", p2.last("error")?.code ?? "무응답");
  const rooms = (h.rm as any).rooms as Map<string, any>;
  check("남은 판은 그대로 굴러간다 (좌석은 기권으로 자동 진행)",
    rooms.has(code), `방 남음=${rooms.has(code)}`);

  // ── 공지 ──
  admin.clear(); p1.clear();
  admin.clientSend({ type: "adminSetNotice", title: "점검 예고", body: "5분 뒤" });
  await sleep(150);
  check("공지가 관리자에게도 즉시 되돌아온다",
    admin.last("serverInfo")?.notice?.title === "점검 예고",
    JSON.stringify(admin.last("serverInfo")?.notice));
  check("게임 중인 사람에게도 serverInfo가 간다 (전달은 된다)",
    p1.last("serverInfo")?.notice?.title === "점검 예고",
    JSON.stringify(p1.last("serverInfo")?.notice));
  admin.clear();
  admin.clientSend({ type: "adminSetNotice", title: "  ", body: "x" });
  await sleep(150);
  check("빈 제목이면 공지가 내려간다",
    admin.last("serverInfo")?.notice === undefined,
    JSON.stringify(admin.last("serverInfo")));
  admin.clear();
  admin.clientSend({ type: "adminSetNotice", title: 1, body: "x" });
  await sleep(100);
  check("형식이 틀린 공지는 거절", admin.last("error")?.code === "BAD_REQUEST",
    admin.last("error")?.code ?? "무응답");

  // ── 티어표·집계 ──
  admin.clear();
  admin.clientSend({ type: "adminAugmentTiers" });
  await admin.waitFor((m) => m.type === "adminAugmentTiers", 3000);
  const t = admin.last("adminAugmentTiers");
  check("티어표가 온다", (t.entries?.length ?? 0) > 50, `${t.entries?.length}종`);
  admin.clientSend({ type: "adminAnalytics" });
  await admin.waitFor((m) => m.type === "adminAnalytics", 3000);
  check("집계 조회가 응답한다 (집계기 없으면 빈 목록)",
    Array.isArray(admin.last("adminAnalytics").days));

  report();
  await cleanup();
  process.exit(0);
}
void main();
