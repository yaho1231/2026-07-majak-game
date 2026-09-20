/**
 * studyReport — `studyCli`가 만든 JSON을 사람이 읽는 마크다운 표로 옮긴다.
 *
 *   node --import tsx/esm packages/server/src/study/studyReport.ts study.json [--tier top] > report.md
 *
 * 표마다 «사람 p (n)» 옆에 «봇 p»를 나란히 둔다 — 같은 자리에서 잰 값이라 직접 견줄 수 있다.
 */
import { readFileSync } from "node:fs";
import type { Cell } from "./tally.js";

type Table = Record<string, Cell>;
interface Study {
  files: number; failed: number; points: number; timeMs: number;
  riichi: Table; riichiBot: Table; call: Table; callBot: Table; callKind: Table;
  defense: Table; defenseBot: Table; discardAgree: Table; discardConf: Table; discardLoss: Table;
  augUse: Table; augUseBot: Table; augTurn: Table; augOwner: Record<string, string[]>;
  draft: Table; draftBot: Table; draftAgree: Table; outcome: Table; dealIn: Table; kanUse: Table; agree: Table;
}

const path = process.argv[2] as string;
const tierArg = ((): string | undefined => { const i = process.argv.indexOf("--tier"); return i >= 0 ? process.argv[i + 1] : undefined; })();
const s = JSON.parse(readFileSync(path, "utf-8")) as Study;

const pct = (c: Cell | undefined): string => (c === undefined || c.n === 0 ? "—" : `${((100 * c.k) / c.n).toFixed(0)}%`);
const pn = (c: Cell | undefined): string => (c === undefined || c.n === 0 ? "—" : `${((100 * c.k) / c.n).toFixed(0)}% (${c.n})`);
const avg = (c: Cell | undefined): string => (c === undefined || c.n === 0 ? "—" : (c.sum / c.n).toFixed(2));
const out: string[] = [];
const p = (line = ""): void => { out.push(line); };

function key(...dims: [string, string][]): string {
  return dims.map(([a, b]) => `${a}=${b}`).join("|");
}
/** 계층 필터 — `--tier`가 있으면 그 계층 셀만, 없으면 전체(`*`·주변부) */
function cellOf(t: Table, dims: [string, string][]): Cell | undefined {
  if (tierArg !== undefined) return t[key(["tier", tierArg], ...dims)];
  return t[dims.length === 0 ? "*" : key(...dims)];
}
function row2(t: Table, tb: Table, a: [string, string], b: [string, string]): string {
  const h = tierArg !== undefined ? t[key(["tier", tierArg], a, b)] : t[key(a, b)];
  const bot = tierArg !== undefined ? tb[key(["tier", tierArg], a, b)] : tb[key(a, b)];
  return `${pn(h)} / ${pct(bot)}`;
}
function grid(title: string, t: Table, tb: Table, rowDim: string, rows: string[], colDim: string, cols: string[]): void {
  p(`### ${title}`);
  p();
  p(`| ${rowDim} \\ ${colDim} | ${cols.join(" | ")} |`);
  p(`|---|${cols.map(() => "---").join("|")}|`);
  for (const r of rows) {
    p(`| ${r} | ${cols.map((c) => row2(t, tb, [rowDim, r], [colDim, c])).join(" | ")} |`);
  }
  p();
}
function margin(title: string, t: Table, tb: Table, dim: string, vals: string[]): void {
  p(`**${title}** — ` + vals.map((v) => `${v}: ${pn(cellOf(t, [[dim, v]]))} / ${pct(cellOf(tb, [[dim, v]]))}`).join(" · "));
  p();
}

const TURNS = ["early", "mid", "late"];
const SH = ["0", "1", "2", "3+"];
const TIERS = ["top", "mid", "low", "few", "unknown"];

p(`# 리플레이 연구 결과 ${tierArg !== undefined ? `(계층: ${tierArg})` : "(전체)"}`);
p();
p(`파일 ${s.files} (실패 ${s.failed}) · 결정 지점 ${s.points} · ${(s.timeMs / 1000).toFixed(0)}초. 표기: **사람 p (n) / 그림자 봇 p**.`);
p();

p(`## 1. 일치율 (같은 자리에서 봇이 같은 수를 골랐는가)`);
p();
p(`| 계층 | 턴(버림·리치·증강 전부 동일) | 리액션(울음 여부 동일) | 드래프트(같은 픽) |`);
p(`|---|---|---|---|`);
for (const t of TIERS) p(`| ${t} | ${pn(s.agree[`turn|${t}`])} | ${pn(s.agree[`reaction|${t}`])} | ${pn(s.draftAgree[t])} |`);
p();
p(`버림 종류 일치(샹텐 × 순목):`);
p();
grid("버림 일치율", s.discardAgree, s.discardAgree, "sh", SH, "turn", TURNS);
grid("버림 일치율 (샹텐 × 위협)", s.discardAgree, s.discardAgree, "sh", SH, "threat", ["none", "some", "riichi"]);

p(`## 2. 리치 — P(리치 | 리치 가능)`);
p();
margin("전체", s.riichi, s.riichiBot, "tier", TIERS);
grid("대기 장수 × 순목", s.riichi, s.riichiBot, "wait", ["1-3", "4-7", "8+"], "turn", TURNS);
grid("손 값 × 순목", s.riichi, s.riichiBot, "pts", ["<2k", "2-4k", "4-8k", "8k+"], "turn", TURNS);
grid("대기 장수 × 위협", s.riichi, s.riichiBot, "wait", ["1-3", "4-7", "8+"], "threat", ["none", "some", "riichi"]);
margin("오야", s.riichi, s.riichiBot, "dealer", ["dealer", "nondealer"]);
margin("순위", s.riichi, s.riichiBot, "rank", ["1", "2", "3", "4"]);

p(`## 3. 후로 — P(울음 | 기회)`);
p();
margin("전체", s.call, s.callBot, "tier", TIERS);
grid("종류 × 샹텐(울기 전)", s.call, s.callBot, "kind", ["yakuhai", "pon", "chi"], "sh", SH);
grid("종류 × 순목", s.call, s.callBot, "kind", ["yakuhai", "pon", "chi"], "turn", TURNS);
grid("종류 × 멘젠", s.call, s.callBot, "kind", ["yakuhai", "pon", "chi"], "menzen", ["menzen", "open"]);
grid("샹텐 × 멘젠", s.call, s.callBot, "sh", SH, "menzen", ["menzen", "open"]);
margin("도라 포함", s.call, s.callBot, "dora", ["dora", "plain"]);
margin("오야", s.call, s.callBot, "dealer", ["dealer", "nondealer"]);
margin("위협", s.call, s.callBot, "threat", ["none", "some", "riichi"]);
p(`실제로 운 종류: ` + Object.entries(s.callKind).map(([k, c]) => `${k} ${c.n}`).join(" · "));
p();

p(`## 4. 수비 — 상대 리치(위협 ≥ 0.8)일 때 버림의 안전도`);
p();
p(`k = 현물 비율, 표 값 = 현물률 (n) / 봇 현물률`);
p();
margin("전체", s.defense, s.defenseBot, "tier", TIERS);
margin("위협 출처", s.defense, s.defenseBot, "src", ["riichi", "open"]);
grid("출처 × 샹텐 (현물률)", s.defense, s.defenseBot, "src", ["riichi", "open"], "sh", SH);
grid("출처 × 안전도 등급 (등급 점유율이 아니라 현물률 — 등급별 n을 보라)", s.defense, s.defenseBot, "src", ["riichi", "open"], "cls", ["genbutsu", "safe", "mid", "risky"]);
grid("내 샹텐 × 손 값 (현물률)", s.defense, s.defenseBot, "sh", SH, "pts", ["<2k", "2-4k", "4-8k", "8k+"]);
grid("내 샹텐 × 순목 (현물률)", s.defense, s.defenseBot, "sh", SH, "turn", TURNS);
p(`### 안전도 등급 분포 (샹텐별 · 사람 n / 봇 n)`);
p();
p(`| sh | genbutsu | safe(≥0.9) | mid(≥0.75) | risky |`);
p(`|---|---|---|---|---|`);
for (const sh of SH) {
  const cells = ["genbutsu", "safe", "mid", "risky"].map((c) => {
    const h = tierArg ? s.defense[key(["tier", tierArg], ["sh", sh], ["cls", c])] : s.defense[key(["sh", sh], ["cls", c])];
    const b = tierArg ? s.defenseBot[key(["tier", tierArg], ["sh", sh], ["cls", c])] : s.defenseBot[key(["sh", sh], ["cls", c])];
    return `${h?.n ?? 0} / ${b?.n ?? 0}`;
  });
  p(`| ${sh} | ${cells.join(" | ")} |`);
}
p();

p(`## 5. 버림 불일치 — 사람이 버린 종류 > 봇이 버린 종류 (상위)`);
p();
for (const thr of ["none", "some", "riichi"]) {
  const rows = Object.entries(s.discardConf)
    .filter(([k]) => k.startsWith(`${thr}|`) && k.includes(">"))
    .sort((a, b) => b[1].n - a[1].n)
    .slice(0, 12);
  const hs = Object.entries(s.discardConf).filter(([k]) => k.startsWith(`${thr}|h:`)).sort((a, b) => b[1].n - a[1].n);
  const bs = Object.entries(s.discardConf).filter(([k]) => k.startsWith(`${thr}|b:`)).sort((a, b) => b[1].n - a[1].n);
  p(`**위협 ${thr}** — 사람 쪽 분포: ${hs.map(([k, c]) => `${k.slice(thr.length + 3)} ${c.n}`).join(", ")}`);
  p();
  p(`봇 쪽 분포: ${bs.map(([k, c]) => `${k.slice(thr.length + 3)} ${c.n}`).join(", ")}`);
  p();
  p(`| 사람 > 봇 | n |`);
  p(`|---|---|`);
  for (const [k, c] of rows) p(`| ${k.slice(thr.length + 1)} | ${c.n} |`);
  p();
  const loss = Object.entries(s.discardLoss).filter(([k]) => k.startsWith(`${thr}|`));
  if (loss.length > 0) p(`불일치 시 기대실점 차(사람−봇, 평균): ` + loss.map(([k, c]) => `sh${k.slice(thr.length + 1)}: ${avg(c)} (사람이 더 위험 ${pct(c)}, n=${c.n})`).join(" · "));
  p();
}

p(`## 6. 증강 발동 — 증강별 P(발동 | 쓸 수 있음)`);
p();
p(`사람은 보유·잔여 횟수 기준, 봇은 같은 자리에서 그 증강의 옵션을 고른 비율(옵션→증강은 보유 교집합으로 추정).`);
p();
p(`| 증강 | 사람 (n) | 봇 | early / mid / late (사람) | (봇) | 사람 발동 중앙 순목 | 발동 시 평균 샹텐 | 위협 없음/있음 (사람) |`);
p(`|---|---|---|---|---|---|---|---|`);
const botByAug = new Map<string, Map<string, Cell>>();
for (const [k, c] of Object.entries(s.augUseBot)) {
  const m = /^type=([^|]+)(?:\|turn=(\w+))?$/.exec(k);
  if (m === null) continue;
  const owners = s.augOwner[m[1] as string] ?? [];
  if (owners.length !== 1) continue;
  const aug = owners[0] as string;
  const sub = botByAug.get(aug) ?? new Map<string, Cell>();
  const key2 = m[2] ?? "*";
  const cur = sub.get(key2) ?? { n: 0, k: 0, sum: 0 };
  cur.n += c.n; cur.k += c.k; cur.sum += c.sum;
  sub.set(key2, cur); botByAug.set(aug, sub);
}
const augIds = Object.keys(s.augUse).filter((k) => /^aug=[^|]+$/.test(k)).map((k) => k.slice(4));
augIds.sort((a, b) => (s.augUse[`aug=${b}`]?.n ?? 0) - (s.augUse[`aug=${a}`]?.n ?? 0));
for (const a of augIds) {
  const h = tierArg ? s.augUse[`aug=${a}|tier=${tierArg}`] : s.augUse[`aug=${a}`];
  if ((h?.n ?? 0) < 30) continue;
  const b = botByAug.get(a);
  const turnCells = TURNS.map((tb) => pct(s.augUse[`aug=${a}|turn=${tb}`])).join(" / ");
  const turnCellsB = TURNS.map((tb) => pct(b?.get(tb))).join(" / ");
  const turns: number[] = []; let shSum = 0; let shN = 0;
  for (const [k, c] of Object.entries(s.augTurn)) {
    if (!k.startsWith(`${a}|`)) continue;
    const turn = Number(k.slice(a.length + 1));
    for (let i = 0; i < c.n; i++) turns.push(turn);
    shSum += c.sum; shN += c.n;
  }
  turns.sort((x, y) => x - y);
  const med = turns.length > 0 ? String(turns[Math.floor(turns.length / 2)]) : "—";
  const thr = `${pct(s.augUse[`aug=${a}|threat=none`])} / ${pct(s.augUse[`aug=${a}|threat=riichi`])}`;
  p(`| ${a} | ${pn(h)} | ${pct(b?.get("*"))} | ${turnCells} | ${turnCellsB} | ${med} | ${shN > 0 ? (shSum / shN).toFixed(1) : "—"} | ${thr} |`);
}
p();

p(`## 7. 드래프트 — 증강별 P(픽 | 제시)`);
p();
const tierPick = tierArg ?? "top";
p(`계층 «${tierPick}» 사람 픽률 vs 같은 오퍼에서 봇 픽률. n ≥ 12만. 차이(사람−봇) 내림차순.`);
p();
p(`| 증강 | 사람 (n) | 봇 | 차이 |`);
p(`|---|---|---|---|`);
const augs = Object.keys(s.draft).filter((k) => /^aug=[^|]+$/.test(k)).map((k) => k.slice(4));
const rowsD = augs
  .map((a) => {
    const h = s.draft[`aug=${a}|tier=${tierPick}`]; const b = s.draftBot[`aug=${a}|tier=${tierPick}`];
    if (h === undefined || h.n < 12 || b === undefined) return null;
    return { a, h, b, d: h.k / h.n - b.k / b.n };
  })
  .filter((x): x is NonNullable<typeof x> => x !== null)
  .sort((x, y) => y.d - x.d);
for (const r of rowsD) p(`| ${r.a} | ${pn(r.h)} | ${pct(r.b)} | ${(100 * r.d).toFixed(0)}%p |`);
p();

p(`## 8. 국 결과 — 계층 × 진행 방식`);
p();
p(`| 계층 | 방식 | 국 수 | 화료율 | 방총률 | 평균 득실 |`);
p(`|---|---|---|---|---|---|`);
for (const t of TIERS) for (const st of ["riichi", "called", "quiet"]) {
  const w = s.outcome[`${t}|${st}|win`]; const d = s.outcome[`${t}|${st}|dealin`];
  if (w === undefined) continue;
  p(`| ${t} | ${st} | ${w.n} | ${pct(w)} | ${pct(d)} | ${(w.sum / w.n).toFixed(0)} |`);
}
p();
p(`## 9. 안깡·가깡 — P(깡 | 가능)`);
p();
margin("샹텐", s.kanUse, s.kanUse, "sh", SH);
margin("위협", s.kanUse, s.kanUse, "threat", ["none", "some", "riichi"]);

console.log(out.join("\n"));
