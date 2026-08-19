/** waitType / 핑후·스안커단기 정밀 검사 */
import { YakuRegistry, buildVariants, evaluateWin, registerStandardYaku } from "@majak/core";
import type { DecomposeOptions, TileKind, WinContext } from "@majak/core";
import { h } from "../../packages/content/test/helpers.js";

const reg = new YakuRegistry();
registerStandardYaku(reg);
const mk = (spec: string, win: string, opts: DecomposeOptions): WinContext =>
  ({
    hand: h(spec), melds: [], winningTile: h(win)[0] as TileKind,
    winType: "tsumo", seatWind: 1, prevalentWind: 1, riichi: null,
    options: opts, winnerId: "p0",
  }) as unknown as WinContext;

function dump(label: string, spec: string, win: string, opts: DecomposeOptions): void {
  const ctx = mk(spec, win, opts);
  const vs = buildVariants(ctx);
  const r = evaluateWin(ctx, reg);
  console.log(`\n${label}: ${spec} + ${win}`);
  for (const v of vs.slice(0, 8)) {
    const sets = v.sets.map((s) => `${s.type[0]}(${s.tiles.map((t) => `${t.rank}${t.suit[0]}`).join("")})`).join(" ");
    console.log(`   ${v.form} wait=${v.waitType} pair=${v.pair ? `${v.pair.rank}${v.pair.suit[0]}` : "-"} ${sets}`);
  }
  if (vs.length > 8) console.log(`   ... ${vs.length} variants`);
  console.log(`   => ${r === null ? "NO WIN" : `[${r.yaku.map((y) => y.id).join(" ")}] wait=${r.waitType} fu=${r.fu}`}`);
}

console.log("### 기준선 (표준 규칙): 단기 대기에 핑후가 붙는가");
dump("std 단기", "123m456m789m123p11s", "1s", {});
dump("std 양면", "123m456m789m123p11s", "3p", {});

console.log("\n### broken_border: 단기 대기인데 핑후");
dump("mixedRuns 단기(1p이 머리)", "1m2p3s4m5p6s7m8p9s123m11p", "1p", { mixedRuns: true });

console.log("\n### broken_wall: 8-9 + 1 (변짱 성격) 대기에 핑후");
dump("wrap 891p 완성", "891m891p891s123m11p", "1p", { wrapRuns: true });
dump("wrap 89m + 1m", "89m123p456p789p11s1m", "1m", { wrapRuns: true });

console.log("\n### mixed_triplet: 1m1p1p 같은 '혼색 커쯔'가 허용되는가 → 스안커단기");
dump("mixedTriplets suuankou", "222m222p222s111m11p", "1m", { mixedTriplets: true });
dump("std suuankou", "222m222p222s111m11p", "1m", {});
