/**
 * joker detail: "무엇이 될지는 고르지 않는다. 화료하는 순간 백이 될 수 있는 모든 패를 따져
 *                **가장 높은 점수가 나오는 형태가 자동으로 채택**된다."
 *
 * 검증: 조커(wildKinds=[白])로 채점한 결과 R 과,
 *       白을 34종 각각으로 **직접 바꿔 넣고** 채점한 결과 중 최고 점수를 비교한다.
 *       R < max 면 "가장 높은 점수"라는 약속이 깨진 것이다.
 */
import {
  Prng,
  YakuRegistry,
  calculateScore,
  evaluateWin,
  kindKey,
  registerStandardYaku,
} from "@majak/core";
import type { TileKind, WinContext } from "@majak/core";

const reg = new YakuRegistry();
registerStandardYaku(reg);

const HAKU: TileKind = { suit: "dragon", rank: 1 };
const ALL: TileKind[] = [];
for (const s of ["man", "pin", "sou"] as const)
  for (let r = 1; r <= 9; r++) ALL.push({ suit: s, rank: r });
for (let r = 1; r <= 4; r++) ALL.push({ suit: "wind", rank: r });
for (let r = 1; r <= 3; r++) ALL.push({ suit: "dragon", rank: r });

const show = (ks: readonly TileKind[]): string =>
  ks.map((k) => `${k.rank}${k.suit[0]}`).join(" ");

function ctxOf(
  hand: TileKind[],
  winning: TileKind,
  wild: boolean,
  seat = 1,
): WinContext {
  return {
    hand,
    melds: [],
    winningTile: winning,
    winType: "tsumo",
    seatWind: seat,
    prevalentWind: 1,
    riichi: null,
    doraKinds: [],
    uraDoraKinds: [],
    redCount: 0,
    options: wild ? { wildKinds: [HAKU] } : {},
    winnerId: "p0",
  } as unknown as WinContext;
}

function pointsOf(
  r: { han: number; fu: number; yakumanCount: number; ok?: boolean } | null,
): number {
  if (r === null || r.ok === false) return -1;
  return calculateScore({
    han: r.han,
    fu: r.fu,
    yakumanCount: r.yakumanCount,
    isDealer: false,
    winType: "tsumo",
  }).total;
}

/** 무작위 표준 화료형 14장 (멘젠) */
function randomWin(rng: Prng): TileKind[] {
  const counts = new Map<string, number>();
  const out: TileKind[] = [];
  const push = (k: TileKind): boolean => {
    const n = counts.get(kindKey(k)) ?? 0;
    if (n >= 4) return false;
    counts.set(kindKey(k), n + 1);
    out.push(k);
    return true;
  };
  for (let s = 0; s < 4; s++) {
    for (let tries = 0; tries < 40; tries++) {
      const useRun = rng.int(2) === 0;
      const snapshot = out.length;
      if (useRun) {
        const suit = (["man", "pin", "sou"] as const)[rng.int(3)]!;
        const r = 1 + rng.int(7);
        if (push({ suit, rank: r }) && push({ suit, rank: r + 1 }) && push({ suit, rank: r + 2 }))
          break;
      } else {
        const k = ALL[rng.int(ALL.length)]!;
        if (push(k) && push(k) && push(k)) break;
      }
      while (out.length > snapshot) {
        const bad = out.pop() as TileKind;
        counts.set(kindKey(bad), (counts.get(kindKey(bad)) ?? 1) - 1);
      }
    }
  }
  for (let tries = 0; tries < 40; tries++) {
    const k = ALL[rng.int(ALL.length)]!;
    const snapshot = out.length;
    if (push(k) && push(k)) break;
    while (out.length > snapshot) {
      const bad = out.pop() as TileKind;
      counts.set(kindKey(bad), (counts.get(kindKey(bad)) ?? 1) - 1);
    }
  }
  return out.length === 14 ? out : [];
}

const rng = new Prng(20260820);
let checked = 0;
let bad = 0;
for (let iter = 0; iter < 40000; iter++) {
  const full = randomWin(rng);
  if (full.length !== 14) continue;
  // 白이 아닌 자리를 하나 골라 白으로 바꾼다 (조커가 그 자리를 메운다)
  const idx = rng.int(14);
  if (kindKey(full[idx] as TileKind) === kindKey(HAKU)) continue;
  const hand = full.map((k, i) => (i === idx ? HAKU : k));
  const winning = hand[13] as TileKind;
  if (kindKey(winning) === kindKey(HAKU)) continue;
  const jr = evaluateWin(ctxOf(hand, winning, true), reg);
  if (jr === null || jr.ok === false) continue;
  checked++;
  const jp = pointsOf(jr);

  let bestP = -1;
  let bestK: TileKind | null = null;
  let bestR: typeof jr = null;
  for (const k of ALL) {
    const sub = hand.map((x, i) => (i === idx ? k : x));
    const r = evaluateWin(ctxOf(sub, winning, false), reg);
    const p = pointsOf(r);
    if (p > bestP) {
      bestP = p;
      bestK = k;
      bestR = r;
    }
  }
  if (bestP > jp) {
    bad++;
    if (bad <= 5) {
      console.log(`\nBUG #${bad}  손패(白 포함) = ${show(hand)}  화료패=${show([winning])}`);
      console.log(
        `  조커 채점  : [${jr.yaku.map((y) => `${y.id}:${y.han}`).join(" ")}] han=${jr.han} fu=${jr.fu} ym=${jr.yakumanCount} → ${jp}점`,
      );
      console.log(
        `  최고 형태  : 白 → ${show([bestK as TileKind])} [${(bestR?.yaku ?? []).map((y) => `${y.id}:${y.han}`).join(" ")}] han=${bestR?.han} fu=${bestR?.fu} ym=${bestR?.yakumanCount} → ${bestP}점`,
      );
      console.log(`  차이: ${bestP - jp}점`);
    }
  }
}
console.log(`\n검사한 조커 화료 ${checked}건 / "가장 높은 점수"가 아닌 것 ${bad}건`);
