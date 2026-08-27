/**
 * 바람의 계보 (wind_lineage) — 자패 슌쯔.
 *  1. decompose 계약: honorRuns 옵션이 동남서·남서북·백발중을 슌쯔로 인정한다.
 *  2. 증강 계약: 보유자에게 scoring.honorRuns가 켜지고, 실제 대기 계산에 반영된다.
 *  3. 삼색동순·일기통관 같은 무늬 요구 역이 자패 슌쯔에 헛성립하지 않는다.
 *  4. **치(후로)** — 손 안에서만 슌쯔가 되고 울 수는 없으면 반쪽짜리 규칙이다.
 *     동남서·남서북·백발중을 상가(카미차) 버림에서 칠 수 있어야 한다.
 *  5. 동남서북 깡을 커쯔로 오인하지 않는다 — 깡 카운트(스깡즈)는 세되
 *     사희·스안커처럼 **커쯔를 요구하는 역**은 붙지 않는다 (meldToSet 규약).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  buildWinContext,
  createStandardGameFromState,
  evaluateWin,
  installAugment,
  kindKey,
  kindOf,
  scoringOptionsOf,
  winningKinds,
} from "@majak/core";
import type { ActionOption, GameState, PlayerId, TileId } from "@majak/core";
import { craft, h } from "./helpers.js";
import { windLineage } from "../src/augments/wind_lineage.js";

const P9 = kindKey({ suit: "pin", rank: 9 });

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

describe("바람의 계보 — decompose 계약", () => {
  // 동남서(1z2z3z) + 백발중(5z6z7z) + 123m + 456m + 9p → 9p 단기 텐파이 (자패 슌쯔 2개)
  const hand13 = h("1z2z3z5z6z7z123m456m9p");

  it("honorRuns면 자패 슌쯔로 텐파이가 잡힌다 (9p 대기)", () => {
    const waits = winningKinds(hand13, 0, undefined, { honorRuns: true }).map(kindKey);
    expect(waits).toContain(P9);
  });

  it("honorRuns가 없으면 같은 손이 텐파이가 아니다", () => {
    const waits = winningKinds(hand13, 0, undefined, {});
    expect(waits.length).toBe(0);
  });

  it("남서북(2z3z4z)도 슌쯔다", () => {
    // 남서북 + 백발중 + 123m + 456m + 9p 대기
    const hand = h("2z3z4z5z6z7z123m456m9p");
    const waits = winningKinds(hand, 0, undefined, { honorRuns: true }).map(kindKey);
    expect(waits).toContain(P9);
  });
});

describe("바람의 계보 — 증강 계약", () => {
  it("보유자에게 scoring.honorRuns가 켜지고 대기 계산에 반영된다", () => {
    const base = craft({
      hands: { p0: "1z2z3z5z6z7z123m456m9p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(withAug(base, "p0", ["wind_lineage"]));
    installAugment(game.engine, windLineage, "p0", { yaku: game.yaku });

    expect(
      game.engine.rules.resolve<boolean>("scoring.honorRuns", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toBe(true);
    // 타가에게는 꺼져 있다
    expect(
      game.engine.rules.resolve<boolean>("scoring.honorRuns", {
        playerId: "p1",
        state: game.engine.state,
      }),
    ).toBe(false);

    // scoringOptionsOf가 옵션에 honorRuns를 실어, 보유자 손이 텐파이로 잡힌다
    const opts = scoringOptionsOf(game.engine.state, game.engine.rules, "p0");
    const waits = winningKinds(h("1z2z3z5z6z7z123m456m9p"), 0, undefined, opts).map(kindKey);
    expect(waits).toContain(P9);
  });
});

describe("바람의 계보 — 자패 치", () => {
  /**
   * p3(= p0의 상가)이 자패를 버린 반응 국면. p0은 그 자패와 이어지는 두 장을 들고 있다.
   * 치는 상가 버림에서만 되므로 버린 사람은 반드시 seat 3이다.
   */
  function chiScene(hold: string, discarded: string, withLineage = true): GameState {
    const base = craft({
      hands: { p0: `${hold}234p567p234s99s`, p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 3,
      lastDiscard: { player: "p3", spec: discarded },
    });
    return withLineage ? withAug(base, "p0", ["wind_lineage"]) : base;
  }

  function chiOptions(game: ReturnType<typeof createStandardGameFromState>): ActionOption[] {
    const status = new FlowController(game.engine).begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting reaction");
    const p0 = status.prompts.find((p) => p.player === "p0");
    return (p0?.options ?? []).filter((o) => o.type === "chi");
  }

  function gameOf(state: GameState): ReturnType<typeof createStandardGameFromState> {
    const game = createStandardGameFromState(state);
    if (state.players.some((p) => p.augments.includes("wind_lineage"))) {
      installAugment(game.engine, windLineage, "p0", { yaku: game.yaku });
    }
    return game;
  }

  const CASES: { name: string; hold: string; discarded: string; meld: string[] }[] = [
    { name: "백발중", hold: "67z", discarded: "5z", meld: ["dragon1", "dragon2", "dragon3"] },
    { name: "동남서", hold: "23z", discarded: "1z", meld: ["wind1", "wind2", "wind3"] },
    { name: "남서북", hold: "34z", discarded: "2z", meld: ["wind2", "wind3", "wind4"] },
  ];

  for (const c of CASES) {
    it(`${c.name}을 칠 수 있다`, () => {
      const game = gameOf(chiScene(c.hold, c.discarded));
      const chis = chiOptions(game);
      expect(chis.length).toBeGreaterThan(0);

      const flow = new FlowController(game.engine);
      const status = flow.begin();
      if (status.kind !== "awaiting") throw new Error("awaiting");
      flow.submit("p0", chis[0] as ActionOption);

      const melds = game.engine.state.round.byPlayer["p0"]?.melds ?? [];
      const chi = melds.find((m) => m.kind === "chi");
      expect(chi).toBeDefined();
      const kinds = (chi?.tileIds ?? [])
        .map((id) => kindKey(kindOf(game.engine.state, id)))
        .sort();
      expect(kinds).toEqual(c.meld);
    });

    it(`${c.name}: 보유하지 않으면 칠 수 없다 (대조군)`, () => {
      const game = gameOf(chiScene(c.hold, c.discarded, false));
      expect(chiOptions(game)).toHaveLength(0);
    });
  }

  it("무늬가 다른 자패(북+백)는 이어지지 않는다", () => {
    // 4z(북) + 5z(백)을 들고 6z(발) 버림 — 바람과 삼원은 별개 계열이라 슌쯔가 아니다
    const game = gameOf(chiScene("45z", "6z"));
    const chis = chiOptions(game);
    // 발(6z)로 만들 수 있는 삼원 슌쯔는 5z6z7z뿐인데 7z가 없다
    expect(chis).toHaveLength(0);
  });

  it("삼원은 rank 3(중)을 넘어가지 않는다", () => {
    // 발·중(6z7z)을 들고 있어도 '중 다음'은 없다 — 백(5z)이 와야만 성립한다.
    // 여기서는 중(7z)이 버려졌고 손에 5z6z가 없으므로 후보가 없어야 한다.
    const game = gameOf(chiScene("46z", "7z"));
    expect(chiOptions(game)).toHaveLength(0);
  });
});

describe("바람의 계보 — 동남서북 깡", () => {
  /** p0 손에 동남서북(1z2z3z4z) + 표준 수패. drawnLastFor로 자기 턴(14장). */
  function fourWindScene(withLineage: boolean): GameState {
    const base = craft({
      // 1z2z3z4z(동남서북) + 123456789m + 1p = 14장
      hands: { p0: "1z2z3z4z123456789m1p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    return withLineage ? withAug(base, "p0", ["wind_lineage"]) : base;
  }

  function ankanOptions(game: ReturnType<typeof createStandardGameFromState>): ActionOption[] {
    const status = new FlowController(game.engine).begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const p0 = status.prompts.find((p) => p.player === "p0");
    return (p0?.options ?? []).filter((o) => o.type === "ankan");
  }

  it("바람의 계보 보유자는 동남서북을 안깡으로 낼 수 있다", () => {
    const game = createStandardGameFromState(fourWindScene(true));
    installAugment(game.engine, windLineage, "p0", { yaku: game.yaku });
    const ankans = ankanOptions(game);
    // 네 바람 각 1장을 담은 안깡 후보가 있다
    const fourWind = ankans.find((o) => {
      const ids = (o.payload as { tileIds: number[] }).tileIds;
      const ranks = ids
        .map((id) => kindOf(game.engine.state, id))
        .filter((k) => k.suit === "wind")
        .map((k) => k.rank)
        .sort();
      return ids.length === 4 && ranks.join(",") === "1,2,3,4";
    });
    expect(fourWind).toBeDefined();
  });

  it("보유하지 않으면 동남서북 안깡 후보가 없다 (대조군)", () => {
    const game = createStandardGameFromState(fourWindScene(false));
    // wind_lineage 미설치 → honorRuns 꺼짐
    expect(ankanOptions(game)).toHaveLength(0);
  });

  it("동남서북 안깡을 제출하면 깡이 형성되고 크래시하지 않는다", () => {
    const game = createStandardGameFromState(fourWindScene(true));
    installAugment(game.engine, windLineage, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("awaiting");
    const opt = (status.prompts.find((p) => p.player === "p0")?.options ?? []).find(
      (o) => o.type === "ankan",
    );
    expect(opt).toBeDefined();
    flow.submit("p0", opt!);
    // 깡 멜드가 생겼다 (kan_closed, 네 바람)
    const melds = game.engine.state.round.byPlayer["p0"]?.melds ?? [];
    const kan = melds.find((m) => m.kind === "kan_closed");
    expect(kan).toBeDefined();
    const kanRanks = (kan?.tileIds ?? [])
      .map((id) => kindOf(game.engine.state, id))
      .map((k) => `${k.suit}${k.rank}`)
      .sort();
    expect(kanRanks).toEqual(["wind1", "wind2", "wind3", "wind4"]);
  });
});

describe("바람의 계보 — 동남서북 깡 ×4 화료의 역", () => {
  /**
   * 극단 케이스: 바람 16장을 전부 모아 동남서북 깡을 넷 만들고 백을 머리로 화료.
   * 동남서북 깡은 커쯔가 아니라 **슌쯔성 몸통**(meldToSet)이므로,
   * 깡 수를 세는 스깡즈는 붙고 커쯔를 요구하는 대사희·스안커는 붙지 않는다.
   */
  function fourKanWin(): ReturnType<typeof createStandardGameFromState> {
    const base = craft({
      // 손패는 머리 백백(5z)뿐 — 나머지는 안깡 4묶음
      hands: { p0: "55z", p1: "*", p2: "*", p3: "*" },
      melds: {
        p0: Array.from({ length: 4 }, () => ({ kind: "kan_closed" as const, spec: "1234z" })),
      },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(withAug(base, "p0", ["wind_lineage"]));
    installAugment(game.engine, windLineage, "p0", { yaku: game.yaku });
    return game;
  }

  function yakuIdsOfFourKanWin(): string[] {
    const game = fourKanWin();
    const st = game.engine.state;
    const winTile = (st.zones["hand:p0"]?.tileIds ?? []).at(-1) as TileId;
    const ctx = buildWinContext(st, "p0", "tsumo", winTile, { rules: game.engine.rules });
    return (evaluateWin(ctx, game.yaku)?.yaku ?? []).map((y) => y.id).sort();
  }

  it("스깡즈와 자일색이 붙는다 (더블 역만)", () => {
    expect(yakuIdsOfFourKanWin()).toEqual(["suukantsu", "tsuuiisou"]);
  });

  it("대사희·소사희·스안커는 붙지 않는다 (커쯔가 아니라 슌쯔성 몸통)", () => {
    const ids = yakuIdsOfFourKanWin();
    expect(ids).not.toContain("daisuushii");
    expect(ids).not.toContain("shousuushii");
    expect(ids).not.toContain("suuankou");
  });
});

describe("바람의 계보 — 바람 슌쯔에 낀 역패 (2026-08-12 상향)", () => {
  /**
   * 동남서를 몸통으로 쓴 손. 동1국·동가면 장풍(동)과 자풍(동)이 모두 그 슌쯔 안에 있다.
   * 표준 역패는 커쯔만 보므로, 이 판수는 계보가 등록한 두 역이 만든다.
   */
  function winWith(handSpec: string): string[] {
    const base = craft({
      hands: { p0: handSpec, p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(withAug(base, "p0", ["wind_lineage"]));
    installAugment(game.engine, windLineage, "p0", { yaku: game.yaku });
    const st = game.engine.state;
    const winTile = (st.zones["hand:p0"]?.tileIds ?? []).at(-1) as TileId;
    const ctx = buildWinContext(st, "p0", "tsumo", winTile, { rules: game.engine.rules });
    return (evaluateWin(ctx, game.yaku)?.yaku ?? []).map((y) => y.id);
  }

  it("동가·동장의 동남서는 자풍·장풍 두 판이 붙는다", () => {
    const ids = winWith("1z2z3z123m456m789m99p");
    expect(ids).toContain("wind_lineage_seat");
    expect(ids).toContain("wind_lineage_prevalent");
  });

  it("남서북에는 붙지 않는다 (동가·동장이라 동이 없다)", () => {
    const ids = winWith("2z3z4z123m456m789m99p");
    expect(ids).not.toContain("wind_lineage_seat");
    expect(ids).not.toContain("wind_lineage_prevalent");
  });

  it("백발중(삼원 슌쯔) 몸통 하나는 1판이다 — 바람 쪽 역은 붙지 않는다", () => {
    const ids = winWith("5z6z7z123m456m789m99p");
    // 삼원패 셋이 모두 역패지만 장수를 세지 않고 몸통 하나에 1판이다
    // (몸통이 둘이면 2판 — 아래 "몸통마다 1판" 블록이 따로 못박는다)
    expect(ids.filter((id) => id === "wind_lineage_dragon")).toHaveLength(1);
    expect(ids).not.toContain("wind_lineage_seat");
    expect(ids).not.toContain("wind_lineage_prevalent");
  });

  it("바람 슌쯔에는 삼원 역이 붙지 않는다 (대조군)", () => {
    expect(winWith("1z2z3z123m456m789m99p")).not.toContain("wind_lineage_dragon");
  });
});

describe("바람의 계보 — 동남서북 깡의 북(北)도 역패로 센다 (QA 2026-08-20)", () => {
  /**
   * 동남서북 깡의 **채점 대표 3장**은 동·남·서다(WinContext.meldToSet).
   * 대표만 훑던 windRunHas 때문에 북가·북장만 같은 깡을 하고도 1판을 못 받았다 —
   * 자리에 따라 값이 갈리던 자리다(qa-lab shape 확정 3).
   */
  function kanWinYaku(seatWind: number, prevalentWind: number): string[] {
    const base = craft({
      hands: { p0: "123m456p789s11p", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "kan_closed" as const, spec: "1234z" }] },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(withAug(base, "p0", ["wind_lineage"]));
    installAugment(game.engine, windLineage, "p0", { yaku: game.yaku });
    const st = game.engine.state;
    const winTile = (st.zones["hand:p0"]?.tileIds ?? []).at(-1) as TileId;
    const ctx = buildWinContext(st, "p0", "tsumo", winTile, { rules: game.engine.rules });
    return (
      evaluateWin({ ...ctx, seatWind, prevalentWind }, game.yaku)?.yaku ?? []
    ).map((y) => y.id);
  }

  for (const [name, rank] of [["동", 1], ["남", 2], ["서", 3], ["북", 4]] as const) {
    it(`자풍이 ${name}이어도 계보 자풍역이 붙는다`, () => {
      expect(kanWinYaku(rank, 1)).toContain("wind_lineage_seat");
    });
  }

  it("장풍이 북(서입 이후)이어도 계보 장풍역이 붙는다", () => {
    expect(kanWinYaku(1, 4)).toContain("wind_lineage_prevalent");
  });

  /**
   * 문안 회귀 (2026-08-27): detail이 "자풍과 장풍이 같으면 그 한 장에 2판"(더블 동과
   * 같은 셈)이라고 약속한다. 성능은 손대지 않았고, **현재 동작을 못박아** 문안이
   * 조용히 어긋나는 것을 막는다.
   */
  it("자풍 = 장풍이면 자풍역·장풍역이 함께 붙는다 (합 2판)", () => {
    const ids = kanWinYaku(1, 1);
    expect(ids).toContain("wind_lineage_seat");
    expect(ids).toContain("wind_lineage_prevalent");
  });
});

describe("바람의 계보 — 몸통마다 1판 (2026-08-27 사용자 지시)", () => {
  /**
   * 판정 기준: **자풍이 든 바람 몸통 N개 → N판**, **장풍이 든 바람 몸통 M개 → M판**,
   * **백발중 몸통 K개 → K판** (합 N+M+K). 자풍과 장풍이 같으면 한 몸통이 양쪽에 다
   * 걸린다(더블 동과 같은 셈) — 그건 종전 그대로다.
   *
   * ⚠ 예전 사양은 "같은 갈래는 몸통이 몇 개든 한 번만"이었다. 아래 테스트가 그걸
   * 뒤집는다 — 옛 사양을 못박은 단언은 남기지 않는다.
   *
   * 구현은 갈래마다 "몸통 n개 이상"인 1판짜리 역을 겹쳐 등록하는 방식이라,
   * 2몸통째부터는 `..._x2`·`_x3`·`_x4` id로 **결과창에 별도 줄**로 뜬다.
   */
  interface WinOpts {
    hand: string;
    melds?: { kind: "chi" | "kan_closed"; spec: string }[];
    seatWind?: number;
    prevalentWind?: number;
    disarmed?: string[];
  }

  function evalWin(o: WinOpts): { ids: string[]; han: number; yakuman: number } {
    const base = craft({
      hands: { p0: o.hand, p1: "*", p2: "*", p3: "*" },
      ...(o.melds !== undefined ? { melds: { p0: o.melds } } : {}),
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(withAug(base, "p0", ["wind_lineage"]));
    installAugment(game.engine, windLineage, "p0", { yaku: game.yaku });
    const st = game.engine.state;
    const winTile = (st.zones["hand:p0"]?.tileIds ?? []).at(-1) as TileId;
    const ctx = buildWinContext(st, "p0", "tsumo", winTile, { rules: game.engine.rules });
    const ev = evaluateWin(
      {
        ...ctx,
        ...(o.seatWind !== undefined ? { seatWind: o.seatWind } : {}),
        ...(o.prevalentWind !== undefined ? { prevalentWind: o.prevalentWind } : {}),
        ...(o.disarmed !== undefined ? { disarmedSources: o.disarmed } : {}),
      },
      game.yaku,
    );
    return {
      ids: (ev?.yaku ?? []).map((y) => y.id),
      han: ev?.han ?? 0,
      yakuman: ev?.yakumanCount ?? 0,
    };
  }

  /** 계보가 얹은 판수 (역 한 줄 = 1판이라 줄 수가 곧 판수다) */
  const lineageHan = (ids: string[]): number =>
    ids.filter((id) => id.startsWith("wind_lineage_")).length;

  it("동남서 + 남서북 = 3판 (자풍 서 두 몸통 + 장풍 동 한 몸통)", () => {
    // 서가(자풍 서) · 동장(장풍 동): 서는 두 몸통 모두에 들어 2판, 동은 한 몸통 1판
    const { ids } = evalWin({
      hand: "1z2z3z2z3z4z123m456m99p",
      seatWind: 3,
      prevalentWind: 1,
    });
    expect(ids).toContain("wind_lineage_seat");
    expect(ids).toContain("wind_lineage_seat_x2");
    expect(ids).toContain("wind_lineage_prevalent");
    expect(ids).not.toContain("wind_lineage_prevalent_x2");
    expect(lineageHan(ids)).toBe(3);
  });

  it("백발중 둘 = 2판", () => {
    const { ids } = evalWin({ hand: "5z6z7z5z6z7z123m456m99p" });
    expect(ids).toContain("wind_lineage_dragon");
    expect(ids).toContain("wind_lineage_dragon_x2");
    expect(ids).not.toContain("wind_lineage_dragon_x3");
    expect(lineageHan(ids)).toBe(2);
  });

  it("백발중 하나 = 1판 (둘째 줄이 헛성립하지 않는다)", () => {
    const { ids } = evalWin({ hand: "5z6z7z123m456m789m99p" });
    expect(ids).toContain("wind_lineage_dragon");
    expect(ids).not.toContain("wind_lineage_dragon_x2");
    expect(lineageHan(ids)).toBe(1);
  });

  it("자풍 = 장풍인 오야: 동남서 하나에 2판 (더블 동과 같은 셈)", () => {
    const { ids } = evalWin({
      hand: "1z2z3z123m456m789m99p",
      seatWind: 1,
      prevalentWind: 1,
    });
    expect(ids).toContain("wind_lineage_seat");
    expect(ids).toContain("wind_lineage_prevalent");
    expect(ids).not.toContain("wind_lineage_seat_x2");
    expect(lineageHan(ids)).toBe(2);
  });

  it("자풍 = 장풍이고 그 바람이 든 몸통이 둘이면 4판", () => {
    // 서가·서장(서입 이후). 서는 동남서·남서북 두 몸통 모두에 들어 있고,
    // 그 두 몸통이 자풍 갈래·장풍 갈래에 각각 2판씩 붙는다.
    const { ids } = evalWin({
      hand: "1z2z3z2z3z4z123m456m99p",
      seatWind: 3,
      prevalentWind: 3,
    });
    expect(lineageHan(ids)).toBe(4);
  });

  it("후로(치)해도 몸통마다 1판이다", () => {
    const { ids } = evalWin({
      hand: "2z3z4z123m456m99p",
      melds: [{ kind: "chi", spec: "123z" }],
      seatWind: 3,
      prevalentWind: 1,
    });
    // 멘젠 손과 같은 3판 (openHan도 1)
    expect(lineageHan(ids)).toBe(3);
  });

  it("무장해제되면 추가분(2몸통째)까지 함께 잠긴다", () => {
    const { ids } = evalWin({
      hand: "1z2z3z2z3z4z123m456m99p",
      seatWind: 3,
      prevalentWind: 1,
      disarmed: ["aug:p0:wind_lineage"],
    });
    expect(ids.filter((id) => id.startsWith("wind_lineage_"))).toHaveLength(0);
  });

  it("역만에는 얹히지 않는다 (자일색 — 계보 역은 한 줄도 안 남는다)", () => {
    // 동남서 + 남서북 + 백발중 + 백발중 + 동동 = 자패만 14장 → 자일색
    const { ids, yakuman } = evalWin({
      hand: "1z2z3z2z3z4z5z6z7z5z6z7z11z",
      seatWind: 3,
      prevalentWind: 1,
    });
    expect(yakuman).toBeGreaterThan(0);
    expect(ids.filter((id) => id.startsWith("wind_lineage_"))).toHaveLength(0);
  });
});
