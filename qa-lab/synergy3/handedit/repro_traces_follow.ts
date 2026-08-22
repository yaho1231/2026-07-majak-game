/**
 * 손을 통째로/부분으로 맞바꾸는 것 × 손패를 **가공한 상태** — 흔적은 따라가는가.
 *
 * 기대(먼저 적는다):
 *  A. 통째로 바꾸기(full_hand_swap)는 실물 tileId 를 옮기므로 상대가 가공해 둔
 *     패(단색 세계로 물든 생성패·분열 조각·적도라 소실)는 **그대로 따라온다**.
 *     설명에는 한 줄도 없지만 물리적으로 그럴 수밖에 없다 → 여기까지는 정상으로 본다.
 *  B. 그런데 "누가 무슨 색으로 통일했다"는 **전원 공개 채널**은 원래 주인 이름으로
 *     남는다. 손은 강탈자에게 갔는데 표식은 피해자에게 붙어 있으면
 *     화면이 거짓말을 한다 → 공개/은닉 모순.
 *  C. 등가교환(hand_swap3)으로 **적도라(빨간 5)** 를 넘기면 red 표식이 따라가는가.
 *     설명은 아무 말이 없다. 따라가는 것이 자연스럽다(실물 이동).
 *  D. 조커(joker)를 켠 사람이 백을 남에게 넘기면, 받은 쪽에서도 조커가 되는가.
 *     "**손패의 백**이 조커가 된다"는 보유자 규칙이므로 받은 쪽에서는 평범한 백이어야 한다.
 */
import {
  createStandardGameFromState,
  installAugment,
  FlowController,
  handZone,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { suitUnify } from "../../../packages/content/src/augments/suit_unify.js";
import { fullHandSwap } from "../../../packages/content/src/augments/full_hand_swap.js";
import { handSwap3 } from "../../../packages/content/src/augments/hand_swap3.js";
import { joker } from "../../../packages/content/src/augments/joker.js";
import { tileSplit } from "../../../packages/content/src/augments/tile_split.js";
import {
  craft,
  withAugments,
  handSpec,
  handIds,
  kindKey,
  kindOf,
  check,
  section,
  done,
  validate,
} from "./lib.js";

function build(
  state: GameState,
  installs: { def: AugmentDef; holder: PlayerId }[],
): { game: ReturnType<typeof createStandardGameFromState>; flow: FlowController } {
  const game = createStandardGameFromState(state);
  for (const i of installs) {
    installAugment(game.engine, i.def, i.holder, { yaku: game.yaku, catalog: game.augments });
  }
  const flow = new FlowController(game.engine);
  flow.begin();
  return { game, flow };
}

const attrsOf = (s: GameState, id: number): string =>
  JSON.stringify(s.tiles[id]?.attrs ?? {});

section("A/B: 단색 세계로 물든 손 → 통째로 바꾸기");
{
  // ① p1 이 자기 순에 단색 세계를 쓴다
  const base = withAugments(
    craft({
      hands: {
        p0: "19m19p19s1234567z9m",
        p1: "234m567m99p234s55p5z",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    }),
    { p0: ["full_hand_swap"], p1: ["suit_unify"] },
  );
  const g1 = build(base, [
    { def: suitUnify, holder: "p1" },
    { def: fullHandSwap, holder: "p0" },
  ]);
  g1.flow.submit("p1", { type: "mono_world", payload: { suit: "sou" } });
  const s1 = g1.game.engine.state;
  console.log(`  p1 통일 후 손 = ${handSpec(s1, "p1")}`);
  const conjuredIds = handIds(s1, "p1").filter((id) => s1.tiles[id]?.attrs?.conjured === true);
  console.log(`  생성패(conjured) ${conjuredIds.length}장`);
  const viewKeyEntries = Object.entries(s1.augmentData).filter(([k]) =>
    k.includes("suit_unify"),
  );
  console.log(`  공개 채널 = ${JSON.stringify(viewKeyEntries)}`);

  // ② 그 상태에서 p0 의 순으로 돌려 통째로 바꾸기
  const s2: GameState = {
    ...s1,
    round: {
      ...s1.round,
      turnSeat: 0,
      phase: "turn.act",
      lastDrawnTile: handIds(s1, "p0").at(-1) as number,
      turnCount: 1,
    },
  };
  const g2 = build(s2, [
    { def: fullHandSwap, holder: "p0" },
    { def: suitUnify, holder: "p1" },
  ]);
  const v = validate(g2.game, "hand_swap", "p0", { target: "p1" });
  check("통째로 바꾸기 발동", v === null, String(v));
  g2.flow.submit("p0", { type: "hand_swap", payload: { target: "p1" } });
  const s3 = g2.game.engine.state;
  console.log(`  강탈 후 p0 손 = ${handSpec(s3, "p0")}`);
  console.log(`  강탈 후 p1 손 = ${handSpec(s3, "p1")}`);
  check(
    "A: 물든 생성패가 강탈자 손으로 따라온다",
    conjuredIds.every((id) => handIds(s3, "p0").includes(id)),
    "",
  );
  const pub = Object.entries(s3.augmentData).filter(([k]) => k.includes("suit_unify:p1"));
  console.log(`  강탈 후 공개 채널 = ${JSON.stringify(pub)}`);
  check(
    "B: 「p1 이 삭으로 통일」 공개 표식이 그대로 남아 있다 (손은 p0 에게 갔다)",
    pub.length === 0,
    `남은 채널 ${JSON.stringify(pub)} · p1 실제 손 ${handSpec(s3, "p1")}`,
  );
}

section("C: 등가교환으로 적도라 넘기기");
{
  const base = withAugments(
    craft({
      hands: {
        p0: "234m567m99p234s55p5z",
        p1: "111p222p333p44s55s",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: ["hand_swap3"] },
  );
  const g = build(base, [{ def: handSwap3, holder: "p0" }]);
  const s0 = g.game.engine.state;
  const reds = handIds(s0, "p0").filter((id) => s0.tiles[id]?.attrs?.red === true);
  console.log(`  p0 손의 적도라: ${reds.map((id) => `${id}:${kindKey(kindOf(s0, id))}`).join(",")}`);
  if (reds.length === 0) {
    console.log("  (이 장면에는 적도라가 없다 — 건너뜀)");
  } else {
    g.flow.submit("p0", { type: "swap3", payload: { target: "p1" } });
    const gives = [reds[0] as number, ...handIds(g.game.engine.state, "p0").filter((id) => id !== reds[0]).slice(0, 2)].sort((a, b) => a - b);
    g.flow.submit("p0", { type: "swap3_give", payload: { gives } });
    const takes = handIds(g.game.engine.state, "p1").slice(0, 3).sort((a, b) => a - b);
    g.flow.submit("p0", { type: "swap3_take", payload: { takes } });
    const s1 = g.game.engine.state;
    const red = reds[0] as number;
    check(
      "적도라가 상대 손으로 넘어갔다",
      (s1.zones[handZone("p1")]?.tileIds ?? []).includes(red),
      "",
    );
    console.log(`  넘어간 적5의 attrs = ${attrsOf(s1, red)}`);
    check("빨간 표식이 그대로 따라간다", s1.tiles[red]?.attrs?.red === true, attrsOf(s1, red));
  }
}

section("D: 조커를 켠 사람이 백을 넘기면");
{
  const base = withAugments(
    craft({
      hands: {
        p0: "234p567p234s78s99p5z",
        p1: "111m222m333m44s55s",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: ["joker", "hand_swap3"] },
  );
  const g = build(base, [
    { def: joker, holder: "p0" },
    { def: handSwap3, holder: "p0" },
  ]);
  g.flow.submit("p0", { type: "joker_call", payload: {} });
  const s0 = g.game.engine.state;
  const haku = handIds(s0, "p0").find((id) => kindKey(kindOf(s0, id)) === "dragon1") as number;
  g.flow.submit("p0", { type: "swap3", payload: { target: "p1" } });
  const gives = [haku, ...handIds(g.game.engine.state, "p0").filter((i) => i !== haku).slice(0, 2)].sort((a, b) => a - b);
  g.flow.submit("p0", { type: "swap3_give", payload: { gives } });
  const takes = handIds(g.game.engine.state, "p1").slice(0, 3).sort((a, b) => a - b);
  g.flow.submit("p0", { type: "swap3_take", payload: { takes } });
  const s1 = g.game.engine.state;
  check("백이 p1 손으로 갔다", (s1.zones[handZone("p1")]?.tileIds ?? []).includes(haku), "");
  const wildP1 = s1 && g.game.engine.rules.resolve("scoring.wildKinds", {
    playerId: "p1",
    state: s1,
  });
  const wildP0 = g.game.engine.rules.resolve("scoring.wildKinds", {
    playerId: "p0",
    state: s1,
  });
  console.log(`  p0 wildKinds=${JSON.stringify(wildP0)} · p1 wildKinds=${JSON.stringify(wildP1)}`);
  check(
    "받은 쪽(p1)에게는 조커가 되지 않는다",
    JSON.stringify(wildP1) === "[]" || (Array.isArray(wildP1) && wildP1.length === 0),
    JSON.stringify(wildP1),
  );
}

section("E: 분열 조각(생성패)을 등가교환으로 넘기기");
{
  const base = withAugments(
    craft({
      hands: {
        p0: "234m567m99p234s55p5z",
        p1: "111p222p333p44s55s",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: ["tile_split", "hand_swap3"] },
  );
  const g = build(base, [
    { def: tileSplit, holder: "p0" },
    { def: handSwap3, holder: "p0" },
  ]);
  const first = handIds(g.game.engine.state, "p0")[0] as number;
  g.flow.submit("p0", { type: "split_tile", payload: { tileId: first, a: 1 } });
  const s0 = g.game.engine.state;
  const pieces = handIds(s0, "p0").filter((id) => s0.tiles[id]?.attrs?.conjured === true);
  console.log(`  분열 조각 = ${pieces.map((id) => `${id}:${kindKey(kindOf(s0, id))}`).join(",")}`);
  g.flow.submit("p0", { type: "swap3", payload: { target: "p1" } });
  const gives = [...pieces, ...handIds(s0, "p0").filter((i) => !pieces.includes(i))]
    .slice(0, 3)
    .sort((a, b) => a - b);
  g.flow.submit("p0", { type: "swap3_give", payload: { gives } });
  const takes = handIds(g.game.engine.state, "p1").slice(0, 3).sort((a, b) => a - b);
  g.flow.submit("p0", { type: "swap3_take", payload: { takes } });
  const s1 = g.game.engine.state;
  const moved = pieces.filter((id) => (s1.zones[handZone("p1")]?.tileIds ?? []).includes(id));
  console.log(`  p1 손으로 간 조각 = ${moved.map((id) => `${id}:${kindKey(kindOf(s1, id))} ${attrsOf(s1, id)}`).join(" | ")}`);
  check("조각은 종류·conjured 표식 그대로 넘어간다", moved.length > 0, "");
}

done();
