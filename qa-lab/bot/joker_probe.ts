/**
 * 조커가 켜진 손에서 **봇의 버림 판단**이 어떻게 달라지는가.
 *
 * shape 담당이 확정한 것은 `shantenOf`의 와일드 근사가 치또이·국사를 잃어
 * "텐파이를 노텐으로 읽는다"까지다. 여기서는 그 뿌리가 **버림 선택**을 바꾸는지를 본다.
 *
 *   tsx qa-lab/bot/joker_probe.ts
 */
import { shantenOf, winningKinds } from "@majak/core";
import type { TileKind } from "@majak/core";
import { botScene, h } from "../../packages/server/test/botTestView.js";
import { buildRead } from "../../packages/server/src/bot/read.js";
import { bidDiscard, bidRiichi } from "../../packages/server/src/bot/discard.js";
import { readPlan } from "../../packages/server/src/bot/read.js";
import { profileOf } from "../../packages/server/src/bot/profile.js";
import { Prng } from "@majak/core";

const HAKU: TileKind = { suit: "dragon", rank: 1 };
const key = (k: TileKind): string =>
  k.suit === "dragon" ? `${k.rank + 4}z` : k.suit === "wind" ? `${k.rank}z` : `${k.rank}${k.suit[0]}`;

const CASES: { name: string; hand: string }[] = [
  // 치또이 1샹텐 + 백 (백이 조커면 치또이가 훨씬 가까워진다)
  { name: "치또이 1샹텐 + 백", hand: "1133m5577p99s2z5z" },
  // 치또이 텐파이 + 백
  { name: "치또이 텐파이(백 단기)", hand: "1133m5577p9922s5z" },
  // 국사 텐파이 + 백
  { name: "국사 13면 + 백", hand: "19m19p19s1234567z" },
  // 평범한 4멘쯔 손 (대조군)
  { name: "평범한 1샹텐 + 백", hand: "123m456p789s22m5z" },
];

for (const c of CASES) {
  const kinds = h(c.hand);
  for (const joker of [false, true]) {
    const opts = joker ? { wildKinds: [HAKU] } : {};
    const scene = botScene({ hand: c.hand, turnCount: 6, scoringOptions: opts as never });
    const read = buildRead(scene.view, "p0", { mode: "hanchan" });
    const plan = readPlan(read, null as never);
    const prof = profileOf("balanced");
    const bid = bidDiscard(read, scene.discardOptions(), plan, prof, new Prng(1));
    const riichi = bidRiichi(read, scene.riichiOptions(), plan, prof);
    const chosen = bid?.option as { payload?: { tileId?: number } } | undefined;
    const tid = chosen?.payload?.tileId;
    const dk = tid === undefined ? "?" : key(scene.view.tiles[tid]!.kind);
    console.log(
      `${c.name.padEnd(20)} joker=${joker ? "ON " : "OFF"} shantenOf=${shantenOf(kinds, 0, opts as never)} read.shanten=${read.shanten} tenpai=${read.tenpai} waits=${read.waits.length} 버림=${dk} riichiBid=${riichi === null ? "-" : Math.round(riichi.value)}`,
    );
  }
  console.log(
    `   실제 대기(winningKinds, 조커 옵션): ${winningKinds(kinds, 0, undefined, { wildKinds: [HAKU] } as never)
      .map(key)
      .join(",") || "없음"}`,
  );
}
