/**
 * genPriors — `studyCli`의 JSON에서 봇이 읽는 **사람 성향 표**(`bot/human/priors.ts`)를 만든다.
 *
 *   node --import tsx/esm packages/server/src/study/genPriors.ts study.json [--tier top] > packages/server/src/bot/human/priors.ts
 *
 * 표에 들어가는 것은 «같은 자리에서 잰 사람 p와 그림자 봇 p»의 쌍이다 — 봇 모듈은 이
 * 둘의 차이만큼만 기울인다. 상위 계층(기본 `top`)만 쓴다: «사람처럼»의 기준은 잘 두는
 * 사람이고, 하위 계층의 실수를 배우지 않기 위해서다. 표본이 작은 셀(n < MIN_N)은 빼고,
 * 봇 모듈은 없는 셀을 «차이 0»으로 본다.
 */
import { readFileSync } from "node:fs";
import { contentAugments } from "@majak/content";
import type { Cell } from "./tally.js";

type Table = Record<string, Cell>;
const path = process.argv[2] as string;
const tierArg = ((): string => { const i = process.argv.indexOf("--tier"); return i >= 0 ? (process.argv[i + 1] as string) : "top"; })();
const s = JSON.parse(readFileSync(path, "utf-8")) as Record<string, Table> & { files: number; points: number };
const MIN_N = 40;

const p = (c: Cell | undefined): number | null => (c === undefined || c.n < MIN_N ? null : Math.round((1000 * c.k) / c.n) / 1000);
const key = (...dims: [string, string][]): string => dims.map(([a, b]) => `${a}=${b}`).join("|");
const t = (...dims: [string, string][]): string => `tier=${tierArg}|${key(...dims)}`;

const out: string[] = [];
out.push(`/**`);
out.push(` * priors — 리플레이에서 잰 **사람의 선택 분포** (생성물 — 손으로 고치지 않는다).`);
out.push(` *`);
out.push(` * 생성: \`study/genPriors.ts\` · 원본 ${path.split("/").pop()} · 파일 ${s.files}판 · 결정 지점 ${s.points} · 계층 ${tierArg} · ${new Date().toISOString().slice(0, 10)}`);
out.push(` *`);
out.push(` * 각 항목은 \`[사람 p, 봇 p]\` — 같은 결정 지점에서 사람이 그 수를 고른 비율과 그림자 봇`);
out.push(` * (균형형·기본 스위치)이 고른 비율이다. 봇 모듈(\`bot/human/*.ts\`)은 이 둘의 **차이**만큼`);
out.push(` * 기울인다. 표본 ${MIN_N} 미만인 셀은 없다(= 차이 0). 무엇을 어떻게 세었는지는 docs/57·58.`);
out.push(` */`);
out.push(``);
out.push(`export type Pair = readonly [human: number, bot: number];`);
out.push(``);

function emitTable(name: string, doc: string, h: Table, b: Table, keys: string[]): void {
  out.push(`/** ${doc} */`);
  out.push(`export const ${name}: Readonly<Record<string, Pair>> = {`);
  for (const k of keys) {
    const ph = p(h[t(...parse(k))]);
    const pb = p(b[t(...parse(k))]);
    if (ph === null || pb === null) continue;
    out.push(`  "${k}": [${ph}, ${pb}],`);
  }
  out.push(`};`);
  out.push(``);
}
function parse(k: string): [string, string][] {
  return k.split("|").map((part) => part.split("=") as [string, string]);
}
function cross(...axes: [string, string[]][]): string[] {
  let acc: string[] = [""];
  for (const [name, vals] of axes) {
    const next: string[] = [];
    for (const a of acc) for (const v of vals) next.push(a === "" ? `${name}=${v}` : `${a}|${name}=${v}`);
    acc = next;
  }
  return acc;
}

const TURNS = ["early", "mid", "late"];
const SH = ["0", "1", "2", "3+"];

// ── 리치: 대기 × 순목, 손 값 × 순목, 대기 × 위협 ──
emitTable("RIICHI_STYLE", "P(리치 | 리치 가능) — 키: wait=1-3|turn=early 등 (2축 주변부)", s["riichi"] as Table, s["riichiBot"] as Table, [
  ...cross(["wait", ["1-3", "4-7", "8+"]], ["turn", TURNS]),
  ...cross(["pts", ["<2k", "2-4k", "4-8k", "8k+"]], ["turn", TURNS]),
  ...cross(["wait", ["1-3", "4-7", "8+"]], ["threat", ["none", "some", "riichi"]]),
]);

// ── 후로: 종류 × 샹텐, 종류 × 멘젠, 샹텐 × 멘젠, 종류 × 순목 ──
emitTable("CALL_STYLE", "P(울음 | 기회) — 키: kind=yakuhai|sh=1 등", s["call"] as Table, s["callBot"] as Table, [
  ...cross(["kind", ["yakuhai", "pon", "chi"]], ["sh", SH]),
  ...cross(["kind", ["yakuhai", "pon", "chi"]], ["menzen", ["menzen", "open"]]),
  ...cross(["sh", SH], ["menzen", ["menzen", "open"]]),
  ...cross(["kind", ["yakuhai", "pon", "chi"]], ["turn", TURNS]),
]);

// ── 수비: 상대 리치 시 «현물» 비율 — 샹텐 × 순목, 샹텐 × 손 값 ──
emitTable("DEFENSE_STYLE", "상대 리치 시 P(현물 버림) — 키: sh=1|turn=mid 등", s["defense"] as Table, s["defenseBot"] as Table, [
  ...cross(["sh", SH], ["turn", TURNS]),
  ...cross(["sh", SH], ["pts", ["<2k", "2-4k", "4-8k", "8k+"]]),
]);

// ── 증강 발동: 증강별 전체·순목별 (봇 정책이 있는 증강만) ──
{
  const policyIds = new Set(contentAugments.filter((a) => a.bot !== undefined).map((a) => a.id));
  const owner = s["augOwner"] as unknown as Record<string, string[]>;
  const botByAug = new Map<string, Map<string, Cell>>();
  for (const [k, c] of Object.entries(s["augUseBot"] as Table)) {
    const m = /^type=([^|]+)(?:\|turn=(\w+))?$/.exec(k);
    if (m === null) continue;
    const owners = (owner[m[1] as string] ?? []).filter((id) => policyIds.has(id));
    if (owners.length !== 1) continue;
    const aug = owners[0] as string;
    const sub = botByAug.get(aug) ?? new Map<string, Cell>();
    const k2 = m[2] ?? "*";
    const cur = sub.get(k2) ?? { n: 0, k: 0, sum: 0 };
    cur.n += c.n; cur.k += c.k; cur.sum += c.sum;
    sub.set(k2, cur); botByAug.set(aug, sub);
  }
  out.push(`/**`);
  out.push(` * 증강별 P(발동 | 쓸 수 있음) — 전체와 순목(early/mid/late)별. 사람 쪽은 «보유 + 잔여 횟수 + 그 증강의`);
  out.push(` * 옵션이 제시됨», 봇 쪽은 «그 증강의 옵션이 제시됨»이 분모다. 봇 정책이 있는 증강만 싣는다.`);
  out.push(` */`);
  out.push(`export const AUGMENT_STYLE: Readonly<Record<string, { all: Pair; turn: readonly [Pair, Pair, Pair] }>> = {`);
  const h = s["augUse"] as Table;
  const ids = Object.keys(h).filter((k) => /^aug=[^|]+$/.test(k)).map((k) => k.slice(4)).filter((id) => policyIds.has(id)).sort();
  for (const id of ids) {
    const hh = h[`aug=${id}|tier=${tierArg}`] ?? h[`aug=${id}`];
    const bb = botByAug.get(id);
    const all = [p(hh), p(bb?.get("*"))];
    if (all[0] === null || all[1] === null) continue;
    const turn = TURNS.map((tb) => [p(h[`aug=${id}|turn=${tb}`]) ?? all[0], p(bb?.get(tb)) ?? all[1]]);
    out.push(`  ${id}: { all: [${all[0]}, ${all[1]}], turn: [${turn.map((x) => `[${x[0]}, ${x[1]}]`).join(", ")}] },`);
  }
  out.push(`};`);
  out.push(``);
}

// ── 드래프트 픽률 ──
{
  out.push(`/** 증강별 P(픽 | 제시) — 상위 계층 사람과 같은 오퍼에서의 봇. */`);
  out.push(`export const DRAFT_PICK: Readonly<Record<string, Pair>> = {`);
  const h = s["draft"] as Table; const b = s["draftBot"] as Table;
  const ids = Object.keys(h).filter((k) => /^aug=[^|]+$/.test(k)).map((k) => k.slice(4)).sort();
  for (const id of ids) {
    const ph = p(h[`aug=${id}|tier=${tierArg}`]); const pb = p(b[`aug=${id}|tier=${tierArg}`]);
    if (ph === null || pb === null) continue;
    out.push(`  ${id}: [${ph}, ${pb}],`);
  }
  out.push(`};`);
  out.push(``);
}

// ── 버림 취향: 불일치에서 사람이 버린 종류 / 봇이 버린 종류의 비율 (위협 없음·초반) ──
{
  out.push(`/**`);
  out.push(` * 버림 불일치에서 «사람이 버린 종류 : 봇이 버린 종류»의 비 — 1보다 크면 사람이 그 종류를`);
  out.push(` * 봇보다 더 먼저 버린다. 위협이 없을 때만 잰다. 종류: guest/yakuhai(자패), 19/28/37(수패),`);
  out.push(` * 접미 i=고립, P=또이쯔, D=도라.`);
  out.push(` */`);
  out.push(`export const DISCARD_TASTE: Readonly<Record<string, number>> = {`);
  const conf = s["discardConf"] as Table;
  const hs = new Map<string, number>(); const bs = new Map<string, number>();
  for (const [k, c] of Object.entries(conf)) {
    if (!k.startsWith("none|")) continue;
    if (k.startsWith("none|h:")) hs.set(k.slice(7), c.n);
    else if (k.startsWith("none|b:")) bs.set(k.slice(7), c.n);
  }
  const classes = [...new Set([...hs.keys(), ...bs.keys()])].sort();
  for (const cls of classes) {
    const hn = hs.get(cls) ?? 0; const bn = bs.get(cls) ?? 0;
    if (hn + bn < 200) continue;
    out.push(`  "${cls}": ${(Math.round(((hn + 20) / (bn + 20)) * 100) / 100).toFixed(2)},`);
  }
  out.push(`};`);
}
console.log(out.join("\n"));
