/**
 * 11 — suit 축(염색·단색세계·편식) / honor 축(개벽·귀환·삼원의지·북풍상인·계보) 조합.
 * 액션형이 많아 여기서는 «규칙·판정»이 서로를 죽이지 않는가를 본다.
 */
import { contentAugments } from "@majak/content";
import { createStandardGameFromState, installAugment, handZone, kindOf, kindKey, scoringOptionsOf } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { measure, line } from "./lib.js";
const A = (id: string) => contentAugments.find((d) => d.id === id)!;

function game(hand: string, ids: string[], phase: any = "turn.act") {
  let st: GameState = craft({ hands: { p0: hand, p1: "*", p2: "*", p3: "*" }, phase, turnSeat: 0, drawnLastFor: "p0" });
  st = { ...st, players: st.players.map((p) => (p.id === "p0" ? { ...p, augments: ids } : p)) };
  const g = createStandardGameFromState(st);
  for (const id of ids) installAugment(g.engine, A(id), "p0", { yaku: g.yaku });
  return g;
}
function opts(g: any) { return JSON.stringify(scoringOptionsOf(g.engine.state, g.engine.rules, "p0")); }
function turnOpts(g: any): string[] {
  const st = g.engine.state;
  const fc = g.engine.actions;
  // holderTurnOptions는 FlowController가 모으므로, 등록된 액션 이름만 나열한다
  return [...(g.engine.actions as any).keys?.() ?? []];
}
function submit(g: any, type: string, payload: any = {}): string {
  const r = g.engine.submit({ player: "p0" as PlayerId, type, payload } as never) as { ok: boolean; reason?: string };
  return r.ok ? "OK" : `거부(${r.reason})`;
}
const handStr = (g: any) => {
  const st = g.engine.state;
  return (st.zones[handZone("p0")]?.tileIds ?? []).map((t: any) => kindKey(kindOf(st, t))).join(" ");
};

console.log("=== 11a suit 3종 (단색세계 / 염색 / 편식) ===");
{
  const H = "123m456p789s1122z";
  for (const combo of [["suit_unify"], ["suit_unify", "tile_dyeing"], ["suit_unify", "picky_eater"], ["suit_unify", "tile_dyeing", "picky_eater"]]) {
    const g = game(H, combo);
    console.log(`  [${combo.join("+")}]`);
    console.log(`     단색세계 발동: ${submit(g, "mono_world", { suit: "man" })}`);
    console.log(`     손: ${handStr(g)}`);
    // 발동 후 염색을 이어 쓸 수 있는가
    if (combo.includes("tile_dyeing")) {
      const st = g.engine.state;
      const id = (st.zones[handZone("p0")]?.tileIds ?? []).find((t: any) => kindOf(st, t).suit === "man");
      console.log(`     염색 이어쓰기: ${submit(g, "tile_dye", { tileId: id, suit: "pin" })}`);
      console.log(`     손: ${handStr(g)}`);
    }
  }
}

console.log("\n=== 11b 뒤섞인 구련 × 무늬 통일 계열 (2무늬 이상이 조건) ===");
{
  const ng = "1m1p1s2m3p4s5m6p7s8m9p9s9m2p";
  line("구련 단독", measure({ hand: ng, winTile: "9m", winType: "tsumo" }, [A("mixed_nine_gates")]));
  line("구련+단색세계(미발동)", measure({ hand: ng, winTile: "9m", winType: "tsumo" }, [A("mixed_nine_gates"), A("suit_unify")]));
  line("구련+편식(미발동)", measure({ hand: ng, winTile: "9m", winType: "tsumo" }, [A("mixed_nine_gates"), A("picky_eater")]));
  // 무늬를 하나로 만들면 표준 구련이 되어야 한다
  const pure = "1112345678999m9m";
  line("순수 구련(무늬 1종) 구련보유", measure({ hand: pure, winTile: "9m", winType: "tsumo" }, [A("mixed_nine_gates")]));
  line("순수 구련(무늬 1종) 없음", measure({ hand: pure, winTile: "9m", winType: "tsumo" }, []));
}

console.log("\n=== 11c honor 축 ===");
{
  // 대삼원 손 — 삼원의지·계보·개벽이 서로를 죽이는가
  const d = "555z666z777z234m11p";
  line("없음", measure({ hand: d, winType: "tsumo" }, []));
  line("계보", measure({ hand: d, winType: "tsumo" }, [A("wind_lineage")]));
  line("계보+삼원의지", measure({ hand: d, winType: "tsumo" }, [A("wind_lineage"), A("three_dragons_will")]));
  line("계보+개벽", measure({ hand: d, winType: "tsumo" }, [A("wind_lineage"), A("genesis")]));
  line("계보+북풍상인", measure({ hand: d, winType: "tsumo" }, [A("wind_lineage"), A("north_trader")]));
  // 바람 슌쯔 + 북풍상인 (北을 두고 다툰다)
  const w = "234z123z234m567m11p";
  line("계보 (남서북+동남서)", measure({ hand: w, winType: "tsumo" }, [A("wind_lineage")]));
  line("계보+북풍상인", measure({ hand: w, winType: "tsumo" }, [A("wind_lineage"), A("north_trader")]));
  // 소사희/대사희와의 충돌
  const sw = "111z222z333z44z234m", sw2 = "111z222z333z444z11m";
  line("소사희 계보없음", measure({ hand: sw, winType: "tsumo" }, []));
  line("소사희 +계보", measure({ hand: sw, winType: "tsumo" }, [A("wind_lineage")]));
  line("대사희 계보없음", measure({ hand: sw2, winType: "tsumo" }, []));
  line("대사희 +계보", measure({ hand: sw2, winType: "tsumo" }, [A("wind_lineage")]));
  line("대사희 +계보+삼원의지", measure({ hand: sw2, winType: "tsumo" }, [A("wind_lineage"), A("three_dragons_will")]));
}
