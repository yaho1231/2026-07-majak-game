/** lobby QA #2 — 친구. */
import { newHarness, cleanup, reg, chk, summary, tick } from "./h.js";

const h = await newHarness();
const raw: any = (h.db as any).db;

// ── A. MAX_FRIENDS(100) 상한이 수락 경로에서 우회되는가 ──
{
  // 사용자 A + 상대 130명을 직접 넣는다(비밀번호 해시는 이 테스트에 무관).
  raw.exec(`INSERT INTO users (username, pass_salt, pass_hash, is_admin, created_at)
            VALUES ('Cap', 's', 'x', 0, '2026-01-01T00:00:00Z')`);
  const capId = (raw.prepare("SELECT id FROM users WHERE username='Cap'").get() as any).id;
  const ids: number[] = [];
  for (let i = 0; i < 130; i++) {
    raw.prepare("INSERT INTO users (username, pass_salt, pass_hash, is_admin, created_at) VALUES (?, 's', 'x', 0, '2026-01-01T00:00:00Z')")
      .run(`F${i}`, );
    ids.push((raw.prepare("SELECT id FROM users WHERE username=?").get(`F${i}`) as any).id);
  }
  // 1단계: Cap 이 100건을 보낸다 (상한 = 보낸 요청 100건)
  let sentOk = 0;
  for (let i = 0; i < 100; i++) if (h.db.requestFriend(capId, `F${i}`).ok) sentOk++;
  const over = h.db.requestFriend(capId, "F100");
  console.log("1단계 보낸요청 성공:", sentOk, "| 101번째:", JSON.stringify(over));
  // 2단계: 그중 60명이 수락 → Cap 친구 60, 남은 보낸요청 40
  for (let i = 0; i < 60; i++) h.db.respondFriendRequest(ids[i]!, "Cap", true);
  const c1 = (raw.prepare("SELECT COUNT(*) AS n FROM friends WHERE user_id=?").get(capId) as any).n;
  console.log("2단계 Cap 친구 수:", c1);
  // 3단계: 다시 60건을 더 보낸다 (보낸요청 40 + 60 = 100 → 통과)
  let sent2 = 0;
  for (let i = 100; i < 130; i++) if (h.db.requestFriend(capId, `F${i}`).ok) sent2++;
  console.log("3단계 추가로 보낸 요청:", sent2);
  // 4단계: 남은 전원 수락
  for (const id of ids) h.db.respondFriendRequest(id, "Cap", true);
  const c2 = (raw.prepare("SELECT COUNT(*) AS n FROM friends WHERE user_id=?").get(capId) as any).n;
  console.log("4단계 Cap 최종 친구 수:", c2, "(상한 100)");
  chk("MAX_FRIENDS(100) 상한이 지켜진다", c2 <= 100, `실제 ${c2}명`);
}

// ── B. 기본 흐름·거절 경로 ──
{
  const a = await reg(h, "Amy");
  const b = await reg(h, "Ben");
  a.clientSend({ type: "friendRequest", nickname: "Amy" });
  await tick();
  chk("자기 자신 요청 거부", a.last("error")?.code === "FRIEND_ADD_FAILED", JSON.stringify(a.last("error")));
  a.clientSend({ type: "friendRequest", nickname: "Nobody" });
  await tick();
  chk("없는 닉네임 거부", a.last("error")?.message?.includes("없습니다") === true, JSON.stringify(a.last("error")));
  a.clientSend({ type: "friendRequest", nickname: "ben" });   // 대소문자
  await tick();
  chk("대소문자 무시하고 찾는다", a.last("error")?.code === "FRIEND_REQUESTED", JSON.stringify(a.last("error")));
  a.clientSend({ type: "friendRequest", nickname: "Ben" });
  await tick();
  chk("중복 요청 거부", a.last("error")?.code === "FRIEND_ADD_FAILED", JSON.stringify(a.last("error")));
  chk("상대에게 즉시 편지함 갱신", b.last("friendList")?.incoming?.length === 1, JSON.stringify(b.last("friendList")));
  b.clientSend({ type: "friendRespond", nickname: "Amy", accept: true });
  await tick();
  chk("수락 후 양쪽 친구", (a.last("friendList")?.friends ?? []).length === 1 && (b.last("friendList")?.friends ?? []).length === 1);
}

// ── C. 온라인 표시 정확도 ──
{
  const c = await reg(h, "Cal");
  const d = await reg(h, "Dan");
  c.clientSend({ type: "friendRequest", nickname: "Dan" }); await tick();
  d.clientSend({ type: "friendRespond", nickname: "Cal", accept: true }); await tick();
  c.clientSend({ type: "friendList" }); await tick();
  chk("접속 중 친구는 online", c.last("friendList").friends[0].online === true, JSON.stringify(c.last("friendList").friends));
  d.close(); await tick(50);
  c.clear(); c.clientSend({ type: "friendList" }); await tick();
  chk("소켓 닫힌 친구는 offline", c.last("friendList").friends[0].online === false, JSON.stringify(c.last("friendList").friends));
}

// ── D. 초대 ──
{
  const e = await reg(h, "Eve");
  const f = await reg(h, "Fay");
  e.clientSend({ type: "friendRequest", nickname: "Fay" }); await tick();
  f.clientSend({ type: "friendRespond", nickname: "Eve", accept: true }); await tick();
  e.clientSend({ type: "createRoom" });
  await e.waitFor((m) => m.type === "lobby");
  const code = e.last("roomCreated").code;
  f.clear();
  e.clientSend({ type: "friendInvite", nickname: "Fay" }); await tick();
  chk("초대장 도착", f.last("friendInviteFrom")?.code === code, JSON.stringify(f.last("friendInviteFrom")));
  e.clear();
  e.clientSend({ type: "friendInvite", nickname: "Fay" }); await tick();
  chk("쿨다운으로 연타 차단", e.last("error")?.message?.includes("방금") === true, JSON.stringify(e.last("error")));
  // 상대가 이미 방에 있을 때
  f.clientSend({ type: "joinRoom", code });
  await f.waitFor((m) => m.type === "lobby");
  const g = await reg(h, "Gil");
  // 친구가 아닌 사람 초대
  e.clear();
  e.clientSend({ type: "friendInvite", nickname: "Gil" }); await tick();
  chk("친구 아닌 사람 초대 거부", e.last("error")?.message?.includes("친구에게만") === true, JSON.stringify(e.last("error")));
}

summary();
await cleanup();
process.exit(0);
