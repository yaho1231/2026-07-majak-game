/**
 * waitsprobe.ts — 무작위 손패의 **텐파이·대기패** 판정을 독립 구현과 대조한다.
 * (후리텐·노텐 벌부·리치 조건이 전부 이 판정 위에 서 있다)
 *
 * 사용: tsx qa-lab/round2/rules/waitsprobe.ts [손수] [시드]
 */
import { winningKinds, Prng, shantenOf } from "@majak/core";
import type { TileKind } from "@majak/core";
import { buildRefVariants } from "./ref.js";
import type { K } from "./ref.js";

const toTK = (k: K): TileKind =>
  k.s === "m" ? { suit: "man", rank: k.r }
  : k.s === "p" ? { suit: "pin", rank: k.r }
  : k.s === "s" ? { suit: "sou", rank: k.r }
  : k.r <= 4 ? { suit: "wind", rank: k.r } : { suit: "dragon", rank: k.r - 4 };

const ALL: K[] = [];
for (const s of ["m", "p", "s"] as const) for (let r = 1; r <= 9; r++) ALL.push({ s, r });
for (let r = 1; r <= 7; r++) ALL.push({ s: "z", r });

const kk = (k: K): string => `${k.s}${k.r}`;

/** 독립 구현: 이 14장이 화료형인가 (표준/치또이/국사) */
function refWinning(hand: K[], meldCount: number): boolean {
  return buildRefVariants({
    hand, melds: new Array(meldCount).fill(0).map(() => ({ kind: "pon" as const, tiles: [{ s: "z" as const, r: 1 }, { s: "z" as const, r: 1 }, { s: "z" as const, r: 1 }] })),
    winTile: hand[0] as K, winType: "ron", seatWind: 1, roundWind: 1,
    riichi: null, flags: {}, dora: [], ura: [], red: 0, isDealer: false,
  }).length > 0;
}

function main(): void {
  const n = Number(process.argv[2] ?? 20000);
  const seed = Number(process.argv[3] ?? 1);
  const rng = new Prng(seed);
  let mismatch = 0;
  let tenpai = 0;
  const samples: string[] = [];
  for (let i = 0; i < n; i++) {
    const meldCount = rng.next() < 0.6 ? 0 : rng.int(4);
    const size = 13 - 3 * meldCount;
    // 벽에서 뽑기 (같은 종류 최대 4장)
    const used = new Map<string, number>();
    const hand: K[] = [];
    // 텐파이가 자주 나오도록 좁은 무늬로 편향
    const narrow = rng.next() < 0.5;
    while (hand.length < size) {
      const k = narrow && rng.next() < 0.8
        ? ({ s: (["m", "p", "s"] as const)[rng.int(2)] as K["s"], r: 1 + rng.int(9) })
        : (ALL[rng.int(ALL.length)] as K);
      const c = used.get(kk(k)) ?? 0;
      if (c >= 4) continue;
      used.set(kk(k), c + 1);
      hand.push(k);
    }
    const engine = new Set(
      winningKinds(hand.map(toTK), meldCount).map((t) => kk({
        s: t.suit === "man" ? "m" : t.suit === "pin" ? "p" : t.suit === "sou" ? "s" : "z",
        r: t.suit === "dragon" ? t.rank + 4 : t.rank,
      } as K)),
    );
    const ref = new Set<string>();
    for (const cand of ALL) {
      if ((used.get(kk(cand)) ?? 0) >= 5) continue; // 5장째는 물리적으로 불가 (엔진도 안 본다)
      if (refWinning([...hand, cand], meldCount)) ref.add(kk(cand));
    }
    if (ref.size > 0) tenpai++;
    const onlyE = [...engine].filter((x) => !ref.has(x));
    const onlyR = [...ref].filter((x) => !engine.has(x));
    if (onlyE.length > 0 || onlyR.length > 0) {
      mismatch++;
      if (samples.length < 5) {
        samples.push(`melds=${meldCount} hand=[${hand.map(kk).join(" ")}] engineOnly=[${onlyE.join(",")}] refOnly=[${onlyR.join(",")}]`);
      }
    }
    // 샹텐 정합성: 텐파이면 shanten 0 이하
    const sh = shantenOf(hand.map(toTK), meldCount);
    if (ref.size > 0 && sh !== 0 && samples.length < 8) {
      samples.push(`SHANTEN: tenpai but shanten=${sh} melds=${meldCount} hand=[${hand.map(kk).join(" ")}]`);
    }
    if (ref.size === 0 && sh === 0 && samples.length < 8) {
      samples.push(`SHANTEN: shanten=0 but not tenpai melds=${meldCount} hand=[${hand.map(kk).join(" ")}]`);
    }
  }
  console.log(`tried=${n} tenpai=${tenpai} mismatch=${mismatch}`);
  for (const s of samples) console.log("  " + s);
}

main();
