/**
 * 조커가 켜진 배패에서 봇이 **국사 배패를 구종구패로 지워 버리는가.**
 *
 * `bot/abort.ts`는 "국사무쌍이 살아 있으면 유찰하지 않는다"를 `shantenOf(hand, meld, opts)`
 * 하나로 판단한다(주석: "증강이 국사 조건을 넓힌 손도 여기서 저절로 걸린다").
 * 그런데 `opts.wildKinds`가 있으면 `shantenOf`는 국사·치또이 분기를 건너뛴다.
 *
 *   tsx qa-lab/bot/abort_joker_probe.ts
 */
import { shantenOf } from "@majak/core";
import type { ActionOption } from "@majak/core/mahjong/flow/FlowController.js";
import type { TileKind } from "@majak/core";
import { botScene, h } from "../../packages/server/test/botTestView.js";
import { buildRead } from "../../packages/server/src/bot/read.js";
import { bidAbort } from "../../packages/server/src/bot/abort.js";

const HAKU: TileKind = { suit: "dragon", rank: 1 };
const KYUSHU: ActionOption = { type: "kyushuKyuhai", payload: {} } as never;

const HANDS = [
  { name: "국사 1샹텐 배패 (요구패 13종 중 12종 + 백)", spec: "19m19p19s12345z5z7z" },
  { name: "국사 13면 텐파이 배패", spec: "19m19p19s1234567z" },
  { name: "요구패 9종 잡손 (백 포함)", spec: "19m19p1s1234z5z55m" },
];

for (const c of HANDS) {
  for (const joker of [false, true]) {
    const opts = joker ? { wildKinds: [HAKU] } : {};
    const scene = botScene({ hand: c.spec, turnCount: 1, scoringOptions: opts as never });
    const read = buildRead(scene.view, "p0", { mode: "hanchan" });
    const bid = bidAbort(read, [...scene.discardOptions(), KYUSHU]);
    console.log(
      `${c.name.padEnd(34)} joker=${joker ? "ON " : "OFF"} shantenOf=${shantenOf(h(c.spec), 0, opts as never)} ` +
        `→ ${bid === null ? "옵션 없음" : bid.value === -Infinity ? "유찰 보류 (국사 살아 있음)" : `유찰 입찰 ${bid.value.toFixed(0)}점 — ${bid.reason}`}`,
    );
  }
}
