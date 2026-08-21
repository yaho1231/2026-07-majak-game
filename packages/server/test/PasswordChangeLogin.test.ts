/**
 * 비밀번호를 바꾼 **뒤에도 로그인된다** (2026-08-21 사용자 보고).
 *
 * 보고: "내 원래 계정을 비밀번호 변경한 뒤 다시 로그인하는데 안 된다 —
 * 닉네임·비밀번호는 정상인데."
 *
 * 비밀번호 변경은 **모든 세션을 끊는다**(§10-2). 그래서 바꾼 뒤에 남는 길은
 * 새 비밀번호로 다시 로그인하는 것 하나뿐이다 — 그 길이 막히면 계정이 통째로
 * 잠긴다. 되돌릴 방법이 사용자 쪽에 없다는 뜻이라, 이 경로는 못을 박아 둔다.
 *
 * 여기서 지키는 선:
 *  - 바꾼 **새** 비밀번호로 **새 연결**에서 로그인된다 (같은 연결의 잔여 상태에
 *    기대지 않는다 — 실제 사용자는 브라우저를 다시 열고 온다).
 *  - **옛** 비밀번호는 더 이상 통하지 않는다 (바꾼 것이 실제로 반영됐다).
 *  - 앞뒤 공백은 로그인·가입과 **같은 규칙**으로 다듬는다 — 붙여넣기에 딸려 온
 *    공백 하나로 "닉네임은 맞는데 안 들어가진다"가 되면 안 된다.
 *  - 변경 뒤 받은 새 세션 토큰으로도 붙는다 (끊긴 것은 **남의** 세션이지 내 것이 아니다).
 *
 * Guest/LoginAndAdmin 과 같은 FakeSocket 방식(실제 네트워크 없음).
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { SiteDb } from "../src/SiteDb.js";

class FakeSocket {
  readyState = 1; // OPEN
  sent: any[] = [];
  private handlers: Record<string, ((...a: any[]) => void)[]> = {};
  private waiters: { pred: (m: any) => boolean; resolve: () => void; timer: ReturnType<typeof setTimeout> }[] = [];

  send(data: string): void {
    const msg = JSON.parse(data);
    this.sent.push(msg);
    this.waiters = this.waiters.filter((w) => {
      if (w.pred(msg)) {
        clearTimeout(w.timer);
        w.resolve();
        return false;
      }
      return true;
    });
  }

  on(event: string, cb: (...a: any[]) => void): void {
    (this.handlers[event] ??= []).push(cb);
  }

  close(): void {
    this.readyState = 3;
    for (const cb of this.handlers.close ?? []) cb();
  }

  clientSend(msg: unknown): void {
    for (const cb of this.handlers.message ?? []) cb(Buffer.from(JSON.stringify(msg)));
  }

  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
  }

  waitFor(pred: (m: any) => boolean, timeoutMs = 20_000): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }

  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

const dirs: string[] = [];
const dbs: SiteDb[] = [];
const managers: RoomManager[] = [];

/** 가입 게이트를 **켠 채로** 세운다 — 공개 서버와 같은 조건이다. */
async function newHarness(signupCode = ""): Promise<RoomManager> {
  const replayDir = await mkdtemp(join(tmpdir(), "majak-pwchange-"));
  dirs.push(replayDir);
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const manager = new RoomManager(replayDir, undefined, 0, db, signupCode);
  managers.push(manager);
  return manager;
}

/** 새 연결을 열고 메시지 하나를 보낸 뒤 인증 결과를 기다린다. */
async function speak(rm: RoomManager, msg: unknown): Promise<FakeSocket> {
  const sock = new FakeSocket();
  rm.handleConnection(sock.asWs());
  sock.clientSend(msg);
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

afterEach(async () => {
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  await new Promise((r) => setTimeout(r, 0));
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

const GATE = "테스트가입코드1234567890";

describe("비밀번호를 바꾼 뒤 새 비밀번호로 로그인된다", () => {
  it("새 연결에서 새 비밀번호로 들어간다 — 옛 비밀번호는 막힌다", async () => {
    const rm = await newHarness(GATE);
    const first = await speak(rm, {
      type: "register",
      username: "바꿀사람",
      password: "oldpass1234",
      signupCode: GATE,
    });
    expect(first.last("authOk")).toBeDefined();
    // ⚠ 기다리기 **전에** 잡아 둔다 — `last("authOk")`는 새 것이 도착하면 새 것을
    // 가리켜, 예전 값과 비교하려던 술어가 자기 자신과 비교하게 된다.
    const before = first.last("authOk").sessionToken as string;

    first.clientSend({
      type: "changePassword",
      currentPassword: "oldpass1234",
      newPassword: "newpass5678",
    });
    // 성공하면 **새 세션 토큰이 실린 authOk**가 한 번 더 온다.
    await first.waitFor((m) => (m.type === "authOk" && m.sessionToken !== before) || m.type === "error");
    const changed = first.last("authOk");
    expect(first.last("error")).toBeUndefined();

    // ① 새 비밀번호 — 들어가야 한다. 여기가 막히면 계정이 통째로 잠긴다.
    const good = await speak(rm, { type: "login", username: "바꿀사람", password: "newpass5678" });
    expect(good.last("error")).toBeUndefined();
    expect(good.last("authOk").username).toBe("바꿀사람");

    // ② 옛 비밀번호 — 막혀야 한다. 안 막히면 바뀐 게 아니다.
    const stale = await speak(rm, { type: "login", username: "바꿀사람", password: "oldpass1234" });
    expect(stale.last("authOk")).toBeUndefined();
    expect(stale.last("error").code).toBe("LOGIN_FAILED");

    // ③ 변경 때 받은 새 토큰도 그대로 통한다 — 끊긴 것은 **남의** 세션이다.
    const byToken = await speak(rm, { type: "tokenLogin", sessionToken: changed.sessionToken });
    expect(byToken.last("authOk").username).toBe("바꿀사람");
  });

  it("변경 **전에** 받아 둔 토큰은 끊긴다 (남의 손에 있을 세션을 회수한다)", async () => {
    const rm = await newHarness(GATE);
    const first = await speak(rm, {
      type: "register",
      username: "회수대상",
      password: "oldpass1234",
      signupCode: GATE,
    });
    const oldToken = first.last("authOk").sessionToken as string;

    first.clientSend({
      type: "changePassword",
      currentPassword: "oldpass1234",
      newPassword: "newpass5678",
    });
    await first.waitFor((m) => m.type === "authOk" && m.sessionToken !== oldToken);

    const dead = await speak(rm, { type: "tokenLogin", sessionToken: oldToken });
    expect(dead.last("authOk")).toBeUndefined();
    expect(dead.last("error").code).toBe("TOKEN_INVALID");
  });

  it("가입 게이트가 켜져 있어도 **로그인은 코드를 묻지 않는다**", async () => {
    /*
     * 사용자 보고의 다른 절반이다: "로그인 화면에서 또 가입 코드가 필요하다고 나온다."
     * 서버 쪽에서 그 문구가 로그인 경로로 샐 길이 없다는 것을 여기서 못 박는다 —
     * `SIGNUP_CODE_REQUIRED` 는 `register` 분기에만 있어야 한다.
     */
    const rm = await newHarness(GATE);
    await speak(rm, { type: "register", username: "코드무관", password: "pass12345678", signupCode: GATE });

    const ok = await speak(rm, { type: "login", username: "코드무관", password: "pass12345678" });
    expect(ok.last("authOk").username).toBe("코드무관");

    const bad = await speak(rm, { type: "login", username: "코드무관", password: "틀린비번12345" });
    expect(bad.last("error").code).toBe("LOGIN_FAILED");
    expect(bad.last("error").message).not.toMatch(/코드/);
  });
});

describe("닉네임 앞뒤 공백은 로그인·가입이 같은 규칙으로 다듬는다", () => {
  /*
   * 가입은 `username.trim()` 으로 저장하고 로그인도 `username.trim()` 으로 찾는다.
   * 둘이 갈리면 "가입은 됐는데 로그인이 안 되는" 계정이 생긴다 — 붙여넣기에 딸려
   * 온 공백 하나로 계정이 잠기는 종류의 사고다.
   */
  it("공백을 붙여 보낸 로그인도 같은 계정을 찾는다", async () => {
    const rm = await newHarness();
    await speak(rm, { type: "register", username: "  공백사람  ", password: "pass12345678" });
    const ok = await speak(rm, { type: "login", username: " 공백사람 ", password: "pass12345678" });
    expect(ok.last("authOk").username).toBe("공백사람");
  });
});
