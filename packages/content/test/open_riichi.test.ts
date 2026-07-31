/**
 * open_riichi_reveal (오픈 리치) — 선언 시 공탁·리치 상태·오름패 전원 공개를 검증한다.
 * 화료 보너스(+2판, 비리치 상대 론 +2판)는 addWinPointBonus 경로라 실게임 스위프가
 * 무크래시로 보증하고, 여기서는 선언의 관측 가능한 결과값을 확인한다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  SYSTEM_PLAYER,
  buildPlayerView,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { roundKey } from "../src/util.js";
import { openRiichiReveal } from "../src/augments/open_riichi_reveal.js";

type Game = ReturnType<typeof createStandardGameFromState>;

const SYS = SYSTEM_PLAYER;

function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled");
}

const RIICHI = { double: false, ippatsu: false, discardIndex: 0 };

/** 손패에서 특정 kindKey의 패 id들을 찾는다 */
function handTilesOfKind(game: Game, player: PlayerId, key: string): TileId[] {
  const state = game.engine.state;
  return (state.zones[handZone(player)]?.tileIds ?? []).filter(
    (id) => kindKey(kindOf(state, id)) === key,
  );
}

/** p0 멘젠 텐파이 (5s 하나 버리면 2s/5s/8s 대기) — 14장 turn.act, 증강 보유 표시 */
function craftTenpai(): GameState {
  const s = craft({
    hands: { p0: "234m345p345s678s55s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...s,
    players: s.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["open_riichi_reveal"] } : p,
    ),
  };
}

describe("open_riichi_reveal (오픈 리치)", () => {
  it("자기 턴 프롬프트에 오픈 리치 후보가 노출된다", () => {
    const game = createStandardGameFromState(craftTenpai());
    installAugment(game.engine, openRiichiReveal, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0")!;
    expect(prompt.options.some((o) => o.type === "open_riichi")).toBe(true);
  });

  it("선언하면 공탁 1000점·리치 상태·오름패 전원 공개가 기록된다", () => {
    const game = createStandardGameFromState(craftTenpai());
    installAugment(game.engine, openRiichiReveal, "p0", { yaku: game.yaku });

    const tileId = handTilesOfKind(game, "p0", "sou5")[0];
    expect(tileId).toBeDefined();
    const before = game.engine.state.players.find((p) => p.id === "p0")!.score;

    const result = game.engine.submit({
      player: "p0",
      type: "open_riichi",
      payload: { tileId: tileId as TileId },
    });
    expect(result.ok).toBe(true);

    const st = game.engine.state;
    // 표준 리치와 동일: 리치 상태 + 공탁 1000점 + 점수 차감
    expect(st.round.byPlayer["p0"]?.riichi).not.toBeNull();
    expect(st.round.riichiPot).toBe(1000);
    expect(st.players.find((p) => p.id === "p0")!.score).toBe(before - 1000);
    // 이번 국 선언 플래그
    expect(
      st.augmentData[`open_riichi_reveal:declared:${roundKey(st)}:p0`],
    ).toBe(true);
    // 오름패(2s·5s·8s)가 view:*: 채널로 전원 공개된다
    const revealed = st.augmentData["view:*:open_riichi_reveal:p0#round"];
    expect(Array.isArray(revealed)).toBe(true);
    expect(new Set(revealed as string[])).toEqual(
      new Set(["sou2", "sou5", "sou8"]),
    );
  });

  it("선언해도 손패는 공개되지 않는다 — 오름패만 공개 (48차 무페널티)", () => {
    const game = createStandardGameFromState(craftTenpai());
    installAugment(game.engine, openRiichiReveal, "p0", { yaku: game.yaku });

    // 선언 전: p1 시점에서 p0 손패는 owner 가시성 → 장수만(hiddenCount>0, tileIds 없음)
    const before = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    const handBefore = before.zones[handZone("p0")]!;
    expect(handBefore.tileIds.length).toBe(0);
    expect(handBefore.hiddenCount).toBeGreaterThan(0);

    const tileId = handTilesOfKind(game, "p0", "sou5")[0] as TileId;
    expect(game.engine.submit({ player: "p0", type: "open_riichi", payload: { tileId } }).ok).toBe(true);

    // 선언 후에도 손패 Zone은 owner 가시성 그대로 — 상대가 대기를 완벽히 회피할 수
    // 있는 구조는 페널티라 삭제했다. 대신 오름패(대기)는 view:* 채널로 공개된다.
    const after = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    const handAfter = after.zones[handZone("p0")]!;
    expect(handAfter.tileIds.length).toBe(0);
    expect(handAfter.hiddenCount).toBeGreaterThan(0);
    expect(after.augmentView["open_riichi_reveal:p0"]).toBeDefined();
  });

  it("이미 선언했으면 다시 선언할 수 없다", () => {
    const game = createStandardGameFromState(craftTenpai());
    installAugment(game.engine, openRiichiReveal, "p0", { yaku: game.yaku });
    const tileId = handTilesOfKind(game, "p0", "sou5")[0] as TileId;
    expect(game.engine.submit({ player: "p0", type: "open_riichi", payload: { tileId } }).ok).toBe(true);
    // 리치 중이므로 재선언은 거부된다
    const again = game.engine.submit({
      player: "p0",
      type: "open_riichi",
      payload: { tileId },
    });
    expect(again.ok).toBe(false);
  });

  /**
   * p0가 오픈 리치를 선언한 상태(플래그 주입)로 p1의 5s에 론 화료시킨다.
   * 공탁(riichiPot)은 건드리지 않아 상대 리치 유무로 회수액이 달라지지 않으므로,
   * delta 차이는 오롯이 오픈 리치 보너스(비리치 상대 +2판 더)만 반영한다.
   */
  function ronDeltaP0(
    withAug: boolean,
    discarderRiichi: boolean,
    declared = withAug,
  ): number {
    // 종패(1m·9p·9s)로 탕야오를 없애고 5(적도라)를 손에서 배제 + 도라 표시패 제거 →
    // 리치 1판만 남아 +2판/+4판 차이가 상한(만관·하네만)에 묻히지 않는다.
    let s = craft({
      hands: { p0: "123m789p234s678s9s", p1: "*", p2: "*", p3: "*" },
      discards: { p1: "9s" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const ronTileId = s.zones[discardsZone("p1")]!.tileIds[0] as TileId;
    const rk = roundKey(s);
    s = {
      ...s,
      players: s.players.map((p) =>
        p.id === "p0" && withAug ? { ...p, augments: ["open_riichi_reveal"] } : p,
      ),
      round: {
        ...s.round,
        doraIndicators: [], // 도라 제거 → 저판 유지
        byPlayer: {
          ...s.round.byPlayer,
          // p0는 (오픈)리치 상태 → 역 성립
          p0: { ...s.round.byPlayer["p0"]!, riichi: RIICHI },
          p1: discarderRiichi
            ? { ...s.round.byPlayer["p1"]!, riichi: RIICHI }
            : s.round.byPlayer["p1"]!,
        },
      },
      augmentData: {
        ...s.augmentData,
        [`open_riichi_reveal:declared:${rk}:p0`]: declared,
      },
    };
    const game = createStandardGameFromState(s);
    if (withAug) installAugment(game.engine, openRiichiReveal, "p0", { yaku: game.yaku });
    const r = game.engine.submit({
      player: SYS,
      type: "sys.settleWin",
      payload: { wins: [{ winner: "p0", from: "p1", tileId: ronTileId, winType: "ron" }] },
    });
    expect(r.ok).toBe(true);
    return lastSettled(game).deltas["p0"] ?? 0;
  }

  it("리치 상대에게 론하면 +2판, 비리치 상대에게 론하면 역만(직격)", () => {
    const base = ronDeltaP0(false, false); // 증강 없음
    const vsRiichi = ronDeltaP0(true, true); // 오픈 리치, 리치 상대 론 → +2판
    const vsOpen = ronDeltaP0(true, false); // 오픈 리치, 비리치 상대 론 → 역만
    // 증강이 보너스를 얹는다
    expect(vsRiichi).toBeGreaterThan(base);
    // 리치를 안 건 사람이 공개된 오름패를 버리면 역만 직격 (오야 역만 론 = 48000)
    expect(vsOpen).toBe(48000);
    expect(vsOpen).toBeGreaterThan(vsRiichi);
  });

  it("선언하지 않은 국에는 직격 역만이 성립하지 않는다", () => {
    // withAug=true지만 declared 플래그가 없으면 win.blockedYaku가 역을 막는다
    const declared = ronDeltaP0(true, false);
    const notDeclared = ronDeltaP0(true, false, false);
    expect(declared).toBe(48000);
    expect(notDeclared).toBeLessThan(declared);
  });
});
