/**
 * **허장성세로 퐁을 쳐서 손이 완성되면 화료할 수 있어야 한다** (2026-09-08 사용자 보고).
 *
 * 이 증강은 잡패 한 장을 목표패로 바꿔 커쯔를 채운다. 그래서 남은 열한 장이 이미
 * 3멘쯔 + 머리인 자리에서는 **퐁이 그대로 손을 끝낸다.** 그런데 표준 화료 액션은
 * 자기 순에서 `lastDrawnTile`을 요구하고 그 값은 콜 직후 null이라, 완성된 손을 눈앞에
 * 두고도 화료 표시가 뜨지 않았다 — 이길 수 없는 손을 들고 타패를 강요당했다.
 *
 * 지불은 쯔모 취급이다(`bluff_pretense.ts` completedWinTile 주석). 버린 사람은
 * 펑당했을 뿐이고, 그 패 한 장으로는 이 손이 서지 않았기 때문이다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { ActionOption, GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { bluffPretense } from "../src/augments/bluff_pretense.js";

/** 中(dragon3) */
const CHUN = kindKey({ suit: "dragon", rank: 3 });

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === player ? { ...p, augments: [...ids] } : p)),
  };
}

/**
 * p0: 123m 456m 789m 99p (= 3멘쯔 + 머리, 열한 장) + 中 한 장 + 고립된 1삭.
 * p1이 中을 버린다 → 허장성세로 1삭이 中이 되어 커쯔가 서고, 그 순간 손이 끝난다.
 * 역은 역패(中)라 열린 손이어도 성립한다.
 */
function scene() {
  const base = craft({
    hands: { p0: "123m456m789m99p7z1s", p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "7z" },
  });
  const game = createStandardGameFromState(withAug(base, "p0", ["bluff_pretense"]));
  installAugment(game.engine, bluffPretense, "p0", { yaku: game.yaku });
  return game;
}

describe("허장성세 — 퐁이 손을 끝냈을 때", () => {
  it("퐁 직후 화료 옵션이 뜨고, 쯔모로 정산된다", () => {
    const game = scene();
    const flow = new FlowController(game.engine);
    const bluff = { type: "bluff_pon", payload: { tileId: handIdsOf(game.engine.state, "p0").find((id) => kindKey(kindOf(game.engine.state, id)) === CHUN)! } };

    let status = flow.begin();
    expect(status.kind).toBe("awaiting");
    status = flow.submit("p0", bluff as ActionOption);

    // 퐁이 서고 손이 완성됐다 — 이제 «방금 뽑은 패» 자리가 채워져 화료 버튼이 뜬다
    expect(status.kind).toBe("awaiting");
    const prompt = status.kind === "awaiting" ? status.prompts[0] : undefined;
    expect(prompt?.player).toBe("p0");
    const win = (prompt?.options as ActionOption[]).find((o) => o.type === "win");
    expect(win, "퐁으로 손이 완성됐는데 화료 옵션이 없다").toBeDefined();

    const done = flow.submit("p0", win!);
    expect(done.kind).toBe("roundOver");
    expect(done.kind === "roundOver" ? done.outcome : null).toBe("win");
  });

  it("손이 안 끝났으면 화료 옵션은 뜨지 않는다 — 문은 완성된 손에만 열린다", () => {
    const base = craft({
      hands: { p0: "123m456m78m99p22s7z1s", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "7z" },
    });
    const game = createStandardGameFromState(withAug(base, "p0", ["bluff_pretense"]));
    installAugment(game.engine, bluffPretense, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const chun = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(kindOf(game.engine.state, id)) === CHUN,
    )!;
    let status = flow.begin();
    status = flow.submit("p0", { type: "bluff_pon", payload: { tileId: chun } } as ActionOption);
    const prompt = status.kind === "awaiting" ? status.prompts[0] : undefined;
    expect((prompt?.options as ActionOption[]).some((o) => o.type === "win")).toBe(false);
    expect(game.engine.state.round.lastDrawnTile).toBeNull();
  });

  /*
   * **완성된 몸통은 재료가 되지 않는다** (2026-09-04 사용자 보고, #467 재적용 2026-09-16).
   *
   * 예전 재료 선정은 «이웃이 가장 적은 패»를 골랐다 — 손패 123m 456m 99p 88s 55s + 中 에서
   * 몸통 끝의 1만과 각 또이쯔는 이어짐 점수가 같고(2), 동점이면 손패 앞쪽이 그냥 뽑혀
   * **완성 몸통 123m의 1만이** 재료로 타 버렸다. 이제는 후보마다 "펑을 한 뒤의 손"을
   * 그대로 만들어 샹텐을 재므로(`spareTile.pickSpareTiles`), 몸통을 깨는 1만(1샹텐)이
   * 아니라 또이쯔 하나(텐파이)가 재료가 된다.
   */
  it("완성된 몸통(123m)은 재료가 되지 않는다 — 펑 뒤의 손이 좋아지는 잡패가 탄다", () => {
    const base = craft({
      hands: { p0: "123m456m99p88s55s7z", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "7z" },
    });
    const game = createStandardGameFromState(withAug(base, "p0", ["bluff_pretense"]));
    installAugment(game.engine, bluffPretense, "p0", { yaku: game.yaku });
    const chun = handIdsOf(game.engine.state, "p0").find(
      (id) => kindKey(kindOf(game.engine.state, id)) === CHUN,
    )!;
    const r = game.engine.submit({ player: "p0", type: "bluff_pon", payload: { tileId: chun } });
    expect(r.ok).toBe(true);

    const st = game.engine.state;
    const keys = handIdsOf(st, "p0").map((id) => kindKey(kindOf(st, id)));
    // 두 완성 몸통은 한 장도 빠지지 않았다
    for (const rank of [1, 2, 3, 4, 5, 6]) {
      expect(keys.filter((k) => k === kindKey({ suit: "man", rank })).length).toBe(1);
    }
    // 재료는 또이쯔 하나(9p·8s·5s 중 하나)에서 나왔다 — 中 커쯔가 섰다
    const melds = st.round.byPlayer["p0"]?.melds ?? [];
    expect(melds.length).toBe(1);
    expect(melds[0]?.tileIds.every((id) => kindKey(kindOf(st, id)) === CHUN)).toBe(true);
  });
});
