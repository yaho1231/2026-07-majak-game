/**
 * 프로토콜 에코 테스트 — QA 계획 55 B-6 (§2-6 «조작·효과 불변»).
 *
 * `HumanAgent.handleMessage`는 대기 중 프롬프트의 옵션과 **actionType 일치 +
 * `JSON.stringify(payload)` 바이트 동일**로만 액션을 받는다. 클라이언트는 받은 옵션
 * 객체를 그대로 되돌린다. 그러므로 «서버가 준 옵션을 JSON 왕복시켜 되돌리면 항상
 * 받아 준다»가 전 증강 조작의 전제다 — 서버가 옵션을 캐시·정규화(키 정렬, undefined
 * 제거)하기 시작하면 이 테스트가 먼저 깨진다.
 *
 * 무엇을 하나:
 *  1. 카탈로그(표준 4 + 콘텐츠)의 **액티브 증강**과 그것들이 내는 **액션 타입**을
 *     런타임으로 뽑는다 — 증강마다 새 엔진에 설치해 `engine.actions.types()`의 증분
 *     (snake_case = 사람에게 제시되는 것; PascalCase는 내부 «Performed» 이벤트)과
 *     `holderTurnOptions`/`holderReactionOptions` 등록 여부를 본다.
 *  2. 실제 `RoomManager` + `HumanAgent`(FakeSocket) + 봇 3으로 판을 굴리며, 사람 좌석에
 *     오는 **모든 프롬프트**에서 «증강 옵션이 있으면 그것(타입별 라운드로빈), 없으면
 *     win > (riichi 격회) > pass > discard»를 `JSON.parse(JSON.stringify(option))`로 되돌린다.
 *     2단계 모달형(왕패의 주인·3장 교환 등)은 후속 프롬프트의 후보를 그대로 되돌린다.
 *  3. INVALID_ACTION·TARGET_IN_RIICHI·INVALID_DRAFT_PICK 0건 + 판이 끝까지(gameOver)
 *     가는지 단언하고, 만난(제시된·되돌린) actionType 집합 대비 카탈로그 액티브 타입
 *     커버 비율을 보고한다.
 *
 * 판 구성:
 *  - 반장전 1판: 일반 방, 드래프트는 액티브 증강을 우선 집는다 (샤드 0에서만).
 *  - 샌드박스 묶음: 액티브 증강을 `conflicts`·`modes`를 지키며 8장씩 묶어(실제 판에서
 *    한 좌석이 들 수 있는 최대치 — 드래프트 4 + 지급형 몇 장 — 언저리) 묶음마다 판 하나.
 *    사람 좌석에 배패 전 지급(`sandboxReset`)한다. 묶음이 판 시작에서 크래시하면
 *    반으로 쪼개 다시 돌려 크래시 최소 묶음을 찾는다(1장 단독 크래시만 실패, 나머지는
 *    보고). 40장 한 좌석은 `sys.startRound`에서 이벤트 연쇄 상한(128)에 걸린다(스모크
 *    2026-09-16 실측) — 샌드박스에서만 나는 상황이라 묶음을 실전 크기로 잡았다.
 *
 * 환경변수(샤딩·조정):
 *  - `PROTOCOL_ECHO_SHARD=k PROTOCOL_ECHO_SHARDS=n` — 묶음 i를 i % n === k 인 것만 돈다.
 *  - `PROTOCOL_ECHO_SLICE_SIZE=8` — 묶음 크기.
 *  - `PROTOCOL_ECHO_REPEATS=1` — 샌드박스 묶음을 몇 번씩 도는지(확장 모드). 기본 1회는
 *    묶음 10개 + 반장전 1판 ≈ 25~30초(2026-09-16 실측, 게이트 부담 없음). 시드가 판마다
 *    달라 조건부 옵션(리치 뒤·깡 뒤·텐파이…)은 반복할수록 더 만난다.
 *  - `PROTOCOL_ECHO_GRANTS=a,b,c` — 묶음을 이 하나로 고정(재현용).
 *  - `PROTOCOL_ECHO_REPORT=<path>` — 판마다 JSONL 한 줄(`mode·preset·persona:"echo"·seed·
 *    code·outcome·errors·offered/echoed 타입…`) + 마지막에 coverage 한 줄을 덧붙인다.
 *    시드는 일반 방은 리플레이 `__init__`에서 읽고, 샌드박스는 기록을 안 남겨 null이다
 *    (서버는 시드를 `randomInt`로 뽑고 프로토콜에 싣지 않는다 — 계획 X-9).
 *
 * 실행: `npx vitest run packages/server/test/ProtocolEcho.test.ts`
 */

import { afterAll, afterEach, describe, expect, it } from "vitest";
import { appendFileSync, mkdirSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { WebSocket } from "ws";
import { createStandardGame, installAugment, standardAugments } from "@majak/core";
import type { AugmentDef, GameMode } from "@majak/core";
import { contentAugments } from "@majak/content";
import { RoomManager } from "../src/RoomManager.js";
import { StatsStore } from "../src/StatsStore.js";
import { SiteDb } from "../src/SiteDb.js";

// ───────────────────────────── 예산·설정 ─────────────────────────────

/**
 * 한 판이 **실제로 끝나는 데** 주는 예산. RoomManager.test의 HANCHAN_MS(90초)와 같은
 * 근거 — 유휴 13~17초, 병렬 부하 아래 31~45초(에코 페르소나는 유휴 2초 안팎, 2026-09-16
 * 실측). vitest.config의 testTimeout(300초) 안에 든다.
 */
const GAME_MS = 120_000;
const TEST_MS = GAME_MS + 60_000;
/** 크래시로 묶음을 쪼개 다시 돌 때의 상한 — 한 테스트 안에서 판 여러 개 */
const SPLIT_TEST_MS = 290_000;

/** 표준 액션 없이 증강 옵션만 연속으로 되돌린 횟수 상한 — 넘으면 표준 폴백 + 기록 */
const AUG_STREAK_CAP = 8;

/** `sanitizeSandboxAugments`의 좌석당 상한 (RoomManager.ts MAX_SANDBOX_AUGMENTS) */
const SANDBOX_GRANT_CAP = 40;

const MODE: GameMode = "hanchan";

const envInt = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 ? Math.floor(v) : fallback;
};
const SLICE_SIZE = Math.min(SANDBOX_GRANT_CAP, Math.max(1, envInt("PROTOCOL_ECHO_SLICE_SIZE", 8)));
const SHARD = envInt("PROTOCOL_ECHO_SHARD", 0);
const SHARDS = Math.max(1, envInt("PROTOCOL_ECHO_SHARDS", 1));
const REPEATS = Math.max(1, envInt("PROTOCOL_ECHO_REPEATS", 1));

// ───────────────────── 1. 액티브 증강·액션 타입 열거 ─────────────────────

const ALL_DEFS: readonly AugmentDef[] = [...standardAugments, ...contentAugments];
const SNAKE = /^[a-z0-9_]+$/;

interface ActiveInfo {
  id: string;
  /** 설치가 새로 등록한 snake_case 액션 타입 (제시되는 옵션 타입) */
  types: string[];
  turn: boolean;
  reaction: boolean;
}

interface ActiveCatalog {
  /** 증강 없이 표준 게임이 등록하는 액션 타입 (discard·pass·…) */
  standardTypes: Set<string>;
  active: ActiveInfo[];
  /** 액션 타입 → 그 타입을 등록하는 증강 id들 */
  owners: Map<string, string[]>;
  installErrors: { id: string; error: string }[];
}

function enumerateActive(): ActiveCatalog {
  const base = createStandardGame({ seed: 1, extraAugments: contentAugments, mode: MODE });
  const standardTypes = new Set(base.engine.actions.types());
  const active: ActiveInfo[] = [];
  const owners = new Map<string, string[]>();
  const installErrors: { id: string; error: string }[] = [];

  for (const def of ALL_DEFS) {
    const game = createStandardGame({ seed: 1, extraAugments: contentAugments, mode: MODE });
    const engine = game.engine;
    let turn = false;
    let reaction = false;
    const origTurn = engine.registerTurnOptions.bind(engine);
    const origReaction = engine.registerReactionOptions.bind(engine);
    engine.registerTurnOptions = (provider, source) => {
      turn = true;
      origTurn(provider, source);
    };
    engine.registerReactionOptions = (provider, source) => {
      reaction = true;
      origReaction(provider, source);
    };
    const before = new Set(engine.actions.types());
    try {
      installAugment(engine, def, "p0", { yaku: game.yaku, catalog: game.augments });
    } catch (err) {
      installErrors.push({ id: def.id, error: String(err) });
      continue;
    }
    const types = engine.actions.types().filter((t) => !before.has(t) && SNAKE.test(t));
    if (turn || reaction || types.length > 0) {
      active.push({ id: def.id, types, turn, reaction });
      for (const t of types) owners.set(t, [...(owners.get(t) ?? []), def.id]);
    }
  }
  return { standardTypes, active, owners, installErrors };
}

const CATALOG = enumerateActive();
const ACTIVE_IDS = new Set(CATALOG.active.map((a) => a.id));
const ACTIVE_TYPES = new Set(CATALOG.owners.keys());
const DEF_BY_ID = new Map(ALL_DEFS.map((d) => [d.id, d]));

/**
 * 샌드박스에 줄 액티브 증강 묶음들 — `conflicts`(대칭)와 `modes`를 지키며 카탈로그
 * 순서대로 `SLICE_SIZE`장씩. 충돌로 밀린 것은 뒤 묶음에서 다시 넣는다.
 */
function sandboxGrantSlices(): string[][] {
  const override = process.env["PROTOCOL_ECHO_GRANTS"];
  if (override !== undefined && override.trim() !== "") {
    return [override.split(",").map((s) => s.trim()).filter((s) => s !== "")];
  }
  const candidates = CATALOG.active
    .map((a) => DEF_BY_ID.get(a.id))
    .filter((d): d is AugmentDef => d !== undefined)
    .filter((d) => d.modes === undefined || d.modes.includes(MODE));
  const conflicts = (a: AugmentDef, picked: string[]): boolean =>
    picked.some((id) => {
      const other = DEF_BY_ID.get(id);
      return (a.conflicts?.includes(id) ?? false) || (other?.conflicts?.includes(a.id) ?? false);
    });
  const groups: string[][] = [];
  let pending = candidates;
  while (pending.length > 0) {
    const group: string[] = [];
    const rest: AugmentDef[] = [];
    for (const d of pending) {
      if (group.length < SLICE_SIZE && !conflicts(d, group)) group.push(d.id);
      else rest.push(d);
    }
    if (group.length === 0) break; // 남은 것끼리 전부 충돌 — 있을 수 없지만 무한 루프 방지
    groups.push(group);
    pending = rest;
  }
  return groups;
}

const SLICES = sandboxGrantSlices();
const MY_SLICES = SLICES.map((s, i) => ({ i, s }))
  .filter(({ i }) => i % SHARDS === SHARD)
  .flatMap((x) => Array.from({ length: REPEATS }, (_, r) => ({ ...x, r })));

// ───────────────────────── 2. 에코 소켓 ─────────────────────────

interface Option {
  type: string;
  payload: unknown;
}

interface EchoStats {
  prompts: number;
  picks: number;
  augPicks: number;
  /** 프롬프트에 제시된 옵션 타입 → 횟수 */
  offered: Map<string, number>;
  /** 되돌린 옵션 타입 → 횟수 */
  echoed: Map<string, number>;
  /** 되돌린 (type, payload) 쌍 — «모든 옵션» 커버리지의 분자 */
  echoedPairs: Set<string>;
  offeredPairs: Set<string>;
  errors: Map<string, number>;
  errorSamples: { code: string; message: string; lastPick: Option | null }[];
  /** 연속 상한에 걸려 표준으로 폴백한 순간의 옵션 타입 */
  loopGuards: string[];
  drafts: { stage: string; picked: string; offered: string[] }[];
  roundsOver: number;
  /**
   * 되돌리기 전에 프롬프트가 접힌(promptCancel 또는 같은 좌석의 새 프롬프트) 경우 —
   * 실제 클라이언트도 접힌 프롬프트는 화면에서 사라지므로 되돌리지 않는다. 무엇이
   * 접었는지(직전 이벤트 타입들·새 옵션 타입)를 남겨 원인 증강을 짚을 수 있게 한다.
   */
  preempts: { seat: string; how: string; stale: string; next: string[]; recent: string[] }[];
}

function newStats(): EchoStats {
  return {
    prompts: 0,
    picks: 0,
    augPicks: 0,
    offered: new Map(),
    echoed: new Map(),
    echoedPairs: new Set(),
    offeredPairs: new Set(),
    errors: new Map(),
    errorSamples: [],
    loopGuards: [],
    drafts: [],
    roundsOver: 0,
    preempts: [],
  };
}

function bump(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1);
}

class EchoSocket {
  readyState = 1; // OPEN
  sent: unknown[] = [];
  readonly stats = newStats();
  /** 프롬프트·드래프트·roundOver에 응답할지 — `armWhen`으로 특정 메시지부터 켠다 */
  echo = true;
  private armPred: ((m: any) => boolean) | null = null;
  private lastPick: Option | null = null;
  private augStreak = 0;
  /** 좌석별 «지금 서 있는 프롬프트»의 일련번호 — 되돌릴 때 아직 같은 번호여야 보낸다 */
  private promptSeq = new Map<string, number>();
  /** 좌석별 아직 안 되돌린 픽 (접힘 진단용) */
  private staleable = new Map<string, Option>();
  /** 최근 받은 메시지 타입 몇 개 — 접힘 원인 짚기용 */
  private recentTypes: string[] = [];
  private handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  private waiters: {
    pred: (m: any) => boolean;
    resolve: () => void;
    timer: ReturnType<typeof setTimeout>;
  }[] = [];

  /** 이 조건을 만족하는 메시지가 오는 순간(동기) 응답을 켠다 — 그 전 메시지는 무시 */
  armWhen(pred: (m: any) => boolean): void {
    this.echo = false;
    this.armPred = pred;
  }

  send(data: string): void {
    const msg = JSON.parse(data);
    this.sent.push(msg);
    this.recentTypes.push(msg.type === "event" ? `event:${msg.event?.type ?? "?"}` : String(msg.type));
    if (this.recentTypes.length > 6) this.recentTypes.shift();
    if (this.armPred !== null && this.armPred(msg)) {
      this.echo = true;
      this.armPred = null;
    }
    this.waiters = this.waiters.filter((w) => {
      if (w.pred(msg)) {
        clearTimeout(w.timer);
        w.resolve();
        return false;
      }
      return true;
    });
    if (msg.type === "error") {
      bump(this.stats.errors, String(msg.code));
      if (this.stats.errorSamples.length < 20) {
        this.stats.errorSamples.push({
          code: String(msg.code),
          message: String(msg.message),
          lastPick: this.lastPick,
        });
      }
      return;
    }
    if (msg.type === "promptCancel") {
      this.invalidate(String(msg.seat), `promptCancel:${String(msg.reason)}`, []);
      return;
    }
    if (!this.echo) return;
    if (msg.type === "prompt") this.onPrompt(msg.prompt);
    else if (msg.type === "draftOffer") this.onDraft(msg);
    else if (msg.type === "roundOver") {
      this.stats.roundsOver++;
      setTimeout(() => this.clientSend({ type: "roundContinue" }), 0);
    }
  }

  /**
   * 되돌릴 옵션을 고른다 — 증강 옵션(표준 게임이 등록하지 않은 타입)이 있으면 그중
   * 가장 덜 되돌린 타입, 같은 타입 안에서는 payload를 돌아가며; 없으면 win > pass >
   * discard > 첫 옵션. 증강 옵션만 8번 연속이면(같은 프롬프트가 되풀이되는 소프트락
   * 의심) 표준으로 폴백하고 기록한다.
   */
  private choose(options: Option[]): { pick: Option; aug: boolean } {
    const aug = options.filter((o) => !CATALOG.standardTypes.has(o.type));
    if (aug.length > 0 && this.augStreak < AUG_STREAK_CAP) {
      let best: Option = aug[0] as Option;
      let bestCount = Number.POSITIVE_INFINITY;
      for (const o of aug) {
        const c = this.stats.echoed.get(o.type) ?? 0;
        if (c < bestCount) {
          best = o;
          bestCount = c;
        }
      }
      const sameType = aug.filter((o) => o.type === best.type);
      const pick = sameType[bestCount % sameType.length] as Option;
      return { pick, aug: true };
    }
    if (aug.length > 0) this.stats.loopGuards.push((aug[0] as Option).type);
    // 리치를 제시받으면 두 번에 한 번 건다 — 리치 후에만 열리는 증강 옵션(리치 취소·
    // 오픈 리치·손바닥 뒤집기…)이 에코 페르소나에게도 제시되게. 매번 걸면 리치 뒤
    // 자동 쓰모기리로 프롬프트 수가 급감해(반장전 12회 실측) 다른 옵션 커버가 준다.
    const riichi = options.find((o) => o.type === "riichi");
    const takeRiichi = riichi !== undefined && (this.stats.offered.get("riichi") ?? 0) % 2 === 1;
    const pick =
      options.find((o) => o.type === "win") ??
      (takeRiichi ? riichi : undefined) ??
      options.find((o) => o.type === "pass") ??
      options.find((o) => o.type === "discard") ??
      options[0];
    return { pick: pick as Option, aug: false };
  }

  /**
   * 좌석의 서 있던 프롬프트를 접는다 — 아직 되돌리지 않은 픽이 있으면 «접힘»으로
   * 기록하고 버린다. HumanAgent.decideFor는 같은 좌석의 이전 대기를 폴백으로 정리한
   * 뒤(promptCancel preempted) 새 프롬프트를 보내므로, 옛 옵션을 되돌리면
   * INVALID_ACTION(«이미 끝난 선택»)이 난다 — 실제 클라이언트도 옛 화면은 지운다.
   */
  private invalidate(seat: string, how: string, next: string[]): void {
    this.promptSeq.set(seat, (this.promptSeq.get(seat) ?? 0) + 1);
    const stale = this.staleable.get(seat);
    if (stale !== undefined) {
      this.staleable.delete(seat);
      if (this.stats.preempts.length < 30) {
        this.stats.preempts.push({ seat, how, stale: stale.type, next, recent: [...this.recentTypes] });
      }
    }
  }

  private onPrompt(prompt: { player: string; options: Option[] }): void {
    const options = prompt.options;
    const seat = prompt.player;
    this.invalidate(
      seat,
      "prompt",
      options.map((o) => o.type),
    );
    const seq = this.promptSeq.get(seat) ?? 0;
    this.stats.prompts++;
    for (const o of options) {
      bump(this.stats.offered, o.type);
      this.stats.offeredPairs.add(`${o.type}|${JSON.stringify(o.payload)}`);
    }
    if (options.length === 0) return;
    const { pick, aug } = this.choose(options);
    this.augStreak = aug ? this.augStreak + 1 : 0;
    if (aug) this.stats.augPicks++;
    this.stats.picks++;
    bump(this.stats.echoed, pick.type);
    this.stats.echoedPairs.add(`${pick.type}|${JSON.stringify(pick.payload)}`);
    // 실제 클라이언트와 같은 왕복 — 받은 옵션을 JSON으로 되돌린다
    const echoed: Option = JSON.parse(JSON.stringify(pick));
    this.staleable.set(seat, echoed);
    setTimeout(() => {
      // 그 사이 접혔으면(취소·새 프롬프트) 되돌리지 않는다 — 실제 화면에도 없는 선택이다
      if (this.promptSeq.get(seat) !== seq) return;
      this.staleable.delete(seat);
      this.lastPick = echoed;
      this.clientSend({
        type: "action",
        actionType: echoed.type,
        payload: echoed.payload,
        seat,
      });
    }, 0);
  }

  /** 드래프트 — 액티브 증강을 우선 집는다 (커버리지). */
  private onDraft(msg: { stage: string; choices: { id: string }[] }): void {
    const ids = msg.choices.map((c) => c.id);
    const id = ids.find((i) => ACTIVE_IDS.has(i)) ?? ids[0];
    if (id === undefined) return;
    this.stats.drafts.push({ stage: msg.stage, picked: id, offered: ids });
    setTimeout(() => this.clientSend({ type: "draftPick", stage: msg.stage, augmentId: id }), 0);
  }

  on(event: string, cb: (...a: unknown[]) => void): void {
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
    return [...this.sent].reverse().find((m: any) => m.type === type);
  }

  waitFor(pred: (m: any) => boolean, timeoutMs: number): Promise<void> {
    if (this.sent.some(pred)) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("waitFor timeout")), timeoutMs);
      this.waiters.push({ pred, resolve, timer });
    });
  }

  private emit(event: string, ...args: unknown[]): void {
    for (const cb of this.handlers[event] ?? []) cb(...args);
  }

  asWs(): WebSocket {
    return this as unknown as WebSocket;
  }
}

// ───────────────────────── 3. 하네스·기록 ─────────────────────────

const dirs: string[] = [];
const dbs: SiteDb[] = [];

interface Harness {
  rm: RoomManager;
  db: SiteDb;
  replayDir: string;
}

async function newHarness(): Promise<Harness> {
  const replayDir = await mkdtemp(join(tmpdir(), "majak-echo-"));
  dirs.push(replayDir);
  const store = new StatsStore(join(replayDir, "stats.json"));
  await store.load();
  const db = new SiteDb(":memory:");
  dbs.push(db);
  return { rm: new RoomManager(replayDir, store, 0, db), db, replayDir };
}

async function connectAs(h: Harness, username: string, admin = false): Promise<EchoSocket> {
  const sock = new EchoSocket();
  h.rm.handleConnection(sock.asWs());
  sock.clientSend({
    type: "register",
    username,
    password: "pw123456",
    ...(admin ? { adminCode: h.db.adminCode() } : {}),
  });
  await sock.waitFor((m) => m.type === "authOk" || m.type === "error", 10_000);
  expect(sock.last("authOk"), "가입 실패").toBeDefined();
  return sock;
}

afterEach(async () => {
  for (const d of dirs.splice(0)) await rm(d, { recursive: true, force: true });
  for (const db of dbs.splice(0)) db.close();
});

/**
 * 판이 도는 동안 console.error를 가로챈다 — 두 종류를 센다.
 *  - `[hanchan] <me> submit(x) 예외`: **제시됐고 받아 줬는데 넣을 때 던진** 수(핸찬
 *    컨트롤러가 조용히 pass로 갈아 끼운다). 프로토콜은 통과했으나 조작이 증발한 것.
 *  - 그 외(훅 예외·크래시 사유 등): 건수와 앞부분만.
 */
function captureErrors(me: string): { stop: () => void; rejected: string[]; others: string[] } {
  const rejected: string[] = [];
  const others: string[] = [];
  const orig = console.error;
  console.error = (...args: unknown[]) => {
    const head = String(args[0] ?? "");
    if (head.includes(`[hanchan] ${me} submit(`)) rejected.push(head);
    else if (others.length < 30) others.push(args.map((a) => String(a).slice(0, 300)).join(" "));
    else if (others.length === 30) others.push("…");
  };
  return { stop: () => void (console.error = orig), rejected, others };
}

type Outcome = "finished" | "crashed" | "timeout";

interface GameRecord {
  game: string;
  mode: GameMode;
  persona: "echo";
  preset: string[];
  seed: number | null;
  code: string | null;
  outcome: Outcome;
  crash: string | null;
  ms: number;
  prompts: number;
  picks: number;
  augPicks: number;
  roundsOver: number;
  errors: Record<string, number>;
  errorSamples: EchoStats["errorSamples"];
  loopGuards: string[];
  drafts: EchoStats["drafts"];
  preempts: EchoStats["preempts"];
  offeredTypes: string[];
  echoedTypes: string[];
  echoedPairs: number;
  offeredPairs: number;
  submitRejected: string[];
  consoleErrors: string[];
  /** 지급·드래프트로 들고 있었는데 옵션이 한 번도 제시되지 않은 액티브 증강 */
  heldButNeverOffered: string[];
}

const records: GameRecord[] = [];

function finishRecord(
  game: string,
  sock: EchoSocket,
  preset: string[],
  extra: { seed: number | null; code: string | null; outcome: Outcome; crash: string | null; ms: number },
  captured: { rejected: string[]; others: string[] },
): GameRecord {
  const s = sock.stats;
  const heldActive = preset.filter((id) => ACTIVE_IDS.has(id));
  const heldButNeverOffered = heldActive.filter((id) => {
    const info = CATALOG.active.find((a) => a.id === id);
    return info !== undefined && !info.types.some((t) => s.offered.has(t));
  });
  const rec: GameRecord = {
    game,
    mode: MODE,
    persona: "echo",
    preset,
    ...extra,
    prompts: s.prompts,
    picks: s.picks,
    augPicks: s.augPicks,
    roundsOver: s.roundsOver,
    errors: Object.fromEntries(s.errors),
    errorSamples: s.errorSamples,
    loopGuards: s.loopGuards,
    drafts: s.drafts,
    preempts: s.preempts,
    offeredTypes: [...s.offered.keys()].filter((t) => !CATALOG.standardTypes.has(t)),
    echoedTypes: [...s.echoed.keys()].filter((t) => !CATALOG.standardTypes.has(t)),
    echoedPairs: s.echoedPairs.size,
    offeredPairs: s.offeredPairs.size,
    submitRejected: captured.rejected,
    consoleErrors: captured.others,
    heldButNeverOffered,
  };
  records.push(rec);
  const line = JSON.stringify(rec);
  console.log(`[echo] ${line}`);
  const out = process.env["PROTOCOL_ECHO_REPORT"];
  if (out !== undefined && out !== "") {
    mkdirSync(dirname(out), { recursive: true });
    appendFileSync(out, line + "\n");
  }
  return rec;
}

/** 프로토콜 단언 — 되돌린 옵션이 거절된 적이 없어야 한다. */
function assertAccepted(rec: GameRecord): void {
  for (const code of ["INVALID_ACTION", "TARGET_IN_RIICHI", "INVALID_DRAFT_PICK"]) {
    expect(
      rec.errors[code] ?? 0,
      `${rec.game} ${code} ${rec.errors[code] ?? 0}건 — 샘플 ${JSON.stringify(rec.errorSamples.slice(0, 3))}`,
    ).toBe(0);
  }
  expect(rec.outcome, `${rec.game} 판이 ${rec.ms}ms 안에 끝나지 않았다 (소프트락 의심)`).not.toBe(
    "timeout",
  );
}

/** gameOver·크래시(GAME_CRASHED / gameAborted)·예산 초과 중 먼저 오는 것 */
async function playToEnd(
  sock: EchoSocket,
  budgetMs: number,
): Promise<{ outcome: Outcome; crash: string | null; ms: number }> {
  const t0 = Date.now();
  const isEnd = (m: any): boolean =>
    m.type === "gameOver" || m.type === "gameAborted" || (m.type === "error" && m.code === "GAME_CRASHED");
  try {
    await sock.waitFor(isEnd, budgetMs);
  } catch {
    return { outcome: "timeout", crash: null, ms: Date.now() - t0 };
  }
  const ms = Date.now() - t0;
  if (sock.last("gameOver") !== undefined) return { outcome: "finished", crash: null, ms };
  const crashed = sock.last("error");
  const aborted = sock.last("gameAborted");
  return {
    outcome: "crashed",
    crash: crashed?.code === "GAME_CRASHED" ? String(crashed.message) : String(aborted?.reason ?? "aborted"),
    ms,
  };
}

/**
 * 샌드박스 판 하나 — 관리자 방을 열고 **프롬프트가 나기 전에** 곧바로 리셋해 지급
 * 목록을 배패 전에 설치한다(드래프트와 같은 시점). 응답은 새 판의 `sandbox` 메시지부터
 * 켠다 — 리셋은 옛 컨트롤러에 abort를 걸 뿐이라 옛 판의 프롬프트가 늦게 도착할 수 있다.
 */
async function playSandbox(label: string, grants: string[]): Promise<GameRecord> {
  const h = await newHarness();
  const admin = await connectAs(h, "Boss", true);
  admin.armWhen((m) => m.type === "sandbox" && Object.keys(m.augments ?? {}).length > 0);
  admin.clientSend({ type: "sandboxStart", mode: MODE });
  const me = admin.last("sandbox")?.seat as string | undefined;
  expect(me, "sandboxStart 응답 없음").toBeDefined();
  const cap = captureErrors(me as string);
  admin.clientSend({ type: "sandboxReset", augments: { [me as string]: grants }, mode: MODE });
  await admin.waitFor((m) => m.type === "sandbox" && m.augments?.[me as string] !== undefined, 20_000);
  const granted = admin.last("sandbox").augments[me as string] as string[];
  expect(granted, "지급이 걸러졌다").toEqual(grants);

  const played = await playToEnd(admin, GAME_MS);
  cap.stop();
  return finishRecord(label, admin, granted, { ...played, seed: null, code: admin.last("sandbox").code ?? null }, cap);
}

/**
 * 묶음이 판 시작에서 크래시하면 반으로 쪼개 다시 돈다 — 크래시 최소 묶음을 찾는다.
 * 돌린 판 전부를 돌려준다(첫 원소가 원 묶음).
 */
async function playSandboxShrinking(label: string, grants: string[], depth = 0): Promise<GameRecord[]> {
  const rec = await playSandbox(depth === 0 ? label : `${label}/split${depth}`, grants);
  if (rec.outcome !== "crashed" || grants.length <= 1) return [rec];
  const mid = Math.ceil(grants.length / 2);
  const left = await playSandboxShrinking(label, grants.slice(0, mid), depth + 1);
  const right = await playSandboxShrinking(label, grants.slice(mid), depth + 1);
  return [rec, ...left, ...right];
}

// ───────────────────────── 4. 테스트 ─────────────────────────

describe("프로토콜 에코 — 서버가 준 옵션을 JSON 왕복으로 되돌리면 항상 받아 준다", () => {
  it("카탈로그 열거 — 액티브 증강과 액션 타입을 뽑는다 (설치 예외 0)", () => {
    expect(CATALOG.installErrors, "설치 중 던진 증강").toEqual([]);
    expect(CATALOG.active.length).toBeGreaterThan(50);
    expect(ACTIVE_TYPES.size).toBeGreaterThan(50);
    // 표준 액션이 증강 타입으로 새지 않았는지
    for (const t of ACTIVE_TYPES) expect(CATALOG.standardTypes.has(t), t).toBe(false);
    // 옵션 빌더는 등록했는데 액션 타입이 안 잡힌 것 — 열거 한계(보고용)
    const noTypes = CATALOG.active.filter((a) => a.types.length === 0).map((a) => a.id);
    console.log(
      `[echo] 액티브 ${CATALOG.active.length}종 · 액션 타입 ${ACTIVE_TYPES.size}종 · ` +
        `표준 타입 ${CATALOG.standardTypes.size}종 · 타입 미검출 ${noTypes.length}: ${noTypes.join(",")} · ` +
        `샌드박스 묶음 ${SLICES.length}개(크기 ${SLICE_SIZE}) 중 이 샤드 ${MY_SLICES.length}개 (shard ${SHARD}/${SHARDS})`,
    );
  });

  it.runIf(SHARD === 0)(
    "반장전 1판 — 일반 방(드래프트는 액티브 우선), 사람 좌석 전 프롬프트 에코, INVALID_ACTION 0",
    async () => {
      const h = await newHarness();
      const sock = await connectAs(h, "Echo");
      sock.clientSend({ type: "createRoom" });
      const me = sock.last("joined").playerId as string;
      const code = sock.last("roomCreated").code as string;
      sock.clientSend({ type: "setGameMode", mode: MODE });
      for (let i = 0; i < 3; i++) sock.clientSend({ type: "addBot" });
      const cap = captureErrors(me);
      sock.clientSend({ type: "startGame" });
      const played = await playToEnd(sock, GAME_MS);
      // 기록 영속화까지 기다린다 (임시 디렉터리 정리 레이스 방지)
      if (played.outcome === "finished") {
        await sock.waitFor((m) => m.type === "stats", 30_000).catch(() => undefined);
      }
      cap.stop();

      // 시드 — 리플레이 `__init__` 라인에서 (프로토콜에는 없다)
      let seed: number | null = null;
      if (played.outcome === "finished") {
        try {
          sock.clientSend({ type: "replayList" });
          await sock.waitFor((m) => m.type === "replayList", 10_000);
          const gameId = sock.last("replayList").games?.[0]?.gameId;
          if (gameId !== undefined) {
            sock.clientSend({ type: "replayGet", gameId });
            await sock.waitFor((m) => m.type === "replayData", 10_000);
            const init = JSON.parse(sock.last("replayData").lines[0]);
            seed = init?.payload?.config?.seed ?? null;
          }
        } catch {
          seed = null;
        }
      }
      const preset = sock.stats.drafts.map((d) => d.picked);
      const rec = finishRecord("plain-hanchan", sock, preset, { ...played, seed, code }, cap);
      assertAccepted(rec);
      expect(rec.outcome, `크래시: ${rec.crash}`).toBe("finished");
      // 리치 뒤는 자동 쓰모기리라 프롬프트가 안 오고, 반장전은 파산으로 일찍 끝날 수
      // 있다(6국 12프롬프트 실측) — «판이 실제로 돌았다»만 본다.
      expect(rec.prompts).toBeGreaterThan(5);
      expect(rec.roundsOver).toBeGreaterThan(0);
    },
    TEST_MS,
  );

  for (const { i, s, r } of MY_SLICES) {
    const rep = REPEATS > 1 ? ` (반복 ${r + 1}/${REPEATS})` : "";
    it(
      `샌드박스 묶음 ${i + 1}/${SLICES.length}${rep} — ${s.length}장 지급 [${s.join(",")}], 전 프롬프트 에코, INVALID_ACTION 0`,
      async () => {
        const recs = await playSandboxShrinking(`sandbox-${i + 1}${REPEATS > 1 ? `#${r + 1}` : ""}`, s);
        for (const rec of recs) assertAccepted(rec);
        // 1장 단독으로도 크래시하면 그건 그 증강의 결함이다. 묶음 크래시는 기록만 한다
        // (샌드박스 지급은 드래프트와 설치 시점·검증이 다르다 — 계획 X-10).
        for (const rec of recs) {
          if (rec.preset.length === 1) {
            expect(rec.outcome, `${rec.preset[0]} 단독 크래시: ${rec.crash}`).toBe("finished");
          }
        }
        const root = recs[0] as GameRecord;
        if (root.outcome === "finished") {
          expect(root.prompts).toBeGreaterThan(5);
        } else {
          const minimal = recs.filter((r) => r.outcome === "crashed").sort((a, b) => a.preset.length - b.preset.length)[0];
          console.log(
            `[echo] 묶음 ${i + 1} 크래시 — 최소 묶음 [${minimal?.preset.join(",")}]: ${minimal?.crash}`,
          );
        }
      },
      SPLIT_TEST_MS,
    );
  }

  afterAll(() => {
    if (records.length === 0) return;
    const offered = new Set<string>();
    const echoed = new Set<string>();
    for (const r of records) {
      for (const t of r.offeredTypes) offered.add(t);
      for (const t of r.echoedTypes) echoed.add(t);
    }
    const coveredEchoed = [...ACTIVE_TYPES].filter((t) => echoed.has(t));
    const coveredOffered = [...ACTIVE_TYPES].filter((t) => offered.has(t));
    const missing = [...ACTIVE_TYPES].filter((t) => !echoed.has(t));
    const unknownEchoed = [...echoed].filter((t) => !ACTIVE_TYPES.has(t));
    const byAug = new Map<string, string[]>();
    for (const t of missing) {
      for (const id of CATALOG.owners.get(t) ?? []) byAug.set(id, [...(byAug.get(id) ?? []), t]);
    }
    const pct = (n: number): string =>
      ACTIVE_TYPES.size === 0 ? "0%" : `${((100 * n) / ACTIVE_TYPES.size).toFixed(1)}%`;
    const report = {
      shard: `${SHARD}/${SHARDS}`,
      games: records.length,
      outcomes: Object.fromEntries(
        (["finished", "crashed", "timeout"] as Outcome[]).map((o) => [o, records.filter((r) => r.outcome === o).length]),
      ),
      activeTypes: ACTIVE_TYPES.size,
      echoedCovered: coveredEchoed.length,
      echoedCoverage: pct(coveredEchoed.length),
      offeredCovered: coveredOffered.length,
      offeredCoverage: pct(coveredOffered.length),
      echoedTypes: [...echoed].sort(),
      unknownEchoed,
      submitRejected: records.reduce((n, r) => n + r.submitRejected.length, 0),
      preempted: records.reduce((n, r) => n + r.preempts.length, 0),
      missingTypes: missing.sort(),
      crashes: records.filter((r) => r.outcome === "crashed").map((r) => ({ preset: r.preset, crash: r.crash })),
      missingByAugment: Object.fromEntries(byAug),
    };
    console.log(
      `[echo] 커버 — 되돌린 ${coveredEchoed.length}/${ACTIVE_TYPES.size} (${pct(coveredEchoed.length)}) · ` +
        `제시된 ${coveredOffered.length}/${ACTIVE_TYPES.size} (${pct(coveredOffered.length)}) · ` +
        `미커버 ${missing.length}: ${missing.sort().join(",")}`,
    );
    console.log(`[echo] coverage ${JSON.stringify(report)}`);
    const out = process.env["PROTOCOL_ECHO_REPORT"];
    if (out !== undefined && out !== "") {
      appendFileSync(out, JSON.stringify({ game: "coverage", ...report }) + "\n");
    }
  });
});
