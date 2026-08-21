/** H3 — 불가침 조약의 전원 공개 채널(active)이 실제 상태와 어긋나는 구간 추적 */
import { runFocus } from "./focus.js";
import type { GameState } from "@majak/core";

const preset = {
  p0: ["no_ron_pact", "off_by_one"],
  p1: ["true_dragon", "broken_wall"],
  p2: ["no_ron_pact", "meld_dissolve"],
  p3: ["hidden_blade", "ankan_dora"],
};

function real(st: GameState, h: string): boolean {
  const rs = st.round.byPlayer[h];
  if (rs === undefined) return false;
  if ((rs.discardCount ?? 0) > 6) return false;
  if (rs.riichi != null) return false;
  const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
  if (st.augmentData[`no_ron_pact:declared:${rk}:${h}#round`] === true) return false;
  if ((rs.melds?.length ?? 0) > 0) return false;
  return true;
}

let lastEv = "";
const log: string[] = [];
const seenBad = new Set<string>();
await runFocus({
  seed: 17869,
  mode: "hanchan",
  noDraft: true,
  preset,
  riichi: { p1: true, p3: true },
  call: { p1: true, p2: true, p3: true },
  onEvent: (e) => { lastEv = e.type; },
  onState: (st) => {
    for (const h of ["p0", "p2"]) {
      const shown = st.augmentData[`view:*:no_ron_pact:active:${h}#round`];
      const r = real(st, h);
      const rk = `${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`;
      const rs = st.round.byPlayer[h];
      if (shown !== undefined && shown !== r) {
        const key = `${h}|${rk}|${String(shown)}|${rs?.discardCount}|${rs?.melds?.length}`;
        if (seenBad.has(key)) continue;
        seenBad.add(key);
        log.push(`MISMATCH ${h} round=${rk} shown=${String(shown)} real=${r} dc=${rs?.discardCount} melds=${rs?.melds?.length} riichi=${rs?.riichi != null} lastEvent=${lastEv}`);
      }
    }
  },
  timeoutMs: 150_000,
});
console.log(log.slice(0, 40).join("\n"));
console.log(`mismatches=${log.length}`);
