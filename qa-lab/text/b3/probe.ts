/** b3 문구↔구현 대조 프로브 — 각 약속을 실제 엔진에서 밟아 본다. */
import {
  DEAD_WALL,
  FlowController,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { tileSplit } from "../../../packages/content/src/augments/tile_split.js";
import { meldDissolve } from "../../../packages/content/src/augments/meld_dissolve.js";
import { bluffPretense } from "../../../packages/content/src/augments/bluff_pretense.js";
import { evenWorld } from "../../../packages/content/src/augments/even_world.js";
import { pickyEater } from "../../../packages/content/src/augments/picky_eater.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});

function boot(st: GameState, defs: [AugmentDef, PlayerId][]) {
  const game = createStandardGameFromState(st);
  for (const [d, p] of defs) installAugment(game.engine, d, p, { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const s = flow.begin();
  return { game, flow, s };
}
const optsOf = (s: unknown, p: PlayerId) =>
  (s as { kind: string; prompts?: { player: PlayerId; options: { type: string; payload: unknown }[] }[] })
    .prompts?.find((x) => x.player === p)?.options ?? [];
const handStr = (st: GameState, p: PlayerId) =>
  st.zones[handZone(p)]!.tileIds
    .map((i) => `${kindKey(kindOf(st, i))}${st.tiles[i]!.attrs.red === true ? "(적)" : ""}`)
    .join(" ");

// ────────────────────────────────────────────────────────────────────
console.log("\n##### 1. tile_split — '가장 쓸모없는 잡패'가 적도라/도라를 태우는가");
{
  // 123m456m789m + 고립된 5p + 2s2s  (14장, 쯔모패 = 마지막 2s)
  let st = craft({
    hands: { p0: "123456789m5p22s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const pin5 = st.zones[handZone("p0")]!.tileIds.find((i) => kindKey(kindOf(st, i)) === "pin5")!;
  // 그 5통을 '패산에서 나온 진짜 적도라'로 만든다 + 도라 표시패를 4통으로 (5통 = 도라)
  const dw = st.zones[DEAD_WALL]!.tileIds;
  const pin4 = [...Object.values(st.tiles)].find(
    (t) => kindKey(t.kind) === "pin4" && dw.includes(t.id),
  );
  st = {
    ...st,
    tiles: { ...st.tiles, [pin5]: { ...st.tiles[pin5]!, attrs: { ...st.tiles[pin5]!.attrs, red: true } } },
    ...(pin4 !== undefined ? { round: { ...st.round, doraIndicators: [pin4.id as TileId] } } : {}),
  };
  console.log("  도라 표시패:", kindKey(kindOf(st, st.round.doraIndicators[0]!)),
    "→ 도라는", kindKey(kindOf(st, st.round.doraIndicators[0]!)) === "pin4" ? "pin5" : "(설정실패)");
  console.log("  발동 전 손패:", handStr(st, "p0"));
  const { game, flow, s } = boot(withAug(st, "p0", ["tile_split"]), [[tileSplit, "p0"]]);
  const splits = optsOf(s, "p0").filter((o) => o.type === "split_tile");
  // 9만을 4+5로 쪼갠다
  const man9 = game.engine.state.zones[handZone("p0")]!.tileIds.find(
    (i) => kindKey(kindOf(game.engine.state, i)) === "man9",
  )!;
  const opt = splits.find((o) => {
    const p = o.payload as { tileId: number; a: number };
    return p.tileId === man9 && p.a === 4;
  });
  console.log("  split 후보 수:", splits.length, " / 9만→4+5 후보:", opt !== undefined);
  if (opt !== undefined) {
    flow.submit("p0", opt);
    const st2 = game.engine.state;
    console.log("  발동 후 손패:", handStr(st2, "p0"));
    console.log(
      `  ⇒ 재료로 쓰인 패 = ${kindKey(kindOf(st2, pin5))} (원래 pin5(적)·도라)`,
      ` red 유지=${st2.tiles[pin5]!.attrs.red === true}`,
    );
  }
}

// ────────────────────────────────────────────────────────────────────
console.log("\n##### 2. meld_dissolve — '유일한 후로였다면 멘젠이 복구되어 다시 리치할 수 있다'");
{
  // p0: 펑 1개(333p) + 손패 10장(텐파이 형) → 해체하면 13장 멘젠 + 보충 1장 = 14장
  const st = craft({
    hands: { p0: "123456789m11p", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "333p", from: "p1" }] },
    discards: { p0: "1z" },
    phase: "turn.act",
    turnSeat: 0,
  });
  const { game, flow, s } = boot(withAug(st, "p0", ["meld_dissolve"]), [[meldDissolve, "p0"]]);
  const before = game.engine.state;
  console.log("  발동 전: 손패", before.zones[handZone("p0")]!.tileIds.length,
    "멘쯔", before.round.byPlayer.p0!.melds.length,
    "옵션", [...new Set(optsOf(s, "p0").map((o) => o.type))].join(","));
  const opt = optsOf(s, "p0").find((o) => o.type === "dissolve_meld");
  if (opt === undefined) { console.log("  후보 없음"); }
  else {
    const s2 = flow.submit("p0", opt);
    const st2 = game.engine.state;
    console.log("  해체 후: 손패", st2.zones[handZone("p0")]!.tileIds.length,
      "멘쯔", st2.round.byPlayer.p0!.melds.length,
      "lastDrawn", st2.round.lastDrawnTile,
      "p1바닥", st2.zones[discardsZone("p1")]!.tileIds.length);
    const types = [...new Set(optsOf(s2, "p0").map((o) => o.type))];
    console.log("  해체 후 옵션:", types.join(","));
    console.log("  ⇒ 리치 제시 =", types.includes("riichi"));
    console.log("  p1 discardedKinds:", st2.round.byPlayer.p1!.discardedKinds.join(" "),
      "/ p1 discardCount:", st2.round.byPlayer.p1!.discardCount,
      "/ p1 바닥 실물:", st2.zones[discardsZone("p1")]!.tileIds.map((i)=>kindKey(kindOf(st2,i))).join(" "));
  }
}

// ────────────────────────────────────────────────────────────────────
console.log("\n##### 3. bluff_pretense — '가장 고립된 잡패'가 적도라를 태우는가");
{
  let st = craft({
    hands: { p0: "123456789m5p1z", p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "1z" },
  });
  const pin5 = st.zones[handZone("p0")]!.tileIds.find((i) => kindKey(kindOf(st, i)) === "pin5")!;
  st = { ...st, tiles: { ...st.tiles, [pin5]: { ...st.tiles[pin5]!, attrs: { ...st.tiles[pin5]!.attrs, red: true } } } };
  console.log("  발동 전 손패:", handStr(st, "p0"));
  const { game, flow, s } = boot(withAug(st, "p0", ["bluff_pretense"]), [[bluffPretense, "p0"]]);
  const opt = optsOf(s, "p0").find((o) => o.type === "bluff_pon");
  console.log("  bluff_pon 후보:", opt !== undefined);
  if (opt !== undefined) {
    flow.submit("p0", opt);
    const st2 = game.engine.state;
    console.log("  발동 후 손패:", handStr(st2, "p0"));
    console.log("  멘쯔:", st2.round.byPlayer.p0!.melds.map((m)=>m.tileIds.map((i)=>kindKey(kindOf(st2,i))).join("")).join(","));
    console.log(`  ⇒ 재료 pin5(적) 의 지금 kind = ${kindKey(kindOf(st2, pin5))}, red=${st2.tiles[pin5]!.attrs.red === true}`);
  }
}

// ────────────────────────────────────────────────────────────────────
console.log("\n##### 4. even_world — 도라/적도라 보호가 실제로 도는가 (대조군)");
{
  let st = craft({
    hands: { p0: "1133557799m5p1z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const pin5 = st.zones[handZone("p0")]!.tileIds.find((i) => kindKey(kindOf(st, i)) === "pin5")!;
  const dw = st.zones[DEAD_WALL]!.tileIds;
  const man2 = [...Object.values(st.tiles)].find((t) => kindKey(t.kind) === "man2" && dw.includes(t.id));
  st = {
    ...st,
    tiles: { ...st.tiles, [pin5]: { ...st.tiles[pin5]!, attrs: { ...st.tiles[pin5]!.attrs, red: true } } },
    ...(man2 !== undefined ? { round: { ...st.round, doraIndicators: [man2.id as TileId] } } : {}),
  };
  console.log("  도라 표시패 man2 → 도라 man3 / 손패:", handStr(st, "p0"));
  const { game, flow, s } = boot(withAug(st, "p0", ["even_world"]), [[evenWorld, "p0"]]);
  const opt = optsOf(s, "p0").find((o) => o.type === "even_world_flip");
  if (opt !== undefined) {
    flow.submit("p0", opt);
    console.log("  발동 후 손패:", handStr(game.engine.state, "p0"));
  } else console.log("  후보 없음");
}

// ────────────────────────────────────────────────────────────────────
console.log("\n##### 5. picky_eater — 리치 중에도 발동되는가 (형제 증강 suit_unify는 막는다)");
{
  const base = craft({
    hands: { p0: "111222333444m5m", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "123456789s1z2z3z" }, // 삭 9장 + 자패 3장 = 12장, 한 무늬만
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const st: GameState = {
    ...withAug(base, "p0", ["picky_eater"]),
    round: {
      ...base.round,
      byPlayer: {
        ...base.round.byPlayer,
        p0: { ...base.round.byPlayer.p0!, riichi: { declaredTurn: 3, ippatsu: false, double: false } as never },
      },
    },
  };
  const { s } = boot(st, [[pickyEater, "p0"]]);
  const types = [...new Set(optsOf(s, "p0").map((o) => o.type))];
  console.log("  리치 중 p0 옵션:", types.join(","));
  console.log("  ⇒ picky_unify 제시 =", types.includes("picky_unify"));
}
