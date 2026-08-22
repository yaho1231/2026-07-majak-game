/**
 * 드래프트 전용 시뮬 (round2/synergy) — 새 시드대에서 규칙 위반 + 시너지 편향 실측.
 * 사용: tsx qa-lab/round2/synergy/draft2.ts <seeds> <seedBase> [pickMode]
 *   pickMode: rand(기본) | greedy(시너지 최대) | first(첫 후보 = 타이머 만료 대체)
 */
import { Prng, createStandardGame, DraftController, hanchanConfigForMode, synergyBias, AUGMENT_SYNERGY } from "@majak/core";
import type { AugmentDef, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { byId, SEATS } from "../../cross/lib.js";

const N = Number(process.argv[2] ?? 500);
const BASE = Number(process.argv[3] ?? 4_100_000);
const PICK = (process.argv[4] ?? "rand") as "rand" | "greedy" | "first";

const counts = new Map<string, number>();
const examples = new Map<string, string[]>();
const bump = (k: string, ex: string): void => {
  counts.set(k, (counts.get(k) ?? 0) + 1);
  const e = examples.get(k) ?? [];
  if (e.length < 4) e.push(ex);
  examples.set(k, e);
};

/** 시너지 실측: 보유가 있는 스테이지에서 제시된 카드의 bias 분포 */
let biasN = 0, biasSum = 0, antiOffered = 0, boostOffered = 0, neutralOffered = 0;

for (let i = 0; i < N; i++) {
  for (const mode of ["hanchan", "tonpuu"] as const) {
    const seed = BASE + i * 3 + (mode === "tonpuu" ? 1 : 0);
    const game = createStandardGame({
      seed, playerIds: [...SEATS], mode, startScore: 25000, redFivesPerSuit: 1,
      extraAugments: contentAugments,
    } as never);
    const pickRng = new Prng(seed * 7 + 3);
    const stages = hanchanConfigForMode(mode).draftSchedules!;
    const draft = new DraftController(game.engine, game.augments, { yaku: game.yaku, catalog: game.augments });
    for (const stage of stages) {
      const shown = new Map<PlayerId, AugmentDef[]>();
      const heldBefore = new Map<PlayerId, string[]>();
      for (const seat of SEATS) {
        const { choices, rerolls } = draft.rollWithRerolls(stage, seat);
        shown.set(seat, [...choices, ...rerolls]);
        const held = [...(game.engine.state.players.find((p) => p.id === seat)?.augments ?? [])];
        heldBefore.set(seat, held);
        if (choices.length < 3) bump("SHORT_OFFER", `${mode} seed=${seed} ${stage} ${seat} n=${choices.length}`);
        if (new Set([...choices, ...rerolls].map((d) => d.id)).size !== choices.length + rerolls.length)
          bump("OFFER_SELF_DUP", `${mode} seed=${seed} ${stage} ${seat}`);
        for (const d of [...choices, ...rerolls]) {
          if (d.modes !== undefined && !d.modes.includes(mode)) bump("MODE", `${mode} seed=${seed} ${stage} ${seat} ${d.id}`);
          if (d.draftStages !== undefined && !d.draftStages.includes(stage)) bump("STAGE", `${mode} seed=${seed} ${stage} ${seat} ${d.id}`);
          if (held.includes(d.id)) bump("OFFER_HELD_AGAIN", `${mode} seed=${seed} ${stage} ${seat} ${d.id}`);
          for (const h of held) {
            const ch = byId.get(h)?.conflicts ?? [], cd = d.conflicts ?? [];
            if (ch.includes(d.id) || cd.includes(h)) bump("CONFLICT_OFFERED", `${mode} seed=${seed} ${stage} ${seat} ${d.id} vs ${h}`);
          }
        }
        // 시너지 실측
        if (held.length > 0) {
          const b = synergyBias(held);
          for (const d of choices) {
            const v = b[d.id] ?? 1;
            biasN++; biasSum += v;
            if (v < 1) antiOffered++; else if (v > 1) boostOffered++; else neutralOffered++;
          }
        }
      }
      for (let a = 0; a < SEATS.length; a++) for (let b2 = a + 1; b2 < SEATS.length; b2++) {
        const A = shown.get(SEATS[a]!)!.map((d) => d.id), B = shown.get(SEATS[b2]!)!.map((d) => d.id);
        for (const id of A) if (B.includes(id)) bump("OFFER_OVERLAP_6", `${mode} seed=${seed} ${stage} ${SEATS[a]}×${SEATS[b2]} ${id}`);
      }
      for (const seat of SEATS) {
        const pool = shown.get(seat)!;
        if (pool.length === 0) continue;
        let chosen: AugmentDef;
        if (PICK === "first") chosen = pool[0]!;
        else if (PICK === "greedy") {
          const b = synergyBias(heldBefore.get(seat)!);
          chosen = [...pool].sort((x, y) => (b[y.id] ?? 1) - (b[x.id] ?? 1))[0]!;
        } else chosen = pool[pickRng.int(pool.length)]!;
        try { draft.pick(stage, seat, chosen.id); }
        catch (e) { bump("PICK_THROW", `${mode} seed=${seed} ${stage} ${seat} ${chosen.id}: ${String(e).slice(0, 140)}`); }
      }
    }
    const owner = new Map<string, PlayerId>();
    for (const p of game.engine.state.players) {
      const held = [...p.augments];
      for (const id of held) {
        const prev = owner.get(id);
        if (prev !== undefined) bump("DUP_GAME", `${mode} seed=${seed} ${id}: ${prev}+${p.id} corn=${game.engine.state.players.filter((q)=>q.augments.includes("cornucopia")).map((q)=>q.id).join("/")||"none"}`);
        else owner.set(id, p.id);
      }
      const s = new Set<string>();
      for (const id of held) { if (s.has(id)) bump("DUP_SELF", `${mode} seed=${seed} ${p.id} ${id}`); s.add(id); }
      for (let a = 0; a < held.length; a++) for (let b2 = a + 1; b2 < held.length; b2++) {
        const x = held[a]!, y = held[b2]!;
        if ((byId.get(x)?.conflicts ?? []).includes(y) || (byId.get(y)?.conflicts ?? []).includes(x))
          bump("CONFLICT_HELD", `${mode} seed=${seed} ${p.id}: ${x} + ${y}`);
      }
      for (const id of held) {
        const d = byId.get(id);
        if (d?.modes !== undefined && !d.modes.includes(mode)) bump("MODE_HELD", `${mode} seed=${seed} ${p.id} ${id}`);
        if (AUGMENT_SYNERGY[id] === undefined) bump("NO_SYNERGY_ROW", id);
      }
    }
  }
}
console.log(`=== ${N} seeds × 2 modes, pick=${PICK} ===`);
for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) {
  console.log(`\n[${k}] x${v}`);
  for (const e of examples.get(k) ?? []) console.log("   ", e);
}
if (counts.size === 0) console.log("(위반 0)");
console.log(`\n시너지 실측: 제시 ${biasN}장 (보유 있는 스테이지), 평균배수=${(biasSum / Math.max(1, biasN)).toFixed(3)} boost=${boostOffered} anti=${antiOffered} neutral=${neutralOffered}`);
