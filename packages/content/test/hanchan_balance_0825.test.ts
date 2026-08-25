/**
 * 반장전 밸런스 QA (2026-08-25) — 이 감사에서 바뀐 증강들의 회귀 테스트.
 *
 * 배경: 증강 밸런스가 대체로 **동풍전(4국)** 기준으로 잡혀 있어서, 국이 두 배인
 * 반장전(8국)에서 배수가 세 갈래로 갈라졌다 — 매치 예산형은 1.5배(`scaledUses`),
 * 국 스코프·상시형은 2.0배, 게임당 고정·1국 한정형은 1.0배(= 상대적으로 절반).
 * 감사 전문은 `docs/qa-hanchan/00_SUMMARY.md`.
 *
 * 여기서 지키는 것은 **모드에 따라 달라져야 하는 값**과, 국 단위 쿨다운으로 옮겨
 * **국당 밀도를 두 모드에서 같게** 만든 증강들이다.
 */

import { describe, expect, it } from "vitest";
import {
  DEAD_WALL,
  FlowController,
  ROUND_STARTED,
  createStandardGameFromState,
  handZone,
  installAugment,
} from "@majak/core";
import type { ActionOption, GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { deadWallMaster } from "../src/augments/dead_wall_master.js";
import { blindRon } from "../src/augments/blind_ron.js";
import { timePressure } from "../src/augments/time_pressure.js";
import { signFlip } from "../src/augments/sign_flip.js";
import { invincible } from "../src/augments/invincible.js";
import { cliffBloom } from "../src/augments/cliff_bloom.js";
import { foresight } from "../src/augments/foresight.js";
import { armedNow, counterOf, preArmSpent, scaledUses } from "../src/util.js";
import type { AugmentDef } from "@majak/core";

type Game = ReturnType<typeof createStandardGameFromState>;

/** 크래프트 상태에 보유 증강을 직접 주입한다 (드래프트 이벤트 생략) */
function withAugments(state: GameState, pid: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === pid ? { ...p, augments: [...p.augments, ...ids] } : p,
    ),
  };
}

/** 이벤트를 그대로 흘려 넣는 테스트 전용 액션 (ROUND_STARTED 흉내) */
function emit(game: Game, event: { type: string; payload: unknown }): void {
  if (!game.engine.actions.has("__test_emit")) {
    game.engine.actions.register({
      type: "__test_emit",
      validate: () => null,
      toEvents: (req) => [req.payload as { type: string; payload: unknown }],
    });
  }
  const res = game.engine.submit({ player: "p0", type: "__test_emit", payload: event });
  if (!res.ok) throw new Error(`emit failed: ${res.reason}`);
}

const optionsFor = (
  status: ReturnType<FlowController["begin"]>,
  player: PlayerId,
): ActionOption[] =>
  status.kind === "awaiting"
    ? (status.prompts.find((p) => p.player === player)?.options ?? [])
    : [];

// ───────────────── 왕패의 주인 — 매 국 2회 → 2국에 1회(최대 2장) ─────────────────

describe("dead_wall_master (왕패의 주인) — 2국에 1회", () => {
  function firstTurnState(): GameState {
    const base = craft({
      hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      seed: 5,
    });
    return withAugments(base, "p0", ["dead_wall_master"]);
  }

  function setup(): { game: Game; flow: FlowController } {
    const game = createStandardGameFromState(firstTurnState());
    installAugment(game.engine, deadWallMaster, "p0", { yaku: game.yaku });
    return { game, flow: new FlowController(game.engine) };
  }

  /** 지금 이 상태에서 dw_swap 후보가 뜨는가 */
  const canSwapNow = (flow: FlowController): boolean =>
    optionsFor(flow.begin(), "p0").some((o) => o.type === "dw_swap");

  /** 왕패 자리 하나를 손패 첫 장과 바꾼다 */
  function swapOnce(game: Game, flow: FlowController): void {
    const opt = optionsFor(flow.begin(), "p0").find((o) => o.type === "dw_swap");
    expect(opt).toBeDefined();
    flow.submit("p0", opt!);
    expect(game.engine.state.zones[DEAD_WALL]?.tileIds).toHaveLength(14);
  }

  it("한 번의 발동에서 2장까지 이어서 바꿀 수 있다 (두 번째 장은 쿨다운에 막히지 않는다)", () => {
    const { game, flow } = setup();
    swapOnce(game, flow);
    // 첫 장에서 쿨다운이 찍혔지만 같은 창의 두 번째 장은 그대로 열려 있어야 한다
    expect(canSwapNow(flow)).toBe(true);
    swapOnce(game, flow);
    expect(canSwapNow(flow)).toBe(false);
    expect(game.engine.state.zones[handZone("p0")]?.tileIds).toHaveLength(14);
  });

  it("1장만 바꾸고 끝내도 그 국은 쓴 것으로 친다 (장수는 플레이어가 고른다)", () => {
    const { game, flow } = setup();
    swapOnce(game, flow);
    emit(game, { type: ROUND_STARTED, payload: {} });
    // 다음 국은 쉰다 — 한 장만 썼어도 발동은 한 번이다
    expect(canSwapNow(flow)).toBe(false);
  });

  it("발동한 다음 국은 쉬고, 그다음 국에 다시 열린다", () => {
    const { game, flow } = setup();
    expect(canSwapNow(flow)).toBe(true);
    swapOnce(game, flow);

    emit(game, { type: ROUND_STARTED, payload: {} });
    expect(canSwapNow(flow)).toBe(false);

    emit(game, { type: ROUND_STARTED, payload: {} });
    expect(canSwapNow(flow)).toBe(true);
  });

  it("쿨다운 중에는 남은 교환 횟수 표시도 0이다 (버튼 없는데 '2회 남음'이 뜨지 않는다)", () => {
    const { game, flow } = setup();
    swapOnce(game, flow);
    emit(game, { type: ROUND_STARTED, payload: {} });
    const key = "view:p0:dead_wall_master:remaining:p0#round";
    expect(game.engine.state.augmentData[key] ?? 0).toBe(0);
  });
});

// ─────────── 선발동형 재무장 — 반장전 한정 게임 내 1회 (blind_ron·time_pressure·sign_flip) ───────────

describe("선발동형 재무장 — 반장전에서만 게임 내 1회", () => {
  const trio: { def: AugmentDef; id: string }[] = [
    { def: blindRon, id: "blind_ron" },
    { def: timePressure, id: "time_pressure" },
    { def: signFlip, id: "sign_flip" },
  ];

  function setup(
    def: AugmentDef,
    id: string,
    mode: "tonpuu" | "hanchan",
  ): { game: Game; flow: FlowController } {
    const base = craft({
      hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      seed: 5,
    });
    const state = withAugments(
      { ...base, config: { ...base.config, mode } },
      "p0",
      [id],
    );
    const game = createStandardGameFromState(state);
    installAugment(game.engine, def, "p0", { yaku: game.yaku });
    return { game, flow: new FlowController(game.engine) };
  }

  const rechargeOption = (flow: FlowController, id: string): boolean =>
    optionsFor(flow.begin(), "p0").some((o) => o.type === `${id}_recharge`);

  /** 켜진 국을 한 번 흘려보내 «다 타 버린» 상태로 만든다 */
  function burn(game: Game): void {
    emit(game, { type: ROUND_STARTED, payload: {} }); // 켜진다
    emit(game, { type: ROUND_STARTED, payload: {} }); // 그 국이 지나갔다 → spent
  }

  for (const { def, id } of trio) {
    it(`${id}: 반장전에서 다 탄 뒤에 재장전 버튼이 열린다`, () => {
      const { game, flow } = setup(def, id, "hanchan");
      // 아직 타는 중인 국에는 버튼이 없다 (한 번을 그냥 버리게 된다)
      emit(game, { type: ROUND_STARTED, payload: {} });
      expect(armedNow(game.engine.state, id, "p0")).toBe(true);
      expect(rechargeOption(flow, id)).toBe(false);

      emit(game, { type: ROUND_STARTED, payload: {} });
      expect(preArmSpent(game.engine.state, id, "p0")).toBe(true);
      expect(rechargeOption(flow, id)).toBe(true);
    });

    it(`${id}: 재장전하면 다음 국에 다시 켜지고, 두 번째 재장전은 없다`, () => {
      const { game, flow } = setup(def, id, "hanchan");
      burn(game);

      const opt = optionsFor(flow.begin(), "p0").find(
        (o) => o.type === `${id}_recharge`,
      );
      expect(opt).toBeDefined();
      flow.submit("p0", opt!);
      // 누른 자리에서 바로 켜지지는 않는다 — 다음 국이다
      expect(armedNow(game.engine.state, id, "p0")).toBe(false);

      emit(game, { type: ROUND_STARTED, payload: {} });
      expect(armedNow(game.engine.state, id, "p0")).toBe(true);

      // 그 국이 지나가 다시 소진돼도, 게임 내 1회라 버튼은 열리지 않는다
      emit(game, { type: ROUND_STARTED, payload: {} });
      expect(preArmSpent(game.engine.state, id, "p0")).toBe(true);
      expect(rechargeOption(flow, id)).toBe(false);
    });

    it(`${id}: 동풍전에는 재장전 버튼이 아예 없다 (기준선 그대로)`, () => {
      const { game, flow } = setup(def, id, "tonpuu");
      burn(game);
      expect(preArmSpent(game.engine.state, id, "p0")).toBe(true);
      expect(rechargeOption(flow, id)).toBe(false);
    });
  }
});

// ───────────── 천하무적 — 쿨다운이 모드를 따라간다 (동풍 2국 · 반장 3국) ─────────────

describe("invincible (천하무적) — 쿨다운은 모드를 따라간다", () => {
  function setup(mode: "tonpuu" | "hanchan"): { game: Game; flow: FlowController } {
    const base = craft({
      hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      seed: 5,
    });
    const state = withAugments(
      { ...base, config: { ...base.config, mode } },
      "p0",
      ["invincible"],
    );
    const game = createStandardGameFromState(state);
    installAugment(game.engine, invincible, "p0", { yaku: game.yaku });
    return { game, flow: new FlowController(game.engine) };
  }

  it("동풍전은 2국 그대로 (기준선을 건드리지 않는다)", () => {
    const { game, flow } = setup("tonpuu");
    const opt = optionsFor(flow.begin(), "p0").find((o) => o.type === "invincible_guard");
    expect(opt).toBeDefined();
    flow.submit("p0", opt!);
    expect(game.engine.state.augmentData["invincible:cd:p0"]).toBe(2);
  });

  it("반장전은 3국으로 늘어난다 (국이 두 배라 발동 총량이 2배였다)", () => {
    const { game, flow } = setup("hanchan");
    const opt = optionsFor(flow.begin(), "p0").find((o) => o.type === "invincible_guard");
    expect(opt).toBeDefined();
    flow.submit("p0", opt!);
    expect(game.engine.state.augmentData["invincible:cd:p0"]).toBe(3);
    // 잔여 쿨다운 표시도 같은 값이어야 한다 (이름표의 🕐N국 칩)
    expect(game.engine.state.augmentData["view:p0:cooldown:invincible"]).toBe(3);
  });
});

// ───────────── 만개·+2판 라이더 — 매치 예산이 모드를 따라간다 ─────────────

describe("매치 예산이 모드를 따라간다 (scaledUses)", () => {
  /** state 없이도 예산 함수가 두 모드에서 갈리는지 — 상한 자체를 못박는다 */
  const budgetIn = (mode: "tonpuu" | "hanchan", n: number): number => {
    const base = craft({
      hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      seed: 1,
    });
    return scaledUses({ ...base, config: { ...base.config, mode } }, n);
  };

  it("cliff_bloom 만개: 동풍전 1회 · 반장전 2회", () => {
    expect(budgetIn("tonpuu", 1)).toBe(1);
    expect(budgetIn("hanchan", 1)).toBe(2);
    // 문구가 곧 계약이다 — 카드에 적힌 수와 예산이 같아야 한다
    expect(cliffBloom.description).toContain("동풍전 1회");
    expect(cliffBloom.description).toContain("반장전 2회");
  });

  it("foresight +2판 라이더: 동풍전 2회 · 반장전 3회", () => {
    expect(budgetIn("tonpuu", 2)).toBe(2);
    expect(budgetIn("hanchan", 2)).toBe(3);
    expect(foresight.description).toContain("동풍전 2회");
    expect(foresight.description).toContain("반장전 3회");
  });

  it("만개 예산은 매치 스코프다 — 국이 바뀌어도 카운터가 남는다", () => {
    const base = craft({
      hands: { p0: "234m345p456s678s22s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
      seed: 5,
    });
    const game = createStandardGameFromState(
      withAugments(base, "p0", ["cliff_bloom"]),
    );
    installAugment(game.engine, cliffBloom, "p0", { yaku: game.yaku });
    // 한 번 만개한 것으로 표시해 두고 국을 넘긴다
    game.engine.state.augmentData["cliff_bloom:blooms:p0"] = 1;
    emit(game, { type: ROUND_STARTED, payload: {} });
    expect(counterOf(game.engine.state, "cliff_bloom:blooms:p0")).toBe(1);
  });
});
