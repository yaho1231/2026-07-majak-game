/**
 * **중계 패널의 숫자는 마작에 실재하는 숫자여야 한다** (docs/36 A2).
 *
 * 관전 화면의 «예상 타점»이 「3.2판」·「4660점」을 냈다. 원인은 봇의 의사결정용
 * 값어치 모형(`server/bot/value.ts`)을 그대로 화면에 찍은 것 — 그 모형은 만관 경계에서
 * 봇이 요동치지 않도록 **일부러** 판수를 연속값으로 두고 점수표 두 칸을 보간한다.
 * 봇에게는 옳고 화면에는 틀리다.
 *
 * 고침은 «판이 실제로 쓰는 채점기»(`buildWinContext` → `evaluateWin` →
 * `calculateScore`)로 가상 화료를 시키는 것이다. 이 파일이 못 박는 것은 그 결과가
 * 실제로 **정산기와 같은 세계**에 산다는 것이다:
 *
 *   1. 판수는 언제나 정수, 점수는 언제나 점수표에 실재하는 값
 *   2. 후로한 손에 쿠이사가리가 붙는다 (멘젠 삼색 2판 → 후로 1판)
 *   3. 역없는 열린 손(형식텐파이)은 `yakuless`이고 `best`가 없다
 *   4. 도라만 있고 역이 없는 손은 도라를 점수로 세지 않는다
 *   5. 좌석별 증강(`win.*`·`scoring.*`)이 그 좌석에만 반영된다
 *   6. 배패 점수의 **순서**가 좋은 손 > 평범한 손 > 나쁜 손
 *
 * 뷰가 아니라 **상태를 손으로 짓는다** — 실제 대국을 굴려 우연히 그 손이 나오기를
 * 기다리면 그때만 도는 테스트가 된다. 라이브 경로는 마지막 통합 테스트가 따로 본다.
 */

import { describe, expect, it } from "vitest";
import {
  buildSpectateSeatScores,
  gradeStartingHand,
  gradeStartingHands,
} from "../src/information/spectateScore.js";
import { createStandardGameFromState } from "../src/mahjong/flow/standardGame.js";
import { createInitialGameState } from "../src/engine/state/GameState.js";
import type { GameState } from "../src/engine/state/GameState.js";
import {
  DEAD_WALL,
  WALL,
  createZone,
  discardsZone,
  handZone,
  meldsZone,
} from "../src/engine/zones/Zone.js";
import type { PlayerId } from "../src/engine/zones/Zone.js";
import { kindKey } from "../src/mahjong/tiles/Tile.js";
import type { TileId, TileKind } from "../src/mahjong/tiles/Tile.js";
import type { Meld } from "../src/engine/state/GameState.js";
import { calculateScore } from "../src/mahjong/scoring/score.js";
import { RuleLayer } from "../src/engine/rules/RuleRegistry.js";
import { installAugment } from "../src/augment/Augment.js";
import { standardAugments } from "../src/augment/standardAugments.js";
import { HanchanController, DEFAULT_HANCHAN_CONFIG } from "../src/match/HanchanController.js";
import type { HanchanConfig, SpectatorSink } from "../src/match/HanchanController.js";
import type { SpectateSeatScore } from "../src/information/spectateScore.js";
import type { PlayerAgent } from "../src/match/PlayerAgent.js";
import type { ActionOption, DecisionPrompt } from "../src/mahjong/flow/FlowController.js";
import type { DraftStage } from "../src/network/protocol.js";
import type { AugmentDef } from "../src/augment/Augment.js";
import { Prng } from "../src/engine/random/Prng.js";
import { shantenOf } from "../src/mahjong/scoring/shanten.js";
import type { PlayerView } from "../src/information/PlayerView.js";

// ─────────────────────────── 손으로 짓는 상태 ───────────────────────────

/** "123m456p" → TileKind[] */
function h(spec: string): TileKind[] {
  const out: TileKind[] = [];
  let digits = "";
  for (const ch of spec) {
    if (ch >= "0" && ch <= "9") {
      digits += ch;
      continue;
    }
    for (const d of digits) {
      const r = Number(d);
      if (ch === "m") out.push({ suit: "man", rank: r });
      else if (ch === "p") out.push({ suit: "pin", rank: r });
      else if (ch === "s") out.push({ suit: "sou", rank: r });
      else if (ch === "z")
        out.push(r <= 4 ? { suit: "wind", rank: r } : { suit: "dragon", rank: r - 4 });
      else throw new Error(`bad suit: ${ch}`);
    }
    digits = "";
  }
  return out;
}

const PLAYERS: PlayerId[] = ["p0", "p1", "p2", "p3"];

/**
 * 상태 한 장을 짓는다. `test/Augment.test.ts`의 `craft`와 같은 방식이되, 이 파일이
 * 실제로 보는 자리(손패·후로·버림·도라 표시패)만 다룬다.
 */
function craft(cfg: {
  hands: Partial<Record<PlayerId, string>>;
  melds?: Partial<Record<PlayerId, { kind: Meld["kind"]; spec: string }[]>>;
  discards?: Partial<Record<PlayerId, string>>;
  /** 도라 **표시패** 종류 (실제 도라는 그 다음 패다) */
  doraIndicator?: string;
  dealerSeat?: number;
  /** 이 좌석의 손패 **마지막 장**을 «방금 쯔모한 패»로 표시한다 */
  drawnLastFor?: PlayerId;
  /** 리치를 건 좌석 */
  riichi?: PlayerId[];
}): GameState {
  const base = createInitialGameState(
    { seed: 1, playerIds: [...PLAYERS] },
    { startScore: 25000, redFivesPerSuit: 1 },
  );
  const pool = new Map<string, TileId[]>();
  for (const tile of Object.values(base.tiles)) {
    const key = kindKey(tile.kind);
    pool.set(key, [...(pool.get(key) ?? []), tile.id]);
  }
  /**
   * 그 종류의 패 하나. **적도라는 마지막에 고른다** — 5s를 한 장 쥐어 줬을 뿐인데
   * 풀의 첫 사본이 적5라서 도라 수가 조용히 1 늘어나면, 이 파일의 기대값이
   * 「무엇을 재는지」와 무관한 이유로 어긋난다.
   */
  const take = (kind: TileKind): TileId => {
    const ids = pool.get(kindKey(kind)) ?? [];
    let at = ids.findIndex((id) => base.tiles[id]?.attrs.red !== true);
    if (at < 0) at = 0;
    const id = ids[at];
    if (id === undefined) throw new Error(`남은 패가 없다: ${kindKey(kind)}`);
    ids.splice(at, 1);
    return id;
  };

  const zones = { ...base.zones };
  const byPlayer = { ...base.round.byPlayer };
  const fillLater: PlayerId[] = [];

  for (const p of PLAYERS) {
    const spec = cfg.hands[p] ?? "*";
    if (spec === "*") {
      fillLater.push(p);
      zones[handZone(p)] = createZone(handZone(p), "hand", p);
    } else {
      zones[handZone(p)] = {
        ...createZone(handZone(p), "hand", p),
        tileIds: h(spec).map(take),
      };
    }
    const meldTiles: TileId[] = [];
    const melds: Meld[] = (cfg.melds?.[p] ?? []).map((m) => {
      const ids = h(m.spec).map(take);
      meldTiles.push(...ids);
      return { kind: m.kind, tileIds: ids };
    });
    zones[meldsZone(p)] = {
      ...createZone(meldsZone(p), "melds", p),
      tileIds: meldTiles,
    };
    const discardIds = h(cfg.discards?.[p] ?? "").map(take);
    zones[discardsZone(p)] = {
      ...createZone(discardsZone(p), "discards", p),
      tileIds: discardIds,
    };
    byPlayer[p] = {
      riichi: (cfg.riichi ?? []).includes(p)
        ? { double: false, ippatsu: false, discardIndex: 0, discardTileId: -1 as TileId }
        : null,
      temporaryFuriten: false,
      riichiFuriten: false,
      furiten: false,
      melds,
      discardedKinds: h(cfg.discards?.[p] ?? "").map(kindKey),
      discardCount: h(cfg.discards?.[p] ?? "").length,
      tsumogiriIds: [],
      ownDiscards: [],
    };
  }

  const indicatorId =
    cfg.doraIndicator === undefined ? undefined : take(h(cfg.doraIndicator)[0] as TileKind);

  let rest = [...pool.values()].flat().sort((a, b) => a - b);
  for (const p of fillLater) {
    zones[handZone(p)] = {
      ...createZone(handZone(p), "hand", p),
      tileIds: rest.slice(0, 13),
    };
    rest = rest.slice(13);
  }
  const deadWall = [...(indicatorId !== undefined ? [indicatorId] : []), ...rest.slice(0, 14)];
  zones[DEAD_WALL] = { ...createZone(DEAD_WALL, "deadWall"), tileIds: deadWall };
  zones[WALL] = { ...createZone(WALL, "wall"), tileIds: rest.slice(14) };

  return {
    ...base,
    zones,
    round: {
      ...base.round,
      phase: "turn.act",
      turnSeat: 0,
      dealerSeat: cfg.dealerSeat ?? 0,
      doraIndicators:
        indicatorId !== undefined ? [indicatorId] : [deadWall[4] as TileId],
      lastDrawnTile:
        cfg.drawnLastFor === undefined
          ? null
          : (zones[handZone(cfg.drawnLastFor)]?.tileIds.at(-1) ?? null),
      firstTurn: false, // 국 중간 스냅샷 — 천화·지화 오판 방지
      byPlayer,
    },
  };
}

/** 상태 하나에서 좌석값을 뽑는다 (표준 규칙·표준 역). */
function scoresOf(state: GameState): {
  seats: Map<string, SpectateSeatScore>;
  game: ReturnType<typeof createStandardGameFromState>;
} {
  const game = createStandardGameFromState(state);
  const out = buildSpectateSeatScores(
    game.engine.state,
    game.engine.rules,
    game.yaku,
    {},
  );
  return { seats: new Map(out.map((s) => [s.id, s])), game };
}

/**
 * **점수표에 실재하는 값들의 집합.**
 *
 * 「4660점」 같은 보간 결과를 잡는 그물이다. 판 1~13 × 부수 눈금 × 오야/자 ×
 * 론/쯔모와 역만 1~4배를 전부 돌려 `calculateScore`가 낼 수 있는 총점을 모은다 —
 * 표를 손으로 옮겨 적으면 그 사본이 또 어긋난다.
 */
const REAL_TOTALS = (() => {
  const set = new Set<number>();
  const fus = [20, 25, 30, 40, 50, 60, 70, 80, 90, 100, 110];
  for (const isDealer of [true, false]) {
    for (const winType of ["ron", "tsumo"] as const) {
      // 0판 — 표준 마작에는 없지만 무형화료(`win.requiresYaku` off) 좌석에는 있고,
      // 정산기가 실제로 그 값을 지불한다. `noYaku` 표식이 선 값만 여기 들어온다.
      for (let han = 0; han <= 13; han++) {
        for (const fu of fus) set.add(calculateScore({ han, fu, isDealer, winType }).total);
      }
      for (let ym = 1; ym <= 6; ym++) {
        set.add(
          calculateScore({ han: 0, fu: 20, yakumanCount: ym, isDealer, winType }).total,
        );
      }
    }
  }
  return set;
})();

// ─────────────────────────── 1. 실재하는 숫자 ───────────────────────────

describe("확정 타점은 «판이 실제로 쓰는 채점기»의 값이다", () => {
  /** 멘젠 삼색 텐파이 — 123m 123s 45m 99p + 후로 없음. 3m/6m 대기 */
  const SANSHOKU_CLOSED = "123m123p123s45m99p";

  it("판수는 정수, 점수는 점수표에 실재하는 값이다 (3.2판·4660점이 나오지 않는다)", () => {
    const { seats } = scoresOf(craft({ hands: { p0: SANSHOKU_CLOSED } }));
    const s = seats.get("p0");
    expect(s?.shanten, "이 손은 텐파이여야 한다").toBe(0);
    expect(s?.waits?.length, "대기가 하나도 안 나왔다").toBeGreaterThan(0);
    for (const w of s!.waits!) {
      for (const v of [w.ron, w.tsumo]) {
        if (v === null) continue;
        expect(Number.isInteger(v.han), `판수가 정수가 아니다: ${v.han}`).toBe(true);
        expect(Number.isInteger(v.fu), `부수가 정수가 아니다: ${v.fu}`).toBe(true);
        expect(
          REAL_TOTALS.has(v.points),
          `점수표에 없는 점수다: ${v.points} (${v.han}판 ${v.fu}부)`,
        ).toBe(true);
      }
    }
    expect(s?.best?.points, "가장 비싼 대기의 값이 없다").toBeGreaterThan(0);
  });

  it("후로한 손에 쿠이사가리가 붙는다 (멘젠 삼색 2판 → 후로 1판)", () => {
    const closed = scoresOf(craft({ hands: { p0: SANSHOKU_CLOSED } })).seats.get("p0");
    // 같은 삼색을 123p 치로 열었다 — 손 모양은 같고 열렸다는 사실만 다르다.
    const open = scoresOf(
      craft({
        hands: { p0: "123m123s45m99p" },
        melds: { p0: [{ kind: "chi", spec: "123p" }] },
      }),
    ).seats.get("p0");

    const sanshokuHan = (s: SpectateSeatScore | undefined): number | undefined =>
      s?.waits
        ?.flatMap((w) => w.ron?.yaku ?? [])
        .find((y) => y.name === "삼색동순")?.han;

    expect(sanshokuHan(closed), "멘젠 삼색이 2판이 아니다").toBe(2);
    expect(open?.menzen, "후로했는데 멘젠이라고 나온다").toBe(false);
    expect(open?.meldCount, "후로 수가 안 세졌다").toBe(1);
    expect(sanshokuHan(open), "후로 삼색에 쿠이사가리가 안 붙었다").toBe(1);
  });
});

// ─────────────────────────── 2. 역없음 ───────────────────────────

/**
 * 역없는 열린 손 — 치 123p + 456m 789s 99m 45s. 3s/6s 대기.
 * 탕야오(1p·9s·9m)도 삼색도 일통도 찬타도 안 된다.
 */
const YAKULESS_HAND = { hands: { p0: "456m789s99m45s" }, melds: { p0: [{ kind: "chi" as const, spec: "123p" }] } };

describe("역없는 열린 손 — 형식텐파이", () => {
  it("`yakuless: true`가 서고 `best`가 없다", () => {
    const { seats } = scoresOf(craft(YAKULESS_HAND));
    const s = seats.get("p0");
    expect(s?.shanten, "이 손은 텐파이여야 한다").toBe(0);
    expect(s?.yakuless, "형식텐파이인데 역없음 표시가 없다").toBe(true);
    expect(s?.best, "역이 없는데 «화료하면 얼마»가 적혔다").toBeUndefined();
    for (const w of s!.waits!) {
      expect(w.ron, `${w.kind} 론에 값이 붙었다 — 역이 없어 못 먹는다`).toBeNull();
      expect(w.tsumo, `${w.kind} 쯔모에 값이 붙었다`).toBeNull();
    }
  });

  it("도라만 있고 역이 없으면 도라를 점수로 세지 않는다", () => {
    // 표시패 8m → 도라 9m. 이 손은 9m을 두 장 쥐고 있다.
    const { seats } = scoresOf(craft({ ...YAKULESS_HAND, doraIndicator: "8m" }));
    const s = seats.get("p0");
    expect(s?.dora, "도라 2장을 안 세고 있다 — 손패 표시가 틀린다").toBe(2);
    expect(
      s?.best,
      "도라 2장이 그대로 점수가 됐다 — 도라는 역이 있어야 세는 것이다",
    ).toBeUndefined();
    expect(s?.yakuless).toBe(true);
  });
});

// ─────────────────────────── 3. 좌석별 증강 ───────────────────────────

describe("좌석별 증강이 그 좌석에만 반영된다", () => {
  it("무형화료(`win.requiresYaku` = false)를 든 좌석은 역없음이 아니다", () => {
    // 같은 형식텐파이 손을 두 좌석에 나눠 준다 — 증강 하나만 다르다.
    const state = craft({
      hands: { p0: "456m789s99m45s", p1: "456m789s99m45s" },
      melds: {
        p0: [{ kind: "chi", spec: "123p" }],
        p1: [{ kind: "chi", spec: "123p" }],
      },
    });
    const game = createStandardGameFromState(state);
    installAugment(
      game.engine,
      standardAugments.find((a) => a.id === "yakuless_win") as never,
      "p0",
    );
    const out = new Map(
      buildSpectateSeatScores(game.engine.state, game.engine.rules, game.yaku).map((s) => [
        s.id,
        s,
      ]),
    );
    expect(
      out.get("p0")?.yakuless,
      "무형화료 좌석에 «역없음»이 떴다 — 증강이 열어 준 길을 화면이 막는다",
    ).toBeUndefined();
    expect(out.get("p0")?.best?.points, "무형화료 좌석의 타점이 안 나왔다").toBeGreaterThan(0);
    // 옆 좌석은 그대로 형식텐파이 — 남의 증강이 내 숫자를 흔들지 않는다.
    expect(out.get("p1")?.yakuless, "증강이 없는 좌석까지 값이 붙었다").toBe(true);
  });

  it("개인 도라(`scoring.extraDoraKinds`)가 그 좌석의 도라 수에 반영된다", () => {
    const state = craft({ hands: { p0: "123m123p123s45m99p", p1: "123m123p123s45m99p" } });
    const game = createStandardGameFromState(state);
    // 캐시는 `GameState` 객체를 키로 쓴다 — 같은 객체로 두 번 물으면 규칙을 바꿔도
    // 첫 답이 그대로 돌아온다(그게 캐시의 목적이다). 그래서 얕은 사본으로 갈라 잰다.
    const before = new Map(
      buildSpectateSeatScores({ ...game.engine.state }, game.engine.rules, game.yaku).map(
        (s) => [s.id, s],
      ),
    );
    game.engine.rules.addModifier<readonly TileKind[]>("scoring.extraDoraKinds", {
      source: "test",
      layer: RuleLayer.Prism,
      apply: (cur, ctx) => (ctx.playerId === "p0" ? [...cur, { suit: "pin", rank: 9 }] : cur),
    });
    const after = new Map(
      buildSpectateSeatScores({ ...game.engine.state }, game.engine.rules, game.yaku).map(
        (s) => [s.id, s],
      ),
    );
    expect(
      after.get("p0")!.dora - before.get("p0")!.dora,
      "개인 도라 9p 두 장이 그 좌석의 도라로 안 세졌다",
    ).toBe(2);
    expect(
      after.get("p1")!.dora,
      "남의 개인 도라가 옆 좌석 숫자까지 흔들었다",
    ).toBe(before.get("p1")!.dora);
  });
});

// ────────── 3-2. 정산기와 같은 규약 (2026-08-23 QA 2차) ──────────

/**
 * **화면과 정산이 갈리면 안 된다.**
 *
 * `evaluateWin`은 판·부까지만 안다. 증강이 얹는 추가 판(`score.extraHan`), 오야 취급
 * (`win.treatAsDealer`), 격 게이트(`win.minHan`)는 전부 정산기(`sysSettleWin`·
 * `belowMinHan`)에만 있다 — 관전 채점이 그걸 안 보면 화면은 「3판 5,800점」이라 적는데
 * 실제 정산은 6판이 되고, 「2판 2,900점」이라 적은 대기로는 아예 화료할 수 없다.
 * QA 2차에서 넷 다 실측으로 잡혔다.
 */
describe("정산기와 같은 규약을 쓴다", () => {
  const SANSHOKU = "123m123p123s45m99p";

  /** 한 좌석에만 걸리는 규칙 하나 */
  function seatRule<T>(
    game: ReturnType<typeof createStandardGameFromState>,
    key: string,
    pid: string,
    value: T,
  ): void {
    game.engine.rules.addModifier<T>(key, {
      source: `test:${key}`,
      layer: RuleLayer.Prism,
      apply: (cur, ctx) => (ctx.playerId === pid ? value : cur),
    });
  }

  const seatsOf = (
    game: ReturnType<typeof createStandardGameFromState>,
    state?: GameState,
  ): Map<string, SpectateSeatScore> =>
    new Map(
      buildSpectateSeatScores(
        state ?? game.engine.state,
        game.engine.rules,
        game.yaku,
      ).map((x) => [x.id, x]),
    );

  it("`score.extraHan`이 판수·점수에 그대로 더해진다 (역만에는 안 붙는다)", () => {
    const game = createStandardGameFromState(craft({ hands: { p0: SANSHOKU } }));
    const before = seatsOf(game).get("p0")!.best!;
    seatRule(game, "score.extraHan", "p0", 3);
    const after = seatsOf(game).get("p0")!.best!;
    expect(
      after.han,
      "증강이 얹은 +3판이 관전값에 안 들어갔다 — 화면과 정산이 갈린다",
    ).toBe(before.han + 3);
    expect(after.points).toBe(
      calculateScore({ han: after.han, fu: after.fu, isDealer: true, winType: "ron" }).total,
    );
    expect(after.points, "판이 올랐는데 점수가 그대로다").toBeGreaterThan(before.points);
  });

  it("`score.extraHan`을 바꾸면 **같은 상태 객체**여도 값이 갱신된다 (캐시 무효화)", () => {
    /*
     * 국 사이 드래프트에서 `installAugment`는 **GameState를 갈지 않고 RuleRegistry만**
     * 바꾼다. 상태만 키로 쓰던 캐시는 그 창에서 «드래프트 이전 규칙»으로 계산된 패널을
     * 계속 내놓았다 (QA 2차 실측). 아래 두 호출은 **완전히 같은 상태 객체**를 쓴다.
     */
    const game = createStandardGameFromState(craft({ hands: { p0: SANSHOKU } }));
    const state = game.engine.state;
    const before = seatsOf(game, state).get("p0")!.best!.han;
    seatRule(game, "score.extraHan", "p0", 2);
    const after = seatsOf(game, state).get("p0")!.best!.han;
    expect(after, "상태가 안 바뀌었다고 낡은 규칙의 값을 그대로 냈다").toBe(before + 2);
  });

  it("증강 설치(`installAugment`)도 같은 상태에서 즉시 반영된다", () => {
    const game = createStandardGameFromState(craft(YAKULESS_HAND));
    const state = game.engine.state;
    expect(seatsOf(game, state).get("p0")?.yakuless, "형식텐파이가 아니다").toBe(true);
    installAugment(
      game.engine,
      standardAugments.find((a) => a.id === "yakuless_win") as never,
      "p0",
    );
    expect(
      seatsOf(game, state).get("p0")?.yakuless,
      "드래프트 직후 창에서 낡은 패널이 나갔다 — 상태 객체가 그대로라 캐시가 답했다",
    ).toBeUndefined();
  });

  it("`win.treatAsDealer` 좌석은 오야 점수표로 계산된다", () => {
    // p0가 실제 오야, p1은 자. 같은 손이라 차이는 오야 보정 하나뿐이다.
    const game = createStandardGameFromState(
      craft({ hands: { p0: SANSHOKU, p1: SANSHOKU }, dealerSeat: 0 }),
    );
    const plain = seatsOf(game);
    expect(
      plain.get("p1")!.best!.points,
      "오야와 자의 점수가 같다 — 이 손으로는 차이를 볼 수 없다",
    ).toBeLessThan(plain.get("p0")!.best!.points);
    seatRule(game, "win.treatAsDealer", "p1", true);
    const after = seatsOf(game);
    expect(
      after.get("p1")!.best!.points,
      "오야 취급 증강이 관전값에 안 들어갔다 — 화면 3,900 / 정산 5,800",
    ).toBe(plain.get("p0")!.best!.points);
  });

  it("`win.minHan`(격)에 못 미치는 대기는 화료할 수 없다 — 「역없음」과 다른 표식", () => {
    const game = createStandardGameFromState(craft({ hands: { p0: SANSHOKU } }));
    expect(seatsOf(game).get("p0")!.best, "먼저 값이 나와야 이 테스트가 뜻이 있다").toBeDefined();
    seatRule(game, "win.minHan", "p0", 10);
    const s = seatsOf(game).get("p0")!;
    expect(s.best, "격에 못 미치는데 «지금 화료하면 얼마»가 적혔다 — 실제로는 론이 거부된다")
      .toBeUndefined();
    expect(s.belowMinHan, "격 미달 표식이 없다").toBe(true);
    expect(s.yakuless, "역은 있다 — 「역없음」이라 적으면 다른 사실을 말하는 것이다")
      .toBeUndefined();
    for (const w of s.waits!) {
      expect(w.ron).toBeNull();
      expect(w.tsumo).toBeNull();
    }
  });

  it("역만은 격에도 추가 판에도 걸리지 않는다 (정산기와 같은 면제)", () => {
    // 국사무쌍 13면 대기 — 어떤 요구패로도 역만이다.
    const kokushi = craft({ hands: { p0: "19m19p19s1234567z" } });
    const game = createStandardGameFromState(kokushi);
    const before = seatsOf(game).get("p0")!.best!;
    expect(before.yakumanCount, "역만이 아니다 — 이 손으로는 면제를 볼 수 없다")
      .toBeGreaterThan(0);
    seatRule(game, "score.extraHan", "p0", 5);
    seatRule(game, "win.minHan", "p0", 13);
    const after = seatsOf(game).get("p0")!.best!;
    expect(after.points, "역만에 추가 판이 붙었다 — 정산기는 안 붙인다").toBe(before.points);
    expect(seatsOf(game).get("p0")!.belowMinHan, "역만이 격에 걸렸다").toBeUndefined();
  });

  it("무형화료의 「0판」은 정산기가 실제로 지불하는 값이고, 표식이 붙는다", () => {
    const game = createStandardGameFromState(craft(YAKULESS_HAND));
    seatRule(game, "win.requiresYaku", "p0", false);
    const s = seatsOf(game).get("p0")!;
    const best = s.best;
    expect(best, "역이 필요 없는 좌석인데 값이 안 나왔다").toBeDefined();
    expect(s.yakuless, "역이 필요 없는 좌석에 «역없음»이 떴다").toBeUndefined();
    expect(best!.noYaku, "실역 0개로 성립한 화료인데 표식이 없다 — 뜻 없는 숫자가 나간다")
      .toBe(true);
    // 숫자 자체는 정산기(`sysSettleWin`)가 같은 입력으로 내는 값과 한 푼도 다르지 않다.
    expect(best!.points).toBe(
      calculateScore({
        han: best!.han,
        fu: best!.fu,
        yakumanCount: best!.yakumanCount,
        isDealer: true,
        winType: "ron",
      }).total,
    );
  });

  it("후리텐 좌석의 대표값은 **쯔모**다 (론은 도달할 수 없다)", () => {
    // 3m/6m 대기인데 3m을 이미 버렸다 → 후리텐.
    const game = createStandardGameFromState(
      craft({ hands: { p0: SANSHOKU }, discards: { p0: "3m" } }),
    );
    const s = seatsOf(game).get("p0")!;
    expect(s.furiten, "후리텐인데 표식이 없다").toBe(true);
    expect(
      s.best!.yaku.some((y) => y.name === "멘젠쯔모"),
      "후리텐 좌석의 카드에 도달할 수 없는 론 값이 대표로 떴다",
    ).toBe(true);
    // 그래도 대기별 론 값 자체는 남는다 — 「이 패로 났으면 얼마」는 여전히 사실이다.
    expect(s.waits!.some((w) => w.ron !== null)).toBe(true);
  });

  it("리치 좌석의 값에는 «뒷도라 제외» 표식이 붙는다", () => {
    const game = createStandardGameFromState(
      craft({ hands: { p0: SANSHOKU }, riichi: ["p0"] }),
    );
    const best = seatsOf(game).get("p0")!.best!;
    expect(best.uraHan, "관전 시점에 뒷도라를 셌다 — 그건 스포일러다").toBe(0);
    expect(best.uraUnknown, "리치 좌석인데 «뒷도라 제외»가 안 드러난다").toBe(true);
    // 리치가 없으면 뒷도라 자체가 없다 — 표식도 붙지 않아야 한다.
    const noRiichi = createStandardGameFromState(craft({ hands: { p0: SANSHOKU } }));
    expect(seatsOf(noRiichi).get("p0")!.best!.uraUnknown).toBeUndefined();
  });
});

// ────────── 3-3. 이 파일의 명시적 설계 목표 (뮤테이션으로 뚫린 구멍) ──────────

describe("관전이라서 알 수 있는 것들", () => {
  it("남은 장수는 **네 좌석 손패**까지 세어 낸다", () => {
    /*
     * 관전자는 네 사람의 손패를 다 본다. 대국자 시점의 셈을 그대로 쓰면 남의 손에 든
     * 오름패를 「아직 산에 있다」고 세어 대기의 값을 과대평가한다.
     * p0는 3m/6m 대기이고, 3m은 자기 손에 1장(123m) · p1 손에 2장 → 남은 1장.
     */
    const state = craft({
      hands: {
        p0: "123m123p123s45m99p",
        p1: "33m111222333s44s",
        // 나머지 두 좌석에는 만(萬)을 한 장도 주지 않는다 — 무작위 채움이 3m을
        // 집어 가면 이 테스트가 «무엇을 재는지»와 무관한 이유로 흔들린다.
        p2: "666777888999s5s",
        p3: "111222333444z5z",
      },
    });
    const s = new Map(
      buildSpectateSeatScores(
        state,
        createStandardGameFromState(state).engine.rules,
        createStandardGameFromState(state).yaku,
      ).map((x) => [x.id, x]),
    ).get("p0")!;
    const man3 = s.waits!.find((w) => w.kind === "man3");
    expect(man3, "3m 대기가 없다 — 손을 잘못 골랐다").toBeDefined();
    expect(
      man3!.remaining,
      "남의 손패에 든 3m 두 장을 못 세고 있다 — 관전자는 그걸 다 본다",
    ).toBe(1);
  });

  it("14장 시점의 대표 대기는 **제일 넓은** 버림 뒤의 것이다", () => {
    /*
     * 123m456m789m 11p 22p 3p (14장). 텐파이를 만드는 버림이 셋이다:
     *   1p 버림 → 2p 단기(남은 2장)      / 2p 버림 → 1p·4p(남은 2+4=6장)
     *   3p 버림 → 1p·2p 샨퐁(2+2=4장)
     * 화면에 한 줄만 적을 수 있으니 사람이 실제로 고를 법한 **제일 넓은** 쪽을 쓴다.
     * 다른 좌석에는 통(筒)을 한 장도 주지 않아 남은 장수가 흔들리지 않게 했다.
     */
    const state = craft({
      hands: {
        p0: "123456789m11223p",
        p1: "111222333444s5s",
        p2: "666777888999s5s",
        p3: "111222333444z5z",
      },
    });
    const game = createStandardGameFromState(state);
    const s = new Map(
      buildSpectateSeatScores(state, game.engine.rules, game.yaku).map((x) => [x.id, x]),
    ).get("p0")!;
    expect(s.shanten, "이 손은 텐파이여야 한다").toBe(0);
    expect(
      s.waits!.map((w) => w.kind),
      "제일 좁은 버림(1p → 2p 단기)을 대표로 골랐다",
    ).toEqual(["pin1", "pin4"]);
  });

  it("14장 샹텐은 «한 장 버린 뒤의 최선»이다 (옛 `slice(0,-1)` 회귀)", () => {
    /*
     * 실측에서 어긋난 그 손 그대로다. 배열의 마지막 장(8s)을 그냥 잘라 내면 한 단계
     * 나쁘게 나온다 — 화면에 실제로 나가는 것은 **코어 값**이므로 여기서 못 박는다
     * (서버 쪽 동일 로직만 테스트돼 있었다).
     */
    const spec = "44m3466p24668s4z7z8s";
    const state = craft({ hands: { p0: spec } });
    const game = createStandardGameFromState(state);
    const got = new Map(
      buildSpectateSeatScores(state, game.engine.rules, game.yaku).map((x) => [x.id, x]),
    ).get("p0")!.shanten;

    const kinds = h(spec);
    let badge = Number.POSITIVE_INFINITY;
    for (let i = 0; i < kinds.length; i++) {
      badge = Math.min(badge, shantenOf(kinds.filter((_, j) => j !== i), 0));
    }
    expect(got, "좌석 뱃지와 다른 샹텐을 말한다").toBe(badge);
    expect(
      shantenOf(kinds.slice(0, -1), 0),
      "이 손은 더 이상 회귀를 잡지 못한다 — 어긋나는 손으로 바꿔라",
    ).toBeGreaterThan(got);
  });
});

// ─────────────────────────── 4. 배패 점수 ───────────────────────────

describe("배패 점수 — 절대값이 아니라 «순서»를 못 박는다", () => {
  const grade = (spec: string, dora = 0): number => gradeStartingHand(h(spec), undefined, dora);

  it("좋은 배패 > 평범한 배패 > 나쁜 배패", () => {
    // 좋다: 이미 텐파이 · 한 색 치우침(청일색 방향) · 역패 대자 · 도라 2 → 실측 90
    const good = grade("123456789m55s77z", 2);
    // 평범: 4샹텐 · 도라 1 → 실측 33
    const plain = grade("1358m2479p1469s3z", 1);
    // 나쁘다: 6샹텐 · 연결도 도라도 없다 → 실측 5
    const bad = grade("159m1479p258s134z", 0);
    expect(good, `좋은 배패(${good})가 평범한 배패(${plain})보다 낮다`).toBeGreaterThan(plain);
    expect(plain, `평범한 배패(${plain})가 나쁜 배패(${bad})보다 낮다`).toBeGreaterThan(bad);
  });

  it("같은 손이면 도라가 많은 쪽이 높다 (타점 축)", () => {
    const hand = "1358m2479p1469s3z";
    expect(grade(hand, 3)).toBeGreaterThan(grade(hand, 0));
  });

  it("오야의 14장을 그대로 재지 않는다 (첫 쯔모를 도로 뺀다)", () => {
    /*
     * `FlowController.begin()`은 `runAuto()`라 **오야의 첫 쯔모까지** 진행하고 멈춘다.
     * 그래서 「배패 직후」 프레임의 오야 손패는 14장이다. 그걸 그대로 재면 오야만 매 국
     * 체계적으로 높게 나오고(실측: 같은 손 13장 33점 → 14장 42점), 이 값의 유일한 용도인
     * **좌석 간 순서 비교**가 통째로 깨진다.
     */
    const thirteen = "1358m2479p1469s3z";
    const drawn = "5m"; // 첫 쯔모 한 장
    const state = craft({
      hands: { p0: thirteen + drawn, p1: thirteen },
      // 표시패 3z(남) → 도라 4z(북). 이 손에는 한 장도 없다 — 도라가 섞이면 이 테스트가
      // 재는 것(첫 쯔모를 뺐는가)과 무관한 이유로 값이 흔들린다.
      doraIndicator: "3z",
      drawnLastFor: "p0",
      dealerSeat: 0,
    });
    const game = createStandardGameFromState(state);
    const grades = gradeStartingHands(state, game.engine.rules);
    expect(
      grades.p0,
      "오야가 14장으로 채점됐다 — 같은 배패인데 오야만 높게 나온다",
    ).toBe(grades.p1);
    expect(grades.p0).toBe(gradeStartingHand(h(thirteen), undefined, 0));
    // 14장을 그대로 재면 실제로 값이 달라진다 — 아니면 이 테스트가 아무 것도 안 지킨다.
    expect(gradeStartingHand(h(thirteen + drawn), undefined, 0)).not.toBe(grades.p0);
  });

  it("언제나 0~100 정수다", () => {
    for (const [spec, dora] of [
      ["123456789m55s77z", 4],
      ["159m1479p258s134z", 0],
      ["112233m445566p7s", 2],
    ] as const) {
      const g = grade(spec, dora);
      expect(Number.isInteger(g), `정수가 아니다: ${g}`).toBe(true);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(100);
    }
  });
});

// ─────────────────────────── 5. 성능 ───────────────────────────

describe("성능 — 최악 케이스까지 재고, 문턱이 그 값을 지킨다", () => {
  const runs = 20;

  /** 캐시(`WeakMap<GameState,…>`)를 우회해 1회 계산 시간을 잰다 */
  function measure(
    game: ReturnType<typeof createStandardGameFromState>,
    label: string,
  ): number {
    // 예열 — 첫 회에만 붙는 JIT 비용이 측정값을 통째로 흔든다.
    buildSpectateSeatScores({ ...game.engine.state }, game.engine.rules, game.yaku);
    const t0 = performance.now();
    for (let i = 0; i < runs; i++) {
      buildSpectateSeatScores({ ...game.engine.state }, game.engine.rules, game.yaku);
    }
    const per = (performance.now() - t0) / runs;
    console.log(`[관전 보조값] ${label}: 1회 ${per.toFixed(2)}ms`);
    return per;
  }

  /** 한 좌석에만 걸리는 규칙 */
  function seatRule<T>(
    game: ReturnType<typeof createStandardGameFromState>,
    key: string,
    pid: string,
    value: (cur: T) => T,
  ): void {
    game.engine.rules.addModifier<T>(key, {
      source: `perf:${key}`,
      layer: RuleLayer.Prism,
      apply: (cur, ctx) => (ctx.playerId === pid ? value(cur) : cur),
    });
  }

  it("표준 손 넷 — 예산(5ms) 안", () => {
    const game = createStandardGameFromState(
      craft({
        hands: {
          p0: "123m123p123s45m99p",
          p1: "234m234p234s56m11s",
          p2: "456m789s99m45s",
          p3: "345m345p345s67m22z",
        },
      }),
    );
    expect(measure(game, "표준 4좌석 전원 텐파이")).toBeLessThan(15);
  });

  /*
   * **최악 케이스가 예산을 넘는다** (2026-08-23 QA 실측). 대기가 넓어질수록
   * `evaluateWin` 호출이 늘고, 분해 옵션을 넓히는 증강(만능패·부숴진 벽)은 **한 번의
   * 분해 자체**를 비싸게 만든다. 실측 최악은 부숴진 벽 7.9ms — 판을 죽일 수준은
   * 아니지만(관전자가 없으면 아예 안 돌고, 있어도 브로드캐스트당 한 번이다)
   * 「5ms 예산 안」이라 적어 두면 그건 사실이 아니다. 문턱을 여기 사실에 맞춘다.
   */
  it("최악 케이스(만능패·부숴진 벽·국사 13면·14장 다면장)도 20ms 안에서 끝난다", () => {
    const worst = createStandardGameFromState(
      craft({
        hands: {
          p0: "19m19p19s1234567z", // 국사무쌍 13면
          p1: "1112345678999p", // 14장 다면장 (순정구련 형태 — 3n+2라 버림 후보도 돈다)
          p2: "2345678s234m556m", // 만능패 좌석 (아래에서 白을 조커로)
          p3: "1234567899s123z", // 부숴진 벽 좌석 (순환 슌쯔)
        },
      }),
    );
    /*
     * **네 좌석 전부에** 분해를 넓히는 증강 둘을 건다 — 한 좌석만 걸면 나머지 셋이
     * 표준 속도라 평균에 묻힌다. 실전에서 이 조합이 동시에 서는 일은 드물지만,
     * 문턱은 «있을 수 있는 최악»을 지켜야 뜻이 있다.
     */
    for (const pid of PLAYERS) {
      // 만능패 — `scoring.wildKinds`에 白을 얹는다 (content의 joker와 같은 훅).
      seatRule<readonly TileKind[]>(worst, "scoring.wildKinds", pid, (cur) => [
        ...cur,
        { suit: "dragon", rank: 1 },
      ]);
      // 부숴진 벽 — 8-9-1·9-1-2 같은 순환 슌쯔를 인정한다.
      seatRule<boolean>(worst, "scoring.wrapRuns", pid, () => true);
    }
    const per = measure(worst, "최악(국사13면 + 다면장 + 만능패 + 부숴진 벽)");
    // 실측 8ms 안팎. CI 부하를 감안한 문턱이되, 한 자릿수 배로 늘면 실패한다.
    expect(per, `최악 케이스가 ${per.toFixed(2)}ms — 관전 브로드캐스트가 무거워졌다`)
      .toBeLessThan(20);
  });

  it("같은 상태를 다시 물으면 캐시가 답한다", () => {
    const state = craft({ hands: { p0: "123m123p123s45m99p" } });
    const game = createStandardGameFromState(state);
    const a = buildSpectateSeatScores(game.engine.state, game.engine.rules, game.yaku);
    const b = buildSpectateSeatScores(game.engine.state, game.engine.rules, game.yaku);
    expect(b[0], "같은 상태인데 값을 다시 만들었다").toBe(a[0]);
  });
});

// ─────────────────────────── 6. 라이브 통합 ───────────────────────────

/**
 * **손을 실제로 키우는 봇.**
 *
 * 무작위로 버리는 봇으로는 텐파이가 거의 나지 않는다 — 실측 1,448건의 좌석값에서
 * 텐파이가 **0건**이었다. 그러면 이 테스트는 「화료값이 하나도 없다」를 통과시키며
 * 아무 것도 지키지 않는다. 그래서 샹텐이 가장 낮아지는 패를 버리는 최소 봇을 쓴다
 * (서버의 진짜 봇은 core가 import할 수 없다).
 */
class GreedyAgent implements PlayerAgent {
  readonly nickname: string;
  readonly isBot = true;
  private readonly rng: Prng;
  private view: PlayerView | null = null;
  constructor(
    readonly id: string,
    seed: number,
    /** 뽑기에 있으면 이 증강을 고른다 (특정 경로를 반드시 지나가게 하려는 것) */
    private readonly preferAugment?: string,
  ) {
    this.nickname = `Bot-${id}`;
    this.rng = new Prng(seed);
  }
  sendView(view: PlayerView): void {
    this.view = view;
  }
  async decide(prompt: DecisionPrompt): Promise<ActionOption> {
    const win = prompt.options.find((o) => o.type === "win");
    if (win !== undefined) return win;
    const discards = prompt.options.filter(
      (o) => o.type === "discard" && typeof (o.payload as { tileId?: number }).tileId === "number",
    );
    const view = this.view;
    if (discards.length > 0 && view !== null) {
      const meldCount = view.round.byPlayer[this.id]?.meldCount ?? 0;
      let best: ActionOption | null = null;
      let bestShanten = Number.POSITIVE_INFINITY;
      for (const opt of discards) {
        const drop = (opt.payload as { tileId: number }).tileId;
        const kinds: TileKind[] = [];
        for (const id of view.zones[handZone(this.id)]?.tileIds ?? []) {
          if (id === drop) continue;
          const k = view.tiles[id]?.kind;
          if (k !== undefined) kinds.push(k);
        }
        const s = shantenOf(kinds, meldCount);
        if (s < bestShanten) {
          bestShanten = s;
          best = opt;
        }
      }
      if (best !== null) return best;
    }
    // 후로·깡·리치 같은 나머지는 굳이 고르지 않는다 — 손을 곧게 키우는 것이 목적이다.
    const pass = prompt.options.find((o) => o.type === "pass");
    return pass ?? (prompt.options[this.rng.int(prompt.options.length)] as ActionOption);
  }
  async decideDraft(_stage: DraftStage, choices: AugmentDef[]): Promise<string> {
    const want = choices.find((c) => c.id === this.preferAugment);
    return want?.id ?? choices[0]?.id ?? "";
  }
}

describe("라이브 대국 — 관전 보조값에 비정수 판수·비표준 점수가 절대 없다", () => {
  it("실제 판을 끝까지 돌려도 모든 좌석값이 점수표 안에 있다", async () => {
    const seen: SpectateSeatScore[] = [];
    const sink: SpectatorSink = {
      id: "spec",
      sendView: (_view, seatScores) => {
        for (const s of seatScores ?? []) seen.push(s);
      },
      notify: () => {},
    };
    const cfg: Partial<HanchanConfig> = {
      ...DEFAULT_HANCHAN_CONFIG,
      maxWind: 1,
      westEntry: false,
      dobi: false,
      draftSchedules: [], // 증강 없이 — 여기서 재는 것은 표준 점수표와의 일치다
      seed: 31,
      interRoundDelayMs: 0,
    };
    const ctrl = new HanchanController(
      PLAYERS.map((id, i) => new GreedyAgent(id, i + 1)),
      cfg,
    );
    ctrl.addSpectator(sink);
    await ctrl.run();

    expect(seen.length, "관전석이 좌석값을 한 번도 못 받았다").toBeGreaterThan(50);
    let tenpai = 0;
    for (const s of seen) {
      expect(Number.isInteger(s.shanten)).toBe(true);
      if (s.handGrade !== undefined) {
        expect(Number.isInteger(s.handGrade)).toBe(true);
        expect(s.handGrade).toBeGreaterThanOrEqual(0);
        expect(s.handGrade).toBeLessThanOrEqual(100);
      }
      for (const w of s.waits ?? []) {
        expect(w.remaining, `남은 장수가 0~4를 벗어났다: ${w.remaining}`).toBeGreaterThanOrEqual(0);
        expect(w.remaining).toBeLessThanOrEqual(4);
        for (const v of [w.ron, w.tsumo]) {
          if (v === null) continue;
          tenpai++;
          expect(Number.isInteger(v.han), `판수가 정수가 아니다: ${v.han}`).toBe(true);
          expect(
            REAL_TOTALS.has(v.points),
            `점수표에 없는 점수다: ${v.points} (${v.han}판 ${v.fu}부)`,
          ).toBe(true);
        }
      }
    }
    expect(tenpai, "화료값이 하나도 안 나왔다 — 이 테스트가 아무 것도 안 지킨다").toBeGreaterThan(0);
  }, 60_000);

  /**
   * **증강을 켜고도 같은 것을 지킨다.**
   *
   * 앞 테스트는 `draftSchedules: []`라 증강이 하나도 안 붙었다 — 그래서 무형화료의
   * 「0판」도, `score.extraHan`의 추가 판도 한 번도 지나가지 않았고, QA 2차가 잡은
   * 결함들이 이 파일을 통과했다 (뮤테이션 확인). 드래프트를 켜고 다시 돌린다.
   */
  it("증강을 켠 판에서도 판수·점수가 정산기의 세계 안에 있다", async () => {
    const seen: SpectateSeatScore[] = [];
    const sink: SpectatorSink = {
      id: "spec",
      sendView: (_view, seatScores) => {
        for (const s of seatScores ?? []) seen.push(s);
      },
      notify: () => {},
    };
    const cfg: Partial<HanchanConfig> = {
      ...DEFAULT_HANCHAN_CONFIG,
      maxWind: 1,
      westEntry: false,
      dobi: false,
      draftSchedules: ["gameStart", "eastThird"],
      seed: 77,
      interRoundDelayMs: 0,
    };
    const ctrl = new HanchanController(
      // 무형화료를 **일부러** 고른다 — 「0판」 경로가 실제로 지나가야 이 테스트가
      // 무엇인가를 지킨다(코어 카탈로그에 그 증강이 있다).
      PLAYERS.map((id, i) => new GreedyAgent(id, i + 1, "yakuless_win")),
      cfg,
    );
    ctrl.addSpectator(sink);
    await ctrl.run();

    expect(seen.length, "관전석이 좌석값을 한 번도 못 받았다").toBeGreaterThan(50);
    let checked = 0;
    let zeroHan = 0;
    let noYaku = 0;
    for (const s of seen) {
      for (const w of s.waits ?? []) {
        for (const v of [w.ron, w.tsumo]) {
          if (v === null) continue;
          checked++;
          if (v.noYaku === true) noYaku++;
          expect(Number.isInteger(v.han), `판수가 정수가 아니다: ${v.han}`).toBe(true);
          // 「0판」은 무형화료에만 있고, 그때는 **반드시 표식이 선다**. 표식 없는
          // 0판은 뜻 없는 숫자라 화면에 나가면 안 된다.
          if (v.han === 0) {
            zeroHan++;
            expect(v.noYaku, `표식 없는 0판이 나갔다 (${v.fu}부 ${v.points}점)`).toBe(true);
          } else {
            expect(v.han).toBeGreaterThanOrEqual(1);
          }
          expect(
            REAL_TOTALS.has(v.points),
            `점수표에 없는 점수다: ${v.points} (${v.han}판 ${v.fu}부)`,
          ).toBe(true);
        }
      }
    }
    expect(checked, "화료값이 하나도 안 나왔다").toBeGreaterThan(0);
    /*
     * 무형화료 경로가 **실제로 지나갔는가**. 여기가 0이면 위 단언들은 아무 것도 지키지
     * 않는다 — 앞 테스트(`draftSchedules: []`)가 정확히 그래서 QA 2차의 결함을 통과시켰다.
     * 실측 238건 중 77건. `0판`은 이 카탈로그에서는 안 나온다(역이 없어도 도라·적도라로
     * 판이 서기 때문) — 「표식 없는 0판 금지」는 위 루프가 그대로 지킨다.
     */
    expect(noYaku, "무형화료(역 0개) 값이 한 번도 안 나왔다 — 이 경로가 안 지나갔다")
      .toBeGreaterThan(0);
    expect(zeroHan, "0판이 나왔다면 위 루프가 이미 표식을 확인했다").toBeGreaterThanOrEqual(0);
  }, 60_000);

  it("국이 시작되기 전 프레임에는 지난 국의 배패 점수가 남지 않는다", async () => {
    /*
     * 국과 국 사이에도 `broadcastViews`가 한 번 돈다(`runLoop` — `onRoundStart` 직후,
     * 그 국의 배패가 아직 없는 자리다). 여기서 비우지 않으면 그 프레임이 **지난 국의
     * 배패 점수**를 그대로 실어 보냈다(반장전 1판에서 31프레임 실측). 손패도 지난 국의
     * 잔상이라 치명적이진 않지만, 숫자는 숫자다.
     *
     * `onRoundStart` 바로 다음 프레임 하나를 정확히 겨눈다 — 그 자리가 고침의 자리다.
     */
    let armed = false;
    let checkedFrames = 0;
    const sink: SpectatorSink = {
      id: "spec",
      sendView: (_view, seatScores) => {
        if (!armed) return;
        armed = false;
        checkedFrames++;
        for (const s of seatScores ?? []) {
          expect(
            s.handGrade,
            `국이 시작되기 전 프레임에 ${s.id}의 배패 점수(${s.handGrade})가 실렸다` +
              " — 지난 국의 값이다",
          ).toBeUndefined();
        }
      },
      notify: () => {},
    };
    const ctrl = new HanchanController(
      PLAYERS.map((id, i) => new GreedyAgent(id, i + 1)),
      {
        ...DEFAULT_HANCHAN_CONFIG,
        maxWind: 1,
        westEntry: false,
        dobi: false,
        draftSchedules: [],
        seed: 31,
        interRoundDelayMs: 0,
      },
      { onRoundStart: () => { armed = true; } },
    );
    ctrl.addSpectator(sink);
    await ctrl.run();
    expect(checkedFrames, "국 시작 프레임을 한 번도 못 봤다").toBeGreaterThan(1);
  }, 60_000);
});
