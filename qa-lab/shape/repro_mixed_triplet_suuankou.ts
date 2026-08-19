/**
 * 확정 재현 — mixed_triplet(동수의 결속)이 스안커(13)를 스안커단기(26)로 부풀린다.
 *
 * 원인: decompose.extractSets의 혼색 커쯔 후보 생성이 "무늬 2종 이상"만 요구하고
 * 같은 무늬 중복을 허용한다 (i<=j<=k) — 1m1p1p 같은 몸통이 만들어진다.
 * 그래서 같은 랭크 4장(1m1m1m + 1p1p 등)을 쥔 손이 항상
 * "혼색 커쯔 + 같은 랭크 머리" 로 다시 읽혀 단기 대기가 되고, 스안커가 더블 역만이 된다.
 */
import { YakuRegistry, buildVariants, evaluateWin, registerStandardYaku } from "@majak/core";
import type { DecomposeOptions, TileKind, WinContext } from "@majak/core";
import { h } from "../../packages/content/test/helpers.js";

const reg = new YakuRegistry();
registerStandardYaku(reg);
const MT: DecomposeOptions = { mixedTriplets: true };

function run(spec: string, win: string, winType: "tsumo" | "ron" = "tsumo"): void {
  const mk = (opts: DecomposeOptions): WinContext =>
    ({
      hand: h(spec), melds: [], winningTile: h(win)[0] as TileKind, winType,
      seatWind: 1, prevalentWind: 1, riichi: null, options: opts, winnerId: "p0",
    }) as unknown as WinContext;
  const a = evaluateWin(mk({}), reg);
  const b = evaluateWin(mk(MT), reg);
  const f = (r: ReturnType<typeof evaluateWin>): string =>
    r === null ? "NO WIN" : `[${r.yaku.map((y) => y.id).join(" ")}] 역만${r.yakumanCount} wait=${r.waitType}`;
  console.log(`${spec} +${win} (${winType})`);
  console.log(`   표준        : ${f(a)}`);
  console.log(`   동수의 결속 : ${f(b)}`);
  const v = buildVariants(mk(MT)).find((x) => x.waitType === "tanki");
  if (v !== undefined) {
    console.log(`   근거 변형   : pair=${v.pair?.rank}${v.pair?.suit[0]} sets=${v.sets.map((s) => s.tiles.map((t) => `${t.rank}${t.suit[0]}`).join("")).join(" ")}`);
  }
}

console.log("=== 스안커 → 스안커단기 (13 → 26)");
run("222m222p222s111m11p", "1m");
run("111m111p111s999m99p", "9m");
run("333m333p333s555m55s", "5m");

console.log("\n=== 참고: 같은 랭크 4장이 없으면 부풀지 않는다");
run("222m333p444s111m99p", "9p");

console.log("\n=== 같은 원인: polar_ends(양극)도 스안커를 단기로 바꾼다");
{
  const PE: DecomposeOptions = { polarEnds: true };
  const spec = "111m99m111p111s222s", win = "1m";
  const mk = (o: DecomposeOptions): WinContext => ({
    hand: h(spec), melds: [], winningTile: h(win)[0] as TileKind, winType: "tsumo",
    seatWind: 1, prevalentWind: 1, riichi: null, options: o, winnerId: "p0",
  }) as unknown as WinContext;
  const f = (r: ReturnType<typeof evaluateWin>): string =>
    r === null ? "NO WIN" : `[${r.yaku.map((y) => y.id).join(" ")}] 역만${r.yakumanCount} wait=${r.waitType}`;
  console.log(`${spec} +${win}`);
  console.log(`   표준  : ${f(evaluateWin(mk({}), reg))}`);
  console.log(`   양극  : ${f(evaluateWin(mk(PE), reg))}`);
}
