/**
 * 짝수의 세계(even_world) — detail: "바뀌지 않는 패가 둘 있다. ① 지금 도라인 홀수 패 —
 * 도라 값을 잃지 않도록 지킨다. ② 적도라(빨간 5)."
 * 실제로 도라 홀수 패가 지켜지는지 확인한다.
 */
import {
  DEAD_WALL, FlowController, createStandardGameFromState, doraKindFor,
  handZone, installAugment, kindKey, kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { evenWorld } from "../../../packages/content/src/augments/even_world.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st, players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});
const handStr = (st: GameState, p: PlayerId) =>
  st.zones[handZone(p)]!.tileIds
    .map((i) => `${kindKey(kindOf(st, i))}${st.tiles[i]!.attrs.red === true ? "(적)" : ""}`).join(" ");

function trial(indicatorKey: string, handSpec: string): void {
  let st = craft({
    hands: { p0: handSpec, p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  // 도라 표시패를 지정 종류로 (왕패 안의 실물을 골라 세운다 — 왕패 밖이면 만들지 않는다)
  const ind = st.round.doraIndicators[0] as TileId;
  const suit = indicatorKey.replace(/\d+$/, "") as "man" | "pin" | "sou";
  const rank = Number(indicatorKey.replace(/^\D+/, ""));
  st = { ...st, tiles: { ...st.tiles, [ind]: { ...st.tiles[ind]!, kind: { suit, rank } } } };
  const indKind = kindOf(st, st.round.doraIndicators[0]!);
  const doraKind = doraKindFor(indKind);
  console.log(`  표시패=${kindKey(indKind)} → 도라=${kindKey(doraKind)}`);
  console.log(`  발동 전: ${handStr(st, "p0")}`);
  const game = createStandardGameFromState(withAug(st, "p0", ["even_world"]));
  installAugment(game.engine, evenWorld, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const s = flow.begin();
  const opts = (s as { prompts?: { player: PlayerId; options: { type: string; payload: unknown }[] }[] })
    .prompts?.find((x) => x.player === "p0")?.options ?? [];
  const opt = opts.find((o) => o.type === "even_world_flip");
  if (opt === undefined) { console.log("  후보 없음"); return; }
  flow.submit("p0", opt);
  const after = game.engine.state;
  console.log(`  발동 후: ${handStr(after, "p0")}`);
  const doraKey = kindKey(doraKind);
  const kept = after.zones[handZone("p0")]!.tileIds.filter((i) => kindKey(kindOf(after, i)) === doraKey).length;
  console.log(`  ⇒ 손에 남은 도라(${doraKey}) 장수 = ${kept}  (발동 전엔 2장이었다)`);
}

console.log("A) 도라 = man3 (홀수). 손에 man3 2장.");
trial("man2", "1133557799m5p1z");
console.log("\nB) 도라 = man5 (홀수·적5와 같은 랭크). 손에 man5 2장.");
trial("man4", "1133557799m5p1z");
console.log("\nC) 도라 = sou7 (홀수). 손에 sou7 2장.");
trial("sou6", "1133557799s5p1z");
