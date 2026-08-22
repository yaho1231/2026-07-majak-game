/**
 * B — red_five_touch(붉은 손길) × 도라 증강 / 소유권
 *  B1 각인된 적도라를 상대가 후로로 가져가면 상대 점수에 안 들어가는가
 *  B2 각인 × mirror_dora / ankan_dora 가 합으로 붙는가
 *  B3 cliff_bloom 만개가 만든 생성패에 각인이 자동으로 붙는가
 */
import {
  craft, setup, evalWin, extraHan, table, discardsZone, handZone, meldsZone,
  kindKey, kindOf, setIndicator, reserveInWall, FlowController,
} from "./lib.js";
import type { GameState, PlayerId, TileId } from "./lib.js";
import { redFiveTouch } from "../../../packages/content/src/augments/red_five_touch.js";
import { mirrorDora } from "../../../packages/content/src/augments/mirror_dora.js";
import { ankanDora } from "../../../packages/content/src/augments/ankan_dora.js";
import { cliffBloom } from "../../../packages/content/src/augments/cliff_bloom.js";
import { roundKey } from "../../../packages/content/src/util.js";

// ── B1/B2: p0가 5를 각인한 뒤 화료 ─────────────────────────────────────────
function scene(indicator: string): GameState {
  let st = craft({
    hands: { p0: "55m345m345p345s555s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  st = reserveInWall(st, [indicator]);
  return setIndicator(st, indicator);
}

function redRun(label: string, augs: any[], doTouch: boolean, indicator = "9p") {
  const game = setup(scene(indicator), augs);
  const flow = new FlowController(game.engine);
  let status: any = flow.begin();
  if (doTouch) {
    const o = status.prompts.find((x: any) => x.player === "p0")?.options
      .find((x: any) => x.type === "red_touch" && (x.payload as any).rank === 5);
    if (!o) throw new Error("red_touch(5) 후보 없음");
    status = flow.submit("p0", o);
  }
  const s = game.engine.state;
  const hand = s.zones[handZone("p0")]!.tileIds;
  const marks = hand.map((id) => ({ k: kindKey(kindOf(s, id)), a: s.tiles[id]!.attrs }))
    .filter((x) => x.a?.red === true);
  // 쯔모 화료로 채점 (14장)
  const win = s.round.lastDrawnTile as TileId;
  const ev = evalWin(game, "p0", "tsumo", win);
  return {
    조합: label, "표시패": indicator,
    "각인/적도라 장수": marks.length,
    redHan: ev?.redHan ?? -1, doraHan: ev?.doraHan ?? -1, extraHan: extraHan(game, "p0"),
  };
}

table("B2: red_five_touch(5 각인) × mirror_dora — 표시패 4m(도라 5m·앞도라 3m)", [
  redRun("없음", [], false, "4m"),
  redRun("red_touch만", [{ def: redFiveTouch, holder: "p0" }], true, "4m"),
  redRun("mirror만", [{ def: mirrorDora, holder: "p0" }], false, "4m"),
  redRun("red+mirror", [{ def: redFiveTouch, holder: "p0" }, { def: mirrorDora, holder: "p0" }], true, "4m"),
]);

// ── B1: 각인된 5를 상대가 펑해 가면 상대 점수에 안 들어가는가 ─────────────
{
  const st = craft({
    hands: { p1: "234m234s55s", p0: "*", p2: "*", p3: "*" },
    melds: { p1: [{ kind: "pon", spec: "555p", from: "p0" }, { kind: "pon", spec: "111z", from: "p2" }] },
    phase: "turn.act", turnSeat: 1, drawnLastFor: "p1",
  });
  const meldIds = st.zones[meldsZone("p1")]!.tileIds;
  const fiveP = meldIds.find((id) => kindKey(kindOf(st, id)) === "pin5")!;
  const mark = (attrs: Record<string, unknown> | undefined): GameState => ({
    ...st, tiles: { ...st.tiles, [fiveP]: { ...st.tiles[fiveP]!, attrs: attrs as any } },
  });
  const win = st.zones[handZone("p1")]!.tileIds.at(-1) as TileId;
  const rows = [
    { 사례: "표시 없음", ev: evalWin(setup(mark(undefined), []), "p1", "tsumo", win) },
    { 사례: "자연 적도라 {red}", ev: evalWin(setup(mark({ red: true }), []), "p1", "tsumo", win) },
    { 사례: "p0가 각인 {red,redFor:p0}", ev: evalWin(setup(mark({ red: true, redFor: "p0" }), []), "p1", "tsumo", win) },
    { 사례: "p1 자신의 각인 {red,redFor:p1}", ev: evalWin(setup(mark({ red: true, redFor: "p1" }), []), "p1", "tsumo", win) },
  ].map((r) => ({ 사례: r.사례, "p1 redHan": r.ev?.redHan ?? "(화료형 아님)", ok: r.ev?.ok }));
  table("B1: 각인된 적도라가 상대(p1) 후로에 있을 때 p1의 적도라 판수", rows);
}

// ── B3: cliff_bloom 만개가 만든 생성패에 각인이 붙는가 ──────────────────────
{
  const base = craft({
    hands: { p0: "1111m5555p234599s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act", turnSeat: 0, drawnLastFor: "p0",
  });
  const primed: GameState = {
    ...base,
    augmentData: {
      ...base.augmentData,
      [`cliff_bloom:kans:${roundKey(base)}:p0#round`]: 1,
      "red_five_touch:rank:p0": 5,
      "red_five_touch:used:p0": true,
    },
  };
  const game = setup(primed, [{ def: cliffBloom, holder: "p0" }, { def: redFiveTouch, holder: "p0" }]);
  const flow = new FlowController(game.engine);
  const status: any = flow.begin();
  const ankan = status.prompts.find((x: any) => x.player === "p0")?.options.find((o: any) => o.type === "ankan");
  flow.submit("p0", ankan);
  const s = game.engine.state;
  const hand = s.zones[handZone("p0")]!.tileIds;
  const rows = hand.map((id) => ({ 종류: kindKey(kindOf(s, id)), conjured: s.tiles[id]!.attrs?.conjured === true, red: s.tiles[id]!.attrs?.red === true, redFor: s.tiles[id]!.attrs?.redFor ?? "-" }));
  table("B3: 만개 직후 p0 손패 (5 각인 보유자)", rows);
  const ev = evalWin(game, "p0", "tsumo", s.round.lastDrawnTile as TileId);
  console.log("    만개 손 채점: redHan =", ev?.redHan, " doraHan =", ev?.doraHan, " extraHan =", extraHan(game, "p0"));
}
