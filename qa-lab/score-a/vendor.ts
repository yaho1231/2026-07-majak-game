/**
 * qa-lab/harness.ts 의 고정 사본 (2026-08-19 스냅샷).
 * 공용 하네스는 다른 QA 에이전트가 동시에 고치고 있어 시그니처가 흔들린다 —
 * score-a 소크의 재현성을 위해 필요한 부분만 여기 박아 둔다.
 */
import { Prng, DEAD_WALL, WALL, handZone } from "@majak/core";
import type {
  ActionOption, AugmentDef, DecisionPrompt, GameState,
  PlayerAgent, PlayerId, PlayerView, DraftStage,
} from "@majak/core";

export const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
export const STD_ACTIONS = new Set([
  "discard", "riichi", "pon", "chi", "minkan", "ankan", "shouminkan",
  "pass", "kyushuKyuhai", "win",
]);

export interface Violation { kind: string; detail: string; round: string; seat?: PlayerId; }

export interface Persona {
  name: string; augmentBias: number; riichiBias: number; callBias: number;
  kanBias: number; alwaysWin: boolean;
  draftPrefer?: readonly string[]; draftAvoid?: readonly string[];
}

export const PERSONAS: Record<string, Persona> = {
  masher: { name: "증강광", augmentBias: 1, riichiBias: 0.3, callBias: 0.5, kanBias: 0.7, alwaysWin: true },
  riichiRusher: { name: "리치돌격", augmentBias: 0.4, riichiBias: 1, callBias: 0.1, kanBias: 0.3, alwaysWin: true },
  folder: { name: "베타오리", augmentBias: 0.1, riichiBias: 0, callBias: 0, kanBias: 0, alwaysWin: true },
  caller: { name: "울보", augmentBias: 0.4, riichiBias: 0.1, callBias: 1, kanBias: 1, alwaysWin: true },
  chaos: { name: "혼돈", augmentBias: 0.5, riichiBias: 0.5, callBias: 0.5, kanBias: 0.5, alwaysWin: true },
  stall: { name: "지연", augmentBias: 0.9, riichiBias: 0, callBias: 0.2, kanBias: 0.2, alwaysWin: false },
};

export class PersonaAgent implements PlayerAgent {
  readonly isBot = true;
  readonly nickname: string;
  private readonly rng: Prng;
  actionLog: string[] = [];
  constructor(readonly id: PlayerId, readonly persona: Persona, seed: number) {
    this.nickname = `${persona.name}-${id}`;
    this.rng = new Prng(seed);
  }
  sendView(_v: PlayerView): void {}
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const opts = prompt.options;
    const p = this.persona;
    const pick = (o: ActionOption): ActionOption => { this.actionLog.push(o.type); return o; };
    const find = (t: string): ActionOption | undefined => opts.find((o) => o.type === t);
    const win = find("win");
    if (win !== undefined && (p.alwaysWin || this.rng.int(4) > 0)) return pick(win);
    const augs = opts.filter((o) => !STD_ACTIONS.has(o.type));
    if (augs.length > 0 && this.rng.next() < p.augmentBias) return pick(augs[this.rng.int(augs.length)] as ActionOption);
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
    for (const want of this.persona.draftPrefer ?? []) {
      const hit = choices.find((c) => c.id === want);
      if (hit !== undefined) return hit.id;
    }
    const avoid = this.persona.draftAvoid ?? [];
    const ok = choices.filter((c) => !avoid.includes(c.id));
    const pool = ok.length > 0 ? ok : choices;
    return (pool[this.rng.int(pool.length)] as AugmentDef).id;
  }
}

/** 뱅크 발행 근거 원장 — 총합 드리프트에 설명이 붙는지 가른다 (공용 하네스 2026-08-19 갱신분과 같은 규약) */
export interface Ledger {
  scoreTotal?: number;
  notes: string[];
  reasons: string[];
}

export function checkState(st: GameState, out: Violation[], seen: Ledger): void {
  const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
  const add = (kind: string, detail: string, seat?: PlayerId): void => {
    if (out.length < 400) out.push(seat === undefined ? { kind, detail, round: rk } : { kind, detail, round: rk, seat });
  };
  const where = new Map<number, string>();
  for (const z of Object.values(st.zones)) {
    for (const id of z.tileIds) {
      const prev = where.get(id as unknown as number);
      if (prev !== undefined) add("TILE_DUP", `tile ${id} in ${prev} and ${z.id}`);
      else where.set(id as unknown as number, z.id);
    }
  }
  const dw = st.zones[DEAD_WALL]?.tileIds.length ?? 0;
  if (dw > 14) add("DEADWALL_BIG", `deadWall=${dw}`);
  if ((st.zones[WALL]?.tileIds.length ?? 0) < 0) add("WALL_NEG", "wall<0");
  const dealt = st.config.playerIds.some((s) => (st.zones[handZone(s)]?.tileIds.length ?? 0) > 0);
  if (dealt) {
    for (const seat of st.config.playerIds) {
      const hand = st.zones[handZone(seat)]?.tileIds.length ?? 0;
      const melds = st.round.byPlayer[seat]?.meldCount ?? st.round.byPlayer[seat]?.melds?.length ?? 0;
      const eff = hand + melds * 3;
      if (eff > 20 || eff < 4) add("HAND_SIZE", `hand=${hand} melds=${melds} eff=${eff}`, seat);
    }
  }
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
    const why = [...seen.notes, ...seen.reasons].join(", ");
    add(
      why === "" ? "SCORE_DRIFT_UNEXPLAINED" : "SCORE_DRIFT_ATTRIBUTED",
      `${seen.scoreTotal} -> ${total} (delta ${total - seen.scoreTotal})${why === "" ? "" : ` — ${why}`}`,
    );
  }
  seen.notes = [];
  seen.reasons = [];
  if ((st.round.riichiPot ?? 0) < 0) add("RIICHI_POT_NEG", `pot=${st.round.riichiPot}`);
  if ((st.round.honba ?? 0) < 0) add("HONBA_NEG", `honba=${st.round.honba}`);
  seen.scoreTotal = total;
}
