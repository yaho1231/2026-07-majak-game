/**
 * shape 의심 3 재검증 — mixed_nine_gates: 구련 뼈대 위에서는 **치·펑 판정에도** 무늬가 사라진다.
 *
 *   npx tsx qa-lab/verify-shape/repro_mng_call.ts
 *
 * `mixed_nine_gates.install`은 손이 구련 뼈대일 때 `scoring.mixedRuns` /
 * `mixedTriplets` / `mixedPairs`를 켠다. 이 규칙들은 채점 전용이 아니다 —
 *   치: core/mahjong/flow/standardActions.ts:461 (`opts.mixedRuns === true`)
 *   펑: :396-400 (`mixedTripletsFor` → `sameCallKind`)
 * 즉 후로 **가능 여부** 자체가 바뀐다. detail에는 "멘젠이어야 한다"만 있고
 * 후로 판정이 넓어진다는 말은 없다.
 */
import {
  createStandardGameFromState,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { mixedNineGates } from "../../packages/content/src/augments/mixed_nine_gates.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 무늬가 흩어진 구련 뼈대 13장 (랭크 1112345678999) */
const SKELETON = "11m1p2s3m4p5s6m7p8s9m9p9s";
/** 대조군 — 뼈대가 아닌 평범한 13장(같은 3m·4p·1m·1p를 갖고 있다) */
const PLAIN = "11m1p3m4p2s5s6m7p8s9m9p2p";

function scene(hand: string, discard: string, withAug: boolean): Game {
  const st: GameState = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 3,
    lastDiscard: { player: "p3", spec: discard },
  });
  const game = createStandardGameFromState(st);
  if (withAug) installAugment(game.engine, mixedNineGates, "p0", { yaku: game.yaku });
  return game;
}

function tileIn(game: Game, player: PlayerId, key: string): TileId {
  const state = game.engine.state;
  const id = (state.zones[handZone(player)]?.tileIds ?? []).find(
    (t) => kindKey(kindOf(state, t)) === key,
  );
  if (id === undefined) throw new Error(`손에 없다: ${key}`);
  return id;
}

function validate(game: Game, type: "chi" | "pon", keys: string[]): string {
  const def = game.engine.actions.get(type);
  if (def === undefined) throw new Error(`no ${type}`);
  const tileIds = keys.map((k) => tileIn(game, "p0", k));
  const r = def.validate(
    { player: "p0", type, payload: { tileIds } } as never,
    { state: game.engine.state, rules: game.engine.rules } as never,
  );
  return r === null ? "**허용됨**" : `거부: ${r}`;
}

const ROWS: Array<[string, "chi" | "pon", string, string[], string]> = [
  ["혼색 치 (3만 + 4통으로 2삭을 친다)", "chi", "2s", ["man3", "pin4"], SKELETON],
  ["혼색 펑 (1만 + 1통으로 1삭을 편다)", "pon", "1s", ["man1", "pin1"], SKELETON],
  ["동색 치 (정상 — 대조)", "chi", "1s", ["sou2", "sou3"], "11m1p2s3s5s6m7p8s9m9p9s2p"],
];

for (const [label, type, discard, keys, hand] of ROWS) {
  const off = validate(scene(hand, discard, false), type, keys);
  const on = validate(scene(hand, discard, true), type, keys);
  console.log(`${label.padEnd(34)} 증강OFF → ${off.padEnd(38)} 증강ON → ${on}`);
}

console.log("\n=== 대조: 뼈대가 아닌 손이면 켜지지 않는다 ===");
console.log(
  `혼색 치 (평범한 13장)              증강OFF → ${validate(scene(PLAIN, "2s", false), "chi", ["man3", "pin4"])}` +
  `   증강ON → ${validate(scene(PLAIN, "2s", true), "chi", ["man3", "pin4"])}`,
);

console.log("\n=== 후로한 뒤 무슨 일이 나는가 ===");
// 혼색 치를 하고 나면 melds.length>0 → onNineGatesPath가 false → mixedRuns가 꺼진다.
// 그 혼색 몸통을 든 채로 화료형·채점이 서는지 본다.
{
  const { buildWinContext, evaluateWin, discardsZone } = await import("@majak/core");
  const st = craft({
    // 후로 1개(혼색 치 2s3m4p) + 손패 10장 + 론패
    hands: { p0: "234m567m111z1p", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "chi", spec: "2s3m4p", from: "p3" }] },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "1p" },
  });
  const g = createStandardGameFromState(st);
  installAugment(g.engine, mixedNineGates, "p0", { yaku: g.yaku });
  const ron = g.engine.state.zones[discardsZone("p1")]?.tileIds[0] as TileId;
  const ev = evaluateWin(
    buildWinContext(g.engine.state, "p0", "ron", ron, { rules: g.engine.rules, from: "p1" }),
    g.yaku,
  );
  console.log(
    `혼색 치 몸통을 든 채 화료: ev=${ev===null?"null":"obj"} ok=${ev?.ok} reason=${(ev as never as {reason?:string})?.reason ?? "-"} yaku=${JSON.stringify(ev?.yaku?.map((y) => `${y.id}:${y.han}`) ?? [])} han=${ev?.han}`,
  );
}
