/**
 * 삼세 예지 (triple_peek) 동작 테스트.
 *
 * 핵심 계약:
 *  1. 자기 턴(turn.act)에 선언할 수 있고, 선언은 **2국에 1회**다(2026-08-12 하향 —
 *     매 국 1회였다). "N국에 1회" 공용 배관(trackRoundSeq/cooldownReady)을 쓴다.
 *  2. 선언하면 내 다음 쯔모 3장의 **종류(kindKey 문자열)**가 보유자 전용 채널로 나간다.
 *  3. 그 3개는 패산에서 보유자가 실제로 뽑게 될 패의 kind다(자리 회전으로 검증).
 *  4. 그 값은 **스냅샷이 아니라 실시간**이다 — 쯔모·버림·후로마다 다시 계산된다
 *     (2026-08-12: 후로로 차례가 밀리면 예언이 통째로 어긋나던 버그를 고치며 바뀌었다).
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  WALL,
  createStandardGameFromState,
  installAugment,
  kindKey,
  kindOf,
  nextSeat,
  playerAtSeat,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { triplePeek } from "../src/augments/triple_peek.js";

const ID = "triple_peek";
const ACTION = "triple_peek_use";

function withAugments(
  state: GameState,
  player: PlayerId,
  augments: string[],
): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...augments] } : p,
    ),
  };
}

/** 테스트가 impl과 독립적으로 예지 결과를 계산한다 (자리 회전 복제). */
function expectedPeek(state: GameState, holder: PlayerId, dir = 1): string[] {
  const wall = state.zones[WALL]?.tileIds ?? [];
  let seat = nextSeat(state, state.round.turnSeat, dir);
  const kinds: string[] = [];
  for (let i = 0; i < wall.length && kinds.length < 3; i++) {
    const tileId = wall[i];
    if (tileId !== undefined && playerAtSeat(state, seat).id === holder) {
      kinds.push(kindKey(kindOf(state, tileId)));
    }
    seat = nextSeat(state, seat, dir);
  }
  return kinds;
}

/** p0 턴, p0이 삼세 예지 보유. 패산은 leftover에서 알려진 12장으로 고정한다. */
function scene(): GameState {
  const base = craft({
    hands: { p0: "123m456p789s11z2z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  // 패산을 leftover 앞 12장으로 고정 — 결정론적 예지 검증용
  const wallZone = base.zones[WALL];
  if (wallZone === undefined) throw new Error("no wall");
  const fixed: TileId[] = wallZone.tileIds.slice(0, 12);
  const scened: GameState = {
    ...base,
    zones: { ...base.zones, [WALL]: { ...wallZone, tileIds: fixed } },
  };
  return withAugments(scened, "p0", [ID]);
}

function startFlow(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, triplePeek, "p0", { yaku: game.yaku });
  const flow = new FlowController(game.engine);
  const status = flow.begin();
  if (status.kind !== "awaiting") throw new Error("expected awaiting");
  return { game, flow, status };
}

describe("삼세 예지 (triple_peek)", () => {
  it("자기 턴에 선언 후보가 뜬다", () => {
    const { status } = startFlow(scene());
    const prompt = status.prompts.find((p) => p.player === "p0");
    const opt = prompt?.options.filter((o) => o.type === ACTION) ?? [];
    expect(opt).toHaveLength(1);
  });

  it("선언하면 다음 쯔모 3장의 kindKey가 보유자 전용 채널로 나간다", () => {
    const scn = scene();
    const expected = expectedPeek(scn, "p0");
    expect(expected).toHaveLength(3);

    const { game, flow } = startFlow(scn);
    flow.submit("p0", { type: ACTION, payload: {} });

    const result = game.engine.state.augmentData[`view:p0:${ID}#round`];
    // 배열 · 길이 3 · 전부 kindKey 문자열
    expect(Array.isArray(result)).toBe(true);
    const arr = result as unknown[];
    expect(arr).toHaveLength(3);
    for (const k of arr) expect(typeof k).toBe("string");
    // 자리 회전으로 독립 계산한 값과 정확히 일치
    expect(arr).toEqual(expected);

    // 발동 사실만 담은 전원 공개 마커가 존재한다 (내용 없음)
    expect(game.engine.state.augmentData[`view:*:${ID}:p0#round`]).toBeDefined();
  });

  it("보유자가 실제로 뽑을 패산 위치(3,7,11)의 kind와 일치한다", () => {
    const scn = scene();
    const wall = scn.zones[WALL]?.tileIds ?? [];
    // p0=seat0 턴이므로 다음 뽑는 순서는 seat1,2,3,0,... → p0은 index 3,7,11
    const byIndex = [3, 7, 11].map((i) =>
      kindKey(kindOf(scn, wall[i] as TileId)),
    );

    const { game, flow } = startFlow(scn);
    flow.submit("p0", { type: ACTION, payload: {} });
    expect(game.engine.state.augmentData[`view:p0:${ID}#round`]).toEqual(byIndex);
  });

  it("한 장 뽑을 때마다 앞에서 지워지고, 세 번 뽑으면 사라진다 (2026-08-01)", () => {
    const scn = scene();
    const { game, flow } = startFlow(scn);
    let status = flow.submit("p0", { type: ACTION, payload: {} });
    const key = `view:p0:${ID}#round`;
    const peeked = game.engine.state.augmentData[key] as string[];
    expect(peeked).toHaveLength(3);

    // p0이 실제로 세 번 뽑을 때까지 전원 버림·패스로 순번을 돌린다
    const seen: number[] = [3];
    for (let guard = 0; guard < 60 && seen[seen.length - 1] !== 0; guard++) {
      if (status.kind !== "awaiting") break;
      const prompt = status.prompts[0];
      if (prompt === undefined) break;
      const opt =
        prompt.options.find((o) => o.type === "discard") ??
        prompt.options.find((o) => o.type === "pass");
      if (opt === undefined) break;
      status = flow.submit(prompt.player, opt);
      const rest = (game.engine.state.augmentData[key] as string[] | undefined) ?? [];
      if (rest.length !== seen[seen.length - 1]) seen.push(rest.length);
    }
    // 3 → 2 → 1 → 0 으로 한 장씩만 줄어든다
    expect(seen).toEqual([3, 2, 1, 0]);
  });

  /*
   * 2026-08-12 사용자 보고 — "쯔모하기로 한 패가 안 들어오고 이상한 패가 들어온다".
   *
   * 원인: 선언 순간의 자리 배치로 계산한 세 장을 스냅샷으로 얼려 두었다. 누군가 펑·치를
   * 하면 turnSeat이 통째로 옮겨 가 쯔모 배정이 달라지는데, 스트립은 옛 계산을 그대로
   * 보여 줬다. 이제 후로가 일어나는 그 자리에서 다시 계산한다.
   */
  it("후로로 차례가 밀리면 그 자리에서 다시 계산된다 (실시간, 2026-08-12)", () => {
    const base = craft({
      // p2가 p0의 1m을 펑할 수 있게 1m 두 장을 쥐여 준다
      hands: {
        p0: "123m456p789s11z2z",
        p1: "*",
        p2: "11m234p567p234s99s",
        p3: "*",
      },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const wallZone = base.zones[WALL];
    if (wallZone === undefined) throw new Error("no wall");
    const scn = withAugments(
      { ...base, zones: { ...base.zones, [WALL]: { ...wallZone, tileIds: wallZone.tileIds.slice(0, 12) } } },
      "p0",
      [ID],
    );
    const wall = scn.zones[WALL]?.tileIds ?? [];
    const kindAt = (i: number): string => kindKey(kindOf(scn, wall[i] as TileId));

    const { game, flow } = startFlow(scn);
    const key = `view:p0:${ID}#round`;
    let status = flow.submit("p0", { type: ACTION, payload: {} });
    // 선언 직후 — p0(seat0)의 차례이므로 다음 쯔모는 seat1,2,3,0… 즉 index 3,7,11
    expect(game.engine.state.augmentData[key]).toEqual([3, 7, 11].map(kindAt));

    // p0이 1m을 버린다
    if (status.kind !== "awaiting") throw new Error("expected awaiting");
    const turn = status.prompts.find((p) => p.player === "p0");
    const discard1m = (turn?.options ?? []).find(
      (o) =>
        o.type === "discard" &&
        kindKey(kindOf(game.engine.state, (o.payload as { tileId: TileId }).tileId)) === "man1",
    );
    if (discard1m === undefined) throw new Error("no 1m discard option");
    status = flow.submit("p0", discard1m);

    // p2가 펑한다 — 나머지 자리는 패스해야 리액션 창이 닫힌다
    if (status.kind !== "awaiting") throw new Error("expected reaction prompts");
    const ponPrompt = status.prompts.find((p) => p.player === "p2");
    const pon = (ponPrompt?.options ?? []).find((o) => o.type === "pon");
    if (pon === undefined) throw new Error("no pon option for p2");
    for (const p of status.prompts) {
      if (p.player === "p2") continue;
      const pass = p.options.find((o) => o.type === "pass");
      if (pass !== undefined) flow.submit(p.player, pass);
    }
    flow.submit("p2", pon);
    expect(game.engine.state.round.turnSeat).toBe(2);

    /*
     * 펑한 사람(seat2)은 뽑지 않고 버린다 → 패산 맨 앞은 seat3의 것이고,
     * 그 다음이 p0(seat0)이다. 즉 p0의 다음 쯔모는 index 1, 5, 9.
     * (옛 스냅샷 방식이라면 3·7·11이 그대로 남아 있었다 — 그게 "이상한 패"의 정체다.)
     */
    expect(game.engine.state.augmentData[key]).toEqual([1, 5, 9].map(kindAt));
  });

  it("2국에 1회 — 선언하면 쿨다운 2국이 걸리고 두 번째 선언은 거부된다", () => {
    const scn = scene();
    const { game, flow } = startFlow(scn);
    const status = flow.submit("p0", { type: ACTION, payload: {} });
    // 공용 쿨다운 배관 — 마지막으로 쓴 국 순번을 찍고 잔량(2국)을 표시 채널에 올린다
    expect(game.engine.state.augmentData[`${ID}:usedSeq:p0`]).toBe(0);
    expect(game.engine.state.augmentData[`view:p0:cooldown:${ID}`]).toBe(2);

    // 선언 후 여전히 p0 턴이면 옵션이 더는 제시되지 않는다
    const prompt =
      status.kind === "awaiting"
        ? status.prompts.find((p) => p.player === "p0")
        : undefined;
    expect(
      prompt?.options.filter((o) => o.type === ACTION) ?? [],
    ).toHaveLength(0);
    const def = game.engine.actions.get(ACTION);
    expect(
      def?.validate(
        { player: "p0", type: ACTION, payload: {} },
        { state: game.engine.state, rules: game.engine.rules },
      ),
    ).toBe("on cooldown (once per 2 rounds)");
  });

  it("바로 다음 국은 막히고, 그 다음 국에 다시 열린다", () => {
    const scn = scene();
    const { game, flow } = startFlow(scn);
    flow.submit("p0", { type: ACTION, payload: {} });
    const def = game.engine.actions.get(ACTION);

    // 국이 하나 지나간 상태 — ROUND_STARTED가 국 순번을 1로 올린다 (아직 1국뿐)
    const nextRound: GameState = {
      ...game.engine.state,
      augmentData: { ...game.engine.state.augmentData, [`${ID}:seq:p0`]: 1 },
    };
    expect(
      def?.validate(
        { player: "p0", type: ACTION, payload: {} },
        { state: nextRound, rules: game.engine.rules },
      ),
    ).toBe("on cooldown (once per 2 rounds)");

    // 한 국 더 — 사용 시점에서 2국이 지나면 다시 열린다
    const afterTwo: GameState = {
      ...game.engine.state,
      augmentData: { ...game.engine.state.augmentData, [`${ID}:seq:p0`]: 2 },
    };
    expect(
      def?.validate(
        { player: "p0", type: ACTION, payload: {} },
        { state: afterTwo, rules: game.engine.rules },
      ),
    ).toBeNull();
  });

});
