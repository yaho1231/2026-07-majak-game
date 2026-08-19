/**
 * 재현: 미래를 보는 자(future_sight) — **"한 번 누르면 취소할 수 없다"가 지켜지지 않는다.**
 *
 * detail: "자기 순에 버튼을 누르면 손패에서 뽑힌 무작위 3장이 제시된다. …
 *          **한 번 누르면 취소할 수 없고, 고르지 않으면 무작위로 한 장이 버려진다.**"
 *
 * 실제 구현:
 *  - `future_arm` 은 augmentData 플래그만 세운다(패도 순도 소비하지 않는다).
 *  - 무장 후 holderTurnOptions 는 교환 후보 3개를 내지만 **표준 discard 도 그대로 있다**.
 *  - 그냥 버리면 TILE_DISCARDED 리액션이 무장을 조용히 내린다(future_sight.ts:400-410).
 *  - 쿨다운 기준점(lastUsedKey)·스택은 **교환 리듀서에서만** 갱신되므로 아무 대가가 없다.
 *
 * 결과: 매 순 공짜로 무장해 "이번에 뽑히는 무작위 3장이 무엇인지"만 보고 물러날 수 있다.
 *       (손패 무작위 3장 = 내 패라 정보 이득은 작지만, 약속된 리스크가 통째로 사라진다.
 *        3순 쿨다운도 소모되지 않아 '무장→확인→취소'를 매 순 반복할 수 있다.)
 */
import { kindKey } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { runMatch2 } from "./run.js";
import { ScriptAgent } from "./agent.js";

const events: string[] = [];
let armCount = 0;
let cancelCount = 0;
let exchanged = 0;

const p0 = new ScriptAgent("p0", (prompt, view) => {
  const opts = prompt.options;
  const arm = opts.find((o) => o.type === "future_arm");
  const ex = opts.filter((o) => o.type === "future_exchange");
  const drawn = view?.round.myDrawnTile ?? null;
  const tsumogiri = opts.find(
    (o) => o.type === "discard" && (o.payload as { tileId?: number }).tileId === drawn,
  );

  if (arm !== undefined) {
    armCount++;
    events.push(`[순 ${armCount}] future_arm — 무장 (쿨다운 소모 없음)`);
    return arm;
  }
  if (ex.length > 0) {
    // 무장 뒤 제시된 '무작위 3장'을 확인만 하고 그냥 버린다 = 취소
    const kinds = ex.map((o) => {
      const t = (o.payload as { tileId: number }).tileId;
      return `${kindKey(view!.tiles[t]!.kind!)}#${t}`;
    });
    cancelCount++;
    events.push(`   뽑힌 3장을 확인: ${kinds.join(", ")} → 교환하지 않고 그냥 버린다(취소)`);
    return tsumogiri ?? opts.find((o) => o.type === "discard");
  }
  return tsumogiri;
});

const others = (["p1", "p2", "p3"] as PlayerId[]).map(
  (id) =>
    new ScriptAgent(id, (prompt, view) => {
      const pass = prompt.options.find((o) => o.type === "pass");
      if (pass !== undefined) return pass;
      const drawn = view?.round.myDrawnTile ?? null;
      return prompt.options.find(
        (o) => o.type === "discard" && (o.payload as { tileId?: number }).tileId === drawn,
      );
    }),
);

let snap: unknown = null;
const r = await runMatch2({
  seed: Number(process.argv[2] ?? 5),
  mode: "tonpuu",
  preset: { p0: ["future_sight"], p1: [], p2: [], p3: [] },
  agents: [p0, ...others],
  draftSchedules: [],
  onState: (st) => {
    if (armCount >= 3 && snap === null) {
      snap = Object.fromEntries(
        Object.entries(st.augmentData).filter(([k]) => k.startsWith("future_sight")),
      );
    }
  },
  timeoutMs: 120_000,
});
exchanged = p0.actionLog.filter((t) => t === "future_exchange").length;

console.log("--- 진행 (앞 8줄) ---");
for (const e of events.slice(0, 8)) console.log(" ", e);
console.log(`무장 횟수=${armCount} 확인 후 취소=${cancelCount} 실제 교환=${exchanged}`);
console.log("3회 무장 시점의 future_sight 상태:", JSON.stringify(snap));
console.log("crash:", r.crash ?? "-", "eff:", r.effectErrors.slice(0, 2));
