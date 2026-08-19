/** 표준 역 × shape 옵션 — 헛성립/누락 검사 (evaluateWin 직접 호출) */
import { YakuRegistry, evaluateWin, registerStandardYaku } from "@majak/core";
import type { DecomposeOptions, TileKind, WinContext } from "@majak/core";
import { h } from "../../packages/content/test/helpers.js";

const reg = new YakuRegistry();
registerStandardYaku(reg);

function ev(
  spec: string,
  winning: string,
  opts: DecomposeOptions,
  extra: Partial<WinContext> = {},
): { yaku: string; han: number; fu: number; ym: number } | null {
  const hand = h(spec);
  const ctx: WinContext = {
    hand,
    melds: [],
    winningTile: h(winning)[0] as TileKind,
    winType: "tsumo",
    seatWind: 1,
    prevalentWind: 1,
    riichi: null,
    options: opts,
    winnerId: "p0",
    ...extra,
  } as WinContext;
  const r = evaluateWin(ctx, reg);
  if (r === null) return null;
  return {
    yaku: r.yaku.map((y) => `${y.id}:${y.han}`).join(" "),
    han: r.han, fu: r.fu, ym: r.yakumanCount,
  };
}
function show(label: string, spec: string, win: string, opts: DecomposeOptions, extra?: Partial<WinContext>): void {
  const r = ev(spec, win, opts, extra);
  console.log(`  ${label}\n    ${spec} (+${win}) -> ${r === null ? "NO WIN" : `[${r.yaku}] han=${r.han} fu=${r.fu} ym=${r.ym}`}`);
}

console.log("=== royal_kokushi (kokushiDupes=1)");
const RK: DecomposeOptions = { kokushiDupes: 1 };
show("표준 국사 (13종+1)", "19m19p19s1234567z1z", "1z", {});
show("표준 국사 13면 (13종 + 오름패)", "19m19p19s1234567z1z", "1z", {}, { winType: "ron" });
show("12종+중복 (2z 없음, 9s·1z 중복)", "19m19p199s1134567z", "1z", RK);
show("12종+중복 — 13면 더블역만이 붙는가?", "19m19p199s1134567z", "9s", RK, { winType: "ron" });

console.log("\n=== async_chiitoi (chiitoiMixedPairs)");
const AC: DecomposeOptions = { chiitoiMixedPairs: true };
show("혼합 7쌍 (1~7 만·통)", "1234567m1234567p", "7p", AC);
show("혼합 7쌍 — 탕야오 붙나 (2~8)", "2345678m2345678p", "8p", AC);
show("혼합 7쌍 — 이페코/량페코 헛성립?", "1122334455667m7m", "7m", AC);
show("혼합 7쌍 + 청일색?", "1234567m1234567p", "7p", AC);

console.log("\n=== broken_border (mixedRuns) — 삼색/일기통관/이페코 헛성립");
const BB: DecomposeOptions = { mixedRuns: true };
show("혼색 슌쯔 3개", "123m123p123s456m11p", "1p", BB);
show("일기통관 흉내 (1-9 혼색)", "123m456p789s123m11p", "1p", BB);
show("이페코 흉내 (혼색 같은 랭크 슌쯔 2개)", "123m123p456m789m11p", "1p", BB);
show("혼색 슌쯔로 청일색 깨지는가", "123m123m456m789m11m", "1m", BB);

console.log("\n=== mixed_triplet (mixedTriplets)");
const MT: DecomposeOptions = { mixedTriplets: true };
show("혼색 커쯔 4개 = 또이또이/스안커?", "111m111p111s222m22p".replace("222m", "2m2p2s"), "2s", MT);
show("삼색동각 헛성립?", "222m222p222s111m11p", "1m", MT);
show("혼색 커쯔로 삼색동각 흉내", "2m2p2s3m3p3s4m4p4s111m11p", "1m", MT);

console.log("\n=== broken_wall (wrapRuns)");
const BW: DecomposeOptions = { wrapRuns: true };
show("순환 슌쯔 891m", "891m123p456p789p11s", "1s", BW);
show("순환으로 일기통관 흉내", "123m456m789m891m11p", "1p", BW);
show("순환 슌쯔로 탕야오? (노두 포함)", "891m234p567p234s11s", "1s", BW);

console.log("\n=== wind_lineage (honorRuns)");
const WL: DecomposeOptions = { honorRuns: true };
show("자패 슌쯔 2개 + 삼원 슌쯔", "123z234z567z123m11p", "1p", WL);
show("자일색(자패 슌쯔만)", "123z234z567z1122z".replace("1122z", "11z22z"), "2z", WL);
show("혼노두/찬타 판정", "123z567z123m789p11z", "1z", WL);
show("삼색동순 헛성립?", "123z123m123p123s11p", "1p", WL);

console.log("\n=== polar_ends");
const PE: DecomposeOptions = { polarEnds: true };
show("혼합 노두 커쯔 4 + 머리 = 청노두/스안커", "199m199p199s119m99p", "9p", PE);
show("삼색동각 헛성립? (199m199p199s)", "199m199p199s123m11p", "1p", PE);
show("찬타/준찬타", "199m199p123s111z99m", "9m", PE);

console.log("\n=== joker (wildKinds 백)");
const HAKU: TileKind = { suit: "dragon", rank: 1 };
const JK: DecomposeOptions = { wildKinds: [HAKU] };
show("조커가 역패(백) 커쯔가 되는가", "5z5z5z123m456p789s11z", "1z", JK);
show("조커 1장이 빈자리 메움", "123m456p789s123s5z", "5z", JK);
show("조커로 대삼원?", "5z5z5z5z66z77z123m11p".replace("5z5z5z5z", "5z5z5z5z"), "1p", JK);
show("조커 국사", "19m19p19s1234z56z55z", "5z", JK);

console.log("\n=== true_dragon (totalSets=5)");
const TD: DecomposeOptions = { totalSets: 5 };
show("5멘쯔 1작두", "123m456m789m123p456p11s", "1s", TD);
show("5멘쯔 청일색", "123m456m789m123m456m11m", "1m", TD);
show("5멘쯔 이페코/량페코", "123m123m456m456m789m11m", "1m", TD);
