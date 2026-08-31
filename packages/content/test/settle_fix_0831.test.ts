/**
 * 정산 순서·손익 계열 회귀 — 2026-08-31 QA synergy4 (misc / kandora)가 확정한 결함들.
 *
 * 이번에 드러난 것은 **«잃을수록 이득» 계열끼리 서로를 무력화하거나 오작동시키는**
 * 구멍들이다. 픽스처 규약은 `settle_synergy_0823.test.ts`와 같다.
 *
 * - **A-8** 반전(SignFlip 550)이 부호를 뒤집은 뒤 죽기살기(Shield 600)가 그걸 «손실»로
 *   읽어, **버는 국에** 게임 내 단 1회가 탔다(오야 국사무쌍 +96,000 → +25,000).
 * - **A-9** 카르마의 게이지가 `ROUND_SETTLED` **리액션**이라 인터셉터가 끝난 delta만 봐,
 *   반전·죽기살기와 겹치면 게이지가 한 국도 차지 않았다.
 * - **A-10** 죽기살기에는 있는 뱅크 발행 상한(25,000)이 형제인 반전에는 없었다.
 * - **A-12** 가불금 ±10,000이 **드래프트 픽 순서**로 갈렸다(32,100 vs 12,100).
 * - **B-8** 책임전가의 `Reassert`가 가불 인생의 «각 3,000» 상환까지 재분배했다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  ROUND_STARTED,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type {
  AugmentDef,
  GameState,
  PlayerId,
  RoundSettledPayload,
  ScoreChangedPayload,
  WinInfo,
} from "@majak/core";
import { craft } from "./helpers.js";
import { blameShift } from "../src/augments/blame_shift.js";
import { devilsAdvance } from "../src/augments/devils_advance.js";
import { dieHard } from "../src/augments/die_hard.js";
import { karma } from "../src/augments/karma.js";
import { signFlip } from "../src/augments/sign_flip.js";
import { roundKey } from "../src/util.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function blank(score = 25000): GameState {
  const base = craft({
    hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return { ...base, players: base.players.map((p) => ({ ...p, score })) };
}

function withAugs(
  state: GameState,
  spec: readonly { player: PlayerId; def: AugmentDef }[],
  extra: (s: GameState) => Record<string, unknown> = () => ({}),
): Game {
  const ids = new Map<PlayerId, string[]>();
  for (const { player, def } of spec) {
    ids.set(player, [...(ids.get(player) ?? []), def.id]);
  }
  const seeded: GameState = {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      augments: [...p.augments, ...(ids.get(p.id) ?? [])],
    })),
    augmentData: { ...state.augmentData, ...extra(state) },
  };
  const uniq = [...new Map(spec.map((x) => [x.def.id, x.def])).values()];
  const game = createStandardGameFromState(seeded, undefined, uniq);
  for (const { player, def } of spec) {
    installAugment(game.engine, def, player, {
      yaku: game.yaku,
      catalog: game.augments,
    });
  }
  return game;
}

/** 정산 인터셉터만 순서대로 돌린다 (deltas 산수 검증용) */
function settle(game: Game, payload: RoundSettledPayload): RoundSettledPayload {
  let out = payload;
  for (const { intercept } of game.engine.effects.interceptorsFor(ROUND_SETTLED)) {
    const r = intercept(
      { type: ROUND_SETTLED, payload: out },
      { state: game.engine.state, rules: game.engine.rules },
    );
    if (r !== null) out = r.payload as RoundSettledPayload;
  }
  return out;
}

/**
 * 이벤트 하나를 **엔진에 통째로 태운다** — 인터셉터 → 리듀서 → 리액션이 실제 순서로
 * 돈다(게이지·사용 횟수처럼 리액션이 남기는 상태를 봐야 하는 검사용).
 */
function emit(
  game: Game,
  event: { type: string; payload: unknown },
): { type: string; payload: unknown }[] {
  if (!game.engine.actions.has("test.emit")) {
    game.engine.actions.register({
      type: "test.emit",
      validate: () => null,
      toEvents: (req: { payload: unknown }) => [
        req.payload as { type: string; payload: unknown },
      ],
    } as never);
  }
  const r = game.engine.submit({
    player: "__system",
    type: "test.emit",
    payload: event,
  });
  if (!r.ok) throw new Error(r.reason);
  return r.events;
}

/** 인터셉터·리액션을 전부 태우고 **최종 정산 payload**를 돌려준다 */
function settleWithReactions(
  game: Game,
  payload: RoundSettledPayload,
): RoundSettledPayload {
  const events = emit(game, { type: ROUND_SETTLED, payload });
  const settled = events.find((e) => e.type === ROUND_SETTLED);
  if (settled === undefined) throw new Error("no RoundSettled");
  return settled.payload as RoundSettledPayload;
}

const sum = (d: Record<PlayerId, number>): number =>
  Object.values(d).reduce((s, v) => s + v, 0);

function win(
  o: Partial<WinInfo> & {
    winner: PlayerId;
    winType: "ron" | "tsumo";
    points: number;
  },
): WinInfo {
  return {
    from: null,
    han: 3,
    fu: 30,
    yaku: [],
    yakumanCount: 0,
    doraHan: 0,
    uraHan: 0,
    redHan: 0,
    limit: null,
    ...o,
  } as WinInfo;
}

function winPayload(
  g: Game,
  deltas: Record<PlayerId, number>,
  winInfos: WinInfo[],
): RoundSettledPayload {
  const r = g.engine.state.round;
  return {
    outcome: "win",
    deltas,
    dealerSeat: r.dealerSeat,
    honba: 0,
    riichiPot: 0,
    roundNumber: r.roundNumber,
    prevalentWind: r.prevalentWind,
    winInfos,
  } as RoundSettledPayload;
}

/** 반전이 «이번 국에 켜졌다» 표식 */
const armed = (id: string, holder: PlayerId) => (s: GameState) => ({
  [`${id}:armedRound:${holder}`]: roundKey(s),
});

/** p0(오야) 국사무쌍 쯔모 — 셋에게서 32,000씩 = +96,000 */
const YAKUMAN_TSUMO = (g: Game): RoundSettledPayload =>
  winPayload(g, { p0: 96000, p1: -32000, p2: -32000, p3: -32000 }, [
    win({
      winner: "p0",
      winType: "tsumo",
      points: 96000,
      han: 13,
      yakumanCount: 1,
      limit: "yakuman",
    }),
  ]);

/** p1이 p0에게서 16,000 론 (p0가 크게 잃는 국) */
const RON_16K_ON_P0 = (g: Game): RoundSettledPayload =>
  winPayload(g, { p0: -16000, p1: 16000, p2: 0, p3: 0 }, [
    win({ winner: "p1", winType: "ron", from: "p0", points: 16000, han: 6 }),
  ]);

describe("A-8 반전 × 죽기살기 — «버는 국»에 죽기살기가 터지지 않는다", () => {
  it("반전이 뒤집은 역만 화료를 죽기살기가 손실로 읽지 않는다", () => {
    const g = withAugs(
      blank(10000), // 죽기살기 문턱(12,500) 아래 — 조건은 다 갖춘 상태
      [
        { player: "p0", def: signFlip },
        { player: "p0", def: dieHard },
      ],
      armed("sign_flip", "p0"),
    );
    const out = settleWithReactions(g, YAKUMAN_TSUMO(g));
    // 반전 단독과 같은 값이어야 한다 — 죽기살기는 끼어들지 않는다.
    // (예전: +25,000 = REVIVE_CAP에 잘린 «부활». 단독보다 71,000 나쁘다.)
    expect(out.deltas["p0"]).toBe(-96000);
    // 게임 내 단 1회가 타지 않았다
    expect(g.engine.state.augmentData["die_hard:uses:p0"] ?? 0).toBe(0);
  });

  it("반전이 이미 플러스로 만든 국에도 횟수를 쓰지 않는다", () => {
    const g = withAugs(
      blank(10000),
      [
        { player: "p0", def: signFlip },
        { player: "p0", def: dieHard },
      ],
      armed("sign_flip", "p0"),
    );
    const out = settleWithReactions(g, RON_16K_ON_P0(g));
    expect(out.deltas["p0"]).toBe(16000); // 반전 단독과 같다
    expect(g.engine.state.augmentData["die_hard:uses:p0"] ?? 0).toBe(0);
  });

  it("반전이 없으면 예전 그대로 부활한다 (대조군)", () => {
    const g = withAugs(blank(10000), [{ player: "p0", def: dieHard }]);
    const out = settleWithReactions(g, RON_16K_ON_P0(g));
    expect(out.deltas["p0"]).toBe(16000);
    expect(g.engine.state.augmentData["die_hard:uses:p0"]).toBe(1);
  });
});

describe("A-9 카르마 — 게이지는 «원래 잃은 값»으로 찬다", () => {
  const gaugeOf = (g: Game): number =>
    (g.engine.state.augmentData["karma:gauge:p0"] as number | undefined) ?? 0;

  it("단독일 때 16,000", () => {
    const g = withAugs(blank(10000), [{ player: "p0", def: karma }]);
    settleWithReactions(g, RON_16K_ON_P0(g));
    expect(gaugeOf(g)).toBe(16000);
  });

  it("죽기살기와 겹쳐도 16,000 (예전 0)", () => {
    const g = withAugs(blank(10000), [
      { player: "p0", def: karma },
      { player: "p0", def: dieHard },
    ]);
    const out = settleWithReactions(g, RON_16K_ON_P0(g));
    expect(out.deltas["p0"]).toBe(16000); // 죽기살기는 정상 발동
    expect(gaugeOf(g)).toBe(16000);
  });

  it("반전과 겹쳐도 16,000 (예전 0)", () => {
    const g = withAugs(
      blank(10000),
      [
        { player: "p0", def: karma },
        { player: "p0", def: signFlip },
      ],
      armed("sign_flip", "p0"),
    );
    const out = settleWithReactions(g, RON_16K_ON_P0(g));
    expect(out.deltas["p0"]).toBe(16000);
    expect(gaugeOf(g)).toBe(16000);
  });

  it("셋 다 들어도 16,000 (예전 0)", () => {
    const g = withAugs(
      blank(10000),
      [
        { player: "p0", def: karma },
        { player: "p0", def: signFlip },
        { player: "p0", def: dieHard },
      ],
      armed("sign_flip", "p0"),
    );
    settleWithReactions(g, RON_16K_ON_P0(g));
    expect(gaugeOf(g)).toBe(16000);
  });

  it("버는 국에는 차지 않는다", () => {
    const g = withAugs(blank(10000), [{ player: "p0", def: karma }]);
    settleWithReactions(g, YAKUMAN_TSUMO(g));
    expect(gaugeOf(g)).toBe(0);
  });
});

describe("A-10 반전의 뱅크 발행 상한 — 죽기살기와 같은 25,000", () => {
  it("48,000 실점을 뒤집어도 뱅크 발행은 25,000까지", () => {
    const g = withAugs(
      blank(),
      [{ player: "p0", def: signFlip }],
      armed("sign_flip", "p0"),
    );
    const out = settle(
      g,
      winPayload(g, { p0: -48000, p1: 48000, p2: 0, p3: 0 }, [
        win({
          winner: "p1",
          winType: "ron",
          from: "p0",
          points: 48000,
          han: 13,
          yakumanCount: 1,
          limit: "yakuman",
        }),
      ]),
    );
    expect(out.deltas["p0"]).toBe(25000); // 예전: +48,000 (무제한)
    // 뱅크 발행분은 상한만큼만 — 예전에는 96,000(=48,000×2)이 새로 발행됐다
    expect(sum(out.deltas)).toBe(25000 + 48000);
  });

  it("죽기살기와 상한이 정확히 같다", () => {
    const payload = (g: Game): RoundSettledPayload =>
      winPayload(g, { p0: -48000, p1: 48000, p2: 0, p3: 0 }, [
        win({ winner: "p1", winType: "ron", from: "p0", points: 48000, han: 13 }),
      ]);
    const flip = withAugs(
      blank(10000),
      [{ player: "p0", def: signFlip }],
      armed("sign_flip", "p0"),
    );
    const hard = withAugs(blank(10000), [{ player: "p0", def: dieHard }]);
    expect(settle(flip, payload(flip)).deltas["p0"]).toBe(
      settle(hard, payload(hard)).deltas["p0"],
    );
  });

  it("버는 국을 뒤집어 뱅크가 거둬들이는 쪽에는 상한이 없다", () => {
    const g = withAugs(
      blank(),
      [{ player: "p0", def: signFlip }],
      armed("sign_flip", "p0"),
    );
    const out = settle(g, YAKUMAN_TSUMO(g));
    expect(out.deltas["p0"]).toBe(-96000);
  });
});

describe("A-12 가불 인생 × 반전 — 픽 순서로 갈리지 않는다", () => {
  /** 국 시작 리액션을 태우고 p0에게 실린 ScoreChanged를 읽는다 */
  function advanceOnRoundStart(order: readonly AugmentDef[]): {
    delta: number;
    reason: string | undefined;
  } {
    // 반전은 **자기 armOnNextRound로** 이 국에 켜진다 — 미리 심지 않는다.
    // 두 리액션이 같은 ROUND_STARTED 물결에서 부딪히는 실제 상황이다.
    const g = withAugs(
      blank(),
      order.map((def) => ({ player: "p0" as PlayerId, def })),
    );
    const events = emit(g, { type: ROUND_STARTED, payload: {} });
    const ev = events.find(
      (e) =>
        e.type === "ScoreChanged" &&
        (e.payload as ScoreChangedPayload).player === "p0",
    );
    const p = ev?.payload as ScoreChangedPayload | undefined;
    return { delta: p?.delta ?? 0, reason: p?.reason };
  }

  it("두 픽 순서가 같은 값을 낸다", () => {
    const a = advanceOnRoundStart([devilsAdvance, signFlip]);
    const b = advanceOnRoundStart([signFlip, devilsAdvance]);
    // 예전: +10,000 vs −10,000 (최종 점수 32,100 vs 12,100)
    expect(a).toEqual(b);
    // 반전이 켜진 국이므로 «증강이 옮기는 점수»는 뒤집힌다 — 서명도 남는다
    expect(a.delta).toBe(-10000);
    expect(a.reason).toBe("devils_advance+sign_flip");
  });

  it("반전이 없으면 그대로 +10,000", () => {
    const g = withAugs(blank(), [{ player: "p0", def: devilsAdvance }]);
    const events = emit(g, { type: ROUND_STARTED, payload: {} });
    const ev = events.find((e) => e.type === "ScoreChanged");
    expect((ev?.payload as ScoreChangedPayload).delta).toBe(10000);
  });
});

describe("B-8 책임전가 × 가불 인생 — 상환 3,000은 재분배 대상이 아니다", () => {
  /** p0(가불 보유)가 p1에게서 만관 16,000 론 */
  const RON_MANGAN = (g: Game): RoundSettledPayload =>
    winPayload(g, { p0: 16000, p1: -16000, p2: 0, p3: 0 }, [
      win({
        winner: "p0",
        winType: "ron",
        from: "p1",
        points: 16000,
        han: 5,
        limit: "mangan",
      }),
    ]);

  it("셋이 각각 상환 3,000을 그대로 문다", () => {
    const g = withAugs(blank(), [
      { player: "p0", def: blameShift },
      { player: "p0", def: devilsAdvance },
    ]);
    const out = settle(g, RON_MANGAN(g));
    // 책임전가 단독: p1 −5,400 / p2 −5,300 / p3 −5,300. 여기에 각 3,000 상환.
    // (예전: −6,400 / −9,300 / −9,300 — 쏜 사람이 2,000을 면제받았다.)
    expect(out.deltas["p1"]).toBe(-8400);
    expect(out.deltas["p2"]).toBe(-8300);
    expect(out.deltas["p3"]).toBe(-8300);
  });

  it("한 사람에게만 붙는 부담은 예전 그대로 3분할된다 (대조군)", () => {
    // 가불 인생이 없으면 상환도 없다 — 책임전가 단독 값
    const g = withAugs(blank(), [{ player: "p0", def: blameShift }]);
    const out = settle(g, RON_MANGAN(g));
    expect(out.deltas["p1"]).toBe(-5400);
    expect(out.deltas["p2"]).toBe(-5300);
    expect(out.deltas["p3"]).toBe(-5300);
  });
});
