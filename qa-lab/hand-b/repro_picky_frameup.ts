/**
 * 편식(picky_eater) × 누명(frame_up)
 *
 * frame_up 소스는 `conflicts: ["picky_eater"]`를 달아 두고 그 이유를
 * "편식은 자기 바닥에서 퀘스트를 세는데 누명은 남의 바닥에 실물을 심는다 —
 *  심긴 패 한 장이 퀘스트를 통째로 깨고, 피해자는 플레이로 피할 수 없다"고 적었다.
 *
 * 그런데 conflicts는 **한 사람이 두 증강을 동시에 갖는 것**만 막는다
 * (DraftController.excludeFor: held 기준). 누명은 애초에 **남**에게 쓰는 증강이라
 * 같은 사람이 둘 다 갖는 조합은 피해가 성립하지 않는 조합이다 —
 * 즉 이 잠금은 막으려던 상황을 하나도 막지 못한다.
 *
 * 여기서 p1(누명)이 p0(편식)의 퀘스트를 실제로 깨는지 확인한다.
 */
import {
  FlowController,
  createStandardGameFromState,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { pickyEater, questProgress } from "../../packages/content/src/augments/picky_eater.js";
import { frameUp } from "../../packages/content/src/augments/frame_up.js";

const withAug = (st: GameState, p: PlayerId, a: string[]): GameState => ({
  ...st,
  players: st.players.map((x) => (x.id === p ? { ...x, augments: [...a] } : x)),
});

// p0 는 만수 + 자패만 11장 버려 왔다 (퀘스트 진행 11/12, 실패 아님)
let st = craft({
  hands: { p0: "*", p1: "23456789m1234p", p2: "*", p3: "*" },
  discards: { p0: "123456789m12z" }, // 만수 9 + 자패 2 = 11장
  phase: "turn.act",
  turnSeat: 1,
  drawnLastFor: "p1",
});
st = withAug(withAug(st, "p0", ["picky_eater"]), "p1", ["frame_up"]);

const before = questProgress(st, "p0");
console.log("심기 전 p0 퀘스트:", JSON.stringify(before));

const game = createStandardGameFromState(st);
installAugment(game.engine, pickyEater, "p0", { yaku: game.yaku });
installAugment(game.engine, frameUp, "p1", { yaku: game.yaku });
const flow = new FlowController(game.engine);
let s = flow.begin();
if (s.kind !== "awaiting") throw new Error("no prompt");

// p1이 통수(pin) 한 장을 p0 바닥에 심는다
const opts = s.prompts.find((x) => x.player === "p1")?.options ?? [];
const frame = opts.find((o) => {
  if (o.type !== "frame_discard") return false;
  const p = o.payload as { tileId?: TileId; target?: PlayerId };
  if (p.target !== "p0" || p.tileId === undefined) return false;
  return kindOf(game.engine.state, p.tileId).suit === "pin";
});
console.log("frame_discard 후보 수:", opts.filter((o) => o.type === "frame_discard").length);
if (frame === undefined) throw new Error("no frame option targeting p0 with a pin tile");
console.log("심는 패:", kindKey(kindOf(game.engine.state, (frame.payload as { tileId: TileId }).tileId)));
s = flow.submit("p1", frame as { type: string; payload: unknown });

const after = questProgress(game.engine.state, "p0");
console.log("심은 뒤 p0 퀘스트:", JSON.stringify(after));
console.log(
  after.failed && !before.failed
    ? "🔴 확정: p0가 버리지도 않은 패 한 장으로 편식 퀘스트가 실패했다 (conflicts로는 막히지 않는다)"
    : "변화 없음",
);
console.log("p0 discardedKinds:", (game.engine.state.round.byPlayer.p0?.discardedKinds ?? []).join(" "));
console.log("p0 discardCount:", game.engine.state.round.byPlayer.p0?.discardCount);
void handZone;
