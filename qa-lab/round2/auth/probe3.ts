import { newHarness, conn, speak, cleanup, tick } from "./harness.js";
const log = (t: string, ...a: unknown[]) => console.log(`\n=== ${t} ===`, ...a);
const types = (s: any) => JSON.stringify([...new Set(s.sent.map((m: any) => m.type + (m.code ? ":" + m.code : "")))]);

async function main() {
  // ⑪ 대국 중 다른 계정으로 로그인
  {
    log("⑪ 대국 중 다른 계정으로 로그인");
    const { rm } = newHarness();
    const a = await speak(rm, { type: "register", username: "갑돌이", password: "goodpass123" });
    await speak(rm, { type: "register", username: "을순이", password: "goodpass123" });
    a.clientSend({ type: "practicePlay" });
    await a.waitFor((m) => m.type === "roomCreated", 5000);
    const code = a.last("roomCreated").code;
    await a.waitFor((m) => m.type === "draftOffer" || m.type === "prompt" || m.type === "view", 15000).catch(() => {});
    console.log("판 시작. 방:", code, types(a));
    a.clear();
    a.clientSend({ type: "login", username: "을순이", password: "goodpass123" });
    await a.waitFor((m) => m.type === "authOk", 5000);
    console.log("이제 이 소켓의 신원 = 을순이. authOk:", JSON.stringify(a.last("authOk")));
    a.clear();
    await tick(1500);
    const room = (rm as any).rooms.get(code);
    console.log("갑돌이 방 상태:", room?.phase, "좌석:", room?.agents.map((x: any) => x.nickname));
    console.log("로그인 후 이 소켓에 계속 오는 메시지:", types(a));
    // 을순이가 그 방에 다시 들어갈 수 있나 (갑돌이 자리)
    a.clear();
    a.clientSend({ type: "joinRoom", code });
    await tick(200);
    console.log("을순이로 갑돌이 방 참가:", types(a));
  }

  // ⑫ guestResume 을 다른 토큰으로 연달아 → 앞 체험 방이 유령으로 남는가
  {
    log("⑫ 게스트 연결이 다른 체험 방으로 갈아타면 앞 방이 남는가");
    const { rm } = newHarness();
    const g1 = conn(rm);
    g1.clientSend({ type: "guestPlay" });
    await g1.waitFor((m) => m.type === "roomCreated");
    const tok1 = g1.last("authOk").guestToken;
    const codeA = g1.last("roomCreated").code;
    const g2 = conn(rm);
    g2.clientSend({ type: "guestPlay" });
    await g2.waitFor((m) => m.type === "roomCreated");
    const codeB = g2.last("roomCreated").code;
    console.log("방 2개:", codeA, codeB, (rm as any).rooms.size);
    // g2 가 g1 의 토큰으로 resume (토큰을 알면 남의 체험 판을 뺏는가)
    g2.clear();
    g2.clientSend({ type: "guestResume", token: tok1 });
    await tick(300);
    console.log("g2 → g1방 resume:", types(g2));
    const rooms = (rm as any).rooms as Map<string, any>;
    console.log("방 수:", rooms.size, "codeA:", rooms.has(codeA), "codeB:", rooms.has(codeB));
    console.log("g1 소켓 상태:", g1.closed, "g1 최근:", types(g1));
  }

  // ⑬ 침입자가 옛 비밀번호로 재변경 시도 (③의 경계 확인)
  {
    log("⑬ 침입자는 열린 소켓으로 비밀번호를 다시 바꿀 수 있나");
    const { rm } = newHarness();
    const v = await speak(rm, { type: "register", username: "피해자", password: "goodpass123" });
    const bad = await speak(rm, { type: "login", username: "피해자", password: "goodpass123" });
    v.clientSend({ type: "changePassword", currentPassword: "goodpass123", newPassword: "brandnew99" });
    await v.waitFor((m) => m.type === "authOk" && m.sessionToken !== undefined, 5000);
    await tick(50);
    bad.clear();
    bad.clientSend({ type: "changePassword", currentPassword: "goodpass123", newPassword: "hijacked12" });
    await tick(300);
    console.log("옛 비번으로 재변경:", JSON.stringify(bad.last("error") ?? bad.last("authOk")));
    // 하지만 관리자였다면? 관리자 권한도 그대로 유지되는지
    bad.clear();
    bad.clientSend({ type: "replayList" }); bad.clientSend({ type: "feedbackList" }); bad.clientSend({ type: "friendList" });
    await tick(200);
    console.log("침입자 계속 접근:", types(bad));
  }

  // ⑭ 저장소에 평문이 남는가
  {
    log("⑭ DB 평문 검사");
    const os = await import("node:os"); const fs = await import("node:fs"); const path = await import("node:path");
    const dbPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "majak-qa-db-")), "site.db");
    const { rm, db } = newHarness({ dbPath });
    const a = await speak(rm, { type: "register", username: "평문검사", password: "SuperSecret9!" });
    const tok = a.last("authOk").sessionToken;
    await tick(50);
    const buf = fs.readFileSync(dbPath).toString("latin1") + (fs.existsSync(dbPath + "-wal") ? fs.readFileSync(dbPath + "-wal").toString("latin1") : "");
    console.log("비밀번호 평문 존재:", buf.includes("SuperSecret9!"));
    console.log("세션 토큰 평문 존재:", buf.includes(tok));
    const st = fs.statSync(dbPath); console.log("DB 권한:", (st.mode & 0o777).toString(8));
    void db;
  }

  // ⑮ 레이트리밋: 실패한 로그인이 세는가 / logoutOthers 는 안 세는가
  {
    log("⑮ 레이트리밋");
    const { rm } = newHarness();
    await speak(rm, { type: "register", username: "표적계정", password: "goodpass123" }, "9.9.9.1", false);
    const c = conn(rm, "9.9.9.2", false);
    let blocked = -1;
    for (let i = 0; i < 20; i++) {
      c.clear();
      c.clientSend({ type: "login", username: "표적계정", password: "wrongpass" + i });
      await c.waitFor((m) => m.type === "error" || m.type === "authOk", 5000);
      if (c.last("error")?.code === "RATE_LIMITED") { blocked = i; break; }
    }
    console.log("연결당 로그인 시도 차단 지점:", blocked, "(AUTH_MAX_ATTEMPTS=12)");
    // logoutOthers 는 레이트리밋 창을 태우나?
    const d = await speak(rm, { type: "login", username: "표적계정", password: "goodpass123" }, "9.9.9.3", false);
    let n = 0; d.clear();
    for (let i = 0; i < 200; i++) { d.clientSend({ type: "logoutOthers" }); }
    await tick(200);
    n = d.all("error").filter((m: any) => m.code === "RATE_LIMITED").length;
    console.log("logoutOthers 200회 중 RATE_LIMITED:", n, "/ 응답:", d.all("error").length);
  }
  cleanup();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
