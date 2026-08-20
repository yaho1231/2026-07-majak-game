/**
 * 천화(天和)·지화(地和) 게이트 회귀 — **증강이 고친 손에는 붙지 않는다**.
 *
 * 배경 (2026-08-20 QA hand 확정 4): 게이트가 `firstTurn` · `goAroundBroken` ·
 * "내 버림 0장" 셋만 봐서, 손패 변형 액티브 증강(왕패의 지배자 등)이 오야의 첫 순에
 * 손을 **고쳐서** 완성시켜도 천화 역만이 그대로 붙었다 — 오야 48,000점이
 * "배패가 이미 완성돼 있었다"는 거짓 근거로 지급됐다.
 *
 * 여기서 지키는 두 가지:
 *  1. **표준 마작의 천화·지화는 그대로 선다** (증강이 없으면 아무것도 달라지지 않는다).
 *  2. 국 스코프 표식(`handAltered:byAugment:…:<player>#round`)이 찍힌 사람에게만
 *     천화·지화가 막히고, **같은 국의 다른 사람에게는 번지지 않는다**.
 */

import { describe, expect, it } from "vitest";
import { createInitialGameState } from "../src/engine/state/GameState.js";
import { ROUND_SCOPED_MARK } from "../src/engine/state/GameState.js";
import type { GameState } from "../src/engine/state/GameState.js";
import { createZone, handZone } from "../src/engine/zones/Zone.js";
import type { PlayerId } from "../src/engine/zones/Zone.js";
import { kindKey } from "../src/mahjong/tiles/Tile.js";
import type { TileId, TileKind } from "../src/mahjong/tiles/Tile.js";
import {
  HAND_ALTERED_AUGMENT_ID,
  HAND_ALTERED_NAME,
  buildWinContext,
  handAlteredByAugment,
} from "../src/mahjong/flow/helpers.js";

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

/** "123m" 표기 → TileKind[] */
function h(spec: string): TileKind[] {
  const out: TileKind[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
      continue;
    }
    for (const d of digits) {
      const r = Number(d);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else if (ch === "z")
        out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
      else throw new Error(`bad suit: ${ch}`);
    }
    digits = "";
  }
  return out;
}

/** 국의 **첫 순**: 아무도 버리지 않았고 후로도 없다. `winner`가 완성형 14장을 들고 있다. */
function firstTurnScene(winner: PlayerId, spec: string): GameState {
  const base = createInitialGameState(
    { seed: 1, playerIds: [...PLAYERS] },
    { startScore: 25000, redFivesPerSuit: 0 },
  );
  const pool = new Map<string, TileId[]>();
  for (const tile of Object.values(base.tiles)) {
    const key = kindKey(tile.kind);
    pool.set(key, [...(pool.get(key) ?? []), tile.id]);
  }
  const ids = h(spec).map((kind) => {
    const id = pool.get(kindKey(kind))?.shift();
    if (id === undefined) throw new Error(`No tiles left of ${kindKey(kind)}`);
    return id;
  });
  const zones = {
    ...base.zones,
    [handZone(winner)]: { ...createZone(handZone(winner), "hand", winner), tileIds: ids },
  };
  return {
    ...base,
    zones,
    round: {
      ...base.round,
      phase: "turn.act",
      dealerSeat: 0,
      turnSeat: PLAYERS.indexOf(winner),
      firstTurn: true,
      goAroundBroken: false,
      lastDrawnTile: ids[ids.length - 1] as TileId,
    },
  };
}

/** 증강이 이 사람의 손을 고쳤다는 국 스코프 표식 (content의 `handAlteredKey`와 같은 모양) */
function markHandAltered(state: GameState, player: PlayerId): GameState {
  const { prevalentWind, roundNumber, honba } = state.round;
  const roundKey = `${prevalentWind}-${roundNumber}-${honba}`;
  const key = `${HAND_ALTERED_AUGMENT_ID}:${HAND_ALTERED_NAME}:${roundKey}:${player}${ROUND_SCOPED_MARK}`;
  return { ...state, augmentData: { ...state.augmentData, [key]: true } };
}

function flagsOf(state: GameState, winner: PlayerId) {
  const ctx = buildWinContext(state, winner, "tsumo", state.round.lastDrawnTile as TileId, {});
  if (ctx.flags === undefined) throw new Error("no win flags");
  return ctx.flags;
}

// 순수 완성형 14장 (역만 판정에 다른 조건이 끼지 않는 평범한 모양)
const WIN14 = "123m456m789m123p11p";

describe("천화·지화 — 표준 마작 판정은 그대로다", () => {
  it("오야가 첫 순에 쯔모 화료하면 천화가 선다", () => {
    const state = firstTurnScene("p0", WIN14);
    expect(flagsOf(state, "p0").tenhou).toBe(true);
    expect(flagsOf(state, "p0").chihou).toBe(false);
  });

  it("자가 첫 순에 쯔모 화료하면 지화가 선다", () => {
    const state = firstTurnScene("p1", WIN14);
    expect(flagsOf(state, "p1").chihou).toBe(true);
    expect(flagsOf(state, "p1").tenhou).toBe(false);
  });

  it("첫 바퀴가 후로로 깨졌으면 둘 다 서지 않는다", () => {
    const base = firstTurnScene("p0", WIN14);
    const broken: GameState = {
      ...base,
      round: { ...base.round, goAroundBroken: true },
    };
    expect(flagsOf(broken, "p0").tenhou).toBe(false);
    expect(flagsOf(broken, "p0").chihou).toBe(false);
  });
});

describe("천화·지화 — 증강이 고친 손에는 붙지 않는다 (QA hand 확정 4)", () => {
  it("표식이 없으면 handAlteredByAugment는 false다", () => {
    const state = firstTurnScene("p0", WIN14);
    expect(handAlteredByAugment(state, "p0")).toBe(false);
  });

  it("오야의 손을 증강이 고쳤으면 천화가 막힌다", () => {
    const state = markHandAltered(firstTurnScene("p0", WIN14), "p0");
    expect(handAlteredByAugment(state, "p0")).toBe(true);
    expect(flagsOf(state, "p0").tenhou).toBe(false);
  });

  it("자의 손을 증강이 고쳤으면 지화가 막힌다", () => {
    const state = markHandAltered(firstTurnScene("p1", WIN14), "p1");
    expect(flagsOf(state, "p1").chihou).toBe(false);
  });

  it("표식은 그 사람에게만 붙는다 — 남의 천화는 그대로 선다", () => {
    // 같은 국에 p1이 손을 고쳤다고 해서 오야 p0의 진짜 천화까지 막히면 안 된다
    const state = markHandAltered(firstTurnScene("p0", WIN14), "p1");
    expect(handAlteredByAugment(state, "p0")).toBe(false);
    expect(flagsOf(state, "p0").tenhou).toBe(true);
  });

  it("다른 국의 낡은 표식은 이번 국 판정을 건드리지 않는다", () => {
    const state = firstTurnScene("p0", WIN14);
    const stale: GameState = {
      ...state,
      augmentData: {
        ...state.augmentData,
        // 장-국-본장이 다른(=지난 국) 키 — 접두·접미가 같아도 걸러져야 한다
        [`${HAND_ALTERED_AUGMENT_ID}:${HAND_ALTERED_NAME}:1-9-9:p0${ROUND_SCOPED_MARK}`]:
          true,
      },
    };
    expect(handAlteredByAugment(stale, "p0")).toBe(false);
    expect(flagsOf(stale, "p0").tenhou).toBe(true);
  });
});
