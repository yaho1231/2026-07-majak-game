/**
 * 누명(frame_up) × 정적의 손(silent_swap) / 날치기(pond_snatch) / 무덤 도굴(grave_rob)
 *
 * 기대(먼저 적는다):
 *   세 증강 모두 "**내 바닥은 대상이 아니다**"(정적의 손 detail) ·
 *   "cannot snatch your own pond" · "내 바닥의 패는 파낼 수 없다"(도굴 detail)를 약속한다.
 *   뜻은 "내가 버린 패를 도로 집는 길은 막는다"이다.
 *   누명은 내가 버린 패를 **남의 바닥**에 놓는다 → 위 세 판정은 전부 '바닥의 물리적
 *   주인'으로 하므로 그 패는 남의 패로 보인다.
 *   기대값: 내가 버린 패는 어디에 놓였든 내가 도로 집을 수 없어야 한다.
 *   덤으로 누명이 내 후리텐을 지웠으므로 그 패로 화료까지 성립하는지 잰다.
 */
import { frameUp } from "../../../packages/content/src/augments/frame_up.js";
import { silentSwap } from "../../../packages/content/src/augments/silent_swap.js";
import { pondSnatch } from "../../../packages/content/src/augments/pond_snatch.js";
import { graveRob } from "../../../packages/content/src/augments/grave_rob.js";
import {
  craft,
  withAugments,
  start,
  handIds,
  pondIds,
  kindOf,
  check,
  section,
  done,
  validate,
  type GameState,
  type PlayerId,
} from "./lib.js";

/**
 * p0 : 123m456m789m123p + 3m 단기 대기 (쯔모패 9통).
 * `framed` 면 3만이 **p1 바닥에** 있고 p0 의 후리텐 이력에는 없다 (= 누명 결과).
 * `plain` 이면 3만이 **p0 바닥에** 있고 p0 는 후리텐이다 (= 표준 버림).
 */
function scene(mode: "framed" | "plain", augs: string[]): GameState {
  const base = craft({
    hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
    discards: {
      p0: mode === "plain" ? "1z3m" : "1z",
      p1: mode === "framed" ? "2z3z3m" : "2z3z",
      p2: "5z",
      p3: "6z",
    },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  if (mode === "framed") {
    // 누명의 결과를 그대로 재현: 실물은 p1 바닥, 후리텐 이력도 p1 쪽 (p0 에는 없다)
    return withAugments(base, { p0: augs });
  }
  return withAugments(base, { p0: augs });
}

const threeManIn = (s: GameState, owner: PlayerId): number => {
  const found = pondIds(s, owner).find((id) => {
    const k = kindOf(s, id);
    return k.suit === "man" && k.rank === 3;
  });
  if (found === undefined) throw new Error(`${owner} 바닥에 3만이 없다`);
  return found;
};

const furiten = (s: GameState, p: PlayerId): boolean =>
  (s.round.byPlayer[p]?.discardedKinds ?? []).includes("man3");

section("① 누명이 실제로 그 상태를 만드는가 (사실 확인)");
{
  // p0 이 3만을 p1 바닥에 심는다
  const base = withAugments(
    craft({
      hands: { p0: "123m456m789m123p3m9p", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "1z", p1: "2z3z", p2: "5z", p3: "6z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    { p0: ["frame_up"] },
  );
  const g = start(base, [{ def: frameUp, holder: "p0" }]);
  const three = handIds(g.game.engine.state, "p0").find((id) => {
    const k = kindOf(g.game.engine.state, id);
    return k.suit === "man" && k.rank === 3;
  }) as number;
  g.flow!.submit("p0", { type: "frame_discard", payload: { tileId: three, target: "p1" } });
  const s = g.game.engine.state;
  check("심은 3만의 실물이 p1 바닥에 있다", pondIds(s, "p1").includes(three));
  check("p0 은 3만에 대해 후리텐이 아니다", !furiten(s, "p0"));
  check("p1 이 3만 후리텐이 됐다", furiten(s, "p1"));
}

section("② 정적의 손 — 대조군 4칸");
for (const mode of ["plain", "framed"] as const) {
  const st = scene(mode, ["silent_swap"]);
  const g = start(st, [{ def: silentSwap, holder: "p0" }]);
  const owner: PlayerId = mode === "plain" ? "p0" : "p1";
  const tileId = threeManIn(g.game.engine.state, owner);
  const v = validate(g.game, "silent_take", "p0", { tileId });
  console.log(`  [${mode}] 3만 주인=${owner} · silent_take validate = ${JSON.stringify(v)}`);
  if (mode === "plain") {
    check("표준 버림: 내 바닥의 내 패는 집을 수 없다", v !== null, String(v));
  } else {
    check(
      "기대: 누명으로 옮겨 놔도 '내가 버린 패'는 집을 수 없다",
      v !== null,
      `실제 validate=${JSON.stringify(v)}`,
    );
    if (v === null) {
      g.flow!.submit("p0", { type: "silent_take", payload: { tileId } });
      const after = g.game.engine.state;
      check(
        "  └ 그 패가 쯔모패가 됐다",
        after.round.lastDrawnTile === tileId,
        String(after.round.lastDrawnTile),
      );
      const wv = validate(g.game, "win", "p0", {});
      console.log(`     win validate = ${JSON.stringify(wv)}`);
      check("  └ 기대: 내가 버린 패이므로 화료 불가", wv !== null, `실제=${JSON.stringify(wv)}`);
    }
  }
}

section("③ 날치기 — 대조군");
for (const mode of ["plain", "framed"] as const) {
  const st = scene(mode, ["pond_snatch"]);
  const g = start(st, [{ def: pondSnatch, holder: "p0" }]);
  const owner: PlayerId = mode === "plain" ? "p0" : "p1";
  const snatchId = threeManIn(g.game.engine.state, owner);
  const v = validate(g.game, "pond_snatch", "p0", { snatchId, fromPlayer: owner });
  console.log(`  [${mode}] validate = ${JSON.stringify(v)}`);
  if (mode === "plain") {
    check("표준 버림: 내 바닥은 못 줍는다", v !== null, String(v));
  } else {
    check("기대: 누명으로 옮겨 놔도 못 줍는다", v !== null, `실제=${JSON.stringify(v)}`);
    if (v === null) {
      g.flow!.submit("p0", { type: "pond_snatch", payload: { snatchId, fromPlayer: owner } });
      const wv = validate(g.game, "win", "p0", {});
      check("  └ 기대: 화료 불가", wv !== null, `실제=${JSON.stringify(wv)}`);
    }
  }
}

section("④ 무덤 도굴 — 대조군");
for (const mode of ["plain", "framed"] as const) {
  const st = scene(mode, ["grave_rob"]);
  const g = start(st, [{ def: graveRob, holder: "p0" }]);
  const owner: PlayerId = mode === "plain" ? "p0" : "p1";
  const graveId = threeManIn(g.game.engine.state, owner);
  const v = validate(g.game, "grave_rob", "p0", { graveId, fromPlayer: owner });
  console.log(`  [${mode}] validate = ${JSON.stringify(v)}`);
  if (mode === "plain") {
    check("표준 버림: 내 바닥은 못 판다", v !== null, String(v));
  } else {
    check("기대: 누명으로 옮겨 놔도 못 판다", v !== null, `실제=${JSON.stringify(v)}`);
  }
}

done();
