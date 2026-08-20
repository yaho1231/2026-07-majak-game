/**
 * 파혼 (meld_dissolve) 동작 테스트.
 *
 * 핵심 계약:
 *  1. 자기 치·펑 멜드마다 dissolve_meld 후보가 뜬다(국당 1회 소진 후엔 안 뜬다).
 *  2. 해체 후 byPlayer[holder].melds가 비고, 손에서 냈던 2장이 손패로 복귀한다(+2).
 *  3. 가져왔던 1장은 원 버린 사람의 강으로 복귀한다.
 *  4. 타일 총량 불변(정합의 #1 기준) — moveTiles만 쓰므로 게임 전체 패 수는 그대로.
 *
 * 하네스 주의: craft의 melds는 calledTileId/calledFrom를 채우지 않는다. 첫 시나리오는
 * 그 폴백(마지막 장=가져온 패, 첫 상대의 강으로 복귀)을 검증하고, 두 번째 시나리오는
 * calledTileId/calledFrom를 명시해 지정된 상대의 강으로 정확히 복귀하는지 검증한다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  WALL,
  createStandardGameFromState,
  discardsZone,
  handZone,
  installAugment,
  meldsZone,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { meldDissolve } from "../src/augments/meld_dissolve.js";

function withAugments(
  state: GameState,
  player: PlayerId,
  augments: string[],
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...augments] } : p,
    ),
  };
}

/** 모든 Zone의 타일 수 총합 (정합 불변 확인용) */
function totalTiles(state: GameState): number {
  return Object.values(state.zones).reduce((n, z) => n + z.tileIds.length, 0);
}

const zoneLen = (state: GameState, zone: string): number =>
  state.zones[zone]?.tileIds.length ?? 0;

/** p0: 펑 1개(111m) + 손패 11장, turn.act, 자기 턴 */
function scene(): GameState {
  const base = craft({
    hands: { p0: "234p567p22s99s3z", p1: "*", p2: "*", p3: "*" },
    melds: { p0: [{ kind: "pon", spec: "111m" }] },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return withAugments(base, "p0", ["meld_dissolve"]);
}

function start(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, meldDissolve, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const prompt = status.prompts.find((p) => p.player === "p0");
  if (prompt === undefined) throw new Error("no prompt for p0");
  return { game, flow, prompt };
}

const dissolveOptions = (prompt: {
  options: readonly { type: string; payload: unknown }[];
}) => prompt.options.filter((o) => o.type === "dissolve_meld");

describe("파혼 (meld_dissolve)", () => {
  it("자기 치·펑 멜드에 대해 dissolve_meld 후보를 낸다", () => {
    const { prompt } = start(scene());
    const opts = dissolveOptions(prompt);
    expect(opts).toHaveLength(1);
    expect((opts[0]?.payload as { meldIndex: number }).meldIndex).toBe(0);
  });

  it("해체하면 melds가 비고 손패가 +3(복귀 2 + 보충 쯔모 1), 타일 총량은 불변", () => {
    const { game, flow, prompt } = start(scene());
    const before = game.engine.state;
    const handBefore = zoneLen(before, handZone("p0"));
    const meldZoneBefore = zoneLen(before, meldsZone("p0"));
    const wallBefore = zoneLen(before, WALL);
    const totalBefore = totalTiles(before);
    expect(meldZoneBefore).toBe(3);

    const opt = dissolveOptions(prompt)[0];
    expect(opt).toBeDefined();
    flow.submit("p0", opt as { type: string; payload: unknown });

    const after = game.engine.state;
    // (a) byPlayer.p0.melds 비었다 (멘젠은 melds에서 파생 → 자연 복구)
    expect(after.round.byPlayer["p0"]?.melds ?? []).toHaveLength(0);
    // (b) 손에서 냈던 2장 복귀(+2) + 패산 보충 쯔모 1장(+1) = +3
    expect(zoneLen(after, handZone("p0"))).toBe(handBefore + 3);
    // 멜드 존은 통째로 비었다 (2장 손으로, 1장 강으로)
    expect(zoneLen(after, meldsZone("p0"))).toBe(0);
    // 패산은 보충 쯔모로 1장 줄고, 뽑은 패가 lastDrawnTile로 선다
    expect(zoneLen(after, WALL)).toBe(wallBefore - 1);
    expect(after.round.lastDrawnTile).toBeDefined();
    // (#1) 게임 전체 타일 수는 불변 (강으로 나간 1장 + 패산에서 온 1장 상쇄)
    expect(totalTiles(after)).toBe(totalBefore);
  });

  it("가져왔던 1장은 상대의 강으로 복귀한다 (폴백: 첫 상대)", () => {
    const { game, flow, prompt } = start(scene());
    const before = game.engine.state;
    // 폴백 대상 = 보유자가 아닌 첫 플레이어
    const target = before.players.find((p) => p.id !== "p0")?.id as PlayerId;
    const pondBefore = zoneLen(before, discardsZone(target));

    flow.submit("p0", dissolveOptions(prompt)[0] as { type: string; payload: unknown });

    const after = game.engine.state;
    expect(zoneLen(after, discardsZone(target))).toBe(pondBefore + 1);
  });

  it("국당 1회 — 해체 후 같은 국에서 다시 제시되지 않는다", () => {
    const { flow, prompt } = start(scene());
    const status = flow.submit(
      "p0",
      dissolveOptions(prompt)[0] as { type: string; payload: unknown },
    );
    // 해체는 버림을 소비하지 않으므로 같은 턴 프롬프트가 다시 열린다
    expect(status.kind).toBe("awaiting");
    if (status.kind !== "awaiting") return;
    const next = status.prompts.find((p) => p.player === "p0");
    expect(next).toBeDefined();
    // 멜드도 사라졌고 used 플래그도 섰으니 dissolve_meld는 더 없다
    expect(
      dissolveOptions(next as { options: { type: string; payload: unknown }[] }),
    ).toHaveLength(0);
  });

  it("이미 소진되면 후보가 없다", () => {
    const base = scene();
    const r = base.round;
    const usedKey = `meld_dissolve:used:${r.prevalentWind}-${r.roundNumber}-${r.honba}:p0#round`;
    const used: GameState = {
      ...base,
      augmentData: { ...base.augmentData, [usedKey]: true },
    };
    const { prompt } = start(used);
    expect(dissolveOptions(prompt)).toHaveLength(0);
  });

  it("calledTileId/calledFrom가 명시되면 지정된 상대의 강으로 정확히 복귀한다", () => {
    // craft 멜드에 명시적 calledTileId/calledFrom를 심는다
    const base = scene();
    const meldTiles = base.zones[meldsZone("p0")]?.tileIds ?? [];
    const calledId = meldTiles[0] as TileId; // 111m 중 첫 장을 '가져온 패'로
    const staged: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p0: {
            ...base.round.byPlayer["p0"]!,
            melds: [
              {
                kind: "pon",
                tileIds: [...meldTiles],
                calledFrom: "p2",
                calledTileId: calledId,
              },
            ],
          },
        },
      },
    };
    const { game, flow, prompt } = start(staged);
    const handBefore = zoneLen(game.engine.state, handZone("p0"));
    const p2PondBefore = zoneLen(game.engine.state, discardsZone("p2"));

    flow.submit("p0", dissolveOptions(prompt)[0] as { type: string; payload: unknown });

    const after = game.engine.state;
    // 손패 +3(복귀 2 + 보충 쯔모 1), 지정 상대(p2) 강 +1, 그 강 맨 뒤가 바로 그 가져왔던 패
    expect(zoneLen(after, handZone("p0"))).toBe(handBefore + 3);
    expect(zoneLen(after, discardsZone("p2"))).toBe(p2PondBefore + 1);
    expect(after.zones[discardsZone("p2")]?.tileIds.at(-1)).toBe(calledId);
    // 손패에는 나머지 두 장이 들어왔다
    const hand = after.zones[handZone("p0")]?.tileIds ?? [];
    expect(hand).toContain(meldTiles[1]);
    expect(hand).toContain(meldTiles[2]);
    expect(hand).not.toContain(calledId);
  });
});
