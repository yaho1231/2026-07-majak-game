/**
 * ref.ts — 표준 리치마작 채점기 **독립 구현** (QA 검산용).
 * 엔진 코드를 전혀 참조하지 않고, 일본 리치마작 표준 룰 + docs/01_GAME_RULES.md 의
 * 이 프로젝트 확정 사항(쿠이탄·카조에·절상없음·더블역만 4종·후로핑후형 론30/쯔모20)만으로 쓴다.
 */

export type Suit = "m" | "p" | "s" | "z";
export interface K { s: Suit; r: number }

export const key = (k: K): string => `${k.s}${k.r}`;
export const idx = (k: K): number =>
  (k.s === "m" ? 0 : k.s === "p" ? 9 : k.s === "s" ? 18 : 27) + k.r - 1;
export const fromIdx = (i: number): K =>
  i < 9 ? { s: "m", r: i + 1 } : i < 18 ? { s: "p", r: i - 8 } : i < 27 ? { s: "s", r: i - 17 } : { s: "z", r: i - 26 };

export const isHonor = (k: K): boolean => k.s === "z";
export const isTerm = (k: K): boolean => k.s !== "z" && (k.r === 1 || k.r === 9);
export const isTH = (k: K): boolean => isHonor(k) || isTerm(k);

export interface RefSet {
  type: "run" | "tri";
  tiles: K[];        // 대표 3장
  concealed: boolean;
  isKan: boolean;
}

export interface RefMeld {
  kind: "chi" | "pon" | "kan_open" | "kan_added" | "kan_closed";
  tiles: K[];        // 실물 (깡은 4장)
}

export interface RefCtx {
  hand: K[];             // 화료패 포함, 후로 제외
  melds: RefMeld[];
  winTile: K;
  winType: "tsumo" | "ron";
  seatWind: number;      // 1..4
  roundWind: number;
  riichi: { double: boolean; ippatsu: boolean } | null;
  flags: { haitei?: boolean; houtei?: boolean; rinshan?: boolean; chankan?: boolean; tenhou?: boolean; chihou?: boolean };
  dora: K[];
  ura: K[];
  red: number;
  isDealer: boolean;
}

// ── 분해 ──────────────────────────────────────────────
interface Decomp { sets: { type: "run" | "tri"; tiles: K[] }[]; pair: K }

function decompStandard(counts: number[], need: number): Decomp[] {
  const out: Decomp[] = [];
  const seen = new Set<string>();
  // 머리 후보
  for (let p = 0; p < 34; p++) {
    if ((counts[p] as number) < 2) continue;
    counts[p] -= 2;
    const sets: { type: "run" | "tri"; tiles: K[] }[] = [];
    const rec = (start: number): void => {
      if (sets.length === need) {
        if (counts.every((c) => c === 0)) {
          const sig = `${p}|${sets.map((s) => `${s.type}${idx(s.tiles[0] as K)}`).sort().join(",")}`;
          if (!seen.has(sig)) { seen.add(sig); out.push({ sets: sets.map((s) => ({ ...s, tiles: [...s.tiles] })), pair: fromIdx(p) }); }
        }
        return;
      }
      for (let i = start; i < 34; i++) {
        if ((counts[i] as number) === 0) continue;
        if ((counts[i] as number) >= 3) {
          counts[i] -= 3;
          sets.push({ type: "tri", tiles: [fromIdx(i), fromIdx(i), fromIdx(i)] });
          rec(i);
          sets.pop();
          counts[i] += 3;
        }
        if (i < 27 && i % 9 <= 6 && (counts[i + 1] as number) > 0 && (counts[i + 2] as number) > 0) {
          counts[i]--; counts[i + 1]--; counts[i + 2]--;
          sets.push({ type: "run", tiles: [fromIdx(i), fromIdx(i + 1), fromIdx(i + 2)] });
          rec(i);
          sets.pop();
          counts[i]++; counts[i + 1]++; counts[i + 2]++;
        }
        return; // 가장 작은 미사용 패는 반드시 어떤 몸통의 시작이다
      }
    };
    rec(0);
    counts[p] += 2;
  }
  return out;
}

function countsOf(hand: K[]): number[] {
  const c = new Array<number>(34).fill(0);
  for (const k of hand) c[idx(k)] = (c[idx(k)] as number) + 1;
  return c;
}

function isChiitoi(hand: K[]): boolean {
  if (hand.length !== 14) return false;
  const c = countsOf(hand);
  return c.filter((x) => x === 2).length === 7;
}

const KOKUSHI_IDX = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];
function kokushiPair(hand: K[]): K | null {
  if (hand.length !== 14) return null;
  const c = countsOf(hand);
  let pair: K | null = null;
  for (let i = 0; i < 34; i++) {
    if (!KOKUSHI_IDX.includes(i)) { if ((c[i] as number) > 0) return null; continue; }
    const n = c[i] as number;
    if (n === 0) return null;
    if (n === 2) { if (pair !== null) return null; pair = fromIdx(i); }
    else if (n !== 1) return null;
  }
  return pair;
}

// ── 변형 ──────────────────────────────────────────────
export interface Variant {
  form: "standard" | "chiitoi" | "kokushi";
  sets: RefSet[];          // 손패 + 후로 통합
  pair: K | null;
  wait: "ryanmen" | "kanchan" | "penchan" | "tanki" | "shanpon" | "chiitoi" | "kokushi";
  closed: boolean;
  hand: K[];
}

function meldSet(m: RefMeld): RefSet {
  const isKan = m.kind !== "chi" && m.kind !== "pon";
  return {
    type: m.kind === "chi" ? "run" : "tri",
    tiles: m.tiles.slice(0, 3),
    concealed: m.kind === "kan_closed",
    isKan,
  };
}

export function buildRefVariants(ctx: RefCtx): Variant[] {
  const closed = ctx.melds.every((m) => m.kind === "kan_closed");
  const meldSets = ctx.melds.map(meldSet);
  const out: Variant[] = [];
  const wk = key(ctx.winTile);

  if (ctx.melds.length === 0) {
    if (isChiitoi(ctx.hand)) {
      out.push({ form: "chiitoi", sets: [], pair: null, wait: "chiitoi", closed, hand: ctx.hand });
    }
    const kp = kokushiPair(ctx.hand);
    if (kp !== null) {
      out.push({ form: "kokushi", sets: [], pair: kp, wait: "kokushi", closed, hand: ctx.hand });
    }
  }

  const need = 4 - ctx.melds.length;
  for (const d of decompStandard(countsOf(ctx.hand), need)) {
    if (key(d.pair) === wk) {
      out.push({
        form: "standard",
        sets: [...d.sets.map((s) => ({ type: s.type, tiles: s.tiles, concealed: true, isKan: false })), ...meldSets],
        pair: d.pair, wait: "tanki", closed, hand: ctx.hand,
      });
    }
    d.sets.forEach((abs, i) => {
      if (!abs.tiles.some((t) => key(t) === wk)) return;
      let wait: Variant["wait"];
      if (abs.type === "tri") wait = "shanpon";
      else {
        const [a, b, c] = abs.tiles as [K, K, K];
        if (key(b) === wk) wait = "kanchan";
        else if (a.r === 1 && key(c) === wk) wait = "penchan";
        else if (c.r === 9 && key(a) === wk) wait = "penchan";
        else wait = "ryanmen";
      }
      out.push({
        form: "standard",
        sets: [
          ...d.sets.map((s, j) => ({
            type: s.type, tiles: s.tiles,
            concealed: !(j === i && s.type === "tri" && ctx.winType === "ron"),
            isKan: false,
          })),
          ...meldSets,
        ],
        pair: d.pair, wait, closed, hand: ctx.hand,
      });
    });
  }
  return out;
}

// ── 역 ────────────────────────────────────────────────
export interface RefYaku { id: string; han: number; yakuman?: number }

const allTiles = (v: Variant): K[] => {
  if (v.form !== "standard") return v.hand;
  const t = v.sets.flatMap((s) => s.tiles);
  return v.pair !== null ? [...t, v.pair, v.pair] : t;
};

function refYaku(v: Variant, ctx: RefCtx): RefYaku[] {
  const y: RefYaku[] = [];
  const push = (id: string, closedHan: number, openHan: number | null): void => {
    const h = v.closed ? closedHan : openHan;
    if (h !== null) y.push({ id, han: h });
  };
  const kinds = allTiles(v);
  const runs = v.sets.filter((s) => s.type === "run");
  const tris = v.sets.filter((s) => s.type === "tri");

  // 역만
  const yakuman = (id: string, mult: number): void => y.push({ id, han: 0, yakuman: mult });
  const dragTri = tris.filter((s) => (s.tiles[0] as K).s === "z" && (s.tiles[0] as K).r >= 5).length;
  const windTri = tris.filter((s) => (s.tiles[0] as K).s === "z" && (s.tiles[0] as K).r <= 4).length;
  let hasYakuman = false;
  if (v.form === "kokushi") {
    hasYakuman = true;
    if (v.pair !== null && key(v.pair) === key(ctx.winTile)) yakuman("kokushi_13", 2);
    else yakuman("kokushi", 1);
  }
  if (v.form === "standard") {
    const allConcTri = v.sets.length > 0 && v.sets.every((s) => s.type === "tri" && s.concealed);
    if (allConcTri) {
      hasYakuman = true;
      if (v.wait === "tanki") yakuman("suuankou_tanki", 2); else yakuman("suuankou", 1);
    }
    if (windTri === 4) { hasYakuman = true; yakuman("daisuushii", 2); }
    else if (windTri === 3 && v.pair !== null && v.pair.s === "z" && v.pair.r <= 4) { hasYakuman = true; yakuman("shousuushii", 1); }
    // 구련
    if (v.closed && ctx.melds.length === 0) {
      const suits = new Set(kinds.map((k) => k.s));
      if (suits.size === 1 && !suits.has("z")) {
        const c = new Array<number>(10).fill(0);
        for (const k of kinds) c[k.r] = (c[k.r] as number) + 1;
        if ((c[1] as number) >= 3 && (c[9] as number) >= 3 && [2, 3, 4, 5, 6, 7, 8].every((r) => (c[r] as number) >= 1)) {
          let surplus = 0;
          for (let r = 1; r <= 9; r++) if ((c[r] as number) > (r === 1 || r === 9 ? 3 : 1)) surplus = r;
          hasYakuman = true;
          if (surplus === ctx.winTile.r) yakuman("chuuren_junsei", 2); else yakuman("chuuren", 1);
        }
      }
    }
  }
  if (v.form !== "kokushi") {
    if (dragTri === 3) { hasYakuman = true; yakuman("daisangen", 1); }
    if (kinds.every(isHonor)) { hasYakuman = true; yakuman("tsuuiisou", 1); }
    if (kinds.every(isTerm)) { hasYakuman = true; yakuman("chinroutou", 1); }
    const GREEN = new Set(["s2", "s3", "s4", "s6", "s8", "z6"]);
    if (kinds.every((k) => GREEN.has(key(k)))) { hasYakuman = true; yakuman("ryuuiisou", 1); }
  }
  const kans = v.sets.filter((s) => s.isKan).length;
  if (kans === 4) { hasYakuman = true; yakuman("suukantsu", 1); }
  if (ctx.flags.tenhou === true && ctx.winType === "tsumo") { hasYakuman = true; yakuman("tenhou", 1); }
  if (ctx.flags.chihou === true && ctx.winType === "tsumo") { hasYakuman = true; yakuman("chihou", 1); }
  if (hasYakuman) return y.filter((x) => x.yakuman !== undefined);

  // 일반 역
  if (ctx.riichi !== null) {
    if (ctx.riichi.double) y.push({ id: "double_riichi", han: 2 });
    else y.push({ id: "riichi", han: 1 });
    if (ctx.riichi.ippatsu) y.push({ id: "ippatsu", han: 1 });
  }
  if (v.closed && ctx.winType === "tsumo") y.push({ id: "menzen_tsumo", han: 1 });
  if (ctx.flags.haitei === true && ctx.winType === "tsumo") y.push({ id: "haitei", han: 1 });
  if (ctx.flags.houtei === true && ctx.winType === "ron") y.push({ id: "houtei", han: 1 });
  if (ctx.flags.rinshan === true && ctx.winType === "tsumo") y.push({ id: "rinshan", han: 1 });
  if (ctx.flags.chankan === true && ctx.winType === "ron") y.push({ id: "chankan", han: 1 });

  if (v.form === "chiitoi") y.push({ id: "chiitoitsu", han: 2 });
  if (kinds.every((k) => !isTH(k))) push("tanyao", 1, 1);

  // 핑후
  if (v.form === "standard" && v.closed && v.sets.every((s) => s.type === "run") &&
      v.pair !== null && !(v.pair.s === "z" && (v.pair.r >= 5 || v.pair.r === ctx.seatWind || v.pair.r === ctx.roundWind)) &&
      v.wait === "ryanmen") {
    y.push({ id: "pinfu", han: 1 });
  }
  // 이페코/량페코
  if (v.form === "standard") {
    const m = new Map<string, number>();
    for (const r of runs) { const k = `${(r.tiles[0] as K).s}${(r.tiles[0] as K).r}`; m.set(k, (m.get(k) ?? 0) + 1); }
    let pairs = 0;
    for (const n of m.values()) pairs += Math.floor(n / 2);
    if (pairs === 1) push("iipeiko", 1, null);
    if (pairs === 2) push("ryanpeiko", 3, null);
  }
  // 역패
  const hasTri = (s: Suit, r: number): boolean =>
    tris.some((t) => (t.tiles[0] as K).s === s && (t.tiles[0] as K).r === r && t.tiles.every((x) => key(x) === key(t.tiles[0] as K)));
  if (hasTri("z", 5)) y.push({ id: "yakuhai_haku", han: 1 });
  if (hasTri("z", 6)) y.push({ id: "yakuhai_hatsu", han: 1 });
  if (hasTri("z", 7)) y.push({ id: "yakuhai_chun", han: 1 });
  if (hasTri("z", ctx.seatWind)) y.push({ id: "yakuhai_seat", han: 1 });
  if (hasTri("z", ctx.roundWind)) y.push({ id: "yakuhai_prevalent", han: 1 });

  if (v.form === "standard" && v.sets.every((s) => s.type === "tri")) push("toitoi", 2, 2);
  if (v.form === "standard" && tris.filter((s) => s.concealed).length >= 3) push("sanankou", 2, 2);
  if (kans === 3) push("sankantsu", 2, 2);
  if (v.form === "standard") {
    for (let r = 1; r <= 7; r++) {
      if ((["m", "p", "s"] as Suit[]).every((s) => runs.some((x) => (x.tiles[0] as K).s === s && (x.tiles[0] as K).r === r))) {
        push("sanshoku", 2, 1); break;
      }
    }
    for (let r = 1; r <= 9; r++) {
      if ((["m", "p", "s"] as Suit[]).every((s) => hasTri(s, r))) { push("sanshoku_doukou", 2, 2); break; }
    }
    if (dragTri === 2 && v.pair !== null && v.pair.s === "z" && v.pair.r >= 5) push("shousangen", 2, 2);
    if ((["m", "p", "s"] as Suit[]).some((s) => [1, 4, 7].every((r) => runs.some((x) => (x.tiles[0] as K).s === s && (x.tiles[0] as K).r === r)))) {
      push("ittsuu", 2, 1);
    }
  }
  if (v.form !== "kokushi" && kinds.every(isTH) && kinds.some(isHonor) && kinds.some(isTerm)) push("honroutou", 2, 2);
  if (v.form === "standard" && runs.length >= 1 && v.pair !== null) {
    const setsAllTH = v.sets.every((s) => s.tiles.some(isTH));
    if (setsAllTH && isTH(v.pair)) {
      if (kinds.some(isHonor)) push("chanta", 2, 1);
      else if (v.sets.every((s) => s.tiles.some(isTerm)) && isTerm(v.pair)) push("junchan", 3, 2);
    }
  }
  const numSuits = new Set(kinds.filter((k) => k.s !== "z").map((k) => k.s));
  const hasHon = kinds.some(isHonor);
  if (v.form !== "kokushi") {
    if (numSuits.size === 1 && hasHon) push("honitsu", 3, 2);
    if (numSuits.size === 1 && !hasHon) push("chinitsu", 6, 5);
  }
  return y;
}

// ── 부 ────────────────────────────────────────────────
function refFu(v: Variant, ctx: RefCtx, pinfu: boolean): number {
  if (v.form === "chiitoi") return 25;
  if (v.form === "kokushi") return 0;
  let extra = 0;
  for (const s of v.sets) {
    if (s.type !== "tri") continue;
    let f = isTH(s.tiles[0] as K) ? 8 : 4;
    if (!s.concealed) f /= 2;
    if (s.isKan) f *= 4;
    extra += f;
  }
  if (v.pair !== null && v.pair.s === "z") {
    if (v.pair.r >= 5) extra += 2;
    else {
      if (v.pair.r === ctx.seatWind) extra += 2;
      if (v.pair.r === ctx.roundWind) extra += 2;
    }
  }
  if (v.wait === "kanchan" || v.wait === "penchan" || v.wait === "tanki") extra += 2;
  if (!v.closed && extra === 0) return ctx.winType === "ron" ? 30 : 20;
  let fu = 20 + extra;
  if (v.closed && ctx.winType === "ron") fu += 10;
  if (ctx.winType === "tsumo" && !pinfu) fu += 2;
  return Math.ceil(fu / 10) * 10;
}

// ── 점수 ──────────────────────────────────────────────
const up100 = (n: number): number => Math.ceil(n / 100) * 100;
export function refScore(han: number, fu: number, yakuman: number, isDealer: boolean, winType: "tsumo" | "ron"): {
  base: number; total: number; limit: string | null; discarder?: number; dealer?: number; others?: number;
} {
  let base: number; let limit: string | null = null;
  if (yakuman > 0) { base = 8000 * yakuman; limit = "yakuman"; }
  else if (han >= 13) { base = 8000; limit = "kazoe_yakuman"; }
  else if (han >= 11) { base = 6000; limit = "sanbaiman"; }
  else if (han >= 8) { base = 4000; limit = "baiman"; }
  else if (han >= 6) { base = 3000; limit = "haneman"; }
  else if (han >= 5) { base = 2000; limit = "mangan"; }
  else { base = fu * 2 ** (2 + han); if (base > 2000) { base = 2000; limit = "mangan"; } }
  if (winType === "ron") {
    const paid = up100(base * (isDealer ? 6 : 4));
    return { base, total: paid, limit, discarder: paid };
  }
  if (isDealer) { const each = up100(base * 2); return { base, total: each * 3, limit, others: each }; }
  const d = up100(base * 2); const o = up100(base);
  return { base, total: d + o * 2, limit, dealer: d, others: o };
}

export interface RefEval {
  ok: boolean;
  yakumanCount: number;
  yaku: RefYaku[];
  han: number;       // 역판 + 도라
  yakuHan: number;
  dora: number; ura: number; red: number;
  fu: number;
  points: number;
  limit: string | null;
  wait: string;
}

function countDoraOf(kinds: K[], dora: K[]): number {
  const m = new Map<string, number>();
  for (const d of dora) m.set(key(d), (m.get(key(d)) ?? 0) + 1);
  let n = 0;
  for (const k of kinds) n += m.get(key(k)) ?? 0;
  return n;
}

/** 채점 — mode: "engine"(역만>판>부) 또는 "points"(실제 점수 최대) 로 변형을 고른다 */
export function refEvaluate(ctx: RefCtx, mode: "engine" | "points" = "engine"): RefEval | null {
  const variants = buildRefVariants(ctx);
  if (variants.length === 0) return null;
  const fullKinds = [...ctx.hand, ...ctx.melds.flatMap((m) => m.tiles)];
  let best: RefEval | null = null;
  for (const v of variants) {
    const ys = refYaku(v, ctx);
    const yakumanCount = ys.reduce((s, x) => s + (x.yakuman ?? 0), 0);
    let ev: RefEval;
    if (yakumanCount > 0) {
      const sc = refScore(0, 0, yakumanCount, ctx.isDealer, ctx.winType);
      ev = { ok: true, yakumanCount, yaku: ys, han: 0, yakuHan: 0, dora: 0, ura: 0, red: 0, fu: 0, points: sc.total, limit: sc.limit, wait: v.wait };
    } else {
      const yakuHan = ys.reduce((s, x) => s + x.han, 0);
      const pinfu = ys.some((x) => x.id === "pinfu");
      const fu = refFu(v, ctx, pinfu);
      const ok = ys.length > 0;
      const dora = ok ? countDoraOf(fullKinds, ctx.dora) : 0;
      const ura = ok && ctx.riichi !== null ? countDoraOf(fullKinds, ctx.ura) : 0;
      const red = ok ? ctx.red : 0;
      const han = yakuHan + dora + ura + red;
      const sc = refScore(han, fu, 0, ctx.isDealer, ctx.winType);
      ev = { ok, yakumanCount: 0, yaku: ys, han, yakuHan, dora, ura, red, fu, points: ok ? sc.total : 0, limit: sc.limit, wait: v.wait };
    }
    if (best === null) { best = ev; continue; }
    if (mode === "engine") {
      if (ev.yakumanCount !== best.yakumanCount) { if (ev.yakumanCount > best.yakumanCount) best = ev; continue; }
      if (ev.han !== best.han) { if (ev.han > best.han) best = ev; continue; }
      if (ev.fu > best.fu) best = ev;
    } else {
      if (ev.points > best.points) best = ev;
      else if (ev.points === best.points && ev.yakumanCount > best.yakumanCount) best = ev;
    }
  }
  return best;
}
