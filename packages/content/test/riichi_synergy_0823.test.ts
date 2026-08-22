/**
 * 리치 축 시너지 회귀 — 2026-08-23 QA synergy3 riichi.
 *
 * 이 축에서 깨진 곳은 판수 계산이 아니라 **조건**이었다 — 한 카드가 다른 카드의
 * 전제를 만들거나 없애면 설명이 통째로 거짓이 된다.
 *
 * 1. 오픈 리치 직격 역만의 **유일한 탈출구(추격 리치)** 를 리치 봉인이 없앴다.
 *    "추가 점수는 붙지 않는다"고 적힌 봉인 카드가 24,000을 48,000으로 만들었다.
 * 2. 오픈 리치의 "3판으로 취급"이 조건 없는 +2판이라, 리치를 이미 키워 둔 카드와
 *    겹치면 카드 둘이 각각 "3판"을 약속하는데 결과가 5판이 됐다.
 * 3. 카운터가 **남이 강제한 리치**(등 떠밀기)까지 사냥감으로 삼았다.
 * 4. 불가침 조약이 남이 강제한 리치로 파기됐다(카드의 파기 사유는 전부 내 행동이다).
 * 5. 은밀한 리치를 조약 배너가 폭로했다 → 상호 배제로 잠갔다.
 * 6. 노텐 리치를 간파하면 빈 대기를 받고 국당 1회가 소모됐다.
 * 7. 전용 리치 선언 버튼 5종이 서로를 끌어당겼다(리치는 국당 한 번인데).
 */

import { describe, expect, it } from "vitest";
import {
  AUGMENT_SYNERGY,
  DEAD_WALL,
  FlowController,
  ROUND_SETTLED,
  SYNERGY_PENALTY,
  WALL,
  createStandardGameFromState,
  installAugment,
  kindKey,
  synergyBias,
} from "@majak/core";
import type {
  ActionOption,
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { standardAugments } from "@majak/core";
import { contentAugments } from "../src/index.js";
import { craft, h } from "./helpers.js";
import { stealthRiichi } from "../src/augments/stealth_riichi.js";
import { peekRiichiWaits } from "../src/augments/peek_riichi_waits.js";

const DEFS = new Map([...contentAugments, ...standardAugments].map((d) => [d.id, d]));
const defOf = (id: string): AugmentDef => {
  const d = DEFS.get(id);
  if (d === undefined) throw new Error(`no augment def: ${id}`);
  return d;
};

/** 도라/뒷도라 표시패를 원하는 종류로 고정한다 (왕패 4·5번 자리) */
function setIndicators(state: GameState, doraSpec: string, uraSpec: string): GameState {
  const zones: Record<string, TileId[]> = {};
  for (const z of [DEAD_WALL, WALL, "hand:p2", "hand:p3"]) {
    if (state.zones[z] !== undefined) zones[z] = [...(state.zones[z]?.tileIds ?? [])];
  }
  const swapInto = (slot: number, spec: string): void => {
    const key = kindKey(h(spec)[0] as never);
    for (const [z, ids] of Object.entries(zones)) {
      for (let i = 0; i < ids.length; i++) {
        if (z === DEAD_WALL && (i === 4 || i === 5)) continue;
        if (kindKey(state.tiles[ids[i] as TileId]?.kind as never) !== key) continue;
        const dead = zones[DEAD_WALL] as TileId[];
        const tmp = dead[slot] as TileId;
        dead[slot] = ids[i] as TileId;
        ids[i] = tmp;
        return;
      }
    }
    throw new Error(`setIndicators: no free ${spec}`);
  };
  swapInto(4, doraSpec);
  swapInto(5, uraSpec);
  const out = { ...state.zones };
  for (const [z, ids] of Object.entries(zones)) {
    out[z] = { ...(state.zones[z] as object), tileIds: ids } as never;
  }
  return { ...state, zones: out };
}

/** 패산 맨 앞을 지정한 종류로 채운다 (다음 쯔모를 고정) */
function stackWall(state: GameState, specs: string[]): GameState {
  const zones: Record<string, TileId[]> = {};
  for (const z of [WALL, DEAD_WALL, "hand:p2", "hand:p3"]) {
    if (state.zones[z] !== undefined) zones[z] = [...(state.zones[z]?.tileIds ?? [])];
  }
  const wall = zones[WALL] as TileId[];
  specs.forEach((spec, slot) => {
    const key = kindKey(h(spec)[0] as never);
    if (kindKey(state.tiles[wall[slot] as TileId]?.kind as never) === key) return;
    for (const [z, ids] of Object.entries(zones)) {
      for (let i = 0; i < ids.length; i++) {
        if (z === WALL && i <= slot) continue;
        if (z === DEAD_WALL && (i === 4 || i === 5)) continue;
        if (kindKey(state.tiles[ids[i] as TileId]?.kind as never) !== key) continue;
        const tmp = wall[slot] as TileId;
        wall[slot] = ids[i] as TileId;
        ids[i] = tmp;
        return;
      }
    }
    throw new Error(`stackWall: no free ${spec}`);
  });
  const out = { ...state.zones };
  for (const [z, ids] of Object.entries(zones)) {
    out[z] = { ...(state.zones[z] as object), tileIds: ids } as never;
  }
  return { ...state, zones: out };
}

function mkGame(state: GameState) {
  const game = createStandardGameFromState(state);
  for (const p of state.players) {
    for (const id of p.augments) {
      installAugment(game.engine, defOf(id), p.id, { yaku: game.yaku, catalog: game.augments });
    }
  }
  return game;
}

const optionsFor = (status: unknown, player: PlayerId): ActionOption[] => {
  const s = status as { kind: string; prompts?: { player: PlayerId; options: ActionOption[] }[] };
  if (s.kind !== "awaiting") return [];
  return s.prompts?.find((p) => p.player === player)?.options ?? [];
};

const pick = (
  status: unknown,
  player: PlayerId,
  type: string,
  match?: (payload: Record<string, unknown>) => boolean,
): ActionOption => {
  const o = optionsFor(status, player).find(
    (x) => x.type === type && (match === undefined || match((x.payload ?? {}) as never)),
  );
  if (o === undefined) throw new Error(`no option ${type} for ${player}`);
  return o;
};

// ────────────────── 오픈 리치 × 리치 봉인 ──────────────────

describe("오픈 리치 직격 역만 — 상대가 리치를 걸 수 있었을 때만", () => {
  const P0_HAND = "123m456m789m222p1s9s";
  const P1_HAND = "234m567m234p55z2s3s"; // 1s/4s 대기 텐파이

  function scene(p0augs: string[]): GameState {
    let s = craft({
      hands: { p0: P0_HAND, p1: P1_HAND, p2: "*", p3: "*" },
      discards: { p0: "123z", p1: "567z" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    s = setIndicators(s, "3z", "1p");
    s = stackWall(s, ["1s"]); // p1이 곧바로 1s를 쯔모해 버린다
    return {
      ...s,
      players: s.players.map((p) => (p.id === "p0" ? { ...p, augments: [...p0augs] } : p)),
    };
  }

  /** p0가 오픈 리치를 선언하고 p1이 버린 1s를 론한다 → 화료 점수 */
  function play(p0augs: string[]): number {
    const game = mkGame(scene(p0augs));
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    status = flow.submit(
      "p0",
      pick(status, "p0", "open_riichi", (p) => {
        const k = game.engine.state.tiles[p["tileId"] as TileId]?.kind;
        return k?.suit === "sou" && k.rank === 9;
      }),
    );
    for (let i = 0; i < 12; i++) {
      const s = status as { kind: string };
      if (s.kind !== "awaiting") break;
      const wonOpt = optionsFor(status, "p0").find((o) => o.type === "win");
      if (wonOpt !== undefined) {
        status = flow.submit("p0", wonOpt);
        break;
      }
      const anyPrompt = (
        status as { prompts?: { player: PlayerId; options: ActionOption[] }[] }
      ).prompts?.[0];
      if (anyPrompt === undefined) break;
      // 상대는 뽑은 패를 그대로 버린다(쯔모기리) — 쌓아 둔 1s가 p0의 오름패다
      const drawn = game.engine.state.round.lastDrawnTile;
      const opt =
        anyPrompt.options.find((o) => o.type === "pass") ??
        anyPrompt.options.find(
          (o) => o.type === "discard" && (o.payload as { tileId?: TileId })?.tileId === drawn,
        ) ??
        anyPrompt.options.find((o) => o.type === "discard") ??
        anyPrompt.options[0];
      if (opt === undefined) break;
      status = flow.submit(anyPrompt.player, opt);
    }
    for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
      const e = game.engine.eventLog[i];
      if (e?.type === ROUND_SETTLED) {
        return (e.payload as RoundSettledPayload).deltas["p0"] ?? 0;
      }
    }
    throw new Error("no settlement");
  }

  it("상대가 리치를 걸 수 있었으면(스스로 다마텐) 역만이다", () => {
    // 48,000 + 공탁 1,000(오픈 리치 선언분 회수)
    expect(play(["open_riichi_reveal"])).toBeGreaterThanOrEqual(48000);
  });

  it("리치 봉인으로 상대의 리치를 잠갔으면 역만이 아니다", () => {
    // 봉인 카드는 "추가 점수는 붙지 않는다"고 적혀 있다 — 그런데 예전에는
    // 탈출구를 지우는 것만으로 화료값을 두 배로 만들었다.
    expect(play(["open_riichi_reveal", "riichi_seal"])).toBeLessThan(48000);
  });

  it("리치 승격(하가 봉인)으로 잠근 경우도 마찬가지다", () => {
    expect(play(["open_riichi_reveal", "riichi_upgrade"])).toBeLessThan(48000);
  });
});

// ────────────────── 간파 × 노텐 리치 ──────────────────

describe("리치 간파 — 노텐 리치를 봐도 국당 1회가 소모되지 않는다", () => {
  it("대기가 0종이면 사용 플래그가 서지 않는다", () => {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
      drawnLastFor: "p1",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p1" ? { ...p, augments: ["peek_riichi_waits"] } : p,
      ),
    };
    const game = createStandardGameFromState(state, undefined, [peekRiichiWaits]);
    installAugment(game.engine, peekRiichiWaits, "p1", {
      yaku: game.yaku,
      catalog: game.augments,
    });
    const after = (waits: string[]): GameState =>
      (
        game.engine as unknown as {
          reducers: { dispatch: (s: GameState, e: unknown) => GameState };
        }
      ).reducers.dispatch(game.engine.state, {
        type: "PeekWaitsPerformed",
        payload: { holder: "p1", target: "p0", waits },
      });
    const usedIn = (st: GameState): unknown =>
      Object.entries(st.augmentData).find(
        ([k]) => k.startsWith("peek_riichi_waits:used") && k.includes("p1"),
      )?.[1];
    // 대기 0종(노텐 리치 간파) — 정보만 남고 횟수는 살아 있다
    expect(usedIn(after([]))).toBeUndefined();
    // 대기가 있으면 그때 소모된다
    expect(usedIn(after(["sou1"]))).toBe(true);
  });
});

// ────────────────── 드래프트 편향 · 상호 배제 ──────────────────

describe("전용 리치 선언 버튼은 서로를 끌어당기지 않는다", () => {
  const DECLARERS = [
    "stealth_riichi",
    "no_retreat",
    "soul_strike",
    "open_riichi_reveal",
    "all_or_nothing",
  ];

  it("다섯 장 전부 riichi_declare 축을 달고 서로 anti다", () => {
    for (const id of DECLARERS) {
      expect(AUGMENT_SYNERGY[id]?.tags, id).toContain("riichi_declare");
      expect(AUGMENT_SYNERGY[id]?.anti, id).toContain("riichi_declare");
    }
    for (const held of DECLARERS) {
      const bias = synergyBias([held], (id) => defOf(id).conflicts ?? []);
      for (const other of DECLARERS) {
        if (other === held) continue;
        // conflicts로 이미 잠긴 쌍은 편향 계산에서 빠진다(끌지도 밀지도 않는다)
        const locked =
          (defOf(held).conflicts ?? []).includes(other) ||
          (defOf(other).conflicts ?? []).includes(held);
        if (locked) {
          expect(bias[other], `${held} → ${other}`).toBeUndefined();
        } else {
          expect(bias[other], `${held} → ${other}`).toBe(SYNERGY_PENALTY);
        }
      }
    }
  });
});

describe("은밀한 리치 — 조약 배너로 폭로되지 않는다", () => {
  it("불가침 조약과 함께 들 수 없다", () => {
    expect(stealthRiichi.conflicts).toContain("no_ron_pact");
  });
});
