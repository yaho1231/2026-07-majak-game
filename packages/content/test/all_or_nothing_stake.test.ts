/**
 * 모 아니면 도 (all_or_nothing) — **국당 1회 · 타가 화료 시 판돈 절반 소실**
 * (2026-08-15 사용자 지시).
 *
 * 바뀐 것 둘.
 * ① 횟수가 게임당(동풍전1·반장전2)에서 **국당 1회**로 — 카운터 키에 roundKey가 섞인다.
 * ② "빗나가도 잃는 것이 없다"가 사라졌다 — **타가가 론·쯔모로 화료하면** 판돈의 절반이
 *    뱅크로 넘어간다. 유국은 아무도 이기지 않은 국이라 그대로다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload } from "@majak/core";
import { craft } from "./helpers.js";
import { allOrNothing } from "../src/augments/all_or_nothing.js";

const RIICHI = { double: false, ippatsu: false, discardIndex: 0 };
const ALL_IN = 12000;

const roundKeyOf = (s: GameState): string =>
  `${s.round.prevalentWind}-${s.round.roundNumber}-${s.round.honba}`;
const activeKeyOf = (s: GameState, h: PlayerId): string =>
  `all_or_nothing:active:${roundKeyOf(s)}:${h}`;
const usesKeyOf = (s: GameState, h: PlayerId): string =>
  `all_or_nothing:uses:${roundKeyOf(s)}:${h}`;

/** p0가 판돈을 걸고 리치 중인 상태 */
function scene(): GameState {
  const base = craft({
    hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
  });
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["all_or_nothing"] } : p,
    ),
    augmentData: { ...base.augmentData, [activeKeyOf(base, "p0")]: ALL_IN },
    round: {
      ...base.round,
      byPlayer: {
        ...base.round.byPlayer,
        p0: { ...base.round.byPlayer["p0"]!, riichi: RIICHI },
      },
    },
  };
}

/** 정산 payload를 인터셉터에 통과시킨 결과 */
function settle(
  state: GameState,
  payload: RoundSettledPayload,
): RoundSettledPayload {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, allOrNothing, "p0", { yaku: game.yaku });
  const out = game.engine.effects
    .interceptorsFor(ROUND_SETTLED)
    .reduce<{ type: string; payload: unknown }>(
      (ev, i) =>
        i.intercept(ev, { state: game.engine.state, rules: game.engine.rules } as never) ??
        ev,
      { type: ROUND_SETTLED, payload },
    );
  return out.payload as RoundSettledPayload;
}

/** p1이 p2에게서 론으로 화료한 정산 */
const otherWin = (state: GameState): RoundSettledPayload => ({
  outcome: "win",
  deltas: { p0: 0, p1: 8000, p2: -8000, p3: 0 },
  dealerSeat: state.round.dealerSeat,
  honba: 0,
  riichiPot: 0,
  roundNumber: state.round.roundNumber,
  prevalentWind: state.round.prevalentWind,
  winInfos: [
    {
      winner: "p1",
      from: "p2",
      winType: "ron",
      winningTileId: 0,
      han: 3,
      fu: 30,
      yakumanCount: 0,
      extraHan: 0,
      yaku: [],
      doraHan: 0,
      uraHan: 0,
      redHan: 0,
      points: 8000,
      limit: null,
    },
  ],
});

/** 유국 정산 */
const draw = (state: GameState): RoundSettledPayload => ({
  outcome: "draw",
  deltas: { p0: 0, p1: 0, p2: 0, p3: 0 },
  dealerSeat: state.round.dealerSeat,
  honba: 0,
  riichiPot: 0,
  roundNumber: state.round.roundNumber,
  prevalentWind: state.round.prevalentWind,
  winInfos: [],
});

describe("모 아니면 도 — 타가 화료면 판돈 절반이 뱅크로", () => {
  it("타가가 화료하면 판돈의 절반을 잃는다", () => {
    const s = scene();
    const out = settle(s, otherWin(s));
    expect(out.deltas["p0"]).toBe(-ALL_IN / 2);
    // 결과창 합계와 어긋나지 않도록 정산 기여도 남긴다
    const note = (out.augPoints ?? []).find(
      (n) => n.player === "p0" && n.augId === "all_or_nothing",
    );
    expect(note?.points).toBe(-ALL_IN / 2);
  });

  it("유국이면 잃지 않는다 — 아무도 이기지 않은 국이다", () => {
    const s = scene();
    expect(settle(s, draw(s)).deltas["p0"]).toBe(0);
  });

  it("리치가 풀렸으면 판돈도 사라져 벌금도 없다", () => {
    const s = scene();
    const noRiichi: GameState = {
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          p0: { ...s.round.byPlayer["p0"]!, riichi: null },
        },
      },
    };
    expect(settle(noRiichi, otherWin(noRiichi)).deltas["p0"]).toBe(0);
  });
});

/** 이 상태에서 p0에게 '올인 리치' 버튼이 뜨는가 */
function hasAllIn(state: GameState): boolean {
  const game = createStandardGameFromState(structuredClone(state));
  installAugment(game.engine, allOrNothing, "p0", { yaku: game.yaku });
  const status = new FlowController(game.engine).begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const prompt = status.prompts.find((p) => p.player === "p0");
  return (prompt?.options ?? []).some((o) => o.type === "all_in_riichi");
}

describe("모 아니면 도 — 국당 1회", () => {
  it("이번 국에 이미 걸었으면 옵션이 사라지고, 국이 바뀌면 되살아난다", () => {
    const base = craft({
      hands: { p0: "123m456m789m123p11s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const withAug: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["all_or_nothing"] } : p,
      ),
      // 이번 국 사용 기록
      augmentData: { ...base.augmentData, [usesKeyOf(base, "p0")]: 1 },
    };
    expect(hasAllIn(withAug)).toBe(false);

    // 본장이 오른 다음 국 — 같은 기록이 남아 있어도 키가 달라 다시 쓸 수 있다
    const nextRound: GameState = {
      ...withAug,
      round: { ...withAug.round, honba: withAug.round.honba + 1 },
    };
    expect(hasAllIn(nextRound)).toBe(true);
  });
});
