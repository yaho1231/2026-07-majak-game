/**
 * polar_ends detail: "1과 9를 섞어 퐁한 몸통 위로는 가깡을 얹을 수 있다(1만1만9만 + 1만).
 *                     안깡·대명깡만 대상이 아니다."
 * 실제로 shouminkan(가깡) validate가 polarEnds를 보는가?
 */
import {
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import { polarEnds } from "../../../packages/content/src/augments/polar_ends.js";
import { craft } from "../../../packages/content/test/helpers.js";

function trial(meldSpec: string, addSpec: string): void {
  const st = craft({
    hands: {
      p0: `${addSpec}234p567p11s`, // 10장 = 14 - 3(퐁 하나) + 여유
      p1: "*",
      p2: "*",
      p3: "*",
    },
    melds: { p0: [{ kind: "pon", spec: meldSpec, from: "p1" }] },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const game = createStandardGameFromState(st);
  installAugment(game.engine, polarEnds, "p0");

  const rs = game.engine.state.round.byPlayer.p0;
  const meld = rs?.melds[0];
  const target = meld?.tileIds[0] as number;
  const hand = game.engine.state.zones[`hand:p0`]?.tileIds ?? [];
  const tileId = hand[0] as number;
  const kk = (id: number): string => {
    const k = game.engine.state.tiles[id]?.kind;
    return `${k?.rank}${k?.suit[0]}`;
  };
  const res = game.engine.submit({
    player: "p0",
    type: "shouminkan",
    payload: { tileId, targetMeldTileId: target },
  });
  console.log(
    `퐁 몸통=[${(meld?.tileIds ?? []).map(kk).join(",")}] 대표=${kk(target)} / 손패에서 얹는 패=${kk(tileId)}`,
  );
  console.log(
    `  submit(shouminkan) -> ok=${res.ok}${res.ok ? "" : ` reason="${(res as { error?: string }).error ?? JSON.stringify(res)}"`}`,
  );
}

console.log("=== detail의 예시 그대로: 퐁 1m1m9m 위에 1m 가깡");
trial("119m", "1m");
console.log("\n=== 같은 몸통 위에 9m 가깡 (1·9는 한 패로 통해야 한다)");
trial("119m", "9m");
console.log("\n=== 대조군: 순수 퐁 111m 위에 1m 가깡");
trial("111m", "1m");

console.log("\n=== 실제 퐁 순서: 9m9m를 들고 1m를 퐁 → 몸통 대표가 9m");
trial("991m", "1m");
console.log("\n=== 같은 몸통에 9m 가깡");
trial("991m", "9m");
