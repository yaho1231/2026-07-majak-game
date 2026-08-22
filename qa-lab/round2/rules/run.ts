/**
 * run.ts — 증강 **없이** 반장전을 대량으로 완주시키고, 매 화료마다 독립 채점기(ref.ts)로
 * 재계산해 엔진 결과와 대조한다. 유국·벌부·본장·공탁·패 보존도 함께 본다.
 *
 * 사용: tsx qa-lab/round2/rules/run.ts [게임수] [시작시드]
 */
import {
  DEFAULT_HANCHAN_CONFIG,
  HanchanController,
  Prng,
  WALL,
  DEAD_WALL,
  handZone,
  meldsZone,
  discardsZone,
  uraIndicatorIds,
  doraKindFor,
} from "@majak/core";
import type {
  ActionOption,
  DecisionPrompt,
  GameState,
  PlayerAgent,
  PlayerId,
  PlayerView,
  RoundSettledPayload,
  TileKind,
  WinInfo,
  Meld,
} from "@majak/core";
import { BotAgent } from "../../../packages/server/src/BotAgent.js";
import { refEvaluate } from "./ref.js";
import type { K, RefCtx, RefMeld } from "./ref.js";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];

export const toK = (t: TileKind): K => ({
  s: t.suit === "man" ? "m" : t.suit === "pin" ? "p" : t.suit === "sou" ? "s" : "z",
  r: t.suit === "wind" ? t.rank : t.suit === "dragon" ? t.rank + 4 : t.rank,
});

class Bot implements PlayerAgent {
  readonly isBot = true;
  readonly nickname: string;
  private rng: Prng;
  constructor(readonly id: PlayerId, seed: number, private readonly style: number) {
    this.nickname = id;
    this.rng = new Prng(seed);
  }
  sendView(_v: PlayerView): void {}
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const opts = prompt.options;
    const find = (t: string): ActionOption | undefined => opts.find((o) => o.type === t);
    const win = find("win");
    if (win !== undefined) return win;
    const r = this.rng.next();
    if (this.style !== 0) {
      const riichi = opts.filter((o) => o.type === "riichi");
      if (riichi.length > 0 && r < 0.85) return riichi[this.rng.int(riichi.length)] as ActionOption;
      for (const t of ["ankan", "shouminkan", "minkan"]) {
        const k = find(t);
        if (k !== undefined && this.rng.next() < (this.style === 2 ? 0.9 : 0.3)) return k;
      }
      for (const t of ["pon", "chi"]) {
        const c = opts.filter((o) => o.type === t);
        if (c.length > 0 && this.rng.next() < (this.style === 2 ? 0.8 : 0.2)) {
          return c[this.rng.int(c.length)] as ActionOption;
        }
      }
    }
    const pass = find("pass");
    if (pass !== undefined) return pass;
    const disc = opts.filter((o) => o.type === "discard");
    if (disc.length > 0) return disc[this.rng.int(disc.length)] as ActionOption;
    if (opts.length === 0) throw new Error("EMPTY_OPTIONS");
    return opts[this.rng.int(opts.length)] as ActionOption;
  }
  async decideDraft(): Promise<string> { return ""; }
}

export interface Issue { kind: string; detail: string }

interface Snap {
  dealerSeat: number;
  prevalentWind: number;
  roundNumber: number;
  honba: number;
  riichiPot: number;
  scores: Record<string, number>;
}

const meldKindMap: Record<Meld["kind"], RefMeld["kind"] | null> = {
  chi: "chi", pon: "pon", kan_open: "kan_open", kan_added: "kan_added",
  kan_closed: "kan_closed", kokushi_pon: null,
};

export async function runOne(seed: number, style: number, issues: Issue[], stats: Record<string, number>): Promise<void> {
  const agents = SEATS.map((id, i) => new BotAgent(id, `Bot_${id}`, seed * 977 + i * 13 + 1 + style * 7, []));
  let snap: Snap | null = null;
  let settled: RoundSettledPayload | null = null;
  const add = (kind: string, detail: string): void => {
    stats[kind] = (stats[kind] ?? 0) + 1;
    if (issues.length < 300) issues.push({ kind, detail: `seed=${seed} ${detail}` });
  };

  const ctrl = new HanchanController(agents, {
    ...DEFAULT_HANCHAN_CONFIG,
    mode: "hanchan",
    seed,
    maxWind: 2,
    westEntry: false,
    draftSchedules: [],
    extraAugments: [],
    agentDecideTimeoutMs: 20_000,
  }, {
    onRoundStart: (g: { engine: { state: GameState } }) => {
      const st = g.engine.state;
      snap = {
        dealerSeat: st.round.dealerSeat,
        prevalentWind: st.round.prevalentWind,
        roundNumber: st.round.roundNumber,
        honba: st.round.honba,
        riichiPot: st.round.riichiPot,
        scores: Object.fromEntries(st.players.map((p) => [p.id, p.score])),
      };
      settled = null;
    },
    onRoundEnd: (g: { engine: { state: GameState; eventLog: { type: string; payload: unknown }[] } }) => {
      const st = g.engine.state;
      for (let i = g.engine.eventLog.length - 1; i >= 0; i--) {
        if (g.engine.eventLog[i]?.type === "RoundSettled") {
          settled = g.engine.eventLog[i]!.payload as RoundSettledPayload;
          break;
        }
      }
      checkTiles(st, add, "end");
      stats["rounds"] = (stats["rounds"] ?? 0) + 1;
      if (settled !== null) stats[`outcome_${settled.outcome}`] = (stats[`outcome_${settled.outcome}`] ?? 0) + 1;
      if (snap === null || settled === null) { stats["NO_SNAP"] = (stats["NO_SNAP"] ?? 0) + 1; return; }
      verifyRound(st, snap, settled, add, stats);
    },
  } as never);

  try {
    await withTimeout(ctrl.run(), 180_000);
  } catch (e) {
    add("CRASH", e instanceof Error ? `${e.message}` : String(e));
  }
}

function checkTiles(st: GameState, add: (k: string, d: string) => void, phase: string): void {
  const seen = new Map<number, string>();
  for (const z of Object.values(st.zones)) {
    for (const id of z.tileIds) {
      const prev = seen.get(id as unknown as number);
      if (prev !== undefined) add("TILE_DUP", `${phase} tile ${id} in ${prev} & ${z.id}`);
      else seen.set(id as unknown as number, z.id);
    }
  }
  const total = Object.keys(st.tiles).length;
  if (seen.size !== total) add("TILE_LOST", `${phase} zones=${seen.size} tiles=${total}`);
  if (phase === "start") {
    const dw = st.zones[DEAD_WALL]?.tileIds.length ?? 0;
    if (dw !== 14) add("DEADWALL_SIZE", `start deadWall=${dw}`);
    const ind = st.round.doraIndicators.length;
    if (ind !== 1) add("DORA_COUNT_START", `indicators=${ind}`);
  }
  const ind = st.round.doraIndicators.length;
  const expected = 1 + st.round.kanCount;
  if (phase === "end" && ind !== expected && st.round.pendingDora === 0) {
    add("DORA_COUNT", `indicators=${ind} kanCount=${st.round.kanCount} pending=${st.round.pendingDora}`);
  }
}

function seatWindOf(seat: number, dealerSeat: number, n: number): number {
  return (((seat - dealerSeat) % n) + n) % n + 1;
}

function verifyRound(
  st: GameState,
  snapIn: Snap,
  s: RoundSettledPayload,
  add: (k: string, d: string) => void,
  stats: Record<string, number>,
): void {
  let snap = snapIn;
  const rk = `${snap.prevalentWind}-${snap.roundNumber}-${snap.honba}`;
  // 이 국에 실제로 쌓인 공탁 (국 시작 시점 + 이번 국 리치 비용)
  const potBefore = snap.riichiPot + st.players.reduce((a, p) => {
    const r = st.round.byPlayer[p.id]?.riichi;
    return a + (r != null ? (r.cost ?? 1000) : 0);
  }, 0);
  snap = { ...snap, riichiPot: potBefore };
  // 1) 총합 보존
  const after = st.players.reduce((a, p) => a + p.score, 0) + st.round.riichiPot;
  const before = Object.values(snapIn.scores).reduce((a, b) => a + b, 0) + snapIn.riichiPot;
  const riichiPaid = st.players.reduce((a, p) => a, 0);
  if (after !== before) {
    add("SCORE_TOTAL_DRIFT", `${rk} before=${before} after=${after} (${after - before})`);
  }
  void riichiPaid;

  if (s.outcome === "win") verifyWin(st, snap, s, add, stats, rk);
  else if (s.outcome === "draw") verifyDraw(st, snap, s, add, rk);
  else {
    for (const [id, d] of Object.entries(s.deltas)) {
      if (d !== 0) add("ABORT_DELTA", `${rk} ${id}=${d}`);
    }
    if (s.honba !== snap.honba + 1) add("ABORT_HONBA", `${rk} -> ${s.honba}`);
    if (s.riichiPot !== snap.riichiPot) add("ABORT_POT", `${rk} ${snap.riichiPot} -> ${s.riichiPot}`);
  }
}

function verifyDraw(
  st: GameState, snap: Snap, s: RoundSettledPayload,
  add: (k: string, d: string) => void, rk: string,
): void {
  const sum = Object.values(s.deltas).reduce((a, b) => a + b, 0);
  if (sum !== 0) add("DRAW_DELTA_SUM", `${rk} sum=${sum}`);
  if (s.honba !== snap.honba + 1) add("DRAW_HONBA", `${rk} ${snap.honba} -> ${s.honba}`);
  if (s.riichiPot !== snap.riichiPot) add("DRAW_POT", `${rk} ${snap.riichiPot} -> ${s.riichiPot}`);
  const tenpai = s.tenpaiPlayers ?? [];
  const noten = st.players.map((p) => p.id).filter((id) => !tenpai.includes(id));
  const drawSpecial = s.drawSpecial !== undefined;
  if (!drawSpecial) {
    for (const p of st.players) {
      const isT = tenpai.includes(p.id);
      const exp = tenpai.length === 0 || noten.length === 0 ? 0
        : isT ? 3000 / tenpai.length : -3000 / noten.length;
      if ((s.deltas[p.id] ?? 0) !== exp) {
        add("NOTEN_PENALTY", `${rk} ${p.id} tenpai=${isT} got=${s.deltas[p.id]} want=${exp} (t=${tenpai.length})`);
      }
    }
  }
  // 오야 연장 판정
  const dealerId = st.players.find((p) => p.seat === snap.dealerSeat)?.id;
  const dealerTenpai = dealerId !== undefined && tenpai.includes(dealerId);
  if ((s.dealerContinues === true) !== dealerTenpai) {
    add("DRAW_RENCHAN", `${rk} dealerTenpai=${dealerTenpai} continues=${s.dealerContinues}`);
  }
}

function verifyWin(
  st: GameState, snap: Snap, s: RoundSettledPayload,
  add: (k: string, d: string) => void, stats: Record<string, number>, rk: string,
): void {
  const infos = s.winInfos ?? [];
  const n = st.players.length;
  const expDeltas: Record<string, number> = {};
  for (const p of st.players) expDeltas[p.id] = 0;

  infos.forEach((w: WinInfo, i: number) => {
    const winner = st.players.find((p) => p.id === w.winner)!;
    const isDealer = winner.seat === snap.dealerSeat;
    const ctx = buildRefCtx(st, snap, w, isDealer);
    if (ctx === null) return;
    stats["wins"] = (stats["wins"] ?? 0) + 1;
    const engineMode = refEvaluate(ctx, "engine");
    const pointsMode = refEvaluate(ctx, "points");
    if (engineMode === null) {
      add("REF_NO_SHAPE", `${rk} ${w.winner} 손이 화료형으로 안 읽힘 hand=${ctx.hand.map((k) => `${k.s}${k.r}`).join(" ")} melds=${ctx.melds.length}`);
      return;
    }
    // 역만 수
    if (engineMode.yakumanCount !== w.yakumanCount) {
      add("YAKUMAN_MISMATCH", `${rk} ${w.winner} engine=${w.yakumanCount} ref=${engineMode.yakumanCount} yaku=${w.yaku.map((y) => y.id).join(",")} refYaku=${engineMode.yaku.map((y) => y.id).join(",")} ${handStr(ctx)}`);
      return;
    }
    if (w.yakumanCount === 0) {
      if (engineMode.han !== w.han) {
        add("HAN_MISMATCH", `${rk} ${w.winner} engine=${w.han}han(${w.yaku.map((y) => `${y.id}:${y.han}`).join(",")}|dora${w.doraHan}+ura${w.uraHan}+red${w.redHan}) ref=${engineMode.han}han(${engineMode.yaku.map((y) => `${y.id}:${y.han}`).join(",")}|dora${engineMode.dora}+ura${engineMode.ura}+red${engineMode.red}) ${handStr(ctx)}`);
      } else if (engineMode.fu !== w.fu) {
        add("FU_MISMATCH", `${rk} ${w.winner} engine=${w.fu}fu ref=${engineMode.fu}fu wait=${engineMode.wait} yaku=${w.yaku.map((y) => y.id).join(",")} ${handStr(ctx)}`);
      }
      const idsEngine = new Set(w.yaku.map((y) => y.id));
      const idsRef = new Set(engineMode.yaku.map((y) => y.id));
      const onlyE = [...idsEngine].filter((x) => !idsRef.has(x));
      const onlyR = [...idsRef].filter((x) => !idsEngine.has(x));
      if ((onlyE.length > 0 || onlyR.length > 0) && engineMode.han === w.han) {
        add("YAKU_SET_DIFF", `${rk} ${w.winner} engineOnly=[${onlyE.join(",")}] refOnly=[${onlyR.join(",")}] ${handStr(ctx)}`);
      }
    }
    // 점수
    if (pointsMode !== null && engineMode.points !== pointsMode.points) {
      add("VARIANT_NOT_MAXIMAL", `${rk} ${w.winner} engineRule=${engineMode.points}(${engineMode.han}h${engineMode.fu}f) best=${pointsMode.points}(${pointsMode.han}h${pointsMode.fu}f) ${handStr(ctx)}`);
    }
    if (engineMode.points !== w.points && engineMode.han === w.han && engineMode.fu === w.fu && engineMode.yakumanCount === w.yakumanCount) {
      add("POINTS_MISMATCH", `${rk} ${w.winner} engine=${w.points} ref=${engineMode.points} ${w.han}han ${w.fu}fu dealer=${isDealer} ${w.winType}`);
    }

    // 지불 분배 재계산
    const honbaBonus = i === 0 ? snap.honba * 300 : 0;
    if (w.winType === "ron") {
      const total = w.points + honbaBonus;
      expDeltas[w.winner] = (expDeltas[w.winner] ?? 0) + total;
      if (w.from !== null) expDeltas[w.from] = (expDeltas[w.from] ?? 0) - total;
    } else {
      const each = Math.round((snap.honba * 300) / 3);
      for (const p of st.players) {
        if (p.id === w.winner) continue;
        const pay = (isDealer ? w.payments?.others : p.seat === snap.dealerSeat ? w.payments?.dealer : w.payments?.others) ?? 0;
        expDeltas[p.id] = (expDeltas[p.id] ?? 0) - pay - each;
        expDeltas[w.winner] = (expDeltas[w.winner] ?? 0) + pay + each;
      }
    }
  });
  // 공탁
  const firstWinner = infos[0]?.winner;
  const f0 = infos[0];
  let refund = 0;
  if (f0 !== undefined && f0.winType === "ron" && f0.from !== null) {
    const fr = st.round.byPlayer[f0.from]?.riichi;
    if (fr != null && fr.ippatsu) refund = Math.min(fr.cost ?? 1000, snap.riichiPot);
  }
  if (refund > 0) expDeltas[f0!.from as string] = (expDeltas[f0!.from as string] ?? 0) + refund;
  if (firstWinner !== undefined) expDeltas[firstWinner] = (expDeltas[firstWinner] ?? 0) + snap.riichiPot - refund;
  for (const p of st.players) {
    if ((s.deltas[p.id] ?? 0) !== (expDeltas[p.id] ?? 0)) {
      add("DELTA_MISMATCH", `${rk} ${p.id} engine=${s.deltas[p.id]} ref=${expDeltas[p.id]} infos=${infos.map((w) => `${w.winner}:${w.winType}:${w.points}:${JSON.stringify(w.payments)}`).join(" ")} honba=${snap.honba} pot=${snap.riichiPot}`);
    }
  }
  if (s.riichiPot !== 0) add("WIN_POT", `${rk} pot after win = ${s.riichiPot}`);
  const dealerId = st.players.find((p) => p.seat === snap.dealerSeat)?.id;
  const dealerWon = infos.some((w) => w.winner === dealerId);
  if ((s.dealerContinues === true) !== dealerWon) {
    add("WIN_RENCHAN", `${rk} dealerWon=${dealerWon} continues=${s.dealerContinues}`);
  }
  const expHonba = dealerWon ? snap.honba + 1 : 0;
  if (s.honba !== expHonba) add("WIN_HONBA", `${rk} honba ${snap.honba} -> ${s.honba} want=${expHonba}`);
  void n;
}

function handStr(ctx: RefCtx): string {
  return `hand=[${ctx.hand.map((k) => `${k.s}${k.r}`).join(" ")}] melds=[${ctx.melds.map((m) => `${m.kind}:${m.tiles.map((k) => `${k.s}${k.r}`).join("")}`).join(" ")}] win=${ctx.winTile.s}${ctx.winTile.r} ${ctx.winType} seat=${ctx.seatWind} round=${ctx.roundWind} riichi=${JSON.stringify(ctx.riichi)} flags=${JSON.stringify(ctx.flags)} dora=[${ctx.dora.map((k) => `${k.s}${k.r}`).join(" ")}] ura=[${ctx.ura.map((k) => `${k.s}${k.r}`).join(" ")}] red=${ctx.red}`;
}

export function buildRefCtx(st: GameState, snap: Snap, w: WinInfo, isDealer: boolean): RefCtx | null {
  const kindOf = (id: number): TileKind => st.tiles[id]!.kind;
  const handIds = (st.zones[handZone(w.winner)]?.tileIds ?? []).filter((id) => id !== w.winningTileId);
  const winKind = kindOf(w.winningTileId as unknown as number);
  const hand = [...handIds.map((id) => toK(kindOf(id as unknown as number))), toK(winKind)];
  const melds: RefMeld[] = [];
  for (const m of st.round.byPlayer[w.winner]?.melds ?? []) {
    const kk = meldKindMap[m.kind];
    if (kk === null) return null;
    melds.push({ kind: kk, tiles: m.tileIds.map((id) => toK(kindOf(id as unknown as number))) });
  }
  const rs = st.round.byPlayer[w.winner];
  const yakuIds = new Set(w.yaku.map((y) => y.id));
  const allIds = [...handIds, w.winningTileId, ...(rs?.melds ?? []).flatMap((m) => m.tileIds)];
  const red = allIds.filter((id) => st.tiles[id as unknown as number]?.attrs.red === true).length;
  const n = st.players.length;
  const seat = st.players.find((p) => p.id === w.winner)!.seat;
  return {
    hand,
    melds,
    winTile: toK(winKind),
    winType: w.winType,
    seatWind: seatWindOf(seat, snap.dealerSeat, n),
    roundWind: snap.prevalentWind,
    riichi: rs?.riichi != null ? { double: rs.riichi.double, ippatsu: rs.riichi.ippatsu } : null,
    flags: {
      haitei: yakuIds.has("haitei"), houtei: yakuIds.has("houtei"),
      rinshan: yakuIds.has("rinshan"), chankan: yakuIds.has("chankan"),
      tenhou: yakuIds.has("tenhou"), chihou: yakuIds.has("chihou"),
    },
    dora: st.round.doraIndicators.map((id) => toK(doraKindFor(kindOf(id as unknown as number)))),
    ura: uraIndicatorIds(st).map((id) => toK(doraKindFor(kindOf(id as unknown as number)))),
    red,
    isDealer,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((res, rej) => {
    const t = setTimeout(() => rej(new Error(`TIMEOUT ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

async function main(): Promise<void> {
  const games = Number(process.argv[2] ?? 40);
  const start = Number(process.argv[3] ?? 1);
  const issues: Issue[] = [];
  const stats: Record<string, number> = {};
  for (let i = 0; i < games; i++) {
    await runOne(start + i, i % 3, issues, stats);
    if ((i + 1) % 10 === 0) process.stdout.write(`.${i + 1}`);
  }
  console.log("\n=== stats ===");
  console.log(JSON.stringify(stats, null, 1));
  console.log("=== issues (앞 40) ===");
  const byKind = new Map<string, Issue[]>();
  for (const it of issues) {
    const arr = byKind.get(it.kind) ?? [];
    arr.push(it); byKind.set(it.kind, arr);
  }
  for (const [k, arr] of byKind) {
    console.log(`\n--- ${k} (${arr.length}) ---`);
    for (const it of arr.slice(0, 4)) console.log(`  ${it.detail}`);
  }
}

if (process.argv[1]?.endsWith("run.ts") === true) void main();
