/** 나머지 담당 증강의 약속(설명/detail) 대조 — 극단 타이밍 */
import {
  DEAD_WALL,
  FlowController,
  WALL,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  kindKey,
  kindOf,
  uraIndicatorIds,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { conjureDraw } from "../../packages/content/src/augments/conjure_draw.js";
import { deadWallMaster } from "../../packages/content/src/augments/dead_wall_master.js";
import { tableFlip } from "../../packages/content/src/augments/table_flip.js";
import { genesis } from "../../packages/content/src/augments/genesis.js";
import { tileSplit } from "../../packages/content/src/augments/tile_split.js";
import { threeDragonsWill } from "../../packages/content/src/augments/three_dragons_will.js";
import { evenWorld } from "../../packages/content/src/augments/even_world.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});
const zlen = (st: GameState, z: string): number => st.zones[z]?.tileIds.length ?? 0;
const totalTiles = (st: GameState): number =>
  Object.values(st.zones).reduce((n, z) => n + z.tileIds.length, 0);

function boot(st: GameState, defs: { def: never; p: PlayerId }[]) {
  const game = createStandardGameFromState(st);
  for (const d of defs) installAugment(game.engine, d.def, d.p, { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const s = flow.begin();
  return { game, flow, s };
}

console.log("### 1) 소환(conjure_draw) — 리치 중에도 발동되는가");
{
  const base = craft({
    hands: { p0: "123456789m1122p", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "3s" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const st: GameState = {
    ...withAug(base, "p0", ["conjure_draw"]),
    round: {
      ...base.round,
      byPlayer: {
        ...base.round.byPlayer,
        p0: {
          ...base.round.byPlayer.p0!,
          riichi: { declaredTurn: 1, ippatsu: false, double: false, tileId: 0 as TileId } as never,
        },
      },
    },
  };
  const { s } = boot(st, [{ def: conjureDraw as never, p: "p0" }]);
  const o = s.kind === "awaiting" ? (s.prompts.find((x) => x.player === "p0")?.options ?? []) : [];
  const n = o.filter((x) => x.type === "conjure_tsumo").length;
  console.log(`  리치 중 conjure_tsumo 후보 = ${n}`);
  console.log(
    n > 0
      ? "  ⚠ 리치 중에도 발동된다 — honor_return 주석이 말하는 '리치 중엔 손 관련 액티브 정지' 규약에서 혼자 벗어나 있다"
      : "  리치 중 차단됨",
  );
}

console.log("\n### 2) 왕패의 주인 — 깡으로 줄어든 왕패 · 도라 표시패 교체 · 뒷도라");
{
  const base = craft({
    hands: { p0: "123456789m1122p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  // 깡 3번이 이미 난 국을 흉내낸다 — 왕패 앞 3장을 p3 손패로 옮기지 않고 그냥 제거하면
  // 패 총량이 깨지므로, 실제로는 kanCount만 올리고 왕패에서 3장을 빼 p3 바닥에 둔다.
  const dw = [...(base.zones[DEAD_WALL]?.tileIds ?? [])];
  const moved = dw.splice(0, 3);
  const st0: GameState = {
    ...base,
    zones: {
      ...base.zones,
      [DEAD_WALL]: { ...(base.zones[DEAD_WALL] as never), tileIds: dw },
      [discardsZone("p3")]: {
        ...(base.zones[discardsZone("p3")] as never),
        tileIds: [...(base.zones[discardsZone("p3")]?.tileIds ?? []), ...moved],
      },
    },
    round: { ...base.round, kanCount: 3 },
  };
  const st = withAug(st0, "p0", ["dead_wall_master"]);
  console.log(`  왕패=${zlen(st, DEAD_WALL)} (깡 3회), 도라표시패=${st.round.doraIndicators.join(",")}`);
  const { game, flow, s } = boot(st, [{ def: deadWallMaster as never, p: "p0" }]);
  const opts = s.kind === "awaiting" ? (s.prompts.find((x) => x.player === "p0")?.options ?? []) : [];
  const swaps = opts.filter((o) => o.type === "dw_swap");
  const maxIdx = Math.max(...swaps.map((o) => (o.payload as { deadIndex: number }).deadIndex));
  console.log(`  dw_swap 후보=${swaps.length}, 최대 deadIndex=${maxIdx} (왕패 ${zlen(st, DEAD_WALL)}장)`);
  // 지금 공개된 도라 표시패 자리를 노린다
  const indId = st.round.doraIndicators[0] as TileId;
  const indIdx = (st.zones[DEAD_WALL]?.tileIds ?? []).indexOf(indId);
  const target = swaps.find((o) => (o.payload as { deadIndex: number }).deadIndex === indIdx);
  console.log(`  도라 표시패 자리 index=${indIdx}, 그 자리 후보 존재=${target !== undefined}`);
  if (target !== undefined) {
    const before = { total: totalTiles(game.engine.state), dw: zlen(game.engine.state, DEAD_WALL) };
    flow.submit("p0", target as { type: string; payload: unknown });
    const st2 = game.engine.state;
    console.log(`  교환 후: 패 총량 ${before.total}→${totalTiles(st2)}, 왕패 ${before.dw}→${zlen(st2, DEAD_WALL)}`);
    console.log(`  새 도라표시패=${st2.round.doraIndicators.map((i) => kindKey(kindOf(st2, i))).join(",")}`);
    console.log(`  뒷도라 표시패 id=${uraIndicatorIds(st2).join(",")} (왕패 안=${uraIndicatorIds(st2).every((i) => (st2.zones[DEAD_WALL]?.tileIds ?? []).includes(i))})`);
    console.log(`  손패=${zlen(st2, handZone("p0"))}`);
  }
}

console.log("\n### 3) 밥상 뒤엎기 — 패산 총량 · 쯔모패 · 반복 발동");
{
  const base = craft({
    hands: { p0: "123456789m1122p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const st = withAug(base, "p0", ["table_flip"]);
  const { game, flow, s } = boot(st, [{ def: tableFlip as never, p: "p0" }]);
  const w0 = zlen(st, WALL);
  const opt = s.kind === "awaiting" ? s.prompts.find((x) => x.player === "p0")?.options.find((o) => o.type === "table_flip_do") : undefined;
  console.log(`  발동 가능=${opt !== undefined}, 패산=${w0}`);
  if (opt !== undefined) {
    const s2 = flow.submit("p0", opt as { type: string; payload: unknown });
    const st2 = game.engine.state;
    const hand = st2.zones[handZone("p0")]?.tileIds ?? [];
    console.log(`  후: 패산=${zlen(st2, WALL)} 손패=${hand.length} 총량=${totalTiles(st2)}`);
    console.log(`  쯔모패=${st2.round.lastDrawnTile} 손 안=${hand.includes(st2.round.lastDrawnTile as TileId)} 마지막=${hand.at(-1) === st2.round.lastDrawnTile}`);
    const again = s2.kind === "awaiting" ? s2.prompts.find((x) => x.player === "p0")?.options.some((o) => o.type === "table_flip_do") : false;
    console.log(`  같은 순 재발동 가능=${again} (매 국 1회 약속)`);
  }
}

console.log("\n### 4) 개벽 — 패산이 텅 빈 순(하이테이)에 발동");
{
  const base = craft({
    hands: { p0: "123456789m1122p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  // 패산을 통째로 p3 바닥으로 옮겨 0장으로 만든다 (총량 보존)
  const wall = base.zones[WALL]?.tileIds ?? [];
  const st0: GameState = {
    ...base,
    zones: {
      ...base.zones,
      [WALL]: { ...(base.zones[WALL] as never), tileIds: [] },
      [discardsZone("p3")]: {
        ...(base.zones[discardsZone("p3")] as never),
        tileIds: [...(base.zones[discardsZone("p3")]?.tileIds ?? []), ...wall],
      },
    },
  };
  const st = withAug(st0, "p0", ["genesis"]);
  const { game, flow, s } = boot(st, [{ def: genesis as never, p: "p0" }]);
  const opt = s.kind === "awaiting" ? s.prompts.find((x) => x.player === "p0")?.options.find((o) => o.type === "genesis_flip") : undefined;
  console.log(`  패산=0 에서 발동 가능=${opt !== undefined}`);
  if (opt !== undefined) {
    flow.submit("p0", opt as { type: string; payload: unknown });
    const st2 = game.engine.state;
    const hand = st2.zones[handZone("p0")]?.tileIds ?? [];
    console.log(`  후: 손패=${hand.length} 총량=${totalTiles(st2)} 패산=${zlen(st2, WALL)}`);
    console.log(`  손패 kinds=${hand.map((i) => kindKey(kindOf(st2, i))).join(" ")}`);
    console.log(`  쯔모패 손 안=${hand.includes(st2.round.lastDrawnTile as TileId)} 마지막=${hand.at(-1) === st2.round.lastDrawnTile}`);
  }
}

console.log("\n### 5) 분열 — 랭크 경계 · 재료 · 손패 장수");
{
  const base = craft({
    hands: { p0: "9m2p3p4p5p6p7p1s5s9s1z4z7z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const st = withAug(base, "p0", ["tile_split"]);
  const { game, flow, s } = boot(st, [{ def: tileSplit as never, p: "p0" }]);
  const opts = s.kind === "awaiting" ? (s.prompts.find((x) => x.player === "p0")?.options ?? []) : [];
  const sp = opts.filter((o) => o.type === "split_tile");
  const as = new Set(sp.map((o) => (o.payload as { a: number }).a));
  console.log(`  split 후보=${sp.length}, a 값들=${[...as].sort().join(",")}`);
  const nine = sp.find((o) => {
    const p = o.payload as { tileId: TileId; a: number };
    return kindOf(st, p.tileId).rank === 9 && p.a === 4;
  });
  if (nine !== undefined) {
    const h0 = zlen(st, handZone("p0"));
    flow.submit("p0", nine as { type: string; payload: unknown });
    const st2 = game.engine.state;
    const hand = st2.zones[handZone("p0")]?.tileIds ?? [];
    console.log(`  9→4+5 후: 손패 ${h0}→${hand.length}, 총량=${totalTiles(st2)}`);
    console.log(`  손패=${hand.map((i) => kindKey(kindOf(st2, i))).join(" ")}`);
  }
}

console.log("\n### 6) 삼원의 의지 — 재료가 완성 몸통을 먹는가 (detail이 경고한 그대로인지)");
{
  const base = craft({
    hands: { p0: "555666z7z789m789p2s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const st = withAug(base, "p0", ["three_dragons_will"]);
  const { game, flow, s } = boot(st, [{ def: threeDragonsWill as never, p: "p0" }]);
  const opt = s.kind === "awaiting" ? s.prompts.find((x) => x.player === "p0")?.options.find((o) => o.type === "dragons_will") : undefined;
  console.log(`  발동 가능=${opt !== undefined}`);
  if (opt !== undefined) {
    const before = (st.zones[handZone("p0")]?.tileIds ?? []).map((i) => kindKey(kindOf(st, i)));
    flow.submit("p0", opt as { type: string; payload: unknown });
    const st2 = game.engine.state;
    const after = (st2.zones[handZone("p0")]?.tileIds ?? []).map((i) => kindKey(kindOf(st2, i)));
    console.log(`  전: ${before.join(" ")}`);
    console.log(`  후: ${after.join(" ")}`);
    console.log(`  손패 장수 ${before.length}→${after.length}, 총량=${totalTiles(st2)}`);
  }
}

console.log("\n### 7) 짝수의 세계 — 도라 홀수패 유지 · 적5 유지 · 9→8");
{
  const base = craft({
    hands: { p0: "1133557799m1122p", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const st = withAug(base, "p0", ["even_world"]);
  const doraInd = st.round.doraIndicators[0] as TileId;
  console.log(`  도라표시패=${kindKey(kindOf(st, doraInd))}`);
  const { game, flow, s } = boot(st, [{ def: evenWorld as never, p: "p0" }]);
  const opt = s.kind === "awaiting" ? s.prompts.find((x) => x.player === "p0")?.options.find((o) => o.type === "even_world_flip") : undefined;
  if (opt !== undefined) {
    const before = (st.zones[handZone("p0")]?.tileIds ?? []).map((i) => kindKey(kindOf(st, i)));
    const s2 = flow.submit("p0", opt as { type: string; payload: unknown });
    const st2 = game.engine.state;
    const after = (st2.zones[handZone("p0")]?.tileIds ?? []).map((i) => kindKey(kindOf(st2, i)));
    console.log(`  전: ${before.join(" ")}`);
    console.log(`  후: ${after.join(" ")}`);
    const again = s2.kind === "awaiting" ? s2.prompts.find((x) => x.player === "p0")?.options.some((o) => o.type === "even_world_flip") : false;
    console.log(`  같은 순 재발동=${again} (2국에 1회 약속)`);
  }
}
