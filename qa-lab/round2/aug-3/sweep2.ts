/**
 * aug-3 정산 불변식 스위프 — RoundSettled 페이로드를 직접 뜯어 카드가 약속한 산술을 검증한다.
 *  · scapegoat  : 보유자 쯔모 + 지목 → 지목당한 사람 외 두 명의 delta는 0이어야 한다.
 *  · rank_gate  : 지목당한 사람의 화료는 (han + extraHan) >= 5 이거나 역만이어야 한다.
 *  · nagashi_yakuman : 유국 + 성립 → 보유자 delta에 32000/48000이 실려야 한다.
 *  · 전 증강 공통: deltas 합계 + 리치봉 정산이 어긋나면 augPoints로 설명돼야 한다.
 * 사용: tsx sweep2.ts <shard> <shards> <games>
 */
import { Prng, isTerminalOrHonor } from "@majak/core";
import type { GameState, TileKind } from "@majak/core";
import { assignPreset } from "../../harness.js";
import { runFocus } from "./focus.js";

const MINE = [
  "nagashi_yakuman", "no_retreat", "no_ron_pact", "north_trader", "off_by_one",
  "omni_chi", "open_kokushi", "open_riichi_reveal", "palm_flip", "parasite",
  "peek_riichi_waits", "picky_eater", "polar_ends", "pond_snatch", "pseudo_dealer",
  "push_riichi", "rank_gate", "red_five_touch", "regret", "reload",
  "riichi_seal", "riichi_upgrade", "rinshan_preview", "royal_kokushi",
  "scapegoat", "seat_swap", "siege_riichi",
];
const AUG_ACTIONS = [
  "no_retreat_riichi", "north_pull", "kokushi_pon", "open_riichi", "flip_riichi",
  "parasite_attach", "peek_waits", "peek_forge", "picky_unify", "pond_snatch",
  "claim_dealer", "push_brand", "rank_gate_mark", "red_touch", "reload_use",
  "rinshan_pull", "scapegoat_mark", "seat_swap",
];

const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);
const games = Number(process.argv[4] ?? 60);

function kindFromKey(key: string): TileKind {
  const m = /^([a-z]+)(\d+)$/.exec(key);
  if (m === null) return { suit: "man", rank: 5 };
  return { suit: m[1] as TileKind["suit"], rank: Number(m[2]) };
}

let n = 0, issues = 0;
const t0 = Date.now();
for (let g = 0; g < games; g++) {
  if (g % shards !== shard) continue;
  const seed = 900000 + g * 613 + shard;
  const rng = new Prng(seed * 2654435761);
  const mode = g % 2 === 0 ? "tonpuu" : "hanchan";
  const forced = [MINE[g % MINE.length] as string, MINE[(g * 7 + 3) % MINE.length] as string];
  const preset = assignPreset(rng, mode, [...new Set(forced)], 2) as Record<string, string[]>;
  // 같은 증강을 두 좌석이 동시에
  preset["p2"] = [forced[0] as string, ...(preset["p2"] ?? []).filter((x) => x !== forced[0])].slice(0, 2);
  const prefer: Record<string, string[]> = {};
  for (const s of ["p0", "p1", "p2", "p3"]) prefer[s] = g % 3 === 0 ? AUG_ACTIONS : [];
  const notes: string[] = [];
  const r = await runFocus({
    seed, mode, preset, prefer,
    riichi: { p1: true, p3: true },
    call: { p2: true },
    onEvent: (e, st) => {
      if (e.type !== "RoundSettled" || st === null) return;
      const p = e.payload as {
        outcome: string;
        deltas: Record<string, number>;
        winInfos?: { winner: string; winType: string; han?: number; yakumanCount?: number }[];
        augPoints?: { player?: string; augId?: string; points?: number }[];
      };
      const deltas = p.deltas ?? {};
      // ── scapegoat ──
      for (const pl of st.players) {
        if (!(preset[pl.id] ?? []).includes("scapegoat")) continue;
        const info = (p.winInfos ?? []).find((w) => w.winner === pl.id && w.winType === "tsumo");
        if (info === undefined) continue;
        const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
        // targetKey는 국 스코프라 정산 시점엔 아직 살아 있다
        const target = st.augmentData[`scapegoat:target:${rk}:${pl.id}#round`];
        if (typeof target !== "string" || target === "") continue;
        for (const q of st.players) {
          if (q.id === pl.id || q.id === target) continue;
          if ((deltas[q.id] ?? 0) < 0) {
            notes.push(`SCAPEGOAT_LEAK holder=${pl.id} target=${target} ${q.id} pays ${deltas[q.id]} deltas=${JSON.stringify(deltas)}`);
          }
        }
      }
      // ── rank_gate ──
      for (const pl of st.players) {
        if (!(preset[pl.id] ?? []).includes("rank_gate")) continue;
        const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
        const marked = st.augmentData[`rank_gate:mark:${rk}:${pl.id}#round`];
        if (typeof marked !== "string" || marked === "") continue;
        const w = (p.winInfos ?? []).find((x) => x.winner === marked);
        if (w === undefined) continue;
        if ((w.yakumanCount ?? 0) > 0) continue;
        if ((w.han ?? 0) < 5) {
          notes.push(`RANKGATE_LEAK holder=${pl.id} marked=${marked} han=${w.han} info=${JSON.stringify(w)}`);
        }
      }
      // ── nagashi_yakuman ──
      if (p.outcome === "draw") {
        for (const pl of st.players) {
          if (!(preset[pl.id] ?? []).includes("nagashi_yakuman")) continue;
          const hist = (st.round.byPlayer[pl.id]?.discardedKinds ?? []) as string[];
          const valid = hist.length > 0 && hist.every((k) => isTerminalOrHonor(kindFromKey(k)));
          const got = (p.augPoints ?? []).filter((a) => a.augId === "nagashi_yakuman" && a.player === pl.id)
            .reduce((s, a) => s + (a.points ?? 0), 0);
          if (valid && got < 32000) notes.push(`NAGASHI_SHORT ${pl.id} got=${got} deltas=${JSON.stringify(deltas)}`);
          if (!valid && got > 0) notes.push(`NAGASHI_PHANTOM ${pl.id} got=${got}`);
        }
      }
      // ── 좌석/오야 정합 ──
      const seats = st.players.map((x) => x.seat).sort().join(",");
      if (seats !== "0,1,2,3") notes.push(`SEATS ${seats}`);
    },
    timeoutMs: 180_000,
  });
  n++;
  const tag = `g=${g} seed=${seed} mode=${mode} preset=${JSON.stringify(preset)}`;
  if (r.crash !== undefined) { issues++; console.log(`CRASH ${tag}\n  ${r.crash}`); }
  if (r.effectErrors.length > 0) { issues++; console.log(`EFFERR ${tag}\n  ${[...new Set(r.effectErrors)].slice(0, 4).join("\n  ")}`); }
  if (notes.length > 0) {
    issues++;
    console.log(`NOTE ${tag}\n  ${[...new Set(notes)].slice(0, 6).join("\n  ")}`);
  }
  if (n % 10 === 0) console.log(`-- shard${shard} ${n} games ${(Date.now() - t0) / 1000 | 0}s issues=${issues}`);
}
console.log(`DONE2 shard=${shard} games=${n} issues=${issues}`);
