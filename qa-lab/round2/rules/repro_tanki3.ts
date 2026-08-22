/**
 * repro_tanki3 — 표준 마작 손인데 **단기 해석이 지워져 점수가 낮게 나온다**.
 * 손: 3m3m3m 4m5m6m6m6m 7p7p7p 2s3s4s, 6m 쯔모 (멘젠, 자)
 *  - 단기 해석: 333m + 456m + 777p + 234s + 머리 66m  → 20+4+4+단기2+쯔모2 = 32 → 40부
 *  - 샹퐁 해석: 666m + 345m + 777p + 234s + 머리 33m  → 20+4+4+쯔모2 = 30부
 * 표준 룰은 높은 쪽(40부)을 채택한다. 엔진은 단기 변형을 필터로 지워 30부로 정산한다.
 */
import { buildVariants, evaluateWin, calculateScore, YakuRegistry, registerStandardYaku } from "@majak/core";
import type { TileKind, WinContext } from "@majak/core";
const registry = new YakuRegistry(); registerStandardYaku(registry);
const m = (r: number): TileKind => ({ suit: "man", rank: r });
const p = (r: number): TileKind => ({ suit: "pin", rank: r });
const s = (r: number): TileKind => ({ suit: "sou", rank: r });
const hand: TileKind[] = [m(3),m(3),m(3),m(4),m(5),m(6),m(6),m(6),p(7),p(7),p(7),s(2),s(3),s(4)];
const ctx: WinContext = { hand, melds: [], winningTile: m(6), winType: "tsumo", seatWind: 2, prevalentWind: 1, riichi: null, flags: {}, doraKinds: [], uraDoraKinds: [], redCount: 0 };
console.log("변형:");
for (const v of buildVariants(ctx)) console.log(" ", v.waitType, "pair=", `${v.pair?.suit}${v.pair?.rank}`, v.sets.map(x=>`${x.type}:${x.tiles.map(t=>t.suit[0]+t.rank).join("")}`).join(" "));
const ev = evaluateWin(ctx, registry)!;
const sc = calculateScore({han:ev.han,fu:ev.fu,yakumanCount:ev.yakumanCount,isDealer:false,winType:"tsumo"});
console.log(`엔진: ${ev.han}판 ${ev.fu}부 wait=${ev.waitType} yaku=${ev.yaku.map(y=>y.id).join(",")} → 친${sc.payments.dealer}/자${sc.payments.others} 합계 ${sc.total}`);
const want = calculateScore({han:ev.han,fu:40,yakumanCount:0,isDealer:false,winType:"tsumo"});
console.log(`표준 기대: ${ev.han}판 40부 → 친${want.payments.dealer}/자${want.payments.others} 합계 ${want.total}`);
