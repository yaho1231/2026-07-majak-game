/**
 * 반전 — **액티브 · 자기 첫 순 · 3국에 1회** (2026-09-01 사용자 지시).
 *
 * 예전에는 뽑는 순간 자동으로 켜지는 선발동형(게임 내 1회, 반장전만 1회 재장전)이었다.
 * 이제는 플레이어가 직접 켜고, 동풍전·반장전 구분 없이 3국마다 다시 쓸 수 있다.
 * 발동 창은 **자기 첫 순**뿐이다 — 판이 굳은 뒤에 켜면 «이번 국을 통째로 건다»가 아니라
 * 방총 보험이 되고, 전원 공개가 대응할 시간을 주지 못한다.
 */

import { describe, expect, it } from "vitest";
import { createStandardGameFromState, installAugment } from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { signFlip } from "../src/augments/sign_flip.js";
import { craft } from "./helpers.js";

const ID = "sign_flip";
const ACTION = "sign_flip_use";

/**
 * @param mode      판 길이 (주기는 두 모드가 같다)
 * @param discards  이 국에 보유자가 이미 버린 장수 (0이면 «첫 순»)
 * @param seq/used  국 카운터와 마지막으로 켠 국의 번호 (쿨다운 판정용)
 */
function scene(opts: {
  mode?: "tonpuu" | "hanchan";
  discards?: string;
  seq?: number;
  used?: number;
} = {}): GameState {
  const s = craft({
    hands: { p0: "123m456p789s11z2z", p1: "*", p2: "*", p3: "*" },
    ...(opts.discards === undefined ? {} : { discards: { p0: opts.discards } }),
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const data: Record<string, unknown> = { ...s.augmentData };
  if (opts.seq !== undefined) data[`${ID}:seq:p0`] = opts.seq;
  if (opts.used !== undefined) data[`${ID}:usedSeq:p0`] = opts.used;
  return {
    ...s,
    config: { ...s.config, mode: opts.mode ?? "hanchan" },
    players: s.players.map((p) => (p.id === "p0" ? { ...p, augments: [ID] } : p)),
    augmentData: data,
  };
}

function setup(state: GameState): ReturnType<typeof createStandardGameFromState> {
  const game = createStandardGameFromState(state, undefined, [signFlip]);
  installAugment(game.engine, signFlip, "p0", { yaku: game.yaku });
  return game;
}

const use = (game: ReturnType<typeof createStandardGameFromState>, p: PlayerId = "p0"): boolean =>
  game.engine.submit({ player: p, type: ACTION, payload: {} }).ok;

const offered = (game: ReturnType<typeof createStandardGameFromState>): boolean =>
  game.engine.turnOptionProviders
    .flatMap((prov) => prov(game.engine.state, "p0"))
    .some((o) => o.type === ACTION);

describe("반전 — 액티브 발동", () => {
  it("자동으로 켜지지 않는다 — 누르기 전에는 꺼져 있다", () => {
    const game = setup(scene());
    expect(game.engine.state.augmentData[`${ID}:onRound:p0`]).toBeUndefined();
    expect(offered(game)).toBe(true);
  });

  it("자기 첫 순에 누르면 그 국에 켜지고 전원에게 공개된다", () => {
    const game = setup(scene());
    expect(use(game)).toBe(true);
    const round = game.engine.state.round;
    expect(game.engine.state.augmentData[`${ID}:onRound:p0`]).toBe(
      `${round.prevalentWind}-${round.roundNumber}-${round.honba}`,
    );
    expect(game.engine.state.augmentData[`view:*:${ID}:p0#round`]).toBe(true);
  });

  it("이미 버린 뒤(첫 순이 지난 뒤)에는 쓸 수 없다", () => {
    const game = setup(scene({ discards: "1s" }));
    expect(offered(game)).toBe(false);
    expect(use(game)).toBe(false);
  });

  it("같은 국에 두 번은 못 쓴다", () => {
    const game = setup(scene());
    expect(use(game)).toBe(true);
    expect(use(game)).toBe(false);
  });

  it("동풍전에서도 쓸 수 있다 — 주기형은 모드를 가리지 않는다", () => {
    const game = setup(scene({ mode: "tonpuu" }));
    expect(use(game)).toBe(true);
  });
});

describe("반전 — 3국에 1회", () => {
  it("누르면 쿨다운 3국이 그 자리에서 선다 (이름표의 🕐N국 칩)", () => {
    const game = setup(scene({ seq: 1 }));
    expect(use(game)).toBe(true);
    expect(game.engine.state.augmentData[`${ID}:usedSeq:p0`]).toBe(1);
    expect(game.engine.state.augmentData[`view:p0:cooldown:${ID}`]).toBe(3);
  });

  it("켠 국으로부터 2국까지는 잠겨 있다", () => {
    const game = setup(scene({ seq: 3, used: 1 }));
    expect(offered(game)).toBe(false);
    expect(use(game)).toBe(false);
  });

  it("3국이 지나면 다시 열린다 — 횟수 제한은 없다", () => {
    const game = setup(scene({ seq: 4, used: 1 }));
    expect(offered(game)).toBe(true);
    expect(use(game)).toBe(true);
  });
});
