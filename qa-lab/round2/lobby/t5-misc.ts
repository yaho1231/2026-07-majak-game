/** lobby QA #5 — 친구 초대 정원, 제보, 공지, 리플레이 권한/공유. */
import { newHarness, cleanup, reg, chk, summary, tick } from "./h.js";

const h = await newHarness();

// ── A. 정원이 찬 방으로도 친구 초대장이 나간다 ──
{
  const a = await reg(h, "InvA");
  const b = await reg(h, "InvB");
  // 친구 맺기
  a.clientSend({ type: "friendRequest", nickname: "InvB" });
  await tick();
  const reqs = (h.db as any).listFriendRequests?.(2) ?? null;
  b.clientSend({ type: "friendRespond", nickname: "InvA", accept: true });
  await tick();
  console.log("친구?", h.db.areFriends(1, 2));

  a.clientSend({ type: "createRoom" });
  await tick();
  const code = a.last("roomCreated").code;
  for (let i = 0; i < 3; i++) a.clientSend({ type: "addBot" });
  await tick();
  const lob = a.last("lobby");
  console.log("방 인원:", lob.players.length);
  b.clear();
  a.clear();
  a.clientSend({ type: "friendInvite", nickname: "InvB" });
  await tick();
  const invite = b.last("friendInviteFrom");
  console.log("초대장:", JSON.stringify(invite), "| 보낸 쪽 응답:", JSON.stringify(a.last("error")));
  chk("정원이 찬 방으로는 초대장이 안 간다", invite === undefined,
    `초대장 도착 code=${invite?.code}`);
  if (invite !== undefined) {
    b.clear();
    b.clientSend({ type: "joinRoom", code: invite.code });
    await tick();
    console.log("초대를 눌렀을 때:", JSON.stringify(b.last("error")));
  }
}

// ── B. 제보 ──
{
  const u = await reg(h, "Fb1");
  u.clientSend({ type: "feedbackSubmit", kind: "bug", title: "  ", body: "x" });
  await tick();
  chk("공백 제목 거부", u.last("error")?.code === "FEEDBACK_FAILED", JSON.stringify(u.last("error")));
  u.clientSend({ type: "feedbackSubmit", kind: "nope", title: "t", body: "b" });
  await tick();
  chk("모르는 종류 거부", u.last("error")?.message?.includes("종류") === true, JSON.stringify(u.last("error")));
  // 레이트리밋
  let ok = 0, blocked = 0;
  for (let i = 0; i < 12; i++) {
    u.clear();
    u.clientSend({ type: "feedbackSubmit", kind: "bug", title: `t${i}`, body: `b${i}` });
    await tick(5);
    if (u.last("feedbackList") !== undefined) ok++;
    else blocked++;
  }
  console.log("제보 성공/차단:", ok, blocked);
  chk("시간당 상한이 있다", blocked > 0, `${ok}건 전부 통과`);

  // 남의 제보를 볼 수 있는가
  const v = await reg(h, "Fb2");
  v.clientSend({ type: "feedbackList" });
  await tick();
  const mine = v.last("feedbackList");
  console.log("Fb2가 보는 제보 수:", mine.entries.length, "isAdmin:", mine.isAdmin);
  chk("남의 제보는 안 보인다", mine.entries.length === 0);

  // 남의 제보 삭제 시도
  const own = u.last("feedbackList") ?? (u.clientSend({ type: "feedbackList" }), await tick(), u.last("feedbackList"));
  const id = own?.entries?.[0]?.id;
  if (id !== undefined) {
    v.clear();
    v.clientSend({ type: "feedbackDelete", id });
    await tick();
    chk("남의 제보 삭제 거부", v.last("error")?.code === "FEEDBACK_FAILED", JSON.stringify(v.last("error")));
    v.clear();
    v.clientSend({ type: "feedbackUpdate", id, status: "done", reply: "hax" });
    await tick();
    chk("비관리자 제보 수정 거부", v.last("error") !== undefined, JSON.stringify(v.last("error")));
  }
}

// ── C. 공지 ──
{
  const admin = await reg(h, "Adm", { adminCode: "" });
  console.log("admin?", (h.db as any).userByName("Adm")?.isAdmin);
  const u = await reg(h, "Plain");
  u.clear();
  u.clientSend({ type: "adminSetNotice", title: "hi", body: "b" });
  await tick();
  chk("비관리자 공지 설정 거부", u.last("error")?.code === "FORBIDDEN", JSON.stringify(u.last("error")));
}

summary();
await cleanup();
process.exit(0);
