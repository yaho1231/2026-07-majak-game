/**
 * 영혼의 일격(soul_strike)을 **오야**가 쓰면 연속 6쯔모가 전부 "오야 쯔모"라
 * `round.turnCount`가 한 번에 +6 된다(flowEvents.ts:402는 오야가 뽑을 때마다 +1).
 * → 같은 테이블의 불가침 조약(no_ron_pact, "매 국 첫 6순") 이 즉사하고,
 *   뒤늦은 출진(late_double, "7순까지")의 창도 통째로 닫힌다.
 */
import { FlowController, createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { soulStrike } from "../../../packages/content/src/augments/soul_strike.js";
import { noRonPact } from "../../../packages/content/src/augments/no_ron_pact.js";

const base = craft({
  hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
const st: GameState = {
  ...base,
  players: base.players.map((p) =>
    p.id === "p0" ? { ...p, augments: ["soul_strike"] } : p.id === "p1" ? { ...p, augments: ["no_ron_pact"] } : p,
  ),
  round: { ...base.round, dealerSeat: 0, turnCount: 1 },
};
const g = createStandardGameFromState(st);
installAugment(g.engine, soulStrike, "p0", { yaku: g.yaku });
installAugment(g.engine, noRonPact, "p1", { yaku: g.yaku });
const immune = (): boolean => g.engine.rules.resolve<boolean>("win.ronImmune", { playerId: "p1", state: g.engine.state });

const flow = new FlowController(g.engine);
let status = flow.begin();
console.log(`시작: turnCount=${g.engine.state.round.turnCount} p1(불가침) ronImmune=${immune()}`);
const tile = g.engine.state.round.lastDrawnTile as TileId;
status = flow.submit("p0", { type: "soul_strike", payload: { tileId: tile } } as never);

// 이후 자동 진행: p0는 쯔모기리, 나머지는 pass
const ak = () => Object.entries(g.engine.state.augmentData).find(([k]) => k.startsWith("soul_strike:active"))?.[1];
for (let i = 0; i < 60 && status.kind === "awaiting"; i++) {
  if (ak() === false) break;
  const pr = status.prompts[0];
  if (pr === undefined) break;
  const pass = pr.options.find((o) => o.type === "pass");
  const disc =
    pr.options.find(
      (o) => o.type === "discard" && (o.payload as { tileId?: TileId }).tileId === g.engine.state.round.lastDrawnTile,
    ) ?? pr.options.find((o) => o.type === "discard");
  const pick = pass ?? disc ?? pr.options[0];
  if (pick === undefined) break;
  status = flow.submit(pr.player, pick);
}
console.log(`영혼의 일격 6쯔모 뒤: turnCount=${g.engine.state.round.turnCount} p1(불가침) ronImmune=${immune()}`);
console.log(`  p1 배너=${JSON.stringify(Object.entries(g.engine.state.augmentData).filter(([k]) => k.includes("no_ron_pact:p1")))}`);
