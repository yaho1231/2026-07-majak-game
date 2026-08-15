/**
 * 개문선언(open_riichi) — 후로 손 리치가 **화료까지 도달하는가**.
 *
 * 회귀 배경(2026-08-15): 리치·더블리치·일발이 `openHan: null`이라, 개문선언이
 * `riichi.requiresClosed`를 풀어 후로 손 리치를 열어 줘도 화료 순간 리치 역이 통째로
 * 사라졌다. 다른 역이 없으면 쯔모·론 양쪽 다 "no yaku"로 거부돼, 리치봉 1000점만 내고
 * 손이 잠긴 채 절대 이길 수 없는 손이 됐다. "리치를 2판으로 취급"이라는 표기도 기저
 * 1판이 0이라 실제로는 1판이었다.
 *
 * 반대로 멘젠쯔모·핑후처럼 **손 모양이 멘젠이어야 성립하는 역**은 붙지 않아야 한다 —
 * 개문선언이 푸는 것은 "리치를 걸 수 있는가"뿐이라고 설명문이 명시한다.
 */

import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  SYSTEM_PLAYER,
  buildWinContext,
  createStandardGameFromState,
  discardsZone,
  evaluateWin,
  handZone,
  installAugment,
  standardAugments,
} from "@majak/core";
import type {
  GameState,
  PlayerId,
  RoundSettledPayload,
  TileId,
} from "@majak/core";
import { craft } from "./helpers.js";

type Game = ReturnType<typeof createStandardGameFromState>;

function lastSettled(game: Game): RoundSettledPayload {
  for (let i = game.engine.eventLog.length - 1; i >= 0; i--) {
    const e = game.engine.eventLog[i];
    if (e?.type === ROUND_SETTLED) return e.payload as RoundSettledPayload;
  }
  throw new Error("no RoundSettled event");
}

const openRiichi = standardAugments.find((a) => a.id === "open_riichi")!;

const RIICHI = { double: false, ippatsu: false, discardIndex: 0 };
const RIICHI_IPPATSU = { double: false, ippatsu: true, discardIndex: 0 };
const DOUBLE_RIICHI = { double: true, ippatsu: true, discardIndex: 0 };

type Riichi = typeof RIICHI;

/**
 * 후로(2p 퐁) + 345m 789m 456s 1p1p.
 * 탕야오·찬타·토이토이·삼색·일통·혼일색 전부 불성립 → **리치 외의 역이 0이다**.
 * open=false면 퐁 없는 멘젠 텐파이(대조군).
 */
function craftState(opts: {
  open: boolean;
  ron: boolean;
  riichi: Riichi | null;
  augments?: string[];
}): { state: GameState; ronTileId: TileId | null } {
  const spec = opts.open ? "345m789m456s11p" : "345m789m456s234p11p";
  // 론이면 화료패(1p) 한 장을 손에서 빼고 상대 버림패로 옮긴다
  const handSpec = opts.ron ? spec.replace("11p", "1p") : spec;

  let s = craft({
    hands: { p0: handSpec, p1: "*", p2: "*", p3: "*" },
    ...(opts.open
      ? {
          melds: {
            p0: [{ kind: "pon" as const, spec: "222p", from: "p1" as PlayerId }],
          },
        }
      : {}),
    ...(opts.ron
      ? { discards: { p0: "", p1: "1p" }, phase: "reaction", turnSeat: 1 }
      : { phase: "turn.act", turnSeat: 0, drawnLastFor: "p0" as PlayerId }),
  });

  let ronTileId: TileId | null = null;
  if (opts.ron) {
    ronTileId = s.zones[discardsZone("p1")]!.tileIds[0] as TileId;
    s = {
      ...s,
      round: { ...s.round, lastDiscard: { player: "p1", tileId: ronTileId } },
    };
  }

  s = {
    ...s,
    round: {
      ...s.round,
      doraIndicators: [], // 도라 제거 — 역 성립 여부만 본다
      byPlayer: {
        ...s.round.byPlayer,
        p0: { ...s.round.byPlayer["p0"]!, riichi: opts.riichi },
      },
    },
    players: s.players.map((p) =>
      p.id === "p0" ? { ...p, augments: opts.augments ?? ["open_riichi"] } : p,
    ),
  };
  return { state: s, ronTileId };
}

function makeGame(state: GameState, withAug = true) {
  const game = createStandardGameFromState(state);
  if (withAug) installAugment(game.engine, openRiichi, "p0", { yaku: game.yaku });
  return game;
}

/** 채점 레벨: 역 목록과 ok 값 */
function evalYaku(opts: { open: boolean; ron: boolean; riichi: Riichi | null }) {
  const { state, ronTileId } = craftState(opts);
  const game = makeGame(state);
  const st = game.engine.state;
  const tileId = opts.ron
    ? (ronTileId as TileId)
    : (st.round.lastDrawnTile as TileId);
  const ev = evaluateWin(
    buildWinContext(st, "p0", opts.ron ? "ron" : "tsumo", tileId, {
      rules: game.engine.rules,
      ...(opts.ron ? { from: "p1" as PlayerId } : {}),
    }),
    game.yaku,
  );
  expect(ev).not.toBeNull();
  return ev!;
}

const ids = (ev: { yaku: { id: string }[] }): string[] => ev.yaku.map((y) => y.id);

describe("개문선언: 후로 손 리치가 화료까지 간다", () => {
  it("후로 + 리치 쯔모 → 리치 역이 성립하고 화료가 선다", () => {
    const ev = evalYaku({ open: true, ron: false, riichi: RIICHI });
    expect(ids(ev)).toContain("riichi");
    expect(ev.ok).toBe(true);
  });

  it("후로 + 리치 론도 같다", () => {
    const ev = evalYaku({ open: true, ron: true, riichi: RIICHI });
    expect(ids(ev)).toContain("riichi");
    expect(ev.ok).toBe(true);
  });

  it("일발·더블리치는 후로 손에서도 붙는다 (리치를 걸었다는 사실만으로 정해지는 것들)", () => {
    expect(ids(evalYaku({ open: true, ron: false, riichi: RIICHI_IPPATSU }))).toContain(
      "ippatsu",
    );
    expect(ids(evalYaku({ open: true, ron: false, riichi: DOUBLE_RIICHI }))).toContain(
      "double_riichi",
    );
  });

  it("멘젠쯔모·핑후는 붙지 않는다 — 손이 멘젠이 되는 것은 아니다", () => {
    const ev = evalYaku({ open: true, ron: false, riichi: RIICHI });
    expect(ids(ev)).not.toContain("menzen_tsumo");
    expect(ids(ev)).not.toContain("pinfu");
  });

  it("대조군: 멘젠 리치는 종전대로 리치 + 멘젠쯔모", () => {
    const ev = evalYaku({ open: false, ron: false, riichi: RIICHI });
    expect(ids(ev)).toContain("riichi");
    expect(ids(ev)).toContain("menzen_tsumo");
  });

  it("엔진: 퐁 후 리치 선언 → 쯔모 화료가 통과한다", () => {
    // 선언
    const declare = craftState({ open: true, ron: false, riichi: null });
    const g1 = makeGame(declare.state);
    const handIds = g1.engine.state.zones[handZone("p0")]!.tileIds;
    expect(
      g1.engine.submit({
        player: "p0",
        type: "riichi",
        payload: { tileId: handIds[handIds.length - 1] as TileId },
      }).ok,
    ).toBe(true);

    // 화료
    const g2 = makeGame(craftState({ open: true, ron: false, riichi: RIICHI }).state);
    expect(g2.engine.submit({ player: "p0", type: "win", payload: {} }).ok).toBe(true);
  });

  it("엔진: 후로 리치 론 화료도 통과한다", () => {
    const g = makeGame(craftState({ open: true, ron: true, riichi: RIICHI }).state);
    expect(g.engine.submit({ player: "p0", type: "win", payload: {} }).ok).toBe(true);
  });

  it("증강이 없으면 후로 손 리치 선언 자체가 여전히 막힌다", () => {
    const { state } = craftState({
      open: true,
      ron: false,
      riichi: null,
      augments: [],
    });
    const g = makeGame(state, false);
    const handIds = g.engine.state.zones[handZone("p0")]!.tileIds;
    const r = g.engine.submit({
      player: "p0",
      type: "riichi",
      payload: { tileId: handIds[handIds.length - 1] as TileId },
    });
    expect(r.ok).toBe(false);
  });

  it("'리치를 2판으로 취급' — 리치 1판 + 증강 보너스가 실제 정산에 실린다", () => {
    /** 후로 리치 론을 정산하고 p0의 점수 증감을 돌려준다 */
    const settleDelta = (withAug: boolean): { delta: number; han: number } => {
      const { state, ronTileId } = craftState({
        open: true,
        ron: true,
        riichi: RIICHI,
        ...(withAug ? {} : { augments: [] }),
      });
      const g = makeGame(state, withAug);
      const r = g.engine.submit({
        player: SYSTEM_PLAYER,
        type: "sys.settleWin",
        payload: {
          wins: [
            { winner: "p0", from: "p1", tileId: ronTileId as TileId, winType: "ron" },
          ],
        },
      });
      expect(r.ok).toBe(true);
      const settled = lastSettled(g);
      const info = (settled.winInfos ?? []).find((w) => w.winner === "p0")!;
      // 도라를 지웠고 다른 역이 없으므로 채점되는 역은 리치 하나뿐이다
      expect(info.yaku.map((y) => y.id)).toEqual(["riichi"]);
      return { delta: settled.deltas["p0"] ?? 0, han: info.han };
    };

    const base = settleDelta(false); // 증강 없이 후로 리치가 성립했다면 리치 1판
    const withAug = settleDelta(true); // 개문선언 = 2판 취급
    // 보너스는 뱅크 발행이라 winInfo.han이 아니라 deltas에 실린다(addWinHanBonus 규약)
    expect(withAug.han).toBe(base.han);
    expect(withAug.delta).toBeGreaterThan(base.delta);
  });
});
