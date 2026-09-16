/**
 * 이어하기 × 국 경계 프로브 (QA 계획 55 B-10 / X-2 — 코어 수준, 결정적).
 *
 * `packages/server/test/ResumeMidDraft.test.ts`는 RoomManager 경로로 «드래프트 도중 끊긴 판»을
 * 실제 서버 절차대로 되살린다(시드는 서버가 뽑아 비결정적). 이 프로브는 같은 질문을
 * **시드 고정**으로, 그리고 **모든 국 경계**에 대해 묻는다:
 *
 *   한 판을 PersonaAgent 4명으로 완주시키며 이벤트 줄을 모은다. 그다음 국 경계마다
 *   두 지점에서 줄을 자르고 `reconstructGame` → `HanchanController.resume()` 으로 이어 돌린다.
 *
 *   (A) mid-draft  — 그 경계가 드래프트 스테이지 진입이면, 첫 `AugmentOffered` **직전**에서 자른다.
 *                    = 사람이 아직 고르지 않아 픽이 0개 적용된 «드래프트 도중 크래시» 상태(X-2).
 *   (B) pre-deal   — 다음 `RoundStarted` **직전**에서 자른다. = 국 사이(결과 화면·드래프트 완료 뒤)
 *                    크래시. 특히 오라스(남4·동4) 진입 직전이 관심 지점이다 — `runLoop`이 `playedRound`를
 *                    **이미 다음 국으로 넘어간 상태**에서 읽고 `endReason()`에 넘기므로(HanchanController.ts
 *                    runLoop 상단·`isAgariYame`), 되살린 판이 마지막 국을 치지 않고 끝날 수 있다는 의심.
 *
 * 위반 종류:
 *   RESUME_CRASH        resume()이 던졌다
 *   TIMEOUT             timeoutMs 안에 끝나지 않았다 (소프트락)
 *   LAST_ROUND_SKIPPED  라이브는 그 경계 뒤 국을 더 쳤는데 되살린 판은 한 국도 배패하지 않고 끝났다
 *   ENDED_DIFFERENTLY   라이브는 그 경계에서 끝났는데 되살린 판은 국을 더 쳤다
 *   MID_DRAFT_LOST      (A) 드래프트 도중에서 되살렸는데 그 스테이지 완료 플래그가 4좌석 전부에 찍히지 않았다
 *   NO_RANKINGS         정상 종료했는데 순위가 4개가 아니다
 *
 * 결과(2026-09-16, out/*.jsonl — 각 줄이 재현 정보를 담는다):
 *   - mid-draft 69건(smoke3 9 · smoke_hanchan 36 · smoke_tonpuu 24): 전부 draftFlags=4, 위반 0
 *     → **X-2 기각** (RoomManager 경로 `packages/server/test/ResumeMidDraft.test.ts`도 3스테이지 통과).
 *   - pre-deal 오라스 직전(olas_server 33 · olas_server_tonpuu 44): LAST_ROUND_SKIPPED 20건.
 *     dealerSoleTopAtCut=true 20/20 위반, false 57/57 정상 — **확정 결함**. 원인은 HanchanController.ts
 *     `runLoop`: round.over 재개 시 `runRound`가 배패 없이 즉시 돌아오는데 `playedRound`는 이미
 *     다음 국(오라스)이라 `isAgariYame`가 렌짱으로 오판한다. 결정적 재현: 위 테스트 파일의
 *     «오라스 직전 pre-deal 재개» describe(동풍전 시드 100, 서버 봇).
 *
 * 실행:
 *   ~/majak/node_modules/.bin/tsx qa-lab/round5/resume-mid-draft/resume_boundaries.ts \
 *       --start 1 --seeds 20 --shard 0 --shards 1 --mode hanchan --out qa-lab/round5/resume-mid-draft/out/s0.jsonl
 *   샤딩: seed % shards === shard 인 시드만 돈다. 결과는 jsonl 한 줄 = (seed, 경계, 자른 종류) 하나.
 *   각 줄에 seed·mode·bots·persona·boundary·cut 이 있어 그 줄만으로 재현된다 (`--only <seed>`).
 *
 *   --bots persona|server   persona(기본, harness PersonaAgent — 거의 화료하지 못해 점수가 안 움직인다)
 *                           server(packages/server BotAgent, 시드 고정 — 실제 봇전과 같은 점수 분포)
 *   --olasOnly              오라스(남4·동4) 진입 직전 pre-deal 경계 하나만 되살린다 (시드당 재개 1건)
 *   --boost <delta>         (합성) 그 경계에서 자르기 직전에 오야에게 ScoreChanged(+delta) 한 줄을 끼워
 *                           «오야 단독 1위» 상태를 만든다. 자연 발생을 못 잡을 때의 결정적 재현용 — 줄에 synthetic=true.
 */
import { mkdirSync, appendFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
  hanchanConfigForMode,
  draftDoneKey,
} from "@majak/core";
import type { DraftStage, PlayerId, RankingEntry } from "@majak/core";
import { contentAugments } from "@majak/content";
import { reconstructGame } from "../../../packages/server/src/ReplayReader.js";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";
import { PERSONAS, PersonaAgent, SEATS } from "../../harness.js";
import type { PlayerAgent } from "@majak/core";

type Mode = "hanchan" | "tonpuu";
type Bots = "persona" | "server";
type CutKind = "mid-draft" | "pre-deal";

interface Args {
  start: number;
  seeds: number;
  shard: number;
  shards: number;
  mode: Mode;
  out: string;
  timeoutMs: number;
  only: number | null;
  bots: Bots;
  olasOnly: boolean;
  boost: number;
}

function parseArgs(argv: string[]): Args {
  const a: Args = {
    start: 1,
    seeds: 10,
    shard: 0,
    shards: 1,
    mode: "hanchan",
    out: "qa-lab/round5/resume-mid-draft/out/resume_boundaries.jsonl",
    timeoutMs: 60_000,
    only: null,
    bots: "persona",
    olasOnly: false,
    boost: 0,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === "--start") a.start = Number(v);
    else if (k === "--seeds") a.seeds = Number(v);
    else if (k === "--shard") a.shard = Number(v);
    else if (k === "--shards") a.shards = Number(v);
    else if (k === "--mode") a.mode = v === "tonpuu" ? "tonpuu" : "hanchan";
    else if (k === "--out") a.out = String(v);
    else if (k === "--timeoutMs") a.timeoutMs = Number(v);
    else if (k === "--only") a.only = Number(v);
    else if (k === "--bots") a.bots = v === "server" ? "server" : "persona";
    else if (k === "--boost") a.boost = Number(v);
    else if (k === "--olasOnly") {
      a.olasOnly = true;
      continue;
    } else continue;
    i++;
  }
  return a;
}

/** 라이브 판과 되살린 판이 같은 성격을 쓰도록 시드로 페르소나를 고른다. */
function personasFor(seed: number): Record<PlayerId, string> {
  const names = Object.keys(PERSONAS);
  const out = {} as Record<PlayerId, string>;
  SEATS.forEach((id, i) => {
    out[id] = names[(seed + i * 3) % names.length]!;
  });
  return out;
}

function agentsFor(seed: number, personas: Record<PlayerId, string>, salt: number, bots: Bots, mode: Mode): PlayerAgent[] {
  if (bots === "server") {
    return SEATS.map((id, i) => {
      const b = new BotAgent(id, undefined, seed * 131 + i * 7 + 1 + salt, contentAugments, 0);
      b.setGameMode(mode);
      return b;
    });
  }
  return SEATS.map((id, i) => new PersonaAgent(id, PERSONAS[personas[id]!]!, seed * 131 + i * 7 + 1 + salt));
}

function withTimeout<T>(p: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => {
      onTimeout();
      rej(new Error(`TIMEOUT ${ms}ms`));
    }, ms);
    p.then(
      (v) => {
        clearTimeout(t);
        res(v);
      },
      (e) => {
        clearTimeout(t);
        rej(e);
      },
    );
  });
}

interface Ev {
  type: string;
  payload?: Record<string, unknown>;
}

const MID_TRIGGER: Partial<Record<DraftStage, (wind: number, num: number) => boolean>> = {
  eastThird: (w, n) => w === 1 && n === 3,
  eastFourth: (w, n) => w === 1 && n === 4,
  southEntry: (w, n) => w === 2 && n === 1,
  southThird: (w, n) => w === 2 && n === 3,
};

interface Live {
  lines: string[];
  events: Ev[];
  endReason: string | null;
  crash: string | null;
  rankings: RankingEntry[] | null;
}

async function runLive(seed: number, mode: Mode, personas: Record<PlayerId, string>, timeoutMs: number, bots: Bots): Promise<Live> {
  const lines: string[] = [];
  const events: Ev[] = [];
  const live: Live = { lines, events, endReason: null, crash: null, rankings: null };
  const agents = agentsFor(seed, personas, 0, bots, mode);
  const ctrl = new HanchanController(
    agents,
    {
      ...DEFAULT_HANCHAN_CONFIG,
      ...hanchanConfigForMode(mode),
      seed,
      extraAugments: contentAugments,
      agentDecideTimeoutMs: 20_000,
    },
    {
      onEvent: (j: string) => {
        lines.push(j);
        try {
          events.push(JSON.parse(j) as Ev);
        } catch {
          events.push({ type: "?" });
        }
      },
      onGameOver: (r, reason) => {
        live.rankings = r;
        live.endReason = reason;
      },
    },
  );
  try {
    await withTimeout(ctrl.run(), timeoutMs, () => ctrl.requestAbort());
  } catch (e) {
    live.crash = e instanceof Error ? e.message : String(e);
  }
  return live;
}

interface Row {
  seed: number;
  mode: Mode;
  bots: Bots;
  personas: Record<PlayerId, string>;
  /** --boost 로 만든 합성 상태인가 (오야 +delta 한 줄을 끼웠다) */
  synthetic: boolean;
  /** 경계 번호 (몇 번째 RoundSettled 뒤인가, 0부터) */
  boundary: number;
  /** 그 경계 뒤 상태의 장풍·국 (RoundSettled 페이로드) */
  next: { wind: number; num: number };
  stage: DraftStage | null;
  cutKind: CutKind;
  /** lines.slice(0, cut) 으로 재현 */
  cut: number;
  liveContinued: boolean;
  liveEndReason: string | null;
  resumedDealt: boolean;
  resumedRounds: number;
  resumedEndReason: string | null;
  draftFlags: number | null;
  scoresAtCut: Record<string, number> | null;
  dealerSeatAtCut: number | null;
  /** 자른 시점에 오야가 단독 1위인가 — 오라스 직전 경계에서 아가리야메 의심이 실제로 걸리는 조건 */
  dealerSoleTopAtCut: boolean | null;
  violations: string[];
  ms: number;
}

async function resumeFrom(
  seed: number,
  mode: Mode,
  personas: Record<PlayerId, string>,
  lines: readonly string[],
  cut: number,
  timeoutMs: number,
  bots: Bots,
): Promise<{
  post: Ev[];
  endReason: string | null;
  rankings: RankingEntry[] | null;
  crash: string | null;
  scores: Record<string, number>;
  dealerSeat: number;
  dealerSoleTop: boolean;
}> {
  const recon = reconstructGame(lines.slice(0, cut), { extraAugments: contentAugments });
  const st = recon.game.engine.state;
  const scores: Record<string, number> = {};
  for (const p of st.players) scores[p.id] = p.score;
  const dealerSeat = st.round.dealerSeat;
  const top = Math.max(...st.players.map((p) => p.score));
  const dealer = st.players.find((p) => p.seat === dealerSeat);
  const dealerSoleTop = dealer !== undefined && dealer.score === top && st.players.filter((p) => p.score === top).length === 1;
  const post: Ev[] = [];
  const out = {
    post,
    endReason: null as string | null,
    rankings: null as RankingEntry[] | null,
    crash: null as string | null,
    scores,
    dealerSeat,
    dealerSoleTop,
  };
  const agents = agentsFor(seed, personas, 7919, bots, mode);
  const ctrl = new HanchanController(
    agents,
    {
      ...DEFAULT_HANCHAN_CONFIG,
      ...recon.hanchan,
      extraAugments: contentAugments,
      agentDecideTimeoutMs: 20_000,
    },
    {
      onEvent: (j: string) => {
        try {
          post.push(JSON.parse(j) as Ev);
        } catch {
          post.push({ type: "?" });
        }
      },
      onGameOver: (r, reason) => {
        out.rankings = r;
        out.endReason = reason;
      },
    },
  );
  try {
    await withTimeout(ctrl.resume(recon.game), timeoutMs, () => ctrl.requestAbort());
  } catch (e) {
    out.crash = e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 4).join("\n")}` : String(e);
  }
  return out;
}

async function probeSeed(seed: number, a: Args, emit: (r: Row) => void): Promise<void> {
  const personas = personasFor(seed);
  const live = await runLive(seed, a.mode, personas, a.timeoutMs, a.bots);
  if (live.crash !== null) {
    process.stderr.write(`seed ${seed}: 라이브 판이 던졌다 — ${live.crash}\n`);
    return;
  }
  const { lines, events } = live;
  const schedules = hanchanConfigForMode(a.mode).draftSchedules ?? [];
  const maxWind = hanchanConfigForMode(a.mode).maxWind;

  // 경계 = RoundSettled 이벤트 위치들
  const settles = events.map((e, i) => (e.type === "RoundSettled" ? i : -1)).filter((i) => i >= 0);
  for (let b = 0; b < settles.length; b++) {
    const si = settles[b]!;
    const p = events[si]!.payload ?? {};
    const next = { wind: Number(p["prevalentWind"]), num: Number(p["roundNumber"]) };
    // 그 경계 뒤 첫 RoundStarted / 첫 AugmentOffered
    let nextStart = -1;
    let firstOffer = -1;
    for (let i = si + 1; i < events.length; i++) {
      const t = events[i]!.type;
      if (t === "RoundStarted") {
        nextStart = i;
        break;
      }
      if (t === "AugmentOffered" && firstOffer < 0) firstOffer = i;
    }
    const liveContinued = nextStart >= 0;
    const stage = schedules.find((s) => MID_TRIGGER[s]?.(next.wind, next.num) === true) ?? null;
    const olasEntry = next.wind === maxWind && next.num === 4;
    if (a.olasOnly && !(olasEntry && liveContinued)) continue;

    const cuts: { kind: CutKind; cut: number }[] = [];
    if (!a.olasOnly && stage !== null && firstOffer >= 0 && (nextStart < 0 || firstOffer < nextStart)) {
      cuts.push({ kind: "mid-draft", cut: firstOffer });
    }
    cuts.push({ kind: "pre-deal", cut: liveContinued ? nextStart : lines.length });

    for (const c of cuts) {
      const t0 = Date.now();
      // 합성 부양: 오라스 진입 pre-deal 경계에서만, 자르기 직전에 오야 +delta 한 줄을 끼운다.
      let src: readonly string[] = lines;
      let cut = c.cut;
      let synthetic = false;
      if (a.boost > 0 && olasEntry && c.kind === "pre-deal" && liveContinued) {
        const probe = reconstructGame(lines.slice(0, cut), { extraAugments: contentAugments });
        const st = probe.game.engine.state;
        const dealer = st.players.find((pl) => pl.seat === st.round.dealerSeat);
        const lastSeq = Number((events[cut - 1]?.payload as { seq?: unknown } | undefined)?.["seq"] ?? (JSON.parse(lines[cut - 1]!) as { seq?: number }).seq ?? cut);
        if (dealer !== undefined) {
          const boostLine = JSON.stringify({
            seq: lastSeq + 1,
            type: "ScoreChanged",
            payload: { player: dealer.id, delta: a.boost, reason: "qa:boost" },
          });
          src = [...lines.slice(0, cut), boostLine];
          cut = src.length;
          synthetic = true;
        }
      }
      const r = await resumeFrom(seed, a.mode, personas, src, cut, a.timeoutMs, a.bots);
      const violations: string[] = [];
      const resumedRounds = r.post.filter((e) => e.type === "RoundStarted").length;
      const resumedDealt = resumedRounds > 0;
      let draftFlags: number | null = null;
      if (r.crash !== null) {
        violations.push(r.crash.startsWith("TIMEOUT") ? "TIMEOUT" : `RESUME_CRASH ${r.crash.split("\n")[0]}`);
      } else {
        if (liveContinued && !resumedDealt) violations.push("LAST_ROUND_SKIPPED");
        if (!liveContinued && resumedDealt) violations.push("ENDED_DIFFERENTLY");
        if (c.kind === "mid-draft" && stage !== null) {
          draftFlags = SEATS.filter((id) =>
            r.post.some((e) => e.type === "AugmentDataSet" && e.payload?.["key"] === draftDoneKey(stage, id) && e.payload?.["value"] === true),
          ).length;
          if (draftFlags < 4) violations.push("MID_DRAFT_LOST");
        }
        if ((r.rankings?.length ?? 0) !== 4) violations.push("NO_RANKINGS");
      }
      emit({
        seed,
        mode: a.mode,
        bots: a.bots,
        personas,
        synthetic,
        boundary: b,
        next,
        stage,
        cutKind: c.kind,
        cut,
        liveContinued,
        liveEndReason: live.endReason,
        resumedDealt,
        resumedRounds,
        resumedEndReason: r.endReason,
        draftFlags,
        scoresAtCut: r.scores,
        dealerSeatAtCut: r.dealerSeat,
        dealerSoleTopAtCut: r.dealerSoleTop,
        violations,
        ms: Date.now() - t0,
      });
    }
  }
}

async function main(): Promise<void> {
  const a = parseArgs(process.argv.slice(2));
  mkdirSync(dirname(a.out), { recursive: true });
  const tally = new Map<string, number>();
  let rows = 0;
  let seedsRun = 0;
  const firstOf = new Map<string, Row>();
  const emit = (r: Row): void => {
    rows++;
    appendFileSync(a.out, `${JSON.stringify(r)}\n`);
    for (const v of r.violations) {
      const k = v.split(" ")[0]!;
      tally.set(k, (tally.get(k) ?? 0) + 1);
      if (!firstOf.has(k)) firstOf.set(k, r);
    }
  };
  const t0 = Date.now();
  const seeds = a.only !== null ? [a.only] : Array.from({ length: a.seeds }, (_, i) => a.start + i).filter((s) => s % a.shards === a.shard);
  for (const seed of seeds) {
    const ts = Date.now();
    await probeSeed(seed, a, emit);
    seedsRun++;
    process.stderr.write(`seed ${seed} 완료 (${Date.now() - ts}ms, 누적 ${rows}줄)\n`);
  }
  const total = Date.now() - t0;
  process.stderr.write(
    `\n== 요약: 시드 ${seedsRun}개 · 재개 ${rows}건 · ${total}ms (시드당 ${seedsRun > 0 ? Math.round(total / seedsRun) : 0}ms)\n`,
  );
  if (tally.size === 0) process.stderr.write("위반 없음\n");
  for (const [k, n] of tally) {
    const f = firstOf.get(k)!;
    process.stderr.write(
      `${k}: ${n}건 — 첫 예: seed ${f.seed} boundary ${f.boundary} (${f.cutKind}, cut ${f.cut}, next ${f.next.wind}-${f.next.num}, stage ${f.stage}) resumedEnd=${f.resumedEndReason}\n`,
    );
  }
}

void main();
