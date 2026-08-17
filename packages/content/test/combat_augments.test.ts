/**
 * combat_augments — 전투 계열 증강 3종 검증.
 * nagashi_yakuman(유국역만) / cliff_bloom(절벽 위에 피어난 꽃) /
 * no_retreat(물러설 수 없는 선언)
 * (선봉vanguard은 48차 도파민 리디자인에서 삭제 — 정산 배율 패시브)
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  WALL,
  buildWinContext,
  createStandardGameFromState,
  discardsZone,
  evaluateWin,
  handZone,
  installAugment,
  playerOf,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";
import { nagashiYakuman } from "../src/augments/nagashi_yakuman.js";
import { yakumanShield } from "../src/augments/yakuman_shield.js";
import { cliffBloom } from "../src/augments/cliff_bloom.js";
import { noRetreat } from "../src/augments/no_retreat.js";
import { suitUnify } from "../src/augments/suit_unify.js";

type Game = ReturnType<typeof createStandardGameFromState>;
const SYS = "__system";

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

function withData(state: GameState, data: Record<string, unknown>): GameState {
  return { ...state, augmentData: { ...state.augmentData, ...data } };
}

function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

/** p0 오야 탕야오 쯔모 손 (14장) */
function tanyaoTsumo(): GameState {
  return craft({
    hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
}

/** p0의 쯔모 화료를 실행하고 정산을 돌려준다 */
function runTsumo(game: Game): RoundSettledPayload {
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  const win = status.prompts
    .find((p) => p.player === "p0")
    ?.options.find((o) => o.type === "win");
  if (win === undefined) throw new Error("no win option for p0");
  flow.submit("p0", win);
  return lastSettled(game);
}


// ─────────────────────── nagashi_yakuman (유국역만) ───────────────────────

describe("nagashi_yakuman (유국역만)", () => {
  /** 유국 상황: 패산 소진, p0 버림 전부 요구패 */
  function drawState(): GameState {
    const s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "19m19p19s1234z567z", p1: "234m", p2: "234m", p3: "234m" },
      phase: "turn.draw",
      turnSeat: 0,
    });
    return { ...s, zones: { ...s.zones, [WALL]: { ...s.zones[WALL]!, tileIds: [] } } };
  }

  function settleDraw(game: Game): RoundSettledPayload {
    const r = game.engine.submit({ player: SYS, type: "sys.settleDraw", payload: {} });
    if (!r.ok) throw new Error(`settleDraw failed: ${r.reason}`);
    return lastSettled(game);
  }

  it("모든 버림이 요구패이면 유국역만(오야 48000) 지불을 받는다", () => {
    const base = settleDraw(createStandardGameFromState(drawState()));

    const game = createStandardGameFromState(withAugments(drawState(), "p0", ["nagashi_yakuman"]));
    installAugment(game.engine, nagashiYakuman, "p0", { yaku: game.yaku });
    const settled = settleDraw(game);

    // p0는 오야(seat 0) → 전원 16000씩, 총 +48000.
    //
    // 기준선에는 이제 **표준 유국만관**(오야 12000 = 전원 4000)이 이미 들어 있다 —
    // 이 증강은 그 자리를 역만으로 **갈아 끼우는** 것이지 위에 얹는 것이 아니므로,
    // 차이는 48000 − 12000 = 36000 (내는 쪽은 16000 − 4000 = 12000)이다.
    for (const id of ["p0", "p1", "p2", "p3"] as PlayerId[]) {
      const diff = (settled.deltas[id] ?? 0) - (base.deltas[id] ?? 0);
      expect(diff).toBe(id === "p0" ? 36000 : -12000);
    }
    // 겹쳐 받지 않는다 — 보유자에게는 표준 규칙이 꺼져 있다
    expect(
      game.engine.rules.resolve<boolean>("draw.nagashiMangan", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(false);
  });

  it("버림에 요구패가 아닌 패가 섞이면 성립하지 않는다", () => {
    const s = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      discards: { p0: "19m19p19s1234z56z5m" }, // 5m이 섞임
      phase: "turn.draw",
      turnSeat: 0,
    });
    const st = { ...s, zones: { ...s.zones, [WALL]: { ...s.zones[WALL]!, tileIds: [] } } };
    const base = settleDraw(createStandardGameFromState(st));

    const game = createStandardGameFromState(withAugments(st, "p0", ["nagashi_yakuman"]));
    installAugment(game.engine, nagashiYakuman, "p0", { yaku: game.yaku });
    const settled = settleDraw(game);

    expect(settled.deltas["p0"]).toBe(base.deltas["p0"]);
  });

  // 52차(docs/16 §1b D): 성립 조건이 극단적이라 사실상 장식이던 것을 완화 —
  // **무울림 조건을 삭제**했다. 내 버림이 울려도 바닥이 전부 요구패면 성립한다.
  it("내 버림이 울려도 성립한다 (52차: 무울림 조건 삭제)", () => {
    const game = createStandardGameFromState(
      withData(withAugments(drawState(), "p0", ["nagashi_yakuman"]), {
        "nagashi_yakuman:called:p0": "1-1-0",
      }),
    );
    installAugment(game.engine, nagashiYakuman, "p0", { yaku: game.yaku });
    const base = settleDraw(createStandardGameFromState(drawState()));
    const settled = settleDraw(game);
    expect(settled.deltas["p0"]).toBeGreaterThan(base.deltas["p0"] ?? 0);
  });

  it("역만 방어술 보유자는 면제되지만, 그 몫은 뱅크가 내 화료자 수령액은 안 줄어든다", () => {
    // p0 유국역만(오야) + p1이 역만 방어술 보유 → p1은 0, p2·p3만 16000씩 낸다.
    //
    // 2026-08-07 변경: 예전에는 p0의 수령도 32000으로 같이 줄었다. 내 손과 무관한
    // **남의 드래프트 결과가 내 타점을 33% 깎는 것**이라 무페널티 원칙에 어긋났다.
    // 이제 면제분은 뱅크가 내고 p0는 방어막이 없을 때와 같은 48000을 받는다.
    // (일확천금 0.5배 굴림을 고칠 때와 같은 판단 — 한쪽을 지키느라 다른 쪽을
    // 손해 보게 하지 않는다.)
    const st = withAugments(
      withAugments(drawState(), "p0", ["nagashi_yakuman"]),
      "p1",
      ["yakuman_shield"],
    );
    const base = settleDraw(createStandardGameFromState(drawState()));

    const game = createStandardGameFromState(st);
    installAugment(game.engine, nagashiYakuman, "p0", { yaku: game.yaku });
    installAugment(game.engine, yakumanShield, "p1", { yaku: game.yaku });
    const settled = settleDraw(game);

    const diff = (id: PlayerId): number =>
      (settled.deltas[id] ?? 0) - (base.deltas[id] ?? 0);
    // 기준선은 표준 유국만관(전원 4000)이 이미 적용된 상태다 — 방어막으로 역만 지불이
    // 0이 된 p1은 그 4000을 도로 안 내게 되므로 차이가 +4000으로 잡힌다.
    expect(diff("p1")).toBe(4000); // 방어막 → 면제
    expect(diff("p2")).toBe(-12000);
    expect(diff("p3")).toBe(-12000);
    expect(diff("p0")).toBe(36000); // 면제분은 뱅크가 낸다 — 수령은 그대로 48000
  });
});

// ───────────────────── cliff_bloom (절벽 위에 피어난 꽃) ─────────────────────

describe("cliff_bloom (절벽 위에 피어난 꽃) — 48차 재설계", () => {
  /** 1m·2p 각각 4장 — 한 국에 안깡을 두 번 할 수 있는 손 (텐파이와 무관) */
  function twoKanState(): GameState {
    return withAugments(
      craft({
        hands: { p0: "1111m2222p345s678s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["cliff_bloom"],
    );
  }

  function optionsFor(
    status: ReturnType<FlowController["begin"]>,
    player: PlayerId,
  ): { type: string; payload: unknown }[] {
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    return status.prompts.find((p) => p.player === player)?.options ?? [];
  }

  it("깡을 하면 영상패 선택(bloom_pick)이 열리고, 고른 패가 손에 들어온다", () => {
    const game = createStandardGameFromState(twoKanState());
    installAugment(game.engine, cliffBloom, "p0", { yaku: game.yaku });

    const flow = new FlowController(game.engine);
    let status = flow.begin();
    const ankan = optionsFor(status, "p0").find((o) => o.type === "ankan");
    expect(ankan).toBeDefined();

    status = flow.submit("p0", ankan!);
    // 깡의 영상 쯔모가 영상패 1장을 **소모**했으므로(보충 없음, 07 §2) 남은 3장이 후보다
    const picks = optionsFor(status, "p0").filter((o) => o.type === "bloom_pick");
    expect(picks).toHaveLength(3);

    const deadWallBefore = [...(game.engine.state.zones["deadWall"]?.tileIds ?? [])];
    expect(deadWallBefore).toHaveLength(13);
    const wanted = deadWallBefore[2] as TileId;
    const pick2 = picks.find((o) => (o.payload as { index: number }).index === 2);
    flow.submit("p0", pick2!);

    const st = game.engine.state;
    // 고른 패가 손에 들어오고 새 쯔모패가 된다 / 왕패 장수는 보존된다
    expect(st.zones[handZone("p0")]?.tileIds).toContain(wanted);
    expect(st.round.lastDrawnTile).toBe(wanted);
    expect(st.zones["deadWall"]?.tileIds).toHaveLength(deadWallBefore.length);
  });

  it("같은 국에 깡을 두 번 하면 텐파이가 아니어도 손이 만개해 영상개화로 화료한다", () => {
    const game = createStandardGameFromState(twoKanState());
    installAugment(game.engine, cliffBloom, "p0", { yaku: game.yaku });

    const flow = new FlowController(game.engine);
    let status = flow.begin();
    // 첫 깡 — 아직 만개하지 않는다
    status = flow.submit("p0", optionsFor(status, "p0").find((o) => o.type === "ankan")!);
    expect(optionsFor(status, "p0").some((o) => o.type === "win")).toBe(false);

    // 두 번째 깡 — 만개
    const secondKan = optionsFor(status, "p0").find((o) => o.type === "ankan");
    expect(secondKan).toBeDefined();
    status = flow.submit("p0", secondKan!);

    const win = optionsFor(status, "p0").find((o) => o.type === "win");
    expect(win).toBeDefined(); // 패와 상관없이 화료할 수 있다
    // 만개했으므로 영상패 선택은 더 뜨지 않는다
    expect(optionsFor(status, "p0").some((o) => o.type === "bloom_pick")).toBe(false);

    flow.submit("p0", win!);
    const settled = lastSettled(game);
    const info = settled.winInfos?.find((w) => w.winner === "p0");
    expect(info).toBeDefined();
    expect(info!.yaku.some((y) => y.id === "rinshan")).toBe(true);
    expect(settled.deltas["p0"]).toBeGreaterThan(0);
  });

  it("횟수 제한이 없다 — 다음 국에도 깡마다 다시 고를 수 있다", () => {
    const base = twoKanState();
    const game = createStandardGameFromState({
      ...base,
      round: { ...base.round, prevalentWind: 2, roundNumber: 3, honba: 1 },
    });
    installAugment(game.engine, cliffBloom, "p0", { yaku: game.yaku });

    const flow = new FlowController(game.engine);
    let status = flow.begin();
    status = flow.submit("p0", optionsFor(status, "p0").find((o) => o.type === "ankan")!);
    // 깡으로 영상패 1장이 소모돼 남은 3장이 후보다 (국이 바뀌어도 다시 열린다는 것이 요지)
    expect(optionsFor(status, "p0").filter((o) => o.type === "bloom_pick")).toHaveLength(3);
  });
});

// ─────────────────── no_retreat (물러설 수 없는 선언) ───────────────────

describe("no_retreat (물러설 수 없는 선언)", () => {
  const DECLARED = { "no_retreat:round:p0": "1-1-0" };

  /** 첫 턴 상태 (버림 없음) */
  function firstTurn(): GameState {
    return withAugments(
      craft({
        hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["no_retreat"],
    );
  }

  // 2026-08-15: 첫 순 제한이 사라지고 **선언이 곧 리치**가 됐다 (버튼형 액티브 리치).
  // 그래서 후보는 "버려도 텐파이가 유지되는 손패"마다 하나씩 뜬다.
  it("텐파이면 no_retreat_riichi가 노출되고 선언하면 플래그가 선다", () => {
    const game = createStandardGameFromState(firstTurn());
    installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const s0 = flow.begin();
    if (s0.kind !== "awaiting") throw new Error("expected awaiting");
    const declare = s0.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "no_retreat_riichi");
    expect(declare).toBeDefined();

    flow.submit("p0", declare!);
    const st = game.engine.state;
    expect(st.augmentData["no_retreat:round:p0"]).toBe("1-1-0");
  });

  it("선언 후에는 같은 국에 다시 선언할 수 없다 (매 국 1회)", () => {
    // 이미 이번 국(1-1-0)에 선언한 상태 → 첫 턴이어도 후보가 사라진다.
    const game = createStandardGameFromState(withData(firstTurn(), DECLARED));
    installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const s0 = flow.begin();
    if (s0.kind !== "awaiting") throw new Error("expected awaiting");
    const declare = s0.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "no_retreat_riichi");
    expect(declare).toBeUndefined();
  });

  /**
   * 진행 국 수(seq)와 마지막 선언 시점(usedSeq)을 주입한 첫 턴 상태.
   * 쿨다운은 **배패 횟수**로 재므로(본장 재배패도 1국) 국 번호가 아니라 이 두 수가 기준이다.
   */
  function withSeq(seq: number, usedSeq: number | null): GameState {
    const base = firstTurn();
    return {
      ...base,
      augmentData: {
        ...base.augmentData,
        "no_retreat:seq:p0": seq,
        ...(usedSeq === null ? {} : { "no_retreat:usedSeq:p0": usedSeq }),
      },
    };
  }

  /** 그 상태에서 no_retreat_riichi 후보가 노출되는가 */
  function declareAvailable(state: GameState): boolean {
    const game = createStandardGameFromState(state);
    installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });
    const s0 = new FlowController(game.engine).begin();
    if (s0.kind !== "awaiting") throw new Error("expected awaiting");
    return (
      s0.prompts
        .find((p) => p.player === "p0")
        ?.options.some((o) => o.type === "no_retreat_riichi") ?? false
    );
  }

  it("선언한 바로 다음 국은 쿨다운으로 선언할 수 없다 (2국에 1회)", () => {
    // 1국째에 선언 → 2국째는 쿨다운 (diff 1 < 2)
    expect(declareAvailable(withSeq(2, 1))).toBe(false);
  });

  it("2국 뒤·선언 이력 없음이면 다시 선언할 수 있다", () => {
    expect(declareAvailable(withSeq(3, 1))).toBe(true);
    expect(declareAvailable(withSeq(1, null))).toBe(true);
  });

  it("본장도 한 국으로 센다 — 배패마다 seq가 오른다 (2026-08-01)", () => {
    // 동1국0본장에 선언하고 동1국1본장을 지나 동2국에 가면 2국이 지난 것이다.
    // 예전에는 roundKey("장-국-본장")를 자릿수로 쪼개 비교해, 국 번호가 그대로인
    // 본장 재배패가 국 수에 안 잡혀 이 경우가 통째로 쿨다운에 갇혔다.
    const st = firstTurn();
    const game = createStandardGameFromState({
      ...st,
      round: { ...st.round, phase: "round.over" },
    });
    installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });
    const seq = (): number =>
      (game.engine.state.augmentData["no_retreat:seq:p0"] as number | undefined) ?? 0;
    expect(seq()).toBe(0);
    for (let i = 1; i <= 2; i++) {
      const r = game.engine.submit({ player: SYS, type: "sys.startRound", payload: {} });
      expect(r.ok).toBe(true);
      expect(seq()).toBe(i);
      // 도중유국 정산 = 같은 국의 본장만 +1 (국 번호는 그대로)
      game.engine.submit({ player: SYS, type: "sys.settleAbort", payload: {} });
    }
    // 국 번호는 그대로인데도 두 국이 지난 것으로 잡힌다
    expect(game.engine.state.round.roundNumber).toBe(st.round.roundNumber);
    expect(game.engine.state.round.honba).toBe(2);
  });

  it("선언해도 역을 봉인하지 않는다 — 리치 없이도 그대로 화료할 수 있다 (48차 무페널티)", () => {
    const game = createStandardGameFromState(withData(firstTurn(), DECLARED));
    installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });
    // 예전에는 "리치를 안 걸면 전 역 봉인(=화료 불가)"이라는 배수진이 있었다.
    expect(
      game.engine.rules.resolve<string[]>("win.blockedYaku", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toEqual([]);
    expect(
      game.engine.rules.resolve<string[]>("win.blockedYaku", {
        playerId: "p1",
        state: game.engine.state,
      }),
    ).toEqual([]);
  });

  it("리치를 선언하면 봉인이 풀리고 리치 공탁금은 0", () => {
    const riichiState = (): GameState => {
      const s = withData(firstTurn(), DECLARED);
      return {
        ...s,
        round: {
          ...s.round,
          byPlayer: {
            ...s.round.byPlayer,
            p0: { ...s.round.byPlayer["p0"]!, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
          },
        },
      };
    };
    const game = createStandardGameFromState(riichiState());
    installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });
    // 리치 중 → 봉인 해제
    expect(
      game.engine.rules.resolve<string[]>("win.blockedYaku", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toEqual([]);
    // 공탁금 0
    expect(
      game.engine.rules.resolve<number>("riichi.cost", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(0);
  });

  it("리치·일발·뒷도라가 2판으로 계산된다 (extraHan)", () => {
    // p0 리치+일발 쯔모. 선언 상태에서 extraHan = uraHan(2배분) + 리치1 + 일발1.
    const s = withData(firstTurn(), { ...DECLARED });
    const st: GameState = {
      ...s,
      round: {
        ...s.round,
        byPlayer: {
          ...s.round.byPlayer,
          p0: { ...s.round.byPlayer["p0"]!, riichi: { double: false, ippatsu: true, discardIndex: 0 } },
        },
      },
    };
    // 기대치: 같은 상태를 증강 없이 채점했을 때의 ura + 리치 + 일발
    const ctxEval = evaluateWin(
      buildWinContext(st, "p0", "tsumo", st.round.lastDrawnTile as TileId, {
        includeUra: true,
        rules: createStandardGameFromState(st).engine.rules,
      }),
      createStandardGameFromState(st).yaku,
    );
    const hasRiichi = ctxEval!.yaku.some((y) => y.id === "riichi" || y.id === "double_riichi");
    const hasIppatsu = ctxEval!.yaku.some((y) => y.id === "ippatsu");
    const expectedBonus = ctxEval!.uraHan + (hasRiichi ? 1 : 0) + (hasIppatsu ? 1 : 0);

    const game = createStandardGameFromState(st);
    installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });
    const settled = runTsumo(game);
    const info = settled.winInfos?.find((w) => w.winner === "p0");
    expect(info).toBeDefined();
    expect(info!.extraHan).toBe(expectedBonus);
    expect(hasRiichi).toBe(true); // 리치 손인지 확인 (테스트 유효성)
  });
});

// ───────────── 다중 액티브 증강: 한 턴에 여러 발동 후보 노출 ─────────────

describe("여러 액티브 증강 동시 보유", () => {
  it("첫 턴에 suit_unify·no_retreat 둘 다 보유하면 두 발동 후보가 모두 노출된다", () => {
    const s = withAugments(
      craft({
        hands: { p0: "1111m234567p9934s", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
      "p0",
      ["suit_unify", "no_retreat"],
    );
    const game = createStandardGameFromState(s);
    installAugment(game.engine, suitUnify, "p0", { yaku: game.yaku });
    installAugment(game.engine, noRetreat, "p0", { yaku: game.yaku });

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const opts = status.prompts.find((p) => p.player === "p0")?.options ?? [];
    // 클라이언트가 액티브 메뉴로 골라 쓸 수 있도록 두 증강의 액션이 모두 프롬프트에 있다
    expect(opts.some((o) => o.type === "mono_world")).toBe(true);
    expect(opts.some((o) => o.type === "no_retreat_riichi")).toBe(true);
  });
});
