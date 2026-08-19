/**
 * QA 플레이테스트 하네스 (2026-08-19, 임시 — 커밋하지 않는다)
 *
 * 목적: 사람 페르소나를 흉내낸 에이전트로 실제 반장전/동풍전을 완주시키고,
 * 매 뷰 브로드캐스트마다 상태 불변식을 검사해 증강의 결함을 찾는다.
 *
 *  - 크래시(엔진 throw)
 *  - 훅 예외(onEffectError — 이제 격리돼 조용히 삼켜지므로 여기서만 보인다)
 *  - 상태 불변식 위반(패 중복/유실, 왕패 크기, 점수 총합, 손패 장수, 리치 손 고정 …)
 *  - 소프트락(빈 선택지, 같은 프롬프트 반복, 국이 안 끝남)
 */
import {
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
  Prng,
  DEAD_WALL,
  WALL,
  handZone,
  discardsZone,
  meldsZone,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  DecisionPrompt,
  GameState,
  PlayerAgent,
  PlayerId,
  PlayerView,
  DraftStage,
} from "@majak/core";
import { contentAugments } from "@majak/content";

export const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
export const byId = new Map(contentAugments.map((d) => [d.id, d]));

export const STD_ACTIONS = new Set([
  "discard", "riichi", "pon", "chi", "minkan", "ankan", "shouminkan",
  "pass", "kyushuKyuhai", "win",
]);

export interface Violation {
  kind: string;
  detail: string;
  round: string;
  seat?: PlayerId;
}

export interface MatchReport {
  seed: number;
  mode: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  crash?: string;
  effectErrors: string[];
  violations: Violation[];
  actionsTaken: Record<string, number>;
  rounds: number;
  finalScores: Record<PlayerId, number>;
  rankings?: unknown;
}

/** 페르소나 — 프롬프트에서 무엇을 고를지의 성향 */
export interface Persona {
  name: string;
  /** 증강 액션을 누를 확률 0~1 */
  augmentBias: number;
  /** 리치 선호 0~1 */
  riichiBias: number;
  /** 울기 선호 0~1 */
  callBias: number;
  /** 깡 선호 0~1 */
  kanBias: number;
  /** 화료를 항상 누른다 (false면 견제/보류를 시도) */
  alwaysWin: boolean;
  /** 드래프트에서 선호하는 증강 id (앞쪽 우선) */
  draftPrefer?: readonly string[];
  /** 드래프트에서 태그 우선 (id 부분 문자열) */
  draftAvoid?: readonly string[];
}

export const PERSONAS: Record<string, Persona> = {
  /** 증강을 무조건 눌러 보는 사람 — 발동 경로를 최대한 밟는다 */
  masher: { name: "증강광", augmentBias: 1, riichiBias: 0.3, callBias: 0.5, kanBias: 0.7, alwaysWin: true },
  /** 리치 일변도 */
  riichiRusher: { name: "리치돌격", augmentBias: 0.4, riichiBias: 1, callBias: 0.1, kanBias: 0.3, alwaysWin: true },
  /** 접기만 하는 수비형 — 패스/쯔모기리 */
  folder: { name: "베타오리", augmentBias: 0.1, riichiBias: 0, callBias: 0, kanBias: 0, alwaysWin: true },
  /** 울기 중독 */
  caller: { name: "울보", augmentBias: 0.4, riichiBias: 0.1, callBias: 1, kanBias: 1, alwaysWin: true },
  /** 완전 무작위 */
  chaos: { name: "혼돈", augmentBias: 0.5, riichiBias: 0.5, callBias: 0.5, kanBias: 0.5, alwaysWin: true },
  /** 화료를 미루는 사람 — 견제·정보 증강을 계속 쓰며 판을 늘린다 */
  stall: { name: "지연", augmentBias: 0.9, riichiBias: 0, callBias: 0.2, kanBias: 0.2, alwaysWin: false },
};

export class PersonaAgent implements PlayerAgent {
  readonly isBot = true;
  readonly nickname: string;
  private readonly rng: Prng;
  lastPrompts: string[] = [];
  actionLog: string[] = [];
  constructor(
    readonly id: PlayerId,
    readonly persona: Persona,
    seed: number,
  ) {
    this.nickname = `${persona.name}-${id}`;
    this.rng = new Prng(seed);
  }
  sendView(_v: PlayerView): void {}
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const opts = prompt.options;
    const p = this.persona;
    const pick = (o: ActionOption): ActionOption => {
      this.actionLog.push(o.type);
      return o;
    };
    const find = (t: string): ActionOption | undefined => opts.find((o) => o.type === t);
    const win = find("win");
    if (win !== undefined && (p.alwaysWin || this.rng.int(4) > 0)) return pick(win);
    const augs = opts.filter((o) => !STD_ACTIONS.has(o.type));
    if (augs.length > 0 && this.rng.next() < p.augmentBias) {
      return pick(augs[this.rng.int(augs.length)] as ActionOption);
    }
    const riichi = find("riichi");
    if (riichi !== undefined && this.rng.next() < p.riichiBias) return pick(riichi);
    for (const t of ["ankan", "shouminkan", "minkan"]) {
      const k = find(t);
      if (k !== undefined && this.rng.next() < p.kanBias) return pick(k);
    }
    for (const t of ["pon", "chi"]) {
      const c = find(t);
      if (c !== undefined && this.rng.next() < p.callBias) return pick(c);
    }
    const pass = find("pass");
    if (pass !== undefined) return pick(pass);
    const disc = opts.filter((o) => o.type === "discard" || o.type === "free_discard");
    if (disc.length > 0) return pick(disc[this.rng.int(disc.length)] as ActionOption);
    if (opts.length === 0) throw new Error("EMPTY_OPTIONS");
    return pick(opts[this.rng.int(opts.length)] as ActionOption);
  }
  async decideDraft(_s: DraftStage, choices: AugmentDef[]): Promise<string> {
    const pref = this.persona.draftPrefer ?? [];
    for (const want of pref) {
      const hit = choices.find((c) => c.id === want);
      if (hit !== undefined) return hit.id;
    }
    const avoid = this.persona.draftAvoid ?? [];
    const ok = choices.filter((c) => !avoid.includes(c.id));
    const pool = ok.length > 0 ? ok : choices;
    return (pool[this.rng.int(pool.length)] as AugmentDef).id;
  }
}

/** 상태 불변식 — 매 뷰 브로드캐스트마다 호출 */
export function checkState(
  st: GameState,
  out: Violation[],
  seen: { scoreTotal?: number },
): void {
  const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
  const add = (kind: string, detail: string, seat?: PlayerId): void => {
    if (out.length < 400) out.push(seat === undefined ? { kind, detail, round: rk } : { kind, detail, round: rk, seat });
  };
  // 1) 패 중복 — 한 tileId가 두 존에 있으면 물리 법칙 위반
  const where = new Map<number, string>();
  for (const z of Object.values(st.zones)) {
    for (const id of z.tileIds) {
      const prev = where.get(id as unknown as number);
      if (prev !== undefined) add("TILE_DUP", `tile ${id} in ${prev} and ${z.id}`);
      else where.set(id as unknown as number, z.id);
    }
  }
  // 2) 왕패 크기 (깡으로 줄어들 수 있으니 상한만 본다)
  const dw = st.zones[DEAD_WALL]?.tileIds.length ?? 0;
  if (dw > 14) add("DEADWALL_BIG", `deadWall=${dw}`);
  const wall = st.zones[WALL]?.tileIds.length ?? 0;
  if (wall < 0) add("WALL_NEG", `wall=${wall}`);
  // 3) 손패 장수 — 배패 전(전원 0장)은 건너뛴다
  const dealt = st.config.playerIds.some((s) => (st.zones[handZone(s)]?.tileIds.length ?? 0) > 0);
  if (dealt) {
    for (const seat of st.config.playerIds) {
      const hand = st.zones[handZone(seat)]?.tileIds.length ?? 0;
      const melds = st.round.byPlayer[seat]?.meldCount ?? st.round.byPlayer[seat]?.melds?.length ?? 0;
      const eff = hand + melds * 3;
      if (eff > 20 || eff < 4) add("HAND_SIZE", `hand=${hand} melds=${melds} eff=${eff}`, seat);
    }
  }
  // 4) 점수 — NaN·비정수·엄청난 값
  let total = 0;
  for (const p of st.players) {
    const s = p.score;
    if (typeof s !== "number" || !Number.isFinite(s)) { add("SCORE_NAN", `score=${String(s)}`, p.id); continue; }
    if (!Number.isInteger(s)) add("SCORE_FRACTION", `score=${s}`, p.id);
    if (Math.abs(s) > 1_000_000) add("SCORE_ABSURD", `score=${s}`, p.id);
    total += s;
  }
  total += st.round.riichiPot ?? 0;
  if (seen.scoreTotal !== undefined && total !== seen.scoreTotal) {
    add("SCORE_TOTAL_DRIFT", `${seen.scoreTotal} -> ${total} (delta ${total - seen.scoreTotal})`);
  }
  if ((st.round.riichiPot ?? 0) < 0) add("RIICHI_POT_NEG", `pot=${st.round.riichiPot}`);
  if ((st.round.honba ?? 0) < 0) add("HONBA_NEG", `honba=${st.round.honba}`);
  seen.scoreTotal = total;
}

export interface RunOpts {
  seed: number;
  mode?: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  personas: Record<PlayerId, Persona>;
  presetHands?: Record<PlayerId, readonly string[]>;
  /** 라운드마다 상태를 직접 들여다보는 훅 */
  onRound?: (st: GameState, phase: "start" | "end") => void;
  /** 뷰 브로드캐스트마다 부르는 커스텀 검사 */
  onState?: (st: GameState, out: Violation[]) => void;
  onGameStart?: (g: unknown) => void;
  noDraft?: boolean;
  timeoutMs?: number;
}

export async function runMatch(o: RunOpts): Promise<MatchReport> {
  const mode = o.mode ?? "hanchan";
  const violations: Violation[] = [];
  const effectErrors: string[] = [];
  const agents = SEATS.map((id, i) => new PersonaAgent(id, o.personas[id]!, o.seed * 131 + i * 7 + 1));
  const seen: { scoreTotal?: number } = {};
  let rounds = 0;
  const report: MatchReport = {
    seed: o.seed, mode, preset: o.preset, effectErrors, violations,
    actionsTaken: {}, rounds: 0, finalScores: {} as Record<PlayerId, number>,
  };
  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode,
    seed: o.seed,
    maxWind: mode === "tonpuu" ? 1 : 2,
    westEntry: false,
    draftSchedules: o.noDraft === true ? [] : mode === "tonpuu" ? ["gameStart", "eastThird", "eastFourth"] : ["gameStart", "eastThird", "southEntry", "southThird"],
    extraAugments: contentAugments,
    presetAugments: o.preset,
    ...(o.presetHands !== undefined ? { presetHands: o.presetHands } : {}),
    agentDecideTimeoutMs: 20_000,
  }, {
    onRoundStart: (g) => { rounds++; o.onGameStart?.(g); o.onRound?.(g.engine.state, "start"); },
    onRoundEnd: (g) => { o.onRound?.(g.engine.state, "end"); },
    onEffectError: (f) => {
      const s = `${(f as { event?: { type?: string } }).event?.type ?? "?"}: ${String((f as { error?: unknown }).error ?? JSON.stringify(f))}`;
      if (effectErrors.length < 100) effectErrors.push(s);
    },
  } as never);
  ctrl.addSpectator({
    id: "qa",
    sendView: () => {
      const st = ctrl.gameState;
      if (st === null) return;
      checkState(st, violations, seen);
      o.onState?.(st, violations);
    },
  });
  try {
    const ranks = await withTimeout(ctrl.run(), o.timeoutMs ?? 120_000);
    report.rankings = ranks;
  } catch (e) {
    report.crash = e instanceof Error ? `${e.message}\n${(e.stack ?? "").split("\n").slice(1, 6).join("\n")}` : String(e);
  }
  const st = ctrl.gameState;
  if (st !== null) for (const p of st.players) report.finalScores[p.id] = p.score;
  report.rounds = rounds;
  for (const a of agents) for (const t of a.actionLog) report.actionsTaken[t] = (report.actionsTaken[t] ?? 0) + 1;
  return report;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms (soft-lock 의심)`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

/** conflicts를 피해 좌석별 증강 배정 */
export function conflicting(a: string, b: string): boolean {
  return (byId.get(a)?.conflicts ?? []).includes(b) || (byId.get(b)?.conflicts ?? []).includes(a);
}
export function offerable(d: AugmentDef, mode: "hanchan" | "tonpuu"): boolean {
  return d.modes === undefined || d.modes.includes(mode);
}
export function assignPreset(
  rng: Prng, mode: "hanchan" | "tonpuu", forced: readonly string[], per = 2,
): Record<PlayerId, string[]> {
  const pool = contentAugments.filter((d) => offerable(d, mode)).map((d) => d.id).filter((id) => !forced.includes(id));
  const out: Record<PlayerId, string[]> = { p0: [...forced], p1: [], p2: [], p3: [] };
  const taken = new Set(forced);
  for (const seat of SEATS) {
    const held = out[seat] as string[];
    let guard = 0;
    while (held.length < per && pool.length > 0 && guard++ < 200) {
      const id = pool.splice(rng.int(pool.length), 1)[0] as string;
      if (taken.has(id)) continue;
      if (held.some((h) => conflicting(h, id))) continue;
      held.push(id); taken.add(id);
    }
  }
  return out;
}
