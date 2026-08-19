/** 밑장빼기 — "보이는 3장은 그대로 남아 있다" + "다음 쯔모를 맨 밑에서 빼온다" */
import { FlowController, WALL, createStandardGameFromState, installAugment, kindKey } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { bottomDeal } from "../../../packages/content/src/augments/bottom_deal.js";

const key = (s: GameState, t: number): string => kindKey(s.tiles[t]!.kind);
let s = craft({ hands: { p0: "111m222m333m44m55m5s", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
s = { ...s, players: s.players.map((p) => (p.id === "p0" ? { ...p, augments: [...p.augments, "bottom_deal"] } : p)) };
const game = createStandardGameFromState(s);
installAugment(game.engine, bottomDeal, "p0", { yaku: game.yaku });
const flow = new FlowController(game.engine);
let cur: any = flow.begin();
const a: GameState = game.engine.state;
const bottom3 = a.zones[WALL]!.tileIds.slice(-3);
console.log(`밑 3장 = ${bottom3.map((t) => key(a, t)).join(",")} (tileIds ${bottom3.join(",")})`);
console.log(`보유자 패산 열람=${JSON.stringify(game.engine.rules.resolve("visibility.wall", { playerId: "p0" as PlayerId, state: a }))} / 비보유자=${JSON.stringify(game.engine.rules.resolve("visibility.wall", { playerId: "p1" as PlayerId, state: a }))}`);

// p0가 예약하고 한 바퀴 돈 뒤 실제로 밑장을 뽑는지 본다
cur = flow.submit("p0", { type: "bottom_deal", payload: {} });
let guard = 0;
while (cur.kind === "awaiting" && guard++ < 30) {
  const p = cur.prompts[0];
  const st: GameState = game.engine.state;
  if (p.player === "p0" && st.round.phase === "turn.act" && st.round.lastDrawnTile !== null && guard > 1) {
    const got = st.round.lastDrawnTile;
    console.log(
      `p0 다음 쯔모 = ${key(st, got)} (tileId ${got}) → 예약한 밑장(${bottom3[2]})과 일치=${got === bottom3[2]}` +
        `\n지금 밑 3장 = ${st.zones[WALL]!.tileIds.slice(-3).join(",")} (밑장 하나가 빠지고 그 옆이 새 밑장)`,
    );
    break;
  }
  const d = p.options.find((o: any) => o.type === "discard") ?? p.options.find((o: any) => o.type === "pass") ?? p.options[0];
  cur = flow.submit(p.player, d);
}
