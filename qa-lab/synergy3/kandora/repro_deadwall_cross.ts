/**
 * G — 왕패를 만지는 증강끼리의 교차
 *  G1 rinshan_preview 교환 + dead_wall_master 교환을 같은 순에
 *  G2 ura_peek 확인 뒤 dead_wall_master가 뒷도라 표시패 자리를 갈아 끼우면
 *  G3 dead_wall_master가 도라 표시패를 갈면 mirror_dora 공개 채널이 따라오는가
 *  G5 dora_conceal(p1) × dead_wall_master(p0) — p0 뷰에 표시패 종류가 새는가
 */
import {
  craft, setup, FlowController, kindKey, kindOf, handZone, DEAD_WALL, WALL,
  rinshanRemaining, table, setIndicator, setUraIndicator, reserveInWall,
} from "./lib.js";
import type { GameState, PlayerId, TileId } from "./lib.js";
import { buildPlayerView, uraIndicatorIds } from "@majak/core";
import { rinshanPreview } from "../../../packages/content/src/augments/rinshan_preview.js";
import { deadWallMaster } from "../../../packages/content/src/augments/dead_wall_master.js";
import { uraPeek } from "../../../packages/content/src/augments/ura_peek.js";
import { mirrorDora } from "../../../packages/content/src/augments/mirror_dora.js";
import { doraConceal } from "../../../packages/content/src/augments/dora_conceal.js";

function base(): GameState {
  return craft({
    hands: { p0: "123456789m234p55s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
}
const snap = (s: GameState, tag: string) => ({
  시점: tag, 손패: s.zones[handZone("p0")]!.tileIds.length,
  왕패: s.zones[DEAD_WALL]!.tileIds.length, 영상패: rinshanRemaining(s),
  패산: s.zones[WALL]!.tileIds.length,
  lastDrawn: s.round.lastDrawnTile === null ? "-" : kindKey(kindOf(s, s.round.lastDrawnTile)),
  lastDrawRinshan: s.round.lastDrawRinshan,
});

// ── G1 ────────────────────────────────────────────────────────────────
{
  const game = setup(base(), [{ def: rinshanPreview, holder: "p0" }, { def: deadWallMaster, holder: "p0" }]);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  const rows = [snap(game.engine.state, "시작")];
  const pick = (t: string, filter?: (o: any) => boolean) => {
    const o = status.prompts.find((x: any) => x.player === "p0")?.options.filter((x: any) => x.type === t).find(filter ?? (() => true));
    if (!o) { rows.push({ ...snap(game.engine.state, `${t} 후보없음`) }); return false; }
    status = flow.submit("p0", o);
    rows.push(snap(game.engine.state, t));
    return true;
  };
  pick("rinshan_pull");
  pick("dw_swap", (o) => o.payload.deadIndex === 0);
  pick("dw_swap", (o) => o.payload.deadIndex === 5);
  table("G1: 영상 정찰 교환 → 왕패의 주인 교환 2회 (같은 순)", rows);
}

// ── G2 ────────────────────────────────────────────────────────────────
{
  let st = base();
  st = reserveInWall(st, ["4m"]);
  st = setIndicator(st, "4m");
  const game = setup(st, [{ def: uraPeek, holder: "p0" }, { def: deadWallMaster, holder: "p1" }]);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  const opt = (p: string, t: string, f?: (o: any) => boolean) =>
    status.prompts.find((x: any) => x.player === p)?.options.filter((x: any) => x.type === t).find(f ?? (() => true));
  status = flow.submit("p0", opt("p0", "ura_peek_reveal"));
  const seen0 = [...((game.engine.state.augmentData["view:p0:ura#round"] as string[]) ?? [])];
  // p0 버림 → p1 차례에 왕패의 주인이 뒷도라 표시패 자리를 손패와 맞바꾼다
  status = flow.submit("p0", opt("p0", "discard"));
  for (let i = 0; i < 6 && status.kind === "awaiting"; i++) {
    const s = game.engine.state;
    const uraIdx = s.zones[DEAD_WALL]!.tileIds.indexOf(uraIndicatorIds(s)[0]!);
    const o = opt("p1", "dw_swap", (x: any) => x.payload.deadIndex === uraIdx);
    if (o) { status = flow.submit("p1", o); break; }
    const pr = status.prompts[0];
    status = flow.submit(pr.player, pr.options.find((x: any) => x.type === "pass") ?? pr.options[0]);
  }
  const s = game.engine.state;
  const actual = uraIndicatorIds(s).map((id) => kindKey(kindOf(s, id)));
  const shown = [...((s.augmentData["view:p0:ura#round"] as string[]) ?? [])];
  console.log("\n--- G2: ura_peek이 본 뒷도라 vs 왕패의 주인이 갈아 끼운 뒤의 실제 뒷도라");
  console.log("    확인 시점 표시 =", seen0.join(" "));
  console.log("    지금 p0 화면   =", shown.join(" "));
  console.log("    실제 뒷도라 표시패 =", actual.join(" "), shown.join(" ") === actual.join(" ") ? "→ 일치" : "→ **어긋남**");
}

// ── G3 ────────────────────────────────────────────────────────────────
{
  let st = base();
  st = reserveInWall(st, ["4m"]);
  st = setIndicator(st, "4m");
  const game = setup(st, [{ def: mirrorDora, holder: "p0" }, { def: deadWallMaster, holder: "p0" }]);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  const chan = () => JSON.stringify(game.engine.state.augmentData["view:*:mirror_dora:p0#round"]);
  const s0 = game.engine.state;
  const idx = s0.zones[DEAD_WALL]!.tileIds.indexOf(s0.round.doraIndicators[0]!);
  const before = kindKey(kindOf(s0, s0.round.doraIndicators[0]!));
  const o = status.prompts.find((x: any) => x.player === "p0")?.options.filter((x: any) => x.type === "dw_swap").find((x: any) => x.payload.deadIndex === idx);
  status = flow.submit("p0", o);
  const s1 = game.engine.state;
  console.log("\n--- G3: 왕패의 주인이 도라 표시패를 갈면 거울의 공개 채널이 따라오는가");
  console.log("    표시패", before, "→", kindKey(kindOf(s1, s1.round.doraIndicators[0]!)), "| 채널 =", chan());
}

// ── G5 ────────────────────────────────────────────────────────────────
{
  let st = base();
  st = reserveInWall(st, ["4m"]);
  st = setIndicator(st, "4m");
  const game = setup(st, [{ def: doraConceal, holder: "p1" }, { def: deadWallMaster, holder: "p0" }]);
  new FlowController(game.engine).begin();
  const s = game.engine.state;
  const v = buildPlayerView(s, "p0", game.engine.rules);
  const ind = s.round.doraIndicators[0]!;
  console.log("\n--- G5: dora_conceal(p1) × dead_wall_master(p0) — p0의 왕패 열람에서 표시패가 새는가");
  console.log("    p0 round.doraIndicators =", v.round.doraIndicators.length);
  console.log("    p0 왕패 zone에 표시패 실물 id 포함 =", (v.zones[DEAD_WALL]?.tileIds ?? []).includes(ind));
  console.log("    p0 tiles에 표시패 종류 =", v.tiles[ind] ? kindKey(v.tiles[ind]!.kind) : "(없음 — 가려짐)");
}
