/**
 * 재현 — 「국 첫 순 발동」 셰이프 선언 증강(동수의 결속 · 무너진 국경 · 비대칭)을
 * 둘 이상 함께 들었을 때 **같은 국에 둘 다 켜지는가**.
 *
 * 국마다 각 증강의 선언 액션이 몇 번 실행됐는지를 이벤트로 센다.
 *   tsx qa-lab/synergy4/build/repro_shape_firstturn.ts [seeds=6]
 */
import type { PlayerId } from "@majak/core";
import { runBuild } from "../../synergy3/build/run.js";

const N = Number(process.argv[2] ?? 6);
const IDS = ["mixed_triplet", "broken_border", "async_chiitoi"] as const;
const ACT: Record<string, string> = {
  declare_mixed_triplet: "mixed_triplet",
  declare_broken_border: "broken_border",
  declare_async_chiitoi: "async_chiitoi",
};

for (const set of [IDS, IDS.slice(0, 2)] as readonly (readonly string[])[]) {
  let rounds = 0;
  let bothRounds = 0;
  const per = new Map<string, number>();
  const roundsWithAny: number[] = [];
  for (let s = 1; s <= N; s++) {
    let cur = new Set<string>();
    const r = await runBuild({
      seed: s, mode: "hanchan",
      preset: { p0: set, p1: [], p2: [], p3: [] } as Record<PlayerId, readonly string[]>,
      onEvent: (e) => {
        const t = String(e.type ?? "");
        if (t === "RoundStarted") { cur = new Set(); }
        // 증강 액션은 ActionResolved / 커스텀 이벤트로 흐른다 — payload 안의 type 문자열로 잡는다
        const j = JSON.stringify(e.payload ?? {});
        for (const id of IDS) {
          // 선언은 augmentDataSet(roundViewKey("*", `${id}:${player}`), true) 로 남는다
          if (j.includes(`${id}:p0`)) cur.add(id);
        }
        void ACT;
        if (t === "RoundSettled") {
          rounds++;
          if (cur.size >= 2) bothRounds++;
          if (cur.size >= 1) roundsWithAny.push(cur.size);
          for (const id of cur) per.set(id, (per.get(id) ?? 0) + 1);
        }
      },
      timeoutMs: 300_000,
    });
    if (r.crash !== undefined) console.log(`crash s=${s}: ${r.crash.slice(0, 120)}`);
  }
  console.log(`set=${set.join("+")} 국=${rounds} 발동국=${roundsWithAny.length} 같은국에2개이상=${bothRounds} 내역=${JSON.stringify([...per])}`);
}
