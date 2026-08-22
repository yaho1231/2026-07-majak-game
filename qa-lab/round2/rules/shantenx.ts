/**
 * shantenx.ts — shantenOf(13장)==0 ⟺ winningKinds().length>0 교차검증 (증강 없음).
 * 텐파이 근처 손을 일부러 만든다: 완성형에서 1장 빼고, 그중 절반은 무작위 1장을 더 바꾼다.
 * (노텐 벌부는 winningKinds, 관전/봇 표시는 shantenOf 를 쓰므로 둘이 갈라지면 버그다.)
 */
import { shantenOf, winningKinds, Prng, kindKey } from "@majak/core";
import type { TileKind } from "@majak/core";

const rng = new Prng(Number(process.argv[3] ?? 4242));
const S = ["man", "pin", "sou"] as const;
const rand = (): TileKind => {
  const r = rng.int(34);
  return r < 27 ? { suit: S[Math.floor(r / 9)]!, rank: (r % 9) + 1 }
    : r < 31 ? { suit: "wind", rank: r - 26 } : { suit: "dragon", rank: r - 30 };
};

function complete(melds: number): TileKind[] | null {
  const cnt = new Map<string, number>();
  const add = (k: TileKind): boolean => {
    const c = cnt.get(kindKey(k)) ?? 0; if (c >= 4) return false;
    cnt.set(kindKey(k), c + 1); return true;
  };
  const out: TileKind[] = [];
  for (let i = 0; i < 4 - melds; i++) {
    let ok = false;
    for (let tr = 0; tr < 30 && !ok; tr++) {
      if (rng.next() < 0.45) {
        const k = rand();
        const snap = new Map(cnt);
        if (add(k) && add(k) && add(k)) { out.push(k, k, k); ok = true; } else { cnt.clear(); for (const [a, b] of snap) cnt.set(a, b); }
      } else {
        const s = S[rng.int(3)]!; const r = 1 + rng.int(7);
        const t: TileKind[] = [{ suit: s, rank: r }, { suit: s, rank: r + 1 }, { suit: s, rank: r + 2 }];
        const snap = new Map(cnt);
        if (t.every(add)) { out.push(...t); ok = true; } else { cnt.clear(); for (const [a, b] of snap) cnt.set(a, b); }
      }
    }
    if (!ok) return null;
  }
  for (let tr = 0; tr < 30; tr++) {
    const k = rand(); const snap = new Map(cnt);
    if (add(k) && add(k)) { out.push(k, k); return out; }
    cnt.clear(); for (const [a, b] of snap) cnt.set(a, b);
  }
  return null;
}

let bad = 0, tenpai = 0, made = 0;
const N = Number(process.argv[2] ?? 50000);
for (let it = 0; it < N; it++) {
  const melds = rng.int(3);
  const full = complete(melds);
  if (full === null) continue;
  const hand = [...full];
  hand.splice(rng.int(hand.length), 1);       // 13장(후로 제외분) → 텐파이
  if (rng.next() < 0.5) hand[rng.int(hand.length)] = rand();  // 절반은 흐트러뜨린다
  made++;
  const sh = shantenOf(hand, melds);
  const w = winningKinds(hand, melds);
  if (sh === 0) tenpai++;
  if ((sh === 0) !== (w.length > 0)) {
    bad++;
    if (bad <= 5) console.log(`MISMATCH shanten=${sh} waits=[${w.map(kindKey).join(",")}] melds=${melds} hand=${hand.map(kindKey).join(" ")}`);
  }
}
console.log(`생성 ${made} · 텐파이 ${tenpai} · 불일치 ${bad}`);
