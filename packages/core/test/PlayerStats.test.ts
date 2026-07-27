import { describe, expect, it } from "vitest";
import {
  StatsTracker,
  deriveStats,
  mergeStats,
  createEmptyStats,
} from "../src/stats/PlayerStats.js";
import type { PlayerId } from "../src/engine/zones/Zone.js";
import {
  ROUND_STARTED,
  TILE_DISCARDED,
  CALL_MADE,
  KAN_DECLARED,
  ROUND_SETTLED,
} from "../src/mahjong/flow/flowEvents.js";
import { AUGMENT_OFFERED, AUGMENT_DRAFTED } from "../src/augment/events.js";
import type {
  TileDiscardedPayload,
  CallMadePayload,
  KanDeclaredPayload,
  RoundSettledPayload,
  WinInfo,
} from "../src/mahjong/flow/flowEvents.js";

const P = ["p0", "p1", "p2", "p3"] as PlayerId[];

function discard(player: PlayerId, riichi = false): { type: string; payload: TileDiscardedPayload } {
  return {
    type: TILE_DISCARDED,
    payload: { player, tileId: 0, riichi, riichiCost: riichi ? 1000 : 0 },
  };
}

function call(caller: PlayerId, from: PlayerId, meldKind: "pon" | "chi" = "pon"): {
  type: string;
  payload: CallMadePayload;
} {
  return { type: CALL_MADE, payload: { caller, from, meldKind, handTileIds: [1, 2], calledTileId: 3 } };
}

function kan(player: PlayerId, kanKind: KanDeclaredPayload["kanKind"]): {
  type: string;
  payload: KanDeclaredPayload;
} {
  return { type: KAN_DECLARED, payload: { player, kanKind, handTileIds: [1, 2, 3, 4] } };
}

function winInfo(winner: PlayerId, winType: "tsumo" | "ron", from: PlayerId | null, points: number): WinInfo {
  return {
    winner,
    from,
    winType,
    winningTileId: 0,
    han: 3,
    fu: 30,
    yakumanCount: 0,
    extraHan: 0,
    yaku: [],
    doraHan: 0,
    uraHan: 0,
    redHan: 0,
    points,
    limit: null,
  };
}

function settle(winInfos?: WinInfo[]): { type: string; payload: RoundSettledPayload } {
  return {
    type: ROUND_SETTLED,
    payload: {
      outcome: winInfos && winInfos.length > 0 ? "win" : "draw",
      deltas: {},
      dealerSeat: 0,
      honba: 0,
      riichiPot: 0,
      roundNumber: 1,
      prevalentWind: 1,
      ...(winInfos !== undefined ? { winInfos } : {}),
    },
  };
}

describe("StatsTracker — 국 단위 집계", () => {
  it("리치 버림은 리치율 국으로, 후로는 후로율 국으로 계상된다", () => {
    const t = new StatsTracker(P);
    t.consume({ type: ROUND_STARTED });
    t.consume(discard("p0", true)); // p0 리치
    t.consume(call("p1", "p3")); // p1 후로
    t.consume(settle()); // 유국
    const s = t.get("p0")!;
    expect(s.roundsPlayed).toBe(1);
    expect(s.riichiRounds).toBe(1);
    expect(s.callRounds).toBe(0);
    const s1 = t.get("p1")!;
    expect(s1.riichiRounds).toBe(0);
    expect(s1.callRounds).toBe(1);
  });

  it("같은 국에서 리치 버림을 두 번 해도 리치율 국은 1회만", () => {
    const t = new StatsTracker(P);
    t.consume({ type: ROUND_STARTED });
    t.consume(discard("p0", true));
    t.consume(discard("p0", false));
    t.consume(discard("p0", true));
    t.consume(settle());
    expect(t.get("p0")!.riichiRounds).toBe(1);
  });

  it("안깡은 후로에 포함되지 않고, 대명깡·가깡은 포함된다", () => {
    const t = new StatsTracker(P);
    t.consume({ type: ROUND_STARTED });
    t.consume(kan("p0", "kan_closed"));
    t.consume(kan("p1", "kan_open"));
    t.consume(kan("p2", "kan_added"));
    t.consume(settle());
    expect(t.get("p0")!.callRounds).toBe(0);
    expect(t.get("p1")!.callRounds).toBe(1);
    expect(t.get("p2")!.callRounds).toBe(1);
  });

  it("론 화료: 화료자 wins++, 방총자 dealIns++/점수 반영", () => {
    const t = new StatsTracker(P);
    t.consume({ type: ROUND_STARTED });
    t.consume(settle([winInfo("p0", "ron", "p2", 5200)]));
    const w = t.get("p0")!;
    expect(w.wins).toBe(1);
    expect(w.ronWins).toBe(1);
    expect(w.tsumoWins).toBe(0);
    expect(w.winPointsTotal).toBe(5200);
    const d = t.get("p2")!;
    expect(d.dealIns).toBe(1);
    expect(d.dealInPointsTotal).toBe(5200);
    // 무관한 플레이어는 방총 아님
    expect(t.get("p1")!.dealIns).toBe(0);
  });

  it("쯔모 화료는 방총자가 없다", () => {
    const t = new StatsTracker(P);
    t.consume({ type: ROUND_STARTED });
    t.consume(settle([winInfo("p0", "tsumo", null, 3900)]));
    expect(t.get("p0")!.tsumoWins).toBe(1);
    for (const id of P) expect(t.get(id)!.dealIns).toBe(0);
  });

  it("더블론: 방총자는 국당 1회만 계상, 잃은 점수는 합산", () => {
    const t = new StatsTracker(P);
    t.consume({ type: ROUND_STARTED });
    t.consume(settle([winInfo("p0", "ron", "p3", 3900), winInfo("p1", "ron", "p3", 8000)]));
    const d = t.get("p3")!;
    expect(d.dealIns).toBe(1); // 한 국 = 방총 1회
    expect(d.dealInPointsTotal).toBe(3900 + 8000);
    expect(t.get("p0")!.wins).toBe(1);
    expect(t.get("p1")!.wins).toBe(1);
  });

  it("여러 국을 누적한다 (roundsPlayed 증가)", () => {
    const t = new StatsTracker(P);
    for (let i = 0; i < 3; i++) {
      t.consume({ type: ROUND_STARTED });
      t.consume(settle());
    }
    for (const id of P) expect(t.get(id)!.roundsPlayed).toBe(3);
  });

  it("recordGameEnd로 순위·평균 순위가 누적된다", () => {
    const t = new StatsTracker(P);
    t.recordGameEnd([
      { playerId: "p0", rank: 1 },
      { playerId: "p1", rank: 2 },
      { playerId: "p2", rank: 3 },
      { playerId: "p3", rank: 4 },
    ]);
    const s0 = t.get("p0")!;
    expect(s0.games).toBe(1);
    expect(s0.placements).toEqual([1, 0, 0, 0]);
    expect(s0.placementSum).toBe(1);
    expect(t.get("p3")!.placements).toEqual([0, 0, 0, 1]);
  });
});

describe("deriveStats — 파생 비율", () => {
  it("비율·평균을 계산한다", () => {
    const raw = createEmptyStats();
    raw.roundsPlayed = 10;
    raw.wins = 3;
    raw.tsumoWins = 1;
    raw.winPointsTotal = 12000;
    raw.dealIns = 2;
    raw.dealInPointsTotal = 8000;
    raw.riichiRounds = 4;
    raw.callRounds = 5;
    raw.games = 2;
    raw.placements = [1, 0, 1, 0];
    raw.placementSum = 4;
    const v = deriveStats(raw);
    expect(v.winRate).toBeCloseTo(0.3);
    expect(v.dealInRate).toBeCloseTo(0.2);
    expect(v.riichiRate).toBeCloseTo(0.4);
    expect(v.callRate).toBeCloseTo(0.5);
    expect(v.tsumoRate).toBeCloseTo(1 / 3);
    expect(v.avgWinPoints).toBeCloseTo(4000);
    expect(v.avgDealInPoints).toBeCloseTo(4000);
    expect(v.avgPlacement).toBeCloseTo(2);
    expect(v.topRate).toBeCloseTo(0.5);
    expect(v.rentaiRate).toBeCloseTo(0.5);
  });

  it("분모가 0이면 0을 반환한다 (NaN 방지)", () => {
    const v = deriveStats(createEmptyStats());
    expect(v.winRate).toBe(0);
    expect(v.avgWinPoints).toBe(0);
    expect(v.avgPlacement).toBe(0);
  });
});

describe("mergeStats — career 누적", () => {
  it("두 통계를 합산한다", () => {
    const a = { ...createEmptyStats(), roundsPlayed: 5, wins: 2, placements: [1, 1, 0, 0] as [number, number, number, number], games: 1, placementSum: 3 };
    const b = { ...createEmptyStats(), roundsPlayed: 3, wins: 1, placements: [0, 0, 1, 0] as [number, number, number, number], games: 1, placementSum: 3 };
    const m = mergeStats(a, b);
    expect(m.roundsPlayed).toBe(8);
    expect(m.wins).toBe(3);
    expect(m.placements).toEqual([1, 1, 1, 0]);
    expect(m.games).toBe(2);
    expect(m.placementSum).toBe(6);
    // 입력 불변
    expect(a.roundsPlayed).toBe(5);
  });
});

function offer(player: PlayerId, augmentIds: string[]): { type: string; payload: unknown } {
  return { type: AUGMENT_OFFERED, payload: { player, augmentIds } };
}

function drafted(player: PlayerId, augmentId: string): { type: string; payload: unknown } {
  return { type: AUGMENT_DRAFTED, payload: { player, augmentId } };
}

describe("StatsTracker — 증강 통계", () => {
  it("오퍼는 offered, 오퍼 안의 픽은 picked로 계상된다", () => {
    const t = new StatsTracker(P);
    t.consume(offer("p0", ["a", "b", "c"]));
    t.consume(drafted("p0", "b")); // 오퍼 중 하나를 픽
    const s = t.get("p0")!;
    expect(s.augments["a"]!.offered).toBe(1);
    expect(s.augments["b"]!.offered).toBe(1);
    expect(s.augments["b"]!.picked).toBe(1);
    expect(s.augments["a"]!.picked).toBe(0); // gold
  });

  it("오퍼에 없던 획득은 picked에 안 들어가지만 보유로는 잡힌다", () => {
    const t = new StatsTracker(P);
    t.consume(offer("p0", ["a", "b", "c"]));
    t.consume(drafted("p0", "a")); // 정식 픽
    t.consume(drafted("p0", "z")); // 도박사 지급 (오퍼에 없음)
    t.consume(settle()); // 유국 1국
    t.recordGameEnd([{ playerId: "p0", rank: 1 }]);
    const s = t.get("p0")!;
    expect(s.augments["a"]!.picked).toBe(1);
    expect(s.augments["z"]!.picked).toBe(0); // 지급은 픽 아님 // silver 픽 1회만
    // 보유 증강 둘 다 이 판 순위(1위) 귀속
    expect(s.augments["a"]!.games).toBe(1);
    expect(s.augments["a"]!.placements).toEqual([1, 0, 0, 0]);
    expect(s.augments["z"]!.games).toBe(1);
    expect(s.augments["z"]!.placements).toEqual([1, 0, 0, 0]);
  });

  it("게임 종료 시 보유 증강에 최종 순위가 귀속되고 career 병합된다", () => {
    const t = new StatsTracker(P);
    t.consume(offer("p0", ["a"]));
    t.consume(drafted("p0", "a"));
    t.recordGameEnd([{ playerId: "p0", rank: 3 }]);
    const g1 = t.get("p0")!;
    expect(g1.augments["a"]!.placementSum).toBe(3); // prism

    // 두 판 병합: placementSum·games·placements가 합산된다
    const merged = mergeStats(g1, g1);
    expect(merged.augments["a"]!.games).toBe(2);
    expect(merged.augments["a"]!.placementSum).toBe(6);
    // 입력 불변 (깊은 복사)
    expect(g1.augments["a"]!.games).toBe(1);
  });
});
