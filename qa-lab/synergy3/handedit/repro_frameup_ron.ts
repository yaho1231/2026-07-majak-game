/**
 * 누명(frame_up) × 상대의 론·후리텐 — 심긴 패로 누가 날 수 있는가.
 *
 * 기대(먼저 적는다):
 *   detail: "실제로 버린 사람은 나이므로 **다른 상대의 론은 평소대로 열려 있고**,
 *            그 패로 쏘이면 책임도 내가 진다."
 *   → ① 제3자(p2·p3)는 그 패로 론할 수 있어야 하고 방총 책임은 p0.
 *     ② 지목당한 p1 은? 카드가 약속한 것은 "그 사람이 버린 것으로 기록되어 후리텐에 걸린다"
 *        이므로 p1 은 그 패로 론할 수 없어야 한다(자기 버림패로 취급).
 */
import { frameUp } from "../../../packages/content/src/augments/frame_up.js";
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
} from "./lib.js";
import { FlowController } from "@majak/core";

section("심긴 패로 론");
{
  // p0 이 3만을 심는다. p1·p2 둘 다 3만 대기 텐파이.
  const base = withAugments(
    craft({
      hands: {
        p0: "3m19p19s1234567z9m",
        p1: "123m456m789m123p3m",
        p2: "456m789m123p123s3m",
        p3: "*",
      },
      discards: { p0: "1p2p", p1: "9s8s", p2: "9p8p", p3: "1z2z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: ["frame_up"] },
  );
  const g = start(base, [{ def: frameUp, holder: "p0" }]);
  const three = handIds(g.game.engine.state, "p0").find(
    (id) => kindKey(kindOf(g.game.engine.state, id)) === "man3",
  ) as number;
  const st = (g.flow as FlowController).submit("p0", {
    type: "frame_discard",
    payload: { tileId: three, target: "p1" },
  });
  const s = g.game.engine.state;
  console.log(`  lastDiscard = ${JSON.stringify(s.round.lastDiscard)} (책임 = 실제 버린 사람)`);
  console.log(`  p1 이력 = ${(s.round.byPlayer["p1"]?.discardedKinds ?? []).join(",")}`);
  const prompts = st.kind === "awaiting" ? st.prompts : [];
  for (const p of prompts) {
    console.log(`  프롬프트 ${p.player}: ${p.options.map((o) => o.type).join(",")}`);
  }
  const canWin = (who: string): boolean =>
    prompts.find((p) => p.player === who)?.options.some((o) => o.type === "win") ?? false;
  // p2 는 역이 없어 화료 불가(누명과 무관), p3 는 배패가 자동이라 역이 섰다.
  check(
    "① 제3자는 심긴 패로 론할 수 있다",
    canWin("p2") || canWin("p3"),
    `p2=${canWin("p2")} p3=${canWin("p3")}`,
  );
  // p1 은 一気通貫(123m456m789m)이 있어 역 부족이 아니다 → 막는 이유는 후리텐뿐이다.
  check("② 지목당한 p1 은 자기 버림패 취급이라 론할 수 없다 (역은 있다)", !canWin("p1"), "");
  check(
    "방총 책임은 실제로 버린 p0",
    s.round.lastDiscard?.player === "p0",
    JSON.stringify(s.round.lastDiscard),
  );
}

done();
