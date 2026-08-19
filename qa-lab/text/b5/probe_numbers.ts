/**
 * 문구에 적힌 숫자를 하나씩 실측한다 (b5 배치).
 * 실행: /Users/skul/majak/node_modules/.bin/tsx qa-lab/text/b5/probe_numbers.ts
 */
import { Prng, calculateScore } from "@majak/core";

const say = (s: string): void => {
  console.log(s);
};

// ── ① 일확천금 룰렛 가중치: 0.5배 30% · 1배 30% · 2배 30% · 3배 10% ──────────
{
  const W = [
    { m: 0.5, w: 30 },
    { m: 1, w: 30 },
    { m: 2, w: 30 },
    { m: 3, w: 10 },
  ];
  const TOTAL = 100;
  const count = new Map<number, number>();
  const prng = new Prng(12345);
  const N = 200000;
  for (let i = 0; i < N; i++) {
    let roll = prng.int(TOTAL);
    let mult = 1;
    for (const x of W) {
      if (roll < x.w) {
        mult = x.m;
        break;
      }
      roll -= x.w;
    }
    count.set(mult, (count.get(mult) ?? 0) + 1);
  }
  say("① 일확천금 룰렛 실측 (N=200,000)");
  for (const m of [0.5, 1, 2, 3]) {
    say(`   ${m}배 = ${(((count.get(m) ?? 0) / N) * 100).toFixed(2)}%`);
  }
}

// ── ② 뚫린 천장: 8판=만관 2.5개, 11판=4개, 13판=5개 ─────────────────────────
{
  const MANGAN_BASE = 2000;
  const base = (han: number): number =>
    han < 5 ? 0 : MANGAN_BASE + (han - 5) * (MANGAN_BASE / 2);
  say("② 뚫린 천장 기본점 (만관 기본점 2000 기준)");
  for (const han of [5, 6, 8, 11, 13]) {
    say(`   ${han}판 base=${base(han)} = 만관 ${base(han) / MANGAN_BASE}개`);
  }
  // 만관 아래 상한 해제 — 4판 40부
  const std = calculateScore({ han: 4, fu: 40, isDealer: false, winType: "ron" });
  const unc = Math.ceil(40 * 2 ** 6 * 4 / 100) * 100;
  say(`   4판40부 자 론: 표준=${std.total}(limit=${std.limit}) 상한해제=${unc}`);
}

// ── ③ 가불 인생 폭발 게이트: WinInfo.limit !== null 이 "만관 이상"인가 ────────
{
  say("③ 가불 인생 — limit 판정표 (자 론)");
  for (const [han, fu] of [
    [3, 30],
    [4, 30],
    [4, 40],
    [3, 70],
    [5, 30],
  ] as [number, number][]) {
    const s = calculateScore({ han, fu, isDealer: false, winType: "ron" });
    say(`   ${han}판${fu}부 → total=${s.total} limit=${String(s.limit)} 폭발=${s.limit !== null}`);
  }
}

// ── ④ 카르마: 1인당 = 게이지÷3을 100점 단위 내림 ────────────────────────────
{
  say("④ 카르마 1인당 몫");
  for (const g of [8000, 9100, 12000, 25000]) {
    const per = Math.floor(g / 3 / 100) * 100;
    say(`   게이지 ${g} → 1인당 ${per} · 최대 회수 ${per * 3} (소멸 ${g - per * 3})`);
  }
}
