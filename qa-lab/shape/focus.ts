/** 증강 하나를 전 좌석에 강제하고 돌린다 — 발동 경로를 확실히 밟는다. */
import { ROUND_SETTLED } from "@majak/core";
import type { GameEvent, PlayerId, RoundSettledPayload, WinInfo } from "@majak/core";
import { PERSONAS, runMatch, byId } from "./h2.js";

const AUX = new Set(["bottom_flow", "bottom_letgo"]);
const args = process.argv.slice(2);
const only = args[0];
const N = Number(args[1] ?? 6);
const MODE = (args[2] ?? "hanchan") as "hanchan" | "tonpuu";

const SHAPE = [
  "avenger", "tanyao_break", "broken_wall", "true_dragon", "late_bloomer",
  "late_bloomer_east", "broken_border", "mixed_nine_gates", "haitei_lord",
  "mixed_triplet", "royal_kokushi", "polar_ends", "async_chiitoi",
  "bottom_yaku", "wind_lineage", "joker",
];
const list = only === undefined || only === "all"
  ? SHAPE.filter((id) => { const d = byId.get(id); return d?.modes === undefined || d.modes.includes(MODE); })
  : [only];

const personaSets = [
  ["masher", "riichiRusher", "caller", "folder"],
  ["chaos", "stall", "masher", "caller"],
];

for (const aug of list) {
  let crashes = 0, effErrs = 0, viols = 0, wins = 0, yakuless = 0, auxOnly = 0;
  const notes: string[] = [];
  const hanBy = new Map<string, number>();
  for (let i = 0; i < N; i++) {
    const seed = 5000 + i * 17;
    const ps = personaSets[i % personaSets.length] as string[];
    const personas = {
      p0: PERSONAS[ps[0]!]!, p1: PERSONAS[ps[1]!]!, p2: PERSONAS[ps[2]!]!, p3: PERSONAS[ps[3]!]!,
    };
    const preset = { p0: [aug], p1: [aug], p2: [aug], p3: [aug] } as Record<PlayerId, string[]>;
    let seen = 0;
    let eng: { eventLog: readonly GameEvent[] } | null = null;
    const drain = (): void => {
      if (eng === null) return;
      const log = eng.eventLog;
      for (let k = seen; k < log.length; k++) {
        const ev = log[k] as GameEvent;
        if (ev.type !== ROUND_SETTLED) continue;
        const pl = ev.payload as RoundSettledPayload;
        for (const wi of (pl.winInfos ?? []) as WinInfo[]) {
          wins++;
          const real = wi.yaku.filter((y) => !AUX.has(y.id));
          if (wi.yakuless === true) yakuless++;
          if (real.length === 0 && wi.yakumanCount === 0 && wi.yakuless !== true) {
            auxOnly++;
            notes.push(`AUX_OR_NO_YAKU seed=${seed} ${wi.winner} yaku=${JSON.stringify(wi.yaku)} han=${wi.han}`);
          }
          for (const y of wi.yaku) hanBy.set(y.id, (hanBy.get(y.id) ?? 0) + 1);
          for (const e of wi.extraHanBy ?? []) hanBy.set(`+${e.augId}`, (hanBy.get(`+${e.augId}`) ?? 0) + 1);
          if (wi.han > 30 && wi.yakumanCount === 0) notes.push(`BIGHAN seed=${seed} han=${wi.han} ${JSON.stringify(wi.yaku)}`);
          if (wi.yakumanCount >= 3) notes.push(`MULTI_YAKUMAN seed=${seed} ym=${wi.yakumanCount} ${JSON.stringify(wi.yaku)}`);
        }
      }
      seen = log.length;
    };
    const r = await runMatch({
      seed, mode: MODE, preset, personas, noDraft: true,
      onGameStart: (g) => { eng = (g as { engine: { eventLog: readonly GameEvent[] } }).engine; },
      onRound: (_s, ph) => { if (ph === "end") drain(); },
      timeoutMs: 120_000,
    });
    drain();
    if (r.crash !== undefined) { crashes++; notes.push(`CRASH seed=${seed}: ${r.crash.split("\n")[0]}`); }
    effErrs += r.effectErrors.length;
    for (const e of r.effectErrors.slice(0, 3)) notes.push(`EFFERR seed=${seed} ${e}`);
    viols += r.violations.length;
    for (const v of r.violations.slice(0, 3)) notes.push(`VIOL seed=${seed} ${v.kind} ${v.detail}`);
  }
  console.log(`${aug.padEnd(20)} matches=${N} wins=${wins} crash=${crashes} eff=${effErrs} viol=${viols} yakuless=${yakuless} auxOnly=${auxOnly}`);
  const rel = [...hanBy].filter(([k]) => k.startsWith("+") || !["menzen_tsumo", "riichi", "tanyao", "pinfu", "yakuhai_seat", "yakuhai_prevalent", "yakuhai_haku", "yakuhai_hatsu", "yakuhai_chun", "ippatsu", "haitei", "houtei", "rinshan", "chankan", "iipeiko", "sanshoku", "ittsuu", "chanta", "junchan", "honitsu", "chinitsu", "toitoi", "sanankou", "chiitoitsu", "double_riichi", "haitei_raoyue", "houtei_raoyui"].includes(k));
  if (rel.length > 0) console.log(`   특이역/보너스: ${rel.map(([k, v]) => `${k}x${v}`).join(" ")}`);
  for (const n of notes.slice(0, 8)) console.log("   ", n);
}
