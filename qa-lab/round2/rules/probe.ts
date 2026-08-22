/**
 * probe.ts — 무작위 **화료형**을 대량 생성해 엔진 채점(evaluateWin+calculateScore)과
 * 독립 채점기(ref.ts)를 직접 대조한다. 판을 돌리지 않으므로 수십만 손을 볼 수 있다.
 *
 * 사용: tsx qa-lab/round2/rules/probe.ts [손수] [시드]
 */
import { YakuRegistry, registerStandardYaku, evaluateWin, calculateScore, Prng } from "@majak/core";
import type { WinContext, MeldInfo, TileKind } from "@majak/core";
import { refEvaluate } from "./ref.js";
import type { K, RefCtx, RefMeld } from "./ref.js";

const registry = new YakuRegistry();
registerStandardYaku(registry);

const toTK = (k: K): TileKind =>
  k.s === "m" ? { suit: "man", rank: k.r }
  : k.s === "p" ? { suit: "pin", rank: k.r }
  : k.s === "s" ? { suit: "sou", rank: k.r }
  : k.r <= 4 ? { suit: "wind", rank: k.r } : { suit: "dragon", rank: k.r - 4 };

const kk = (k: K): string => `${k.s}${k.r}`;

interface Gen { hand: K[]; melds: RefMeld[]; winTile: K; closed: boolean }

const SUITS: K["s"][] = ["m", "p", "s"];

/** 무작위 화료형 만들기 — 몸통 4 + 머리 1 (일부는 후로/깡), 또는 치또이·국사 */
function genHand(rng: Prng): Gen | null {
  const used = new Map<string, number>();
  const take = (k: K, n: number): boolean => {
    const c = used.get(kk(k)) ?? 0;
    if (c + n > 4) return false;
    used.set(kk(k), c + n);
    return true;
  };
  const roll = rng.next();
  if (roll < 0.06) {
    // 치또이
    const pool: K[] = [];
    for (const s of SUITS) for (let r = 1; r <= 9; r++) pool.push({ s, r });
    for (let r = 1; r <= 7; r++) pool.push({ s: "z", r });
    const picked: K[] = [];
    while (picked.length < 7 && pool.length > 0) {
      const i = rng.int(pool.length);
      picked.push(pool[i] as K);
      pool.splice(i, 1);
    }
    const hand = picked.flatMap((k) => [k, k]);
    return { hand, melds: [], winTile: picked[rng.int(7)] as K, closed: true };
  }
  if (roll < 0.09) {
    // 국사
    const th: K[] = [{ s: "m", r: 1 }, { s: "m", r: 9 }, { s: "p", r: 1 }, { s: "p", r: 9 }, { s: "s", r: 1 }, { s: "s", r: 9 },
      { s: "z", r: 1 }, { s: "z", r: 2 }, { s: "z", r: 3 }, { s: "z", r: 4 }, { s: "z", r: 5 }, { s: "z", r: 6 }, { s: "z", r: 7 }];
    const dup = th[rng.int(13)] as K;
    return { hand: [...th, dup], melds: [], winTile: rng.next() < 0.5 ? dup : (th[rng.int(13)] as K), closed: true };
  }

  // 표준형
  const bias = rng.next();
  const pickSuit = (): K["s"] => (bias < 0.25 ? (SUITS[0] as K["s"]) : SUITS[rng.int(3)] as K["s"]);
  const bodies: { tiles: K[]; type: "run" | "tri" }[] = [];
  for (let i = 0; i < 4; i++) {
    let ok = false;
    for (let tries = 0; tries < 40 && !ok; tries++) {
      const honor = rng.next() < 0.25;
      if (honor || rng.next() < 0.45) {
        const k: K = honor ? { s: "z", r: 1 + rng.int(7) } : { s: pickSuit(), r: 1 + rng.int(9) };
        if (take(k, 3)) { bodies.push({ tiles: [k, k, k], type: "tri" }); ok = true; }
      } else {
        const s = pickSuit();
        const r = 1 + rng.int(7);
        const t: K[] = [{ s, r }, { s, r: r + 1 }, { s, r: r + 2 }];
        if (t.every((x) => (used.get(kk(x)) ?? 0) < 4)) {
          for (const x of t) take(x, 1);
          bodies.push({ tiles: t, type: "run" });
          ok = true;
        }
      }
    }
    if (!ok) return null;
  }
  let pair: K | null = null;
  for (let tries = 0; tries < 60 && pair === null; tries++) {
    const honor = rng.next() < 0.3;
    const k: K = honor ? { s: "z", r: 1 + rng.int(7) } : { s: pickSuit(), r: 1 + rng.int(9) };
    if (take(k, 2)) pair = k;
  }
  if (pair === null) return null;

  // 후로 만들기
  const melds: RefMeld[] = [];
  const handBodies: { tiles: K[]; type: "run" | "tri" }[] = [];
  for (const b of bodies) {
    const r = rng.next();
    if (r < 0.16) {
      melds.push({ kind: b.type === "run" ? "chi" : "pon", tiles: b.tiles });
    } else if (r < 0.24 && b.type === "tri" && (used.get(kk(b.tiles[0] as K)) ?? 0) <= 3) {
      const k = b.tiles[0] as K;
      used.set(kk(k), 4);
      const kind = rng.next() < 0.5 ? "kan_closed" : rng.next() < 0.5 ? "kan_open" : "kan_added";
      melds.push({ kind: kind as RefMeld["kind"], tiles: [k, k, k, k] });
    } else handBodies.push(b);
  }
  const hand = [...handBodies.flatMap((b) => b.tiles), pair, pair];
  // 화료패: 손패 안에서 고른다
  const winTile = hand[rng.int(hand.length)] as K;
  const closed = melds.every((m) => m.kind === "kan_closed");
  return { hand, melds, winTile, closed };
}

function toCtx(g: Gen, rng: Prng): { ref: RefCtx; eng: WinContext } {
  const winType: "tsumo" | "ron" = rng.next() < 0.5 ? "tsumo" : "ron";
  const seatWind = 1 + rng.int(4);
  const roundWind = 1 + rng.int(2);
  const riichi = g.closed && rng.next() < 0.4
    ? { double: rng.next() < 0.2, ippatsu: rng.next() < 0.3 }
    : null;
  const doraN = rng.int(3);
  const dora: K[] = [];
  for (let i = 0; i < doraN; i++) {
    const s = rng.next() < 0.8 ? SUITS[rng.int(3)] as K["s"] : "z";
    dora.push({ s, r: s === "z" ? 1 + rng.int(7) : 1 + rng.int(9) });
  }
  const ura: K[] = riichi !== null && rng.next() < 0.5 ? [{ s: SUITS[rng.int(3)] as K["s"], r: 1 + rng.int(9) }] : [];
  const red = rng.int(2);
  const isDealer = seatWind === 1;
  const flags: RefCtx["flags"] = {};
  const f = rng.next();
  if (f < 0.05) flags.haitei = true;
  else if (f < 0.1) flags.houtei = true;
  else if (f < 0.15) flags.rinshan = true;
  else if (f < 0.2) flags.chankan = true;

  const ref: RefCtx = {
    hand: g.hand, melds: g.melds, winTile: g.winTile, winType,
    seatWind, roundWind, riichi, flags, dora, ura, red, isDealer,
  };
  const eng: WinContext = {
    hand: g.hand.map(toTK),
    melds: g.melds.map((m): MeldInfo => ({ kind: m.kind, tiles: m.tiles.map(toTK) })),
    winningTile: toTK(g.winTile),
    winType,
    seatWind,
    prevalentWind: roundWind,
    riichi,
    flags,
    doraKinds: dora.map(toTK),
    uraDoraKinds: ura.map(toTK),
    redCount: red,
  };
  return { ref, eng };
}

const handStr = (c: RefCtx): string =>
  `hand=[${c.hand.map(kk).join(" ")}] melds=[${c.melds.map((m) => `${m.kind}:${m.tiles.map(kk).join("")}`).join(" ")}] win=${kk(c.winTile)} ${c.winType} seat=${c.seatWind} round=${c.roundWind} riichi=${JSON.stringify(c.riichi)} flags=${JSON.stringify(c.flags)} dora=[${c.dora.map(kk).join(" ")}] ura=[${c.ura.map(kk).join(" ")}] red=${c.red}`;

function main(): void {
  const n = Number(process.argv[2] ?? 20000);
  const seed = Number(process.argv[3] ?? 1);
  const rng = new Prng(seed);
  const stats: Record<string, number> = {};
  const samples = new Map<string, string[]>();
  const add = (kind: string, detail: string): void => {
    stats[kind] = (stats[kind] ?? 0) + 1;
    const arr = samples.get(kind) ?? [];
    if (arr.length < 3) { arr.push(detail); samples.set(kind, arr); }
  };
  let evaluated = 0;
  for (let i = 0; i < n; i++) {
    const g = genHand(rng);
    if (g === null) continue;
    const { ref, eng } = toCtx(g, rng);
    const e = evaluateWin(eng, registry);
    const r = refEvaluate(ref, "engine");
    if (e === null && r === null) continue;
    if (e === null || r === null) {
      add("SHAPE_DISAGREE", `engine=${e === null ? "null" : "ok"} ref=${r === null ? "null" : "ok"} ${handStr(ref)}`);
      continue;
    }
    evaluated++;
    if (e.yakumanCount !== r.yakumanCount) {
      add("YAKUMAN", `engine=${e.yakumanCount}[${e.yaku.map((y) => y.id).join(",")}] ref=${r.yakumanCount}[${r.yaku.map((y) => y.id).join(",")}] ${handStr(ref)}`);
      continue;
    }
    if (e.ok !== r.ok) {
      add("OK_DIFF", `engine.ok=${e.ok}[${e.yaku.map((y) => y.id).join(",")}] ref.ok=${r.ok}[${r.yaku.map((y) => y.id).join(",")}] ${handStr(ref)}`);
      continue;
    }
    if (!e.ok) continue;
    if (e.yakumanCount === 0) {
      if (e.han !== r.han) {
        add("HAN", `engine=${e.han}[${e.yaku.map((y) => `${y.id}:${y.han}`).join(",")}|d${e.doraHan}u${e.uraHan}r${e.redHan}] ref=${r.han}[${r.yaku.map((y) => `${y.id}:${y.han}`).join(",")}|d${r.dora}u${r.ura}r${r.red}] ${handStr(ref)}`);
        continue;
      }
      const ids = new Set(e.yaku.map((y) => y.id));
      const rids = new Set(r.yaku.map((y) => y.id));
      const onlyE = [...ids].filter((x) => !rids.has(x));
      const onlyR = [...rids].filter((x) => !ids.has(x));
      if (onlyE.length > 0 || onlyR.length > 0) {
        add("YAKUSET", `engineOnly=[${onlyE.join(",")}] refOnly=[${onlyR.join(",")}] ${handStr(ref)}`);
      }
      if (e.fu !== r.fu) {
        const pe = calculateScore({ han: e.han, fu: e.fu, yakumanCount: 0, isDealer: ref.isDealer, winType: ref.winType }).total;
        add(pe !== r.points ? "FU_POINTS" : "FU_ONLY", `engine=${e.fu}fu/${pe}점 ref=${r.fu}fu/${r.points}점 han=${e.han} wait=${e.waitType}/${r.wait} yaku=[${e.yaku.map((y) => y.id).join(",")}] ${handStr(ref)}`);
        continue;
      }
    }
    const es = calculateScore({ han: e.han, fu: e.fu, yakumanCount: e.yakumanCount, isDealer: ref.isDealer, winType: ref.winType });
    if (es.total !== r.points) {
      add("POINTS", `engine=${es.total} ref=${r.points} han=${e.han} fu=${e.fu} ym=${e.yakumanCount} dealer=${ref.isDealer} ${ref.winType}`);
    }
    // 최댓값 변형 선택 검사
    const best = refEvaluate(ref, "points");
    if (best !== null && best.points > r.points) {
      add("NOT_MAXIMAL", `engineRule=${r.points}(${r.han}h${r.fu}f ${r.yaku.map((y) => y.id).join(",")}) best=${best.points}(${best.han}h${best.fu}f ${best.yaku.map((y) => y.id).join(",")}) ${handStr(ref)}`);
    }
  }
  console.log(`evaluated=${evaluated} / tried=${n}`);
  console.log(JSON.stringify(stats, null, 1));
  for (const [k, arr] of samples) {
    console.log(`\n--- ${k} ---`);
    for (const d of arr) console.log(`  ${d}`);
  }
}

main();
