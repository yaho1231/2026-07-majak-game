/** tanyao_break 의 판정식(allKinds)이 후로 멘쯔까지 보는가 */
import { buildVariants, allKinds, isNumberSuit, isTerminal } from "@majak/core";
import type { TileKind, WinContext } from "@majak/core";
import { h } from "../../packages/content/test/helpers.js";

function check(label: string, hand: string, win: string, melds: { kind: string; spec: string }[]): void {
  const ctx = {
    hand: h(hand), winningTile: h(win)[0] as TileKind, winType: "ron",
    melds: melds.map((m) => ({ kind: m.kind, tiles: h(m.spec), concealed: false })),
    seatWind: 1, prevalentWind: 1, riichi: null, options: {}, winnerId: "p0",
  } as unknown as WinContext;
  for (const v of buildVariants(ctx).slice(0, 1)) {
    const k = allKinds(v);
    const fires = k.every(isNumberSuit) && k.some(isTerminal);
    console.log(`${label}\n   allKinds=${k.map((x) => `${x.rank}${x.suit[0]}`).join("")}\n   tanyao_break 성립=${fires}`);
  }
}
check("멘젠 (1·9 포함, 자패 없음) — 성립해야", "123m456p789s111m99p", "9p", []);
check("백 퐁이 있는 손 — 자패가 있으므로 불성립해야", "123m456p789m99p", "9p", [{ kind: "pon", spec: "555z" }]);
check("1m 퐁 (수패) — 성립해야", "123m456p789m99p", "9p", [{ kind: "pon", spec: "111m" }]);
