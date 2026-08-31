/**
 * 후로를 넓히는 카드끼리 — 치(chi) 축.
 *   omni_chi       : 누구의 버림패로도 치 (call.chi.fromAnyone)
 *   broken_border  : 슌쯔의 무늬 제한 해제 (scoring.mixedRuns) — 치 후보도 이 규칙을 본다
 *
 * 예측: 둘을 함께 들면 «아무에게서나 · 무늬 섞어» 치할 수 있어야 한다.
 *  - 없음/상가(p3) : 2s3s+4s 만
 *  - 없음/대면(p2) : 치 없음
 *  - omni_chi/p2   : 2s3s+4s
 *  - border/p3     : 2s3s + 2m3p 등 혼색 후보까지
 *  - 둘 다/p2      : 혼색 후보까지 p2에게서
 */
import { craft, mkGame, withAugments, shapeOn, optionsFor, FlowController } from "./lib.js";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { kindKey } from "@majak/core";

const HAND = "2s3s2m3p11z22z33z44z5z"; // 13장

function seatOf(id: PlayerId): number { return Number(id.slice(1)); }

function run(label: string, augs: string[], from: PlayerId, border: boolean): void {
  let s: GameState = craft({
    hands: { p0: HAND, p1: "*", p2: "*", p3: "*" },
    discards: { p0: "6z", p1: "6z", p2: "6z", p3: "6z" },
    phase: "reaction",
    turnSeat: seatOf(from),
    lastDiscard: { player: from, spec: "4s" },
  });
  s = withAugments(s, { p0: augs });
  if (border) s = shapeOn(s, "broken_border", "p0");
  const game = mkGame(s);
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  const opts = optionsFor(status, "p0").filter((o) => o.type === "chi");
  const shown = opts.map((o) => {
    const ids = (o.payload as { tileIds: TileId[] }).tileIds;
    return ids.map((i) => kindKey(game.engine.state.tiles[i]!.kind)).join("+");
  });
  console.log(`${label.padEnd(34)} | chi후보 ${opts.length}: ${shown.join(" , ") || "-"}`);
}

run("없음 / 상가(p3)", [], "p3", false);
run("없음 / 대면(p2)", [], "p2", false);
run("A omni_chi / 대면(p2)", ["omni_chi"], "p2", false);
run("B broken_border / 상가(p3)", ["broken_border"], "p3", true);
run("B broken_border / 대면(p2)", ["broken_border"], "p2", true);
run("A+B / 상가(p3)", ["omni_chi", "broken_border"], "p3", true);
run("A+B / 대면(p2)", ["omni_chi", "broken_border"], "p2", true);
run("A+B(선언 안 함) / 대면(p2)", ["omni_chi", "broken_border"], "p2", false);
