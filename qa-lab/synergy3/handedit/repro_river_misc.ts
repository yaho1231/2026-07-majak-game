/**
 * 강·잔량 관련 잔여 조합.
 *
 * G1. 누명(frame_up) conflicts: ["picky_eater"] 의 **근거가 아직 살아 있는가**.
 *     주석: "심긴 패 한 장이 편식의 한 무늬 셈을 통째로 깬다" (피해자 쪽 파괴).
 *     기대: ① 지금 편식은 `p.player === holder` 만 세므로 심긴 패로 깨지지 **않는다**
 *           ② 그리고 conflicts 는 애초에 **같은 사람이 둘 다 드는 것**만 막으므로
 *              주석이 말하는 피해(상대편 편식)를 막지도 못한다.
 *
 * G2. 단색 세계(suit_unify) × 편식(picky_eater) — 둘 다 같은 리듀서를 쓴다.
 *     각각 "매 국 1회"인데 같은 국·같은 순에 두 번 물들일 수 있는가.
 *     기대: 서로 다른 증강이므로 둘 다 한 번씩, 즉 같은 순에 두 번 통일 가능(정상).
 *
 * G3. 정적의 손/날치기/도굴로 손에 넣은 패를 **무르기(take_back)로 패산에 버릴 수 있는가**.
 *     기대: 무르기는 "**쯔모한** 패를 되돌린다"고 적혀 있다. 바닥에서 집어 온 패는
 *           쯔모패가 아니므로 되돌림의 대상이 아니어야 한다.
 *           (되돌아가면 상대 바닥의 패를 공짜로 패산에 묻으면서 +2판까지 챙긴다.)
 *
 * G4. 날치기 → 도굴: 같은 패를 두 번 가져갈 수 있는가 / 창(최근 3장·10장)이 밀리는가.
 */
import { frameUp } from "../../../packages/content/src/augments/frame_up.js";
import { pickyEater } from "../../../packages/content/src/augments/picky_eater.js";
import { suitUnify } from "../../../packages/content/src/augments/suit_unify.js";
import { silentSwap } from "../../../packages/content/src/augments/silent_swap.js";
import { pondSnatch } from "../../../packages/content/src/augments/pond_snatch.js";
import { graveRob } from "../../../packages/content/src/augments/grave_rob.js";
import { takeBack } from "../../../packages/content/src/augments/take_back.js";
import { questProgress } from "../../../packages/content/src/augments/picky_eater.js";
import { roundScopedKey } from "../../../packages/content/src/augments/roundScope.js";
import {
  craft,
  withAugments,
  start,
  handIds,
  handSpec,
  pondIds,
  kindKey,
  kindOf,
  wallLen,
  tileCensus,
  check,
  section,
  done,
  validate,
  type GameState,
  type PlayerId,
} from "./lib.js";

section("G1. 누명 conflicts:[picky_eater] 의 근거");
{
  // p0 = 누명, p1 = 편식. p1 은 이 국에 만수만 버려 왔다(퀘스트 진행 중).
  const base = withAugments(
    craft({
      hands: { p0: "1p19s1234567z99p9m", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z2z", p1: "1m2m3m4m5m", p2: "3z", p3: "4z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: ["frame_up"], p1: ["picky_eater"] },
  );
  // 실게임에서는 편식의 리액션이 국 처음부터 돌아 '내가 버린 목록'이 쌓여 있다.
  // 픽스처에는 그 이벤트가 없으므로 같은 값을 미리 넣어 준다(폴백 경로를 피한다).
  const seeded: GameState = {
    ...base,
    augmentData: {
      ...base.augmentData,
      [roundScopedKey("picky_eater", "mine", base, "p1")]: ["man1", "man2", "man3", "man4", "man5"],
    },
  };
  const g = start(seeded, [
    { def: frameUp, holder: "p0" },
    { def: pickyEater, holder: "p1" },
  ]);
  const before = questProgress(g.game.engine.state, "p1");
  console.log(`  (폴백 없음 확인: tracked=5 discardCount=${g.game.engine.state.round.byPlayer["p1"]?.discardCount})`);
  console.log(`  심기 전 p1 퀘스트 = ${JSON.stringify(before)}`);
  // p0 이 1통(다른 무늬 수패)을 p1 바닥에 심는다
  const pin1 = handIds(g.game.engine.state, "p0").find(
    (id) => kindKey(kindOf(g.game.engine.state, id)) === "pin1",
  ) as number;
  const v = validate(g.game, "frame_discard", "p0", { tileId: pin1, target: "p1" });
  check("누명 발동", v === null, String(v));
  g.flow!.submit("p0", { type: "frame_discard", payload: { tileId: pin1, target: "p1" } });
  const after = questProgress(g.game.engine.state, "p1");
  console.log(`  심은 뒤 p1 퀘스트 = ${JSON.stringify(after)}`);
  check(
    "심긴 1통이 p1 편식 퀘스트를 깨지 않는다 (conflicts 주석의 근거가 사라졌다)",
    after.failed === false,
    JSON.stringify(after),
  );
  check(
    "p1 후리텐 이력에는 그대로 들어간다 (누명 본래 효과)",
    (g.game.engine.state.round.byPlayer["p1"]?.discardedKinds ?? []).includes("pin1"),
    "",
  );
}

section("G2. 단색 세계 × 편식 — 같은 순에 두 번 통일");
{
  const base = withAugments(
    craft({
      hands: { p0: "234m567m99p234s55p5z", p1: "*", p2: "*", p3: "*" },
      // 편식 퀘스트 달성: 만수만 12장
      discards: { p0: "123456789m123m", p1: "1z", p2: "2z", p3: "3z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: ["suit_unify", "picky_eater"] },
  );
  const g = start(base, [
    { def: suitUnify, holder: "p0" },
    { def: pickyEater, holder: "p0" },
  ]);
  console.log(`  퀘스트 = ${JSON.stringify(questProgress(g.game.engine.state, "p0"))}`);
  const v1 = validate(g.game, "mono_world", "p0", { suit: "pin" });
  console.log(`  mono_world = ${JSON.stringify(v1)}`);
  if (v1 === null) g.flow!.submit("p0", { type: "mono_world", payload: { suit: "pin" } });
  console.log(`  통일1 후 손 = ${handSpec(g.game.engine.state, "p0")}`);
  const v2 = validate(g.game, "picky_unify", "p0", { suit: "sou" });
  console.log(`  picky_unify = ${JSON.stringify(v2)}`);
  if (v2 === null) g.flow!.submit("p0", { type: "picky_unify", payload: { suit: "sou" } });
  const s = g.game.engine.state;
  console.log(`  통일2 후 손 = ${handSpec(s, "p0")}`);
  const c = tileCensus(s);
  check("두 번 통일해도 손패 14장", handIds(s, "p0").length === 14, String(handIds(s, "p0").length));
  check("존 중복 없음", c.dupes.length === 0, c.dupes.join(","));
  check("총 136장", c.total === 136, String(c.total));
}

section("G3. 강에서 집어 온 패를 무르기로 패산에 묻을 수 있는가");
for (const [name, def, action, payloadOf] of [
  ["정적의 손", silentSwap, "silent_take", (id: number) => ({ tileId: id })],
  ["날치기", pondSnatch, "pond_snatch", (id: number) => ({ snatchId: id, fromPlayer: "p1" as PlayerId })],
] as const) {
  const base = withAugments(
    craft({
      hands: { p0: "234m567m99p234s55p5z", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z", p1: "2z3z4z", p2: "5z", p3: "6z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: [def.id, "take_back"] },
  );
  const g = start(base, [
    { def, holder: "p0" },
    { def: takeBack, holder: "p0" },
  ]);
  const target = pondIds(g.game.engine.state, "p1").at(-1) as number;
  const v = validate(g.game, action, "p0", payloadOf(target));
  check(`${name} 발동`, v === null, String(v));
  if (v !== null) continue;
  g.flow!.submit("p0", { type: action, payload: payloadOf(target) });
  const s1 = g.game.engine.state;
  console.log(`  ${name}: 집어 온 패=${target}:${kindKey(kindOf(s1, target))} · lastDrawn=${s1.round.lastDrawnTile} · WALL=${wallLen(s1)}`);
  const tv = validate(g.game, "take_back", "p0", {});
  console.log(`  take_back validate = ${JSON.stringify(tv)}`);
  check(
    `기대: 바닥에서 집어 온 패는 무르기 대상이 아니다 (${name})`,
    tv !== null,
    `실제=${JSON.stringify(tv)}`,
  );
  if (tv === null) {
    g.flow!.submit("p0", { type: "take_back", payload: {} });
    const s2 = g.game.engine.state;
    console.log(
      `    → 무른 뒤: 패산 맨 밑=${(s2.zones["wall"]?.tileIds ?? []).at(-1)} · WALL=${wallLen(s2)} · p1 바닥=${pondIds(s2, "p1").length}장`,
    );
    const c = tileCensus(s2);
    check(`  ${name}: 존 중복 없음`, c.dupes.length === 0, c.dupes.join(","));
    check(`  ${name}: 총 136장`, c.total === 136, String(c.total));
  }
}

section("G4. 날치기 → 도굴: 같은 패 두 번 / 창 깊이");
{
  const base = withAugments(
    craft({
      hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z", p1: "1s2s3s4s5s3m", p2: "5z", p3: "6z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: ["pond_snatch", "grave_rob"] },
  );
  const g = start(base, [
    { def: pondSnatch, holder: "p0" },
    { def: graveRob, holder: "p0" },
  ]);
  const s0 = g.game.engine.state;
  const threeMan = pondIds(s0, "p1").find((id) => kindKey(kindOf(s0, id)) === "man3") as number;
  console.log(`  p1 바닥 = ${pondIds(s0, "p1").map((id) => kindKey(kindOf(s0, id))).join(",")}`);
  // 먼저 날치기로 3만을 가져간다
  const v = validate(g.game, "pond_snatch", "p0", { snatchId: threeMan, fromPlayer: "p1" });
  check("날치기 발동", v === null, String(v));
  g.flow!.submit("p0", { type: "pond_snatch", payload: { snatchId: threeMan, fromPlayer: "p1" } });
  const s1 = g.game.engine.state;
  const gv = validate(g.game, "grave_rob", "p0", { graveId: threeMan, fromPlayer: "p1" });
  console.log(`  같은 3만을 도굴 시도 = ${JSON.stringify(gv)}`);
  check("같은 패를 두 번 가져갈 수 없다", gv !== null, String(gv));
  console.log(`  p1 후리텐 이력 = ${(s1.round.byPlayer["p1"]?.discardedKinds ?? []).join(",")}`);
  check(
    "원주인의 후리텐 이력은 남는다",
    (s1.round.byPlayer["p1"]?.discardedKinds ?? []).includes("man3"),
    "",
  );
  const c = tileCensus(s1);
  check("존 중복 없음", c.dupes.length === 0, c.dupes.join(","));
}

done();
