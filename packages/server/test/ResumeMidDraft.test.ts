/**
 * 이어하기 × **중반 드래프트 도중** 끊긴 판 — QA 계획 55 B-10 / X-2 검증.
 *
 * **의심(X-2)**: `HanchanController.resume()`은 `gameStart` 드래프트만 명시적으로 이어
 * 완료한다. eastThird / southEntry / southThird 드래프트 **도중**(사람 좌석이 아직
 * 고르지 않아 픽이 하나도 적용되지 않은 시점)에 서버가 죽으면, 되살린 판에서 남은
 * 좌석들이 그 스테이지의 픽을 영영 잃는다는 것이 의심이다.
 *
 * 이 파일이 확인하는 것 (스테이지마다 같은 절차):
 * 1. 사람 1 + 봇 3 **반장전**을 그 스테이지의 `draftOffer`가 사람 좌석에 도착한
 *    시점에서 멈춘다(사람은 답하지 않는다 → `runDraft`는 전원 응답 뒤에만 픽을
 *    적용하므로 리플레이에는 그 스테이지의 픽·완료 플래그가 하나도 없다).
 * 2. `shutdown` → 새 RoomManager → `restoreLiveGames()` 로 되살린다.
 * 3. (a) 돌아온 사람에게 **그 스테이지의** `draftOffer`가 다시 온다.
 *    (b) 봇 좌석들이 그 스테이지의 증강을 받는다 — 리플레이의
 *        `AugmentDataSet draft:done:<stage>:<bot>` 플래그와 `augment:stage:<bot>:<id>` = stage.
 *        좌석당 **정확히 1회**(재개가 중복 지급하지도, 건너뛰지도 않는다).
 *    (c) 판이 `gameOver`까지 간다.
 *
 * **판정(2026-09-16): X-2 기각.** 세 스테이지 모두 통과 — `runLoop`는 `round.over` 페이즈에서
 * 되살리면 `runRound`가 즉시 돌아오고 그 뒤 중반 드래프트 검사를 다시 하므로, 픽이 0개인
 * 스테이지는 그대로 이어서 뽑힌다(코어 프로브 `qa-lab/round5/resume-mid-draft`의 mid-draft
 * 69건도 전부 4좌석 완료). 그래서 이 파일은 그 경로를 지키는 회귀 테스트로 남는다.
 *
 * 대신 같은 프로브가 **다른 결함**을 잡았다 — 아래 «오라스 직전 pre-deal 재개» describe.
 *
 * 절차는 `Resume.test.ts`(«뷰 30개 대기» 방식·FakeSocket)를 따르되, 스테이지 하나를
 * **답하지 않고 붙드는** 소켓(`holdDraftStage`)이 추가됐다.
 */

import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { WebSocket } from "ws";
import type { DraftStage, PlayerAgent, PlayerId, RankingEntry } from "@majak/core";
import { DEFAULT_HANCHAN_CONFIG, HanchanController, hanchanConfigForMode } from "@majak/core";
import { contentAugments } from "@majak/content";
import { BotAgent } from "../src/BotAgent.js";
import { reconstructGame } from "../src/ReplayReader.js";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";

/** 한 스테이지에 닿기까지(반장전 ≤ 남3국) 기다리는 상한 — 봇은 vitest에서 0ms로 둔다. */
const REACH_STAGE_MS = 150_000;
/** 되살린 뒤 그 스테이지 오퍼가 다시 올 때까지의 상한 (재접속 복원은 즉시다). */
const REOFFER_MS = 30_000;
/** 되살린 판이 종국까지 가는 상한 (`Resume.test.ts` «되살린 판이 실제로 끝까지 간다»와 같은 급). */
const FINISH_MS = 180_000;
/** 판이 그 스테이지 전에 끝나면(토비·즉시 우승) 새 판으로 다시 시도한다. */
const MAX_ATTEMPTS = 3;

const MID_STAGES: readonly DraftStage[] = ["eastThird", "southEntry", "southThird"];

class FakeSocket {
  readyState = 1;
  sent: any[] = [];
  autoRespond = false;
  /** 이 스테이지의 `draftOffer`에는 **답하지 않는다** — 판을 드래프트 도중에 세워 두는 손잡이. */
  holdDraftStage: DraftStage | null = null;
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

  /** 받은 메시지 유형별 개수 — 실패 메시지에 «무엇을 받았는가»를 싣기 위한 것. */
  tally(): string {
    const counts = new Map<string, number>();
    for (const m of this.sent) counts.set(m.type, (counts.get(m.type) ?? 0) + 1);
    return [...counts].map(([t, n]) => `${t}×${n}`).join(" ");
  }

  waitFor(pred: (m: any) => boolean, timeoutMs: number, label = "waitFor"): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`${label} — ${timeoutMs}ms 안에 오지 않았다. 받은 것: ${this.tally()}`)),
        timeoutMs,
      );
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
      if (this.holdDraftStage !== null && msg.stage === this.holdDraftStage) return; // 붙든다
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

/** 리플레이 파일의 비어 있지 않은 줄들 (파일이 아직 없으면 빈 배열). */
async function replayLines(path: string): Promise<string[]> {
  if (!existsSync(path)) return [];
  const text = await readFile(path, "utf8");
  return text.split("\n").filter((l) => l.trim() !== "");
}

interface ReplayEvent {
  type: string;
  payload?: { key?: string; value?: unknown; player?: string; augmentId?: string };
}

function parseEvents(lines: readonly string[]): ReplayEvent[] {
  const out: ReplayEvent[] = [];
  for (const line of lines) {
    try {
      out.push(JSON.parse(line) as ReplayEvent);
    } catch {
      /* 반쯤 써진 마지막 줄 — 재구성기와 같은 규율로 버린다 */
    }
  }
  return out;
}

const dirs: string[] = [];
const dbs: SiteDb[] = [];
const managers: RoomManager[] = [];

async function newManager(dir: string, dbPath: string): Promise<{ rm: RoomManager; db: SiteDb }> {
  const store = new StatsStore(join(dir, "stats.json"));
  await store.load();
  const db = new SiteDb(dbPath);
  dbs.push(db);
  const rm = new RoomManager(dir, store, 0, db, "");
  managers.push(rm);
  return { rm, db };
}

async function newMachine(): Promise<{ dir: string; dbPath: string; rm: RoomManager; db: SiteDb }> {
  const dir = await mkdtemp(join(tmpdir(), "majak-resume-middraft-"));
  dirs.push(dir);
  const dbPath = join(dir, "site.db");
  const { rm, db } = await newManager(dir, dbPath);
  return { dir, dbPath, rm, db };
}

/** 이 매니저를 «죽인다» — 리플레이 파일과 live_games 행은 그대로 남는다. */
async function crash(rm: RoomManager, sock: FakeSocket): Promise<void> {
  await rm.shutdown("재시작");
  rm.stop();
  const i = managers.indexOf(rm);
  if (i >= 0) managers.splice(i, 1); // afterEach가 두 번 끄지 않게
  sock.close();
}

/**
 * 계정으로 붙어 **반장전**을 봇 3명과 시작하고 첫 뷰까지 기다린다.
 * 방의 기본 모드는 동풍전이라 `setGameMode`를 반드시 보낸다 — 동풍전에는
 * southEntry·southThird가 없다.
 */
async function startHanchan(
  rm: RoomManager,
  username: string,
  holdDraftStage: DraftStage,
): Promise<FakeSocket> {
  const sock = new FakeSocket();
  sock.autoRespond = true;
  sock.holdDraftStage = holdDraftStage;
  rm.handleConnection(sock.asWs());
  sock.clientSend({ type: "register", username, password: "pw123456" });
  await sock.waitFor((m) => m.type === "authOk", 10_000, "authOk");
  sock.clientSend({ type: "createRoom" });
  await sock.waitFor((m) => m.type === "roomCreated", 10_000, "roomCreated");
  sock.clientSend({ type: "setGameMode", mode: "hanchan" });
  await sock.waitFor((m) => m.type === "lobby" && m.gameMode === "hanchan", 10_000, "lobby(hanchan)");
  sock.clientSend({ type: "addBot" });
  sock.clientSend({ type: "addBot" });
  sock.clientSend({ type: "addBot" });
  await sock.waitFor((m) => m.type === "lobby" && m.players.length === 4, 10_000, "lobby(4)");
  sock.clientSend({ type: "startGame" });
  await sock.waitFor((m) => m.type === "view" || m.type === "draftOffer", 10_000, "첫 뷰");
  return sock;
}

interface Stopped {
  machine: Awaited<ReturnType<typeof newMachine>>;
  sock: FakeSocket;
  code: string;
  replayPath: string;
  /** 등록한 계정명 — 되살린 뒤 같은 이름으로 로그인한다. */
  username: string;
  humanId: string;
  botIds: string[];
}

/**
 * 판을 굴려 **그 스테이지의 `draftOffer`가 사람 좌석에 도착한 순간**에 세운다.
 * 사람은 답하지 않으므로 `runDraft`는 전원 응답을 기다리는 채로 멈춘다 — 픽은 0개 적용.
 * 판이 그 전에 끝나면(토비·즉시 우승) 새 판으로 다시 시도한다. 크래시는 그 자체로 결함이라 즉시 실패.
 */
async function stopAtStageOffer(stage: DraftStage, username: string): Promise<Stopped> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const machine = await newMachine();
    const account = `${username}${attempt}`;
    const sock = await startHanchan(machine.rm, account, stage);
    const code = sock.last("roomCreated").code as string;
    await sock.waitFor(
      (m) =>
        (m.type === "draftOffer" && m.stage === stage) ||
        m.type === "gameOver" ||
        m.type === "gameAborted" ||
        (m.type === "error" && m.code === "GAME_CRASHED"),
      REACH_STAGE_MS,
      `${stage} draftOffer`,
    );
    const crashed = sock.sent.find((m) => m.type === "error" && m.code === "GAME_CRASHED");
    if (crashed !== undefined) throw new Error(`판이 크래시했다 (${stage} 전): ${JSON.stringify(crashed)}`);
    const offer = sock.sent.find((m) => m.type === "draftOffer" && m.stage === stage);
    if (offer === undefined) {
      // 스테이지 전에 판이 끝났다 — 이 판은 버리고 새 시드로 다시.
      await crash(machine.rm, sock);
      continue;
    }
    const row = machine.db.listLiveGames().find((r) => r.code === code);
    if (row === undefined) throw new Error("live_games에 이 판이 없다");
    const humanId = sock.last("joined")?.playerId ?? row.seats.find((s) => !s.isBot)!.id;
    return {
      machine,
      sock,
      code,
      replayPath: row.replayPath,
      username: account,
      humanId,
      botIds: row.seats.filter((s) => s.isBot).map((s) => s.id),
    };
  }
  throw new Error(`${MAX_ATTEMPTS}판 모두 ${stage} 전에 끝났다 — 다시 돌려 보라`);
}

afterEach(async () => {
  for (const m of managers.splice(0)) {
    m.shutdown("테스트 정리");
    m.stop();
  }
  await new Promise((r) => setTimeout(r, 200));
  for (const d of dirs.splice(0)) {
    await rm(d, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  }
  for (const db of dbs.splice(0)) db.close();
});

describe("이어하기 × 중반 드래프트 도중 끊긴 판 (B-10 / X-2)", () => {
  for (const stage of MID_STAGES) {
    it(
      `${stage} 드래프트 도중 끊긴 판을 되살리면 — 사람에게 그 오퍼가 다시 오고, 봇도 그 스테이지 증강을 받고, 끝까지 간다`,
      async () => {
        const stopped = await stopAtStageOffer(stage, "MidDraft");
        const { machine, sock, code, replayPath, username, humanId, botIds } = stopped;
        const doneKey = (id: string): string => `draft:done:${stage}:${id}`;
        const isDone = (e: ReplayEvent, id: string): boolean =>
          e.type === "AugmentDataSet" && e.payload?.key === doneKey(id) && e.payload.value === true;
        const isStagePick = (e: ReplayEvent, id: string): boolean =>
          e.type === "AugmentDataSet" &&
          typeof e.payload?.key === "string" &&
          e.payload.key.startsWith(`augment:stage:${id}:`) &&
          e.payload.value === stage;

        // ── 끊는다 ── (shutdown이 리플레이를 디스크까지 내보낸다 — 그 뒤에 재야 «끊긴 시점»이다)
        await crash(machine.rm, sock);
        const beforeLines = await replayLines(replayPath);
        const before = parseEvents(beforeLines);
        expect(before[0]?.type).toBe("__init__");
        // 전제 확인: 정말 «드래프트 도중»이다 — 그 스테이지의 완료 플래그가 한 좌석에도 없다.
        // (runDraft는 전원 응답 뒤에 고정 순서로 픽을 적용하므로, 사람이 답하지 않으면 0개다.)
        for (const id of [humanId, ...botIds]) {
          expect(before.filter((e) => isDone(e, id)), `끊기 전 ${doneKey(id)}`).toHaveLength(0);
        }
        const crashCount = beforeLines.length;

        // ── 되살린다 ──
        const revived = await newManager(machine.dir, machine.dbPath);
        await revived.rm.restoreLiveGames();
        expect(revived.rm.healthSnapshot()).toMatchObject({ rooms: 1, playing: 1 });

        // 사람이 평소대로 돌아온다 — 이제부터는 답한다(붙드는 스테이지 없음).
        const back = new FakeSocket();
        back.autoRespond = true;
        revived.rm.handleConnection(back.asWs());
        back.clientSend({ type: "login", username, password: "pw123456" });
        await back.waitFor((m) => m.type === "authOk", 10_000, "authOk(재접속)");
        back.clientSend({ type: "joinRoom", code });
        await back.waitFor((m) => m.type === "view", 10_000, "view(재접속)");

        // (a) 그 스테이지의 draftOffer가 **다시** 온다.
        await back.waitFor(
          (m) => m.type === "draftOffer" && m.stage === stage,
          REOFFER_MS,
          `(a) 되살린 뒤 ${stage} draftOffer`,
        );

        // (c) 판이 끝까지 간다.
        await back.waitFor(
          (m) => m.type === "gameOver" || (m.type === "error" && m.code === "GAME_CRASHED"),
          FINISH_MS,
          "(c) gameOver",
        );
        const crashedAfter = back.sent.find((m) => m.type === "error" && m.code === "GAME_CRASHED");
        expect(crashedAfter, "되살린 판이 크래시했다").toBeUndefined();
        const over = back.last("gameOver");
        expect(over.rankings).toHaveLength(4);

        // (b) 봇 좌석들이 그 스테이지 증강을 받았다 — 끊긴 지점 **뒤**에, 좌석당 정확히 1회.
        const afterLines = await replayLines(replayPath);
        expect(afterLines.slice(0, crashCount)).toEqual(beforeLines); // 같은 파일을 이어 썼다
        const post = parseEvents(afterLines.slice(crashCount));
        for (const bot of botIds) {
          expect(post.filter((e) => isDone(e, bot)), `(b) 되살린 뒤 ${doneKey(bot)}`).toHaveLength(1);
          expect(
            post.some((e) => isStagePick(e, bot)),
            `(b) 봇 ${bot}의 ${stage} 픽(augment:stage:${bot}:* = ${stage})`,
          ).toBe(true);
        }
        // 사람 좌석도 같은 스테이지를 정확히 1회 마쳤다 (a의 오퍼가 실제 픽으로 이어졌다).
        expect(post.filter((e) => isDone(e, humanId)), `(b) 사람 ${doneKey(humanId)}`).toHaveLength(1);
        // 파일 전체로 봐도 그 스테이지는 좌석당 1회다 — 재개가 중복 지급하지 않았다.
        const whole = parseEvents(afterLines);
        for (const id of [humanId, ...botIds]) {
          expect(whole.filter((e) => isDone(e, id)), `전체 ${doneKey(id)}`).toHaveLength(1);
        }
        // 그 판은 끝난 판으로 남고 진행 중 목록에서 빠진다.
        expect(revived.db.listLiveGames()).toHaveLength(0);
      },
      REACH_STAGE_MS * MAX_ATTEMPTS + REOFFER_MS + FINISH_MS + 30_000,
    );
  }
});

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 프로브가 잡은 실제 결함 — **오라스(남4·동4) 진입 직전**(국 사이·결과 화면·드래프트 완료 뒤)
 * 에 끊긴 판을 되살리면, **오야가 단독 1위일 때** 마지막 국을 한 번도 배패하지 않고
 * `agariYame`으로 끝난다. 프로브 결과(`out/olas_server*.jsonl`): 오라스 직전 재개 77건 중
 * 오야 단독 1위 20건은 **20건 전부** 국 없이 종료, 나머지 57건은 전부 정상 — 조건이 정확히 일치.
 *
 * 원인(`packages/core/src/match/HanchanController.ts`, `runLoop`):
 *   1. `round.over` 페이즈에서 되살리면 `runRound`→`FlowController.begin()`이 배패 없이
 *      `{kind:"roundOver", outcome: lastOutcome()}` 로 **즉시** 돌아온다(FlowController.ts
 *      «phase === "round.over"»). outcome은 **이미 정산된 직전 국**의 것(win/draw)이다.
 *   2. 그런데 `playedRound`는 루프 머리에서 **현재 state.round**(= RoundSettled 리듀서가 이미
 *      올려 둔 **다음 국**, 오라스)를 읽는다. 결과: «오라스를 방금 쳤고 장풍·국번이 그대로다»
 *      = 렌짱으로 오판 → `isAgariYame` → 오야 단독 1위면 종국.
 *
 * 수정안: `HanchanController.resume()`(또는 `runLoop` 첫 반복)에서 `round.over` 페이즈로
 * 시작할 때는 «국을 친 것»으로 취급하지 않는다 — 이미 정산된 국이므로 종료 판정·토비·
 * 결과 화면 재전송을 건너뛰고 (a) 중반 드래프트 검사 → (b) `sys.startRound` 로 바로 간다.
 * 즉 runLoop에 «이번 반복은 배패하지 않았다(`outcome` 가 재개 잔상)» 분기를 하나 두거나,
 * resume()이 그 전처리를 스스로 하고 runLoop에 들어간다. RoomManager.ts는 손댈 곳이 없다.
 *
 * 이 테스트는 결정적이다: 시드 고정 동풍전(서버 BotAgent 4명)을 완주시켜 이벤트 줄을 모으고,
 * 동4국 `RoundStarted` **직전**에서 잘라 `reconstructGame`→`resume()`. 프로브 시드 100의
 * 그 지점은 오야(3번 자리) 단독 1위였다(전제 검사로 못 박는다).
 * 되돌리면(고치기 전) `RoundStarted` 0개·endReason `agariYame` 로 실패한다.
 */
describe("이어하기 × 오라스 직전 pre-deal 재개 — 오야 단독 1위면 마지막 국이 사라진다", () => {
  const SEATS: readonly PlayerId[] = ["p0", "p1", "p2", "p3"];
  interface Ev {
    type: string;
    payload?: Record<string, unknown>;
  }
  const bots = (seed: number, salt: number): PlayerAgent[] =>
    SEATS.map((id, i) => {
      const b = new BotAgent(id, undefined, seed * 131 + i * 7 + 1 + salt, contentAugments, 0);
      b.setGameMode("tonpuu");
      return b;
    });
  const cfg = (extra: object) => ({
    ...DEFAULT_HANCHAN_CONFIG,
    ...hanchanConfigForMode("tonpuu"),
    ...extra,
    extraAugments: contentAugments,
    agentDecideTimeoutMs: 20_000,
  });

  it("동4국 배패 직전에 끊긴 동풍전을 되살리면 동4국을 실제로 친다 (프로브 시드 110)", async () => {
    /*
     * 시드는 봇의 판단에 묶여 있다 — 봇이 달리 두면 같은 시드에서 점수가 달라져 아래
     * «오야 단독 1위» 전제가 깨진다. 2026-09-21 사람 성향 채택(bot/human/*) 뒤 시드 100은
     * 오야가 2위가 되어, 세 자리(103·105·112…)를 프로브해 103으로 옮겼다. 봇을 또 고치면
     * 같은 방법으로 다시 찾는다: 라이브 동풍전을 완주시켜 동4국 직전 누적 점수를 본다.
     * 2026-09-24 증강 2종(모래시계·위그드라실)이 카탈로그에 들어와 드래프트가 밀리면서 103도
     * 깨졌다(오야 4위). 100~140을 다시 프로브해 110으로 옮겼다.
     */
    const seed = 110;
    // ── 라이브: 완주하며 이벤트 줄을 모은다 ──
    const lines: string[] = [];
    const events: Ev[] = [];
    let liveEnd: string | null = null;
    const live = new HanchanController(bots(seed, 0), cfg({ seed }), {
      onEvent: (j: string) => {
        lines.push(j);
        events.push(JSON.parse(j) as Ev);
      },
      onGameOver: (_r: RankingEntry[], reason: string) => {
        liveEnd = reason;
      },
    });
    await live.run();
    expect(liveEnd).not.toBeNull();
    // 동4국(장풍 1·국 4) 첫 배패 위치 — `RoundStarted` 페이로드는 비어 있으므로,
    // «정산 뒤 다음 국이 동4»라고 적힌 첫 `RoundSettled` 다음의 `RoundStarted`를 찾는다.
    const settledIntoOlas = events.findIndex(
      (e) => e.type === "RoundSettled" && e.payload?.["prevalentWind"] === 1 && e.payload?.["roundNumber"] === 4,
    );
    const olasStart =
      settledIntoOlas < 0 ? -1 : events.findIndex((e, i) => i > settledIntoOlas && e.type === "RoundStarted");
    expect(olasStart, "라이브 판에 동4국이 있어야 한다 (시드 110)").toBeGreaterThan(0);

    // ── 그 직전에서 자른다 = 동3국 결과 화면(round.over)에서 서버가 죽었다 ──
    const recon = reconstructGame(lines.slice(0, olasStart), { extraAugments: contentAugments });
    const st = recon.game.engine.state;
    expect(st.round.phase).toBe("round.over");
    expect({ wind: st.round.prevalentWind, num: st.round.roundNumber }).toEqual({ wind: 1, num: 4 });
    // 전제: 오야가 단독 1위 — 이 조건에서만 오판이 걸린다(프로브 20/20).
    const top = Math.max(...st.players.map((p) => p.score));
    const dealer = st.players.find((p) => p.seat === st.round.dealerSeat)!;
    expect(dealer.score, `오야 단독 1위 전제 (점수 ${JSON.stringify(st.players.map((p) => [p.seat, p.score]))})`).toBe(top);
    expect(st.players.filter((p) => p.score === top)).toHaveLength(1);

    // ── 되살린다 ──
    const post: Ev[] = [];
    let resumedEnd: string | null = null;
    const revived = new HanchanController(bots(seed, 7919), cfg(recon.hanchan), {
      onEvent: (j: string) => post.push(JSON.parse(j) as Ev),
      onGameOver: (_r: RankingEntry[], reason: string) => {
        resumedEnd = reason;
      },
    });
    const rankings = await revived.resume(recon.game);
    expect(rankings).toHaveLength(4);
    // 핵심: 되살린 판은 동4국을 **쳐야** 한다 — 아직 배패도 하지 않은 국을 «렌짱»으로 읽고 끝내면 안 된다.
    const dealt = post.filter((e) => e.type === "RoundStarted").length;
    expect(
      dealt,
      `되살린 판이 동4국을 배패하지 않고 끝났다 (endReason=${resumedEnd}) — runLoop가 round.over 재개를 «방금 친 국»으로 오판`,
    ).toBeGreaterThan(0);
  }, 120_000);
});
