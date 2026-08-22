import { newHarness, speak, cleanup, tick } from "./harness.js";
const log = (t: string, ...a: unknown[]) => console.log(`\n=== ${t} ===`, ...a);

async function main() {
  // ⑬' 침입자의 열린 소켓: 피해자가 비번을 바꾼 **뒤**에 옛 비번으로 재변경되는가
  {
    log("⑬' 비번 변경 후 침입자가 옛 비번으로 다시 바꿀 수 있나");
    const { rm, db } = newHarness();
    const v = await speak(rm, { type: "register", username: "피해자", password: "goodpass123" });
    const bad = await speak(rm, { type: "login", username: "피해자", password: "goodpass123" });
    const before = v.last("authOk").sessionToken;
    v.clientSend({ type: "changePassword", currentPassword: "goodpass123", newPassword: "brandnew99" });
    await v.waitFor((m) => (m.type === "authOk" && m.sessionToken !== before) || m.type === "error", 5000);
    console.log("피해자 변경:", v.last("error") ? JSON.stringify(v.last("error")) : "성공");
    console.log("확인 — 옛 비번 로그인:", (await db.login("피해자", "goodpass123")).ok, "새 비번:", (await db.login("피해자", "brandnew99")).ok);
    bad.clear();
    bad.clientSend({ type: "changePassword", currentPassword: "goodpass123", newPassword: "hijacked12" });
    await bad.waitFor((m) => m.type === "authOk" || m.type === "error", 5000);
    console.log("침입자 재변경 결과:", JSON.stringify(bad.last("authOk") ?? bad.last("error")));
    console.log("최종: hijacked12 로 로그인되나:", (await db.login("피해자", "hijacked12")).ok);
    console.log("최종: brandnew99 로 로그인되나:", (await db.login("피해자", "brandnew99")).ok);
  }

  // ⑯ 게스트 방 예산 고갈 (프로토콜 수준)
  {
    log("⑯ 게스트→가입 반복으로 체험 방 예산이 새는가");
    const { rm } = newHarness();
    const rooms = (rm as any).rooms as Map<string, any>;
    for (let i = 0; i < 5; i++) {
      const { conn } = await import("./harness.js");
      const g = conn(rm, "5.5.5." + i, false);
      g.clientSend({ type: "guestPlay" });
      await g.waitFor((m) => m.type === "roomCreated", 8000);
      g.clientSend({ type: "register", username: "탈출자" + i, password: "goodpass123" });
      await g.waitFor((m) => m.type === "authOk" && m.sessionToken !== "", 8000);
    }
    await tick(300);
    console.log("남은 방 수:", rooms.size, "그중 guest:", [...rooms.values()].filter((r) => r.guest).length);
    console.log("phase:", [...rooms.values()].map((r) => r.phase).join(","));
  }

  // ⑰ 비밀번호 변경 중 대국 중이면?
  {
    log("⑰ 대국 중 비밀번호 변경 — 좌석/재접속 코드가 살아 있나");
    const { rm } = newHarness();
    const a = await speak(rm, { type: "register", username: "대국자", password: "goodpass123" });
    a.clientSend({ type: "practicePlay" });
    await a.waitFor((m) => m.type === "roomCreated", 8000);
    const code = a.last("roomCreated").code;
    await a.waitFor((m) => m.type === "view", 15000).catch(() => {});
    const before = a.last("authOk").sessionToken;
    a.clientSend({ type: "changePassword", currentPassword: "goodpass123", newPassword: "brandnew99" });
    await a.waitFor((m) => (m.type === "authOk" && m.sessionToken !== before) || m.type === "error", 8000);
    const ok = a.last("authOk");
    console.log("변경 authOk:", JSON.stringify(ok));
    console.log("resumeRoom 필드 있나:", "resumeRoom" in ok, "→ 클라가 방 기억을 유지하는지의 근거");
    const room = (rm as any).rooms.get(code);
    console.log("방 유지:", room !== undefined, room?.phase, "좌석:", room?.agents.map((x: any) => x.nickname));
    a.clear();
    a.clientSend({ type: "leaveRoom" });
    await tick(200);
    console.log("변경 뒤에도 판 조작 가능:", JSON.stringify(a.sent.map((m: any) => m.type)));
  }
  cleanup();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
