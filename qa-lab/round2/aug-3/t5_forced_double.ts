/**
 * H5 — 등 떠밀기(push_riichi, prism)가 강제한 리치는 이중 선언(riichi_upgrade, gold)의
 *      "언제나 더블리치" 승격을 받지 못한다.
 *
 * 근거: 인터셉터 실행 순서는 layer 오름차순(Gold 200 → Prism 300)이라
 *   ① riichi_upgrade가 먼저 본다 → 그때 payload.riichi는 아직 false → 그대로 통과
 *   ② push_riichi가 riichi:true로 바꾼다 → riichiDouble은 끝내 안 붙는다
 *   ③ 코어는 riichiDouble이 undefined면 "첫 버림 + 첫 바퀴"로만 더블을 준다
 * 관측: riichiForced가 붙은 TILE_DISCARDED에서 riichiDouble이 undefined인가.
 */
import { runFocus } from "./focus.js";

let forced = 0, forcedNoDouble = 0, ownRiichi = 0, ownDouble = 0;
const samples: string[] = [];
for (let seed = 1; seed <= 60; seed++) {
  await runFocus({
    seed, mode: "tonpuu", noDraft: true,
    preset: { p0: ["push_riichi"], p1: ["riichi_upgrade"], p2: [], p3: [] },
    prefer: { p0: ["push_brand"] },
    riichi: { p1: false },   // p1은 스스로 리치하지 않는다 → 강제 리치만 관측
    onEvent: (e, st) => {
      if (e.type !== "TileDiscarded" || st === null) return;
      const p = e.payload as { player?: string; riichi?: boolean; riichiForced?: string; riichiDouble?: boolean };
      if (p.riichi !== true) return;
      const rs = st.round.byPlayer[String(p.player)];
      if (p.riichiForced !== undefined) {
        forced++;
        if (p.riichiDouble !== true) {
          forcedNoDouble++;
          if (samples.length < 6) {
            samples.push(`seed=${seed} player=${p.player} riichiForced=${p.riichiForced} riichiDouble=${String(p.riichiDouble)} double=${String(rs?.riichi?.double)} dc=${rs?.discardCount}`);
          }
        }
      } else if (p.player === "p1") {
        ownRiichi++;
        if (p.riichiDouble === true) ownDouble++;
      }
    },
    timeoutMs: 120_000,
  });
}
console.log(`forcedRiichi=${forced} forcedWithoutDouble=${forcedNoDouble} p1OwnRiichi=${ownRiichi} p1OwnDouble=${ownDouble}`);
console.log(samples.join("\n"));
