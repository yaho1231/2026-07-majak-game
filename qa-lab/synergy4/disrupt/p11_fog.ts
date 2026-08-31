/**
 * P11 — 안개 두 장(hidden_river · brief_fog)을 한 사람이 들었을 때.
 *  - 각 카드는 «보유자만 네 바닥을 그대로 읽는다»고 약속한다. 둘 다 켜면 그 약속이 유지되는가.
 *  - 남에게는 두 겹으로 가려지는가(더 가려지면 안 된다 — 각자 6장/6순 창이 다르다).
 *  - 도굴(grave_rob)의 후보는 «전 좌석이 볼 수 있는 패»의 교집합이라 안개가 끼면 줄어야 한다.
 */
import { craft, setup, turnOptions, submit, view } from "../../synergy3/disrupt/lib.js";
import { discardsZone } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";

function build(augs: Record<string, string[]>) {
  const state: GameState = craft({
    hands: { p0: "234m678m678s23p33p9m", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "1m2m3m4m5m6m7m8m", p1: "4p1p2p3p5p6p7p8p", p2: "1z2z3z4z1s2s3s5s", p3: "9m9p9s7z6z5z4z1z" } as never,
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  } as never);
  return setup(state, augs);
}

function riverSeen(g: any, viewer: PlayerId): string {
  const v = view(g, viewer);
  return (["p0", "p1", "p2", "p3"] as PlayerId[])
    .map((p) => {
      const ids = g.engine.state.zones[discardsZone(p)]!.tileIds as number[];
      const known = ids.filter((id) => v.tiles[id] !== undefined).length;
      return `${p}:${known}/${ids.length}`;
    })
    .join(" ");
}

const CASES: [string, Record<string, string[]>, string[]][] = [
  ["없음", { p0: ["grave_rob"] }, []],
  ["p0 hidden_river", { p0: ["grave_rob", "hidden_river"] }, ["hidden_river"]],
  ["p0 brief_fog", { p0: ["grave_rob", "brief_fog"] }, ["brief_fog"]],
  ["p0 둘 다", { p0: ["grave_rob", "hidden_river", "brief_fog"] }, ["hidden_river", "brief_fog"]],
];

for (const [label, augs, activate] of CASES) {
  const g = build(augs);
  for (const a of activate) {
    const act = a === "hidden_river" ? "declare_fog" : "declare_brief_fog";
    const opt = turnOptions(g, "p0").find((o) => o.type === act);
    if (opt === undefined) { console.log(`  (${label}) ${a} 후보 없음: ${JSON.stringify([...new Set(turnOptions(g, "p0").map((o) => o.type))])}`); continue; }
    submit(g, "p0", opt.type, opt.payload);
  }
  console.log(`\n## ${label}`);
  for (const v of ["p0", "p1"] as PlayerId[]) console.log(`  ${v} 가 보는 바닥: ${riverSeen(g, v)}`);
  const rob = turnOptions(g, "p0").filter((o) => o.type === "grave_rob");
  console.log(`  도굴 후보 ${rob.length}개`);
}
