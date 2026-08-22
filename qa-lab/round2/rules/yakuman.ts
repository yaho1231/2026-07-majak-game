/**
 * yakuman.ts — 역만 경계값을 손으로 찍어 본다 (증강 없음).
 */
import { evaluateWin, calculateScore, YakuRegistry, registerStandardYaku } from "@majak/core";
import type { TileKind, WinContext, MeldInfo } from "@majak/core";

const reg = new YakuRegistry(); registerStandardYaku(reg);
function h(spec: string): TileKind[] {
  const out: TileKind[] = []; let d = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") { d += ch; continue; }
    for (const c of d) {
      const r = Number(c);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
    }
    d = "";
  }
  return out;
}
let fails = 0;
function t(name: string, ctx: Partial<WinContext> & { hand: TileKind[]; winningTile: TileKind },
           wantYm: number, wantYaku?: string[]): void {
  const full: WinContext = {
    melds: [], winType: "tsumo", seatWind: 1, prevalentWind: 1, riichi: null, flags: {},
    doraKinds: [], uraDoraKinds: [], redCount: 0, ...ctx,
  } as WinContext;
  const ev = evaluateWin(full, reg);
  const got = ev?.yakumanCount ?? 0;
  const ids = ev?.yaku.map((y) => y.id).sort() ?? [];
  const okYm = got === wantYm;
  const okY = wantYaku === undefined || JSON.stringify(ids) === JSON.stringify([...wantYaku].sort());
  if (!okYm || !okY) fails++;
  console.log(`${okYm && okY ? "OK  " : "FAIL"} ${name} — 역만배수=${got}(기대 ${wantYm}) 역=[${ids.join(",")}]${wantYaku ? ` (기대 [${wantYaku.join(",")}])` : ""}`);
}

// 국사무쌍
const kokushi13 = h("19m19p19s1234567z");
t("국사 13면 (머리=화료패)", { hand: [...kokushi13, ...h("5z")], winningTile: h("5z")[0]! }, 2, ["kokushi_13"]);
t("국사 단순 (13번째로 완성)", { hand: [...h("19m19p19s1234567z"), ...h("1m")], winningTile: h("9s")[0]! }, 1, ["kokushi"]);

// 스안커
t("스안커 단기 (쯔모)", { hand: h("111m222m333p444s99s"), winningTile: h("9s")[0]! }, 2, ["suuankou_tanki"]);
t("스안커 샹퐁 쯔모", { hand: h("111m222m333p444s99s"), winningTile: h("4s")[0]!, winType: "tsumo" }, 1, ["suuankou"]);
t("스안커 샹퐁 론 → 산안커만", { hand: h("111m222m333p444s99s"), winningTile: h("4s")[0]!, winType: "ron" }, 0);

// 사희
t("대사희", { hand: h("111z222z333z444z55m"), winningTile: h("4z")[0]! }, 2, ["daisuushii"]);
t("소사희", { hand: h("111z222z333z44z555m"), winningTile: h("5m")[0]! }, 1, ["shousuushii"]);

// 삼원
t("대삼원", { hand: h("555z666z777z11m234p"), winningTile: h("2p")[0]! }, 1, ["daisangen"]);
t("소삼원 (역만 아님)", { hand: h("555z666z77z11m234p5p"), winningTile: h("5p")[0]! }, 0);

// 자일색 / 녹일색 / 청노두
t("자일색", { hand: h("111z222z333z444z55z"), winningTile: h("5z")[0]! }, 3, ["daisuushii", "tsuuiisou"]);
t("녹일색", { hand: h("222s333s444s666s88s"), winningTile: h("8s")[0]! }, 1, ["ryuuiisou"]);
t("청노두", { hand: h("111m999m111p999p11s"), winningTile: h("1s")[0]! }, 1, ["chinroutou"]);

// 구련보등
t("순정구련 (9면)", { hand: h("11123456789995m"), winningTile: h("5m")[0]! }, 2, ["chuuren_junsei"]);
t("일반 구련 (뼈대+1이 화료패 아님)", { hand: h("11123456789995m"), winningTile: h("1m")[0]! }, 1, ["chuuren"]);

// 스깡쯔 (안깡 4개)
const kans: MeldInfo[] = [
  { kind: "kan_closed", tiles: h("1111m") },
  { kind: "kan_closed", tiles: h("2222m") },
  { kind: "kan_closed", tiles: h("3333p") },
  { kind: "kan_closed", tiles: h("4444s") },
];
t("스깡쯔 (안깡 4 + 단기)", { hand: h("99s"), melds: kans, winningTile: h("9s")[0]! }, 3, ["suuankou_tanki", "suukantsu"]);

// 천화 / 지화
t("천화", { hand: h("123456789m11122p"), winningTile: h("2p")[0]!, flags: { tenhou: true } }, 1, ["tenhou"]);
t("지화", { hand: h("123456789m11122p"), winningTile: h("2p")[0]!, flags: { chihou: true } }, 1, ["chihou"]);

// 역만 점수
for (const [n, dealer, wt] of [[1, false, "ron"], [1, true, "ron"], [2, false, "tsumo"], [3, true, "tsumo"]] as const) {
  const s = calculateScore({ han: 0, fu: 0, yakumanCount: n, isDealer: dealer, winType: wt });
  console.log(`     역만${n}배 ${dealer ? "친" : "자"} ${wt} → ${s.total} (${JSON.stringify(s.payments)})`);
}
console.log(fails === 0 ? "\n전부 통과" : `\n실패 ${fails}건`);
