/**
 * repro_tanki.ts — 표준 마작 손에서 **단기 변형이 통째로 지워지는** 것을 보인다.
 * (WinContext.ts 의 shanponWinKeys 필터)
 */
import { buildVariants, evaluateWin, YakuRegistry, registerStandardYaku } from "@majak/core";
import type { TileKind, WinContext } from "@majak/core";

const registry = new YakuRegistry();
registerStandardYaku(registry);

const m = (r: number): TileKind => ({ suit: "man", rank: r });

// 3m3m3m 4m4m4m4m 5m 6m6m6m6m 7m 8m  (14장)
const hand: TileKind[] = [
  m(3), m(3), m(3),
  m(4), m(4), m(4), m(4),
  m(5),
  m(6), m(6), m(6), m(6),
  m(7), m(8),
];

const ctx: WinContext = {
  hand,
  melds: [],
  winningTile: m(6),
  winType: "tsumo",
  seatWind: 2,
  prevalentWind: 1,
  riichi: null,
  flags: {},
  doraKinds: [],
  uraDoraKinds: [],
  redCount: 0,
};

const vs = buildVariants(ctx);
console.log("변형 수:", vs.length);
for (const v of vs) {
  console.log(
    ` ${v.form} wait=${v.waitType} pair=${v.pair === null ? "-" : `${v.pair.suit}${v.pair.rank}`}`,
    v.sets.map((s) => `${s.type}:${s.tiles.map((t) => t.rank).join("")}${s.concealed ? "c" : "o"}`).join(" "),
  );
}
console.log("단기 변형이 있는가:", vs.some((v) => v.waitType === "tanki"));

const ev = evaluateWin(ctx, registry);
console.log("엔진:", ev === null ? "null" : `${ev.han}판 ${ev.fu}부 wait=${ev.waitType} yaku=${ev.yaku.map((y) => y.id).join(",")}`);
console.log("기대(표준): 6m 단기 = 40부 (444m 안커 4 + 333m 안커 4 + 단기 2 + 쯔모 2 = 32 → 40)");
