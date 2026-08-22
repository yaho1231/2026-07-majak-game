/**
 * Multiply 단계 3종(let_it_ride · jackpot · blood_contract)이 한 손에 겹칠 때.
 * let_it_ride/blood_contract 는 밑값을 winPoints 로 고정해 서로를 곱하지 않는데,
 * jackpot 만 **현재 delta** 를 밑값으로 써서 앞 단계가 얹은 몫까지 곱한다.
 */
import { createStandardGame, ROUND_SETTLED, installAugment } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { roundKey } from "@majak/content/util.js";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
function run(held: string[], label: string): void {
  const g = createStandardGame({
    seed: 11, playerIds: [...SEATS], mode: "hanchan", startScore: 25000,
    redFivesPerSuit: 1, extraAugments: contentAugments,
  } as never);
  for (const id of held) {
    g.engine.submit({ player: "p0", type: "draftPick", payload: { augmentId: id } });
    installAugment(g.engine, g.augments.get(id)!, "p0", { yaku: g.yaku, catalog: g.augments });
  }
  const st = g.engine.state;
  const rk = roundKey(st);
  const state = {
    ...st,
    augmentData: {
      ...st.augmentData,
      "let_it_ride:streak:p0": 3,                    // ×4
      [`jackpot:mult:${rk}:p0#round`]: 3,            // ×3
      [`blood_contract:yaku:${rk}:p0#round`]: "riichi", // ×1.5
    },
  };
  let ev: { type: string; payload: Record<string, unknown> } = {
    type: ROUND_SETTLED,
    payload: {
      outcome: "win",
      deltas: { p0: 8000, p1: -8000, p2: 0, p3: 0 },
      winInfos: [{ winner: "p0", points: 8000, yaku: [{ id: "riichi", han: 1 }], honbaBonus: 0, riichiPotGain: 0, winningTileId: 0 }],
      augPoints: [],
    },
  };
  const chain = (g.engine.effects as unknown as {
    interceptorsFor(t: string): { source: string; intercept: (e: unknown, c: unknown) => unknown }[];
  }).interceptorsFor(ROUND_SETTLED);
  for (const c of chain) {
    const next = c.intercept(ev, { state, rules: g.engine.rules }) as typeof ev | null;
    if (next === null) break;
    ev = next;
  }
  const d = ev.payload["deltas"] as Record<string, number>;
  const total = Object.values(d).reduce((a, b) => a + b, 0);
  console.log(`${label}\n  순서=[${chain.map((c) => c.source.replace("aug:p0:", "")).join(" -> ")}]`);
  console.log(`  deltas=${JSON.stringify(d)}  총합=${total} (뱅크 발행 ${total})`);
  console.log(`  augPoints=${JSON.stringify(ev.payload["augPoints"])}`);
}
run(["let_it_ride"], "let_it_ride 단독 (연승3 → ×4, 손 8000)");
run(["jackpot"], "jackpot 단독 (룰렛 ×3, 손 8000)");
run(["blood_contract"], "blood_contract 단독 (×1.5, 손 8000)");
run(["let_it_ride", "jackpot"], "let_it_ride + jackpot");
run(["let_it_ride", "jackpot", "blood_contract"], "셋 모두");
