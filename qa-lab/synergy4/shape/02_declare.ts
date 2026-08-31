/**
 * 02 — «국의 첫 순에만» 발동하는 형 완화 3종(동수의 결속·무너진 국경·비대칭)을
 * 같은 국에 둘·셋 함께 켤 수 있는가. 켰다면 scoringOptionsOf가 전부 싣는가.
 */
import {
  createStandardGameFromState,
  installAugment,
  scoringOptionsOf,
  handZone,
  kindOf,
  isWinningShape,
} from "@majak/core";
import type { AugmentDef, GameState, PlayerId } from "@majak/core";
import { contentAugments } from "@majak/content";
import { craft } from "../../../packages/content/test/helpers.js";

const byId = new Map(contentAugments.map((d) => [d.id, d]));
const def = (id: string): AugmentDef => {
  const d = byId.get(id);
  if (d === undefined) throw new Error(`no augment ${id}`);
  return d;
};

const DECLARES: [string, string][] = [
  ["mixed_triplet", "declare_mixed_triplet"],
  ["broken_border", "declare_broken_border"],
  ["async_chiitoi", "declare_async_chiitoi"],
];

function scene(ids: string[], hand: string) {
  let st: GameState = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  st = { ...st, players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: ids } : p)) };
  const game = createStandardGameFromState(st);
  for (const id of ids) installAugment(game.engine, def(id), "p0", { yaku: game.yaku });
  return game;
}

console.log("=== 02 첫 순 형 선언 3종의 동시 발동 ===\n");

for (const combo of [
  ["mixed_triplet", "broken_border"],
  ["mixed_triplet", "async_chiitoi"],
  ["broken_border", "async_chiitoi"],
  ["mixed_triplet", "broken_border", "async_chiitoi"],
]) {
  // 14장(마지막 한 장 쯔모 상태) — 선언만 하므로 손 내용은 무관
  const game = scene(combo, "123456789m1234p");
  const results: string[] = [];
  for (const id of combo) {
    const action = DECLARES.find(([i]) => i === id)?.[1] as string;
    const r = game.engine.submit({ player: "p0" as PlayerId, type: action, payload: {} } as never) as
      { ok: boolean; reason?: string };
    results.push(`${id}=${r.ok ? "OK" : `거부(${r.reason})`}`);
  }
  const opts = scoringOptionsOf(game.engine.state, game.engine.rules, "p0");
  console.log(`  [${combo.join("+")}]`);
  console.log(`     제출: ${results.join("  ")}`);
  console.log(`     scoringOptions: ${JSON.stringify(opts)}`);
}

console.log("\n=== 02b 둘을 켠 뒤 실제 화료형 (결속+국경) ===");
{
  // 2만2통2삭(혼색커쯔) + 2만3통4삭(혼색슌쯔) + 567m + 234p + 11z
  const hand = "2m2p2s2m3p4s567m234p11z";
  const game = scene(["mixed_triplet", "broken_border"], hand);
  const before = scoringOptionsOf(game.engine.state, game.engine.rules, "p0");
  for (const a of ["declare_mixed_triplet", "declare_broken_border"]) {
    game.engine.submit({ player: "p0" as PlayerId, type: a, payload: {} } as never);
  }
  const after = scoringOptionsOf(game.engine.state, game.engine.rules, "p0");
  const st = game.engine.state;
  const kinds = (st.zones[handZone("p0")]?.tileIds ?? []).map((t) => kindOf(st, t));
  console.log(`  손 ${hand}`);
  console.log(`  선언 전 opts=${JSON.stringify(before)} 화료형=${isWinningShape(kinds, 0, before)}`);
  console.log(`  선언 후 opts=${JSON.stringify(after)}  화료형=${isWinningShape(kinds, 0, after)}`);
}
