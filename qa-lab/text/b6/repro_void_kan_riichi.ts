/**
 * 성립하지 않는 깡(void_kan) detail:
 *   "**내가 리치를 걸고 있으면 발동하지 않는다** … 텐파이를 리치로 굳히면
 *    이 증강은 **그 국 내내 잠들어 있으니, 둘 중 하나를 골라야 한다.**"
 *   description: "(상시 · **리치 중에는 발동하지 않는다**)"
 *
 * 실제로 리치 가드가 걸려 있는 것은 KAN_DECLARED 리액션(손패 변조)뿐이다.
 * 코어 규칙 `win.closedKanRobbable`은 install에서 **무조건** 켜지고 리치를 보지 않는다
 * (void_kan.ts:117 `ctx.setHolderRule("win.closedKanRobbable", true)`).
 * → 리치 중이어도 "국사무쌍만 안깡을 창깡할 수 있다"는 표준 예외가 계속 무력화된다.
 *
 * 재현: p0가 1m/4m 량면으로 리치. p1이 1m 안깡.
 *   표준(증강 없음)     → p0의 안깡 창깡은 거부되어야 한다
 *   void_kan + 리치     → detail대로라면 "잠들어" 있어야 하는데 창깡 론이 성립한다
 */
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, TileId } from "@majak/core";
import { craft } from "../../../packages/content/test/helpers.js";
import { voidKan } from "../../../packages/content/src/augments/void_kan.js";

function scene(withVoidKan: boolean): {
  game: ReturnType<typeof createStandardGameFromState>;
} {
  const base = craft({
    // p0: 23m 456m 789m 456p 99p → 1m/4m 량면 텐파이 (13장)
    hands: { p0: "23456789m45699p", p1: "1111m2345699p78s", p2: "*", p3: "*" },
    discards: { p0: "5z", p1: "5z", p2: "5z", p3: "5z" },
    phase: "turn.act",
    turnSeat: 1,
    drawnLastFor: "p1",
  });
  const p0Discard = base.zones["discards:p0"]?.tileIds[0] as TileId;
  const s: GameState = {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" && withVoidKan ? { ...p, augments: ["void_kan"] } : p,
    ),
    round: {
      ...base.round,
      byPlayer: {
        ...base.round.byPlayer,
        // p0는 리치를 걸어 손이 잠겨 있다
        p0: {
          ...base.round.byPlayer["p0"]!,
          riichi: {
            double: false,
            ippatsu: false,
            discardIndex: 0,
            discardTileId: p0Discard,
            cost: 1000,
          },
        },
      },
    },
  };
  const game = createStandardGameFromState(s, undefined, []);
  if (withVoidKan) installAugment(game.engine, voidKan, "p0", { yaku: game.yaku });
  return { game };
}

for (const withVoidKan of [false, true]) {
  const { game } = scene(withVoidKan);
  const st = game.engine.state;
  const oneMan = (st.zones["hand:p1"]?.tileIds ?? [])
    .filter((id) => {
      const k = st.tiles[id]?.kind;
      return k?.suit === "man" && k.rank === 1;
    })
    .slice(0, 4);
  const kan = game.engine.submit({
    player: "p1",
    type: "ankan",
    payload: { tileIds: oneMan },
  });
  const s2 = game.engine.state;
  const win = game.engine.submit({ player: "p0", type: "win", payload: {} });
  console.log(
    `void_kan=${withVoidKan}  안깡:${kan.ok}  chankan=${JSON.stringify(s2.round.chankan)}`,
  );
  console.log(
    `   p0 리치 중 안깡 창깡 론:`,
    win.ok,
    win.ok ? "성립 ← 리치 중인데 능력이 살아 있다" : `거부(${(win as { reason?: string }).reason})`,
  );
  console.log(
    `   win.closedKanRobbable(p0) =`,
    game.engine.rules.resolve<boolean>("win.closedKanRobbable", {
      playerId: "p0",
      state: s2,
    }),
  );
}
