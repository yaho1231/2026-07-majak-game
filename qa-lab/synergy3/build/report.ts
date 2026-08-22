/** out/*.json 을 모아 빌드별 통계표를 찍는다. tsx qa-lab/synergy3/build/report.ts */
import { readFileSync, existsSync } from "node:fs";
import { BUILDS } from "./builds.js";

interface Game {
  seed: number; ms: number; crash: string | null; rounds: number;
  outcomes: Record<string, number>; finalScores: Record<string, number>;
  riichiBySeat: Record<string, number>;
  wins: { winner: string; from: string | null; han: number; points: number; yakumanCount: number; yaku: string[]; extraHanBy: { augId: string; han: number }[]; doraHan: number; uraHan: number; limit: string | null }[];
  augPoints: { augId: string; player: string; points: number }[];
  violations: string[]; effectErrors: string[];
  actionsBySeat: Record<string, Record<string, number>>;
  aug: { k: string; ruleSet: number; reactCall: number; reactEmit: number; interCall: number; interChange: number; optionOffer: number; actionFired: number; emitted: Record<string, number> }[];
  bot: { id: string; chooseCalls: number; proposed: number; threw: number; fired: number; opportunity: number; randomFire: number; lostTo: [string, number][] }[];
  contentFailures: [string, number][];
  unofferedWarns: [string, number][];
  augActions: [string, string[]][];
}
interface File { key: string; ids: string[]; mode: string; games: Game[] }

function load(k: string): File | null {
  const p = `qa-lab/synergy3/build/out/${k}.json`;
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as File) : null;
}

function summarize(f: File): Record<string, number> {
  const g = f.games;
  const rounds = g.reduce((a, x) => a + x.rounds, 0);
  const p0wins = g.flatMap((x) => x.wins).filter((w) => w.winner === "p0");
  const oppWins = g.flatMap((x) => x.wins).filter((w) => w.winner !== "p0");
  const dealIns = g.flatMap((x) => x.wins).filter((w) => w.from === "p0");
  const draws = g.reduce((a, x) => a + (x.outcomes["draw"] ?? 0), 0);
  const aborts = g.reduce((a, x) => a + (x.outcomes["abort"] ?? 0), 0);
  const score = g.reduce((a, x) => a + (x.finalScores["p0"] ?? 0), 0) / g.length;
  const riichi = g.reduce((a, x) => a + (x.riichiBySeat["p0"] ?? 0), 0);
  const avgPts = p0wins.length === 0 ? 0 : p0wins.reduce((a, w) => a + w.points, 0) / p0wins.length;
  const avgHan = p0wins.length === 0 ? 0 : p0wins.reduce((a, w) => a + w.han, 0) / p0wins.length;
  const maxPts = p0wins.reduce((a, w) => Math.max(a, w.points), 0);
  const yakuman = p0wins.filter((w) => w.yakumanCount > 0).length;
  const augPts = g.flatMap((x) => x.augPoints).filter((n) => n.player === "p0").reduce((a, n) => a + n.points, 0);
  return {
    games: g.length, rounds, winsP0: p0wins.length, winRate: p0wins.length / rounds,
    avgPts: Math.round(avgPts), avgHan: Math.round(avgHan * 10) / 10, maxPts,
    yakuman, dealIns: dealIns.length, oppWins: oppWins.length, draws, aborts,
    riichi, finalScore: Math.round(score), augPts,
    viol: g.reduce((a, x) => a + x.violations.length, 0),
    effErr: g.reduce((a, x) => a + x.effectErrors.length, 0),
    ms: Math.round(g.reduce((a, x) => a + x.ms, 0) / g.length),
  };
}

const ctrl = load("control");
const cs = ctrl === null ? null : summarize(ctrl);

const head = ["build", "rounds", "winsP0", "win%", "avgPts", "avgHan", "maxPts", "역만", "방총", "유국", "리치", "최종", "augPts", "viol", "effErr", "ms"];
const rows: string[][] = [];
const fmt = (s: Record<string, number>, name: string): string[] => [
  name, String(s["rounds"]), String(s["winsP0"]), ((s["winRate"] ?? 0) * 100).toFixed(0) + "%",
  String(s["avgPts"]), String(s["avgHan"]), String(s["maxPts"]), String(s["yakuman"]),
  String(s["dealIns"]), String(s["draws"]), String(s["riichi"]), String(s["finalScore"]),
  String(s["augPts"]), String(s["viol"]), String(s["effErr"]), String(s["ms"]),
];
if (cs !== null) rows.push(fmt(cs, "control"));

const detail: string[] = [];
for (const b of BUILDS) {
  const f = load(b.key);
  if (f === null) { detail.push(`## ${b.key}: (없음)`); continue; }
  const s = summarize(f);
  rows.push(fmt(s, b.key));

  // 증강별 발동
  const per = new Map<string, { fired: number; emit: number; change: number; offer: number; rule: number; opp: number; prop: number; botFired: number; call: number; inter: number }>();
  for (const id of f.ids) per.set(id, { fired: 0, emit: 0, change: 0, offer: 0, rule: 0, opp: 0, prop: 0, botFired: 0, call: 0, inter: 0 });
  for (const g of f.games) {
    for (const a of g.aug) {
      const [seat, id] = a.k.split("|");
      if (seat !== "p0") continue;
      const p = per.get(id ?? "");
      if (p === undefined) continue;
      p.fired += a.actionFired; p.emit += a.reactEmit; p.change += a.interChange;
      p.offer += a.optionOffer; p.rule += a.ruleSet; p.call += a.reactCall; p.inter += a.interCall;
    }
    for (const b2 of g.bot) {
      const p = per.get(b2.id);
      if (p === undefined) continue;
      p.opp += b2.opportunity; p.prop += b2.proposed; p.botFired += b2.fired;
    }
  }
  const lines = [...per].map(([id, p]) => {
    const dead = p.fired === 0 && p.emit === 0 && p.change === 0 && p.offer === 0 && p.rule === 0;
    return `| ${id} | ${p.rule} | ${p.call}/${p.emit} | ${p.inter}/${p.change} | ${p.offer} | ${p.fired} | ${p.opp}/${p.prop}/${p.botFired} | ${dead ? "**죽음**" : ""} |`;
  });
  const fails = new Map<string, number>();
  for (const g of f.games) for (const [k, v] of g.contentFailures) fails.set(k, (fails.get(k) ?? 0) + v);
  const unoff = new Map<string, number>();
  for (const g of f.games) for (const [k, v] of g.unofferedWarns) unoff.set(k, (unoff.get(k) ?? 0) + v);
  const viols = new Map<string, number>();
  for (const g of f.games) for (const v of g.violations) {
    const k = v.split(":")[0] ?? v;
    viols.set(k, (viols.get(k) ?? 0) + 1);
  }
  const p0wins = f.games.flatMap((g) => g.wins).filter((w) => w.winner === "p0");
  const yakuFreq = new Map<string, number>();
  for (const w of p0wins) for (const y of w.yaku) yakuFreq.set(y, (yakuFreq.get(y) ?? 0) + 1);
  const extra = new Map<string, number>();
  for (const w of f.games.flatMap((g) => g.wins)) for (const e of w.extraHanBy ?? []) extra.set(e.augId, (extra.get(e.augId) ?? 0) + e.han);

  detail.push(
    `## ${b.key} — ${b.name} (${f.ids.join(" + ")})\n` +
    `| 증강 | rule | react호출/emit | inter호출/변경 | 옵션제시 | 액션발동 | 봇 기회/제안/발동 | |\n|---|---|---|---|---|---|---|---|\n` +
    lines.join("\n") +
    `\n- p0 역 빈도: ${[...yakuFreq].sort((a, x) => x[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}:${v}`).join(" ")}` +
    `\n- extraHanBy(전체): ${[...extra].map(([k, v]) => `${k}:${v}판`).join(" ") || "-"}` +
    `\n- augPoints(p0): ${[...f.games.flatMap((g) => g.augPoints).filter((n) => n.player === "p0").reduce((m, n) => m.set(n.augId, (m.get(n.augId) ?? 0) + n.points), new Map<string, number>())].map(([k, v]) => `${k}:${v}`).join(" ") || "-"}` +
    `\n- 위반: ${[...viols].map(([k, v]) => `${k}×${v}`).join(" ") || "-"}` +
    `\n- 증강 코드 실패: ${[...fails].map(([k, v]) => `${k}×${v}`).join(" ; ") || "-"}` +
    `\n- 미제시 경고: ${[...unoff].map(([k, v]) => `${k}×${v}`).join(" ; ") || "-"}` +
    `\n- p0 액션: ${JSON.stringify(f.games.reduce((m, g) => { for (const [t, n] of Object.entries(g.actionsBySeat["p0"] ?? {})) m[t] = (m[t] ?? 0) + n; return m; }, {} as Record<string, number>))}` +
    `\n- 크래시: ${f.games.filter((g) => g.crash !== null).map((g) => `seed${g.seed}:${(g.crash ?? "").slice(0, 120)}`).join(" | ") || "-"}`,
  );
}

console.log("| " + head.join(" | ") + " |");
console.log("|" + head.map(() => "---").join("|") + "|");
for (const r of rows) console.log("| " + r.join(" | ") + " |");
console.log("\n" + detail.join("\n\n"));
