/**
 * schemers 그룹 테스트 — discard_lock(봉인술사) / pseudo_dealer(찬탈자) / seat_swap(자리 바꿈).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  SPECTATOR_ID,
  SYSTEM_PLAYER,
  buildPlayerView,
  createStandardGame,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  isNumberSuit,
  kindKey,
  kindOf,
  seatWindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { roundViewKey, viewKey } from "../src/util.js";
import { discardLock } from "../src/augments/discard_lock.js";
import { pseudoDealer } from "../src/augments/pseudo_dealer.js";
import { seatSwap } from "../src/augments/seat_swap.js";

type Game = ReturnType<typeof createStandardGameFromState>;

/** state.players[].augments에 증강 보유를 직접 주입한다 (드래프트 이벤트 생략) */
function withAugments(state: GameState, grants: Record<PlayerId, string[]>): GameState {
  return {
    ...state,
    players: state.players.map((p) => {
      const extra = grants[p.id];
      return extra === undefined ? p : { ...p, augments: [...p.augments, ...extra] };
    }),
  };
}

/** 시스템 액션 제출 (실패 시 즉시 예외) */
function sys(game: Game, type: string): void {
  const result = game.engine.submit({ player: SYSTEM_PLAYER, type, payload: {} });
  if (!result.ok) throw new Error(`${type} failed: ${result.reason}`);
}

function discardValidate(game: Game, player: PlayerId, tileId: TileId): string | null {
  const def = game.engine.actions.get("discard");
  if (def === undefined) throw new Error("no discard action");
  return def.validate(
    { player, type: "discard", payload: { tileId } },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

function seatOf(game: Game, player: PlayerId): number {
  const p = game.engine.state.players.find((x) => x.id === player);
  if (p === undefined) throw new Error(`unknown player: ${player}`);
  return p.seat;
}

/** seal_hands 액션 validate (사유 문자열 또는 null) */
function sealValidate(game: Game, player: PlayerId): string | null {
  const def = game.engine.actions.get("seal_hands");
  if (def === undefined) throw new Error("no seal_hands action");
  return def.validate(
    { player, type: "seal_hands", payload: {} },
    { state: game.engine.state, rules: game.engine.rules },
  );
}

describe("discard_lock (봉인술사)", () => {
  it("액티브 발동 시 상대 3명의 손패 수패 중 최대 2종을 봉인하고 본인만 확인 가능하다", () => {
    // 자기 턴의 국 첫 행동(버림 전) 상태를 만든다 — p0(seat 0)이 발동 조건을 만족한다.
    const base = withAugments(
      craft({
        hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
        phase: "turn.act",
        turnSeat: 0,
        seed: 42,
      }),
      { p0: ["discard_lock"] },
    );
    const game = createStandardGameFromState(base);
    installAugment(game.engine, discardLock, "p0", { yaku: game.yaku });

    // 발동 전에는 봉인이 없다
    expect(game.engine.eventLog.some((e) => e.type === "DiscardLockSealed")).toBe(false);

    const res = game.engine.submit({ player: "p0", type: "seal_hands", payload: {} });
    expect(res.ok).toBe(true);

    const state = game.engine.state;
    for (const pid of ["p1", "p2", "p3"] as PlayerId[]) {
      // 봉인 목록은 보유자(p0) 전용 키에만 저장된다
      const sealed = state.augmentData[roundViewKey("p0", `sealed:${pid}`)];
      expect(Array.isArray(sealed)).toBe(true);
      // 전원 공개 키에는 없다 (전체 공개 X)
      expect(state.augmentData[roundViewKey("*", `sealed:${pid}`)]).toBeUndefined();
      const list = sealed as string[];
      expect(list.length).toBeGreaterThan(0);
      expect(list.length).toBeLessThanOrEqual(2);
      // 봉인된 kind는 실제로 그 플레이어 손패에 있는 수패 종류다
      const handNumberKinds = new Set(
        handIdsOf(state, pid)
          .map((id) => kindOf(state, id))
          .filter((k) => isNumberSuit(k))
          .map((k) => kindKey(k)),
      );
      for (const key of list) expect(handNumberKinds.has(key)).toBe(true);
      // 규칙은 **개별 패**(discard.blockedTileIds)로 걸린다 — 봉인 시점 손패의 그 패들.
      const blockedIds = game.engine.rules.resolve<TileId[]>("discard.blockedTileIds", {
        playerId: pid,
        state,
      });
      expect(blockedIds.length).toBeGreaterThan(0);
      for (const id of blockedIds) {
        expect(handIdsOf(state, pid)).toContain(id);
        expect(list).toContain(kindKey(kindOf(state, id)));
      }
    }
    // 보유자 본인은 봉인 대상이 아니다
    expect(state.augmentData[roundViewKey("p0", "sealed:p0")]).toBeUndefined();
    expect(
      game.engine.rules.resolve<TileId[]>("discard.blockedTileIds", {
        playerId: "p0",
        state,
      }),
    ).toEqual([]);
    // 발동 국 시퀀스 기록 (쿨다운 기준) — craft 상태는 seq 0
    expect(state.augmentData["discard_lock:used:p0"]).toBe(0);
    // 난수 소비가 이벤트 payload를 거쳐 state.prngState에 반영되었다
    const sealedEvent = game.engine.eventLog.find((e) => e.type === "DiscardLockSealed");
    expect(sealedEvent).toBeDefined();
    expect((sealedEvent?.payload as { prngState: number }).prngState).toBe(state.prngState);
  });

  it("국 시작만으로는 봉인하지 않고, 매 국 쿨다운 카운터만 오른다 (자동 발동 없음)", () => {
    const game = createStandardGame({ seed: 7 });
    installAugment(game.engine, discardLock, "p0", { yaku: game.yaku });
    sys(game, "sys.startRound");
    // 자동 봉인이 사라졌다 — 이벤트도, 봉인 목록도 없다
    expect(
      game.engine.eventLog.some((e) => e.type === "DiscardLockSealed"),
    ).toBe(false);
    for (const pid of ["p1", "p2", "p3"]) {
      expect(game.engine.state.augmentData[roundViewKey("p0", `sealed:${pid}`)]).toBeUndefined();
    }
    // 국 시퀀스(쿨다운 기준)는 첫 국에 1로 올라간다
    expect(game.engine.state.augmentData["discard_lock:seq:p0"]).toBe(1);
  });

  it("2국 쿨다운 — 발동 국 이후 2국이 지나야 다시 봉인할 수 있다", () => {
    // seq/used를 직접 주입해 쿨다운 판정(validate)만 결정적으로 확인한다.
    const mk = (seq: number, used: number | undefined): string | null => {
      const base = withAugments(
        craft({
          hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
          phase: "turn.act",
          turnSeat: 0,
          seed: 7,
        }),
        { p0: ["discard_lock"] },
      );
      const state: GameState = {
        ...base,
        augmentData: {
          ...base.augmentData,
          "discard_lock:seq:p0": seq,
          ...(used === undefined ? {} : { "discard_lock:used:p0": used }),
        },
      };
      const game = createStandardGameFromState(state);
      installAugment(game.engine, discardLock, "p0", { yaku: game.yaku });
      return sealValidate(game, "p0");
    };
    expect(mk(1, undefined)).toBeNull(); // 한 번도 안 씀 → 가능
    expect(mk(1, 1)).toBe("on cooldown"); // 방금 쓴 국
    expect(mk(2, 1)).toBe("on cooldown"); // 1국 경과 — 아직
    expect(mk(3, 1)).toBeNull(); // 2국 경과 → 다시 가능
  });

  it("국 도중(이미 버린 뒤)·상대 턴에는 봉인 버튼이 활성화되지 않는다", () => {
    // p0이 이미 한 번 버린 상태(discardedKinds 비어 있지 않음) → 첫 시작 아님
    const base = withAugments(
      craft({
        hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
        discards: { p0: "1m" },
        phase: "turn.act",
        turnSeat: 0,
        seed: 5,
      }),
      { p0: ["discard_lock"] },
    );
    const midTurn = createStandardGameFromState(base);
    installAugment(midTurn.engine, discardLock, "p0", { yaku: midTurn.yaku });
    expect(sealValidate(midTurn, "p0")).toBe("not at round start");

    // 상대(p1) 턴이면 내 턴이 아니다
    const notMyTurn = createStandardGameFromState(
      withAugments(
        craft({
          hands: { p0: "*", p1: "*", p2: "*", p3: "*" },
          phase: "turn.act",
          turnSeat: 1,
          seed: 5,
        }),
        { p0: ["discard_lock"] },
      ),
    );
    installAugment(notMyTurn.engine, discardLock, "p0", { yaku: notMyTurn.yaku });
    expect(sealValidate(notMyTurn, "p0")).toBe("not your turn");
  });

  /**
   * 봉인 결과(실제 잠긴 tileId)를 직접 주입한 상태를 만든다 — 검증을 결정적으로.
   * 봉인은 종류가 아니라 **그 순간 손에 있던 그 패들**을 잠근다.
   */
  const withSealedTiles = (
    kinds: readonly string[],
  ): { game: Game; tileOf: (key: string) => TileId } => {
    const base = craft({
      hands: { p0: "*", p1: "123m456p789s11z22z", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
    });
    const idOf = (key: string): TileId => {
      const id = handIdsOf(base, "p1").find(
        (t) => kindKey(kindOf(base, t)) === key,
      );
      if (id === undefined) throw new Error(`no ${key} in hand`);
      return id;
    };
    const state: GameState = {
      ...base,
      augmentData: {
        ...base.augmentData,
        // 표시용 종류 목록과 실제 잠긴 패 목록 — 둘 다 보유자(p0) 전용 키
        [roundViewKey("p0", "sealed:p1")]: [...kinds],
        [roundViewKey("p0", "discardLockReveal:p1")]: kinds.map(idOf),
        // 보유자 키가 있어도 본인에겐 적용되지 않아야 한다
        [roundViewKey("p0", "sealed:p0")]: ["man9"],
        [roundViewKey("p0", "discardLockReveal:p0")]: [handIdsOf(base, "p0")[0] as TileId],
      },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, discardLock, "p0", { yaku: game.yaku });
    return { game, tileOf: idOf };
  };

  it("상대는 봉인된 그 패를 버릴 수 없고, 봉인 아닌 패·보유자 본인은 영향 없다", () => {
    const { game, tileOf } = withSealedTiles(["man1", "pin5", "sou9"]);

    // 봉인된 그 패는 버릴 수 없다
    expect(discardValidate(game, "p1", tileOf("man1"))).toBe("tile is sealed");
    expect(discardValidate(game, "p1", tileOf("pin5"))).toBe("tile is sealed");
    // 봉인이 아닌 패는 정상 통과
    expect(discardValidate(game, "p1", tileOf("sou7"))).toBeNull();
    expect(discardValidate(game, "p1", tileOf("wind1"))).toBeNull();
    // 보유자 본인은 어떤 봉인도 적용되지 않는다
    expect(
      game.engine.rules.resolve<TileId[]>("discard.blockedTileIds", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toEqual([]);
  });

  it("봉인 뒤 같은 종류가 새로 들어와도 그 패는 잠기지 않는다 (처음 지목된 2장만)", () => {
    const { game, tileOf } = withSealedTiles(["man1"]);
    const sealedId = tileOf("man1");
    // 같은 종류(man1)의 **다른 실물 패**를 손에 하나 더 넣는다 (새로 쯔모한 셈)
    const extra = Object.values(game.engine.state.tiles).find(
      (t) => kindKey(t.kind) === "man1" && t.id !== sealedId,
    );
    expect(extra).toBeDefined();
    const st = game.engine.state;
    const patched: GameState = {
      ...st,
      zones: {
        ...st.zones,
        [`hand:p1`]: {
          ...(st.zones["hand:p1"] as GameState["zones"][string]),
          tileIds: [...(st.zones["hand:p1"]?.tileIds ?? []), (extra as { id: TileId }).id],
        },
      },
    };
    const g2 = createStandardGameFromState(patched);
    installAugment(g2.engine, discardLock, "p0", { yaku: g2.yaku });
    expect(discardValidate(g2, "p1", sealedId)).toBe("tile is sealed");
    expect(discardValidate(g2, "p1", (extra as { id: TileId }).id)).toBeNull();
  });

  it("봉인 대상은 자기 뷰 sealedTileIds로 잠긴 패를 본다 (타인 비노출, 관전자 전원 노출)", () => {
    const { game, tileOf } = withSealedTiles(["man1", "pin5", "sou9"]);
    const expected = ["man1", "pin5", "sou9"].map(tileOf);

    // 봉인 대상 본인 뷰 — 자기 국 상태에 sealedTileIds가 실린다 (자물쇠 표시용)
    const viewP1 = buildPlayerView(game.engine.state, "p1", game.engine.rules);
    expect(viewP1.round.byPlayer["p1"]?.sealedTileIds?.sort()).toEqual([...expected].sort());

    // 제3자 뷰에서는 남의 봉인이 보이지 않는다
    const viewP2 = buildPlayerView(game.engine.state, "p2", game.engine.rules);
    expect(viewP2.round.byPlayer["p1"]?.sealedTileIds).toBeUndefined();

    // 보유자 본인 패는 봉인되지 않는다 (sealed:p0 키가 있어도 무시)
    const viewP0 = buildPlayerView(game.engine.state, "p0", game.engine.rules);
    expect(viewP0.round.byPlayer["p0"]?.sealedTileIds).toBeUndefined();

    // 관전자(리플레이 포함)는 전원의 봉인을 본다
    const spec = buildPlayerView(game.engine.state, SPECTATOR_ID, game.engine.rules);
    expect(spec.round.byPlayer["p1"]?.sealedTileIds?.sort()).toEqual([...expected].sort());
    expect(spec.round.byPlayer["p2"]?.sealedTileIds).toBeUndefined();
  });
});

describe("pseudo_dealer (찬탈자)", () => {
  it("자기 턴에 선언하면 그 즉시 오야 자리를 빼앗고 자풍이 다시 매겨진다 (2국당 1회)", () => {
    const base = craft({
      hands: { p0: "*", p1: "123m456p789s11z22z", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
    });
    const game = createStandardGameFromState(withAugments(base, { p1: ["pseudo_dealer"] }));
    installAugment(game.engine, pseudoDealer, "p1", { yaku: game.yaku });

    // 비보유자는 선언 불가
    const def = game.engine.actions.get("claim_dealer");
    if (def === undefined) throw new Error("no claim_dealer action");
    expect(
      def.validate(
        { player: "p2", type: "claim_dealer", payload: {} },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("no pseudo_dealer augment");

    // 시작 시점 오야는 p0(자리 0), p1의 자풍은 남(2)
    expect(game.engine.state.round.dealerSeat).toBe(0);
    expect(seatWindOf(game.engine.state, "p1")).toBe(2);

    // 보유자 턴 프롬프트에 claim_dealer가 노출된다
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p1");
    expect(prompt?.options.some((o) => o.type === "claim_dealer")).toBe(true);

    // 선언 실행 — 오야 자리가 p1로 넘어오고 자풍이 p1 기준으로 다시 정해진다
    const after = flow.submit("p1", { type: "claim_dealer", payload: {} });
    const st1 = game.engine.state;
    expect(st1.round.dealerSeat).toBe(1);
    expect(seatWindOf(st1, "p1")).toBe(1); // 동(오야)
    expect(seatWindOf(st1, "p0")).toBe(4); // 원래 오야는 북으로 밀린다
    expect(st1.augmentData["pseudo_dealer:cd:p1"]).toBe(2);

    // 선언 직후에도 턴은 이어지고, claim_dealer는 더 이상 제시되지 않는다 (discard는 유지)
    if (after.kind !== "awaiting") throw new Error("expected awaiting after claim");
    const reprompt = after.prompts.find((p) => p.player === "p1");
    expect(reprompt?.options.some((o) => o.type === "claim_dealer")).toBe(false);
    expect(reprompt?.options.some((o) => o.type === "discard")).toBe(true);

    // 국이 끝나도 오야 자리는 되돌아가지 않는다 (진짜 강탈) — 쿨다운만 줄어든다
    sys(game, "sys.settleAbort");
    const st2 = game.engine.state;
    expect(st2.augmentData["pseudo_dealer:cd:p1"]).toBe(1);
    // 쿨다운 중 재선언 거부
    expect(
      def.validate(
        { player: "p1", type: "claim_dealer", payload: {} },
        { state: st2, rules: game.engine.rules },
      ),
    ).toBe("claim_dealer on cooldown");

    // 다음 국 종료 → 쿨다운 0, 다시 선언 가능
    sys(game, "sys.settleAbort");
    const st3 = game.engine.state;
    expect(st3.augmentData["pseudo_dealer:cd:p1"]).toBe(0);
    expect(
      def.validate(
        { player: "p1", type: "claim_dealer", payload: {} },
        { state: st3, rules: game.engine.rules },
      ),
    ).not.toBe("claim_dealer on cooldown");
  });

  it("자기 턴이 아니면 선언할 수 없다", () => {
    const base = craft({
      hands: { p0: "*", p1: "123m456p789s11z22z", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0, // p0의 턴
    });
    const game = createStandardGameFromState(withAugments(base, { p1: ["pseudo_dealer"] }));
    installAugment(game.engine, pseudoDealer, "p1", { yaku: game.yaku });
    const def = game.engine.actions.get("claim_dealer");
    if (def === undefined) throw new Error("no claim_dealer action");
    expect(
      def.validate(
        { player: "p1", type: "claim_dealer", payload: {} },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("not your turn");
  });
});

describe("seat_swap (자리 바꿈)", () => {
  // 52차(docs/16 §1b F): "다음 국부터"라는 지연을 없애고 **즉시 적용**으로 바꿨다.
  // 발동 창은 내 첫 순(첫 바퀴에서 내가 아직 버리지 않았을 때)이다.
  /** 첫 바퀴·아무도 안 버린 상태 (craft는 firstTurn:false라 직접 켜 준다) */
  function craftFirstTurn(turnSeat = 0): GameState {
    const base = craft({
      hands: { p0: "123m456p789s11z22z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat,
    });
    return { ...base, round: { ...base.round, firstTurn: true } };
  }

  it("내 첫 순에 상대를 지정하면 그 자리에서 즉시 자리가 바뀐다", () => {
    // 동풍전(tonpuu)으로 열어 사용 1회 — 재사용 거부까지 한 번에 검증
    const base = craftFirstTurn();
    const tonpuu: GameState = { ...base, config: { ...base.config, mode: "tonpuu" } };
    const game = createStandardGameFromState(
      withAugments(tonpuu, { p0: ["seat_swap"] }),
    );
    installAugment(game.engine, seatSwap, "p0", { yaku: game.yaku });

    const ctx = { state: game.engine.state, rules: game.engine.rules };
    const def = game.engine.actions.get("seat_swap");
    if (def === undefined) throw new Error("no seat_swap action");
    expect(
      def.validate({ player: "p0", type: "seat_swap", payload: { target: "p0" } }, ctx),
    ).toBe("cannot swap with yourself");
    expect(
      def.validate({ player: "p0", type: "seat_swap", payload: { target: "px" } }, ctx),
    ).toBe("unknown target");
    expect(
      def.validate({ player: "p1", type: "seat_swap", payload: { target: "p0" } }, ctx),
    ).toBe("no seat_swap augment");

    const before = { p0: seatOf(game, "p0"), p2: seatOf(game, "p2") };
    const result = game.engine.submit({
      player: "p0",
      type: "seat_swap",
      payload: { target: "p2" },
    });
    expect(result.ok).toBe(true);

    // 예약이 아니라 즉시 교환 — 정산을 기다리지 않는다
    expect(seatOf(game, "p0")).toBe(before.p2);
    expect(seatOf(game, "p2")).toBe(before.p0);
    expect(seatOf(game, "p1")).toBe(1);
    expect(seatOf(game, "p3")).toBe(3);
    expect(game.engine.state.augmentData["seat_swap:uses:p0"]).toBe(1);
    expect(game.engine.eventLog.some((e) => e.type === "SeatsSwapped")).toBe(true);

    // 반장전 3회 — 아직 남아 있다 (2026-07-31 버프: matchUses + 1)
    expect(
      def.validate(
        { player: "p0", type: "seat_swap", payload: { target: "p1" } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBeNull();
    // 다 쓰면 거부된다
    const spent: GameState = {
      ...game.engine.state,
      augmentData: { ...game.engine.state.augmentData, "seat_swap:uses:p0": 3 },
    };
    expect(
      def.validate(
        { player: "p0", type: "seat_swap", payload: { target: "p1" } },
        { state: spent, rules: game.engine.rules },
      ),
    ).toBe("seat_swap no uses left");
  });

  it("오야를 지목하면 그 국의 오야를 그 자리에서 빼앗아 온다", () => {
    // p1이 자기 첫 순에 오야(자리 0의 p0)를 지목한다 — 앞사람이 이미 버린 뒤여도 된다
    const base = craftFirstTurn(1);
    const state: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p0: { ...base.round.byPlayer.p0!, discardedKinds: ["m1"] },
        },
      },
    };
    const game = createStandardGameFromState(withAugments(state, { p1: ["seat_swap"] }));
    installAugment(game.engine, seatSwap, "p1", { yaku: game.yaku });

    const dealerSeat = game.engine.state.round.dealerSeat;
    const dealerBefore = game.engine.state.players.find((p) => p.seat === dealerSeat)?.id;
    expect(dealerBefore).toBe("p0");

    const r = game.engine.submit({
      player: "p1",
      type: "seat_swap",
      payload: { target: "p0" },
    });
    expect(r.ok).toBe(true);

    const dealerAfter = game.engine.state.players.find(
      (p) => p.seat === game.engine.state.round.dealerSeat,
    )?.id;
    expect(dealerAfter).toBe("p1"); // 오야를 훔쳐 왔다
  });

  it("내가 이미 버린 뒤에는 쓸 수 없다", () => {
    const base = craftFirstTurn();
    const state: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p0: { ...base.round.byPlayer.p0!, discardedKinds: ["m1"] },
        },
      },
    };
    const game = createStandardGameFromState(withAugments(state, { p0: ["seat_swap"] }));
    installAugment(game.engine, seatSwap, "p0", { yaku: game.yaku });
    const def = game.engine.actions.get("seat_swap");
    expect(
      def?.validate(
        { player: "p0", type: "seat_swap", payload: { target: "p2" } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("you already discarded this round");
  });

  it("이미 리치 선언한 상대는 지목할 수 없다 (리치=텐파이 불변식 보호)", () => {
    const base = craftFirstTurn();
    const state: GameState = {
      ...base,
      round: {
        ...base.round,
        byPlayer: {
          ...base.round.byPlayer,
          p2: {
            ...base.round.byPlayer.p2!,
            riichi: { double: false, ippatsu: false, discardIndex: 0 },
          },
        },
      },
    };
    const game = createStandardGameFromState(withAugments(state, { p0: ["seat_swap"] }));
    installAugment(game.engine, seatSwap, "p0", { yaku: game.yaku });
    const def = game.engine.actions.get("seat_swap");
    expect(
      def?.validate(
        { player: "p0", type: "seat_swap", payload: { target: "p2" } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("target already riichi");
    // 리치 안 한 상대는 그대로 지목 가능
    expect(
      def?.validate(
        { player: "p0", type: "seat_swap", payload: { target: "p1" } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBeNull();
  });

  it("보유자 턴 프롬프트에 상대 3명 각각의 교환 후보가 노출된다", () => {
    const game = createStandardGameFromState(
      withAugments(craftFirstTurn(), { p0: ["seat_swap"] }),
    );
    installAugment(game.engine, seatSwap, "p0", { yaku: game.yaku });

    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p0");
    const targets = (prompt?.options ?? [])
      .filter((o) => o.type === "seat_swap")
      .map((o) => (o.payload as { target: PlayerId }).target)
      .sort();
    expect(targets).toEqual(["p1", "p2", "p3"]);
  });
});
