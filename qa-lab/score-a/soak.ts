/**
 * score-a 소크 — scoring 11종을 강제 지급하고 정산 단위로 검산한다.
 */
import { Prng } from "@majak/core";
import type { PlayerId, RoundSettledPayload } from "@majak/core";
import { PERSONAS, runMatch2 } from "./lib.js";
import type { SettleObs } from "./lib.js";

const MINE = [
  "counter", "hidden_blade", "let_it_ride", "jackpot", "big_hand",
  "nagashi_yakuman", "blood_contract", "aotenjou_ceiling", "devils_advance",
  "eternal_dealer", "spy",
] as const;

const PERS = ["masher", "riichiRusher", "folder", "caller", "chaos", "stall"] as const;
const sum = (d: Record<string, number>): number => Object.values(d).reduce((s, v) => s + v, 0);

interface Finding { kind: string; detail: string; seed: number; }
const findings: Finding[] = [];
const counts: Record<string, number> = {};
const add = (kind: string, detail: string, seed: number): void => {
  counts[kind] = (counts[kind] ?? 0) + 1;
  if (findings.filter((f) => f.kind === kind).length < 6) findings.push({ kind, detail, seed });
};

const N = Number(process.argv[2] ?? 60);
const START = Number(process.argv[3] ?? 1);
let totalRounds = 0, crashes = 0, effErrs = 0;
const augSeen: Record<string, number> = {};

for (let i = 0; i < N; i++) {
  const seed = START + i;
  const rng = new Prng(seed * 7919 + 13);
  const mode = seed % 4 === 0 ? "tonpuu" : "hanchan";
  // 좌석마다 내 담당 증강 2~3개
  const pool = [...MINE];
  const preset: Record<PlayerId, string[]> = { p0: [], p1: [], p2: [], p3: [] };
  for (const s of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
    const k = 2 + rng.int(2);
    for (let j = 0; j < k && pool.length > 0; j++) {
      preset[s].push(pool.splice(rng.int(pool.length), 1)[0]!);
    }
  }
  for (const s of ["p0", "p1", "p2", "p3"] as PlayerId[]) for (const a of preset[s]) augSeen[a] = (augSeen[a] ?? 0) + 1;
  const personas = Object.fromEntries(
    (["p0", "p1", "p2", "p3"] as PlayerId[]).map((s) => [s, PERSONAS[PERS[rng.int(PERS.length)]!]!]),
  ) as Record<PlayerId, (typeof PERSONAS)[string]>;

  const holds = (p: PlayerId, id: string): boolean => preset[p].includes(id);

  const onSettle = (o: SettleObs): void => {
    const p: RoundSettledPayload = o.payload;
    const ids = o.after.players.map((x) => x.id);
    // A1 — 델타는 100점 격자
    for (const [id, v] of Object.entries(p.deltas)) {
      if (v % 100 !== 0) add("DELTA_NOT_100", `${id} delta=${v} outcome=${p.outcome}`, seed);
    }
    // A2 — 소지점도 100점 격자
    for (const pl of o.after.players) {
      if (pl.score % 100 !== 0) add("SCORE_NOT_100", `${pl.id} score=${pl.score}`, seed);
    }
    // A3 — 화료 정산은 공탁을 0으로 넘긴다 (엔진 계약)
    if (p.outcome === "win" && p.riichiPot !== 0) {
      add("POT_NOT_CLEARED", `riichiPot=${p.riichiPot}`, seed);
    }
    // A4 — 회수 공탁 합계가 정산 전 공탁을 넘지 않는다 (이중 지급)
    const gain = (p.winInfos ?? []).reduce((s, w) => s + ((w as { riichiPotGain?: number }).riichiPotGain ?? 0), 0);
    if (gain > o.potBefore) add("POT_DOUBLE_PAY", `gain=${gain} potBefore=${o.potBefore}`, seed);
    // A5 — 본장: 화료면 (오야연장 ? +1 : 0), 유국/도중유국이면 +1
    const hb = o.before.round.honba;
    const expHonba = p.outcome === "win" ? (p.dealerContinues === true ? hb + 1 : 0) : hb + 1;
    if (p.honba !== expHonba) add("HONBA_WRONG", `before=${hb} got=${p.honba} exp=${expHonba} outcome=${p.outcome} cont=${String(p.dealerContinues)}`, seed);
    // A6 — 마이너스 점수 방치
    for (const pl of o.after.players) {
      if (pl.score < 0) add("NEG_SCORE", `${pl.id}=${pl.score} r=${o.roundIndex}`, seed);
    }
    // A7 — 유국인데 화료 정보가 있다 / 화료인데 없다
    if (p.outcome === "win" && (p.winInfos ?? []).length === 0) add("WIN_NO_INFO", "-", seed);
    // A8 — augPoints 표시값이 실제 델타 방향과 어긋나는지 (표시 vs 정산)
    for (const n of p.augPoints ?? []) {
      if (!ids.includes(n.player)) add("AUGNOTE_BAD_PLAYER", JSON.stringify(n), seed);
      if (!Number.isFinite(n.points)) add("AUGNOTE_NAN", JSON.stringify(n), seed);
      if (n.points % 100 !== 0 && n.han === undefined) {
        add("AUGNOTE_NOT_100", `${n.augId} ${n.player} ${n.points}`, seed);
      }
    }
    // A9 — spy: 지정 패로 화료당했는데 화료자 델타가 남아 있는가
    for (const s of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
      if (!holds(s, "spy")) continue;
      const mark = o.before.augmentData[`spy:mark:${s}`];
      if (typeof mark !== "string" || mark === "") continue;
      const caught = (p.winInfos ?? []).filter((w) => w.winner !== s &&
        (o.before.tiles[w.winningTileId]?.kind !== undefined) &&
        kindKeyOf(o.before, w.winningTileId) === mark);
      for (const w of caught) {
        if ((p.deltas[w.winner] ?? 0) > 0) {
          add("SPY_LEFTOVER", `${w.winner} still +${p.deltas[w.winner]} while spy ${s} marked ${mark}`, seed);
        }
      }
    }
    // A10 — 유국역만: 보유자가 성립인데 지불이 없다 / 반대
    if (p.outcome === "draw") {
      for (const s of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
        if (!holds(s, "nagashi_yakuman")) continue;
        const hist = (o.before.round.byPlayer[s]?.discardedKinds ?? []) as string[];
        const valid = hist.length > 0 && hist.every((k) => /^(wind|dragon)/.test(k) || /^(man|pin|sou)(1|9)$/.test(k));
        const got = (p.deltas[s] ?? 0);
        if (valid && got < 8000) add("NAGASHI_MISSING", `${s} valid but delta=${got}`, seed);
        if (!valid && p.drawSpecial?.augId === "nagashi_yakuman" && p.drawSpecial.holder === s) {
          add("NAGASHI_PHANTOM", `${s} invalid but drawSpecial set`, seed);
        }
      }
    }
    // A12 — 정산 단위 뱅크 발행: 근거(augPoints) 없이 총합이 움직였는가
    {
      const potBefore = o.potBefore;
      const bank = sum(p.deltas) - (potBefore - p.riichiPot);
      const noted = (p.augPoints ?? []).length > 0;
      if (bank !== 0 && !noted) {
        add("SETTLE_BANK_UNEXPLAINED", `bank=${bank} outcome=${p.outcome} potBefore=${potBefore} potAfter=${p.riichiPot}`, seed);
      }
    }
    // A11 — 만년 오야: 연장 카운터가 3을 넘는가
    for (const s of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
      if (!holds(s, "eternal_dealer")) continue;
      const k = o.after.augmentData[`eternal_dealer:keeps:${s}`];
      if (typeof k === "number" && k > 3) add("ETERNAL_OVER", `${s} keeps=${k}`, seed);
    }
  };

  const r = await runMatch2({ seed, mode, preset: preset as never, personas, onSettle });
  totalRounds += r.rounds;
  if (r.crash !== undefined) { crashes++; add("CRASH", r.crash.split("\n").slice(0, 3).join(" | "), seed); }
  for (const e of r.effectErrors) { effErrs++; add("EFFECT_ERROR", e.slice(0, 200), seed); }
  for (const v of r.violations) {
    if (v.kind === "SCORE_DRIFT_ATTRIBUTED") continue; // 근거 메모가 있는 뱅크 발행은 설계 경로
    add(`STATE_${v.kind}`, `${v.detail} @${v.round} ${v.seat ?? ""}`, seed);
  }
  if ((i + 1) % 10 === 0) console.error(`... ${i + 1}/${N} rounds=${totalRounds}`);
}

function kindKeyOf(st: { tiles: Record<number, { kind: { suit: string; rank: number } }> }, id: number): string {
  const k = st.tiles[id]?.kind;
  return k === undefined ? "" : `${k.suit}${k.rank}`;
}

console.log(`\n=== 소크 결과: ${N}판(매치) · ${totalRounds}국 · crash=${crashes} effErr=${effErrs}`);
console.log("증강 배정 횟수:", augSeen);
console.log("\n--- 종류별 개수");
for (const [k, v] of Object.entries(counts).sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${v}`);
console.log("\n--- 표본");
for (const f of findings) console.log(`  [${f.kind}] seed=${f.seed} ${f.detail}`);
