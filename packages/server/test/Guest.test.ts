/**
 * 게스트 체험 통합 테스트 — 계정 없이 봇 3명과 두는 1인 게임.
 *
 * 지키려는 선(이 파일이 존재하는 이유):
 * - 게스트는 **가입 게이트를 우회하지 못한다**. 손님은 놀 수 있을 뿐 계정을 못 만든다.
 * - 게스트는 방을 만들 수도, 코드로 남의 방에 들어갈 수도 없다.
 * - 게스트의 방은 **남에게 존재 자체가 감춰진다**(코드를 알아내도 못 들어온다).
 * - 게스트 판은 **아무 기록도 남기지 않는다** — 리플레이·게임 인덱스·누적 통계·리더보드.
 * - 게스트 시작은 **기존 인증 레이트리밋과 같은 창**을 쓴다(옆문이 아니다).
 *
 * RoomManager.test.ts와 같은 FakeSocket 방식(실제 네트워크·파일 없음).
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";

class FakeSocket {
  readyState = 1; // OPEN
  sent: any[] = [];
  /** 프롬프트·드래프트에 자동 응답할지 (판을 끝까지 굴려야 하는 테스트에서 켠다) */
  autoRespond = false;
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
    if (this.autoRespond) this.respond(msg);
  }

  on(event: string, cb: (...a: any[]) => void): void {
    (this.handlers[event] ??= []).push(cb);
  }

  close(): void {
    this.readyState = 3;
    this.emit("close");
  }

  clientSend(msg: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(msg)));
  }

  last(type: string): any {
    return [...this.sent].reverse().find((m) => m.type === type);
  }

  all(type: string): any[] {
    return this.sent.filter((m) => m.type === type);
  }

  waitFor(pred: (m: any) => boolean, timeoutMs = TONPUU_MS): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }

  private respond(msg: any): void {
    if (msg.type === "prompt") {
      const opts = msg.prompt.options as any[];
      const pick =
        opts.find((o) => o.type === "pass") ?? opts.find((o) => o.type === "discard") ?? opts[0];
      setTimeout(
        () =>
          this.clientSend({
            type: "action",
            actionType: pick.type,
            payload: pick.payload,
            seat: msg.prompt.player,
          }),
        0,
      );
    } else if (msg.type === "draftOffer") {
      // 게스트도 실전과 같은 드래프트를 받는다 — 증강이 이 게임의 정체라 빼면 체험이 아니다.
      const id = msg.choices[0].id;
      setTimeout(() => this.clientSend({ type: "draftPick", stage: msg.stage, augmentId: id }), 0);
    } else if (msg.type === "roundOver") {
      setTimeout(() => this.clientSend({ type: "roundContinue" }), 0);
    }
  }

  private emit(event: string, ...args: any[]): void {
    for (const cb of this.handlers[event] ?? []) cb(...args);
  }

  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

/**
 * 게스트 한 판(사람 1 + 봇 3 동풍전)이 **실제로 끝나는 데** 주는 예산(ms).
 *
 * 예전 20초는 한가한 머신 기준으로도 여유가 얇아, 전체 병렬 실행에서 이 파일이
 * `waitFor timeout`으로 간헐 실패했다(단독 실행은 5초에 14/14 통과).
 * `RoomManager.test.ts`가 같은 이유로 이미 넉넉한 상수로 옮겨 갔다 — 같은 값을 쓴다.
 */
const TONPUU_MS = 90_000;

const dirs: string[] = [];
const dbs: SiteDb[] = [];
/** afterEach에서 반드시 멈춰야 하는 매니저들 (아래 주석 참고) */
const managers: RoomManager[] = [];

interface Harness {
  rm: RoomManager;
  db: SiteDb;
  store: StatsStore;
  replayDir: string;
}

/** @param signupCode 설정하면 그 서버는 가입 게이트가 켜진 상태다. */
async function newHarness(signupCode = ""): Promise<Harness> {
  const replayDir = await mkdtemp(join(tmpdir(), "majak-guest-"));
  dirs.push(replayDir);
  const store = new StatsStore(join(replayDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const rm = new RoomManager(replayDir, store, 0, db, signupCode);
  managers.push(rm);
  return { rm, db, store, replayDir };
}

/**
 * 게스트로 붙어 첫 뷰까지 기다린다.
 *
 * @param ip 원격 남용 방어를 실제로 태울 때는 루프백이 아닌 주소를 준다
 *   (기본 "local"은 테스트 편의를 위한 면제 경로다).
 */
async function connectGuest(
  h: Harness,
  opts: { autoRespond?: boolean; ip?: string } = {},
): Promise<FakeSocket> {
  const sock = new FakeSocket();
  sock.autoRespond = opts.autoRespond ?? false;
  if (opts.ip !== undefined) h.rm.handleConnection(sock.asWs(), opts.ip, false);
  else h.rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "guestPlay", mode: "tonpuu" });
  await sock.waitFor((m) => m.type === "view" || m.type === "error");
  return sock;
}

/** 일반 계정으로 붙는다 (게스트 방을 훔쳐보려는 쪽 등). */
async function connectUser(h: Harness, username: string): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "register", username, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

afterEach(async () => {
  /*
   * **매니저를 반드시 멈춘다.** 예전에는 임시 디렉터리와 DB만 정리하고 RoomManager는
   * 그대로 뒀다. 게임 도중에 끝나는 테스트가 남긴 봇 대국이 같은 이벤트 루프에서
   * 계속 돌며 뒤 테스트의 CPU를 훔쳤고, 그게 이 파일이 전체 실행에서만 간헐적으로
   * `waitFor timeout`을 내던 이유다(단독 실행은 항상 통과).
   * `RoomManager.test.ts`가 같은 원인으로 이미 고쳐졌다 — 같은 처방을 쓴다.
   */
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  // 중단된 게임 루프가 마무리 콜백을 흘려보낼 틈을 준다 (임시 디렉터리 삭제 레이스 방지)
  await new Promise((r) => setTimeout(r, 0));
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

describe("게스트 — 서버 안내", () => {
  it("연결 직후 가입 게이트 여부를 먼저 알려 준다", async () => {
    const open = await newHarness();
    const s1 = new FakeSocket();
    open.rm.handleConnection(s1.asWs());
    expect(s1.last("serverInfo")).toMatchObject({ signupGate: false, guestPlay: true });

    const gated = await newHarness("secret-code");
    const s2 = new FakeSocket();
    gated.rm.handleConnection(s2.asWs());
    expect(s2.last("serverInfo")).toMatchObject({ signupGate: true, guestPlay: true });
  });
});

describe("게스트 — 시작", () => {
  it("계정 없이 봇 3명과의 판이 즉시 시작된다", async () => {
    const h = await newHarness("secret-code"); // 게이트가 켜진 서버에서도 체험은 열린다
    const guest = await connectGuest(h);

    const authOk = guest.last("authOk");
    expect(authOk.guest).toBe(true);
    expect(authOk.isAdmin).toBe(false);
    // 저장할 세션이 없다 — 토큰은 빈 문자열이어야 한다.
    expect(authOk.sessionToken).toBe("");
    expect(authOk.username).toMatch(/^손님#\d+$/);

    const view = guest.last("view").view;
    expect(view.players).toHaveLength(4);
    expect(view.players.filter((p: any) => p.nickname.startsWith("Bot_"))).toHaveLength(3);
    // 도감을 게임 전에도 쓸 수 있어야 한다 (게스트도 증강을 찾아본다)
    expect(guest.last("catalog").augments.length).toBeGreaterThan(0);
  });

  it("게스트 닉네임은 계정으로 만들 수 없는 형태라 실계정과 겹치지 않는다", async () => {
    const h = await newHarness();
    const guest = await connectGuest(h);
    const name = guest.last("authOk").username;

    const other = new FakeSocket();
    h.rm.handleConnection(other.asWs());
    other.clientSend({ type: "register", username: name, password: "pw123456" });
    await other.waitFor((m) => m.type === "authOk" || m.type === "error");
    expect(other.last("authOk")).toBeUndefined();
    expect(other.last("error").code).toBe("REGISTER_FAILED");
  });
});

describe("게스트 — 가입 게이트는 그대로다", () => {
  it("게스트 세션에서도 가입 코드 없이는 계정을 만들 수 없다", async () => {
    const h = await newHarness("secret-code");
    const guest = await connectGuest(h);

    guest.sent.length = 0;
    guest.clientSend({ type: "register", username: "Sneaky", password: "pw123456" });
    await guest.waitFor((m) => m.type === "error");
    expect(guest.last("error").code).toBe("SIGNUP_CODE_REQUIRED");
    expect(h.db.userByName("Sneaky")).toBeNull();
  });

  it("게스트 신원은 계정 테이블에 아무것도 쓰지 않는다", async () => {
    const h = await newHarness();
    const guest = await connectGuest(h);
    const name = guest.last("authOk").username;
    expect(h.db.listUsers()).toEqual([]);
    expect(h.db.userByName(name)).toBeNull();
  });
});

describe("게스트 — 권한", () => {
  it("방 만들기·코드 참가·통계·리플레이·제보·관리자 요청이 전부 거부된다", async () => {
    const h = await newHarness();
    const guest = await connectGuest(h);

    for (const msg of [
      { type: "createRoom" },
      { type: "joinRoom", code: "ABCDEF" },
      { type: "statsRequest" },
      { type: "replayList" },
      { type: "replayGet", gameId: 1 },
      { type: "leaderboard" },
      { type: "feedbackList" },
      { type: "feedbackSubmit", kind: "bug", title: "t", body: "b" },
      { type: "liveGames" },
      { type: "spectate", code: "ABCDEF" },
      { type: "adminUsers" },
      { type: "sandboxStart" },
      { type: "startGame" },
      { type: "addBot" },
    ]) {
      guest.sent.length = 0;
      guest.clientSend(msg);
      expect(guest.last("error")?.code, msg.type).toBe("GUEST_FORBIDDEN");
    }
  });

  it("판을 두는 데 필요한 메시지는 막지 않는다", async () => {
    const h = await newHarness();
    const guest = await connectGuest(h);
    guest.sent.length = 0;
    guest.clientSend({ type: "handOrder", tileIds: [] });
    expect(guest.last("error")).toBeUndefined();
  });

  it("남은 게스트 방의 코드를 알아내도 들어갈 수 없다", async () => {
    const h = await newHarness();
    const guest = await connectGuest(h);
    const code = guest.last("roomCreated").code;

    const other = await connectUser(h, "Alice");
    other.clientSend({ type: "joinRoom", code });
    await other.waitFor((m) => m.type === "error" || m.type === "joined");
    expect(other.last("joined")).toBeUndefined();
    expect(other.last("error").code).toBe("ROOM_NOT_FOUND");
  });
});

describe("게스트 — 레이트리밋", () => {
  it("체험 시작은 인증과 같은 창을 쓴다 (연결당 한도를 넘으면 거부)", async () => {
    const h = await newHarness();
    const sock = new FakeSocket();
    // 루프백 면제를 끄고 실제 원격처럼 붙는다.
    h.rm.handleConnection(sock.asWs(), "203.0.113.7", false);

    let limited = false;
    // 연결당 인증 한도(12회/분)를 넘길 만큼 두드린다.
    for (let i = 0; i < 20; i++) {
      sock.sent.length = 0;
      sock.clientSend({ type: "guestPlay", mode: "tonpuu" });
      if (sock.last("error")?.code === "RATE_LIMITED") {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});

describe("게스트 — 동시 판 상한", () => {
  /**
   * 배경: 전역 상한(MAX_GUEST_ROOMS)만 있을 때는 한 사람이 탭을 열어 두는 것만으로
   * 손님 자리를 통째로 먹을 수 있었다. IP당 동시 연결이 16개까지 열리고, 방을
   * 만들고 **유지**하는 것이라 방 생성 레이트리밋(10분 20회)도 듣지 않았다.
   * 봇 3명의 판단은 단일 이벤트 루프에서 돌기 때문에 이건 그대로 CPU 점유가 된다.
   */
  it("같은 IP에서 동시에 열 수 있는 체험 판이 제한된다", async () => {
    const h = await newHarness();
    const ip = "203.0.113.9";
    const socks = [];
    for (let i = 0; i < 3; i++) socks.push(await connectGuest(h, { ip }));
    for (const s of socks) expect(s.last("view")).toBeDefined();

    // 네 번째 탭 — 앞의 셋을 열어 둔 채로는 거부된다.
    const extra = await connectGuest(h, { ip });
    expect(extra.last("error")?.code).toBe("SERVER_BUSY");
    expect(extra.last("view")).toBeUndefined();

    // 다른 IP는 영향을 받지 않는다 — 상한은 한 사람 몫이지 서버 전체가 아니다.
    const other = await connectGuest(h, { ip: "198.51.100.4" });
    expect(other.last("view")).toBeDefined();

    // 열어 둔 탭 하나를 닫으면 그 자리가 곧바로 난다.
    socks[0]!.close();
    const again = await connectGuest(h, { ip });
    expect(again.last("view")).toBeDefined();
  });

  it("만석이어도 '한 판 더'는 제 자리를 되쓴다", async () => {
    // 자기 자신이 붙들고 있는 판을 세면, 새 판을 열 자리를 두고도 거부당한다.
    const h = await newHarness();
    const ip = "203.0.113.11";
    const socks = [];
    for (let i = 0; i < 3; i++) socks.push(await connectGuest(h, { ip }));

    const mine = socks[2]!;
    mine.sent.length = 0;
    mine.clientSend({ type: "guestPlay", mode: "tonpuu" });
    await mine.waitFor((m) => m.type === "view" || m.type === "error");
    expect(mine.last("error")).toBeUndefined();
    expect(mine.last("view")).toBeDefined();
  });
});

describe("게스트 — 기록 없음", () => {
  it("판이 끝나도 리플레이·게임 인덱스·누적 통계 어디에도 남지 않는다", async () => {
    const h = await newHarness();
    const guest = await connectGuest(h, { autoRespond: true });
    const name = guest.last("authOk").username;

    await guest.waitFor((m) => m.type === "gameOver");

    // 결과는 보여 준다 (이번 판 통계) — 다만 누적으로는 쌓이지 않는다.
    expect(guest.last("gameOver").rankings).toHaveLength(4);
    // "이어하기"를 주지 않는다 — 게스트는 대기실에서 startGame을 보낼 수 없다.
    expect(guest.last("gameOver").canContinue).toBe(false);
    expect(guest.last("stats").career).toEqual([]);

    const files = await readdir(h.replayDir);
    expect(files.filter((f) => f.endsWith(".jsonl"))).toEqual([]);
    expect(h.db.listAllGames()).toEqual([]);
    expect(h.store.get(name)).toBeNull();
  }, 60_000);

  it("게스트가 창을 닫으면 그 방도 함께 사라진다", async () => {
    const h = await newHarness();
    const guest = await connectGuest(h);
    const code = guest.last("roomCreated").code;
    guest.close();

    // 방이 남아 있는지는 "관리자가 그 코드로 들어갈 수 있는가"로 본다.
    const admin = new FakeSocket();
    h.rm.handleConnection(admin.asWs());
    admin.clientSend({ type: "register", username: "Boss", password: "pw123456", adminCode: h.db.adminCode() });
    await admin.waitFor((m) => m.type === "authOk");
    admin.clientSend({ type: "joinRoom", code });
    await admin.waitFor((m) => m.type === "error" || m.type === "joined");
    expect(admin.last("error").code).toBe("ROOM_NOT_FOUND");
  });

  it("진행 중인 게스트 방은 관리자 관전 목록에도 뜨지 않는다", async () => {
    const h = await newHarness();
    await connectGuest(h);

    const admin = new FakeSocket();
    h.rm.handleConnection(admin.asWs());
    admin.clientSend({ type: "register", username: "Boss", password: "pw123456", adminCode: h.db.adminCode() });
    await admin.waitFor((m) => m.type === "authOk");
    admin.clientSend({ type: "liveGames" });
    await admin.waitFor((m) => m.type === "liveGames");
    expect(admin.last("liveGames").rooms).toEqual([]);
  });
});
