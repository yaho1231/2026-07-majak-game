/**
 * 혼 사냥 — "리치 **대신** 붙는 +1판"인가, 아니면 내 리치에 **덧붙는가**.
 * 실행: tsx qa-lab/score-b/t_soulhunt.ts
 */
import type { GameState } from "@majak/core";
import { craft, lastSettled, setDeadWallKind, start } from "./scene.js";

const say = (s: string): void => { console.log(s); };

function scene(p0Riichi: boolean, p1Riichi: boolean): GameState {
  let s = craft({
    hands: { p0: "123m123p123s678s9s", p1: "*", p2: "*", p3: "*" },
    discards: { p1: "9s" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "9s" },
  });
  s = setDeadWallKind(s, 4, { suit: "sou", rank: 8 }); // 표도라 = 9s
  s = setDeadWallKind(s, 5, { suit: "sou", rank: 2 }); // 뒷도라 = 3s
  const R = { double: false, ippatsu: false, discardIndex: 0, cost: 1000 };
  return {
    ...s,
    round: {
      ...s.round,
      riichiPot: (p0Riichi ? 1000 : 0) + (p1Riichi ? 1000 : 0),
      byPlayer: {
        ...s.round.byPlayer,
        ...(p0Riichi ? { p0: { ...s.round.byPlayer.p0!, riichi: { ...R } } } : {}),
        ...(p1Riichi ? { p1: { ...s.round.byPlayer.p1!, riichi: { ...R } } } : {}),
      },
    },
  };
}

function run(label: string, s: GameState, give: Record<string, string[]>): void {
  const { flow } = start(s, give as never);
  const st = flow.submit("p0", { type: "win", payload: {} });
  if (st.kind !== "roundOver") { say(`${label}: 화료 실패 ${st.kind}`); return; }
  const w = lastSettled(flow).winInfos?.[0];
  say(
    `${label}: han=${w?.han} yaku=${(w?.yaku ?? []).map((y) => `${y.id}:${y.han}`).join(",")} ` +
    `dora=${w?.doraHan} ura=${w?.uraHan} pts=${w?.points}`,
  );
}

run("S1 소울헌트 없음 · 나 리치X · 상대 리치O", scene(false, true), { p0: [] });
run("S2 소울헌트 · 나 리치X · 상대 리치O", scene(false, true), { p0: ["soul_hunt"] });
run("S3 소울헌트 없음 · 나 리치O · 상대 리치O", scene(true, true), { p0: [] });
run("S4 소울헌트 · 나 리치O · 상대 리치O  ← '리치 대신'이면 S3와 같아야 한다", scene(true, true), { p0: ["soul_hunt"] });
run("S5 소울헌트 · 나 리치O · 상대 리치X", scene(true, false), { p0: ["soul_hunt"] });
run("S6 소울헌트 · 나 리치X · 상대 리치X", scene(false, false), { p0: ["soul_hunt"] });
