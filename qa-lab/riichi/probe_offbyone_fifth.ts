/**
 * 한 끗 차이(off_by_one)가 **이미 4장이 다 나온 오름패의 5번째 장**을 만들어 내는가.
 *
 * 시나리오: p0가 3p/9s 샹퐁 대기로 리치. 3p는 p0가 2장, p1이 2장 — 세상에 남은 3p는 0장이다.
 * p0가 4p를 쯔모하면 off_by_one이 그 4p를 3p로 "밀어" 화료시킨다 → 3p가 5장이 된다.
 */
import { FlowController, createStandardGameFromState, installAugment, WALL, kindKey } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { offByOne } from "../../packages/content/src/augments/off_by_one.js";

const base = craft({
  hands: {
    p0: "123m456m789m33p99s",          // 13장, 3p/9s 샹퐁 대기
    p1: "33p11122233344s",             // 3p 나머지 2장을 p1이 쥔다 (13장)
    p2: "555m666m777m888m9m",          // 통수를 비워 둔다
    p3: "111m222m333m444m1p",
  },
  phase: "turn.draw",
  turnSeat: 0,
});

// 패산 맨 위를 4p로 바꾼다 (sys.draw는 wall[0]을 뽑는다)
const wall = [...base.zones[WALL]!.tileIds];
const DEAD = "deadWall";
const dead = [...(base.zones[DEAD]?.tileIds ?? [])];
let fourPin = wall.find((id) => kindKey(base.tiles[id]!.kind) === "pin4");
let zonesPatch: Record<string, unknown> = {};
if (fourPin === undefined) {
  // 왕패에 있으면 패산 맨 앞과 맞바꾼다
  fourPin = dead.find((id) => kindKey(base.tiles[id]!.kind) === "pin4");
  if (fourPin === undefined) throw new Error("no 4p anywhere");
  const head = wall[0]!;
  const newDead = dead.map((id) => (id === fourPin ? head : id));
  zonesPatch = { [DEAD]: { ...base.zones[DEAD]!, tileIds: newDead } };
  wall[0] = fourPin;
}
const reordered = [fourPin, ...wall.filter((id) => id !== fourPin)];

const st: GameState = {
  ...base,
  zones: { ...base.zones, ...zonesPatch, [WALL]: { ...base.zones[WALL]!, tileIds: reordered } },
  players: base.players.map((p) => (p.id === "p0" ? { ...p, augments: ["off_by_one"] } : p)),
  round: {
    ...base.round,
    byPlayer: {
      ...base.round.byPlayer,
      p0: {
        ...base.round.byPlayer["p0"]!,
        riichi: { double: false, ippatsu: false, discardIndex: 0, cost: 1000 },
      },
    },
  },
};

const count = (s: GameState, key: string): number =>
  Object.values(s.tiles).filter((t) => kindKey(t.kind) === key).length;

console.log(`쯔모 전: pin3=${count(st, "pin3")} pin4=${count(st, "pin4")}`);

const game = createStandardGameFromState(st);
installAugment(game.engine, offByOne, "p0", { yaku: game.yaku });
const flow = new FlowController(game.engine);
const status = flow.begin();
const after = game.engine.state;
console.log(
  `쯔모 후: pin3=${count(after, "pin3")} pin4=${count(after, "pin4")} ` +
    `드로우패종류=${kindKey(after.tiles[after.round.lastDrawnTile as TileId]!.kind)}`,
);
if (status.kind === "awaiting") {
  const opts = status.prompts.find((p) => p.player === "p0")?.options ?? [];
  console.log(`p0 win 후보=${opts.filter((o) => o.type === "win").length}`);
}
