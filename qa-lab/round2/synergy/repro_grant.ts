/** VIOL seed=500273 tonpuu 재현 — p1 이 preset 에 없는 증강을 갖게 되는가 */
import { runMatch, PERSONAS } from "../../harness.js";
import type { PlayerId } from "@majak/core";

const preset = {p0:["discard_lock","frame_up","broken_wall"],p1:["push_riichi","triple_peek","take_back"],p2:["pond_snatch","blood_contract","cornucopia"],p3:["hand_swap3","unification","sign_flip"]};
const mx = [PERSONAS.masher!, PERSONAS.caller!, PERSONAS.riichiRusher!, PERSONAS.folder!];
const r = await runMatch({
  seed: 500273, mode: "tonpuu", preset: preset as never,
  personas: { p0: mx[0]!, p1: mx[1]!, p2: mx[2]!, p3: mx[3]! } as Record<PlayerId, never>,
  onRound: (st, phase) => {
    if (phase !== "start") return;
    console.log(`R ${st.round.prevalentWind}-${st.round.roundNumber}-${st.round.honba}`,
      st.players.map((p) => `${p.id}:[${p.augments.join(",")}]`).join(" "));
  },
  timeoutMs: 120000,
});
console.log("crash", r.crash);
console.log("granted keys:", Object.keys(Object.fromEntries(Object.entries({}))));
