/**
 * 드래프트만 대량 시뮬레이션 — 국을 치지 않고 DraftController 를 스테이지 순서대로 돌린다.
 * (게임을 완주시키는 것보다 수천 배 빠르므로 드래프트 규칙 위반을 넓게 훑는다.)
 *
 * 검사:
 *  - 같은 스테이지에 두 좌석에게 같은 증강이 제시되는가 (OFFER_OVERLAP)
 *  - 한 게임에 같은 증강을 둘이 보유하게 되는가 (DUP_GAME)
 *  - 보유 증강과 conflicts 관계인 것이 제시/획득되는가 (CONFLICT_OFFERED / CONFLICT_HELD)
 *  - 모드/스테이지 필터 위반 (MODE / STAGE)
 *  - 제시 장수가 3장 미만인가 (SHORT_OFFER)
 */
import { Prng, createStandardGame, DraftController, hanchanConfigForMode } from "@majak/core";
import type { AugmentDef, DraftStage, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { byId, SEATS } from "./lib.js";

const N = Number(process.argv[2] ?? 300);
const counts = new Map<string, number>();
const examples = new Map<string, string[]>();
const bump = (k: string, ex: string): void => {
  counts.set(k, (counts.get(k) ?? 0) + 1);
  const e = examples.get(k) ?? [];
  if (e.length < 5) e.push(ex);
  examples.set(k, e);
};

for (let i = 0; i < N; i++) {
  for (const mode of ["hanchan", "tonpuu"] as const) {
    const seed = 900_000 + i;
    const game = createStandardGame({
      seed,
      playerIds: [...SEATS],
      mode,
      startScore: 25000,
      redFivesPerSuit: 1,
      extraAugments: contentAugments,
    } as never);
    const pickRng = new Prng(seed * 7 + (mode === "tonpuu" ? 1 : 0));
    const stages = hanchanConfigForMode(mode).draftSchedules!;
    const draft = new DraftController(game.engine, game.augments, {
      yaku: game.yaku,
      catalog: game.augments,
    });
    for (const stage of stages) {
      const shown = new Map<PlayerId, AugmentDef[]>();
      for (const seat of SEATS) {
        const { choices, rerolls } = draft.rollWithRerolls(stage, seat);
        shown.set(seat, [...choices, ...rerolls]);
        if (choices.length < 3) bump("SHORT_OFFER", `${mode} seed=${seed} ${stage} ${seat} n=${choices.length}`);
        const held = game.engine.state.players.find((p) => p.id === seat)?.augments ?? [];
        for (const d of [...choices, ...rerolls]) {
          if (d.modes !== undefined && !d.modes.includes(mode)) bump("MODE", `${mode} seed=${seed} ${stage} ${seat} ${d.id}`);
          if (d.draftStages !== undefined && !d.draftStages.includes(stage)) bump("STAGE", `${mode} seed=${seed} ${stage} ${seat} ${d.id}`);
          if (held.includes(d.id)) bump("OFFER_HELD_AGAIN", `${mode} seed=${seed} ${stage} ${seat} ${d.id}`);
          for (const h of held) {
            const ch = byId.get(h)?.conflicts ?? [];
            const cd = d.conflicts ?? [];
            if (ch.includes(d.id) || cd.includes(h)) bump("CONFLICT_OFFERED", `${mode} seed=${seed} ${stage} ${seat} ${d.id} vs held ${h}`);
          }
        }
      }
      // 좌석 간 겹침 (화면분 3장 기준 — 새로고침 교체분까지 포함하면 더 넓다)
      for (let a = 0; a < SEATS.length; a++) {
        for (let b = a + 1; b < SEATS.length; b++) {
          const A = shown.get(SEATS[a]!)!.slice(0, 3).map((d) => d.id);
          const B = shown.get(SEATS[b]!)!.slice(0, 3).map((d) => d.id);
          for (const id of A) if (B.includes(id)) bump("OFFER_OVERLAP", `${mode} seed=${seed} ${stage} ${SEATS[a]}×${SEATS[b]} ${id}`);
          const A6 = shown.get(SEATS[a]!)!.map((d) => d.id);
          const B6 = shown.get(SEATS[b]!)!.map((d) => d.id);
          for (const id of A6) if (B6.includes(id)) bump("OFFER_OVERLAP_6", `${mode} seed=${seed} ${stage} ${SEATS[a]}×${SEATS[b]} ${id}`);
        }
      }
      // 픽 — 무작위 (새로고침 포함 6장 중)
      for (const seat of SEATS) {
        const pool = shown.get(seat)!;
        if (pool.length === 0) continue;
        const chosen = pool[pickRng.int(pool.length)]!;
        try {
          draft.pick(stage, seat, chosen.id);
        } catch (e) {
          bump("PICK_THROW", `${mode} seed=${seed} ${stage} ${seat} ${chosen.id}: ${String(e).slice(0, 120)}`);
        }
      }
    }
    // 최종 보유 감사
    const owner = new Map<string, PlayerId>();
    for (const p of game.engine.state.players) {
      const held = [...p.augments];
      for (const id of held) {
        const prev = owner.get(id);
        if (prev !== undefined) {
          const holders = game.engine.state.players.filter((q) => q.augments.includes("cornucopia")).map((q) => q.id);
          bump("DUP_GAME", `${mode} seed=${seed} ${id}: ${prev}+${p.id} (cornucopia holders: ${holders.join(",") || "none"})`);
        }
        else owner.set(id, p.id);
      }
      const seen = new Set<string>();
      for (const id of held) {
        if (seen.has(id)) bump("DUP_SELF", `${mode} seed=${seed} ${p.id} ${id}`);
        seen.add(id);
      }
      for (let a = 0; a < held.length; a++)
        for (let b = a + 1; b < held.length; b++) {
          const x = held[a]!, y = held[b]!;
          if ((byId.get(x)?.conflicts ?? []).includes(y) || (byId.get(y)?.conflicts ?? []).includes(x))
            bump("CONFLICT_HELD", `${mode} seed=${seed} ${p.id}: ${x} + ${y}`);
        }
      for (const id of held) {
        const d = byId.get(id);
        if (d?.modes !== undefined && !d.modes.includes(mode)) bump("MODE_HELD", `${mode} seed=${seed} ${p.id} ${id}`);
      }
    }
  }
}

console.log(`=== ${N} seeds × 2 modes ===`);
for (const [k, v] of [...counts].sort((a, b) => b[1] - a[1])) {
  console.log(`\n[${k}] x${v}`);
  for (const e of examples.get(k) ?? []) console.log("   ", e);
}
if (counts.size === 0) console.log("위반 없음");
