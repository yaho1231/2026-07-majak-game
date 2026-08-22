/**
 * 누명(frame_up) × 바닥의 족보(bottom_yaku) — 대조군 4칸.
 *
 * 기대(먼저 적는다):
 *   bottom_yaku 의 description 은 "**내** 버림패가 판을 얹어 준다"이다.
 *   누명은 "그 사람이 버린 것으로 기록되어 후리텐에 걸린다"만 약속한다.
 *   → 피해자가 실제로 버리지 않은 패로 피해자의 '역류 통관'(1~9 완주)이 완성되면
 *     설명 어디에도 없는 일이다. 기대값: 심어도 피해자의 판수는 그대로(0판).
 */
import { evaluateWin, buildWinContext, kindKey } from "@majak/core";
import type { PlayerId } from "@majak/core";
import { frameUp } from "../../../packages/content/src/augments/frame_up.js";
import { bottomYaku } from "../../../packages/content/src/augments/bottom_yaku.js";
import {
  craft,
  withAugments,
  start,
  handIds,
  check,
  section,
  done,
  validate,
  type GameState,
} from "./lib.js";

/**
 * p1: 순수 텐파이(핑후형) — 234m 456m 789p 234s + 55s. 쯔모로 화료.
 * p1 의 바닥에는 만수 1~8 이 이미 깔려 있다(9만만 없다).
 * p0 손에 9만이 있어 누명으로 p1 바닥에 심을 수 있다.
 */
function scene(plant: boolean): GameState {
  const base = craft({
    hands: {
      // p0 : 9만을 쥔 채 누명을 쓸 수 있는 손 (내용은 중요치 않다)
      p0: "9m19p19s1234567z9m",
      p1: "234m456m789p234s55s",
      p2: "*",
      p3: "*",
    },
    discards: {
      // p1 이 실제로 버린 것: 만수 1~8 (9만 없음) → 역류 통관 미완성
      p1: "12345678m",
      p0: "1z2z",
      p2: "3z4z",
      p3: "5z6z",
    },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return withAugments(base, { p0: ["frame_up"], p1: ["bottom_yaku"] });
}

/** p1 이 지금 쯔모 화료하면 몇 판인가 */
function hanOf(state: GameState, game: ReturnType<typeof start>["game"]): number {
  const hand = handIds(state, "p1");
  const winTile = hand[hand.length - 1] as number;
  const ctx = buildWinContext(state, "p1", "tsumo", winTile, {
    rules: game.engine.rules,
  });
  const ev = evaluateWin(ctx, game.yaku);
  return ev?.han ?? -1;
}

/** p1 의 후리텐 이력 */
const hist = (s: GameState, p: PlayerId): string[] => [
  ...(s.round.byPlayer[p]?.discardedKinds ?? []),
];

section("누명 × 바닥의 족보 — 대조군");

// --- (없음) / (B: bottom_yaku 만) 기준선: 심지 않았을 때
{
  const st = scene(false);
  const { game } = start(st, [{ def: bottomYaku, holder: "p1" }]);
  const base = hanOf(game.engine.state, game);
  console.log(`  [B: bottom_yaku 만, 심기 없음] p1 판수 = ${base}`);
  check("기준선: 9만 미완주 → 역류 통관 없음", base >= 0, `han=${base}`);

  // (A+B) 누명으로 9만을 p1 바닥에 심는다
  const st2 = scene(true);
  const g2 = start(st2, [
    { def: frameUp, holder: "p0" },
    { def: bottomYaku, holder: "p1" },
  ]);
  const nineMan = handIds(g2.game.engine.state, "p0").find((id) => {
    const k = g2.game.engine.state.tiles[id]?.kind;
    return k?.suit === "man" && k.rank === 9;
  }) as number;
  const v = validate(g2.game, "frame_discard", "p0", {
    tileId: nineMan,
    target: "p1",
  });
  check("누명 validate 통과", v === null, String(v));
  const st3 = g2.flow!.submit("p0", {
    type: "frame_discard",
    payload: { tileId: nineMan, target: "p1" },
  });
  void st3;
  const after = g2.game.engine.state;
  console.log(`  p1 버림 이력 = ${hist(after, "p1").join(",")}`);
  console.log(`  p0 버림 이력 = ${hist(after, "p0").join(",")}`);
  const withPlant = hanOf(after, g2.game);
  console.log(`  [A+B: 누명으로 9만 심음] p1 판수 = ${withPlant}`);

  check(
    "기대: 심어도 p1 판수 불변",
    withPlant === base,
    `기준 ${base}판 → 심은 뒤 ${withPlant}판 (차이 ${withPlant - base})`,
  );
  check(
    "p1 이 버리지도 않은 9만이 이력에 새겨졌다",
    hist(after, "p1").includes(kindKey({ suit: "man", rank: 9 })),
    "",
  );
}

// --- 역방향: 보유자 자신의 bottom_yaku 는 심은 만큼 깎이는가
section("누명 × 자기 바닥의 족보 (같은 사람이 둘 다)");
{
  // p0 이 둘 다 보유. 만수 1~8 을 버려 두고 9만을 표준으로 버리면 완주.
  const mk = (): GameState =>
    withAugments(
      craft({
        hands: {
          p0: "234m456m789p234s55s",
          p1: "*",
          p2: "*",
          p3: "*",
        },
        discards: { p0: "12345678m", p1: "1z", p2: "2z", p3: "3z" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      { p0: ["frame_up", "bottom_yaku"] },
    );
  // 9만을 손에 넣기 위해 손패 마지막을 9만으로 바꾼다
  const base = mk();
  const handP0 = handIds(base, "p0");
  const nine = Object.values(base.tiles).find(
    (t) => t.kind.suit === "man" && t.kind.rank === 9,
  );
  const st: GameState = {
    ...base,
    tiles: {
      ...base.tiles,
      [handP0[13] as number]: {
        ...(base.tiles[handP0[13] as number] as never),
        kind: { suit: "man", rank: 9 },
      },
    },
  };
  void nine;
  const g = start(st, [
    { def: frameUp, holder: "p0" },
    { def: bottomYaku, holder: "p0" },
  ]);
  const tileId = handIds(g.game.engine.state, "p0")[13] as number;
  g.flow!.submit("p0", { type: "frame_discard", payload: { tileId, target: "p1" } });
  const after = g.game.engine.state;
  console.log(`  p0 이력 = ${hist(after, "p0").join(",")}`);
  console.log(`  p1 이력 = ${hist(after, "p1").join(",")}`);
  check(
    "누명으로 흘린 9만은 내 이력에 남지 않는다 (역류 통관 미완성)",
    !hist(after, "p0").includes("man9"),
    "",
  );
}

done();
