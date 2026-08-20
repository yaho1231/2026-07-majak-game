/**
 * 의심 1 재검증 — pond_snatch가 패산을 +1 늘리는가, 그리고 문구가 그것을 말하는가.
 * 의심 7도 같은 자리에서 본다 — round.lastDiscard 가 주워 간 패를 계속 가리키는가.
 */
import {
  FlowController, WALL, createStandardGameFromState, discardsZone, handZone,
  installAugment, kindKey, kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { pondSnatch } from "../../packages/content/src/augments/pond_snatch.js";
import { silentSwap } from "../../packages/content/src/augments/silent_swap.js";
import { graveRob } from "../../packages/content/src/augments/grave_rob.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});

const base = craft({
  hands: { p0: "123456789m123p5s9s", p1: "*", p2: "*", p3: "*" },
  discards: { p1: "1z2z", p2: "3z4z", p3: "5z6z" },
  phase: "turn.act",
  turnSeat: 0,
  drawnLastFor: "p0",
  lastDiscard: { player: "p3", spec: "7p" },
});
const st = withAug(base, "p0", ["pond_snatch"]);
const game = createStandardGameFromState(st);
installAugment(game.engine, pondSnatch, "p0", { yaku: game.yaku });
const flow = new FlowController(game.engine);
let s = flow.begin();
if (s.kind !== "awaiting") throw new Error("no prompt");

const before = game.engine.state;
const wallBefore = before.zones[WALL]!.tileIds.length;
const ld0 = before.round.lastDiscard;
console.log(`발동 전  패산=${wallBefore}  lastDiscard=${ld0 === null ? "null" : `${ld0.player}/${ld0.tileId}(${kindKey(kindOf(before, ld0.tileId))})`}`);

const opts = s.prompts.find((x) => x.player === "p0")?.options ?? [];
// 방금 버려진 패(=lastDiscard)를 그대로 줍는다
const target = opts.find(
  (o) => o.type === "pond_snatch" && (o.payload as { snatchId: TileId }).snatchId === ld0!.tileId,
);
if (target === undefined) throw new Error("lastDiscard 를 줍는 후보가 없다");
s = flow.submit("p0", target as never);

const after = game.engine.state;
const wallAfter = after.zones[WALL]!.tileIds.length;
const ld1 = after.round.lastDiscard;
const snatched = ld0!.tileId;
const inHand = after.zones[handZone("p0")]!.tileIds.includes(snatched);
const inPond = after.zones[discardsZone("p3")]!.tileIds.includes(snatched);
console.log(`발동 후  패산=${wallAfter}  (Δ=${wallAfter - wallBefore})`);
console.log(`주운 패 ${snatched}: p0 손패에 있는가=${inHand} / p3 바닥에 남아 있는가=${inPond}`);
console.log(`lastDiscard = ${ld1 === null ? "null" : `${ld1.player}/${ld1.tileId}`}  ← 주운 패와 같은가: ${ld1?.tileId === snatched}`);

// 문구 대조
const has = (t: string | undefined, s2: string): boolean => (t ?? "").includes(s2);
for (const a of [pondSnatch, silentSwap, graveRob]) {
  const d = a.detail ?? "";
  console.log(
    `[문구] ${a.id.padEnd(12)} "패산 맨 밑"=${has(d, "패산 맨 밑") || has(d, "패산으로 돌아")}  "국이 길어진다"=${has(d, "길어진다")}`,
  );
}

// ── 의심 7의 영향: 비보유자 뷰에서 그 패는 어디에 있는가
{
  const { buildPlayerView } = await import("@majak/core");
  for (const viewer of ["p1", "p2", "p3"] as PlayerId[]) {
    const v = buildPlayerView(after, viewer, game.engine.rules);
    const zonesWith = Object.entries(v.zones)
      .filter(([, z]) => z.tileIds.includes(snatched))
      .map(([k]) => k);
    console.log(
      `  ${viewer} 뷰: tiles[${snatched}]=${v.tiles[snatched] === undefined ? "없음" : kindKey(v.tiles[snatched]!.kind)}` +
        ` · 보이는 존=${zonesWith.length === 0 ? "(없음)" : zonesWith.join(",")}` +
        ` · lastDiscard=${v.round.lastDiscard === null ? "null" : `${v.round.lastDiscard.player}/${v.round.lastDiscard.tileId}`}`,
    );
  }
  console.log(
    `  실제 소재 = p0 손패(비공개) · p3 바닥에는 없다  → round.lastDiscard 가 "바닥에 있는 마지막 버림패"라는 전제를 깬다`,
  );
}
