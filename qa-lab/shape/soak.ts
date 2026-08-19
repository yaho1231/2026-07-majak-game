/** shape 도메인 대량 소크 — 16종을 좌석에 강제 배정하고 반장전/동풍전을 돌린다. */
import { Prng, ROUND_SETTLED } from "@majak/core";
import type { GameEvent, PlayerId, RoundSettledPayload, WinInfo } from "@majak/core";
import { PERSONAS, SEATS, assignPreset, runMatch, byId } from "./h2.js";

const SHAPE = [
  "avenger", "tanyao_break", "broken_wall", "true_dragon", "late_bloomer",
  "late_bloomer_east", "broken_border", "mixed_nine_gates", "haitei_lord",
  "mixed_triplet", "royal_kokushi", "polar_ends", "async_chiitoi",
  "bottom_yaku", "wind_lineage", "joker",
] as const;

const AUX = new Set(["bottom_flow", "bottom_letgo"]);

interface WinRec {
  seed: number; mode: string; round: string;
  winner: PlayerId; augs: readonly string[];
  yaku: { id: string; name: string; han: number }[];
  han: number; fu: number; ym: number; extraHan: number; yakuless?: boolean;
  extraHanBy?: { augId: string; han: number }[];
}

export async function soak(opts: {
  seeds: number[]; mode: "hanchan" | "tonpuu"; personaNames: string[];
  onWin?: (w: WinRec) => void;
}): Promise<{ crashes: string[]; effErrs: string[]; viols: string[]; wins: WinRec[]; matches: number }> {
  const crashes: string[] = []; const effErrs: string[] = []; const viols: string[] = [];
  const wins: WinRec[] = [];
  const modeShape = SHAPE.filter((id) => {
    const d = byId.get(id);
    return d?.modes === undefined || d.modes.includes(opts.mode);
  });
  let matches = 0;
  for (const seed of opts.seeds) {
    const rng = new Prng(seed * 977 + 13);
    // 좌석마다 shape 증강 2종씩 (충돌 회피)
    const pool = [...modeShape];
    const preset: Record<PlayerId, string[]> = { p0: [], p1: [], p2: [], p3: [] };
    for (const s of SEATS) {
      let guard = 0;
      while (preset[s].length < 2 && pool.length > 0 && guard++ < 100) {
        const id = pool.splice(rng.int(pool.length), 1)[0] as string;
        if (preset[s].some((h) => (byId.get(h)?.conflicts ?? []).includes(id) || (byId.get(id)?.conflicts ?? []).includes(h))) continue;
        preset[s].push(id);
      }
    }
    const pn = opts.personaNames;
    const personas = {
      p0: PERSONAS[pn[0] ?? "masher"]!, p1: PERSONAS[pn[1] ?? "riichiRusher"]!,
      p2: PERSONAS[pn[2] ?? "caller"]!, p3: PERSONAS[pn[3] ?? "chaos"]!,
    };
    let seenLog = 0;
    let engineRef: { eventLog: readonly GameEvent[] } | null = null;
    const holderOf = (p: PlayerId): readonly string[] => preset[p];
    const drain = (): void => {
      if (engineRef === null) return;
      const log = engineRef.eventLog;
      for (let i = seenLog; i < log.length; i++) {
        const ev = log[i] as GameEvent;
        if (ev.type !== ROUND_SETTLED) continue;
        const pl = ev.payload as RoundSettledPayload;
        for (const wi of (pl.winInfos ?? []) as WinInfo[]) {
          const rec: WinRec = {
            seed, mode: opts.mode,
            round: `${pl.prevalentWind}-${pl.roundNumber}-${pl.honba}`,
            winner: wi.winner, augs: holderOf(wi.winner),
            yaku: wi.yaku, han: wi.han, fu: wi.fu, ym: wi.yakumanCount,
            extraHan: wi.extraHan,
            ...(wi.yakuless !== undefined ? { yakuless: wi.yakuless } : {}),
            ...(wi.extraHanBy !== undefined ? { extraHanBy: wi.extraHanBy } : {}),
          };
          wins.push(rec); opts.onWin?.(rec);
        }
      }
      seenLog = log.length;
    };
    const r = await runMatch({
      seed, mode: opts.mode, preset, personas, noDraft: true,
      onGameStart: (g) => {
        engineRef = (g as { engine: { eventLog: readonly GameEvent[] } }).engine;
      },
      onRound: (_st, phase) => { if (phase === "end") drain(); },
      timeoutMs: 90_000,
    });
    drain();
    matches++;
    if (r.crash !== undefined) crashes.push(`seed=${seed} ${opts.mode} preset=${JSON.stringify(preset)}\n${r.crash}`);
    for (const e of r.effectErrors) effErrs.push(`seed=${seed} ${e}`);
    for (const v of r.violations) viols.push(`seed=${seed} ${v.kind} ${v.detail} @${v.round} ${v.seat ?? ""}`);
  }
  return { crashes, effErrs, viols, wins, matches };
}

export { SHAPE, AUX };
export type { WinRec };
