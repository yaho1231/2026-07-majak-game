/**
 * 사가리치(4명 리치) 유국이 **스텔스 리치까지 세는가**.
 *
 * 스텔스 리치의 계약은 "타가에게는 리치가 아닌 사람으로 보인다"인데,
 * 코어의 4리치 유국 판정(FlowController:226-230)은 `byPlayer[p].riichi != null`을 그대로 센다.
 * 셋만 공개 리치를 걸고 넷째가 스텔스면, 아무도 4번째 리치를 못 봤는데 국이 유국으로 끝난다.
 */
import { FlowController, createStandardGameFromState, installAugment, buildPlayerView } from "@majak/core";
import type { GameState } from "@majak/core";
import { craft } from "../../packages/content/test/helpers.js";
import { stealthRiichi } from "../../packages/content/src/augments/stealth_riichi.js";

const rk = (s: GameState): string =>
  `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;

const R = { double: false, ippatsu: false, discardIndex: 0, cost: 1000 };

const base = craft({
  hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
  phase: "turn.draw",
  turnSeat: 0,
});

for (const mode of ["three", "three+stealth"] as const) {
  const stealth = mode === "three+stealth";
  const st: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p3" && stealth ? { ...p, augments: ["stealth_riichi"] } : p,
    ),
    augmentData: stealth
      ? { ...base.augmentData, [`stealth_riichi:active:${rk(base)}:p3`]: true }
      : base.augmentData,
    round: {
      ...base.round,
      riichiPot: stealth ? 3000 : 4000,
      byPlayer: Object.fromEntries(
        Object.entries(base.round.byPlayer).map(([id, rs]) => [
          id,
          id === "p3"
            ? stealth
              ? { ...rs, riichi: { ...R, cost: 0 } }
              : { ...rs, riichi: null }
            : { ...rs, riichi: { ...R, cost: 1000 } },
        ]),
      ) as typeof base.round.byPlayer,
    },
  };
  const game = createStandardGameFromState(st);
  if (stealth) installAugment(game.engine, stealthRiichi, "p3", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  const after = game.engine.state;
  const view = buildPlayerView(after, "p0", game.engine.rules);
  console.log(
    `${mode} status=${status.kind} phase=${after.round.phase} ` +
      `p0가 보는 p3리치=${String(view.round.byPlayer["p3"]?.riichiDeclared)}`,
  );
}
