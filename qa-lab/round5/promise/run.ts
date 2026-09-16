/**
 * B-4 약속 검사기 ② — 실측. p0 에 카드 **1장**을 강제하고(드래프트 끔) 증강광(masher,
 * augmentBias 1) 네 명으로 완주시켜, 카드가 실제로 몇 번·어느 국에·어떤 조건에서
 * 발동했고 무엇을 상대에게 보였는지를 jsonl 로 남긴다. 판정은 judge.ts 가 한다.
 *
 *   npx tsx qa-lab/round5/promise/run.ts <shard> <shards> [seeds=5]
 *        [--cards=joker,big_hand] [--modes=hanchan,tonpuu] [--seed=1,2]
 *        [--p0=masher|bot] [--opp=masher|bot]
 *        [--mutant=joker_fixed_cooldown] [--timeout=150000] [--tag=smoke] [--resume]
 *
 *   --p0=bot : p0 를 서버 BotAgent 로. 증강광 넷은 화료를 거의 못 해(스모크 24국 전부 유국)
 *              «+N판·N배·최소 만관» 정산 수치가 관측되지 않는다 — 수치 패스는 이걸로 돌린다.
 *
 * 결과: qa-lab/round5/promise/out/promise-<shard>of<shards>[-<tag>].jsonl — 판마다 한 줄.
 *       card·mode·seed·preset·personas·drafts:false·mutant 를 적어 두므로 같은 인자로 재현된다.
 *
 * 실측 항목 (판마다):
 *  - fires   : p0 가 고른 **비표준 액션**(STD_ACTIONS 밖 = 이 카드의 액션; p0 만 카드를 든다)
 *              마다 {국 인덱스, 버림 수, 멘쯔 수, 리치 여부}. 엔진이 되돌려 폴백된 픽은
 *              `[hanchan] p0 submit(...) 예외` console.error 를 잡아 rejected 로 표시한다.
 *  - seq     : `<id>:usedSeq:p0`(content/util cooldownUsedKey) 값의 변화열 = 쿨다운 기준
 *              발동 국 번호. 연속 차가 쿨다운 간격이다. `view:p0:cooldown:<id>` 최댓값도 적는다
 *              (발동 직후 값 = 코드가 믿는 쿨다운 국 수).
 *  - uses    : `view:p0:uses:<id>` = {left,total,scope} (uses_left_channel.test.ts 규약) —
 *              total·scope·최소 left·감소 횟수·음수 여부.
 *  - settles : RoundSettled 마다 p0 의 delta, winInfo(han·points·winType), extraHanBy·augPoints
 *              중 이 카드 줄, 그 국에 발동했는가, p0 가 그 국 오야였는가.
 *  - leaks   : 상대(p1~p3)에게 **실제로 내려간** PlayerView.augmentView 에서 카드 id 가 든
 *              채널. `seat:p0:uses|cooldown*:<id>` 는 pill 사본(계획 P-1 판단 대기)으로 따로,
 *              나머지는 public 으로 적는다. buildPlayerView 를 다시 부르는 대신 컨트롤러가
 *              에이전트에 보낸 뷰 그 자체를 본다(그게 상대 화면이다).
 *  - metrics : synergy3/build/instrument.ts 의 훅 계측(react/inter/offer) — 자동형 카드의
 *              «무엇이든 했는가». standard 4종은 코어 레지스트리가 등록하므로 계측 밖이다
 *              (augmentData 흔적·액션 픽으로만 본다).
 *
 * --mutant=joker_fixed_cooldown : **자기 검증용 결함 주입** (qa-lab 안에서만, packages/ 불변).
 *   #511 이전의 조커(쿨다운 고정 2국)를 되살린다 — validate 가 "on cooldown" 을 돌려줄 때
 *   `seq - usedSeq >= 2` 면 통과시킨다. 반장전에서 2국 간격이 나오고 judge 가
 *   «동풍전 2국·반장전 3국» 약속 위반으로 울려야 검사기가 살아 있는 것이다.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_HANCHAN_CONFIG, HanchanController, playerAtSeat } from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  DecisionPrompt,
  GameState,
  PlayerAgent,
  PlayerId,
  PlayerView,
} from "@majak/core";
import { contentAugments } from "@majak/content";
import {
  PERSONAS,
  PersonaAgent,
  SEATS,
  STD_ACTIONS,
  allAugments,
  checkState,
  offerable,
} from "../../harness.js";
import type { Ledger, Persona, Violation } from "../../harness.js";
import { newMetrics, wrapCatalog } from "../../synergy3/build/instrument.js";

export type Mode = "hanchan" | "tonpuu";

export interface Fire {
  /** 1부터 세는 국 인덱스 (본장 포함, onRoundStart 마다 +1) */
  round: number;
  rk: string;
  type: string;
  discardCount: number;
  melds: number;
  riichi: boolean;
  turnCount: number;
  /** 엔진이 되돌려 패스로 폴백된 픽 */
  rejected?: boolean;
}

export interface LeakRec {
  key: string;
  sample: string;
  round: number;
  /** 첫 발동 뒤에 처음 보였는가 */
  afterFire: boolean;
}

export interface Settle {
  round: number;
  rk: string;
  outcome: string;
  p0Won: boolean;
  p0Dealer: boolean;
  delta: number;
  winType: string | null;
  han: number | null;
  infoPoints: number | null;
  yakumanCount: number | null;
  /** winInfos[p0].extraHanBy 중 이 카드 줄 */
  extraHan: number[];
  /** augPoints 중 (player p0, augId 카드) 줄 */
  augPoints: { points: number; han: number | null }[];
  firedThisRound: boolean;
}

export interface Row {
  card: string;
  mode: Mode;
  seed: number;
  preset: Record<PlayerId, readonly string[]>;
  personas: string[];
  drafts: false;
  mutant: string | null;
  ms: number;
  rounds: number;
  crash: string | null;
  timeout: boolean;
  effectErrors: string[];
  violations: string[];
  fires: {
    count: number;
    rejected: number;
    types: Record<string, number>;
    list: Fire[];
    perRound: Record<string, number>;
    maxPerRound: number;
    whileRiichi: number;
    notFirstTurn: number;
  };
  seq: {
    fireSeqs: number[];
    intervals: number[];
    viewCooldownMax: number | null;
    viewCooldownTurnsMax: number | null;
  };
  uses: {
    present: boolean;
    totals: number[];
    scopes: string[];
    minLeft: number | null;
    maxLeft: number | null;
    /** left 가 줄어든 총량 = 채널이 말하는 실제 소모 횟수 (다단계 액션의 픽 수보다 정확하다) */
    decrements: number;
    decByRound: Record<string, number>;
    negative: boolean;
    overTotal: boolean;
  };
  settles: Settle[];
  leaks: { public: LeakRec[]; pill: LeakRec[] };
  touched: boolean;
  augKeys: string[];
  metrics: {
    ruleSet: number;
    reactCall: number;
    reactEmit: number;
    interCall: number;
    interChange: number;
    optionOffer: number;
  } | null;
  actionTypes: string[];
  /** console.error 줄 수 (submit 폴백 외의 잡음 — 훅 예외는 effectErrors 에 따로) */
  stderrLines: number;
}

const HERE = dirname(fileURLToPath(import.meta.url));
export const OUT_DIR = join(HERE, "out");

/* ───────────── 결함 주입 (자기 검증) ───────────── */

/**
 * 조커의 쿨다운을 **모드와 무관하게 2국**으로 되돌린다 — #511 이전 상태.
 * validate 가 "on cooldown" 을 돌려줄 때만 끼어들어 `seq - usedSeq >= 2` 면 통과시킨다.
 * FlowController 는 후보를 validate 로 거르므로(isLegal) 버튼도 같이 열린다.
 * 설치 중에만 `engine.actions.register` 를 잠깐 가로챈다 (packages/ 무변경).
 */
function jokerFixedCooldown(def: AugmentDef): AugmentDef {
  const FIXED = 2;
  return {
    ...def,
    install(ctx): void {
      const reg = (ctx as unknown as { engine: { actions: { register: (a: unknown) => void } } })
        .engine.actions;
      const orig = reg.register.bind(reg);
      type V = (req: { player: PlayerId }, x: { state: GameState }) => string | null;
      reg.register = (a: unknown): void => {
        const ad = a as { type: string; validate: V };
        orig({
          ...ad,
          validate: (req: { player: PlayerId }, x: { state: GameState }): string | null => {
            const r = ad.validate(req, x);
            if (r !== "on cooldown") return r;
            const used = x.state.augmentData[`joker:usedSeq:${req.player}`];
            const seq = x.state.augmentData[`joker:seq:${req.player}`];
            const s = typeof seq === "number" ? seq : 0;
            return typeof used !== "number" || s - used >= FIXED ? null : r;
          },
        });
      };
      try {
        def.install(ctx);
      } finally {
        delete (reg as { register?: unknown }).register; // 프로토타입 메서드로 복귀
      }
    },
  };
}

export const MUTANTS: Record<string, (catalog: readonly AugmentDef[]) => AugmentDef[]> = {
  joker_fixed_cooldown: (catalog) =>
    catalog.map((d) => (d.id === "joker" ? jokerFixedCooldown(d) : d)),
};

/* ───────────── 에이전트 ───────────── */

export type AgentKind = "masher" | "bot";

/**
 * 에이전트 인스턴스에 탐침을 단다 — decide 의 결과(픽)와 sendView(상대 화면)를 가로챈다.
 * PersonaAgent 든 서버 BotAgent 든 인스턴스 속성으로 덮으므로 클래스를 안 건드린다.
 */
function probe(
  agent: PlayerAgent,
  onPick: (o: ActionOption) => void,
  onView: (v: PlayerView) => void,
): PlayerAgent {
  const a = agent as unknown as {
    decide: (p: DecisionPrompt) => Promise<ActionOption>;
    sendView: (v: PlayerView, s?: unknown) => void;
  };
  const origDecide = a.decide.bind(agent);
  const origView = a.sendView.bind(agent);
  a.decide = async (prompt: DecisionPrompt): Promise<ActionOption> => {
    const o = await origDecide(prompt);
    onPick(o);
    return o;
  };
  a.sendView = (v: PlayerView, s?: unknown): void => {
    onView(v);
    origView(v, s);
  };
  return agent;
}

/**
 * 좌석 에이전트를 만든다. `bot` 은 서버의 실제 BotAgent(balanced 원형) — 증강광은 무작위로
 * 버려 **화료를 거의 못 하므로**(스모크: 24국 전부 유국) «+N판·N배·최소 만관» 같은 정산
 * 수치는 bot 좌석으로 돌려야 관측된다. 봇은 카드마다 `bot` 정책이 있을 때만 발동하므로
 * 발동 횟수 검사에는 여전히 masher 를 쓴다.
 */
async function makeAgent(kind: AgentKind, id: PlayerId, seed: number, catalog: readonly AugmentDef[]): Promise<PlayerAgent> {
  if (kind === "masher") return new PersonaAgent(id, PERSONAS.masher as Persona, seed);
  const { BotAgent } = await import("../../../packages/server/src/BotAgent.js");
  return new BotAgent(id, `bot-${id}`, seed, catalog, 0, "balanced") as unknown as PlayerAgent;
}

/* ───────────── 한 판 ───────────── */

export interface RunOneOpts {
  card: string;
  mode: Mode;
  seed: number;
  mutant?: string;
  timeoutMs?: number;
  /** p0(카드 보유자) 에이전트 — 기본 masher */
  p0?: AgentKind;
  /** p1~p3 에이전트 — 기본 masher */
  opp?: AgentKind;
}

const idRe = (id: string): RegExp => new RegExp(`(^|:)${id.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(:|$)`);

export async function runOne(o: RunOneOpts): Promise<Row> {
  const { card, mode, seed } = o;
  const t0 = Date.now();
  const preset: Record<PlayerId, readonly string[]> = { p0: [card], p1: [], p2: [], p3: [] };
  const p0Kind: AgentKind = o.p0 ?? "masher";
  const oppKind: AgentKind = o.opp ?? "masher";
  const personas = SEATS.map((s) => (s === "p0" ? p0Kind : oppKind));
  const idMatch = idRe(card);

  const m = newMetrics();
  let catalog: AugmentDef[] = wrapCatalog(m, contentAugments);
  if (o.mutant !== undefined) {
    const mut = MUTANTS[o.mutant];
    if (mut === undefined) throw new Error(`unknown mutant: ${o.mutant}`);
    catalog = wrapCatalog(m, mut(contentAugments));
  }

  let ctrl: HanchanController | null = null;
  let roundIdx = 0;
  let rk = "";
  let p0DealerThisRound = false;
  const fires: Fire[] = [];
  const fireSeqs: number[] = [];
  let lastUsedSeq: number | undefined;
  let viewCooldownMax: number | null = null;
  let viewCooldownTurnsMax: number | null = null;
  const uses = {
    present: false,
    totals: new Set<number>(),
    scopes: new Set<string>(),
    minLeft: null as number | null,
    maxLeft: null as number | null,
    decrements: 0,
    decByRound: {} as Record<string, number>,
    negative: false,
    overTotal: false,
  };
  let lastLeft: number | undefined;
  let lastLeftRound = 0;
  const settles: Settle[] = [];
  const leakPublic = new Map<string, LeakRec>();
  const leakPill = new Map<string, LeakRec>();
  const augKeys = new Set<string>();
  const violations: Violation[] = [];
  const effectErrors: string[] = [];
  const seen: Ledger = { notes: [], reasons: [], drifts: [] };
  let stderrLines = 0;

  const stateNow = (): GameState | null => ctrl?.gameState ?? null;

  const onPick = (opt: ActionOption): void => {
    if (STD_ACTIONS.has(opt.type)) return;
    const st = stateNow();
    const rp = st?.round.byPlayer["p0"];
    fires.push({
      round: roundIdx,
      rk,
      type: opt.type,
      discardCount: rp?.discardCount ?? -1,
      melds: rp?.melds.length ?? -1,
      riichi: rp?.riichi != null,
      turnCount: st?.round.turnCount ?? -1,
    });
  };
  const onOppView = (v: PlayerView): void => {
    const fired = fires.some((f) => f.rejected !== true);
    for (const [k, val] of Object.entries(v.augmentView)) {
      if (!idMatch.test(k)) continue;
      const isPill = /^seat:p0:(uses|cooldown|cooldownTurns|cooldownUsedRound):/.test(k);
      const bucket = isPill ? leakPill : leakPublic;
      if (bucket.has(k)) continue;
      let sample: string;
      try { sample = JSON.stringify(val) ?? "undefined"; } catch { sample = String(val); }
      bucket.set(k, { key: k, sample: sample.slice(0, 80), round: roundIdx, afterFire: fired });
    }
  };

  const agents: PlayerAgent[] = [];
  for (const [i, id] of SEATS.entries()) {
    const raw = await makeAgent(id === "p0" ? p0Kind : oppKind, id, seed * 131 + i * 7 + 1, catalog);
    agents.push(probe(raw, id === "p0" ? onPick : () => {}, id === "p0" ? () => {} : onOppView));
  }

  const origErr = console.error;
  console.error = (...args: unknown[]): void => {
    stderrLines++;
    const s = args.map((a) => (typeof a === "string" ? a : "")).join(" ");
    const mm = /\[hanchan\] p0 submit\(([^)]+)\) 예외/.exec(s);
    if (mm !== null) {
      // 마지막으로 고른 같은 타입의 픽을 되돌린 것으로 본다
      for (let i = fires.length - 1; i >= 0; i--) {
        const f = fires[i] as Fire;
        if (f.type === mm[1] && f.rejected !== true) { f.rejected = true; break; }
      }
    }
  };

  let crash: string | null = null;
  let timeout = false;
  try {
    ctrl = new HanchanController(agents, {
      ...DEFAULT_HANCHAN_CONFIG,
      mode,
      seed,
      maxWind: mode === "tonpuu" ? 1 : 2,
      westEntry: false,
      draftSchedules: [],
      extraAugments: catalog,
      presetAugments: preset,
      agentDecideTimeoutMs: 20_000,
    } as never, {
      onRoundStart: (g: { engine: { state: GameState } }) => {
        roundIdx++;
        const st = g.engine.state;
        rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
        p0DealerThisRound = playerAtSeat(st, st.round.dealerSeat).id === "p0";
      },
      onEvent: (j: string) => {
        try {
          const e = JSON.parse(j) as { type?: string; payload?: Record<string, unknown> };
          if (e.type !== "RoundSettled") return;
          const p = e.payload ?? {};
          const infos = (p["winInfos"] ?? []) as {
            winner: string; winType: string; han: number; points: number; yakumanCount: number;
            extraHanBy?: { augId: string; han: number }[];
          }[];
          const mine = infos.find((w) => w.winner === "p0");
          const notes = (p["augPoints"] ?? []) as { player: string; augId: string; points: number; han?: number }[];
          const deltas = (p["deltas"] ?? {}) as Record<string, number>;
          settles.push({
            round: roundIdx,
            rk,
            outcome: String(p["outcome"]),
            p0Won: mine !== undefined,
            p0Dealer: p0DealerThisRound,
            delta: deltas["p0"] ?? 0,
            winType: mine?.winType ?? null,
            han: mine?.han ?? null,
            infoPoints: mine?.points ?? null,
            yakumanCount: mine?.yakumanCount ?? null,
            extraHan: (mine?.extraHanBy ?? []).filter((x) => x.augId === card).map((x) => x.han),
            augPoints: notes.filter((n) => n.player === "p0" && n.augId === card)
              .map((n) => ({ points: n.points, han: n.han ?? null })),
            firedThisRound: fires.some((f) => f.round === roundIdx && f.rejected !== true),
          });
        } catch { /* ignore */ }
      },
      onEffectError: (f: unknown) => {
        const ff = f as { event?: { type?: string }; error?: unknown };
        const s = `${ff.event?.type ?? "?"}: ${String(ff.error ?? JSON.stringify(f))}`;
        if (effectErrors.length < 50) effectErrors.push(s);
      },
    } as never);
    const c = ctrl;
    c.addSpectator({
      id: "qa",
      sendView: () => {
        const st = c.gameState;
        if (st === null) return;
        checkState(st, violations, seen);
        const ad = st.augmentData;
        // 쿨다운 기준 발동 국 번호
        const used = ad[`${card}:usedSeq:p0`];
        if (typeof used === "number" && used !== lastUsedSeq) {
          lastUsedSeq = used;
          fireSeqs.push(used);
        }
        const cd = ad[`view:p0:cooldown:${card}`];
        if (typeof cd === "number") viewCooldownMax = Math.max(viewCooldownMax ?? 0, cd);
        const cdt = ad[`view:p0:cooldownTurns:${card}`];
        if (typeof cdt === "number") viewCooldownTurnsMax = Math.max(viewCooldownTurnsMax ?? 0, cdt);
        // 잔량 채널
        const u = ad[`view:p0:uses:${card}`] as { left?: unknown; total?: unknown; scope?: unknown } | undefined;
        if (u !== undefined && u !== null && typeof u === "object") {
          uses.present = true;
          if (typeof u.total === "number") uses.totals.add(u.total);
          if (typeof u.scope === "string") uses.scopes.add(u.scope);
          if (typeof u.left === "number") {
            uses.minLeft = uses.minLeft === null ? u.left : Math.min(uses.minLeft, u.left);
            uses.maxLeft = uses.maxLeft === null ? u.left : Math.max(uses.maxLeft, u.left);
            if (u.left < 0) uses.negative = true;
            if (typeof u.total === "number" && u.left > u.total) uses.overTotal = true;
            // 같은 국 안에서 줄면 소모. 국이 바뀌며 줄어든 것은 match 스코프에서만 소모로 본다
            // (round 스코프는 국 경계에서 total 로 되돌아가므로 «줄었다»가 성립하지 않는다).
            if (
              lastLeft !== undefined && u.left < lastLeft &&
              (lastLeftRound === roundIdx || u.scope === "match")
            ) {
              uses.decrements += lastLeft - u.left;
              uses.decByRound[String(roundIdx)] = (uses.decByRound[String(roundIdx)] ?? 0) + (lastLeft - u.left);
            }
            lastLeft = u.left;
            lastLeftRound = roundIdx;
          }
        }
        if (augKeys.size < 40) {
          for (const k of Object.keys(ad)) if (idMatch.test(k)) augKeys.add(k.length > 60 ? `${k.slice(0, 60)}…` : k);
        }
      },
    } as never);
    await withTimeout(c.run(), o.timeoutMs ?? 150_000, () => {
      timeout = true;
      c.requestAbort();
    });
  } catch (e) {
    crash = e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 5).join("\n")}` : String(e);
  } finally {
    console.error = origErr;
  }
  if (timeout) violations.push({ kind: "SOFTLOCK_TIMEOUT", detail: crash ?? "timeout", round: rk });

  const ok = fires.filter((f) => f.rejected !== true);
  const perRound: Record<string, number> = {};
  const types: Record<string, number> = {};
  for (const f of ok) {
    perRound[String(f.round)] = (perRound[String(f.round)] ?? 0) + 1;
    types[f.type] = (types[f.type] ?? 0) + 1;
  }
  const intervals: number[] = [];
  for (let i = 1; i < fireSeqs.length; i++) intervals.push((fireSeqs[i] as number) - (fireSeqs[i - 1] as number));
  const mc = m.bySeat.get(`p0|${card}`);
  const st = ctrl?.gameState ?? null;
  const touched = augKeys.size > 0 || ok.length > 0 || (mc !== undefined && (mc.reactEmit > 0 || mc.interChange > 0));

  return {
    card, mode, seed, preset, personas, drafts: false, mutant: o.mutant ?? null,
    ms: Date.now() - t0,
    rounds: roundIdx,
    crash: timeout ? null : crash,
    timeout,
    effectErrors,
    violations: violations
      .filter((v) => v.kind !== "SCORE_DRIFT_ATTRIBUTED")
      .map((v) => `${v.kind}@${v.round}${v.seat !== undefined ? "/" + v.seat : ""}: ${v.detail.slice(0, 160)}`),
    fires: {
      count: ok.length,
      rejected: fires.length - ok.length,
      types,
      list: fires,
      perRound,
      maxPerRound: Math.max(0, ...Object.values(perRound)),
      whileRiichi: ok.filter((f) => f.riichi).length,
      notFirstTurn: ok.filter((f) => f.discardCount > 0 || f.melds > 0).length,
    },
    seq: { fireSeqs, intervals, viewCooldownMax, viewCooldownTurnsMax },
    uses: {
      present: uses.present,
      totals: [...uses.totals],
      scopes: [...uses.scopes],
      minLeft: uses.minLeft,
      maxLeft: uses.maxLeft,
      decrements: uses.decrements,
      decByRound: uses.decByRound,
      negative: uses.negative,
      overTotal: uses.overTotal,
    },
    settles,
    leaks: { public: [...leakPublic.values()], pill: [...leakPill.values()] },
    touched,
    augKeys: [...augKeys].slice(0, 20),
    metrics: mc === undefined ? null : {
      ruleSet: mc.ruleSet, reactCall: mc.reactCall, reactEmit: mc.reactEmit,
      interCall: mc.interCall, interChange: mc.interChange, optionOffer: mc.optionOffer,
    },
    actionTypes: [...(m.augActions.get(card) ?? [])],
    stderrLines,
    ...(st === null ? {} : {}),
  };
}

/** harness.ts 의 withTimeout 과 같다 — onTimeout 으로 requestAbort 를 넘겨야 버려진 판이 안 남는다 */
function withTimeout<T>(p: Promise<T>, ms: number, onTimeout?: () => void): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => {
      onTimeout?.();
      rej(new Error(`TIMEOUT ${ms}ms (soft-lock 의심)`));
    }, ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

/* ───────────── CLI ───────────── */

interface Args {
  shard: number;
  shards: number;
  seeds: number;
  cards: string[] | null;
  modes: Mode[];
  seedList: number[] | null;
  mutant: string | undefined;
  timeoutMs: number;
  tag: string | null;
  resume: boolean;
  p0: AgentKind;
  opp: AgentKind;
}

function agentKind(s: string | undefined, what: string): AgentKind {
  if (s === undefined || s === "masher") return "masher";
  if (s === "bot") return "bot";
  throw new Error(`bad --${what}=${s} (masher|bot)`);
}

function parseArgs(argv: string[]): Args {
  const pos = argv.filter((a) => !a.startsWith("--"));
  const opt = new Map<string, string>();
  for (const a of argv.filter((x) => x.startsWith("--"))) {
    const eq = a.indexOf("=");
    if (eq < 0) opt.set(a.slice(2), "true");
    else opt.set(a.slice(2, eq), a.slice(eq + 1));
  }
  const modes = (opt.get("modes") ?? "hanchan,tonpuu").split(",").filter((x) => x !== "") as Mode[];
  for (const md of modes) if (md !== "hanchan" && md !== "tonpuu") throw new Error(`bad mode ${md}`);
  return {
    shard: Number(pos[0] ?? 0),
    shards: Number(pos[1] ?? 1),
    seeds: Number(pos[2] ?? 5),
    cards: opt.has("cards") ? (opt.get("cards") as string).split(",").filter((x) => x !== "") : null,
    modes,
    seedList: opt.has("seed") ? (opt.get("seed") as string).split(",").map(Number) : null,
    mutant: opt.get("mutant"),
    timeoutMs: Number(opt.get("timeout") ?? 150_000),
    tag: opt.get("tag") ?? null,
    resume: opt.get("resume") === "true",
    p0: agentKind(opt.get("p0"), "p0"),
    opp: agentKind(opt.get("opp"), "opp"),
  };
}

const isMain = process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const a = parseArgs(process.argv.slice(2));
  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, `promise-${a.shard}of${a.shards}${a.tag === null ? "" : `-${a.tag}`}.jsonl`);
  const done = new Set<string>();
  if (a.resume && existsSync(outFile)) {
    for (const line of readFileSync(outFile, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      try { const r = JSON.parse(line) as Row; done.add(`${r.card}|${r.mode}|${r.seed}`); } catch { /* skip */ }
    }
  } else {
    writeFileSync(outFile, "");
  }
  const cards: readonly AugmentDef[] = a.cards === null
    ? allAugments
    : a.cards.map((id) => {
        const d = allAugments.find((x) => x.id === id);
        if (d === undefined) throw new Error(`unknown card ${id}`);
        return d;
      });
  const seedList = a.seedList ?? Array.from({ length: a.seeds }, (_, i) => 1000 + i);
  const jobs: RunOneOpts[] = [];
  for (const d of cards) for (const mode of a.modes) {
    if (!offerable(d, mode)) continue;
    for (const seed of seedList) {
      jobs.push({
        card: d.id, mode, seed, timeoutMs: a.timeoutMs, p0: a.p0, opp: a.opp,
        ...(a.mutant === undefined ? {} : { mutant: a.mutant }),
      });
    }
  }
  const mine = jobs.filter((_, i) => i % a.shards === a.shard);
  console.log(
    `promise/run shard ${a.shard}/${a.shards}: ${mine.length}/${jobs.length} games → ${outFile}` +
    ` (p0=${a.p0} opp=${a.opp}${a.mutant === undefined ? "" : ` mutant=${a.mutant}`})`,
  );
  let n = 0;
  const msAll: number[] = [];
  const tStart = Date.now();
  for (const job of mine) {
    if (done.has(`${job.card}|${job.mode}|${job.seed}`)) continue;
    let row: Row;
    try {
      row = await runOne(job);
    } catch (e) {
      // runOne 은 크래시를 삼키지만, 만든 자리에서 던지는 것(카탈로그 오류 등)은 여기로 온다
      row = {
        card: job.card, mode: job.mode, seed: job.seed,
        preset: { p0: [job.card], p1: [], p2: [], p3: [] }, personas: [a.p0, a.opp, a.opp, a.opp],
        drafts: false, mutant: job.mutant ?? null, ms: 0, rounds: 0, crash: `FATAL ${String(e)}`, timeout: false,
        effectErrors: [], violations: [],
        fires: { count: 0, rejected: 0, types: {}, list: [], perRound: {}, maxPerRound: 0, whileRiichi: 0, notFirstTurn: 0 },
        seq: { fireSeqs: [], intervals: [], viewCooldownMax: null, viewCooldownTurnsMax: null },
        uses: { present: false, totals: [], scopes: [], minLeft: null, maxLeft: null, decrements: 0, decByRound: {}, negative: false, overTotal: false },
        settles: [], leaks: { public: [], pill: [] }, touched: false, augKeys: [], metrics: null, actionTypes: [], stderrLines: 0,
      };
    }
    appendFileSync(outFile, `${JSON.stringify(row)}\n`);
    n++;
    msAll.push(row.ms);
    const flag = row.crash !== null ? " CRASH" : row.timeout ? " TIMEOUT" : row.effectErrors.length > 0 ? " EFFERR" : "";
    console.log(
      `[${n}/${mine.length}] ${row.card} ${row.mode} seed=${row.seed} ms=${row.ms} rounds=${row.rounds}` +
      ` fires=${row.fires.count}${row.fires.rejected > 0 ? `(-${row.fires.rejected})` : ""} seqs=[${row.seq.fireSeqs.join(",")}]` +
      ` uses=${row.uses.present ? `${row.uses.totals.join("/")}${row.uses.scopes.join("")}` : "-"}` +
      ` leaks=${row.leaks.public.length}+${row.leaks.pill.length}p viol=${row.violations.length}${flag}`,
    );
  }
  const avg = msAll.length === 0 ? 0 : Math.round(msAll.reduce((x, y) => x + y, 0) / msAll.length);
  console.log(`done: ${n} games, ${Math.round((Date.now() - tStart) / 1000)}s, avg ${avg} ms/game`);
}
