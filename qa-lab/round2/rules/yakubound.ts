/**
 * yakubound.ts — 역 성립/불성립 **경계값**을 손으로 찍는다 (증강 없음).
 * 기준: 일본 리치마작 표준 + docs/01_GAME_RULES.md (쿠이탄 O, 쿠이사가리 표준).
 */
import { evaluateWin, YakuRegistry, registerStandardYaku } from "@majak/core";
import type { TileKind, WinContext, MeldInfo } from "@majak/core";

const reg = new YakuRegistry(); registerStandardYaku(reg);
function h(spec: string): TileKind[] {
  const out: TileKind[] = []; let d = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") { d += ch; continue; }
    for (const c of d) {
      const r = Number(c);
      out.push(ch === "m" ? { suit: "man", rank: r } : ch === "p" ? { suit: "pin", rank: r }
        : ch === "s" ? { suit: "sou", rank: r } : r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
    }
    d = "";
  }
  return out;
}
const chi = (s: string): MeldInfo => ({ kind: "chi", tiles: h(s) });
const pon = (s: string): MeldInfo => ({ kind: "pon", tiles: h(s) });
const minkan = (s: string): MeldInfo => ({ kind: "kan_open", tiles: h(s) });
const ankan = (s: string): MeldInfo => ({ kind: "kan_closed", tiles: h(s) });

let fail = 0, total = 0;
function t(name: string, ctx: Partial<WinContext> & { hand: TileKind[]; winningTile: TileKind },
           want: { yaku?: string[]; han?: number; fu?: number; noYaku?: boolean }): void {
  total++;
  const full: WinContext = {
    melds: [], winType: "ron", seatWind: 2, prevalentWind: 1, riichi: null, flags: {},
    doraKinds: [], uraDoraKinds: [], redCount: 0, ...ctx,
  } as WinContext;
  const ev = evaluateWin(full, reg);
  const ids = (ev?.yaku ?? []).map((y) => y.id).sort();
  const probs: string[] = [];
  if (want.noYaku === true && ev !== null && ev.ok) probs.push("역이 붙으면 안 되는데 붙었다");
  if (want.yaku !== undefined && JSON.stringify(ids) !== JSON.stringify([...want.yaku].sort()))
    probs.push(`역=[${ids.join(",")}] 기대=[${[...want.yaku].sort().join(",")}]`);
  if (want.han !== undefined && ev?.han !== want.han) probs.push(`판=${ev?.han} 기대=${want.han}`);
  if (want.fu !== undefined && ev?.fu !== want.fu) probs.push(`부=${ev?.fu} 기대=${want.fu}`);
  if (probs.length > 0) fail++;
  console.log(`${probs.length === 0 ? "OK  " : "FAIL"} ${name}${probs.length === 0 ? "" : " — " + probs.join(" / ")}`);
}

// ── 치또이 vs 량페코 ────────────────────────────────────────────
t("112233m 445566p 77s — 량페코(3판)가 치또이(2판)를 이긴다",
  { hand: h("112233m445566p77s"), winningTile: h("7s")[0]! },
  { yaku: ["ryanpeiko"], han: 3 });
t("량페코+청일색 (11223344556677p)",
  { hand: h("11223344556677p"), winningTile: h("7p")[0]! },
  { yaku: ["ryanpeiko", "chinitsu", "pinfu"], han: 10 });
t("치또이 (몸통 못 만드는 형)",
  { hand: h("1199m1199p1199s11z"), winningTile: h("1z")[0]! },
  { yaku: ["chiitoitsu", "honroutou"], han: 4, fu: 25 });

// ── 쿠이사가리 ──────────────────────────────────────────────────
t("찬타 멘젠 = 2판",
  { hand: h("123m123p789s111z99m"), winningTile: h("9m")[0]!, prevalentWind: 3 },
  { yaku: ["chanta"], han: 2 });
t("찬타 후로 = 1판",
  { hand: h("123m123p99m"), melds: [chi("789s"), pon("111z")], winningTile: h("9m")[0]!, prevalentWind: 3 },
  { yaku: ["chanta"], han: 1 });
t("준찬 멘젠 = 3판",
  { hand: h("123m123p789s999m11p"), winningTile: h("1p")[0]! },
  { yaku: ["junchan"], han: 3 });
t("준찬 후로 = 2판",
  { hand: h("123m123p11p"), melds: [chi("789s"), pon("999m")], winningTile: h("1p")[0]! },
  { yaku: ["junchan"], han: 2 });
t("일기통관 멘젠 = 2판",
  { hand: h("123456789m123p55s"), winningTile: h("5s")[0]! },
  { yaku: ["ittsuu"], han: 2 });
t("일기통관 후로 = 1판",
  { hand: h("456789m123p55s"), melds: [chi("123m")], winningTile: h("5s")[0]! },
  { yaku: ["ittsuu"], han: 1 });
t("삼색동순 멘젠 = 2판",
  { hand: h("123m123p123s456m99s"), winningTile: h("9s")[0]! },
  { yaku: ["sanshoku"], han: 2 });
t("삼색동순 후로 = 1판",
  { hand: h("123p123s456m99s"), melds: [chi("123m")], winningTile: h("9s")[0]! },
  { yaku: ["sanshoku"], han: 1 });
t("혼일색 멘젠 = 3판",
  { hand: h("123456789m111z99m"), winningTile: h("9m")[0]!, prevalentWind: 3 },
  { yaku: ["honitsu", "ittsuu"], han: 5 });
t("혼일색 후로 = 2판",
  { hand: h("123456789m99m"), melds: [pon("111z")], winningTile: h("9m")[0]!, prevalentWind: 3 },
  { yaku: ["honitsu", "ittsuu"], han: 3 });
t("청일색 후로 = 5판",
  { hand: h("123456789m99m"), melds: [chi("123m")], winningTile: h("9m")[0]! },
  { yaku: ["chinitsu", "ittsuu"], han: 6 });
t("삼색동각은 쿠이사가리 없음 (후로 2판)",
  { hand: h("111m111s12355p"), melds: [pon("111p")], winningTile: h("5p")[0]! },
  { yaku: ["sanshoku_doukou"], han: 2 });

// ── 핑후 경계 ───────────────────────────────────────────────────
t("핑후: 양면 + 무득점 머리",
  { hand: h("234m567m234p22s345s"), winningTile: h("3s")[0]!, seatWind: 2, prevalentWind: 1 },
  { yaku: ["pinfu", "tanyao"], han: 2, fu: 30 });
t("핑후 불가: 머리가 역패(장풍)",
  { hand: h("234m567m234p11z45s"), winningTile: h("3s")[0]!, seatWind: 2, prevalentWind: 1 },
  { noYaku: true });
t("핑후 불가: 머리가 연풍(자풍=남, 장풍=동 → 남은 자풍만)",
  { hand: h("234m567m234p22z45s"), winningTile: h("3s")[0]!, seatWind: 2, prevalentWind: 1 },
  { noYaku: true });
t("핑후 불가: 칸찬 대기",
  { hand: h("234m567m234p22s456s"), winningTile: h("5s")[0]! },
  { yaku: ["tanyao"], han: 1, fu: 40 });
t("핑후 불가: 단기 대기",
  { hand: h("234m567m234p456s22s"), winningTile: h("2s")[0]! },
  { yaku: ["tanyao"], han: 1, fu: 40 });
t("핑후 쯔모 = 20부",
  { hand: h("234m567m234p22s345s"), winningTile: h("3s")[0]!, winType: "tsumo" },
  { yaku: ["menzen_tsumo", "pinfu", "tanyao"], han: 3, fu: 20 });
t("후로 핑후형 론 = 30부 (docs/01 §178)",
  { hand: h("234m567m22s345s"), melds: [chi("234p")], winningTile: h("3s")[0]! },
  { yaku: ["tanyao"], han: 1, fu: 30 });
t("후로 핑후형 쯔모 = 20부 (docs/01 §178)",
  { hand: h("234m567m22s345s"), melds: [chi("234p")], winningTile: h("3s")[0]!, winType: "tsumo" },
  { yaku: ["tanyao"], han: 1, fu: 20 });

// ── 역패·연풍 ───────────────────────────────────────────────────
t("연풍패 머리는 역이 아니다 (동장·동가에서 동 머리)",
  { hand: h("234m567m234p567s11z"), winningTile: h("1z")[0]!, seatWind: 1, prevalentWind: 1 },
  { noYaku: true });
t("연풍 커쯔 = 2판 (동장·동가 동 커쯔)",
  { hand: h("234m567m234p111z55s"), winningTile: h("5s")[0]!, seatWind: 1, prevalentWind: 1 },
  { yaku: ["yakuhai_seat", "yakuhai_prevalent"], han: 2 });
t("객풍 커쯔는 역 아님 (북, 동장·동가)",
  { hand: h("234m567m234p444z55s"), winningTile: h("5s")[0]!, seatWind: 1, prevalentWind: 1 },
  { noYaku: true });

// ── 후로 시 역 소멸 ─────────────────────────────────────────────
t("후로 손에 멘젠쯔모는 붙지 않는다",
  { hand: h("234m567m234p55s"), melds: [chi("678s")], winningTile: h("5s")[0]!, winType: "tsumo" },
  { yaku: ["tanyao"], han: 1 });
t("치또이는 후로 불가 (몸통 못 읽히면 화료 아님)",
  { hand: h("1199m1199p11s"), melds: [pon("111z")], winningTile: h("1s")[0]! },
  { noYaku: true });

// ── 삼안커 / 또이또이 / 삼깡쯔 ───────────────────────────────────
t("삼안커: 론으로 완성한 커쯔는 안커가 아니다 → 안커 2개뿐이라 역 없음",
  { hand: h("111m222m333p456s99s"), winningTile: h("3p")[0]!, winType: "ron" },
  { noYaku: true });
t("삼안커: 같은 손을 쯔모하면 안커 3개 → 산안커",
  { hand: h("111m222m333p456s99s"), winningTile: h("3p")[0]!, winType: "tsumo" },
  { yaku: ["menzen_tsumo", "sanankou"], han: 3 });
t("삼안커 → 론으로 완성한 커쯔가 4번째면 산안커 (스안커 아님)",
  { hand: h("111m222m333p444s99s"), winningTile: h("4s")[0]!, winType: "ron" },
  { yaku: ["sanankou", "toitoi"], han: 4 });
t("또이또이+혼노두 론(단기, 커쯔 4개 전부 안커) → 스안커단기",
  { hand: h("111m999m111p999p11z"), winningTile: h("1z")[0]! },
  { yaku: ["suuankou_tanki"] });
t("또이또이+혼노두 (론으로 커쯔 완성 → 역만 아님)",
  { hand: h("111m999m111p999p11z"), winningTile: h("9p")[0]! },
  { yaku: ["toitoi", "honroutou", "sanankou"], han: 6 });
t("삼깡쯔 (명깡 3)",
  { hand: h("234m55s"), melds: [minkan("1111m"), minkan("2222p"), minkan("3333s")], winningTile: h("5s")[0]! },
  { yaku: ["sankantsu"], han: 2 });

// ── 하이테이/호테이/영상/창깡 ────────────────────────────────────
t("하이테이 (쯔모)",
  { hand: h("234m567m234p22s345s"), winningTile: h("3s")[0]!, winType: "tsumo", flags: { haitei: true } },
  { yaku: ["menzen_tsumo", "pinfu", "tanyao", "haitei"], han: 4 });
t("호테이 (론)",
  { hand: h("234m567m234p22s345s"), winningTile: h("3s")[0]!, winType: "ron", flags: { houtei: true } },
  { yaku: ["pinfu", "tanyao", "houtei"], han: 3 });
t("영상개화",
  { hand: h("234m567m234p22s345s"), winningTile: h("3s")[0]!, winType: "tsumo", flags: { rinshan: true } },
  { yaku: ["menzen_tsumo", "pinfu", "tanyao", "rinshan"], han: 4 });
t("창깡 (론)",
  { hand: h("234m567m234p22s345s"), winningTile: h("3s")[0]!, winType: "ron", flags: { chankan: true } },
  { yaku: ["pinfu", "tanyao", "chankan"], han: 3 });

// ── 리치 관련 ───────────────────────────────────────────────────
t("리치+일발+쯔모",
  { hand: h("234m567m234p22s345s"), winningTile: h("3s")[0]!, winType: "tsumo",
    riichi: { double: false, ippatsu: true } },
  { yaku: ["riichi", "ippatsu", "menzen_tsumo", "pinfu", "tanyao"], han: 5 });
t("더블리치",
  { hand: h("234m567m234p22s345s"), winningTile: h("3s")[0]!, winType: "ron",
    riichi: { double: true, ippatsu: false } },
  { yaku: ["double_riichi", "pinfu", "tanyao"], han: 4 });

console.log(`\n${total - fail}/${total} 통과`);
