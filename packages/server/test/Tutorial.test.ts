/**
 * 튜토리얼 방 — 배우기 위해 **고정해 둔 것**이 실제로 고정돼 있는가.
 *
 * 지키려는 선(서버의 `TUTORIAL_ROOM_NOTE`가 약속하는 것들):
 * - 시작 증강이 **액티브 증강 하나로 고정**된다 → "⚡ 버튼"·"발광"·"보라 생성패"
 *   세 강의가 매번 성립한다.
 * - 손패가 고정된다 → 첫 순에 버릴 패가 뻔하고, 몇 순 안에 텐파이가 선다.
 * - **결정에 시간 제한이 사실상 없다.** 이게 이 파일의 핵심이다 — 증강 설명을
 *   읽는 사이 서버가 무작위로 대신 고르면 그건 튜토리얼이 아니다
 *   (2026-08-18 사용자 지시).
 * - 그러면서도 **체험판의 성질은 그대로**다: 기록 없음, 손님 방 예산 공유.
 *
 * Guest.test.ts와 같은 FakeSocket 방식(실제 네트워크·파일 없음).
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";
import { DECISION_TIMEOUT_MS, TUTORIAL_DECISION_TIMEOUT_MS } from "../src/HumanAgent.js";

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
    for (const cb of this.handlers["close"] ?? []) cb();
  }

  clientSend(msg: unknown): void {
    for (const cb of this.handlers["message"] ?? []) cb(Buffer.from(JSON.stringify(msg)));
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

async function newHarness(): Promise<{ rm: RoomManager }> {
  const dir = await mkdtemp(join(tmpdir(), "majak-tutorial-"));
  dirs.push(dir);
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  const rm = new RoomManager(dir, store, 0, db, "");
  managers.push(rm);
  return { rm };
}

/** 튜토리얼(또는 그냥 체험)로 붙어 첫 뷰까지 기다린다. */
async function connect(
  h: { rm: RoomManager },
  tutorial: boolean,
): Promise<FakeSocket> {
  const sock = new FakeSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "guestPlay", mode: "tonpuu", ...(tutorial ? { tutorial: true } : {}) });
  await sock.waitFor((m) => m.type === "view" || m.type === "error");
  return sock;
}

/**
 * 증강을 하나 고르고 **배패가 깔린 뒤의 뷰**까지 간다.
 *
 * 첫 `view`는 배패 전이다(컨트롤러가 드래프트를 위해 먼저 화면을 띄운다) — 거기서
 * 손패를 읽으면 언제나 빈 손이라 이 테스트가 조용히 아무것도 검사하지 않게 된다.
 */
async function pickDraftAndPlay(sock: FakeSocket): Promise<any> {
  await sock.waitFor((m) => m.type === "draftOffer");
  const offer = sock.last("draftOffer");
  sock.clientSend({ type: "draftPick", stage: offer.stage, augmentId: offer.choices[0].id });
  await sock.waitFor((m) => m.type === "prompt");
  return sock.last("view").view;
}

/** 손패를 "man2 ×1, pin4 ×1…" 꼴의 개수 표로 (kind만 세고 id는 안 본다) */
function handCounts(view: any): Record<string, number> {
  const ids: number[] = view.zones[`hand:${view.playerId}`]?.tileIds ?? [];
  const out: Record<string, number> = {};
  for (const id of ids) {
    const k = view.tiles[id]?.kind;
    if (k === undefined) continue;
    const key = `${k.suit}${k.rank}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
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

describe("튜토리얼 판 — 배우기 좋게 고정돼 있다", () => {
  it("시작부터 액티브 증강(연금술사)을 들고 있다", async () => {
    const h = await newHarness();
    const sock = await connect(h, true);
    const view = sock.last("view").view;
    const me = view.players.find((p: any) => p.id === view.playerId);
    // 이 하나로 "⚡ 액티브 증강 버튼"·"이름표 발광"·"보라 생성패" 강의가 전부 선다.
    expect(me.augments).toContain("alchemist");
  });

  it("손패가 고정 배패다 — 1샹텐에서 시작한다", async () => {
    const h = await newHarness();
    const sock = await connect(h, true);
    const counts = handCounts(await pickDraftAndPlay(sock));
    // 234m 567m 4567p 22s 9s (13장) + 첫 쯔모 man1.
    // man1이 첫 쯔모로 깔리는 것이 "필요 없는 패를 버립니다" 강의의 근거다.
    const want = ["man1", "man2", "man3", "man4", "man5", "man6", "man7",
                  "pin4", "pin5", "pin6", "pin7", "sou9"];
    for (const key of want) expect(counts[key], `${key}가 손에 없다`).toBe(1);
    expect(counts["sou2"]).toBe(2);
    // 14장 정확히 — 지정 못 한 자리가 무작위로 채워지면 이 수가 어긋난다
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(14);
  });

  it("첫 순부터 액티브 증강을 쓸 수 있다 — ⚡ 강의가 성립한다", async () => {
    const h = await newHarness();
    const sock = await connect(h, true);
    await pickDraftAndPlay(sock);
    const types = new Set<string>(
      (sock.last("prompt").prompt.options as { type: string }[]).map((o) => o.type),
    );
    // 연금술사의 발동 액션. 이게 있어야 액션 바에 `.act-aug`(✦ 액티브 증강)가 뜬다.
    expect(types.has("alchemy")).toBe(true);
  });

  it("체험판(튜토리얼 아님)은 고정되지 않는다 — 진짜 판 그대로다", async () => {
    // 고정이 새어 나가면 체험이 매번 같은 판이 된다. 시작 증강이 붙지 않는 것으로 본다
    // (배패는 무작위라 '다르다'를 한 판으로 증명할 수 없지만, 증강은 결정적이다).
    const h = await newHarness();
    const sock = await connect(h, false);
    const view = sock.last("view").view;
    const me = view.players.find((p: any) => p.id === view.playerId);
    expect(me.augments).toHaveLength(0);
  });
});

describe("튜토리얼 판 — 시간에 쫓기지 않는다", () => {
  it("증강 선택창에 마감이 실리지 않는다 — 화면에 시계가 안 뜬다", async () => {
    const h = await newHarness();
    const sock = await connect(h, true);
    await sock.waitFor((m) => m.type === "draftOffer");
    // 0/미지정이면 클라이언트가 카운트다운을 그리지 않는다(App.tsx의 draftOffer 처리).
    expect(sock.last("draftOffer").deadlineMs).toBe(0);
  });

  it("결정 프롬프트에도 마감이 실리지 않는다", async () => {
    const h = await newHarness();
    const sock = await connect(h, true);
    await pickDraftAndPlay(sock);
    expect(sock.last("prompt").deadlineMs).toBe(0);
  });

  it("체험판은 종전대로 30초 마감이 실린다", async () => {
    const h = await newHarness();
    const sock = await connect(h, false);
    await sock.waitFor((m) => m.type === "draftOffer");
    expect(sock.last("draftOffer").deadlineMs).toBe(DECISION_TIMEOUT_MS);
  });

  it("서버 타이머는 '없음'이 아니라 '사람이 못 닿을 값'이다", () => {
    // 아예 안 걸면 decide()가 영영 resolve되지 않는 프로미스가 된다 —
    // 상수 자체로 그 설계 의도를 못 박는다.
    expect(TUTORIAL_DECISION_TIMEOUT_MS).toBeGreaterThan(DECISION_TIMEOUT_MS * 10);
    expect(Number.isFinite(TUTORIAL_DECISION_TIMEOUT_MS)).toBe(true);
  });
});

describe("튜토리얼 판 — 손님 방의 성질은 그대로", () => {
  it("아무 기록도 남기지 않는다 (게스트 방과 같은 취급)", async () => {
    const h = await newHarness();
    const sock = await connect(h, true);
    // 리플레이 인덱스가 비어 있어야 한다 — 게스트/샌드박스와 같은 경로다.
    sock.clientSend({ type: "replayList" });
    // 손님은 replayList가 화이트리스트에 없어 거절된다 = 계정 공간에 못 들어온다.
    expect(sock.last("error")?.code).toBe("GUEST_FORBIDDEN");
  });

  it("끊겨도 판을 세워 두고 기다린다 — 돌아올 열쇠까지 준다 (§2-5)", async () => {
    // 배우다 알림 하나 확인하고 돌아왔는데 판이 없으면 그게 튜토리얼의 끝이다.
    // 손님 방의 '판 세워 두기'가 튜토리얼에도 그대로 걸리는지 본다.
    const h = await newHarness();
    const sock = await connect(h, true);
    await pickDraftAndPlay(sock);
    expect(h.rm.healthSnapshot().rooms).toBe(1);
    // 열쇠는 판이 열릴 때 이미 손에 쥐여 준다 (끊긴 뒤에는 보낼 길이 없다)
    expect(typeof sock.last("authOk").guestToken).toBe("string");
    sock.close();
    expect(h.rm.healthSnapshot().rooms).toBe(1);
  });
});
