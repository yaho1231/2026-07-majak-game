/**
 * 양극(polar_ends) × 동수의 결속(mixed_triplet) — **펑 판정의 짝짓기가 쌍(pair)별로만 본다.**
 *
 * `standardActions.ponAction.validate` 는 버려진 패 `target` 에 대해
 *   sameCallKind(손패 a, target) && sameCallKind(손패 b, target)
 * 만 본다. 두 증강을 함께 들면 `sameCallKind` 가 두 가지 서로 다른 규칙을 OR로 묶는다:
 *   · 동수의 결속: 랭크가 같으면 무늬 무관
 *   · 양극       : 같은 무늬의 1·9는 같은 패
 *
 * 기대(미리 적음): 몸통은 "한 규칙" 안에서 닫혀야 한다. 즉
 *   1만 버림 + 손패 9만(양극) + 1통(결속)  →  {1만,9만,1통} 은
 *   결속으로도(랭크가 1·9·1로 다르다) 양극으로도(무늬가 만·만·통으로 다르다)
 *   몸통이 아니므로 **거부되어야 한다**.
 * 실제로 열리면, 어느 카드도 약속하지 않은 몸통이 후로로 만들어진다.
 */
import {
  createStandardGameFromState,
  buildWinContext,
  evaluateWin,
  handZone,
  installAugment,
  kindKey,
  kindOf,
  winShapeOf,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { polarEnds } from "../../../packages/content/src/augments/polar_ends.js";
import { mixedTriplet } from "../../../packages/content/src/augments/mixed_triplet.js";

function scene(hand: string, discard: string, augs: AugmentDef[]) {
  let st: GameState = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 3,
    lastDiscard: { player: "p3", spec: discard },
  });
  st = {
    ...st,
    players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: augs.map((a) => a.id) } : p)),
  };
  const game = createStandardGameFromState(st);
  for (const a of augs) installAugment(game.engine, a, "p0", { yaku: game.yaku });
  return game;
}
type Game = ReturnType<typeof scene>;

function tileIn(g: Game, key: string): TileId {
  const ids = g.engine.state.zones[handZone("p0")]?.tileIds ?? [];
  const id = ids.find((t) => kindKey(kindOf(g.engine.state, t)) === key);
  if (id === undefined) throw new Error(`손에 없다: ${key}`);
  return id;
}

function ponCheck(g: Game, keys: [string, string]): string | null {
  const def = g.engine.actions.get("pon");
  if (def === undefined) throw new Error("no pon");
  return def.validate(
    { player: "p0" as PlayerId, type: "pon", payload: { tileIds: keys.map((k) => tileIn(g, k)) } } as never,
    { state: g.engine.state, rules: g.engine.rules } as never,
  );
}

const HAND = "9m1p234m567m99p11s2s"; // 9m(양극 파트너) + 1p(결속 파트너)
const cases: [string, AugmentDef[]][] = [
  ["없음", []],
  ["양극", [polarEnds]],
  ["결속", [mixedTriplet]],
  ["양극+결속", [polarEnds, mixedTriplet]],
];

console.log("### 1만 버림 + 손패 9만·1통 을 한 펑으로 부를 수 있는가");
for (const [n, augs] of cases) {
  const g = scene(HAND, "1m", augs);
  console.log(`  ${n.padEnd(10)} 9m+1p → ${ponCheck(g, ["man9", "pin1"]) ?? "**허용됨**"}`);
  console.log(`  ${"".padEnd(10)} 9m+9m → ${ponCheck(scene("99m1p234m567m99p11s", "1m", augs), ["man9", "man9"]) ?? "**허용됨**"} (양극: 순수 1·9 혼합)`);
  console.log(`  ${"".padEnd(10)} 1p+1s → ${ponCheck(scene("1p1s234m567m99p11s2s", "1m", augs), ["pin1", "sou1"]) ?? "**허용됨**"} (결속: 랭크 동일)`);
}

// 실제로 그 펑을 만들어 채점까지 — 몸통으로 인정되는가
console.log("\n### 그 펑을 손에 들고 화료하면 어떻게 채점되는가");
for (const [n, augs] of cases) {
  let st: GameState = craft({
    hands: { p0: "234m567m99p11s1s" },
    melds: { p0: [{ kind: "pon", spec: "1m9m1p", from: "p3" }] },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  } as never);
  st = { ...st, players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: augs.map((a) => a.id) } : p)) };
  const game = createStandardGameFromState(st);
  for (const a of augs) installAugment(game.engine, a, "p0", { yaku: game.yaku });
  const ids = game.engine.state.zones[handZone("p0")]?.tileIds ?? [];
  const ctx = buildWinContext(game.engine.state, "p0", "tsumo", ids[ids.length - 1] as TileId, {
    rules: game.engine.rules,
  });
  const ev = evaluateWin(ctx, game.yaku);
  console.log(
    `  ${n.padEnd(10)} ${ev === null ? "화료형 아님" : `yakuman=${ev.yakumanCount} han=${ev.han} fu=${ev.fu} :: ${ev.yaku.map((y) => `${y.id}(${y.han})`).join(" ")}`}`,
  );
}
