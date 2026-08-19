/**
 * 더블리치 판정이 **바닥(버림패 존)의 물리 길이**를 본다 —
 * `flowEvents.ts:411` `discardsBefore = zones[discards:p].tileIds.length`.
 *
 * 바닥에서 패를 빼 가는 증강(날치기·무덤 도굴·정적의 손)이 지나가 내 바닥이 비면,
 * 실제로는 두 번째·세 번째 순의 리치인데 **더블리치(2판)** 로 값한다.
 * (후로는 goAroundBroken을 세우므로 막힌다 — 막히지 않는 것은 바닥만 줄이는 경로다.)
 */
import { createStandardGameFromState, discardsZone, handIdsOf, kindKey, kindOf } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";

function scene(emptyPond: boolean): GameState {
  const base = craft({
    hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
    discards: { p0: "1z2z", p1: "", p2: "", p3: "" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  if (!emptyPond) return base;
  // 날치기/도굴이 내 바닥의 패를 가져간 상태 — discardCount·후리텐 이력은 그대로다
  return {
    ...base,
    zones: {
      ...base.zones,
      [discardsZone("p0")]: { ...base.zones[discardsZone("p0")]!, tileIds: [] },
    },
  };
}

for (const emptyPond of [false, true]) {
  const st = scene(emptyPond);
  const game = createStandardGameFromState(st);
  const hand = handIdsOf(game.engine.state, "p0");
  const tileId = hand.find((id) => kindKey(kindOf(game.engine.state, id)) === "sou5") as TileId;
  const r = game.engine.submit({ player: "p0", type: "riichi", payload: { tileId } });
  const rs = game.engine.state.round.byPlayer["p0"];
  console.log(
    `바닥비움=${emptyPond} submit.ok=${r.ok} discardCount(선언전)=${st.round.byPlayer["p0"]?.discardCount} ` +
      `바닥길이(선언전)=${st.zones[discardsZone("p0")]?.tileIds.length} → riichi.double=${rs?.riichi?.double}`,
  );
}

// ── 파급: 이중 선언(riichi_upgrade)의 **트리플리치** 판정도 같은 값을 본다 ──
// riichi_upgrade.ts:97  naturalDouble = rs.riichi.discardIndex === 0 && !goAroundBroken
//   → discardIndex 역시 discardsBefore(바닥 길이)다.
{
  const { installAugment } = await import("@majak/core");
  const { riichiUpgrade } = await import(
    "../../packages/content/src/augments/riichi_upgrade.js"
  );
  for (const emptyPond of [false, true]) {
    const base = scene(emptyPond);
    const st: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["riichi_upgrade"] } : p,
      ),
    };
    const game = createStandardGameFromState(st);
    installAugment(game.engine, riichiUpgrade, "p0", { yaku: game.yaku });
    const hand = handIdsOf(game.engine.state, "p0");
    const tileId = hand.find(
      (id) => kindKey(kindOf(game.engine.state, id)) === "sou5",
    ) as TileId;
    game.engine.submit({ player: "p0", type: "riichi", payload: { tileId } });
    const after = game.engine.state;
    console.log(
      `바닥비움=${emptyPond} riichi_upgrade: triple플래그=${String(
        after.augmentData["riichi_upgrade:triple:p0"],
      )} extraHan=${game.engine.rules.resolve<number>("score.extraHan", {
        playerId: "p0",
        state: after,
      })}`,
    );
  }
}
