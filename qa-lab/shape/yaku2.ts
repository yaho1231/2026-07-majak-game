/** 표준 역 × shape 옵션 2차 — 모호하지 않은(강제) 형태로만 검사 */
import { YakuRegistry, evaluateWin, registerStandardYaku } from "@majak/core";
import type { DecomposeOptions, TileKind, WinContext } from "@majak/core";
import { h } from "../../packages/content/test/helpers.js";

const reg = new YakuRegistry();
registerStandardYaku(reg);

function ev(spec: string, winning: string, opts: DecomposeOptions, extra: Partial<WinContext> = {}): string {
  const ctx = {
    hand: h(spec), melds: [], winningTile: h(winning)[0] as TileKind,
    winType: "tsumo", seatWind: 1, prevalentWind: 1, riichi: null,
    options: opts, winnerId: "p0", ...extra,
  } as unknown as WinContext;
  const r = evaluateWin(ctx, reg);
  if (r === null) return "NO WIN";
  return `[${r.yaku.map((y) => `${y.id}:${y.han}`).join(" ")}] han=${r.han} fu=${r.fu} ym=${r.yakumanCount}`;
}
function cmp(label: string, spec: string, win: string, opts: DecomposeOptions, extra?: Partial<WinContext>): void {
  const n = h(spec).length;
  console.log(`  ${label}\n    ${spec}(${n}장)+${win}\n      std : ${ev(spec, win, {}, extra)}\n      opt : ${ev(spec, win, opts, extra)}`);
}

console.log("=== broken_border: 혼색 슌쯔만 있는 손 (무늬역이 붙으면 안 된다)");
const BB: DecomposeOptions = { mixedRuns: true };
// 1m2p3s / 4m5p6s / 7m8p9s 는 혼색으로만 슌쯔가 된다
cmp("혼색 3슌쯔 + 순수 1슌쯔", "1m2p3s4m5p6s7m8p9s123m11p", "1p", BB);
cmp("혼색 슌쯔로 일기통관 흉내(1m2p3m,4m5p6m,7m8p9m)", "1m2p3m4m5p6m7m8p9m123p11s", "1s", BB);
cmp("혼색 슌쯔로 이페코 흉내(1m2p3s 두 벌)", "1m2p3s1m2p3s123m456m11p", "1p", BB);
cmp("혼색 슌쯔 낀 손이 청일색?", "1m2p3m4m5m6m7m8m9m1m2m3m11m", "1m", BB);

console.log("\n=== mixed_triplet: 혼색 커쯔");
const MT: DecomposeOptions = { mixedTriplets: true };
cmp("혼색 커쯔 3 + 순수 1 (삼색동각 헛성립?)", "1m1p1s2m2p2s3m3p3s111m99p", "9p", MT);
cmp("스안커단기? (커쯔 4 + 머리, 오름패가 커쯔)", "222m222p222s111m11p", "1m", MT);
cmp("스안커단기? (오름패가 머리)", "222m222p222s111m11p", "1p", MT);

console.log("\n=== broken_wall: 순환 슌쯔");
const BW: DecomposeOptions = { wrapRuns: true };
cmp("789m 891m 912m (일기통관 헛성립?)", "789m891m912m123p11s", "1s", BW);
cmp("순환 슌쯔 2벌 = 이페코?", "891m891m123p456p11s", "1s", BW);
cmp("순환 슌쯔로 삼색 흉내", "891m891p891s123m11p", "1p", BW);
cmp("순환 슌쯔 + 핑후 (양면대기?)", "891m123p456p789p11s", "1s", BW);

console.log("\n=== wind_lineage: 자패 슌쯔");
const WL: DecomposeOptions = { honorRuns: true };
cmp("자패 슌쯔 3 + 수패 (자일색 헛성립?)", "123z234z567z11z123m", "3m", WL);
cmp("자패 슌쯔만 4벌 + 머리 = 자일색", "123z234z567z567z11z", "1z", WL);
cmp("자패 슌쯔가 대삼원/소삼원을 흉내내나 (567z 두 벌)", "567z567z123m456m11p", "1p", WL);
cmp("자패 슌쯔 + 찬타/준찬타", "123z123m789p123s11z", "1z", WL);

console.log("\n=== async_chiitoi: 혼합 쌍의 부수·역");
const AC: DecomposeOptions = { chiitoiMixedPairs: true };
cmp("혼합 7쌍", "1234567m1234567p", "7p", AC);
cmp("혼합 7쌍 (자패 포함) — 혼일색?", "1234567m1234567p", "7p", AC);
cmp("혼합 쌍 + 국사 요구패만 = 국사와 충돌?", "19m19p19s1234567z", "7z", { ...AC, kokushiDupes: 1 });

console.log("\n=== royal_kokushi: 13면 판정");
const RK: DecomposeOptions = { kokushiDupes: 1 };
cmp("12종+중복, 오름패가 중복 쪽", "19m19p199s1134567z", "9s", RK, { winType: "ron" });
cmp("12종+중복, 13장이 이미 12종+중복", "19m19p199s113456z7z", "7z", RK, { winType: "ron" });

console.log("\n=== polar_ends: 무늬역");
const PE: DecomposeOptions = { polarEnds: true };
cmp("혼합 노두 커쯔 3 (삼색동각 헛성립?)", "199m199p199s123m11p", "1p", PE);
cmp("혼합 노두 커쯔 + 청일색", "199m119m991m199m11m".slice(0, 0) || "199m199m119m991m11m", "1m", PE);

console.log("\n=== true_dragon(5멘쯔) 역 중복");
const TD: DecomposeOptions = { totalSets: 5 };
cmp("일기통관 + 량페코가 같은 몸통을 두 번 세는가", "123m123m456m456m789m11m", "1m", TD);
cmp("삼색 + 일기통관 동시", "123m123p123s456m789m11m", "1m", TD);
