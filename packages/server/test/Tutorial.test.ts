/**
 * 튜토리얼 방 — 배우기 위해 **고정해 둔 것**이 실제로 고정돼 있는가.
 *
 * 지키려는 선(서버의 `TUTORIAL_ROOM_NOTE`가 약속하는 것들):
 * - 증강 선택창이 **고정**된다: 같은 석 장이 서고 **연금술사만** 눌린다 →
 *   "⚡ 버튼"·"발광"·"보라 생성패" 세 강의가 매번 성립하고, 손에 남는 증강은
 *   그 하나뿐이라 «✦ 액티브 증강»에 고르는 줄이 끼어들지 않는다.
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
import { winningKinds } from "@majak/core";

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
  it("증강 선택창이 고정돼 있다 — 같은 석 장, 연금술사만 잠금 해제", async () => {
    /*
     * 코치의 대본이 "«연금술사»를 고르세요"라고 **이름을 부른다**. 카드가 판마다
     * 달라지면 그 자리에서 거짓말이 되고, 다른 카드가 눌리면 뒤 강의(⚡ 버튼·발광·
     * 보라 생성패)가 통째로 성립하지 않는다.
     */
    const h = await newHarness();
    const sock = await connect(h, true);
    await sock.waitFor((m) => m.type === "draftOffer");
    const offer = sock.last("draftOffer");
    expect(offer.choices.map((c: any) => c.id)).toEqual([
      "alchemist",
      "danger_sense",
      "triple_peek",
    ]);
    expect(offer.lockedId).toBe("alchemist");
    // 새로고침은 없다 — 갈아 낄 수 있으면 고정이 아니다.
    expect(offer.rerollable).toEqual([false, false, false]);
  });

  it("잠긴 카드는 서버가 거절한다 — 화면을 우회해도 못 고른다", async () => {
    const h = await newHarness();
    const sock = await connect(h, true);
    await sock.waitFor((m) => m.type === "draftOffer");
    const offer = sock.last("draftOffer");
    sock.clientSend({ type: "draftPick", stage: offer.stage, augmentId: "danger_sense" });
    await sock.waitFor((m) => m.type === "error");
    expect(sock.last("error").code).toBe("INVALID_DRAFT_PICK");
    // 거절이지 무시가 아니다 — 연금술사는 그대로 들어간다.
    sock.clientSend({ type: "draftPick", stage: offer.stage, augmentId: "alchemist" });
    await sock.waitFor((m) => m.type === "prompt");
    const view = sock.last("view").view;
    expect(view.players.find((p: any) => p.id === view.playerId).augments).toEqual([
      "alchemist",
    ]);
  });

  it("증강은 연금술사 **한 개**뿐이다 — 지급분이 따로 붙지 않는다", async () => {
    /*
     * 예전에는 배패 전에 연금술사를 지급해 두고 드래프트를 무작위로 열어, 첫 국부터
     * 증강이 둘이었다 — 이름표에 알약이 둘 붙고 «✦ 액티브 증강»에 고르는 줄이 한 번
     * 더 떴다(2026-08-19 사용자 지시: "연금술사 한개만 있게 해줘").
     */
    const h = await newHarness();
    const sock = await connect(h, true);
    const before = sock.last("view").view;
    // 고르기 전에는 아무것도 없다 (지급분이 없다는 뜻)
    expect(before.players.find((p: any) => p.id === before.playerId).augments).toEqual([]);
    const after = await pickDraftAndPlay(sock);
    expect(after.players.find((p: any) => p.id === after.playerId).augments).toEqual([
      "alchemist",
    ]);
  });

  it("손패가 고정 배패다 — 코치의 대본이 손패로 적혀 있다", async () => {
    const h = await newHarness();
    const sock = await connect(h, true);
    const counts = handCounts(await pickDraftAndPlay(sock));
    // 234m 567m 456p 7p 22s 9s (13장) + 첫 쯔모 1s.
    const want = ["man2", "man3", "man4", "man5", "man6", "man7",
                  "pin4", "pin5", "pin6", "pin7", "sou1", "sou9"];
    for (const key of want) expect(counts[key], `${key}가 손에 없다`).toBe(1);
    expect(counts["sou2"]).toBe(2);
    // 14장 정확히 — 지정 못 한 자리가 무작위로 채워지면 이 수가 어긋난다
    expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(14);
  });

  it("대본이 실제로 성립한다 — 9삭을 버리고 1삭을 2삭으로 바꾸면 텐파이다", async () => {
    /*
     * 이 테스트가 지키는 것은 배패의 **철자**가 아니라 대본이다. 코치는
     * "9삭을 버리세요 → 1삭을 2삭으로 바꾸세요 → 리치"라고 지목해서 말하므로
     * (`tutorial.ts`의 SCRIPT_NOTE), 그 말대로 했을 때 정말 텐파이가 서야 한다.
     * 패 한 장만 잘못 고쳐도 코치는 막다른 길을 가리키게 된다.
     */
    const h = await newHarness();
    const sock = await connect(h, true);
    const counts = handCounts(await pickDraftAndPlay(sock));
    const hand: string[] = [];
    for (const [key, n] of Object.entries(counts)) for (let i = 0; i < n; i++) hand.push(key);

    // 9삭을 버린다
    const afterDiscard = [...hand];
    afterDiscard.splice(afterDiscard.indexOf("sou9"), 1);
    // 연금술사로 1삭 → 2삭 (1삭은 방향이 +1 하나뿐이라 후보가 하나로 떨어진다)
    const afterAlchemy = afterDiscard.map((k) => (k === "sou1" ? "sou2" : k));

    const kinds = afterAlchemy.map((k) => {
      const suit = k.slice(0, 3) as "man" | "pin" | "sou";
      return { suit, rank: Number(k.slice(3)) };
    });
    expect(kinds).toHaveLength(13);
    // 234m 567m 222s + 4567p — 4통·7통 양쪽으로 기다린다(각 3장씩 살아 있다).
    expect(winningKinds(kinds, 0).map((k) => `${k.suit}${k.rank}`)).toEqual(["pin4", "pin7"]);
  });

  it("대본대로 두면 리치를 걸고 화료까지 간다 (대개 론)", async () => {
    /*
     * 튜토리얼이 데려가려는 결승선을 그대로 걸어 본다 (2026-08-18 사용자 지시:
     * "플레이어가 리치 이후 론을 할 때까지 튜토리얼을 진행해").
     *
     * 여기가 무너지는 방식은 조용하다: 리치까지는 멀쩡히 가 놓고 봇 셋이 안전패만
     * 돌려 유국으로 끝난다 — 화면에는 아무 오류도 없고, 배우는 사람만 "리치를
     * 걸었는데 아무 일도 안 일어난다"를 겪는다. 그래서 배급(`TUTORIAL_FEED_NOTE`)이
     * 실제로 도는지를 판으로 확인한다.
     */
    const h = await newHarness();
    const sock = await connect(h, true);
    await pickDraftAndPlay(sock);

    const promptCount = (): number => sock.sent.filter((m: any) => m.type === "prompt").length;
    /** 새 프롬프트가 올 때까지 기다린다 */
    const nextPrompt = async (seen: number): Promise<any> => {
      await sock.waitFor((m) => m.type === "prompt" && promptCount() > seen);
      return sock.last("prompt").prompt;
    };
    const view = (): any => sock.last("view").view;
    const kindOf = (id: number): string => {
      const k = view().tiles[id]?.kind;
      return `${k.suit}${k.rank}`;
    };
    const send = (o: any): void => {
      sock.clientSend({ type: "action", actionType: o.type, payload: o.payload });
    };
    const find = (prompt: any, pick: (o: any) => boolean): any => prompt.options.find(pick);

    /*
     * 프롬프트는 내 차례의 것만 오지 않는다 — 봇이 버릴 때마다 치·퐁 기회가 끼어든다.
     * 그래서 대본을 순서대로 밀지 않고 **지금 온 프롬프트에 다음 한 수가 있으면 둔다**로
     * 적는다(사람이 화면 앞에서 하는 일과 같다). 없으면 패스하고 다음을 기다린다.
     */
    const steps = [
      { name: "9삭 버리기", pick: (o: any) => o.type === "discard" && kindOf(o.payload.tileId) === "sou9" },
      { name: "연금술사 1삭→2삭", pick: (o: any) => o.type === "alchemy" && kindOf(o.payload.tileId) === "sou1" },
      /*
       * 리치는 **가져온 패로** 건다. 텐파이를 유지하는 패는 여럿이지만(대본에서는
       * 4통·7통도 된다) 그중 내 오름패를 버리면 그 국 내내 론을 못 한다(후리텐) —
       * 코치도 같은 이유로 그 한 장만 눌리게 잠근다(`DRAWN_TILE`).
       */
      {
        name: "리치(가져온 패로)",
        pick: (o: any) => o.type === "riichi" && o.payload.tileId === view().round.myDrawnTile,
      },
      // 가져온 패로 걸 수 없는 순이면(그 패가 손을 좋게 만든 경우) 아무 패로나 건다 —
      // 화면도 그때는 잠금을 놓는다(App.tsx `coachLock`).
      { name: "리치", pick: (o: any) => o.type === "riichi" },
      { name: "론", pick: (o: any) => o.type === "win" },
    ];

    /*
     * 리치 단계는 둘 중 **하나만** 지나면 된다(가져온 패로 걸었으면 다음 후보는
     * 건너뛴다). 그래서 이미 리치를 걸었으면 리치 단계를 통째로 넘긴다.
     */
    let step = 0;
    let prompt = sock.last("prompt").prompt;
    let seen = promptCount();
    for (let i = 0; i < 80 && step < steps.length; i++) {
      const declared = view().round.byPlayer?.[view().playerId]?.riichiDeclared === true;
      if (declared && steps[step]!.name.startsWith("리치")) {
        step++;
        continue;
      }
      const want = find(prompt, steps[step]!.pick);
      if (want !== undefined) {
        /*
         * 리치를 걸기 **전에** 봇이 우연히 내 오름패를 버리면 리치 없이 화료가 되어
         * 정작 이 테스트가 보려던 "리치 → 론"이 안 나온다. 실제 화면도 같은 이유로
         * 말풍선이 떠 있는 동안 판을 세워 둔다(`TUTORIAL_HOLD_NOTE`) — 여기서도
         * 같은 신호를 써서, 리치를 거는 순간까지 봇을 멈춰 둔다.
         */
        if (steps[step]!.name.startsWith("연금술")) {
          sock.clientSend({ type: "tutorialHold", hold: true });
        }
        send(want);
        if (steps[step]!.name.startsWith("리치")) {
          sock.clientSend({ type: "tutorialHold", hold: false });
        }
        step++;
      } else {
        // 대본에 없는 프롬프트 — 후로는 넘기고, 리치 뒤의 강제 쯔모기리는 그대로 낸다
        const other =
          find(prompt, (o: any) => o.type === "pass") ??
          find(prompt, (o: any) => o.type === "discard");
        expect(
          other,
          `${steps[step]!.name} 앞에서 답할 수 없는 프롬프트가 왔다: ${prompt.options
            .map((o: any) => o.type)
            .join(",")}`,
        ).toBeDefined();
        send(other);
      }
      if (step >= steps.length) break;
      seen = promptCount();
      prompt = await nextPrompt(seen);
    }
    expect(step, `대본이 «${steps[Math.min(step, 3)]!.name}»에서 막혔다`).toBe(steps.length);

    await sock.waitFor((m) => m.type === "roundOver");
    const over = sock.last("roundOver");
    expect(over.outcome).toBe("win");
    const info = over.settle.winInfos?.[0];
    expect(info?.winner).toBe(view().playerId);
    /*
     * **리치를 걸고 화료했다**는 것이 이 테스트가 지키는 선이다.
     *
     * 론이냐 쯔모냐까지는 못 박지 않는다: 대기가 여섯 장이라 봇이 쏘기 전에 내가
     * 먼저 뽑는 순도 자주 온다. 그건 배우는 사람에게도 좋은 끝이고(코치의 «쯔모»
     * 강의가 받는다), 여기서 못 박으면 판의 운을 시험하는 테스트가 된다.
     * 배급 자체는 단위 테스트가 따로 지킨다(`TutorialFeed.test.ts`).
     */
    expect(["ron", "tsumo"]).toContain(info?.winType);
    expect(info?.yaku.map((y: any) => y.id)).toContain("riichi");
  }, 30_000);

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
    // 고정이 새어 나가면 체험이 매번 같은 판이 된다. 증강 선택창으로 본다 —
    // 잠긴 카드가 없고 새로고침도 살아 있어야 한다(배패의 무작위성은 한 판으로
    // 증명할 수 없지만, 이 둘은 결정적이다).
    const h = await newHarness();
    const sock = await connect(h, false);
    await sock.waitFor((m) => m.type === "draftOffer");
    const offer = sock.last("draftOffer");
    expect(offer.lockedId).toBeUndefined();
    expect(offer.rerollable).toContain(true);
    // 그리고 시작 증강 지급도 없다 (튜토리얼과 공유하던 배관이 남아 있지 않게)
    const view = sock.last("view").view;
    expect(view.players.find((p: any) => p.id === view.playerId).augments).toHaveLength(0);
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

  it("컨트롤러의 최후 그물도 함께 늘어난다 — 90초가 사람을 대신 두지 않게", async () => {
    /*
     * `HanchanController`에는 "답이 영영 안 오는 에이전트"를 위한 90초 그물이 따로
     * 있다. 튜토리얼은 사람도(사실상 무제한) 봇도(말풍선 동안 대기) 정상적으로 오래
     * 끄는 판이라 그 그물에 그대로 걸렸다 — 로그에 `p0 decide 무응답 90000ms`가
     * 찍히고 배우는 사람의 차례가 대신 두어졌으며, 봇의 결정도 안전 폴백으로 바뀌어
     * 리치 대기패 배급이 통째로 사라졌다(2026-08-18 실측: 그래서 유국이 났다).
     *
     * 끄지 않고 **늘린다** — 사람의 제한보다 넉넉해야 그물의 전제("에이전트 자신의
     * 타이머가 먼저 터진다")가 지켜지고, 유한해서 소프트락도 여전히 없다.
     */
    const h = await newHarness();
    const sock = await connect(h, true);
    await pickDraftAndPlay(sock);
    const cfg = (h.rm as any).rooms?.values?.().next?.().value?.controller?.["config"];
    expect(cfg?.agentDecideTimeoutMs, "튜토리얼 방의 그물이 안 늘어났다").toBeGreaterThan(
      TUTORIAL_DECISION_TIMEOUT_MS,
    );
    expect(Number.isFinite(cfg?.agentDecideTimeoutMs)).toBe(true);
  });

  it("말풍선이 떠 있으면 국 사이도 붙든다 — 마지막 안내를 읽는 중에 새 국이 시작되지 않게", async () => {
    /*
     * 마무리 말풍선("여기까지가 기본입니다")을 읽는 동안 국 사이 상한이 지나면 다음
     * 국이 시작됐다 — 다 끝난 줄 알았던 판이 저 혼자 다시 시작한다(2026-08-19 사용자
     * 보고). 봇의 결정을 멈추는 것과 같은 신호로 국 전환도 붙든다.
     */
    const h = await newHarness();
    const sock = await connect(h, true);
    await pickDraftAndPlay(sock);
    const room = (h.rm as any).rooms.values().next().value;
    const held = room.controller.config.holdBetweenRounds as (() => boolean) | undefined;
    expect(held, "튜토리얼 방에 국 사이 붙들기가 안 꽂혔다").toBeTypeOf("function");
    // 신호를 보내면 붙들고, 풀면 놓는다 — 시한이므로 끊겨도 스스로 풀린다
    expect(held!()).toBe(false);
    sock.clientSend({ type: "tutorialHold", hold: true });
    expect(held!()).toBe(true);
    sock.clientSend({ type: "tutorialHold", hold: false });
    expect(held!()).toBe(false);
  });

  it("체험판은 국 사이를 붙들지 않는다", async () => {
    const h = await newHarness();
    const sock = await connect(h, false);
    await sock.waitFor((m) => m.type === "draftOffer");
    const room = (h.rm as any).rooms.values().next().value;
    expect(room.controller.config.holdBetweenRounds).toBeUndefined();
    // 체험 손님이 이 신호를 보내도 아무 힘이 없다
    sock.clientSend({ type: "tutorialHold", hold: true });
    expect(room.tutorialHoldUntil).toBe(0);
  });

  it("체험판은 종전 그대로 — 그물을 건드리지 않는다", async () => {
    const h = await newHarness();
    const sock = await connect(h, false);
    await sock.waitFor((m) => m.type === "draftOffer");
    const cfg = (h.rm as any).rooms?.values?.().next?.().value?.controller?.["config"];
    expect(cfg?.agentDecideTimeoutMs).toBeUndefined();
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
