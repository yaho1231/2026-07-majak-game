/** 영상 정찰 — "왕패 장수는 그대로이며, 다음 영상패는 방금 내가 넣은 그 패가 된다" */
import { DEAD_WALL, FlowController, createStandardGameFromState, installAugment, kindKey, rinshanRemaining } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { rinshanPreview } from "../../../packages/content/src/augments/rinshan_preview.js";

const key = (s: GameState, t: number): string => kindKey(s.tiles[t]!.kind);
let s = craft({ hands: { p0: "111m222m333m44m55m5s", p1: "*", p2: "*", p3: "*" }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" });
s = { ...s, players: s.players.map((p) => (p.id === "p0" ? { ...p, augments: [...p.augments, "rinshan_preview"] } : p)) };
const game = createStandardGameFromState(s);
installAugment(game.engine, rinshanPreview, "p0", { yaku: game.yaku });
const flow = new FlowController(game.engine);
let cur: any = flow.begin();
const a: GameState = game.engine.state;
const drawn = a.round.lastDrawnTile!;
console.log(
  `전: 왕패 ${a.zones[DEAD_WALL]!.tileIds.length}장, 맨앞=${key(a, a.zones[DEAD_WALL]!.tileIds[0]!)}, ` +
    `손패 ${a.zones["hand:p0"]!.tileIds.length}장, 쯔모패=${key(a, drawn)}, 영상패남음=${rinshanRemaining(a)}`,
);
console.log(`보유자 왕패 열람 = ${JSON.stringify(game.engine.rules.resolve("visibility.deadWall", { playerId: "p0" as PlayerId, state: a }))} / 비보유자 = ${JSON.stringify(game.engine.rules.resolve("visibility.deadWall", { playerId: "p1" as PlayerId, state: a }))}`);
cur = flow.submit("p0", { type: "rinshan_pull", payload: {} });
const b: GameState = game.engine.state;
console.log(
  `후: 왕패 ${b.zones[DEAD_WALL]!.tileIds.length}장, 맨앞=${key(b, b.zones[DEAD_WALL]!.tileIds[0]!)} (내가 넣은 쯔모패=${key(b, drawn)}), ` +
    `손패 ${b.zones["hand:p0"]!.tileIds.length}장, 새 쯔모패=${key(b, b.round.lastDrawnTile!)}, 영상=${b.round.lastDrawRinshan}`,
);
console.log(`전원 공개 채널 = ${JSON.stringify(b.augmentData["view:*:rinshan_preview:p0#round"])}`);
