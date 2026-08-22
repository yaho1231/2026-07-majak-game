/**
 * 누명(frame_up) × 귀환(honor_return) — "내가 버린 자패"의 근거가 남의 것이 된다.
 *
 * 기대(먼저 적는다):
 *   귀환: "발동 시점까지 이번 국에 **내가 버린 자패**를 … 최대 4장 기억한다."
 *   누명: "그 사람이 버린 것으로 **기록되어 후리텐에 걸리고**, 내 바닥에는 남지 않아
 *          내 후리텐은 회피된다." — 약속한 것은 **후리텐 이력**과 **바닥**뿐이다.
 *   → ① 보유자가 누명으로 흘린 자패는 **여전히 내가 버린 자패**이므로 귀환이 기억해야 한다.
 *     ② 피해자가 귀환을 들고 있으면, 자기가 버리지도 않은 자패가 귀환 목록에 올라서는 안 된다.
 */
import { frameUp } from "../../../packages/content/src/augments/frame_up.js";
import { honorReturn } from "../../../packages/content/src/augments/honor_return.js";
import {
  craft,
  withAugments,
  start,
  handIds,
  kindKey,
  kindOf,
  check,
  section,
  done,
  validate,
} from "./lib.js";

section("① 보유자 쪽 — 누명으로 흘린 자패는 귀환이 기억하는가");
{
  const base = withAugments(
    craft({
      // p0 손에 東(1z)이 있다. 이 국에 자패를 아직 하나도 안 버렸다.
      hands: { p0: "1z234m567m99p234s5p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1m2m", p1: "9m", p2: "9p", p3: "9s" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: ["frame_up", "honor_return"] },
  );
  const g = start(base, [
    { def: frameUp, holder: "p0" },
    { def: honorReturn, holder: "p0" },
  ]);
  const east = handIds(g.game.engine.state, "p0").find(
    (id) => kindKey(kindOf(g.game.engine.state, id)) === "wind1",
  ) as number;

  // 대조군 A: 표준으로 東을 버렸다면 귀환이 열린다
  {
    const g2 = start(base, [{ def: honorReturn, holder: "p0" }]);
    const eid = handIds(g2.game.engine.state, "p0").find(
      (id) => kindKey(kindOf(g2.game.engine.state, id)) === "wind1",
    ) as number;
    g2.flow!.submit("p0", { type: "discard", payload: { tileId: eid } });
    // 다음 자기 순이 아니므로 validate 만 본다 (턴 조건은 별개)
    const hist = g2.game.engine.state.round.byPlayer["p0"]?.discardedKinds ?? [];
    console.log(`  [표준 버림] p0 이력 = ${hist.join(",")}`);
    check("표준 버림이면 이력에 wind1 이 남는다", hist.includes("wind1"), "");
  }

  // A+B: 누명으로 東을 p1 바닥에 심는다
  g.flow!.submit("p0", { type: "frame_discard", payload: { tileId: east, target: "p1" } });
  const s = g.game.engine.state;
  console.log(`  [누명] p0 이력 = ${(s.round.byPlayer["p0"]?.discardedKinds ?? []).join(",")}`);
  console.log(`  [누명] p1 이력 = ${(s.round.byPlayer["p1"]?.discardedKinds ?? []).join(",")}`);
  // 귀환의 재료는 `round.byPlayer[holder].discardedKinds` 하나뿐이다(honor_return.ts:82).
  check(
    "기대: 누명으로 흘려도 '내가 버린 자패'라 귀환의 재료로 남는다",
    (s.round.byPlayer["p0"]?.discardedKinds ?? []).includes("wind1"),
    `p0 이력에서 wind1 이 사라졌다 → 귀환이 그 東을 기억하지 못한다`,
  );
}

section("② 피해자 쪽 — 심긴 자패가 피해자의 귀환 목록에 오르는가");
{
  const base = withAugments(
    craft({
      hands: { p0: "1z234m567m99p234s5p", p1: "111s222s333s44s5s", p2: "*", p3: "*" },
      discards: { p0: "1m2m", p1: "9m8m", p2: "9p", p3: "9s" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: ["frame_up"], p1: ["honor_return"] },
  );
  const g = start(base, [
    { def: frameUp, holder: "p0" },
    { def: honorReturn, holder: "p1" },
  ]);
  const east = handIds(g.game.engine.state, "p0").find(
    (id) => kindKey(kindOf(g.game.engine.state, id)) === "wind1",
  ) as number;
  // 심기 전 p1 의 귀환 가능 여부
  const before = validate(g.game, "honor_recall", "p1", {});
  console.log(`  심기 전 p1 honor_recall = ${JSON.stringify(before)} (턴이 아니므로 'not your turn' 이 정상)`);
  g.flow!.submit("p0", { type: "frame_discard", payload: { tileId: east, target: "p1" } });
  const s = g.game.engine.state;
  const hist = s.round.byPlayer["p1"]?.discardedKinds ?? [];
  console.log(`  심은 뒤 p1 이력 = ${hist.join(",")}`);
  check(
    "기대: 피해자가 버리지도 않은 자패가 이력에 들어가면 귀환 재료가 된다",
    !hist.includes("wind1"),
    `p1 이력에 wind1 이 들어갔다 → p1 의 귀환이 그 東을 다음 국 배패로 받는다`,
  );
}

done();
