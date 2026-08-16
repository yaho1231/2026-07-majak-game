/**
 * 무형화료(yakuless_win) — 역 없이 성립한 화료의 **정산이 제대로 서는가**.
 *
 * 회귀 배경(2026-08-17 사용자 보고): 역 없이 화료했는데 결과창이 "0판 30부 500점"이었다.
 *   1) 도라·적도라·뒷도라가 통째로 증발했다. 채점기가 "실역이 1개 이상일 때만" 도라를
 *      세는데, 그 규칙의 근거는 "역이 없으면 애초에 화료가 아니다"였다. 무형화료가
 *      그 전제를 없앤 자리에서는 붉은손길로 물들인 적도라도 0판이 됐다.
 *   2) 2판 취급 보너스는 deltas에만 실리고 결과 화면에 한 줄도 안 남아, 실제로 받았는데도
 *      "적용이 안 된다"로 읽혔다 (표준 증강 3종의 addWinHanBonus가 augPoints를 안 남겼다).
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  SYSTEM_PLAYER,
  buildWinContext,
  createStandardGameFromState,
  evaluateWin,
  handZone,
  installAugment,
  kindKey,
  standardAugments,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

const yakulessWin = standardAugments.find((a) => a.id === "yakuless_win")!;

/**
 * 111m 45p 789s 234s 99p + 6p 론.
 * 멘젠이지만 111m 암각으로 핑후 불성립, 1m·9s로 탕야오 불성립 → **역이 0개**다.
 * 손의 5p 한 장을 적도라로 물들이고(붉은 손길이 만드는 것과 같은 모양) 도라 표시패는
 * 지운다 — 판이 오르는 이유가 적도라 하나뿐이라 계산이 흐려지지 않는다.
 */
function craftYakuless(withAug: boolean): { state: GameState; ronTileId: TileId } {
  let s = craft({
    hands: { p0: "111m45p789s234s99p", p1: "*", p2: "*", p3: "*" },
    phase: "reaction",
    turnSeat: 1,
    lastDiscard: { player: "p1", spec: "6p" },
  });
  const ronTileId = s.round.lastDiscard!.tileId;
  const fiveP = (s.zones[handZone("p0")]?.tileIds ?? []).find(
    (id) => kindKey(s.tiles[id]!.kind) === kindKey({ suit: "pin", rank: 5 }),
  ) as TileId;
  s = {
    ...s,
    tiles: {
      ...s.tiles,
      [fiveP]: { ...s.tiles[fiveP]!, attrs: { ...s.tiles[fiveP]!.attrs, red: true } },
    },
    round: { ...s.round, doraIndicators: [] },
    players: s.players.map((p) =>
      p.id === "p0" ? { ...p, augments: withAug ? ["yakuless_win"] : [] } : p,
    ),
  };
  return { state: s, ronTileId };
}

function makeGame(state: GameState, withAug: boolean): Game {
  const game = createStandardGameFromState(state);
  if (withAug) installAugment(game.engine, yakulessWin, "p0", { yaku: game.yaku });
  return game;
}

describe("무형화료: 역 없는 화료도 도라를 센다", () => {
  it("증강이 없으면 역 0개 = 화료 불가이고 적도라도 세지 않는다", () => {
    const { state, ronTileId } = craftYakuless(false);
    const game = makeGame(state, false);
    const ev = evaluateWin(
      buildWinContext(game.engine.state, "p0", "ron", ronTileId, {
        rules: game.engine.rules,
        from: "p1" as PlayerId,
      }),
      game.yaku,
    )!;
    expect(ev.ok).toBe(false);
    expect(ev.redHan).toBe(0);
    expect(ev.han).toBe(0);
  });

  it("보유자는 역이 없어도 적도라가 그대로 판이 된다", () => {
    const { state, ronTileId } = craftYakuless(true);
    const game = makeGame(state, true);
    const ev = evaluateWin(
      buildWinContext(game.engine.state, "p0", "ron", ronTileId, {
        rules: game.engine.rules,
        from: "p1" as PlayerId,
      }),
      game.yaku,
    )!;
    expect(ev.yaku).toEqual([]); // 역은 여전히 0개 (도라는 역이 아니다)
    expect(ev.ok).toBe(false);
    expect(ev.redHan).toBe(1);
    expect(ev.han).toBe(1);
  });

  it("정산: 적도라가 판에 실리고, 2판 취급 보너스가 결과 화면 줄로 남는다", () => {
    const { state, ronTileId } = craftYakuless(true);
    const game = makeGame(state, true);
    const r = game.engine.submit({
      player: SYSTEM_PLAYER,
      type: "sys.settleWin",
      payload: {
        wins: [{ winner: "p0", from: "p1", tileId: ronTileId, winType: "ron" }],
      },
    });
    expect(r.ok).toBe(true);

    const settled = lastSettled(game);
    const info = (settled.winInfos ?? []).find((w) => w.winner === "p0")!;
    // 실역 0개 화료 — 무형화료 보너스와 결과창 표시가 이 플래그를 본다
    expect(info.yakuless).toBe(true);
    expect(info.redHan).toBe(1);
    expect(info.han).toBe(1);

    // 2판 취급 = 뱅크가 발행하는 가산이라 deltas에 실리고, augPoints에 "+2판"으로 남는다
    const note = (settled.augPoints ?? []).find(
      (a) => a.player === "p0" && a.augId === "yakuless_win",
    );
    expect(note).toBeDefined();
    expect(note!.han).toBe(2);
    expect(note!.points).toBeGreaterThan(0);
    expect(settled.deltas["p0"]).toBe(info.points + note!.points);
    // 무페널티 — 판이 올라도 쏜 사람이 더 내지는 않는다
    expect(settled.deltas["p1"]).toBe(-info.points);
  });
});
