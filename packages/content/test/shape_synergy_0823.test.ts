/**
 * 화료형·후로 시너지 회귀 — 2026-08-23 QA synergy3(shape/relax)가 확정한 결함들.
 *
 * 이번 묶음의 공통점은 "**한 카드만 보고 만든 판정이 다른 카드와 겹치는 순간 뜻이
 * 뒤집힌다**"이다. 세 장을 1:1로만 견주거나, 후로를 kind가 아니라 모양으로 세거나,
 * 이력을 통째로 갈아 끼우거나 — 단독으로는 전부 맞는 코드였다.
 *
 * 1. `open_kokushi` × `mixed_triplet` — 혼색 퐁(1만1통1삭)이 국사 묶음 **모양**과 겹쳐
 *    `hasNonKokushiMeld`를 통과했다. 그 뒤 kokushi_pon을 부르면 화료·텐파이가 모두
 *    불가능한 **벽돌 국**이 됐다(relax 확정 3).
 * 2. `open_kokushi` × `royal_kokushi` — 울어 국사 분해만 `kokushiDupes`를 안 읽어,
 *    "13종을 다 안 모아도 된다"는 왕의 징표가 특수 퐁 앞에서 죽었다(shape 확정 1).
 * 3. `hourglass` × `nagashi_yakuman` — 거절할 수 없는 자동 연장이 유국역만 48,000을
 *    스스로 지웠다(relax 확정 2).
 * 4. `giant_god` × `nagashi_yakuman` — 각성의 버림-이력 재작성이 같은 48,000을
 *    지웠다(shape 확정 3).
 * 5. `polar_ends` × `mixed_triplet` — 펑 판정이 버림패와의 1:1 비교뿐이라 어느 카드로도
 *    몸통이 아닌 잡종 펑이 열렸다(shape 확정 2). 세 장을 **한꺼번에** 보는 그물은
 *    그대로다. 다만 2026-08-31 사용자 지시로 **두 카드를 다 들었을 때의 노두패 조합**
 *    (`{1만,9만,1통}`)은 정식으로 열렸다 — "1·9를 하나로 보는 카드"와 "무늬를 지우는
 *    카드"를 같이 들었으면 무늬 다른 1·9도 한 몸통이어야 한다. 규칙을 **하나씩 따로**
 *    통과하는 조합(한 장만 들었을 때)은 여전히 막힌다.
 * 6. `silent_pact` × `meld_dissolve` — "전부 잃는다"던 묵계 멘젠이 평범한 퐁을 파혼하는
 *    순간 되살아났다(relax 확정 4).
 * 7. `mixed_triplet` × `silent_pact`/`bluff_pretense` — 두 커스텀 콜의 손패 매칭이
 *    kindKey 완전 일치라 혼색 커쯔를 못 봤다(relax 확정 5).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SETTLED,
  SYSTEM_PLAYER,
  WALL,
  buildWinContext,
  createStandardGameFromState,
  createZone,
  evaluateWin,
  handZone,
  installAugment,
  kindKey,
  kindOf,
  openMeldCountOf,
  sameCallBody,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  Meld,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft, h } from "./helpers.js";
import { bluffPretense } from "../src/augments/bluff_pretense.js";
import { giantGod } from "../src/augments/giant_god.js";
import { hourglass } from "../src/augments/hourglass.js";
import { meldDissolve } from "../src/augments/meld_dissolve.js";
import { mixedTriplet } from "../src/augments/mixed_triplet.js";
import { nagashiYakuman } from "../src/augments/nagashi_yakuman.js";
import { openKokushi } from "../src/augments/open_kokushi.js";
import { polarEnds } from "../src/augments/polar_ends.js";
import { royalKokushi } from "../src/augments/royal_kokushi.js";
import { silentPact } from "../src/augments/silent_pact.js";
import { roundScopedKey } from "../src/augments/roundScope.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/**
 * 모양 규칙 액티브 3종 — 2026-08-23부터 상시가 아니라 **선언한 국 동안만** 열린다.
 * 여기 장면은 대부분 리액션 페이즈(남의 버림)라 자기 순에만 되는 선언을 넣을 수 없으므로,
 * 국 스코프 on 플래그를 그대로 심어 "이미 켜 둔 국"을 만든다.
 */
const SHAPE_DECLARED = new Set(["mixed_triplet", "broken_border", "async_chiitoi"]);

/** 한 좌석에 증강 여러 개를 심고 게임을 세운다 (qa-lab 하네스와 같은 규약) */
function start(state: GameState, defs: AugmentDef[], holder: PlayerId = "p0"): Game {
  const declared: Record<string, unknown> = {};
  for (const def of defs) {
    if (SHAPE_DECLARED.has(def.id)) {
      declared[roundScopedKey(def.id, "on", state, holder)] = true;
    }
  }
  const seeded: GameState = {
    ...state,
    augmentData: { ...state.augmentData, ...declared },
    players: state.players.map((p) =>
      p.id === holder ? { ...p, augments: [...p.augments, ...defs.map((d) => d.id)] } : p,
    ),
  };
  const game = createStandardGameFromState(seeded);
  for (const def of defs) {
    installAugment(game.engine, def, holder, { yaku: game.yaku, catalog: game.augments });
  }
  return game;
}

/** p0의 리액션 후보 타입 목록 */
function reactionTypes(game: Game, player: PlayerId = "p0"): string[] {
  const status = new FlowController(game.engine).begin();
  if (status.kind !== "awaiting") return [];
  return (status.prompts.find((p) => p.player === player)?.options ?? []).map((o) => o.type);
}

/** 패산을 비우고 유국 정산을 돌린다 (증강은 새 게임에 다시 심는다) */
function settleDraw(src: GameState, defs: AugmentDef[]): RoundSettledPayload | null {
  const st: GameState = {
    ...src,
    zones: { ...src.zones, [WALL]: { ...createZone(WALL, "wall"), tileIds: [] } },
    round: { ...src.round, phase: "turn.draw" },
  };
  const game = start(st, defs);
  const r = game.engine.submit({
    player: SYSTEM_PLAYER,
    type: "sys.settleDraw",
    payload: {},
  });
  expect(r.ok).toBe(true);
  const log = game.engine.eventLog;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === ROUND_SETTLED) return log[i]!.payload as RoundSettledPayload;
  }
  return null; // 정산 이벤트가 통째로 대체됐다 (모래시계 연장)
}

/** 손패 한 벌을 실제 채점 경로(buildWinContext + evaluateWin)로 재 본다 */
function measure(
  hand: string,
  melds: { kind: Meld["kind"]; spec: string; from?: PlayerId }[],
  winTile: string,
  defs: AugmentDef[],
): { ok: boolean; yaku: string[]; yakumanCount: number } {
  const base = craft({
    hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
    melds: { p0: melds },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const game = start(base, defs);
  const st = game.engine.state;
  const key = kindKey(h(winTile)[0]!);
  const winId = (st.zones[handZone("p0")]?.tileIds ?? []).find(
    (t) => kindKey(kindOf(st, t)) === key,
  );
  expect(winId).toBeDefined();
  const ctx = buildWinContext(st, "p0", "tsumo", winId as TileId, {
    rules: game.engine.rules,
  });
  const ev = evaluateWin(ctx, game.yaku);
  if (ev === null) return { ok: false, yaku: [], yakumanCount: 0 };
  return {
    ok: ev.ok,
    yaku: ev.yaku.map((y) => y.id),
    yakumanCount: ev.yakumanCount,
  };
}

describe("우는 국사 × 동수의 결속 — 혼색 퐁 뒤에는 특수 퐁이 막힌다 (relax 확정 3)", () => {
  /**
   * 혼색 퐁 `1만1통1삭`은 kind가 "pon"이지 kokushi_pon이 아니다. 국사 덮개
   * (`helpers.kokushiMeldKinds`)가 그 3종을 안 세므로, 이 퐁을 한 뒤 kokushi_pon을
   * 부르면 국사는 영영 완성되지 않고 `kokushiOnly`가 표준형·치또이까지 막는다.
   */
  const sceneAfterMixedPon = (): GameState =>
    craft({
      hands: { p0: "9p9s1234z567z", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "pon", spec: "1m1p1s", from: "p1" }] },
      phase: "reaction",
      turnSeat: 2,
      lastDiscard: { player: "p2", spec: "9m" },
    });

  it("평범한 펑(모양이 국사 묶음이어도) 뒤에는 kokushi_pon 후보가 뜨지 않는다", () => {
    const game = start(sceneAfterMixedPon(), [mixedTriplet, openKokushi]);
    expect(reactionTypes(game)).not.toContain("kokushi_pon");
  });

  it("제출 경로에서도 거부된다", () => {
    const game = start(sceneAfterMixedPon(), [mixedTriplet, openKokushi]);
    const st = game.engine.state;
    const hand = st.zones[handZone("p0")]?.tileIds ?? [];
    const pick = (spec: string): TileId => {
      const key = kindKey(h(spec)[0]!);
      const id = hand.find((t) => kindKey(kindOf(st, t)) === key);
      expect(id).toBeDefined();
      return id as TileId;
    };
    const def = game.engine.actions.get("kokushi_pon");
    expect(def).toBeDefined();
    const reason = def!.validate(
      { player: "p0", type: "kokushi_pon", payload: { tileIds: [pick("9p"), pick("9s")] } },
      { state: st, rules: game.engine.rules },
    );
    expect(reason).toBe("already has a non-kokushi meld");
  });

  it("kokushi_pon 만 있는 손에서는 그대로 부를 수 있다 (막지 않아야 할 것을 막지 않는다)", () => {
    const base = craft({
      hands: { p0: "9p9s1234z567z", p1: "*", p2: "*", p3: "*" },
      melds: { p0: [{ kind: "kokushi_pon", spec: "1m1p1s", from: "p1" }] },
      phase: "reaction",
      turnSeat: 2,
      lastDiscard: { player: "p2", spec: "9m" },
    });
    expect(reactionTypes(start(base, [mixedTriplet, openKokushi]))).toContain("kokushi_pon");
  });
});

describe("우는 국사 × 왕의 징표 — 특수 퐁에도 중복 허용치가 통한다 (shape 확정 1)", () => {
  const PON: { kind: Meld["kind"]; spec: string; from?: PlayerId }[] = [
    { kind: "kokushi_pon", spec: "1m1p1s", from: "p3" },
  ];
  /** 퐁 3종 + 손패 9종 + 중복 2장 = 北(4z)이 빠진 손 */
  const MISS = "9m9p9s123z567z9m9p";

  it("12종 + 중복으로도 역만이 선다", () => {
    const both = measure(MISS, PON, "9m", [openKokushi, royalKokushi]);
    expect(both.ok).toBe(true);
    expect(both.yakumanCount).toBe(1);
    expect(both.yaku).toContain("kokushi_open");
  });

  it("왕의 징표가 없으면 여전히 13종을 요구한다", () => {
    expect(measure(MISS, PON, "9m", [openKokushi]).ok).toBe(false);
  });

  it("13종을 다 갖춘 손은 그대로 역만 (회귀 방지)", () => {
    const full = measure("9m9p9s1234z567z9m", PON, "9m", [openKokushi]);
    expect(full.ok).toBe(true);
    expect(full.yakumanCount).toBe(1);
  });
});

describe("뒤집힌 모래시계 × 유국역만 — 나가시가 서 있으면 연장하지 않는다 (relax 확정 2)", () => {
  /** p0 = 오야·텐파이·버림 전부 요구패 */
  const scene = (): GameState =>
    craft({
      hands: {
        p0: "234m345p456s678s2s",
        p1: "147m147p147s1234z",
        p2: "147m147p147s1234z",
        p3: "147m147p147s1234z",
      },
      discards: { p0: "99m99p9s" },
      phase: "turn.draw",
      turnSeat: 0,
    });

  it("유국역만이 그대로 정산된다 (연장이 지우지 않는다)", () => {
    const settled = settleDraw(scene(), [nagashiYakuman, hourglass]);
    expect(settled).not.toBeNull();
    expect(settled!.deltas["p0"]).toBe(51000); // 역만 48,000 + 텐파이료 3,000
    expect(settled!.drawSpecial?.augId).toBe("nagashi_yakuman");
  });

  it("증강 없는 표준 유국만관도 지켜진다", () => {
    const settled = settleDraw(scene(), [hourglass]);
    expect(settled).not.toBeNull();
    expect(settled!.deltas["p0"]).toBe(15000);
  });

  it("나가시가 아니면 예전처럼 연장한다 (모래시계를 죽이지 않는다)", () => {
    const notNagashi: GameState = craft({
      hands: {
        p0: "234m345p456s678s2s",
        p1: "147m147p147s1234z",
        p2: "147m147p147s1234z",
        p3: "147m147p147s1234z",
      },
      discards: { p0: "55m" }, // 잡패를 버렸다 = 나가시 불성립
      phase: "turn.draw",
      turnSeat: 0,
    });
    // 연장이 열리면 ROUND_SETTLED 자체가 대체돼 정산 이벤트가 없다
    expect(settleDraw(notNagashi, [hourglass])).toBeNull();
  });
});

describe("마작의 거신병 × 유국역만 — 각성이 유국역만을 지우지 않는다 (shape 확정 3)", () => {
  const POND = "19m19p19s1234z567z"; // 국사 13종 = 전부 요구패
  const HAND = "234567m2345p234s"; // 13장, 요구패 없음

  const scene = (): Game =>
    start(
      craft({
        hands: { p0: HAND, p1: "*", p2: "*", p3: "*" },
        discards: { p0: POND },
        phase: "turn.act",
        turnSeat: 0,
      }),
      [giantGod, nagashiYakuman],
    );

  it("각성 뒤 유국이 와도 역만이 성립한다", () => {
    const game = scene();
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    expect(status.kind).toBe("awaiting");
    const opt =
      status.kind === "awaiting"
        ? status.prompts
            .find((p) => p.player === "p0")
            ?.options.find((o) => o.type === "giant_god")
        : undefined;
    expect(opt).toBeDefined();
    flow.submit("p0", opt!);
    // 각성은 요구패 이력을 지운다 — 그래도 유국역만은 살아 있어야 한다
    expect(game.engine.state.round.byPlayer["p0"]?.discardedKinds).not.toContain("man1");
    const settled = settleDraw(game.engine.state, [giantGod, nagashiYakuman]);
    expect(settled).not.toBeNull();
    expect(settled!.deltas["p0"]).toBe(48000);
    expect(settled!.drawSpecial?.augId).toBe("nagashi_yakuman");
  });

  it("각성 뒤에 잡패를 버리면 여전히 깨진다 (스냅샷이 뒤쪽까지 봐주지 않는다)", () => {
    const game = scene();
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    const opt =
      status.kind === "awaiting"
        ? status.prompts
            .find((p) => p.player === "p0")
            ?.options.find((o) => o.type === "giant_god")
        : undefined;
    flow.submit("p0", opt!);
    // 각성 이후의 버림 한 장을 잡패로 심는다
    const st = game.engine.state;
    const rs = st.round.byPlayer["p0"]!;
    const dirty: GameState = {
      ...st,
      round: {
        ...st.round,
        byPlayer: {
          ...st.round.byPlayer,
          p0: { ...rs, discardedKinds: [...rs.discardedKinds, "man5"] },
        },
      },
    };
    const settled = settleDraw(dirty, [giantGod, nagashiYakuman]);
    expect(settled!.drawSpecial?.augId).not.toBe("nagashi_yakuman");
  });
});

describe("양극 × 동수의 결속 — 잡종 펑이 열리지 않는다 (shape 확정 2)", () => {
  it("sameCallBody: 세 장이 한 규칙 안에서 닫혀야 한다", () => {
    const m1 = { suit: "man", rank: 1 } as const;
    const m9 = { suit: "man", rank: 9 } as const;
    const p1 = { suit: "pin", rank: 1 } as const;
    const s1 = { suit: "sou", rank: 1 } as const;
    // 둘 다 들면 노두패는 무늬·랭크를 모두 넘어 한 몸통이다 (2026-08-31)
    expect(sameCallBody(m1, m9, p1, true, true)).toBe(true);
    expect(sameCallBody(m1, m9, s1, true, true)).toBe(true);
    // 한 장만 들었으면 그 카드 하나의 규칙 안에서 닫혀야 한다 — 잡종은 여전히 막힌다
    expect(sameCallBody(m1, m9, p1, false, true)).toBe(false);
    expect(sameCallBody(m1, m9, p1, true, false)).toBe(false);
    // 노두패가 아닌 랭크가 끼면 둘을 다 들어도 몸통이 아니다
    expect(sameCallBody(m1, m9, { suit: "pin", rank: 2 }, true, true)).toBe(false);
    // 각 규칙 안에서는 그대로 성립한다
    expect(sameCallBody(m1, m9, m9, false, true)).toBe(true);
    expect(sameCallBody(m1, p1, s1, true, false)).toBe(true);
    expect(sameCallBody(m1, m1, m1, false, false)).toBe(true);
    // 규칙이 꺼져 있으면 순수 커쯔만
    expect(sameCallBody(m1, m9, m9, false, false)).toBe(false);
    expect(sameCallBody(m1, p1, s1, false, false)).toBe(false);
  });

  const scene = (hand: string): GameState =>
    craft({
      hands: { p0: hand, p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "1m" },
    });

  it("둘을 다 들면 9만+1통에도 펑이 열린다 (2026-08-31 사용자 지시)", () => {
    expect(reactionTypes(start(scene("9m1p345p345s99s"), [polarEnds, mixedTriplet]))).toContain(
      "pon",
    );
  });

  it("한 장만 들었으면 잡종은 그대로 막힌다 — 양극만 든 9만+1통", () => {
    expect(reactionTypes(start(scene("9m1p345p345s99s"), [polarEnds]))).not.toContain("pon");
  });

  it("양극 정상(9만+9만)·결속 정상(1통+1삭)은 그대로 뜬다", () => {
    expect(reactionTypes(start(scene("9m9m345p345s99s"), [polarEnds, mixedTriplet]))).toContain(
      "pon",
    );
    expect(reactionTypes(start(scene("1p1s345p345s99s"), [polarEnds, mixedTriplet]))).toContain(
      "pon",
    );
  });
});

describe("묵계 × 파혼 — 잃은 멘젠은 돌아오지 않는다 (relax 확정 4)", () => {
  it("평범한 퐁을 파혼해도 손은 열린 채로 남는다", () => {
    const base = craft({
      hands: { p0: "234m345p77s99s", p1: "*", p2: "*", p3: "*" },
      melds: {
        p0: [
          { kind: "pon", spec: "777z", from: "p1" },
          { kind: "pon", spec: "111z", from: "p2" },
        ],
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    // 첫 후로를 묵계 퐁으로 표시한다 (silent_pon이 남기는 표식과 같다)
    const rs = base.round.byPlayer["p0"]!;
    const seeded: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p0: {
            ...rs,
            melds: rs.melds.map((m, i) => (i === 0 ? { ...m, silent: true } : m)),
          },
        },
      },
    };
    const game = start(seeded, [meldDissolve, silentPact]);
    expect(openMeldCountOf(game.engine.state, "p0")).toBe(1); // 평범한 퐁 때문에 열린 손

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    expect(status.kind).toBe("awaiting");
    const opt =
      status.kind === "awaiting"
        ? status.prompts
            .find((p) => p.player === "p0")
            ?.options.find(
              (o) =>
                o.type === "dissolve_meld" &&
                (o.payload as { meldIndex: number }).meldIndex === 1,
            )
        : undefined;
    expect(opt).toBeDefined();
    flow.submit("p0", opt!);

    const after = game.engine.state.round.byPlayer["p0"]?.melds ?? [];
    expect(after).toHaveLength(1);
    // 남은 것이 묵계 퐁뿐이어도 멘젠은 돌아오지 않는다
    expect(openMeldCountOf(game.engine.state, "p0")).toBe(1);
  });
});

describe("동수의 결속 × 묵계·허장성세 — 혼색 커쯔도 커스텀 콜이 본다 (relax 확정 5)", () => {
  it("묵계 퐁이 혼색 커쯔로 열린다", () => {
    const base = craft({
      hands: { p0: "1m1p345p345s99s", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "1s" },
    });
    expect(reactionTypes(start(base, [silentPact, mixedTriplet]))).toContain("silent_pon");
    // 결속이 없으면 예전 그대로 (혼색은 애초에 퐁이 아니다)
    expect(reactionTypes(start(base, [silentPact]))).not.toContain("silent_pon");
  });

  it("허장성세가 혼색 커쯔 한 장으로 열린다", () => {
    const base = craft({
      hands: { p0: "1m2m345p345s99s", p1: "*", p2: "*", p3: "*" },
      phase: "reaction",
      turnSeat: 1,
      lastDiscard: { player: "p1", spec: "1s" },
    });
    expect(reactionTypes(start(base, [bluffPretense, mixedTriplet]))).toContain("bluff_pon");
    expect(reactionTypes(start(base, [bluffPretense]))).not.toContain("bluff_pon");
  });
});
