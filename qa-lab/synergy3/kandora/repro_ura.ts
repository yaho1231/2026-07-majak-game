/**
 * J — 뒷도라 축
 *  J1 mirror_dora의 뒷도라(앞도라)가 깡으로 늘어난 뒷도라 표시패에도 붙는가
 *  J2 snake_kan 두 번 → cliff_bloom 만개 + ankan_dora
 *  J3 깡 4회에서 왕패·표시패
 */
import {
  craft, setup, evalWin, extraHan, table, discardsZone, setIndicator, setUraIndicator,
  reserveInWall, FlowController, DEAD_WALL, rinshanRemaining, kindKey, kindOf, handZone,
} from "./lib.js";
import type { GameState, TileId } from "./lib.js";
import { mirrorDora } from "../../../packages/content/src/augments/mirror_dora.js";
import { uraPeek } from "../../../packages/content/src/augments/ura_peek.js";
import { snakeKan } from "../../../packages/content/src/augments/snake_kan.js";
import { cliffBloom } from "../../../packages/content/src/augments/cliff_bloom.js";
import { ankanDora } from "../../../packages/content/src/augments/ankan_dora.js";
import { uraIndicatorIds } from "@majak/core";

// ── J1 ────────────────────────────────────────────────────────────────
{
  function scene(): GameState {
    let st = craft({
      hands: { p0: "123456789m5s", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "kan_closed", spec: "3333p" }] },
      phase: "reaction", turnSeat: 1, lastDiscard: { player: "p1", spec: "5s" },
    });
    st = reserveInWall(st, ["9p"]);
    st = setIndicator(st, "9p");
    // 뒷도라 표시패를 4m으로 (뒷도라 5m — 손에 1장 / 거울 앞뒷도라 3m — 손에 1장)
    st = reserveInWall(st, ["4m"]);
    st = setUraIndicator(st, "4m");
    // 리치 상태
    return { ...st, round: { ...st.round, byPlayer: { ...st.round.byPlayer, p0: { ...st.round.byPlayer["p0"]!, riichi: { declaredTurn: 1, double: false, ippatsu: false, tileId: 0 } as any } } } };
  }
  function run(label: string, augs: any[]) {
    const st = scene();
    const game = setup(st, augs);
    const ron = game.engine.state.zones[discardsZone("p1")]!.tileIds.at(-1) as TileId;
    const ev = evalWin(game, "p0", "ron", ron, { from: "p1", includeUra: true });
    const s = game.engine.state;
    return {
      조합: label,
      "뒷도라 표시패": uraIndicatorIds(s).map((id) => kindKey(kindOf(s, id))).join(" "),
      doraHan: ev?.doraHan ?? -1, uraHan: ev?.uraHan ?? -1, extraHan: extraHan(game, "p0"),
    };
  }
  table("J1: 리치 + 안깡 1개 · 뒷도라 표시패 4m — mirror_dora의 뒷 앞도라", [
    run("없음", []),
    run("mirror", [{ def: mirrorDora, holder: "p0" }]),
    run("ura_peek", [{ def: uraPeek, holder: "p0" }]),
    run("mirror+ura_peek", [{ def: mirrorDora, holder: "p0" }, { def: uraPeek, holder: "p0" }]),
    run("mirror+ankan_dora", [{ def: mirrorDora, holder: "p0" }, { def: ankanDora, holder: "p0" }]),
  ]);
}

// ── J2: 장사진 2연깡 → 만개 ───────────────────────────────────────────
{
  const st = craft({
    hands: { p0: "3456m3456p1199s55s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  for (const augs of [
    [{ def: snakeKan, holder: "p0" as const }],
    [{ def: snakeKan, holder: "p0" as const }, { def: cliffBloom, holder: "p0" as const }],
    [{ def: snakeKan, holder: "p0" as const }, { def: cliffBloom, holder: "p0" as const }, { def: ankanDora, holder: "p0" as const }],
  ]) {
    const game = setup(st, augs as any);
    const flow = new FlowController(game.engine);
    let status: any = flow.begin();
    const rows: any[] = [];
    for (let i = 0; i < 6; i++) {
      if (status.kind !== "awaiting") break;
      const pr = status.prompts.find((x: any) => x.player === "p0");
      if (!pr) { const q = status.prompts[0]; status = flow.submit(q.player, q.options.find((o: any) => o.type === "pass") ?? q.options[0]); continue; }
      const o = pr.options.find((x: any) => x.type === "ankan") ?? pr.options.find((x: any) => x.type === "bloom_pick");
      if (!o) break;
      status = flow.submit("p0", o);
      const s = game.engine.state;
      rows.push({ 액션: o.type, 왕패: s.zones[DEAD_WALL]!.tileIds.length, 영상패: rinshanRemaining(s), 도라표시패: s.round.doraIndicators.length, 손패: s.zones[handZone("p0")]!.tileIds.length, 만개: s.augmentData[Object.keys(s.augmentData).find((k) => k.includes("cliff_bloom:bloomed")) ?? ""] === true });
    }
    const s = game.engine.state;
    const ev = evalWin(game, "p0", "tsumo", s.round.lastDrawnTile as TileId);
    table(`J2: 장사진 2연깡 · ${augs.map((a: any) => a.def.id).join(" + ")}`, rows);
    console.log("    화료 판정:", ev?.ok, "yakuHan", ev?.yakuHan, "doraHan", ev?.doraHan, "extraHan", extraHan(game, "p0"), "역=", ev?.yaku.map((y: any) => `${y.id}:${y.han}`).join(","));
  }
}

// ── J3: 깡 4회 ────────────────────────────────────────────────────────
{
  const st = craft({
    hands: { p0: "1111m2222m3333m4444m", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const game = setup(st, [{ def: ankanDora, holder: "p0" }, { def: cliffBloom, holder: "p0" }]);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  const rows: any[] = [];
  for (let i = 0; i < 12; i++) {
    if (status.kind !== "awaiting") break;
    const pr = status.prompts.find((x: any) => x.player === "p0");
    if (!pr) { const q = status.prompts[0]; status = flow.submit(q.player, q.options.find((o: any) => o.type === "pass") ?? q.options[0]); continue; }
    const o = pr.options.find((x: any) => x.type === "ankan") ?? pr.options.find((x: any) => x.type === "bloom_pick");
    if (!o) break;
    status = flow.submit("p0", o);
    const s = game.engine.state;
    rows.push({ 액션: o.type, 왕패: s.zones[DEAD_WALL]!.tileIds.length, 영상패: rinshanRemaining(s), 도라표시패: s.round.doraIndicators.length, kanCount: s.round.kanCount, extraHan: extraHan(game, "p0") });
  }
  table("J3: 안깡 4회 (ankan_dora + cliff_bloom)", rows);
  console.log("    흐름 =", status.kind);
}
