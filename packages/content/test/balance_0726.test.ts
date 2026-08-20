/**
 * balance_0726 — 2026-07-26 밸런스 패스 회귀.
 *
 * 사용자 지시로 손본 항목 중 **기존 테스트가 덮지 않던 것**만 여기서 검증한다.
 * (이미 다른 파일이 덮는 것: dead_wall_master 2장·보너스 삭제 = new_52_c ·
 *  riichi_upgrade 트리플 4판 / peek_riichi_waits 국당 1회 = riichi_family ·
 *  tanyao_break 1판 = rule_benders · yakuman_shield 역만 전용·무제한 = buff_52_cdf)
 *
 * 여기서 보는 것:
 * - take_back  : 매 턴 1회 → **3턴에 1회** 쿨다운
 * - north_trader: 방금 쯔모한 北을 그대로 뺐을 때 `lastDrawnTile`이 보충패로 따라간다
 * - peek_riichi_waits: 국당 1회라 **다른 상대도** 더는 간파할 수 없다
 * - blood_contract: 계약 성립 시 배율 2배 → **1.5배**
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  ROUND_SETTLED,
  WALL,
  createStandardGameFromState,
  handZone,
  installAugment,
  kindOf,
} from "@majak/core";
import type {
  ActionOption,
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { takeBack } from "../src/augments/take_back.js";
import { northTrader } from "../src/augments/north_trader.js";
import { peekRiichiWaits } from "../src/augments/peek_riichi_waits.js";
import { bloodContract } from "../src/augments/blood_contract.js";

type Game = ReturnType<typeof createStandardGameFromState>;

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

function withRiichi(state: GameState, player: PlayerId): GameState {
  const rs = state.round.byPlayer[player];
  if (rs === undefined) throw new Error(`no round state for ${player}`);
  return {
    ...state,
    round: {
      ...state.round,
      byPlayer: {
        ...state.round.byPlayer,
        [player]: {
          ...rs,
          riichi: { double: false, ippatsu: false, discardIndex: 0 },
        },
      },
    },
  };
}

function optionsFor(
  status: ReturnType<FlowController["begin"]>,
  player: PlayerId,
): ActionOption[] {
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return status.prompts.find((p) => p.player === player)?.options ?? [];
}

function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

// ───────────────────── take_back — 3턴에 1회 ─────────────────────

describe("take_back (무르기) — 3턴에 1회", () => {
  /** p0의 자기 턴(쯔모 완료) 상태 */
  const turnState = (): GameState =>
    craft({
      hands: {
        p0: "19m19p19s1234567z",
        p1: "*",
        p2: "*",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });

  it("첫 턴엔 쓸 수 있고, 쓰고 나면 그 턴엔 후보가 사라진다", () => {
    const game = createStandardGameFromState(
      withAugments(turnState(), "p0", ["take_back"]),
    );
    installAugment(game.engine, takeBack, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);

    const opt = optionsFor(flow.begin(), "p0").find((o) => o.type === "take_back");
    expect(opt).toBeDefined();
    const after = flow.submit("p0", opt as ActionOption);

    // 사용 턴 번호(=그 국에 내가 버린 수 0)가 국 스코프로 기록된다
    const st = game.engine.state;
    const key = Object.keys(st.augmentData).find((k) =>
      k.startsWith("take_back:last:"),
    );
    expect(key).toBeDefined();
    expect(st.augmentData[key as string]).toBe(0);
    expect(
      optionsFor(after, "p0").some((o) => o.type === "take_back"),
    ).toBe(false);
  });

  it("쿨다운 판정은 '마지막 사용 턴 + 3' — 1·2턴 뒤엔 막히고 3턴 뒤에 열린다", () => {
    const def = takeBack;
    // 버림 수(=턴 번호)를 직접 만들어 validate만 본다
    const at = (discards: number, lastUsed: number): string | null => {
      const base = craft({
        hands: { p0: "19m19p19s1234567z", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      });
      const state: GameState = {
        ...withAugments(base, "p0", ["take_back"]),
        round: {
          ...base.round,
          byPlayer: {
            ...base.round.byPlayer,
            p0: {
              ...(base.round.byPlayer["p0"] as NonNullable<
                (typeof base.round.byPlayer)["p0"]
              >),
              // 실제 버림 횟수가 곧 턴 번호다 (후리텐 이력 내용은 무관)
              discardedKinds: Array.from({ length: discards }, () => "man1"),
              discardCount: discards,
            },
          },
        },
        augmentData: {
          ...base.augmentData,
          [`take_back:last:${base.round.prevalentWind}-${base.round.roundNumber}-${base.round.honba}:p0#round`]:
            lastUsed,
        },
      };
      const game = createStandardGameFromState(state);
      installAugment(game.engine, def, "p0", { yaku: game.yaku });
      const action = game.engine.actions.get("take_back");
      if (action === undefined) throw new Error("take_back not registered");
      return action.validate(
        { player: "p0", type: "take_back", payload: {} },
        { state: game.engine.state, rules: game.engine.rules },
      );
    };

    expect(at(0, 0)).toBe("take back is on cooldown"); // 같은 턴
    expect(at(1, 0)).toBe("take back is on cooldown"); // 1턴 뒤
    expect(at(2, 0)).toBe("take back is on cooldown"); // 2턴 뒤
    expect(at(3, 0)).toBeNull(); // 3턴 뒤 — 열린다
    expect(at(4, 0)).toBeNull();
  });

  it("국이 바뀌면 쿨다운 키가 달라져 첫 턴부터 다시 쓸 수 있다", () => {
    const base = craft({
      hands: { p0: "19m19p19s1234567z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    // 지난 국(동1국 0본장)에 쓴 기록이 남아 있어도 이번 국 키와 겹치지 않는다
    const state: GameState = {
      ...withAugments(base, "p0", ["take_back"]),
      round: { ...base.round, roundNumber: 2 },
      augmentData: { ...base.augmentData, "take_back:last:east-1-0:p0#round": 0 },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, takeBack, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    expect(
      optionsFor(flow.begin(), "p0").some((o) => o.type === "take_back"),
    ).toBe(true);
  });
});

// ─────────── north_trader — 北을 빼면 영상 보충패가 새 쯔모패 ───────────

describe("north_trader (북풍 상인) — 손패 장수·쯔모패 정합", () => {
  it("北 1장이 나가고 영상패 1장이 들어와 손패 장수가 유지된다", () => {
    const base = craft({
      hands: { p0: "19m19p19s1235677z4z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(
      withAugments(base, "p0", ["north_trader"]),
    );
    installAugment(game.engine, northTrader, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);

    const before = game.engine.state;
    const handBefore = before.zones[handZone("p0")]?.tileIds.length ?? 0;
    const wallBefore = before.zones[WALL]?.tileIds.length ?? 0;
    const deadBefore = before.zones[DEAD_WALL]?.tileIds.length ?? 0;
    // 보충은 패산 맨 앞이 아니라 **영상패**(왕패 맨 앞)다
    const replacement = before.zones[DEAD_WALL]?.tileIds[0] as TileId;
    // 손에 北은 딱 한 장이고 그게 방금 쯔모한 패다 (drawnLastFor 마지막 패 = 4z)
    const drawn = before.round.lastDrawnTile as TileId;
    expect(kindOf(before, drawn)).toEqual({ suit: "wind", rank: 4 });

    const opt = optionsFor(flow.begin(), "p0").find(
      (o) => o.type === "north_pull",
    );
    expect(opt).toBeDefined();
    flow.submit("p0", opt as ActionOption);

    const st = game.engine.state;
    expect(st.zones[handZone("p0")]?.tileIds).toHaveLength(handBefore); // 장수 불변
    expect(st.zones[WALL]?.tileIds).toHaveLength(wallBefore - 1); // 패산만 줄어든다
    expect(st.zones[DEAD_WALL]?.tileIds).toHaveLength(deadBefore); // 왕패는 되채워 14장 유지
    // 손을 떠난 北이 아니라 보충패가 새 쯔모패다 (안 고치면 쯔모 화료 판정이 어긋난다)
    expect(st.round.lastDrawnTile).toBe(replacement);
    expect(st.round.lastDrawnTile).not.toBe(drawn);
    expect(st.round.lastDrawRinshan).toBe(true); // 영상 쯔모 — 영상개화가 선다
  });
});

// ───────────── peek_riichi_waits — 국당 1회(상대별 아님) ─────────────

describe("peek_riichi_waits (선언 간파) — 국당 1회", () => {
  it("한 명을 간파하면 그 국엔 다른 리치자도 간파할 수 없다", () => {
    // p1·p2가 모두 리치 중
    const base = craft({
      hands: {
        p0: "123m456m789m123p19p",
        p1: "234m345p345s678s5s", // 2s/5s/8s 3면 대기
        p2: "234p345s345m678m5m", // 마찬가지로 텐파이
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(
      withRiichi(
        withRiichi(withAugments(base, "p0", ["peek_riichi_waits"]), "p1"),
        "p2",
      ),
    );
    installAugment(game.engine, peekRiichiWaits, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);

    const peeks = optionsFor(flow.begin(), "p0").filter(
      (o) => o.type === "peek_waits",
    );
    expect(peeks).toHaveLength(2); // 리치 둘 다 후보

    const after = flow.submit("p0", peeks[0] as ActionOption);
    // 한 번 썼으면 남은 상대도 사라진다 (예전엔 상대별 1회라 하나가 남았다)
    expect(
      optionsFor(after, "p0").some((o) => o.type === "peek_waits"),
    ).toBe(false);
  });
});

// ───────────────── blood_contract — 계약 성립 시 1.5배 ─────────────────

describe("blood_contract (핏빛 계약) — 1.5배", () => {
  it("계약 역을 포함해 화료하면 획득 점수가 1.5배가 된다", () => {
    /** p0 탕야오 쯔모 직전 (계약 여부만 바꿔 비교) */
    const state = (contract: string | null): GameState => {
      const base = craft({
        hands: {
          p0: "234567m345678p55s", // 전부 심플 = 탕야오, 5s 쯔모로 완성
          p1: "*",
          p2: "*",
          p3: "*",
        },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      });
      const withAug = withAugments(base, "p0", ["blood_contract"]);
      if (contract === null) return withAug;
      return {
        ...withAug,
        augmentData: {
          ...withAug.augmentData,
          [`blood_contract:yaku:${base.round.prevalentWind}-${base.round.roundNumber}-${base.round.honba}:p0#round`]:
            contract,
        },
      };
    };

    const play = (contract: string | null): number => {
      const game = createStandardGameFromState(state(contract));
      installAugment(game.engine, bloodContract, "p0", { yaku: game.yaku });
      const flow = new FlowController(game.engine);
      const win = optionsFor(flow.begin(), "p0").find((o) => o.type === "win");
      expect(win).toBeDefined();
      flow.submit("p0", win as ActionOption);
      return lastSettled(game).deltas["p0"] ?? 0;
    };

    const plain = play(null);
    expect(plain).toBeGreaterThan(0);
    const contracted = play("tanyao");
    // 2배가 아니라 1.5배 (round100 단위 보정 포함)
    expect(contracted).toBe(Math.round((plain * 1.5) / 100) * 100);
  });
});
