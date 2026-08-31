/**
 * T8 — 소환(conjure_draw)이 «다음 쯔모»를 갈아 끼우는데, 그 다음 쯔모를 예고하는
 * 정보 카드(삼세 예지·예지)가 그 사실을 반영하는가.
 *
 * 예측: 반영하지 않는다 — 두 예고 카드는 모두 «패산의 kind»에서 파생되고,
 * 소환은 **뽑힌 뒤에** 그 한 장의 kind를 바꾼다(TILE_DRAWN 리액션). 그래서 예고는
 * 실제로 손에 들어올 패와 다른 종류를 확신 있게 보여 준다.
 *
 * 삼세 예지의 카드 문구: "내 다음 쯔모 세 장의 종류가 실시간으로 보인다".
 */
import { WALL, act, base, build, head, kindKey, kindOf, line, ok, view } from "./lib.js";
import { handZone } from "./lib.js";

head("triple_peek + conjure_draw (같은 좌석 p0)");
const st = base();
const g = build(st, { p0: ["triple_peek", "conjure_draw"] });
line(`  triple_peek_use → ${act(g, "p0", "triple_peek_use") ?? "ok"}`);
const before = view(g, "p0").augmentView["triple_peek"];
line(`  예고(소환 전) = ${JSON.stringify(before)}`);

// 손패에서 예고와 다른 종류를 하나 골라 소환한다
const s0 = g.engine.state;
const wallNext = kindKey(kindOf(s0, s0.zones[WALL]!.tileIds[0]!));
const hand = s0.zones[handZone("p0")]!.tileIds;
const pick = hand.find((id) => kindKey(kindOf(s0, id)) !== wallNext)!;
line(`  패산 다음 장 = ${wallNext} / 소환할 패 = ${kindKey(kindOf(s0, pick))}`);
line(`  conjure_tsumo → ${act(g, "p0", "conjure_tsumo", { tileId: pick }) ?? "ok"}`);

const after = view(g, "p0").augmentView["triple_peek"];
line(`  예고(소환 후) = ${JSON.stringify(after)}`);
line(`  전원 공개된 소환 목표 = ${JSON.stringify(view(g, "p1").augmentView["conjure_draw:p0"])}`);
const first = Array.isArray(after) ? (after as string[])[0] : undefined;
ok(
  first === kindKey(kindOf(s0, pick)),
  "예고 첫 장이 «실제로 들어올 소환패»로 갱신된다 (실패하면 예고가 거짓)",
);
line(`  → 예고 첫 장 = ${String(first)}, 실제로 들어올 패 = ${kindKey(kindOf(s0, pick))}`);

head("foresight(p0) + conjure_draw(p1) — 남의 좌석 소환이 «배정»을 거짓으로 만드는가");
{
  const s = base();
  const g2 = build(s, { p0: ["foresight"], p1: ["conjure_draw"] });
  line(`  p0 foresight_reveal → ${act(g2, "p0", "foresight_reveal") ?? "ok"}`);
  line(`  예고 4장 = ${JSON.stringify(view(g2, "p0").augmentView["foresight_peek"])}`);
  // p1 차례로 만든 판에서 소환한다
  const s2 = base({ turnSeat: 1, drawnLastFor: "p1" });
  const g3 = build(s2, { p0: ["foresight"], p1: ["conjure_draw"] });
  const h1 = g3.engine.state.zones[handZone("p1")]!.tileIds;
  const w0 = kindKey(kindOf(g3.engine.state, g3.engine.state.zones[WALL]!.tileIds[0]!));
  const pick1 = h1.find((id) => kindKey(kindOf(g3.engine.state, id)) !== w0)!;
  line(`  p1 conjure_tsumo(${kindKey(kindOf(g3.engine.state, pick1))}) → ${act(g3, "p1", "conjure_tsumo", { tileId: pick1 }) ?? "ok"}`);
  line(`  (p1이 다음에 뽑을 자리의 패산 kind = ${w0}, 실제로는 ${kindKey(kindOf(g3.engine.state, pick1))}로 물질화된다)`);
  line(`  p0 foresight_reveal(같은 판) → ${act(g3, "p0", "foresight_reveal") ?? "ok"}`);
  line(`  p0 예고 4장 = ${JSON.stringify(view(g3, "p0").augmentView["foresight_peek"])}`);
  line("  → 첫 장(= 다음에 뽑을 p1의 몫)이 패산 kind 그대로면, 예지의 «배정» 설명이 그 자리에서 거짓이다");
}
