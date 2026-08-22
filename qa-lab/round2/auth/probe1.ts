/** 확정 후보 ①~④ 재현 */
import { newHarness, conn, speak, cleanup, tick } from "./harness.js";

function log(t: string, ...a: unknown[]) { console.log(`\n=== ${t} ===`, ...a); }

async function main() {
  // ── ① 게스트 연결에서 곧바로 register/login 하면 conn.guest 가 안 풀린다 ──
  {
    log("① 게스트 → (logout 없이) register 하면 계정인데 게스트 감옥");
    const { rm } = newHarness();
    const g = conn(rm);
    g.clientSend({ type: "guestPlay" });
    await g.waitFor((m) => m.type === "authOk");
    console.log("guest authOk:", JSON.stringify(g.last("authOk")));
    g.clear();
    g.clientSend({ type: "register", username: "손님출신", password: "goodpass123" });
    await g.waitFor((m) => m.type === "authOk" || m.type === "error");
    console.log("register 결과:", JSON.stringify(g.last("authOk") ?? g.last("error")));
    g.clear();
    g.clientSend({ type: "createRoom" });
    await tick(30);
    console.log("createRoom 응답:", JSON.stringify(g.last("error") ?? g.last("roomCreated")));
    g.clear();
    g.clientSend({ type: "statsRequest" });
    g.clientSend({ type: "leaderboard" });
    g.clientSend({ type: "changePassword", currentPassword: "goodpass123", newPassword: "otherpass9" });
    await tick(80);
    console.log("statsRequest/leaderboard/changePassword:", JSON.stringify(g.all("error")));
  }

  // ── ② tokenLogin 으로도 같은가 ──
  {
    log("② 게스트 연결에서 tokenLogin");
    const { rm } = newHarness();
    const a = await speak(rm, { type: "register", username: "정상계정", password: "goodpass123" });
    const token = a.last("authOk").sessionToken as string;
    const g = conn(rm);
    g.clientSend({ type: "guestPlay" });
    await g.waitFor((m) => m.type === "authOk");
    g.clear();
    g.clientSend({ type: "tokenLogin", sessionToken: token });
    await g.waitFor((m) => m.type === "authOk" || m.type === "error");
    console.log("tokenLogin authOk:", JSON.stringify(g.last("authOk")));
    g.clear();
    g.clientSend({ type: "createRoom" });
    await tick(30);
    console.log("createRoom:", JSON.stringify(g.last("error") ?? g.last("roomCreated")));
  }

  // ── ③ 비밀번호 변경이 **열려 있는 소켓**을 끊는가 ──
  {
    log("③ 비밀번호 변경 뒤에도 침입자의 열린 소켓이 그대로 산다");
    const { rm } = newHarness();
    const victim = await speak(rm, { type: "register", username: "피해자", password: "goodpass123" });
    const vtok = victim.last("authOk").sessionToken as string;
    // 침입자가 훔친 비밀번호로 별도 연결에서 로그인
    const bad = await speak(rm, { type: "login", username: "피해자", password: "goodpass123" });
    console.log("침입자 로그인:", bad.last("authOk") !== undefined);
    // 피해자가 비밀번호 변경
    victim.clear();
    victim.clientSend({ type: "changePassword", currentPassword: "goodpass123", newPassword: "brandnew99" });
    await victim.waitFor((m) => m.type === "authOk" || m.type === "error");
    console.log("변경 결과:", JSON.stringify(victim.last("authOk") ?? victim.last("error")));
    await tick(30);
    console.log("침입자 소켓 닫힘?:", bad.closed);
    bad.clear();
    bad.clientSend({ type: "createRoom" });
    bad.clientSend({ type: "statsRequest" });
    bad.clientSend({ type: "replayList" });
    await tick(60);
    console.log("침입자가 계속 쓸 수 있는가:", JSON.stringify(bad.sent.map((m) => m.type)));
    // 침입자가 스스로 새 세션을 발급받을 수 있나? changePassword 로 비번 재변경
    bad.clear();
    bad.clientSend({ type: "changePassword", currentPassword: "brandnew99", newPassword: "hijack1234" });
    await tick(200);
    console.log("침입자 비번 재변경(옛 비번 모름 → 실패해야):", JSON.stringify(bad.last("error") ?? bad.last("authOk")));
    void vtok;
  }

  // ── ④ logoutOthers 도 마찬가지 + 레이트리밋 없음 ──
  {
    log("④ logoutOthers — 열린 소켓은 안 끊긴다 / 레이트리밋 미적용");
    const { rm } = newHarness();
    const me = await speak(rm, { type: "register", username: "본인", password: "goodpass123" });
    const other = await speak(rm, { type: "login", username: "본인", password: "goodpass123" });
    me.clear();
    me.clientSend({ type: "logoutOthers" });
    await me.waitFor((m) => m.type === "error");
    console.log("logoutOthers:", JSON.stringify(me.last("error")));
    await tick(30);
    console.log("다른 기기 소켓 닫힘?:", other.closed);
    other.clear();
    other.clientSend({ type: "createRoom" });
    await tick(30);
    console.log("다른 기기 여전히 사용 가능:", JSON.stringify(other.last("roomCreated") ?? other.last("error")));
  }
  cleanup();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
