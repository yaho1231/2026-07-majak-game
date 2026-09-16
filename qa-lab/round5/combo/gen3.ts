/**
 * gen3 — 3~4장 조합 목록 생성 (계획 B-2 ①②③). 출력: combos.jsonl (한 줄 = ComboEntry, 출처 태그 포함)
 *
 *   tsx qa-lab/round5/combo/gen3.ts [--third 3] [--dist-top 300] [--dist-games 30] [--out combos.jsonl]
 *
 *  ① risky  : packages/content/test/combo_sweep.test.ts 의 RISKY 목록에서 conflicts 를 피한 3장 전수
 *  ② signal : docs/36·40·48 + qa-lab/findings/*.md + qa-lab/synergy4/*\/report.md 의 «A × B» 줄에서
 *             증강 id 쌍을 뽑고(id 그대로 / 카탈로그 이름 / 문서 시절 별칭), 같은 시너지 축
 *             (core AUGMENT_SYNERGY tags)의 1장을 얹어 3장 (쌍마다 --third 개)
 *  ③ dist   : qa-lab/sim-2026-08-31/out/*.jsonl 이 있으면 최종 보유 3~4장 조합 빈도 상위 --dist-top,
 *             없으면 HanchanController(운영 드래프트 스케줄, chaos) --dist-games 판을 돌려 최종 보유를 채집
 *             (채집 결과는 out/dist-holdings.jsonl 에 캐시)
 *  중복은 정렬 키로 제거하고, 같은 좌석 상호 배제·모드 제한이 걸리는 조합은 «설치가 조용히 빠지므로» 뺀다.
 */
import { appendFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_HANCHAN_CONFIG, HanchanController, Prng, hanchanConfigForMode } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { PERSONAS, PersonaAgent, SEATS, allAugments, byId } from "../../harness.js";
import type { Persona } from "../../harness.js";
import {
  ALL_IDS, COMBOS_FILE, OUT_DIR, REPO_ROOT, argFlag, canon, comboKey, ensureOutDir, hasFlag, readJsonl, tagsOf, validCombo,
} from "./lib.js";
import type { ComboEntry, Mode, Tier } from "./lib.js";

const THIRD = Number(argFlag("third") ?? 3);
const DIST_TOP = Number(argFlag("dist-top") ?? 300);
const DIST_GAMES = Number(argFlag("dist-games") ?? 30);
const OUT = argFlag("out") ?? COMBOS_FILE;

const log = (s: string): void => { process.stderr.write(s + "\n"); };

// ───────────────────────── ① risky ─────────────────────────

const RISKY_FALLBACK = [
  "frame_up", "table_flip", "take_back", "full_hand_swap", "hand_swap3", "seat_swap", "true_dragon",
  "even_world", "genesis", "giant_god", "conjure_draw", "honor_return", "regret", "tile_split",
  "pond_snatch", "grave_rob", "meld_dissolve", "north_trader", "hourglass", "open_kokushi", "void_kan",
  "cliff_bloom", "dead_wall_master", "bottom_deal", "rinshan_preview", "free_riichi_discard", "snake_kan",
];

function riskyIds(): { ids: string[]; src: string } {
  const path = join(REPO_ROOT, "packages/content/test/combo_sweep.test.ts");
  try {
    const text = readFileSync(path, "utf-8");
    const m = /const RISKY = \[([\s\S]*?)\];/.exec(text);
    if (m !== null) {
      const ids = [...(m[1] as string).matchAll(/"([a-z0-9_]+)"/g)].map((x) => x[1] as string).filter((id) => byId.has(id));
      if (ids.length >= 10) return { ids, src: "combo_sweep.test.ts:RISKY" };
    }
  } catch { /* fallback */ }
  log("⚠ RISKY 목록을 테스트 파일에서 못 읽어 내장 사본을 쓴다");
  return { ids: RISKY_FALLBACK.filter((id) => byId.has(id)), src: "RISKY(fallback)" };
}

// ───────────────────────── ② signal ─────────────────────────

/** 문서 시절 이름 → id (카탈로그 name 과 다르게 적힌 것들) */
const ALIASES: Record<string, string> = {
  "리치 승격": "riichi_upgrade",
  "열린 국사": "open_kokushi",
  "거신병 각성": "giant_god",
  "거신병": "giant_god",
  "흐린 강": "hidden_river",
  "3장 예지": "triple_peek",
  "모래시계": "hourglass",
  "도라 은닉": "dora_conceal",
  "거울의 도라": "mirror_dora",
  "절벽의 만개": "cliff_bloom",
  "자패 회수": "honor_return",
  "대기만성": "late_bloomer",
  "은밀한 리치": "stealth_riichi",
  "리치 간파": "peek_riichi_waits",
  "오픈 리치": "open_riichi_reveal",
  "리치 봉인": "riichi_seal",
  "강 회수": "pond_snatch",
  "무르기": "take_back",
  "격(格)": "rank_gate",
};

interface NameEntry { name: string; id: string }
function nameTable(): NameEntry[] {
  const t: NameEntry[] = [];
  for (const d of allAugments) {
    t.push({ name: d.name, id: d.id });
    const stripped = d.name.replace(/\s*\(.*?\)\s*/g, "").trim();
    if (stripped !== d.name && stripped.length >= 2 && ALIASES[stripped] === undefined) t.push({ name: stripped, id: d.id });
  }
  for (const [name, id] of Object.entries(ALIASES)) if (byId.has(id)) t.push({ name, id });
  // 긴 이름부터 — «투시»가 «이면투시»를 잡아먹지 않게
  return t.sort((a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name));
}

/** 한 줄에서 증강 id 를 뽑는다 (등장 순) */
function idsInLine(line: string, names: NameEntry[]): string[] {
  const found = new Map<string, number>(); // id → 위치
  // 1) id 그대로 (백틱 유무 무관)
  for (const m of line.matchAll(/[a-z][a-z0-9_]{2,}/g)) {
    const id = m[0];
    if (byId.has(id) && !found.has(id)) found.set(id, m.index ?? 0);
  }
  // 2) 이름 — 긴 것부터 소비. 2~3글자 이름은 «×» 근처에서만 (회수·반전·예지 같은 일상어 오탐 방지)
  const crosses = [...line.matchAll(/×/g)].map((m) => m.index ?? 0);
  let rest = line;
  for (const { name, id } of names) {
    let from = 0;
    while (true) {
      const at = rest.indexOf(name, from);
      if (at < 0) break;
      from = at + name.length;
      const nearCross = crosses.some((c) => Math.abs(c - at) <= 5 || Math.abs(c - (at + name.length)) <= 5);
      if (name.length <= 3 && !nearCross) continue;
      rest = rest.slice(0, at) + " ".repeat(name.length) + rest.slice(at + name.length);
      if (!found.has(id)) found.set(id, at);
    }
  }
  return [...found.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

function signalSources(): string[] {
  const files: string[] = [
    "docs/36_AUGMENT_QA_2026-08-20.md",
    "docs/40_AUGMENT_SYNERGY_QA_2026-08-23.md",
    "docs/48_AUGMENT_SYNERGY_QA_2026-08-31.md",
  ];
  const dirs = ["qa-lab/findings"];
  for (const d of dirs) {
    const abs = join(REPO_ROOT, d);
    if (existsSync(abs)) for (const f of readdirSync(abs)) if (f.endsWith(".md")) files.push(`${d}/${f}`);
  }
  const s4 = join(REPO_ROOT, "qa-lab/synergy4");
  if (existsSync(s4)) {
    for (const sub of readdirSync(s4)) {
      const rp = join(s4, sub, "report.md");
      if (existsSync(rp)) files.push(`qa-lab/synergy4/${sub}/report.md`);
    }
  }
  return files.filter((f) => existsSync(join(REPO_ROOT, f)));
}

interface PairHit { a: string; b: string; src: string }

function signalPairs(): { pairs: PairHit[]; lines: number; skipped: Record<string, number> } {
  const names = nameTable();
  const byKey = new Map<string, PairHit>();
  const skipped: Record<string, number> = {};
  let lines = 0;
  for (const rel of signalSources()) {
    const text = readFileSync(join(REPO_ROOT, rel), "utf-8").split(/\r?\n/);
    text.forEach((line, i) => {
      if (!line.includes("×") && !/`[a-z0-9_]+`\s*[+|]\s*(\(?`[a-z0-9_]+`)/.test(line)) return;
      const ids = idsInLine(line, names);
      if (ids.length < 2) return;
      lines++;
      const pairs: [string, string][] = [];
      if (ids.length <= 4) {
        for (let x = 0; x < ids.length; x++) for (let y = x + 1; y < ids.length; y++) pairs.push([ids[x] as string, ids[y] as string]);
      } else {
        for (let y = 1; y < ids.length; y++) pairs.push([ids[0] as string, ids[y] as string]);
      }
      for (const [a, b] of pairs) {
        const v = validCombo([a, b]);
        if (!v.ok) { skipped[v.why.split(":")[0] as string] = (skipped[v.why.split(":")[0] as string] ?? 0) + 1; continue; }
        const key = comboKey([a, b]);
        const src = `${rel.replace(/^docs\//, "docs/").replace("_AUGMENT_QA_2026-08-20.md", "").replace("_AUGMENT_SYNERGY_QA_2026-08-23.md", "").replace("_AUGMENT_SYNERGY_QA_2026-08-31.md", "")}:${i + 1}`;
        const prev = byKey.get(key);
        if (prev === undefined) byKey.set(key, { a, b, src });
        else if (prev.src.split("|").length < 3 && !prev.src.includes(src)) prev.src += `|${src}`;
      }
    });
  }
  return { pairs: [...byKey.values()], lines, skipped };
}

/** 같은 시너지 축의 3번째 장 — 공유 축 수로 정렬해 상위 n개. 축이 없으면 시드 rng 로 1장 */
function thirdCards(a: string, b: string, n: number): { id: string; how: "axis" | "rand" }[] {
  const ta = new Set(tagsOf(a));
  const tb = new Set(tagsOf(b));
  const scored: { id: string; score: number }[] = [];
  const valid: string[] = [];
  for (const c of ALL_IDS) {
    if (c === a || c === b) continue;
    if (!validCombo([a, b, c]).ok) continue;
    valid.push(c);
    const tc = tagsOf(c);
    const score = tc.filter((t) => ta.has(t)).length + tc.filter((t) => tb.has(t)).length;
    if (score > 0) scored.push({ id: c, score });
  }
  scored.sort((x, y) => y.score - x.score || x.id.localeCompare(y.id));
  const out: { id: string; how: "axis" | "rand" }[] = scored.slice(0, n).map((s) => ({ id: s.id, how: "axis" }));
  if (out.length === 0 && valid.length > 0) {
    let h = 0;
    for (const ch of `${a}+${b}`) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    out.push({ id: valid[new Prng(h).int(valid.length)] as string, how: "rand" });
  }
  return out;
}

// ───────────────────────── ③ dist ─────────────────────────

interface Holding { game: number; seed: number; mode: Mode; seat: PlayerId; augments: string[] }

function simHoldings(): { rows: Holding[]; src: string } | null {
  const dir = join(REPO_ROOT, "qa-lab/sim-2026-08-31/out");
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  if (files.length === 0) return null;
  const rows: Holding[] = [];
  for (const f of files) {
    for (const r of readJsonl<{ game?: number; seed?: number; seat?: PlayerId; augments?: string[] }>(join(dir, f))) {
      if (!Array.isArray(r.augments)) continue;
      rows.push({ game: r.game ?? 0, seed: r.seed ?? 0, mode: "hanchan", seat: r.seat ?? "p0", augments: r.augments });
    }
  }
  return rows.length === 0 ? null : { rows, src: `sim:${files.length}files` };
}

/**
 * runMatch(drafts:true) 는 첫 스테이지를 «eastFirst»로 적어 두는데 그건 DraftStage 가 아니라
 * (`gameStart`·eastThird·eastFourth·southEntry·southThird) 무시된다 — 반장전 3장·동풍전 2장으로 끝난다.
 * 실제 분포(반장전 4장·동풍전 3장)를 얻으려고 여기서는 HanchanController 를 운영 스케줄
 * (`hanchanConfigForMode`)로 직접 굴린다. 페르소나는 chaos, 프리셋 없음.
 */
async function fallbackHoldings(games: number): Promise<Holding[]> {
  ensureOutDir();
  const cache = join(OUT_DIR, "dist-holdings.jsonl");
  const cached = readJsonl<Holding>(cache);
  if (cached.length >= games * 4) return cached.slice(0, games * 4);
  writeFileSync(cache, "");
  const chaos = PERSONAS.chaos as Persona;
  const out: Holding[] = [];
  for (let g = 0; g < games; g++) {
    const seed = 730_000 + g;
    const mode: Mode = g % 2 === 0 ? "hanchan" : "tonpuu";
    const agents = SEATS.map((id, i) => new PersonaAgent(id, chaos, seed * 131 + i * 7 + 1));
    const ctrl = new HanchanController(agents, {
      ...DEFAULT_HANCHAN_CONFIG,
      ...hanchanConfigForMode(mode),
      seed,
      extraAugments: contentAugments,
      agentDecideTimeoutMs: 20_000,
    });
    const t0 = Date.now();
    let crash: string | null = null;
    let rounds = 0;
    try {
      const timer = setTimeout(() => ctrl.requestAbort(), 120_000);
      await ctrl.run();
      clearTimeout(timer);
    } catch (e) { crash = e instanceof Error ? e.message : String(e); }
    const st = ctrl.gameState;
    rounds = st === null ? 0 : st.round.roundNumber;
    const held = st === null ? null : Object.fromEntries(st.players.map((p) => [p.id, [...p.augments]])) as Record<PlayerId, string[]>;
    for (const seat of SEATS) {
      const h: Holding = { game: g, seed, mode, seat, augments: held?.[seat] ?? [] };
      out.push(h);
      appendFileSync(cache, JSON.stringify(h) + "\n");
    }
    log(`  dist ${g + 1}/${games} seed=${seed} ${mode} ${Date.now() - t0}ms lastRound=${rounds} crash=${crash?.split("\n")[0] ?? "-"} held=${SEATS.map((s) => held?.[s]?.length ?? 0).join("/")}`);
  }
  return out;
}

// ───────────────────────── main ─────────────────────────

async function main(): Promise<void> {
  const entries = new Map<string, ComboEntry>();
  const skip: Record<string, number> = {};
  const add = (tier: Tier, ids: readonly string[], src: string, pair?: [string, string]): boolean => {
    const c = canon(ids);
    const v = validCombo(c);
    if (!v.ok) { const k = `${tier}:${v.why.split(":")[0]}`; skip[k] = (skip[k] ?? 0) + 1; return false; }
    const key = comboKey(c);
    const prev = entries.get(key);
    if (prev !== undefined) {
      if (!prev.src.includes(src) && prev.src.split("|").length < 3) prev.src += `|${src}`;
      return false;
    }
    entries.set(key, { idx: -1, tier, combo: c, src, modes: v.modes, ...(pair !== undefined ? { pair } : {}) });
    return true;
  };

  // ① risky
  const risky = riskyIds();
  let n1 = 0;
  for (let x = 0; x < risky.ids.length; x++) {
    for (let y = x + 1; y < risky.ids.length; y++) {
      for (let z = y + 1; z < risky.ids.length; z++) {
        if (add("risky", [risky.ids[x] as string, risky.ids[y] as string, risky.ids[z] as string], `risky:${risky.src}`)) n1++;
      }
    }
  }
  log(`① risky: ${risky.ids.length}종 → C(${risky.ids.length},3)=${(risky.ids.length * (risky.ids.length - 1) * (risky.ids.length - 2)) / 6} 중 ${n1} (conflicts 제외)`);

  // ② signal
  const sig = signalPairs();
  if (hasFlag("pairs-dump")) for (const p of sig.pairs) log(`  pair ${p.a} × ${p.b}  ← ${p.src}`);
  let n2 = 0;
  let n2pairs = 0;
  const howCount = { axis: 0, rand: 0 };
  for (const p of sig.pairs) {
    const thirds = thirdCards(p.a, p.b, THIRD);
    if (thirds.length > 0) n2pairs++;
    for (const t of thirds) {
      howCount[t.how]++;
      if (add("signal", [p.a, p.b, t.id], `${p.src}${t.how === "rand" ? "+rand" : ""}`, [p.a, p.b])) n2++;
    }
  }
  log(`② signal: «×» 줄 ${sig.lines}개 → 설치 가능 쌍 ${sig.pairs.length} (제외 ${JSON.stringify(sig.skipped)}) → 3장 ${n2} (쌍 ${n2pairs}, 축 ${howCount.axis} · 무작위 ${howCount.rand})`);

  // ③ dist
  let holdings: Holding[];
  let distSrc: string;
  const sim = simHoldings();
  if (sim !== null) { holdings = sim.rows; distSrc = sim.src; }
  else {
    log(`③ dist: sim-2026-08-31/out 없음 → HanchanController(운영 스케줄, chaos) ${DIST_GAMES}판으로 채집`);
    holdings = await fallbackHoldings(DIST_GAMES);
    distSrc = `dist:fallback(${DIST_GAMES}판)`;
  }
  const freq = new Map<string, { ids: string[]; n: number; first: number }>();
  let ordinal = 0;
  for (const h of holdings) {
    const c = canon(h.augments);
    if (c.length < 3 || c.length > 4) continue;
    const key = comboKey(c);
    const f = freq.get(key);
    if (f === undefined) freq.set(key, { ids: c, n: 1, first: ordinal++ });
    else f.n++;
  }
  const top = [...freq.values()].sort((a, b) => b.n - a.n || a.first - b.first).slice(0, DIST_TOP);
  let n3 = 0;
  for (const t of top) if (add("dist", t.ids, `${distSrc}:n=${t.n}`)) n3++;
  const sizes = holdings.map((h) => h.augments.length);
  log(`③ dist: 보유 ${holdings.length}건(3~4장 ${sizes.filter((s) => s >= 3 && s <= 4).length}) → 조합 ${freq.size} → 상위 ${top.length} → 신규 ${n3}`);

  // 출력
  const list = [...entries.values()];
  list.forEach((e, i) => { e.idx = i; });
  writeFileSync(OUT, list.map((e) => JSON.stringify(e)).join("\n") + (list.length > 0 ? "\n" : ""));
  const byTier = { risky: 0, signal: 0, dist: 0 } as Record<Tier, number>;
  const bySize = { 3: 0, 4: 0 } as Record<number, number>;
  for (const e of list) { byTier[e.tier]++; bySize[e.combo.length] = (bySize[e.combo.length] ?? 0) + 1; }
  console.log(JSON.stringify({ out: OUT, total: list.length, byTier, bySize, skipped: skip, third: THIRD, distTop: DIST_TOP }));
}

await main();
