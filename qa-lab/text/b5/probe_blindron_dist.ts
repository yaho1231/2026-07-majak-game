/**
 * 눈먼 총알 — "네 명 중 무작위 … 보유자도 25%로 맞는다"의 실제 분포.
 * blind_ron.ts:106-111 과 **같은 식**으로 대상을 뽑아 본다
 *   new Prng((seed ^ hash(`blind_ron:{roundKey}:{shooter}`)) >>> 0).int(4)
 * 실행: ~/majak/node_modules/.bin/tsx qa-lab/text/b5/probe_blindron_dist.ts
 */
import { Prng } from "@majak/core";

const say = (s: string): void => {
  console.log(s);
};

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const seats = ["p0", "p1", "p2", "p3"];
const winds = [1, 2];
const rounds = [1, 2, 3, 4];
const honbas = [0, 1, 2, 3];

const count = [0, 0, 0, 0];
let n = 0;
const selfHit = { hit: 0, total: 0 };
for (let seed = 0; seed < 4000; seed++) {
  for (const w of winds)
    for (const r of rounds)
      for (const hb of honbas)
        for (const shooter of seats) {
          const key = `blind_ron:${w}-${r}-${hb}:${shooter}`;
          const prng = new Prng((seed ^ hashString(key)) >>> 0);
          const idx = prng.int(4);
          count[idx]!++;
          n++;
          selfHit.total++;
          if (seats[idx] === shooter) selfHit.hit++;
        }
}
say(`표본 ${n}`);
seats.forEach((s, i) => {
  say(`  ${s} = ${((count[i]! / n) * 100).toFixed(2)}%`);
});
say(`  쏜 사람 자신이 뽑힐 확률 = ${((selfHit.hit / selfHit.total) * 100).toFixed(2)}% (기대 25%)`);
