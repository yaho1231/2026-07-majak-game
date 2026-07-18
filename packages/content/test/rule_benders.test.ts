/**
 * rule_benders 그룹 테스트 — 순수 규칙/역 변경 증강 4종.
 * tanyao_break / open_kokushi / broken_wall / omni_chi
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  buildWinContext,
  createStandardGameFromState,
  evaluateWin,
  handZone,
  installAugment,
  kindKey,
  kindOf,
  meldsZone,
} from "@majak/core";
import type { ActionOption } from "@majak/core";
import type { PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { tanyaoBreak } from "../src/augments/tanyao_break.js";
import { openKokushi } from "../src/augments/open_kokushi.js";
import { brokenWall } from "../src/augments/broken_wall.js";
import { omniChi } from "../src/augments/omni_chi.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function winValidate(game: Game, player: PlayerId): string | null {
  const def = game.engine.actions.get("win");
  if (def === undefined) throw new Error("no win action");
  return def.validate(
    { player, type: "win", payload: {} },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

function chiValidate(
  game: Game,
  player: PlayerId,
  tileIds: [TileId, TileId],
): string | null {
  const def = game.engine.actions.get("chi");
  if (def === undefined) throw new Error("no chi action");
  return def.validate(
    { player, type: "chi", payload: { tileIds } },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

/** 손패에서 kindKey가 일치하는 첫 패의 id */
function tileIn(game: Game, player: PlayerId, key: string): TileId {
  const state = game.engine.state;
  const id = (state.zones[handZone(player)]?.tileIds ?? []).find(
    (t) => kindKey(kindOf(state, t)) === key,
  );
  if (id === undefined) throw new Error(`tile not in hand: ${key}`);
  return id;
}

// ─────────────────────────── tanyao_break ───────────────────────────

describe("tanyao_break (탕야오 해방)", () => {
  /** 수패로만 이뤄졌지만 1·9 포함 → 무역 손 (111m 암각으로 핑후도 없음) */
  function craftTerminalNoYaku() {
    return craft({
      hands: { p0: "111m234p456s678s9p", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "9p" },
    });
  }

  it("1·9 포함 수패 무역 손이 보유자에겐 1판 화료가 된다", () => {
    const game = createStandardGameFromState(craftTerminalNoYaku());
    expect(winValidate(game, "p0")).toBe("no yaku");

    installAugment(game.engine, tanyaoBreak, "p0", { yaku: game.yaku });
    expect(winValidate(game, "p0")).toBeNull();

    const state = game.engine.state;
    const ev = evaluateWin(
      buildWinContext(state, "p0", "ron", state.round.lastDiscard?.tileId as TileId, {
        rules: game.engine.rules,
      }),
      game.yaku,
    );
    expect(ev?.yaku.some((y) => y.id === "tanyao_break" && y.han === 1)).toBe(true);
  });

  it("진짜 탕야오와 중복되지 않고, 자패가 있으면 성립하지 않는다", () => {
    // 진짜 탕야오 손 (1·9 없음) → tanyao만 붙고 tanyao_break는 안 붙는다
    const tanyaoGame = createStandardGameFromState(
      craft({
        hands: { p0: "234m345p345s678s5s", p1: "*", p2: "*", p3: "*" },
        phase: "reaction",
        turnSeat: 1,
        lastDiscard: { player: "p1", spec: "5s" },
      }),
    );
    installAugment(tanyaoGame.engine, tanyaoBreak, "p0", { yaku: tanyaoGame.yaku });
    const st = tanyaoGame.engine.state;
    const ev = evaluateWin(
      buildWinContext(st, "p0", "ron", st.round.lastDiscard?.tileId as TileId, {
        rules: tanyaoGame.engine.rules,
      }),
      tanyaoGame.yaku,
    );
    expect(ev?.yaku.some((y) => y.id === "tanyao")).toBe(true);
    expect(ev?.yaku.some((y) => y.id === "tanyao_break")).toBe(false);

    // 자패(1z 작두) 포함 손은 보유자여도 여전히 무역
    const honorGame = createStandardGameFromState(
      craft({
        hands: { p0: "111m234p456s678s1z", p1: "*", p2: "*", p3: "*" },
        phase: "reaction",
        turnSeat: 1,
        lastDiscard: { player: "p1", spec: "1z" },
      }),
    );
    installAugment(honorGame.engine, tanyaoBreak, "p0", { yaku: honorGame.yaku });
    expect(winValidate(honorGame, "p0")).toBe("no yaku");
  });

  it("보유자가 아닌 화료자에게는 성립하지 않는다", () => {
    const game = createStandardGameFromState(
      craft({
        hands: { p0: "*", p1: "111m234p456s678s9p", p2: "*", p3: "*" },
        phase: "reaction",
        turnSeat: 2,
        lastDiscard: { player: "p2", spec: "9p" },
      }),
    );
    installAugment(game.engine, tanyaoBreak, "p0", { yaku: game.yaku });
    expect(winValidate(game, "p1")).toBe("no yaku");
  });
});

// ─────────────────────────── open_kokushi ───────────────────────────

describe("open_kokushi (우는 국사무쌍)", () => {
  /**
   * 동남서(123z)를 kokushi_pon으로 부로하고, 손에는 나머지 10종 + 머리(중 2장).
   * 손: 1m9m1p9p1s9s + 北(4z) + 백발중(567z) + 중(7z, 머리·마지막 쯔모).
   */
  function craftOpenKokushi() {
    return craft({
      hands: { p0: "19m19p19s4z5677z", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "kokushi_pon", spec: "123z" }] },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
  }

  it("서로 다른 요구패 3장 부로 + 나머지 국사 형태면 보유자만 화료할 수 있다", () => {
    const game = createStandardGameFromState(craftOpenKokushi());
    // 미보유: 부로 국사는 화료 형태가 아니다 (kokushiMeldAssist가 꺼져 있음)
    expect(winValidate(game, "p0")).toBe("not a winning hand");

    installAugment(game.engine, openKokushi, "p0", { yaku: game.yaku });
    expect(winValidate(game, "p0")).toBeNull();
  });

  it("역만이 아니라 3판(kokushi_open)으로 채점된다", () => {
    const game = createStandardGameFromState(craftOpenKokushi());
    installAugment(game.engine, openKokushi, "p0", { yaku: game.yaku });
    const st = game.engine.state;
    const ev = evaluateWin(
      buildWinContext(st, "p0", "tsumo", st.round.lastDrawnTile as TileId, {
        rules: game.engine.rules,
      }),
      game.yaku,
    );
    expect(ev?.ok).toBe(true);
    expect(ev?.yakumanCount).toBe(0); // 역만 아님
    expect(ev?.yaku.find((y) => y.id === "kokushi_open")?.han).toBe(3);
    // 국사 외 다른 역은 붙지 않는다
    expect(ev?.yaku.map((y) => y.id)).toEqual(["kokushi_open"]);
  });

  it("동(1z) 버림에 남서(2z3z)를 들고 있으면 kokushi_pon을 부를 수 있고 부로가 형성된다", () => {
    // p1이 동(1z)을 버린 리액션 상황. p0는 손에 남(2z)·서(3z)를 들고 있다.
    const base = craft({
      hands: {
        p0: "19m19p23z567z9s", // 남·서 포함 (동을 부르면 동남서 묶음)
        p1: "*",
        p2: "234m567p234s", // 동 페어 없음 → 펑 불가
        p3: "234m567p234s",
      },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "1z" },
    });
    // 실게임에선 드래프트가 player.augments에 넣는다 — 액션 validate가 이를 본다
    const withAug = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: [...p.augments, "open_kokushi"] } : p,
      ),
    };
    const game = createStandardGameFromState(withAug);
    installAugment(game.engine, openKokushi, "p0", { yaku: game.yaku });

    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting reaction");
    // p0 프롬프트에 kokushi_pon 후보가 있다
    const p0prompt = status.prompts.find((p) => p.player === "p0");
    expect(p0prompt?.options.some((o) => o.type === "kokushi_pon")).toBe(true);

    // 모든 프롬프트 처리: p0는 kokushi_pon, 나머지는 pass
    for (const prompt of status.prompts) {
      const opt =
        prompt.player === "p0"
          ? (prompt.options.find((o) => o.type === "kokushi_pon") as ActionOption)
          : (prompt.options.find((o) => o.type === "pass") as ActionOption);
      status = flow.submit(prompt.player, opt);
    }

    // p0에 kokushi_pon 부로(동남서)가 형성됐다
    const melds = game.engine.state.round.byPlayer["p0"]?.melds ?? [];
    const km = melds.find((m) => m.kind === "kokushi_pon");
    expect(km).toBeDefined();
    const kinds = new Set((km?.tileIds ?? []).map((id) => kindKey(kindOf(game.engine.state, id))));
    expect(kinds).toEqual(new Set(["wind1", "wind2", "wind3"]));
    // 부로 후 p0의 턴 (버림 차례)
    expect(game.engine.state.round.phase).toBe("turn.act");
    expect(game.engine.state.zones[meldsZone("p0")]?.tileIds.length).toBe(3);
  });
});

// ─────────────────────────── broken_wall ───────────────────────────

describe("broken_wall (부숴진 벽)", () => {
  it("8-9-1 순환 순자를 포함한 손으로 화료할 수 있다 (보유자만)", () => {
    // 891m + 234p + 456s + 678s + 99p (14장, 멘젠쯔모 역으로 화료)
    const game = createStandardGameFromState(
      craft({
        hands: { p0: "891m234p456s678s99p", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
    );
    expect(winValidate(game, "p0")).toBe("not a winning hand");

    installAugment(game.engine, brokenWall, "p0", { yaku: game.yaku });
    expect(winValidate(game, "p0")).toBeNull();
    // 규칙은 보유자 전용
    expect(
      game.engine.rules.resolve<boolean>("scoring.wrapRuns", {
        playerId: "p1",
        state: game.engine.state,
      }),
    ).toBe(false);
  });

  it("8m9m을 들고 상가의 1m을 순환 치할 수 있다", () => {
    const game = createStandardGameFromState(
      craft({
        hands: { p0: "89m123p456p789s22z", p1: "*", p2: "*", p3: "*" },
        phase: "reaction",
        turnSeat: 3,
        lastDiscard: { player: "p3", spec: "1m" }, // p3 = p0의 상가
      }),
    );
    const pair: [TileId, TileId] = [
      tileIn(game, "p0", "man8"),
      tileIn(game, "p0", "man9"),
    ];
    expect(chiValidate(game, "p0", pair)).toBe("tiles cannot form a run");

    installAugment(game.engine, brokenWall, "p0", { yaku: game.yaku });
    expect(chiValidate(game, "p0", pair)).toBeNull();
  });
});

// ─────────────────────────── omni_chi ───────────────────────────

describe("omni_chi (사방치기)", () => {
  it("대면의 버림패도 치할 수 있다", () => {
    const game = createStandardGameFromState(
      craft({
        hands: { p0: "23m456p789p123s99s", p1: "*", p2: "*", p3: "*" },
        phase: "reaction",
        turnSeat: 2,
        lastDiscard: { player: "p2", spec: "4m" }, // p2 = p0의 대면
      }),
    );
    const pair: [TileId, TileId] = [
      tileIn(game, "p0", "man2"),
      tileIn(game, "p0", "man3"),
    ];
    expect(chiValidate(game, "p0", pair)).toBe(
      "chi is only allowed from the left player",
    );

    installAugment(game.engine, omniChi, "p0", { yaku: game.yaku });
    expect(chiValidate(game, "p0", pair)).toBeNull();
    // 규칙은 보유자 전용
    expect(
      game.engine.rules.resolve<boolean>("call.chi.fromAnyone", {
        playerId: "p1",
        state: game.engine.state,
      }),
    ).toBe(false);
  });
});
