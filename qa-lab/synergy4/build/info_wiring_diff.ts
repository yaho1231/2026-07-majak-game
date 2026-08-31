/**
 * **배선 전 vs 배선 후**를 카드별로 나란히 놓는다 (docs/51 봇 정보 배선).
 *
 *   INFO_BEFORE=... INFO_AFTER=... tsx qa-lab/synergy4/build/info_wiring_diff.ts
 *
 * 이 작업의 성공 기준은 «점수가 올랐다»가 아니다 — 해상도가 카드 효과보다 굵어
 * 점수차의 부호조차 대개 말할 수 없다(docs/50 §2). 기준은 **«완전동일 판이
 * 사라지는가»** 하나다: 그 시드에서 점수·국 수·화료 수가 미보유와 한 자리도 다르지
 * 않다면 그 카드는 그 판에 아무 흔적도 남기지 않은 것이고, 그것이 A-14가 지목한 결함이다.
 *
 * 함께 «봇이 약해지지 않았는가»도 본다 — 카드를 든 좌석(p0)의 화료·방총·순위가
 * 배선 전후로 어떻게 움직였는지, 그리고 **대조군(none)이 정말 한 자리도 안
 * 바뀌었는지**(= 정보가 없으면 종전 경로 그대로인지)를 확인한다.
 */
import { readFileSync, readdirSync } from "node:fs";

interface Row {
  card: string; seed: number; score: number; rank: number; rounds: number;
  wins: number; winPts: number; dealIn: number; dealInPts: number; riichi: number;
}

function load(dir: string): Row[] {
  const rows: Row[] = [];
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".jsonl"))) {
    for (const line of readFileSync(`${dir}/${f}`, "utf8").split("\n")) {
      if (line.trim() === "") continue;
      try { rows.push(JSON.parse(line) as Row); } catch { /* 잘린 마지막 줄 */ }
    }
  }
  return rows;
}

const mean = (a: number[]): number => (a.length === 0 ? 0 : a.reduce((x, y) => x + y, 0) / a.length);
const sd = (a: number[]): number => {
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, a.length - 1));
};

interface Side { same: number; n: number; d: number[]; dw: number[]; dd: number[]; dr: number[] }

function summarize(rows: Row[]): { byCard: Map<string, Side>; base: Map<number, Row> } {
  const base = new Map<number, Row>();
  for (const r of rows) if (r.card === "none") base.set(r.seed, r);
  const byCard = new Map<string, Side>();
  for (const r of rows) {
    if (r.card === "none") continue;
    const b = base.get(r.seed);
    if (b === undefined) continue;
    const s = byCard.get(r.card) ?? { same: 0, n: 0, d: [], dw: [], dd: [], dr: [] };
    s.n++;
    if (r.score === b.score && r.rounds === b.rounds && r.wins === b.wins) s.same++;
    s.d.push(r.score - b.score);
    s.dw.push(r.wins - b.wins);
    s.dd.push(r.dealIn - b.dealIn);
    s.dr.push(r.rank - b.rank);
    byCard.set(r.card, s);
  }
  return { byCard, base };
}

const beforeDir = process.env["INFO_BEFORE"] ?? "qa-lab/synergy4/build/info_out";
const afterDir = process.env["INFO_AFTER"] ?? "qa-lab/synergy4/build/info_out_after";
const A = summarize(load(beforeDir));
const B = summarize(load(afterDir));

// 시드가 양쪽에 다 있는 카드만 비교한다 (중간에 끊긴 실행을 조용히 섞지 않는다)
const cards = [...B.byCard.keys()].filter((c) => A.byCard.has(c)).sort();

console.log("카드 | 완전동일 전 → 후 | 평균점수차(후) ±se | 화료차 | 방총차 | 순위차");
for (const c of cards) {
  const a = A.byCard.get(c) as Side;
  const b = B.byCard.get(c) as Side;
  const se = sd(b.d) / Math.sqrt(Math.max(1, b.d.length));
  console.log(
    `${c} | ${a.same}/${a.n} → ${b.same}/${b.n}` +
    ` | ${mean(b.d) >= 0 ? "+" : ""}${mean(b.d).toFixed(0)} ±${se.toFixed(0)}` +
    ` | ${mean(b.dw).toFixed(2)} | ${mean(b.dd).toFixed(2)} | ${mean(b.dr).toFixed(2)}`,
  );
}

/*
 * **대조군은 한 자리도 달라지면 안 된다.** 정보 증강이 없는 좌석에서 판단이 바뀌면
 * 이번 변경이 «정보를 읽는 자리»를 넘어 봇 정책 전체를 건드렸다는 뜻이다.
 */
let noneSame = 0;
let noneTotal = 0;
for (const [seed, a] of A.base) {
  const b = B.base.get(seed);
  if (b === undefined) continue;
  noneTotal++;
  if (a.score === b.score && a.rounds === b.rounds && a.wins === b.wins) noneSame++;
}
console.log(`\n대조군(none) 전후 완전동일: ${noneSame}/${noneTotal}  ← 전부 같아야 한다`);

// 보유 좌석(p0)의 전반 지표 — 약해지지 않았는가
const agg = (S: Map<string, Side>): string => {
  const d: number[] = []; const dw: number[] = []; const dd: number[] = []; const dr: number[] = [];
  for (const c of cards) {
    const s = S.get(c) as Side;
    d.push(...s.d); dw.push(...s.dw); dd.push(...s.dd); dr.push(...s.dr);
  }
  return `점수 ${mean(d) >= 0 ? "+" : ""}${mean(d).toFixed(0)} ±${(sd(d) / Math.sqrt(d.length)).toFixed(0)}` +
    ` · 화료 ${mean(dw).toFixed(3)} · 방총 ${mean(dd).toFixed(3)} · 순위 ${mean(dr).toFixed(3)} (n=${d.length})`;
};
console.log(`\n보유 좌석 합산 (미보유 대비)\n  배선 전 : ${agg(A.byCard)}\n  배선 후 : ${agg(B.byCard)}`);
