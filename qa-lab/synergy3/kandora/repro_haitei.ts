/**
 * E — haitei_lord × conjure_draw (같은 쯔모패에 두 증강이 동시에 손댄다)
 *    + haitei_lord × bottom_deal / north_trader (해저패의 정체)
 */
import { craft, setup, truncateWall, FlowController, kindKey, kindOf, handZone, WALL, table } from "./lib.js";
import type { GameState } from "./lib.js";
import { haiteiLord } from "../../../packages/content/src/augments/haitei_lord.js";
import { conjureDraw } from "../../../packages/content/src/augments/conjure_draw.js";
import { bottomDeal } from "../../../packages/content/src/augments/bottom_deal.js";
import { northTrader } from "../../../packages/content/src/augments/north_trader.js";
import { roundKey } from "../../../packages/content/src/util.js";

const DEFS: Record<string, any> = { haitei_lord: haiteiLord, conjure_draw: conjureDraw, bottom_deal: bottomDeal, north_trader: northTrader };

/** p0 텐파이(123456789m234p + 5s 단기), 패산 1장 남음, p3 차례가 끝나 p0가 뽑을 참 */
function scene(): GameState {
  const st = craft({
    hands: { p0: "123456789m234p5s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.draw",
    turnSeat: 0,
  });
  return truncateWall(st, 1);
}

function run(label: string, augs: string[], conjureTo?: string) {
  let st = scene();
  const wallTile = st.zones[WALL]!.tileIds[0]!;
  const before = kindKey(kindOf(st, wallTile));
  if (conjureTo) {
    // 소환 예약을 미리 심는다 (액션 경로는 별도 검증)
    st = { ...st, augmentData: { ...st.augmentData, [`conjure_draw:pending:${roundKey(st)}:p0#round`]: conjureTo === "1m" ? { suit: "man", rank: 1 } : { suit: "sou", rank: 9 } } };
  }
  const game = setup(st, augs.map((a) => ({ def: DEFS[a], holder: "p0" as const })));
  const flow = new FlowController(game.engine);
  flow.begin();
  const s = game.engine.state;
  const drawn = s.round.lastDrawnTile;
  const after = drawn === null ? "(없음)" : kindKey(kindOf(s, drawn));
  const fired = s.augmentData[`haitei_lord:fired:${roundKey(s)}:p0#round`] === true;
  const pending = s.augmentData[`conjure_draw:pending:${roundKey(s)}:p0#round`];
  return {
    조합: label,
    "패산 마지막패": before,
    "손에 들어온 패": after,
    "haitei 발동": fired,
    "소환 예약 남음": pending === undefined || pending === null ? "소진/없음" : JSON.stringify(pending),
  };
}

table("E1: 해저패 한 장 — haitei_lord × conjure_draw", [
  run("없음", []),
  run("haitei_lord만", ["haitei_lord"]),
  run("conjure_draw만(1m 소환)", ["conjure_draw"], "1m"),
  run("A+B (오름패는 5s, 소환은 1m)", ["haitei_lord", "conjure_draw"], "1m"),
  run("A+B (소환이 9s — 오름패 아님)", ["haitei_lord", "conjure_draw"], "9s"),
]);

table("E1b: 설치 순서를 뒤집으면? (conjure_draw 먼저 설치)", [
  run("conjure→haitei (1m)", ["conjure_draw", "haitei_lord"], "1m"),
  run("haitei→conjure (1m)", ["haitei_lord", "conjure_draw"], "1m"),
]);
