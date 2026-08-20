/**
 * 의심 6 재검증 — suit_unify(단색 세계)로 물들이면 적도라가 사라지는가.
 * 집계를 tileId 단위로 다시 짠다(이전 스크립트의 집계·출력 불일치 해소).
 * 대조군: tile_dyeing 은 같은 사실을 detail에 ⚠로 명시한다.
 */
import {
  FlowController, WALL, createStandardGameFromState, handZone, installAugment,
  kindKey, kindOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { suitUnify } from "../../packages/content/src/augments/suit_unify.js";
import { tileDyeing } from "../../packages/content/src/augments/tile_dyeing.js";
import { pickyEater } from "../../packages/content/src/augments/picky_eater.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});
const dump = (st: GameState, p: PlayerId): string =>
  st.zones[handZone(p)]!.tileIds
    .map((i) => `${i}:${kindKey(kindOf(st, i))}${st.tiles[i]!.attrs.red === true ? "(적)" : ""}`)
    .join(" ");
const redIds = (st: GameState, p: PlayerId): number[] =>
  st.zones[handZone(p)]!.tileIds.filter((i) => st.tiles[i]!.attrs.red === true);

// p0 손패에 실제 적5(만·통·삭 각 1장)를 심는다
let st = craft({
  hands: { p0: "123455m5s678s22z", p1: "*", p2: "*", p3: "*" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
});
// 각 무늬의 5 중 한 장씩을 적도라로
for (const suit of ["man", "sou"]) {
  const id = st.zones[handZone("p0")]!.tileIds.find(
    (i) => kindKey(kindOf(st, i)) === `${suit}5`,
  )!;
  st = { ...st, tiles: { ...st.tiles, [id]: { ...st.tiles[id]!, attrs: { ...st.tiles[id]!.attrs, red: true } } } };
}
// 패산에 남은 적5도 세어 둔다 (교환으로 우연히 들어올 수 있다)
const wallRed = st.zones[WALL]!.tileIds.filter((i) => st.tiles[i]!.attrs.red === true).length;

const game = createStandardGameFromState(withAug(st, "p0", ["suit_unify"]));
installAugment(game.engine, suitUnify, "p0", { yaku: game.yaku });
const flow = new FlowController(game.engine);
const s = flow.begin();
if (s.kind !== "awaiting") throw new Error("no prompt");

console.log(`발동 전 손패: ${dump(game.engine.state, "p0")}`);
console.log(`발동 전 손패 적도라 = ${redIds(game.engine.state, "p0").length}장 (패산에 남은 적5 = ${wallRed}장)`);

const opt = (s.prompts.find((x) => x.player === "p0")?.options ?? []).find(
  (o) => o.type === "mono_world" && (o.payload as { suit: string }).suit === "pin",
);
if (opt === undefined) throw new Error("pin 통일 후보가 없다");
flow.submit("p0", opt as never);
const after = game.engine.state;
console.log(`발동 후 손패: ${dump(after, "p0")}`);
console.log(`발동 후 손패 적도라 = ${redIds(after, "p0").length}장`);
console.log(
  `잃은 적도라: ${redIds(game.engine.state === after ? st : st, "p0").length - redIds(after, "p0").length}장 (만5적·삭5적이 무늬가 바뀌며 소멸)`,
);
// 총량 검사 — 물러난 적5는 패산으로 되돌아갔는가(실물 교환) 아니면 red가 지워졌는가
const allRed = Object.values(after.tiles).filter((t) => t.attrs.red === true).length;
const allRedBefore = Object.values(st.tiles).filter((t) => t.attrs.red === true).length;
console.log(`판 전체 적5 실물 수: 발동 전 ${allRedBefore} → 발동 후 ${allRed}`);

// 문구 대조
for (const a of [suitUnify, pickyEater, tileDyeing]) {
  const d = `${a.description ?? ""}\n${a.detail ?? ""}`;
  console.log(
    `[문구] ${a.id.padEnd(12)} 적도라 언급=${d.includes("적도라") || d.includes("빨간")}  리치 언급=${d.includes("리치")}`,
  );
}
