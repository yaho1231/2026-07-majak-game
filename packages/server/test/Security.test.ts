/**
 * 보안 회귀 테스트 — 2026-08-05 감사에서 실제로 뚫려 있던 자리들.
 *
 * 각 테스트는 "이 방어가 꺼지면 무엇이 가능해지는가"를 그대로 재현한다.
 * FakeSocket으로 네트워크 없이 RoomManager 경로를 그대로 태운다.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager, abuseKeyOf } from "../src/RoomManager.js";
import { SiteDb, safeEqual } from "../src/SiteDb.js";
import { StatsStore } from "../src/StatsStore.js";

class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  closed: { code?: number; reason?: string } | null = null;
  private handlers: Record<string, ((...a: any[]) => void)[]> = {};

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }
  on(event: string, cb: (...a: any[]) => void): void {
    (this.handlers[event] ??= []).push(cb);
  }
  close(code?: number, reason?: string): void {
    this.closed = { ...(code !== undefined ? { code } : {}), ...(reason !== undefined ? { reason } : {}) };
    this.readyState = 3;
    for (const cb of this.handlers.close ?? []) cb();
  }
  terminate(): void {
    this.close(1006, "terminated");
  }
  clientSend(msg: unknown): void {
    for (const cb of this.handlers.message ?? []) cb(Buffer.from(JSON.stringify(msg)));
  }
  clientSendRaw(text: string): void {
    for (const cb of this.handlers.message ?? []) cb(Buffer.from(text));
  }
  count(type: string): number {
    return this.sent.filter((m) => m.type === type).length;
  }
  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
  }
  waitFor(pred: (m: any) => boolean, timeoutMs = 10_000): Promise<void> {
    const start = Date.now();
    return new Promise<void>((resolve, reject) => {
      const tick = (): void => {
        if (this.sent.some(pred)) return resolve();
        if (Date.now() - start > timeoutMs) return reject(new Error("waitFor timeout"));
        setTimeout(tick, 5);
      };
      tick();
    });
  }
  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

const dirs: string[] = [];
const dbs: SiteDb[] = [];

async function newHarness(signupCode = ""): Promise<{ rm: RoomManager; db: SiteDb }> {
  const replayDir = await mkdtemp(join(tmpdir(), "majak-sec-"));
  dirs.push(replayDir);
  const store = new StatsStore(join(replayDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  return { rm: new RoomManager(replayDir, store, 0, db, signupCode), db };
}

afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

// ─────────────────────────── 남용 방어 면제 경계 ───────────────────────────

describe("남용 방어 면제는 소켓이 진짜 루프백일 때만", () => {
  it("프록시 헤더로 127.0.0.1을 위장해도 메시지 토큰버킷이 그대로 걸린다", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    // 프록시 뒤에서 복원된 IP가 루프백처럼 보이는 상황 — exempt=false로 들어온다.
    h.rm.handleConnection(sock.asWs(), "127.0.0.1", false);

    for (let i = 0; i < 200; i++) sock.clientSend({ type: "ping" });

    // 버킷 용량(80)만큼만 응답한다 — 200개 전부면 방어가 꺼진 것이다.
    expect(sock.count("pong")).toBeLessThanOrEqual(80);
    expect(sock.count("pong")).toBeGreaterThan(0);
  });

  it("진짜 로컬 연결(exempt=true)은 종전처럼 면제된다 (개발·테스트 경로 유지)", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs(), "127.0.0.1", true);
    for (let i = 0; i < 200; i++) sock.clientSend({ type: "ping" });
    expect(sock.count("pong")).toBe(200);
  });

  it("위장한 원격 연결은 IP당 동시 연결 상한(16)에도 걸린다", async () => {
    const h = await newHarness();
    const socks: FakeSocket[] = [];
    for (let i = 0; i < 20; i++) {
      const s = new FakeSocket();
      h.rm.handleConnection(s.asWs(), "127.0.0.1", false);
      socks.push(s);
    }
    const rejected = socks.filter((s) => s.closed?.code === 1013);
    expect(rejected.length).toBe(4); // 16개만 수락
  });
});

describe("abuseKeyOf — IPv6는 /64로 묶는다", () => {
  it("같은 /64 안의 다른 주소는 같은 키가 된다 (주소 갈아타기 우회 차단)", () => {
    const a = abuseKeyOf("2001:db8:1234:5678:aaaa:bbbb:cccc:dddd");
    const b = abuseKeyOf("2001:db8:1234:5678::1");
    expect(a).toBe(b);
  });

  it("다른 /64는 다른 키다", () => {
    expect(abuseKeyOf("2001:db8:1234:5678::1")).not.toBe(abuseKeyOf("2001:db8:1234:9999::1"));
  });

  it("IPv4와 IPv4-mapped는 같은 키, 그 외 라벨은 그대로", () => {
    expect(abuseKeyOf("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(abuseKeyOf("203.0.113.7")).toBe("203.0.113.7");
    expect(abuseKeyOf("local")).toBe("local");
  });

  it("IPv6 상한이 /64 단위로 실제로 걸린다", async () => {
    const h = await newHarness();
    const socks: FakeSocket[] = [];
    for (let i = 0; i < 20; i++) {
      const s = new FakeSocket();
      // 주소를 매번 바꿔도 같은 /64 — 예전에는 20개가 전부 통과했다.
      h.rm.handleConnection(s.asWs(), `2001:db8:1:2::${i + 1}`, false);
      socks.push(s);
    }
    expect(socks.filter((s) => s.closed?.code === 1013).length).toBe(4);
  });
});

// ─────────────────────────── 미인증 스쿼팅 ───────────────────────────

describe("미인증 연결", () => {
  it("logout을 반복해도 미인증 유예 타이머가 갱신되지 않는다", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs(), "203.0.113.9", false);
    // 연결 직후 서버가 보내는 안내(serverInfo)는 여기서 세지 않는다 — 이 테스트가
    // 보는 것은 "logout에 대한 응답이 있는가"다.
    sock.sent.length = 0;
    // 미인증 상태의 logout — 예전에는 여기서 유예가 되걸려 무기한 점유가 가능했다.
    sock.clientSend({ type: "logout" });
    sock.clientSend({ type: "logout" });
    // 응답도, 상태 변화도 없어야 한다 (조용히 무시)
    expect(sock.sent.length).toBe(0);
  });

  it("기형 프레임 3회면 연결이 끊긴다", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs(), "203.0.113.9", false);
    sock.clientSendRaw("{not json");
    sock.clientSendRaw("[]");
    sock.clientSendRaw("null");
    expect(sock.closed?.code).toBe(1008);
  });
});

// ─────────────────────────── 관리자 코드 ───────────────────────────

describe("관리자 가입 코드", () => {
  it("한 번 쓰이면 회전한다 — 같은 코드로 두 번째 관리자를 만들 수 없다", async () => {
    const h = await newHarness();
    const code = h.db.adminCode();

    const first = await h.db.register("Boss", "pw123456", code);
    expect(first.ok).toBe(true);
    expect(first.user?.isAdmin).toBe(true);

    // 유출된 옛 코드로 재승급 시도 — 이제 죽은 값이다.
    const second = await h.db.register("Sneak", "pw123456", code);
    expect(second.ok).toBe(false);
    expect(second.error).toContain("관리자 코드");

    // 코드 자체가 갈렸다.
    expect(h.db.adminCode()).not.toBe(code);
  });

  it("가입 실패(닉네임 중복)로는 코드가 소모되지 않는다", async () => {
    const h = await newHarness();
    await h.db.register("Boss", "pw123456");
    const code = h.db.adminCode();
    const dup = await h.db.register("Boss", "pw123456", code);
    expect(dup.ok).toBe(false);
    expect(h.db.adminCode()).toBe(code); // 그대로
  });

  it("ADMIN_CODE로 고정하면 DB에 남지도, 회전하지도 않는다", async () => {
    const db = new SiteDb(":memory:", undefined, "fixed-operator-code");
    dbs.push(db);
    expect(db.adminCode()).toBe("fixed-operator-code");
    const r = await db.register("Boss", "pw123456", "fixed-operator-code");
    expect(r.user?.isAdmin).toBe(true);
    expect(db.adminCode()).toBe("fixed-operator-code");
  });

  it("hasAdmin은 관리자 유무를 정확히 알린다 (부팅 로그 노출 판단의 근거)", async () => {
    const h = await newHarness();
    expect(h.db.hasAdmin()).toBe(false);
    await h.db.register("Nobody", "pw123456");
    expect(h.db.hasAdmin()).toBe(false);
    await h.db.register("Boss", "pw123456", h.db.adminCode());
    expect(h.db.hasAdmin()).toBe(true);
  });
});

// ─────────────────────────── 계정 열거 ───────────────────────────

describe("회원가입 계정 열거", () => {
  it("이미 있는 닉네임이어도 scrypt 비용을 똑같이 치른다 (응답 시간 오라클 차단)", async () => {
    const h = await newHarness();
    await h.db.register("Taken", "pw123456");

    const measure = async (name: string): Promise<number> => {
      const t0 = process.hrtime.bigint();
      await h.db.register(name, "pw123456");
      return Number(process.hrtime.bigint() - t0) / 1e6;
    };
    // 중복 경로가 신규 경로보다 확연히 빠르면 그 차이가 곧 열거 채널이다.
    // scrypt 한 번이 수십 ms이므로, 절반 미만이면 비용을 건너뛴 것이다.
    const dup = await measure("Taken");
    const fresh = await measure("Fresh");
    expect(dup).toBeGreaterThan(fresh * 0.5);
  });

  it("동시에 같은 닉네임으로 가입해도 INTERNAL이 아니라 평범한 실패가 된다", async () => {
    const h = await newHarness();
    const [a, b] = await Promise.all([
      h.db.register("Race", "pw123456"),
      h.db.register("Race", "pw123456"),
    ]);
    const oks = [a, b].filter((r) => r.ok);
    expect(oks.length).toBe(1);
    expect([a, b].find((r) => !r.ok)?.error).toContain("닉네임");
  });
});

// ─────────────────────────── 상수 시간 비교 ───────────────────────────

describe("safeEqual", () => {
  it("같은 값에만 참, 길이가 달라도 안전하게 거짓", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcdef")).toBe(false);
    expect(safeEqual("", "")).toBe(true);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("가입 게이트", () => {
  it("가입 코드가 틀리면 계정이 만들어지지 않는다", async () => {
    const h = await newHarness("secret-gate");
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs(), "203.0.113.9", false);
    sock.clientSend({ type: "register", username: "Nope", password: "pw123456", signupCode: "wrong" });
    await sock.waitFor((m) => m.type === "error");
    expect(sock.last("error").code).toBe("SIGNUP_CODE_REQUIRED");
    expect(h.db.userByName("Nope")).toBeNull();
  });

  it("코드가 맞으면 가입된다", async () => {
    const h = await newHarness("secret-gate");
    const sock = new FakeSocket();
    h.rm.handleConnection(sock.asWs(), "203.0.113.9", false);
    sock.clientSend({
      type: "register",
      username: "Yep",
      password: "pw123456",
      signupCode: "secret-gate",
    });
    await sock.waitFor((m) => m.type === "authOk");
    expect(h.db.userByName("Yep")).not.toBeNull();
  });
});
