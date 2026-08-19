/**
 * 재현: 붉은 손길(red_five_touch)의 각인이 **증강으로 손에 들어온 패를 놓친다**.
 *
 * 각인 훅은 ROUND_STARTED / TILE_DRAWN / CALL_MADE 세 개뿐이다(red_five_touch.ts:235-245).
 * 무르기(take_back)의 교체 쯔모는 커스텀 리듀서가 패산에서 손으로 직접 옮기므로
 * TILE_DRAWN 이 발행되지 않는다 → 지정한 숫자를 새로 받아도 적도라가 되지 않는다.
 *
 * 이 스크립트는 **p0 가 행동을 요구받는 시점의 자기 뷰**만 본다 — 리액션이 전부
 * 적용된 뒤의 상태라 타이밍 오해가 없다.
 *
 * 기대(description): "그 뒤로 내 손에 들어오는 그 숫자가 게임이 끝날 때까지 전부 적도라"
 * 실제: 무르기로 받은 그 숫자는 적도라가 아니다.
 */
import { handZone, isNumberSuit, kindKey } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { runMatch2 } from "./run.js";
import { ScriptAgent } from "./agent.js";

const events: string[] = [];
let markedRank: number | null = null;
let misses = 0;

const p0 = new ScriptAgent("p0", (prompt, view) => {
  const opts = prompt.options;
  // 1) 아직 각인 전이면 손패에 가장 많은 숫자를 골라 각인한다
  if (markedRank === null) {
    const red = opts.filter((o) => o.type === "red_touch");
    if (red.length > 0) {
      const counts = new Map<number, number>();
      for (const id of view!.zones[handZone("p0")]?.tileIds ?? []) {
        const k = view!.tiles[id]?.kind;
        if (k !== undefined && isNumberSuit(k)) counts.set(k.rank, (counts.get(k.rank) ?? 0) + 1);
      }
      let best = red[0]!;
      let bc = -1;
      for (const o of red) {
        const rank = (o.payload as { rank: number }).rank;
        const c = counts.get(rank) ?? 0;
        if (c > bc) { bc = c; best = o; }
      }
      markedRank = (best.payload as { rank: number }).rank;
      events.push(`p0: 숫자 ${markedRank} 각인 (손에 ${bc}장)`);
      return best;
    }
  }
  // 2) 각인 뒤에는 매 순 무르기를 눌러 본다
  //    (누르기 직전에 손패 각인 상태를 확인한다)
  if (markedRank !== null) {
    const hand = view!.zones[handZone("p0")]?.tileIds ?? [];
    const bad: string[] = [];
    for (const id of hand) {
      const t = view!.tiles[id];
      const k = t?.kind;
      if (k === undefined || !isNumberSuit(k) || k.rank !== markedRank) continue;
      const attrs = t?.attrs as { red?: boolean; redFor?: string } | undefined;
      if (attrs?.red !== true) bad.push(`${kindKey(k)}#${id} attrs=${JSON.stringify(attrs)}`);
    }
    if (bad.length > 0) {
      misses++;
      if (events.length < 12) {
        events.push(
          `p0 뷰: 각인 숫자 ${markedRank} 인데 적도라가 아닌 손패 ${bad.length}장 → ${bad.join(", ")} (직전 액션=${lastAction})`,
        );
      }
    }
    const tb = opts.find((o) => o.type === "take_back");
    if (tb !== undefined) {
      lastAction = "take_back";
      return tb;
    }
  }
  const drawn = view?.round.myDrawnTile ?? null;
  lastAction = "discard";
  return opts.find(
    (o) => o.type === "discard" && (o.payload as { tileId?: number }).tileId === drawn,
  );
});
let lastAction = "-";

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

const r = await runMatch2({
  seed: Number(process.argv[2] ?? 7000),
  mode: "tonpuu",
  preset: { p0: ["red_five_touch", "take_back"], p1: [], p2: [], p3: [] },
  agents: [p0, ...others],
  draftSchedules: [],
  timeoutMs: 120_000,
});

console.log("--- 진행 ---");
for (const e of events) console.log(" ", e);
console.log(`각인 숫자=${markedRank} 미각인 관측=${misses}회`);
console.log("crash:", r.crash ?? "-", "eff:", r.effectErrors.slice(0, 2));
