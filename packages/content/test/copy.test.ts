/**
 * 카피(copy) — 2026-09-24 신규.
 *
 *  1. 자기 순에 상대를 지목하면 그 사람의 **액티브** 증강 하나가 무작위로 내 보유 목록에 얹힌다.
 *     가져올 것이 없는 상대는 후보에 뜨지 않는다. 결과는 전원 공개 채널에 실린다.
 *  2. 가져온 증강의 버튼은 **한 번만** 뜬다 — 한 번 쓰면 선택지가 사라진다.
 *  3. 국이 끝나면(정산) 보유 목록에서 빠지고, 다음 요청 직전에 설치도 걷힌다.
 *  4. 동풍전 1회 · 반장전 2회, 한 국에 하나.
 *  5. 복사 허용 목록은 버튼 있는 증강 전부를 «허용/불가» 둘 중 하나로 분류한다.
 *  6. 허용 목록의 모든 증강은 원래 주인과 **동시에** 설치·해제돼도 깨지지 않는다.
 *  7. 이어하기(rebuildAugments) — 빌린 증강을 드래프트 슬롯에 섞지 않고 다시 설치한다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AUGMENT_BORROWED,
  ROUND_SETTLED,
  ROUND_STARTED,
  augmentBorrowKey,
  borrowedOf,
  createStandardGameFromState,
  installAugment,
  rebuildAugments,
} from "@majak/core";
import type { GameState, PlayerId, RoundSettledPayload } from "@majak/core";
import { craft } from "./helpers.js";
import * as C from "../src/index.js";
import { COPYABLE, NOT_COPYABLE } from "../src/augments/copy.js";

type Game = ReturnType<typeof createStandardGameFromState>;

const ALL = C.contentAugments;
const defOf = (id: string) => {
  const d = ALL.find((a) => a.id === id);
  if (d === undefined) throw new Error(`unknown augment ${id}`);
  return d;
};

function mk(
  held: Partial<Record<PlayerId, string[]>>,
  opts: { mode?: "tonpuu" | "hanchan" } = {},
): Game {
  let state: GameState = craft({
    hands: { p0: "123m456p789s1122z3z", p1: "*", p2: "*", p3: "*" },
    drawnLastFor: "p0",
    phase: "turn.act",
    turnSeat: 0,
  });
  state = {
    ...state,
    players: state.players.map((p) => ({ ...p, augments: [...(held[p.id] ?? [])] })),
    ...(opts.mode !== undefined ? { config: { ...state.config, mode: opts.mode } } : {}),
  };
  const game = createStandardGameFromState(state, undefined, ALL);
  for (const p of state.players) {
    for (const id of p.augments) {
      installAugment(game.engine, defOf(id), p.id, { yaku: game.yaku, catalog: game.augments });
    }
  }
  return game;
}

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

/** p0의 턴 선택지 (프롬프트가 만드는 것과 같은 경로) */
const optionsOf = (g: Game, player: PlayerId = "p0") =>
  g.engine.turnOptionProviders.flatMap((prov) => prov(g.engine.state, player));
const typesOf = (g: Game) => optionsOf(g).map((o) => o.type);

const augsOf = (g: Game, player: PlayerId) =>
  g.engine.state.players.find((p) => p.id === player)!.augments;

function copyFrom(g: Game, target: PlayerId) {
  return g.engine.submit({ player: "p0", type: "copy_take", payload: { target } });
}

/** 지금 국을 그대로 정산한다 (점수 변동 없음) */
function settle(g: Game): void {
  const r = g.engine.state.round;
  const payload: RoundSettledPayload = {
    deltas: {},
    dealerSeat: r.dealerSeat,
    rotationSeat: r.rotationSeat,
    honba: r.honba,
    riichiPot: r.riichiPot,
    roundNumber: r.roundNumber,
    prevalentWind: r.prevalentWind,
  } as RoundSettledPayload;
  emit(g, { type: ROUND_SETTLED, payload });
}

describe("카피 — 가져오기", () => {
  it("가져올 액티브가 있는 상대만 후보에 뜬다", () => {
    // p1: 액티브(가지치기) · p2: 복사 불가(재장전) · p3: 패시브(혼 사냥)
    const g = mk({ p0: ["copy"], p1: ["pruning"], p2: ["reload"], p3: ["soul_hunt"] });
    const targets = optionsOf(g)
      .filter((o) => o.type === "copy_take")
      .map((o) => (o.payload as { target: string }).target);
    expect(targets).toEqual(["p1"]);
    expect(copyFrom(g, "p2").ok).toBe(false);
    expect(copyFrom(g, "p3").ok).toBe(false);
  });

  it("가져오면 내 목록에 얹히고, 원래 주인은 그대로이며, 전원 공개 채널에 실린다", () => {
    const g = mk({ p0: ["copy"], p1: ["pruning", "soul_hunt"] });
    expect(copyFrom(g, "p1").ok).toBe(true);
    expect(augsOf(g, "p0")).toEqual(["copy", "pruning"]);
    expect(augsOf(g, "p1")).toEqual(["pruning", "soul_hunt"]);
    expect(borrowedOf(g.engine.state, "p0")).toEqual({
      augmentId: "pruning",
      from: "p1",
      spent: false,
    });
    expect(g.engine.state.augmentData["view:*:copy:p0#round"]).toEqual({
      target: "p1",
      augmentId: "pruning",
    });
    // 곧바로 가지치기 버튼이 뜬다
    expect(typesOf(g)).toContain("pruning_swap");
  });

  it("후보가 여럿이면 그중 하나를 고르고, 같은 상태에서는 같은 것을 고른다", () => {
    const held = { p0: ["copy"], p1: ["pruning", "time_stop", "xray_hand", "genesis"] };
    const picks = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      const a = mk(held);
      const b = mk(held);
      a.engine.restoreState({ ...a.engine.state, config: { ...a.engine.state.config, seed } });
      b.engine.restoreState({ ...b.engine.state, config: { ...b.engine.state.config, seed } });
      copyFrom(a, "p1");
      copyFrom(b, "p1");
      const pa = borrowedOf(a.engine.state, "p0")!.augmentId;
      expect(borrowedOf(b.engine.state, "p0")!.augmentId).toBe(pa);
      expect(held.p1).toContain(pa);
      picks.add(pa);
    }
    expect(picks.size).toBeGreaterThan(1);
  });
});

describe("카피 — 한 번 쓰기", () => {
  it("가져온 증강의 버튼은 한 번 누르면 사라진다", () => {
    const g = mk({ p0: ["copy"], p1: ["time_stop"] });
    copyFrom(g, "p1");
    const opt = optionsOf(g).find((o) => o.type !== "copy_take" && o.type.startsWith("time"));
    expect(opt).toBeDefined();
    const res = g.engine.submit({ player: "p0", type: opt!.type, payload: opt!.payload });
    expect(res.ok).toBe(true);
    expect(borrowedOf(g.engine.state, "p0")!.spent).toBe(true);
    expect(typesOf(g)).not.toContain(opt!.type);
    // 목록에는 국 끝까지 남는다 (켜 둔 효과가 산다)
    expect(augsOf(g, "p0")).toContain("time_stop");
  });

  it("원래 주인의 버튼은 영향을 받지 않는다", () => {
    const g = mk({ p0: ["copy"], p1: ["time_stop"] });
    const before = optionsOf(g, "p1").map((o) => o.type);
    copyFrom(g, "p1");
    const opt = optionsOf(g).find((o) => o.type.startsWith("time"))!;
    g.engine.submit({ player: "p0", type: opt.type, payload: opt.payload });
    expect(optionsOf(g, "p1").map((o) => o.type)).toEqual(before);
  });
});

describe("카피 — 국 끝 회수", () => {
  it("정산과 함께 목록에서 빠지고, 다음 요청 직전에 설치가 걷힌다", () => {
    const g = mk({ p0: ["copy"], p1: ["pruning"] });
    copyFrom(g, "p1");
    expect(typesOf(g)).toContain("pruning_swap");
    const providers = g.engine.turnOptionProviders.length;
    settle(g);
    expect(augsOf(g, "p0")).toEqual(["copy"]);
    expect(g.engine.state.augmentData[augmentBorrowKey("p0")]).toBeUndefined();
    emit(g, { type: ROUND_STARTED, payload: {} });
    expect(g.engine.turnOptionProviders.length).toBeLessThan(providers);
    // 원래 주인 것은 그대로다
    expect(augsOf(g, "p1")).toEqual(["pruning"]);
  });

  it("같은 증강을 다음에 또 빌려도 이중 설치되지 않는다", () => {
    const g = mk({ p0: ["copy"], p1: ["time_stop"] }, { mode: "hanchan" });
    const base = g.engine.turnOptionProviders.length;
    copyFrom(g, "p1");
    const once = g.engine.turnOptionProviders.length;
    expect(once).toBeGreaterThan(base);
    settle(g);
    emit(g, { type: ROUND_STARTED, payload: {} });
    expect(g.engine.turnOptionProviders.length).toBe(base);
    g.engine.restoreState({
      ...g.engine.state,
      round: { ...g.engine.state.round, phase: "turn.act", turnSeat: 0 },
    });
    expect(copyFrom(g, "p1").ok).toBe(true);
    expect(g.engine.turnOptionProviders.length).toBe(once);
  });
});

describe("카피 — 횟수", () => {
  const again = (g: Game): void => {
    settle(g);
    emit(g, { type: ROUND_STARTED, payload: {} });
    g.engine.restoreState({
      ...g.engine.state,
      round: { ...g.engine.state.round, phase: "turn.act", turnSeat: 0 },
    });
  };

  it("한 국에 하나만 빌린다", () => {
    const g = mk({ p0: ["copy"], p1: ["pruning"], p2: ["time_stop"] }, { mode: "hanchan" });
    expect(copyFrom(g, "p1").ok).toBe(true);
    expect(copyFrom(g, "p2").ok).toBe(false);
  });

  it("동풍전 1회", () => {
    const g = mk({ p0: ["copy"], p1: ["pruning"] }, { mode: "tonpuu" });
    expect(copyFrom(g, "p1").ok).toBe(true);
    again(g);
    expect(copyFrom(g, "p1").ok).toBe(false);
  });

  it("반장전 2회", () => {
    const g = mk({ p0: ["copy"], p1: ["pruning"] }, { mode: "hanchan" });
    expect(copyFrom(g, "p1").ok).toBe(true);
    again(g);
    expect(copyFrom(g, "p1").ok).toBe(true);
    again(g);
    expect(copyFrom(g, "p1").ok).toBe(false);
  });
});

describe("카피 — 허용 목록", () => {
  const dir = fileURLToPath(new URL("../src/augments/", import.meta.url));
  const ids = new Set(ALL.map((a) => a.id));

  it("버튼이 있는 증강은 전부 «복사 가능/불가» 둘 중 하나로 분류돼 있다", () => {
    const unclassified: string[] = [];
    let scanned = 0;
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".ts")) continue;
      const src = readFileSync(dir + file, "utf8");
      const active =
        /holderTurnOptions|holderReactionOptions|shapeDeclare|preArmRecharge/.test(src);
      const augId =
        /\bid: "([a-z0-9_]+)"/.exec(src)?.[1] ??
        /const (?:AUGMENT_)?ID = "([a-z0-9_]+)"/.exec(src)?.[1];
      if (!active || augId === undefined || !ids.has(augId)) continue;
      scanned++;
      if (!COPYABLE.has(augId) && !(augId in NOT_COPYABLE)) unclassified.push(augId);
    }
    expect(unclassified).toEqual([]);
    // 스캔이 헛돌지 않았는가 (버튼 있는 증강은 70종을 넘는다)
    expect(scanned).toBeGreaterThan(70);
  });

  it("목록의 id는 전부 실제 증강이고, 양쪽에 겹치지 않는다", () => {
    for (const id of COPYABLE) expect(ids.has(id), id).toBe(true);
    for (const id of Object.keys(NOT_COPYABLE)) {
      expect(ids.has(id), id).toBe(true);
      expect(COPYABLE.has(id), id).toBe(false);
    }
  });

  it("복사 가능한 증강은 원래 주인과 동시에 설치·해제돼도 깨지지 않는다", () => {
    for (const id of COPYABLE) {
      const g = mk({ p1: [id] });
      expect(() => {
        emit(g, { type: AUGMENT_BORROWED, payload: { player: "p0", from: "p1", augmentId: id } });
        optionsOf(g);
        settle(g);
        emit(g, { type: ROUND_STARTED, payload: {} });
        optionsOf(g, "p1");
      }, id).not.toThrow();
      expect(augsOf(g, "p1"), id).toEqual([id]);
      expect(augsOf(g, "p0"), id).toEqual([]);
    }
  });
});

describe("카피 — 이어하기", () => {
  it("빌린 증강은 드래프트 슬롯에 섞이지 않고 맨 뒤에 다시 설치된다", () => {
    const g = mk({ p0: ["copy"], p1: ["pruning"] });
    copyFrom(g, "p1");
    const resumed = createStandardGameFromState(g.engine.state, undefined, ALL);
    rebuildAugments(resumed.engine, resumed.augments, {
      yaku: resumed.yaku,
      catalog: resumed.augments,
    });
    const types = resumed.engine.turnOptionProviders.flatMap((p) =>
      p(resumed.engine.state, "p0"),
    );
    expect(types.map((o) => o.type)).toContain("pruning_swap");
    // 정산 뒤 다음 요청에서 걷힌다 (재구성 경로도 같은 동기화를 쓴다)
    const n = resumed.engine.turnOptionProviders.length;
    emit(resumed, { type: ROUND_STARTED, payload: {} });
    emit(resumed, { type: ROUND_STARTED, payload: {} });
    expect(resumed.engine.turnOptionProviders.length).toBeLessThan(n);
  });
});
