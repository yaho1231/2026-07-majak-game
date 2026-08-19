/**
 * 교차 카테고리 짝 QA — 한 사람이 두 증강을 동시에 들었을 때 무너지는 자리를 찾는다.
 * (qa-lab/pairs/ 전용. 소스는 읽기만 한다.)
 */
import { Prng, handZone, kindKey } from "@majak/core";
import type { AugmentDef, GameState, PlayerId, Violation as _V } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, SEATS, byId, conflicting, offerable, runMatch } from "../harness.js";
import type { MatchReport, Persona, Violation } from "../harness.js";

export { PERSONAS, SEATS, byId, conflicting, offerable, runMatch };
export type { MatchReport, Persona, Violation };

export const DEFS: AugmentDef[] = [...contentAugments];
export const catOf = (id: string): string =>
  (byId.get(id) as { category?: string } | undefined)?.category ?? "etc";

/** 소스 grep으로 얻은 특성 태그 (build_tags.sh 가 만든 JSON) */
export interface Tags {
  state: boolean;
  deltas: boolean;
  uses: boolean;
  tiles: boolean;
  win: boolean;
}

export interface Pair {
  a: string;
  b: string;
  bucket: string;
}

/** 교차 카테고리 + conflicts 아님 + 같은 모드에서 제공 가능 */
export function usable(a: string, b: string, mode: "hanchan" | "tonpuu"): boolean {
  if (a === b) return false;
  const da = byId.get(a);
  const db = byId.get(b);
  if (da === undefined || db === undefined) return false;
  if (!offerable(da, mode) || !offerable(db, mode)) return false;
  if (conflicting(a, b)) return false;
  if (catOf(a) === catOf(b)) return false;
  return true;
}

/** 나머지 세 자리를 무작위 2개씩 (짝과 겹치지 않게) */
export function fillSeats(
  rng: Prng,
  mode: "hanchan" | "tonpuu",
  pair: readonly string[],
): Record<PlayerId, string[]> {
  const pool = DEFS.filter((d) => offerable(d, mode))
    .map((d) => d.id)
    .filter((id) => !pair.includes(id));
  const out: Record<PlayerId, string[]> = { p0: [...pair], p1: [], p2: [], p3: [] };
  const taken = new Set(pair);
  for (const seat of ["p1", "p2", "p3"] as PlayerId[]) {
    const held = out[seat] as string[];
    let guard = 0;
    while (held.length < 2 && guard++ < 300) {
      const id = pool[rng.int(pool.length)] as string;
      if (taken.has(id)) continue;
      if (held.some((h) => conflicting(h, id))) continue;
      held.push(id);
      taken.add(id);
    }
  }
  return out;
}

/** 짝 전용 추가 불변식 */
export function pairInvariants(pair: readonly string[]) {
  let maxKeys = 0;
  const seenKeys = new Set<string>();
  /** 리치 손패 스냅샷 — 좌석 → (손패 kindKey 정렬, 멜드 수) */
  const riichiSnap = new Map<PlayerId, { sig: string; melds: number }>();
  const fired = new Set<string>();
  let roundIdx = 0;
  return {
    onRound(_st: GameState, phase: "start" | "end"): void {
      if (phase === "start") {
        roundIdx++;
        riichiSnap.clear();
      }
    },
    onState(st: GameState, out: Violation[]): void {
      const rk = `#${roundIdx} ${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
      const push = (kind: string, detail: string, seat?: PlayerId): void => {
        const dedup = `${kind}|${detail.slice(0, 60)}`;
        if (fired.has(dedup)) return;
        fired.add(dedup);
        if (out.length < 400) {
          out.push(seat === undefined ? { kind, detail, round: rk } : { kind, detail, round: rk, seat });
        }
      };
      // (A) 사용 횟수 상한 — `<id>:uses:<seat>` 는 matchUses 를 넘을 수 없다
      const base = st.config.mode === "tonpuu" ? 1 : 2;
      // seat_swap 만 설계상 matchUses+1 (packages/content/src/augments/seat_swap.ts:73)
      const capOf = (augId: string): number => (augId === "seat_swap" ? base + 1 : base);
      for (const [k, v] of Object.entries(st.augmentData)) {
        const m = /^([a-z0-9_]+):uses:(p[0-3])$/.exec(k);
        if (m === null) continue;
        const cap = capOf(m[1] as string);
        if (typeof v === "number" && v > cap) {
          push("USES_OVER_CAP", `${k}=${v} > cap ${cap}`, m[2] as PlayerId);
        }
      }
      // (B) 리치 손패 고정 — 리치 선언자의 13장 손패는 (깡·리치 해제가 없는 한) 그대로다.
      //     리치가 풀린 순간(팜플립 등)에는 스냅샷을 버린다 — 재선언 사이의 변화는 정상.
      for (const seat of st.config.playerIds) {
        const rp = st.round.byPlayer[seat];
        const hz = st.zones[handZone(seat)];
        if (rp?.riichi == null || hz === undefined || hz.tileIds.length !== 13) {
          riichiSnap.delete(seat);
          continue;
        }
        const melds = rp.meldCount ?? rp.melds?.length ?? 0;
        const sig = hz.tileIds
          .map((id) => {
            const t = st.tiles[id];
            return t === undefined ? String(id) : kindKey(t.kind);
          })
          .slice()
          .sort()
          .join(",");
        const prev = riichiSnap.get(seat);
        if (prev !== undefined && prev.melds === melds && prev.sig !== sig) {
          const held = st.players.find((p) => p.id === seat)?.augments ?? [];
          push("RIICHI_HAND_MUTATED", `held=[${held.join(",")}] ${prev.sig} -> ${sig}`, seat);
        }
        riichiSnap.set(seat, { sig, melds });
      }
      // (C) 손패 장수 엄격 검사 — turn.act 에서 차례인 사람은 14장(진짜 용 17),
      //     나머지는 13장(17→16). 멜드는 3장으로 환산한다.
      if (st.round.phase === "turn.act") {
        for (const seat of st.config.playerIds) {
          const hz = st.zones[handZone(seat)];
          if (hz === undefined) continue;
          const rp = st.round.byPlayer[seat];
          const melds = rp?.meldCount ?? rp?.melds?.length ?? 0;
          const eff = hz.tileIds.length + melds * 3;
          const held = st.players.find((p) => p.id === seat)?.augments ?? [];
          const base = held.includes("true_dragon") ? 16 : 13;
          const isTurn = st.players.find((p) => p.id === seat)?.seat === st.round.turnSeat;
          const want = isTurn ? [base + 1, base] : [base, base + 1];
          if (!want.includes(eff)) {
            push(
              "HAND_SIZE_STRICT",
              `eff=${eff} want=${want.join("|")} hand=${hz.tileIds.length} melds=${melds} turn=${isTurn} held=[${held.join(",")}]`,
              seat,
            );
          }
        }
      }
      // (D) 패 총량 보존 — 모든 존의 tileId 합은 항상 136장이어야 한다
      {
        let n = 0;
        for (const z of Object.values(st.zones)) n += z.tileIds.length;
        if (n !== 136 && st.round.phase !== "setup") {
          push("TILE_TOTAL", `zones sum=${n} (want 136) phase=${st.round.phase}`);
        }
      }
      const keys = Object.keys(st.augmentData);
      if (keys.length > maxKeys) maxKeys = keys.length;
      for (const k of keys) seenKeys.add(k);
      // 상태 키 폭주 (짝이 서로의 키를 무한 증식시키는가)
      if (keys.length > 1200 && out.length < 400) {
        out.push({ kind: "AUGDATA_EXPLOSION", detail: `keys=${keys.length}`, round: rk });
      }
      // 증강 보유 목록이 변형됐는가 (중복·유실)
      for (const p of st.players) {
        const a = p.augments;
        if (new Set(a).size !== a.length) {
          out.push({ kind: "AUG_DUP", detail: a.join(","), round: rk, seat: p.id });
        }
      }
      const p0 = st.players.find((p) => p.id === "p0");
      if (p0 !== undefined && p0.augments.length > 0) {
        for (const want of pair) {
          if (!p0.augments.includes(want)) {
            out.push({ kind: "AUG_LOST", detail: `${want} 사라짐 (${p0.augments.join(",")})`, round: rk, seat: "p0" });
          }
        }
      }
    },
    /** 짝의 두 증강이 실제로 무언가를 남겼는가 (augmentData 키 prefix로 본다) */
    touched: (): { a: boolean; b: boolean } => ({
      a: [...seenKeys].some((k) => k.startsWith(`${pair[0]}:`) || k.includes(`:${pair[0]}:`) || k.includes(`uses:${pair[0]}`)),
      b: [...seenKeys].some((k) => k.startsWith(`${pair[1]}:`) || k.includes(`:${pair[1]}:`) || k.includes(`uses:${pair[1]}`)),
    }),
    stats: (): { maxKeys: number; totalKeys: number } => ({ maxKeys, totalKeys: seenKeys.size }),
  };
}

export interface PairResult {
  pair: Pair;
  seed: number;
  mode: "hanchan" | "tonpuu";
  preset: Record<PlayerId, readonly string[]>;
  crash?: string;
  effectErrors: string[];
  bad: Violation[];
  rounds: number;
  ms: number;
  /** 두 증강이 실제로 상태를 남겼는가 (커버리지 근거) */
  touched: { a: boolean; b: boolean };
  actions: Record<string, number>;
}

const IGNORE = new Set(["SCORE_DRIFT_ATTRIBUTED"]);

export async function runPair(
  pair: Pair,
  seed: number,
  mode: "hanchan" | "tonpuu",
  personaMix: number,
  /** true면 같은 짝을 p0·p2 두 사람이 동시에 든다 (짝끼리 부딪히게) */
  dual = false,
): Promise<PairResult> {
  const rng = new Prng(seed * 7919 + 13);
  const preset = fillSeats(rng, mode, [pair.a, pair.b]);
  if (dual) (preset as Record<string, string[]>)["p2"] = [pair.a, pair.b];
  const inv = pairInvariants([pair.a, pair.b]);
  const mixes: Persona[][] = [
    [PERSONAS.masher!, PERSONAS.masher!, PERSONAS.masher!, PERSONAS.masher!],
    [PERSONAS.masher!, PERSONAS.caller!, PERSONAS.riichiRusher!, PERSONAS.folder!],
    [PERSONAS.masher!, PERSONAS.stall!, PERSONAS.chaos!, PERSONAS.stall!],
  ];
  const mx = mixes[personaMix % mixes.length] as Persona[];
  const t0 = Date.now();
  const r: MatchReport = await runMatch({
    seed,
    mode,
    preset,
    personas: { p0: mx[0]!, p1: mx[1]!, p2: mx[2]!, p3: mx[3]! },
    onState: inv.onState,
    onRound: inv.onRound,
    timeoutMs: 90_000,
  });
  const bad = r.violations.filter((v) => !IGNORE.has(v.kind));
  const out: PairResult = {
    pair,
    seed,
    mode,
    preset,
    effectErrors: r.effectErrors,
    bad,
    rounds: r.rounds,
    ms: Date.now() - t0,
    touched: inv.touched(),
    actions: r.actionsTaken,
  };
  if (r.crash !== undefined) out.crash = r.crash;
  return out;
}
