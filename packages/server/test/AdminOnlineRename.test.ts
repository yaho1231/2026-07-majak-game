/**
 * 관리자 — 접속자 파악과 닉네임 변경 (2026-09-03 사용자 요청).
 *
 * 지키려는 선:
 *
 * - **접속자 목록은 관리자만 본다.** 누가 어느 방에 앉아 있는지는 관전 정보와
 *   같은 등급이다.
 * - **한 사람은 한 줄이다.** 탭을 셋 열어 둔 사람이 세 줄로 나오면 접속자 수
 *   자체가 거짓말이 된다.
 * - **닉네임 변경은 가입과 같은 규칙으로 막힌다.** 갈라 두면 가입에서 걸리는
 *   이름이 관리자 화면으로 들어오는 뒷문이 된다.
 *
 * LoginAndAdmin.test.ts와 같은 FakeSocket 방식(실제 네트워크 없음).
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";
import { createEmptyStats } from "@majak/core/stats/PlayerStats.js";
import type { PlayerStatsRaw } from "@majak/core/stats/PlayerStats.js";

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

  all(type: string): any[] {
    return this.sent.filter((m) => m.type === type);
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

interface Harness {
  rm: RoomManager;
  db: SiteDb;
  /** 누적 통계 저장소 — 개명이 이 표의 줄을 옮기는지 보는 데 쓴다 */
  store: StatsStore;
}

async function newHarness(): Promise<Harness> {
  const replayDir = await mkdtemp(join(tmpdir(), "majak-login-"));
  dirs.push(replayDir);
  const store = new StatsStore(join(replayDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const manager = new RoomManager(replayDir, store, 0, db);
  managers.push(manager);
  return { rm: manager, db, store };
}

/** 가입해서 붙는다. `adminCode`를 주면 관리자 계정이 된다. */
async function connectUser(
  h: Harness,
  username: string,
  adminCode?: string,
): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({
    type: "register",
    username,
    password: "pw123456",
    ...(adminCode !== undefined ? { adminCode } : {}),
  });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error");
  return sock;
}

/** 저장된 세션 토큰으로 **새 연결**을 연다 — 기기를 바꾼 상황을 흉내 낸다. */
async function reconnectWithToken(h: Harness, token: string): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "tokenLogin", sessionToken: token });
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


describe("관리자 — 지금 접속해 있는 사람", () => {
  it("관리자가 아니면 거절한다", async () => {
    const h = await newHarness();
    const sock = await connectUser(h, "평범한사람");
    sock.clientSend({ type: "adminOnline" });
    await sock.waitFor((m) => m.type === "error");
    expect(sock.last("error").code).toBe("FORBIDDEN");
    expect(sock.all("adminOnline")).toHaveLength(0);
  });

  it("로비·대기실 자리를 구별해 싣는다", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "온라인관리자", h.db.adminCode());
    const player = await connectUser(h, "대기실사람");
    player.clientSend({ type: "createRoom" });
    await player.waitFor((m) => m.type === "roomCreated");
    const code = player.last("roomCreated").code as string;

    admin.clientSend({ type: "adminOnline" });
    await admin.waitFor((m) => m.type === "adminOnline");
    const snap = admin.last("adminOnline");
    const rows = new Map<string, any>(snap.users.map((u: any) => [u.name, u]));

    expect(rows.get("대기실사람").where).toBe("waiting");
    expect(rows.get("대기실사람").room).toBe(code);
    expect(rows.get("대기실사람").guest).toBe(false);
    expect(rows.get("대기실사람").tabs).toBe(1);
    expect(typeof rows.get("대기실사람").userId).toBe("string");
    expect(rows.get("온라인관리자").where).toBe("lobby");
    expect(rows.get("온라인관리자").admin).toBe(true);
    expect(rows.get("온라인관리자").room).toBeUndefined();
    expect(snap.counts.total).toBe(2);
    expect(snap.counts.lobby).toBe(1);
    expect(snap.counts.playing).toBe(0);
    expect(snap.counts.guests).toBe(0);
  });

  it("같은 사람은 **한 줄**이다 — 자리를 넘겨받은 새 창이 유령 줄을 남기지 않는다", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "탭관리자", h.db.adminCode());
    const first = await connectUser(h, "여러탭");
    const token = first.last("authOk").sessionToken as string;
    // 같은 계정으로 새 창을 연다 — 서버는 옛 소켓에 SESSION_TAKEOVER를 보내고 끊는다.
    await reconnectWithToken(h, token);

    admin.clientSend({ type: "adminOnline" });
    await admin.waitFor((m) => m.type === "adminOnline");
    const snap = admin.last("adminOnline");
    const rows = snap.users.filter((u: any) => u.name === "여러탭");
    expect(rows).toHaveLength(1);
    expect(rows[0].tabs).toBe(1);
    // 접속자 수도 두 명 그대로다 (같은 사람이 둘로 세어지지 않는다)
    expect(snap.counts.total).toBe(2);
  });

  it("프레즌스가 바뀌면 요청한 적 있는 관리자에게 **다시 밀어 준다**", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "구독관리자", h.db.adminCode());
    admin.clientSend({ type: "adminOnline" });
    await admin.waitFor((m) => m.type === "adminOnline");
    const before = admin.all("adminOnline").length;

    // 새 사람이 붙는다 → 디바운스(1초) 뒤에 갱신이 온다
    await connectUser(h, "새로온사람");
    await admin.waitFor(
      (m) => m.type === "adminOnline" && m.users.some((u: any) => u.name === "새로온사람"),
      5000,
    );
    expect(admin.all("adminOnline").length).toBeGreaterThan(before);
  });
});

describe("관리자 — 닉네임 바꾸기", () => {
  it("관리자가 아니면 거절한다", async () => {
    const h = await newHarness();
    const sock = await connectUser(h, "권한없음");
    const me = h.db.userByName("권한없음")!;
    sock.clientSend({ type: "adminRenameUser", userId: String(me.id), username: "새이름" });
    await sock.waitFor((m) => m.type === "error");
    expect(sock.last("error").code).toBe("FORBIDDEN");
    expect(h.db.userByName("권한없음")).not.toBeNull();
  });

  it("바꾸면 계정과 살아 있는 소켓의 신원이 함께 바뀐다", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "개명관리자", h.db.adminCode());
    const target = await connectUser(h, "옛이름");
    const id = h.db.userByName("옛이름")!.id;

    admin.clientSend({ type: "adminRenameUser", userId: String(id), username: "새이름" });
    await admin.waitFor((m) => m.type === "adminUsers");
    expect(h.db.userByName("새이름")?.id).toBe(id);
    expect(h.db.userByName("옛이름")).toBeNull();
    // 관리자에게는 갱신된 두 목록이 돌아온다
    expect(admin.last("adminUsers").users.some((u: any) => u.username === "새이름")).toBe(true);
    await admin.waitFor((m) => m.type === "adminOnline");
    const online = admin.last("adminOnline").users.map((u: any) => u.name);
    expect(online).toContain("새이름");
    expect(online).not.toContain("옛이름");
    void target;
  });

  it("가입과 같은 규칙으로 막는다 — 중복·예약어·못 쓰는 글자", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "규칙관리자", h.db.adminCode());
    await connectUser(h, "이미있음");
    const id = h.db.userByName("이미있음")!.id;
    const other = h.db.userByName("규칙관리자")!.id;

    const reject = async (username: string): Promise<string> => {
      admin.sent.length = 0;
      admin.clientSend({ type: "adminRenameUser", userId: String(other), username });
      await admin.waitFor((m) => m.type === "error");
      return admin.last("error").message as string;
    };

    expect(await reject("이미있음")).toContain("이미 사용 중");
    expect(await reject("bot_사칭")).toContain("사용할 수 없는");
    expect(await reject("!@#$")).toContain("2~12자");
    expect(await reject("가")).toContain("2~12자");
    // 아무것도 안 바뀌었다
    expect(h.db.userByName("규칙관리자")?.id).toBe(other);
    expect(h.db.userByName("이미있음")?.id).toBe(id);
  });

  it("대소문자만 바꾸는 개명은 «자기 자신»에 막히지 않는다", async () => {
    const h = await newHarness();
    await connectUser(h, "Kimchi");
    const id = h.db.userByName("Kimchi")!.id;
    // 2026-09-04: 반환이 «사유 문자열 | null» 에서 `deleteUser` 와 같은 꼴로 바뀌었다 —
    // 호출자가 옛 이름을 알아야 누적 통계(닉네임 키)를 함께 옮길 수 있다.
    expect(h.db.renameUser(id, "KIMCHI")).toEqual({ ok: true, from: "Kimchi" });
    expect(h.db.userByName("KIMCHI")?.id).toBe(id);
  });
});

/*
 * ── 개명이 «내 것»을 데려간다 (2026-09-04 사용자 보고) ──
 *
 * 「이름을 변경했을 때 내 통계 같은 게 다 사라져 버려.」
 *
 * `StatsStore`의 키는 계정 id가 아니라 **닉네임**이다(계정이 없던 시절의 구조가
 * 그대로 남았다). 그래서 개명하면 누적 통계와 리더보드 줄이 옛 이름 밑에 남고 그
 * 계정에서는 «전적 없음»이 됐다. 기간 성적·리플레이 목록은 `user_id` 조회라 멀쩡했으니,
 * 사라진 것처럼 보인 것은 정확히 이 표 하나다.
 */
describe("관리자 — 개명해도 전적은 그대로 간다", () => {
  /** 판수 n 만큼의 최소 누적 통계 */
  const career = (games: number, wins = 0): PlayerStatsRaw => ({
    ...createEmptyStats(),
    games,
    wins,
    roundsPlayed: games * 4,
  });

  it("누적 통계가 새 이름으로 따라온다 — 옛 이름 밑에 남지 않는다", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "전적관리자", h.db.adminCode());
    await connectUser(h, "옛이름");
    await h.store.record([{ nickname: "옛이름", raw: career(7, 3) }]);
    const id = h.db.userByName("옛이름")!.id;

    admin.clientSend({ type: "adminRenameUser", userId: String(id), username: "새이름" });
    await admin.waitFor((m) => m.type === "adminUsers" && m.users.some((u: any) => u.username === "새이름"));
    await h.store.flush();

    expect(h.store.get("새이름")?.games).toBe(7);
    expect(h.store.get("새이름")?.wins).toBe(3);
    expect(h.store.get("옛이름")).toBeNull();
  });

  it("그 사람 화면의 누적 통계도 그 자리에서 갱신된다 (새로고침을 기다리지 않는다)", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "전적관리자2", h.db.adminCode());
    const me = await connectUser(h, "따라올사람");
    await h.store.record([{ nickname: "따라올사람", raw: career(5) }]);
    const id = h.db.userByName("따라올사람")!.id;

    me.sent.length = 0;
    admin.clientSend({ type: "adminRenameUser", userId: String(id), username: "바뀐사람" });
    await me.waitFor((m) => m.type === "stats" && m.career.length > 0);
    const stats = me.last("stats");
    expect(stats.career[0].nickname).toBe("바뀐사람");
    expect(stats.career[0].stats.games).toBe(5);
  });

  it("목적지에 남아 있던 값이 있으면 합친다 — 어느 쪽도 버리지 않는다", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "합치기관리자", h.db.adminCode());
    await connectUser(h, "합칠사람");
    // 게스트나 이미 삭제된 계정이 그 이름으로 남겨 둔 줄. 계정 이름은 겹칠 수 없으므로
    // 이 값은 앞으로 어느 계정도 닿을 수 없다 — 합치는 쪽이 잃는 것이 없다.
    await h.store.record([
      { nickname: "합칠사람", raw: career(2) },
      { nickname: "빈자리아님", raw: career(3) },
    ]);
    const id = h.db.userByName("합칠사람")!.id;

    admin.clientSend({ type: "adminRenameUser", userId: String(id), username: "빈자리아님" });
    await admin.waitFor((m) => m.type === "adminUsers" && m.users.some((u: any) => u.username === "빈자리아님"));
    await h.store.flush();

    expect(h.store.get("빈자리아님")?.games).toBe(5);
    expect(h.store.get("합칠사람")).toBeNull();
  });

  it("대소문자만 바꾸는 개명에서도 옮긴다 — 이 표에서는 다른 키다", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "대소문자관리자", h.db.adminCode());
    await connectUser(h, "Nick");
    await h.store.record([{ nickname: "Nick", raw: career(4) }]);
    const id = h.db.userByName("Nick")!.id;

    admin.clientSend({ type: "adminRenameUser", userId: String(id), username: "NICK" });
    await admin.waitFor((m) => m.type === "adminUsers" && m.users.some((u: any) => u.username === "NICK"));
    await h.store.flush();

    expect(h.store.get("NICK")?.games).toBe(4);
    expect(h.store.get("Nick")).toBeNull();
  });

  it("좌석 이름표까지 갈아 끼운다 — 안 그러면 이 판이 끝날 때 옛 이름으로 다시 기록된다", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "좌석관리자", h.db.adminCode());
    const player = await connectUser(h, "앉은사람");
    player.clientSend({ type: "createRoom" });
    await player.waitFor((m) => m.type === "lobby");
    const id = h.db.userByName("앉은사람")!.id;

    player.sent.length = 0;
    admin.clientSend({ type: "adminRenameUser", userId: String(id), username: "새좌석" });
    await player.waitFor(
      (m) => m.type === "lobby" && m.players.some((p: any) => p.nickname === "새좌석"),
    );
    const lobby = player.last("lobby");
    expect(lobby.players.map((p: any) => p.nickname)).not.toContain("앉은사람");
  });

  it("제보 글의 작성자 이름도 따라온다 (지난 판의 기록은 그대로 둔다)", async () => {
    const h = await newHarness();
    const admin = await connectUser(h, "제보관리자", h.db.adminCode());
    const me = await connectUser(h, "제보한사람");
    me.clientSend({ type: "feedbackSubmit", kind: "bug", title: "제목", body: "본문" });
    await me.waitFor((m) => m.type === "feedbackList" && m.entries.length > 0);
    const id = h.db.userByName("제보한사람")!.id;

    admin.clientSend({ type: "adminRenameUser", userId: String(id), username: "이름바꿈" });
    await admin.waitFor((m) => m.type === "adminUsers" && m.users.some((u: any) => u.username === "이름바꿈"));

    const entries = h.db.listFeedback(h.db.userByName("이름바꿈")!);
    expect(entries[0]?.author).toBe("이름바꿈");
  });
});
