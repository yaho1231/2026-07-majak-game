/**
 * shape 의심 2 재검증 — bottom_yaku: 남이 울어 간 버림패는 '바닥'에서 사라진다.
 *
 *   npx tsx qa-lab/verify-shape/repro_bottom_yaku_call.ts
 *
 * `hasFullSuitRun`/`hasTripleDiscard`(bottom_yaku.ts:69·92)는 채점 시점의
 * `state.zones[discardsZone(winner)]`를 읽는다. 코어는 치·펑·깡이 성립하면 그 패를
 * 버린 사람의 discards zone에서 **빼서** 운 사람의 melds zone으로 옮긴다
 * (core/mahjong/flow/flowEvents.ts:519·574 `discardZoneHolding` → moveTiles).
 * 반면 `round.byPlayer[p].discardedKinds`는 append-only라 그대로 남는다(:467).
 *
 * 아래는 같은 "1~9만 버림" 바닥을, 5만을 남이 퐁해 간 경우와 아닌 경우로 나눠 채점한다.
 */
import {
  buildWinContext,
  createStandardGameFromState,
  discardsZone,
  meldsZone,
  evaluateWin,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId, WinEvaluation } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { bottomYaku } from "../../packages/content/src/augments/bottom_yaku.js";

const FLOW = "bottom_flow";
const LETGO = "bottom_letgo";

function base(bottom: string): GameState {
  return craft({
    hands: { p0: "123p456p789p23s55s", p1: "*", p2: "*", p3: "*" },
    discards: { p0: bottom },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "4s" },
  });
}

/** 코어가 퐁 성립 때 하는 일과 같은 이동: p0의 바닥 → p1의 후로 zone */
function callAway(state: GameState, victim: PlayerId, caller: PlayerId, kindStr: string): GameState {
  const dz = discardsZone(victim);
  const ids = state.zones[dz]?.tileIds ?? [];
  const target = ids.find((id) => kindKey(kindOf(state, id)) === kindStr);
  if (target === undefined) throw new Error(`바닥에 ${kindStr}가 없다`);
  const mz = meldsZone(caller);
  return {
    ...state,
    zones: {
      ...state.zones,
      [dz]: { ...state.zones[dz]!, tileIds: ids.filter((id) => id !== target) },
      [mz]: { ...state.zones[mz]!, tileIds: [...(state.zones[mz]?.tileIds ?? []), target as TileId] },
    },
  };
}

function score(state: GameState): WinEvaluation | null {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, bottomYaku, "p0", { yaku: game.yaku });
  const ron = game.engine.state.zones[discardsZone("p1")]?.tileIds[0] as TileId;
  return buildWinContext(game.engine.state, "p0", "ron", ron, {
    rules: game.engine.rules,
    from: "p1",
  }) && evaluateWin(
    buildWinContext(game.engine.state, "p0", "ron", ron, { rules: game.engine.rules, from: "p1" }),
    game.yaku,
  );
}

const han = (ev: WinEvaluation | null, id: string): number => ev?.yaku.find((y) => y.id === id)?.han ?? 0;

function show(label: string, st: GameState): void {
  const ev = score(st);
  const zoneKinds = (st.zones[discardsZone("p0")]?.tileIds ?? []).map((id) => kindKey(kindOf(st, id)));
  const hist = st.round.byPlayer["p0"]?.discardedKinds ?? [];
  console.log(
    `${label.padEnd(42)} 바닥zone=${zoneKinds.length}장 [${zoneKinds.join(" ")}]\n` +
    `${" ".repeat(42)} 버림이력(discardedKinds)=${hist.length}장 [${hist.join(" ")}]\n` +
    `${" ".repeat(42)} → 역류통관 ${han(ev, FLOW)}판 · 미련없음 ${han(ev, LETGO)}판  (합 ${han(ev, FLOW) + han(ev, LETGO)})`,
  );
}

console.log("=== ① 역류 통관 (한 무늬 1~9) ===");
const a = base("123456789m");
show("아무도 울지 않았다", a);
show("5만을 p1이 퐁해 갔다", callAway(a, "p0", "p1", "man5"));

console.log("\n=== ② 미련 없음 (같은 패 3장) ===");
const b = base("111z");
show("아무도 울지 않았다", b);
show("동 1장을 p1이 퐁해 갔다", callAway(b, "p0", "p1", "wind1"));

console.log("\n=== ③ 둘 다 (1~9 + 같은 패 3장) ===");
const c = base("123456789m111z");
show("아무도 울지 않았다", c);
show("5만 + 동 하나를 울려 갔다", callAway(callAway(c, "p0", "p1", "man5"), "p0", "p2", "wind1"));
