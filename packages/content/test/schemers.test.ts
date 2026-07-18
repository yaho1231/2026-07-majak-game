/**
 * schemers 그룹 테스트 — discard_lock(봉인술사) / pseudo_dealer(찬탈자) / seat_swap(자리 바꿈).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  SYSTEM_PLAYER,
  createStandardGame,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  isNumberSuit,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { viewKey } from "../src/util.js";
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

describe("discard_lock (봉인술사)", () => {
  it("첫 국 시작 시 상대 3명의 손패 수패 중 최대 3종을 봉인하고 본인만 확인 가능하다", () => {
    const game = createStandardGame({ seed: 42 });
    installAugment(game.engine, discardLock, "p0", { yaku: game.yaku });
    sys(game, "sys.startRound");

    const state = game.engine.state;
    for (const pid of ["p1", "p2", "p3"] as PlayerId[]) {
      // 봉인 목록은 보유자(p0) 전용 키에만 저장된다
      const sealed = state.augmentData[viewKey("p0", `sealed:${pid}`)];
      expect(Array.isArray(sealed)).toBe(true);
      // 전원 공개 키에는 없다 (전체 공개 X)
      expect(state.augmentData[viewKey("*", `sealed:${pid}`)]).toBeUndefined();
      const list = sealed as string[];
      expect(list.length).toBeGreaterThan(0);
      expect(list.length).toBeLessThanOrEqual(3);
      // 봉인된 kind는 실제로 그 플레이어 손패에 있는 수패 종류다
      const handNumberKinds = new Set(
        handIdsOf(state, pid)
          .map((id) => kindOf(state, id))
          .filter((k) => isNumberSuit(k))
          .map((k) => kindKey(k)),
      );
      for (const key of list) expect(handNumberKinds.has(key)).toBe(true);
      // 규칙(discard.blockedKinds)에도 그대로 반영된다
      const blocked = game.engine.rules.resolve<string[]>("discard.blockedKinds", {
        playerId: pid,
        state,
      });
      for (const key of list) expect(blocked).toContain(key);
    }
    // 보유자 본인은 봉인 대상이 아니다
    expect(state.augmentData[viewKey("p0", "sealed:p0")]).toBeUndefined();
    expect(
      game.engine.rules.resolve<string[]>("discard.blockedKinds", {
        playerId: "p0",
        state,
      }),
    ).toEqual([]);
    // 완료 플래그 기록 (게임당 1회)
    expect(state.augmentData["discard_lock:done:p0"]).toBe(true);
    // 난수 소비가 이벤트 payload를 거쳐 state.prngState에 반영되었다
    const sealedEvent = game.engine.eventLog.find((e) => e.type === "DiscardLockSealed");
    expect(sealedEvent).toBeDefined();
    expect((sealedEvent?.payload as { prngState: number }).prngState).toBe(state.prngState);
  });

  it("봉인은 게임당 1회 — 다음 국이 시작돼도 다시 봉인하지 않는다", () => {
    const game = createStandardGame({ seed: 7 });
    installAugment(game.engine, discardLock, "p0", { yaku: game.yaku });
    sys(game, "sys.startRound");
    const before = ["p1", "p2", "p3"].map(
      (pid) => game.engine.state.augmentData[viewKey("p0", `sealed:${pid}`)],
    );

    sys(game, "sys.settleAbort");
    sys(game, "sys.startRound"); // 두 번째 국 — 재봉인 없어야 한다
    const after = ["p1", "p2", "p3"].map(
      (pid) => game.engine.state.augmentData[viewKey("p0", `sealed:${pid}`)],
    );
    expect(after).toEqual(before);
    expect(
      game.engine.eventLog.filter((e) => e.type === "DiscardLockSealed"),
    ).toHaveLength(1);
  });

  it("상대는 봉인 kind를 버릴 수 없고, 봉인 아닌 패·보유자 본인은 영향 없다", () => {
    const base = craft({
      hands: { p0: "*", p1: "123m456p789s11z22z", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 1,
    });
    // 봉인 결과를 직접 주입해 검증을 결정적으로 만든다
    const state: GameState = {
      ...base,
      augmentData: {
        ...base.augmentData,
        // 봉인은 보유자(p0) 전용 키에 저장된다 (규칙이 이 키를 읽는다)
        [viewKey("p0", "sealed:p1")]: ["man1", "pin5", "sou9"],
        // 보유자 키가 있어도 본인에겐 적용되지 않아야 한다
        [viewKey("p0", "sealed:p0")]: ["man9"],
        "discard_lock:done:p0": true,
      },
    };
    const game = createStandardGameFromState(state);
    installAugment(game.engine, discardLock, "p0", { yaku: game.yaku });

    const hand = handIdsOf(game.engine.state, "p1");
    const tileOf = (key: string): TileId => {
      const id = hand.find((t) => kindKey(kindOf(game.engine.state, t)) === key);
      if (id === undefined) throw new Error(`no ${key} in hand`);
      return id;
    };

    // 봉인된 kind는 버릴 수 없다
    expect(discardValidate(game, "p1", tileOf("man1"))).toBe("tile kind is sealed");
    expect(discardValidate(game, "p1", tileOf("pin5"))).toBe("tile kind is sealed");
    // 봉인이 아닌 패는 정상 통과
    expect(discardValidate(game, "p1", tileOf("sou7"))).toBeNull();
    expect(discardValidate(game, "p1", tileOf("wind1"))).toBeNull();
    // 보유자 본인은 어떤 봉인도 적용되지 않는다
    expect(
      game.engine.rules.resolve<string[]>("discard.blockedKinds", {
        playerId: "p0",
        state: game.engine.state,
      }),
    ).toEqual([]);
  });
});

describe("pseudo_dealer (찬탈자)", () => {
  it("자기 턴에 게임당 1회 선언 → 다음 국 동안만 오야 취급(win.treatAsDealer)", () => {
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

    // 보유자 턴 프롬프트에 claim_dealer가 노출된다
    const flow = new FlowController(game.engine);
    const status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const prompt = status.prompts.find((p) => p.player === "p1");
    expect(prompt?.options.some((o) => o.type === "claim_dealer")).toBe(true);

    // 선언 실행 — "armed" + 사용 플래그, 선언한 국에는 아직 효과 없음
    const after = flow.submit("p1", { type: "claim_dealer", payload: {} });
    const st1 = game.engine.state;
    expect(st1.augmentData["pseudo_dealer:p1"]).toBe("armed");
    expect(st1.augmentData["pseudo_dealer:used:p1"]).toBe(true);
    expect(
      game.engine.rules.resolve<boolean>("win.treatAsDealer", { playerId: "p1", state: st1 }),
    ).toBe(false);

    // 선언 직후에도 턴은 이어지고, claim_dealer는 더 이상 제시되지 않는다 (discard는 유지)
    if (after.kind !== "awaiting") throw new Error("expected awaiting after claim");
    const reprompt = after.prompts.find((p) => p.player === "p1");
    expect(reprompt?.options.some((o) => o.type === "claim_dealer")).toBe(false);
    expect(reprompt?.options.some((o) => o.type === "discard")).toBe(true);

    // 국 종료 → "active": 다음 국 동안 보유자만 오야 취급
    sys(game, "sys.settleAbort");
    const st2 = game.engine.state;
    expect(st2.augmentData["pseudo_dealer:p1"]).toBe("active");
    expect(
      game.engine.rules.resolve<boolean>("win.treatAsDealer", { playerId: "p1", state: st2 }),
    ).toBe(true);
    expect(
      game.engine.rules.resolve<boolean>("win.treatAsDealer", { playerId: "p0", state: st2 }),
    ).toBe(false);

    // 그 다음 국 종료 → 해제 (연장 없음)
    sys(game, "sys.settleAbort");
    const st3 = game.engine.state;
    expect(
      game.engine.rules.resolve<boolean>("win.treatAsDealer", { playerId: "p1", state: st3 }),
    ).toBe(false);

    // 게임당 1회 — 재선언은 거부
    expect(
      def.validate(
        { player: "p1", type: "claim_dealer", payload: {} },
        { state: st3, rules: game.engine.rules },
      ),
    ).toBe("claim_dealer already used");
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
  it("상대 지정 선언 → ROUND_SETTLED 이후 두 명의 seat가 교환되고 예약이 해제된다", () => {
    const base = craft({
      hands: { p0: "123m456p789s11z22z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(withAugments(base, { p0: ["seat_swap"] }));
    installAugment(game.engine, seatSwap, "p0", { yaku: game.yaku });

    const ctx = { state: game.engine.state, rules: game.engine.rules };
    const def = game.engine.actions.get("seat_swap");
    if (def === undefined) throw new Error("no seat_swap action");
    // 자기 자신·미지의 대상·비보유자는 거부
    expect(
      def.validate({ player: "p0", type: "seat_swap", payload: { target: "p0" } }, ctx),
    ).toBe("cannot swap with yourself");
    expect(
      def.validate({ player: "p0", type: "seat_swap", payload: { target: "px" } }, ctx),
    ).toBe("unknown target");
    expect(
      def.validate({ player: "p1", type: "seat_swap", payload: { target: "p0" } }, ctx),
    ).toBe("no seat_swap augment");

    // p2 지정 선언 — 즉시 자리가 바뀌지는 않는다 (예약만)
    const result = game.engine.submit({
      player: "p0",
      type: "seat_swap",
      payload: { target: "p2" },
    });
    expect(result.ok).toBe(true);
    expect(game.engine.state.augmentData["seat_swap:p0"]).toBe("p2");
    expect(game.engine.state.augmentData["seat_swap:used:p0"]).toBe(true);
    expect(seatOf(game, "p0")).toBe(0);
    expect(seatOf(game, "p2")).toBe(2);

    // 국 종료 → 자리 교환 + 예약 해제
    sys(game, "sys.settleAbort");
    expect(seatOf(game, "p0")).toBe(2);
    expect(seatOf(game, "p2")).toBe(0);
    expect(seatOf(game, "p1")).toBe(1);
    expect(seatOf(game, "p3")).toBe(3);
    expect(game.engine.state.augmentData["seat_swap:p0"]).toBeNull();
    expect(game.engine.eventLog.some((e) => e.type === "SeatsSwapped")).toBe(true);

    // 게임당 1회 — 재사용 거부, 이후 국 종료에도 더 이상 교환 없음
    expect(
      def.validate(
        { player: "p0", type: "seat_swap", payload: { target: "p1" } },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("seat_swap already used");
    sys(game, "sys.settleAbort");
    expect(seatOf(game, "p0")).toBe(2);
    expect(seatOf(game, "p2")).toBe(0);
  });

  it("보유자 턴 프롬프트에 상대 3명 각각의 교환 후보가 노출된다", () => {
    const base = craft({
      hands: { p0: "123m456p789s11z22z", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
    });
    const game = createStandardGameFromState(withAugments(base, { p0: ["seat_swap"] }));
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
