/**
 * 실제 재구성 경로(createStandardGameFromState + rebuildAugments = 이어하기/리플레이)로
 * seat_swap 뒤 정산 순서가 원본과 갈리는지 본다.
 */
import { Prng, createStandardGame, createStandardGameFromState, DraftController,
  hanchanConfigForMode, rebuildAugments, ROUND_SETTLED } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { SEATS } from "../../cross/lib.js";

const settleOrder = (engine: any): string[] =>
  engine.effects.interceptorsFor(ROUND_SETTLED).map((e: any) => e.source).filter((s: string) => /^aug:p\d:/.test(s));

const N = Number(process.argv[2] ?? 60);
let diff = 0, sameSeatDiff = 0, games = 0;
const ex: string[] = [];
for (let i = 0; i < N; i++) {
  const seed = 900_000 + i;
  const game = createStandardGame({ seed, playerIds: [...SEATS], mode: "hanchan",
    startScore: 25000, redFivesPerSuit: 1, extraAugments: contentAugments } as never) as any;
  const rng = new Prng(seed * 13 + 7);
  const draft = new DraftController(game.engine, game.augments, { yaku: game.yaku, catalog: game.augments });
  for (const stage of hanchanConfigForMode("hanchan").draftSchedules!) {
    const shown = new Map<PlayerId, string[]>();
    for (const seat of SEATS) {
      const { choices, rerolls } = draft.rollWithRerolls(stage, seat as PlayerId);
      shown.set(seat as PlayerId, [...choices, ...rerolls].map((d) => d.id));
    }
    for (const seat of SEATS) {
      const pool = shown.get(seat as PlayerId)!; if (pool.length === 0) continue;
      draft.pick(stage, seat as PlayerId, pool[rng.int(pool.length)]!);
    }
  }
  games++;
  const live = settleOrder(game.engine);

  // ① 대조군: 자리 그대로 재구성 → 순서가 같아야 한다
  const ctl = createStandardGameFromState(game.engine.state, undefined, contentAugments) as any;
  rebuildAugments(ctl.engine, ctl.augments, { yaku: ctl.yaku, catalog: ctl.augments });
  if (JSON.stringify(live) !== JSON.stringify(settleOrder(ctl.engine))) sameSeatDiff++;

  // ② seat_swap 이 한 일과 같은 상태 변화 (p0 ↔ p2 자리) 뒤 재구성
  const st = game.engine.state;
  const s0 = st.players.find((p: any) => p.id === "p0").seat;
  const s2 = st.players.find((p: any) => p.id === "p2").seat;
  const swapped = { ...st, players: st.players.map((p: any) =>
    p.id === "p0" ? { ...p, seat: s2 } : p.id === "p2" ? { ...p, seat: s0 } : p) };
  const rb = createStandardGameFromState(swapped, undefined, contentAugments) as any;
  rebuildAugments(rb.engine, rb.augments, { yaku: rb.yaku, catalog: rb.augments });
  const after = settleOrder(rb.engine);
  if (JSON.stringify(live) !== JSON.stringify(after)) {
    diff++;
    if (ex.length < 3) ex.push(`seed=${seed}\n   원본:   ${live.join(" ")}\n   교환후: ${after.join(" ")}`);
  }
}
console.log(`${games} 게임: 자리 그대로 재구성 불일치 ${sameSeatDiff} / p0↔p2 교환 후 재구성 불일치 ${diff}`);
for (const e of ex) console.log("\n" + e);
