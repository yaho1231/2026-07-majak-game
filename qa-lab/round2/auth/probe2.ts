import { newHarness, conn, speak, cleanup, tick } from "./harness.js";
const log = (t: string, ...a: unknown[]) => console.log(`\n=== ${t} ===`, ...a);

async function main() {
  // ⑤ 게스트 → register (logout 없이) → 체험 방이 유령으로 남는가
  {
    log("⑤ 게스트가 로그아웃 없이 가입하면 체험 방이 봇만 남긴 채 계속 돈다");
    const { rm } = newHarness();
    const g = conn(rm);
    g.clientSend({ type: "guestPlay" });
    await g.waitFor((m) => m.type === "roomCreated");
    const code = g.last("roomCreated").code as string;
    console.log("체험 방:", code, "방 수:", (rm as any).rooms.size);
    g.clientSend({ type: "register", username: "탈출자", password: "goodpass123" });
    await g.waitFor((m) => m.type === "authOk" && m.sessionToken !== "");
    await tick(200);
    const rooms = (rm as any).rooms as Map<string, any>;
    console.log("가입 후 방 수:", rooms.size, "그 방 남아있나:", rooms.has(code), "phase:", rooms.get(code)?.phase);
    // 게스트 방 예산을 계속 먹는가
    console.log("guest room 수:", [...rooms.values()].filter((r) => r.guest).length);
  }

  // ⑥ 이미 로그인한 연결에서 다른 계정으로 로그인 — 대국 중 좌석은?
  {
    log("⑥ 대국 중 다른 계정으로 로그인하면 좌석이 어떻게 되나");
    const { rm } = newHarness();
    const a = await speak(rm, { type: "register", username: "갑", password: "goodpass123" });
    await speak(rm, { type: "register", username: "을", password: "goodpass123" });
    a.autoRespond = false;
    a.clientSend({ type: "practicePlay" });
    await a.waitFor((m) => m.type === "roomCreated", 5000).catch(() => console.log("practicePlay 응답:", JSON.stringify(a.sent.map((m:any)=>m.type+(m.code?":"+m.code:"")))));
    if (a.last("roomCreated") === undefined) { console.log("skip"); } else {
    const code = a.last("roomCreated").code;
    await a.waitFor((m) => m.type === "view" || m.type === "prompt" || m.type === "draftOffer", 15000).catch(() => {});
    a.clear();
    a.clientSend({ type: "login", username: "을", password: "goodpass123" });
    await a.waitFor((m) => m.type === "authOk" || m.type === "error", 5000).catch(()=>console.log("login 무응답"));
    await tick(300);
    const room = (rm as any).rooms.get(code);
    console.log("방 남아있나:", room !== undefined, "phase:", room?.phase);
    console.log("로그인 후에도 그 판의 메시지가 이 소켓에 오는가:", JSON.stringify([...new Set(a.sent.map((m: any) => m.type))]));
    }
  }

  // ⑦ 닉네임 규칙 스윕
  {
    log("⑦ 닉네임 규칙");
    const { rm, db } = newHarness();
    const names = ["가", "가나", " 여백 ", "ㅋㅋ", "가́나", "abc def", "Bot_x", "ADMIN", "__proto__",
                   "테스트​", "AAAA", "aaaa", "a".repeat(13), "ab\nc", "𝒜𝒜", "🙂🙂", "히읗ᄒ", "ｆｕｌｌ"];
    for (const n of names) {
      const r = await db.register(n, "goodpass123");
      console.log(JSON.stringify(n), "→", r.ok ? "OK(" + r.user!.username + ")" : r.error);
    }
    // 대소문자 중복
    console.log("대소문자 재가입:", JSON.stringify(await db.register("AAAA".toLowerCase(), "goodpass123")));
    const li = await db.login("aAaA", "goodpass123");
    console.log("대소문자 로그인:", li.ok ? "OK " + li.user!.username : li.error);
    void rm;
  }

  // ⑧ 비밀번호 규칙
  {
    log("⑧ 비밀번호 규칙");
    const { db } = newHarness();
    const pws = ["1234567", "12345678", "        ", "goodpass123", "a".repeat(73), "닉네임포함xx"];
    let i = 0;
    for (const p of pws) {
      const r = await db.register("유저" + (i++), p);
      console.log(JSON.stringify(p.slice(0, 20) + (p.length > 20 ? `…(${p.length})` : "")), "→", r.ok ? "OK" : r.error);
    }
    // 공백만 8자
    console.log("공백8자 로그인 되나:", (await db.login("유저2", "        ")).ok);
  }

  // ⑨ 세션: 로그아웃 후 토큰 재사용 / 만료
  {
    log("⑨ 세션 토큰");
    const { rm, db } = newHarness({ sessionTtlMs: 50 });
    const a = await speak(rm, { type: "register", username: "세션이", password: "goodpass123" });
    const t = a.last("authOk").sessionToken;
    console.log("즉시 tokenLogin:", db.loginByToken(t) !== null);
    await tick(80);
    console.log("TTL(50ms) 뒤:", db.loginByToken(t) !== null);
    // 로그아웃 후 재사용
    const { rm: rm2, db: db2 } = newHarness();
    const b = await speak(rm2, { type: "register", username: "세션이", password: "goodpass123" });
    const t2 = b.last("authOk").sessionToken;
    b.clientSend({ type: "logout" });
    await tick(30);
    console.log("logout 뒤 토큰:", db2.loginByToken(t2) !== null);
  }

  // ⑩ 세션 상한 10 — 11번째 로그인이 첫 번째를 죽이는가
  {
    log("⑩ 동시 로그인 상한");
    const { db } = newHarness();
    await db.register("다기기", "goodpass123");
    const toks: string[] = [];
    for (let i = 0; i < 12; i++) { const r = await db.login("다기기", "goodpass123"); toks.push(r.sessionToken!); }
    console.log("살아있는 토큰 수:", toks.filter((t) => db.loginByToken(t) !== null).length, "/12");
  }
  cleanup();
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
