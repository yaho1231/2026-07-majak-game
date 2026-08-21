/**
 * 세션 회수와 게스트 표식 정리 (QA 2차 auth, 2026-08-22).
 *
 * 여기서 못을 박는 것은 **약속과 실제가 갈리던 네 자리**다.
 *
 * ① 「비밀번호를 바꾸면 다른 기기의 로그인이 전부 끊깁니다」 · 「다른 기기 N곳의
 *    로그인을 끊었습니다」 — 둘 다 화면이 **단언**하는 문장이다. 그런데 실제로
 *    끊기는 것은 DB의 `sessions` 행뿐이었다. `conn.user`는 인증할 때 한 번
 *    캐시되고 다시 검증되지 않으므로(`evictUser` 주석이 적은 바로 그 사실),
 *    **이미 열려 있는 소켓은 아무 일도 겪지 않았다.** 계정을 되찾으려고 누른
 *    버튼이 아무것도 되찾지 못하면서 되찾았다고 말하는 것이 가장 나쁘다.
 *
 * ② `guestPlay` 뒤에 `login`/`register`가 오면 `conn.guest`가 안 풀렸다. 인증은
 *    성공하고 클라이언트는 홈을 그리는데, 그 홈의 모든 카드가 게스트
 *    화이트리스트에 걸려 `GUEST_FORBIDDEN`으로 거절당했다.
 *
 * ③ 같은 경로에서 체험 방이 **유령으로 남았다.** `phase:"playing"`이라 유휴
 *    청소가 의도적으로 건너뛴다 → `MAX_GUEST_ROOMS`(16) 예산을 영구히 문다.
 *
 * ④ 공백만으로 이루어진 비밀번호가 통과했고, `changePassword`는 입력 타입을
 *    보지 않아 비문자열 하나로 서버 로그에 스택 트레이스를 찍을 수 있었다.
 *
 * FakeSocket 방식은 `PasswordChangeLogin.test.ts`와 같다(실제 네트워크 없음).
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
  private waiters: {
    pred: (m: any) => boolean;
    resolve: () => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];

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
    if (this.readyState === 3) return;
    this.readyState = 3;
    for (const cb of this.handlers.close ?? []) cb();
  }

  clientSend(msg: unknown): void {
    for (const cb of this.handlers.message ?? []) cb(Buffer.from(JSON.stringify(msg)));
  }

  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
  }

  errors(): any[] {
    return this.sent.filter((m) => m.type === "error");
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

async function newHarness(): Promise<RoomManager> {
  const replayDir = await mkdtemp(join(tmpdir(), "majak-revoke-"));
  dirs.push(replayDir);
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const manager = new RoomManager(replayDir, undefined, 0, db);
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

/** 이벤트 루프를 한 바퀴 돌려 준다 — 동기 처리 뒤의 뒷정리를 기다릴 때. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

afterEach(async () => {
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  await tick();
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

describe("세션 회수는 열려 있는 소켓까지 끊는다", () => {
  it("비밀번호 변경 — 다른 기기의 탭이 그 자리에서 끊긴다 (내 탭은 산다)", async () => {
    const rm = await newHarness();
    const mine = await speak(rm, {
      type: "register",
      username: "주인장",
      password: "goodpass1234",
    });
    // 다른 기기 = 같은 계정으로 연 두 번째 연결.
    const other = await speak(rm, {
      type: "login",
      username: "주인장",
      password: "goodpass1234",
    });
    expect(other.last("authOk")).toBeDefined();
    expect(other.readyState).toBe(1);

    const before = mine.last("authOk").sessionToken as string;
    mine.clientSend({
      type: "changePassword",
      currentPassword: "goodpass1234",
      newPassword: "brandnew5678",
    });
    await mine.waitFor((m) => m.type === "authOk" && m.sessionToken !== before);

    // 남의 손에 있던 탭은 사유를 듣고 닫힌다.
    expect(other.last("error")?.code).toBe("SESSION_REVOKED");
    expect(other.readyState).toBe(3);
    // 내 탭은 그대로 산다 — 비밀번호를 바꿨다고 자기 자신이 쫓겨나면 안 된다.
    expect(mine.readyState).toBe(1);

    // 끊긴 연결은 **권한도 잃는다**: 계속 말을 걸어도 다시 인증하라고 답해야 한다.
    other.readyState = 1; // 소켓만 되살려 서버 쪽 상태를 확인한다
    other.sent.length = 0;
    other.clientSend({ type: "replayList" });
    await tick();
    expect(other.last("replayList")).toBeUndefined();
  });

  it("다른 기기에서 로그아웃 — 소켓을 끊고, 그 수를 문구에 싣는다", async () => {
    const rm = await newHarness();
    const mine = await speak(rm, {
      type: "register",
      username: "여러기기",
      password: "goodpass1234",
    });
    const a = await speak(rm, { type: "login", username: "여러기기", password: "goodpass1234" });
    const b = await speak(rm, { type: "login", username: "여러기기", password: "goodpass1234" });

    mine.clientSend({ type: "logoutOthers" });
    await mine.waitFor((m) => m.type === "error" && m.code === "SESSIONS_CLEARED");

    expect(a.readyState).toBe(3);
    expect(b.readyState).toBe(3);
    expect(a.last("error")?.code).toBe("SESSION_REVOKED");
    expect(mine.readyState).toBe(1);
    // 문구는 실제로 끊은 수를 말해야 한다.
    expect(mine.last("error").message).toContain("2곳");
  });

  it("끊을 것이 없으면 없다고 답한다 (거짓 안심을 주지 않는다)", async () => {
    const rm = await newHarness();
    const only = await speak(rm, {
      type: "register",
      username: "혼자쓴다",
      password: "goodpass1234",
    });
    only.clientSend({ type: "logoutOthers" });
    await only.waitFor((m) => m.type === "error" && m.code === "SESSIONS_CLEARED");
    expect(only.last("error").message).toContain("없습니다");
    expect(only.readyState).toBe(1);
  });
});

describe("게스트였던 연결이 계정으로 올라선다", () => {
  for (const how of ["register", "login"] as const) {
    it(`체험 뒤 ${how} — 게스트 표식이 풀리고 홈이 거부당하지 않는다`, async () => {
      const rm = await newHarness();
      if (how === "login") {
        // 로그인할 계정을 미리 만들어 둔다(다른 연결에서).
        const pre = await speak(rm, {
          type: "register",
          username: "미리가입",
          password: "goodpass1234",
        });
        pre.close();
      }

      const sock = new FakeSocket();
      rm.handleConnection(sock.asWs());
      sock.clientSend({ type: "guestPlay", mode: "tonpuu" });
      await sock.waitFor((m) => m.type === "authOk" && m.guest === true);
      const roomsWithGuest = rm.healthSnapshot().rooms;
      expect(roomsWithGuest).toBeGreaterThan(0);

      sock.sent.length = 0;
      sock.clientSend(
        how === "register"
          ? { type: "register", username: "올라선사람", password: "goodpass1234" }
          : { type: "login", username: "미리가입", password: "goodpass1234" },
      );
      await sock.waitFor((m) => m.type === "authOk" && m.guest !== true);

      // ② 홈의 요청이 게스트 화이트리스트에 걸리면 안 된다.
      sock.sent.length = 0;
      sock.clientSend({ type: "statsRequest" });
      sock.clientSend({ type: "replayList" });
      sock.clientSend({ type: "friendList" });
      await tick();
      const codes = sock.errors().map((e) => e.code);
      expect(codes).not.toContain("GUEST_FORBIDDEN");
      expect(codes).not.toContain("AUTH_REQUIRED");
      expect(sock.last("replayList")).toBeDefined();

      // ③ 붙들고 있던 체험 방이 유령으로 남지 않는다.
      expect(rm.healthSnapshot().rooms).toBe(roomsWithGuest - 1);
    });
  }
});

describe("비밀번호 입력 검증", () => {
  it("공백만으로 이루어진 비밀번호는 가입할 수 없다", async () => {
    const rm = await newHarness();
    const sock = await speak(rm, {
      type: "register",
      username: "공백맨",
      password: "        ",
    });
    expect(sock.last("authOk")).toBeUndefined();
    expect(sock.last("error")?.code).toBe("REGISTER_FAILED");
    expect(sock.last("error").message).toContain("공백");
  });

  it("changePassword에 비문자열이 오면 던지지 않고 거절한다", async () => {
    const rm = await newHarness();
    const sock = await speak(rm, {
      type: "register",
      username: "형식검사",
      password: "goodpass1234",
    });
    sock.sent.length = 0;
    sock.clientSend({
      type: "changePassword",
      currentPassword: { a: 1 },
      newPassword: "brandnew5678",
    });
    await sock.waitFor((m) => m.type === "error");
    // `INTERNAL`(= scrypt가 던졌다 = 서버 로그에 스택)이 아니라 형식 거절이어야 한다.
    expect(sock.last("error").code).toBe("PASSWORD_CHANGE_FAILED");
    expect(sock.readyState).toBe(1);
  });
});
