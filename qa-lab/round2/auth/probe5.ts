import { newHarness, conn, speak, cleanup, tick } from "./harness.js";
const log = (t: string, ...a: unknown[]) => console.log(`\n=== ${t} ===`, ...a);

async function main() {
  // ⑱ checkUsername 이 레이트리밋에 걸리면 usernameCheck 가 영영 안 온다
  {
    log("⑱ 레이트리밋에 걸린 중복확인은 답 자체가 없다 (클라 «확인 중…» 고착)");
    const { rm } = newHarness();
    const c = conn(rm, "8.8.8.8", false);
    let answered = 0, rate = 0;
    for (let i = 0; i < 16; i++) {
      c.clear();
      c.clientSend({ type: "checkUsername", username: "이름" + i });
      await tick(20);
      if (c.last("usernameCheck")) answered++;
      if (c.last("error")?.code === "RATE_LIMITED") rate++;
    }
    console.log("usernameCheck 응답:", answered, "RATE_LIMITED:", rate);
    console.log("→ RATE_LIMITED 를 받은 요청에는 usernameCheck 가 없다 = nameCheck 가 'checking' 에 갇힌다");
    // 로그인 실패가 중복확인 예산을 먹는다 (반대도 성립)
    const d = conn(rm, "8.8.8.9", false);
    for (let i = 0; i < 12; i++) { d.clientSend({ type: "checkUsername", username: "탐색" + i }); await tick(10); }
    d.clear();
    d.clientSend({ type: "login", username: "아무나", password: "goodpass123" });
    await tick(200);
    console.log("중복확인 12회 뒤 로그인:", JSON.stringify(d.last("error") ?? d.last("authOk")));
  }

  // ⑲ 공백만으로 된 비밀번호
  {
    log("⑲ 공백 8자 비밀번호");
    const { rm } = newHarness();
    const a = await speak(rm, { type: "register", username: "공백맨", password: "        " });
    console.log("가입:", JSON.stringify(a.last("authOk") ?? a.last("error")));
    const b = await speak(rm, { type: "login", username: "공백맨", password: "        " });
    console.log("로그인:", b.last("authOk") !== undefined);
    // 클라이언트는 username 을 trim 하지만 password 는 trim 하지 않는다 → 서버도 안 한다(일관)
  }

  // ⑳ 이미 로그인한 연결에서 새 계정 가입 → 신원 교체 + 앞 계정 대기실 좌석
  {
    log("⑳ 대기실에 앉은 채 다른 계정으로 가입/로그인");
    const { rm } = newHarness();
    const a = await speak(rm, { type: "register", username: "방장이", password: "goodpass123" });
    a.clientSend({ type: "createRoom" });
    await a.waitFor((m) => m.type === "roomCreated", 5000);
    const code = a.last("roomCreated").code;
    a.clientSend({ type: "register", username: "새사람", password: "goodpass123" });
    await a.waitFor((m) => m.type === "authOk" && m.username === "새사람", 5000);
    await tick(100);
    const rooms = (rm as any).rooms as Map<string, any>;
    console.log("앞 방 남아있나:", rooms.has(code), "좌석 수:", rooms.get(code)?.agents.length);
  }

  // ㉑ 로그아웃한 뒤 옛 토큰으로 tokenLogin (다른 연결)
  {
    log("㉑ 로그아웃 뒤 옛 토큰");
    const { rm } = newHarness();
    const a = await speak(rm, { type: "register", username: "토큰맨", password: "goodpass123" });
    const t = a.last("authOk").sessionToken;
    a.clientSend({ type: "logout" });
    await tick(50);
    const b = conn(rm);
    b.clientSend({ type: "tokenLogin", sessionToken: t });
    await b.waitFor((m) => m.type === "authOk" || m.type === "error", 5000);
    console.log("옛 토큰 재사용:", JSON.stringify(b.last("error") ?? b.last("authOk")));
  }
  cleanup();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
