/**
 * rule_benders 그룹 테스트 — 순수 규칙/역 변경 증강 4종.
 * tanyao_break / open_kokushi / broken_wall / omni_chi
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  buildWinContext,
  createStandardGameFromState,
  decompose,
  evaluateWin,
  handIdsOf,
  handZone,
  installAugment,
  kindKey,
  kindOf,
  meldsZone,
  scoringOptionsOf,
} from "@majak/core";
import type { ActionOption } from "@majak/core";
import type { PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { tanyaoBreak } from "../src/augments/tanyao_break.js";
import { openKokushi } from "../src/augments/open_kokushi.js";
import { brokenWall } from "../src/augments/broken_wall.js";
import { brokenBorder } from "../src/augments/broken_border.js";
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

  it("1·9 포함 수패 무역 손이 보유자에겐 2판 화료가 된다 (2026-07-26: 화료 보너스를 역 판수로 흡수)", () => {
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
    expect(ev?.yaku.some((y) => y.id === "tanyao_break" && y.han === 2)).toBe(true);
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
   * 동남서(123z)를 kokushi_pon으로 후로하고, 손에는 나머지 10종 + 머리(중 2장).
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

  it("서로 다른 요구패 3장 후로 + 나머지 국사 형태면 보유자만 화료할 수 있다", () => {
    const game = createStandardGameFromState(craftOpenKokushi());
    // 미보유: 후로 국사는 화료 형태가 아니다 (kokushiMeldAssist가 꺼져 있음)
    expect(winValidate(game, "p0")).toBe("not a winning hand");

    installAugment(game.engine, openKokushi, "p0", { yaku: game.yaku });
    expect(winValidate(game, "p0")).toBeNull();
  });

  it("울어서 만든 국사도 진짜 역만으로 채점된다 (48차 무페널티)", () => {
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
    // 48차: "울면 역만이 아니라 4판" 강등을 삭제했다
    expect(ev?.yakumanCount).toBe(1);
    // 국사 외 다른 역은 붙지 않는다
    expect(ev?.yaku.map((y) => y.id)).toEqual(["kokushi_open"]);
  });

  it("kokushi_pon을 하면 국사 외의 표준형으로는 화료·텐파이가 되지 않는다", () => {
    // 동남서를 kokushi_pon한 뒤 나머지 11장이 완전한 표준형(3멘쯔+머리)인 손.
    // 예전엔 이 손이 그대로 화료로 잡혀 "69삭 양면 대기"가 오름패로 떴다.
    const state = craft({
      hands: { p0: "123m456m789m9922s", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "kokushi_pon", spec: "123z" }] },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const game = createStandardGameFromState(state);
    installAugment(game.engine, openKokushi, "p0", { yaku: game.yaku });

    // 표준형은 완성돼 있지만 화료가 아니다 — 국사만 인정된다
    expect(winValidate(game, "p0")).toBe("not a winning hand");
    expect(
      decompose(
        handIdsOf(game.engine.state, "p0").map((id) =>
          kindOf(game.engine.state, id),
        ),
        1,
        scoringOptionsOf(game.engine.state, game.engine.rules, "p0"),
      ),
    ).toEqual([]);
  });

  it("동(1z) 버림에 남서(2z3z)를 들고 있으면 kokushi_pon을 부를 수 있고 후로가 형성된다", () => {
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

    // p0에 kokushi_pon 후로(동남서)가 형성됐다
    const melds = game.engine.state.round.byPlayer["p0"]?.melds ?? [];
    const km = melds.find((m) => m.kind === "kokushi_pon");
    expect(km).toBeDefined();
    const kinds = new Set((km?.tileIds ?? []).map((id) => kindKey(kindOf(game.engine.state, id))));
    expect(kinds).toEqual(new Set(["wind1", "wind2", "wind3"]));
    // 후로 후 p0의 턴 (버림 차례)
    expect(game.engine.state.round.phase).toBe("turn.act");
    expect(game.engine.state.zones[meldsZone("p0")]?.tileIds.length).toBe(3);
  });
});

// ─────────────────────────── broken_wall ───────────────────────────

describe("broken_border (무너진 국경)", () => {
  it("혼색 슌쯔(2만3통4삭)를 포함한 손으로 화료할 수 있다 (보유자만)", () => {
    // 2m3p4s + 5m6p7s + 234p + 678s + 99p (14장, 멘젠쯔모 역으로 화료)
    const game = createStandardGameFromState(
      craft({
        hands: { p0: "25m3p6p4s7s234p678s99p", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        drawnLastFor: "p0",
      }),
    );
    expect(winValidate(game, "p0")).toBe("not a winning hand");

    installAugment(game.engine, brokenBorder, "p0", { yaku: game.yaku });
    expect(winValidate(game, "p0")).toBeNull();
    // 규칙은 보유자 전용
    expect(
      game.engine.rules.resolve<boolean>("scoring.mixedRuns", {
        playerId: "p1",
        state: game.engine.state,
      }),
    ).toBe(false);
  });

  it("혼색 멘쯔가 무늬를 요구하는 역으로 헛성립하지 않는다", () => {
    // 진짜 삼색(123m·123p·123s)이 있는 손. 증강이 없으면 삼색동순이 그대로 붙는다.
    const hand = { p0: "123m456m123p99p123s", p1: "*", p2: "*", p3: "*" } as const;
    const evalOf = (withAug: boolean) => {
      const game = createStandardGameFromState(
        craft({ hands: { ...hand }, phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" }),
      );
      if (withAug) installAugment(game.engine, brokenBorder, "p0", { yaku: game.yaku });
      const st = game.engine.state;
      return evaluateWin(
        buildWinContext(st, "p0", "tsumo", st.round.lastDrawnTile as TileId, {
          rules: game.engine.rules,
        }),
        game.yaku,
      );
    };

    // 비보유자: 삼색동순이 정상 성립한다 (순수 슌쯔 판정은 그대로 살아 있다)
    const plain = evalOf(false);
    expect(plain?.ok).toBe(true);
    expect(plain?.yaku.some((y) => y.id === "sanshoku")).toBe(true);

    // 보유자: 혼색 슌쯔 해석이 추가로 열려 분해 후보가 늘어난다.
    // 채점 엔진은 언제나 가장 비싼 해석을 고르므로 손 가치가 떨어지지는 않는다.
    // (2026-07-27부터 무너진 국경은 **슌쯔만** 연다 — 혼색 커쯔는 동수의 결속 담당이라
    //  이 손에서 커쯔 해석은 나오지 않는다.)
    const aug = evalOf(true);
    expect(aug?.ok).toBe(true);
    // 핵심: 혼색 슌쯔가 무늬 요구 역으로 **헛성립**하지는 않는다.
    // 삼색동순이 붙었다면 그건 진짜 순수 슌쯔 3개일 때뿐이다.
    // 삼색동각은 혼색 커쯔를 제 무늬로 착각하면 헛성립한다 — 절대 붙으면 안 된다
    expect(aug?.yaku.some((y) => y.id === "sanshoku_doukou")).toBe(false);
    // 그리고 해석이 바뀌어도 손 가치가 떨어지지는 않는다
    expect(aug?.han ?? 0).toBeGreaterThanOrEqual(plain?.han ?? 0);
  });
});

describe("broken_wall (부숴진 벽)", () => {
  it("8-9-1 순환 슌쯔를 포함한 손으로 화료할 수 있다 (보유자만)", () => {
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
