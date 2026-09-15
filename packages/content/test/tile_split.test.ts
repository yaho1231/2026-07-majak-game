/**
 * 분열 (tile_split) — 수패 1장을 합이 같은 두 숫자로 쪼갠다.
 *  1. 대상은 a로, 재료 잡패는 b로 바뀐다(a+b = 원래 랭크, 같은 무늬, conjured).
 *  2. 손패 장수는 불변.
 *  3. 자패·랭크 1·잘못된 분할·리치 중은 거부된다.
 */

import { describe, expect, it } from "vitest";
import {
  augmentDataSet,
  createStandardGameFromState,
  handIdsOf,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId, TileId } from "@majak/core";
import { craft } from "./helpers.js";
import { tileSplit } from "../src/augments/tile_split.js";

/** kindKey = `` (예: pin9) */
const K = {
  p4: kindKey({ suit: "pin", rank: 4 }),
  p5: kindKey({ suit: "pin", rank: 5 }),
  p9: kindKey({ suit: "pin", rank: 9 }),
  e: kindKey({ suit: "wind", rank: 1 }),
};

function withAug(state: GameState, player: PlayerId, ids: string[]): GameState {
  return {
    ...state,
    players: state.players.map((p) =>
      p.id === player ? { ...p, augments: [...ids] } : p,
    ),
  };
}

/** p0 손패: 9p 하나 + 고립된 자패들 + 이어지는 수패 */
function scene(riichi = false): GameState {
  const base = craft({
    hands: { p0: "123m456m789m9p1z5z", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  const s = withAug(base, "p0", ["tile_split"]);
  if (!riichi) return s;
  return {
    ...s,
    round: {
      ...s.round,
      byPlayer: {
        ...s.round.byPlayer,
        p0: { ...s.round.byPlayer["p0"]!, riichi: { double: false, ippatsu: false, discardIndex: 0 } },
      },
    },
  };
}

function setup(state: GameState) {
  const game = createStandardGameFromState(state);
  installAugment(game.engine, tileSplit, "p0", { yaku: game.yaku });
  return game;
}

/** 손패에서 특정 kindKey를 가진 tileId */
function findTile(game: ReturnType<typeof setup>, key: string): TileId | undefined {
  const st = game.engine.state;
  return handIdsOf(st, "p0").find((id) => kindKey(kindOf(st, id)) === key);
}

function handKeys(game: ReturnType<typeof setup>): string[] {
  const st = game.engine.state;
  return handIdsOf(st, "p0").map((id) => kindKey(kindOf(st, id)));
}

/**
 * 손패는 그대로 둔 채 **이벤트 하나만** 흘려 반응(미리보기 채널)을 돌리는 테스트 전용
 * 액션 — 버림으로 한 순을 흘리면 자기 순(turn.act)이 끝나 그 뒤 분열을 발동할 수 없다.
 */
function tick(game: ReturnType<typeof setup>): void {
  if (!game.engine.actions.has("__test_tick")) {
    game.engine.actions.register({
      type: "__test_tick",
      validate: () => null,
      toEvents: () => [augmentDataSet("__test:tick", 1)],
    });
  }
  const res = game.engine.submit({ player: "p0", type: "__test_tick", payload: {} });
  if (!res.ok) throw new Error(`tick failed: ${res.reason}`);
}

/** 손 123m 456m 789m 中中 + 5s — 유일한 머리가 中中이다 (#467의 장면) */
function pairScene(): GameState {
  return withAug(
    craft({
      hands: { p0: "123m456m789m77z5s", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    }),
    "p0",
    ["tile_split"],
  );
}

describe("분열 (tile_split)", () => {
  it("9통을 4통+5통으로 쪼갠다 (장수 불변, conjured)", () => {
    const game = setup(scene());
    const target = findTile(game, K.p9);
    expect(target).toBeDefined();
    const before = handKeys(game).length;

    const r = game.engine.submit({
      player: "p0",
      type: "split_tile",
      payload: { tileId: target!, a: 4 },
    });
    expect(r.ok).toBe(true);

    const after = handKeys(game);
    expect(after.length).toBe(before); // 장수 불변
    expect(after).toContain(K.p4);
    expect(after).toContain(K.p5);
    expect(after).not.toContain(K.p9);
    // 두 조각 다 conjured 표식
    const st = game.engine.state;
    for (const key of [K.p4, K.p5]) {
      const id = handIdsOf(st, "p0").find((t) => kindKey(kindOf(st, t)) === key)!;
      expect(st.tiles[id]?.attrs?.conjured).toBe(true);
    }
    // 사용 표식은 **국 단위** — 국이 바뀌면 다시 쓸 수 있다
    const rd = st.round;
    expect(
      st.augmentData[`tile_split:used:${rd.prevalentWind}-${rd.roundNumber}-${rd.honba}:p0#round`],
    ).toBe(true);
  });

  it("같은 국에 두 번은 못 쓰고, 국이 바뀌면 다시 쓸 수 있다", () => {
    const game = setup(scene());
    const target = findTile(game, K.p9)!;
    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: target, a: 4 } }).ok,
    ).toBe(true);

    // 같은 국 — 거부
    const again = findTile(game, K.p9) ?? findTile(game, K.p5)!;
    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: again, a: 2 } }).ok,
    ).toBe(false);

    // 다음 국 — 새 판을 깔면(같은 augmentData 유지) 다시 발동한다
    const st = game.engine.state;
    const next = setup({
      ...scene(),
      augmentData: { ...st.augmentData },
      round: { ...scene().round, roundNumber: 2 },
    });
    const t2 = findTile(next, K.p9)!;
    expect(
      next.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: t2, a: 4 } }).ok,
    ).toBe(true);
  });

  /*
   * 재료 고르기 — 이어짐이 같으면 **자패가 먼저** 탄다.
   *
   * 예전에는 이어짐만 보고 동점이면 손패 순서 앞쪽을 뽑았다. 그래서 외톨이 5삭이
   * 한 장 남은 1z보다 앞에 있으면 5삭이 사라졌다("한 장 남은 한자패가 안 사라지고
   * 다른 게 사라진다", 2026-08-17 사용자 보고). 자패는 슌쯔가 아예 불가능하니 같은
   * 외톨이라도 먼저 태우는 것이 맞다.
   */
  it("이어짐이 같으면 외톨이 수패가 아니라 한 장 남은 자패가 재료가 된다", () => {
    const game = setup(
      withAug(
        craft({
          // 9p(대상) · 5s(외톨이 수패, 손패에서 자패보다 앞) · 1z(한 장 남은 자패)
          hands: { p0: "123m456m789m9p5s1z", p1: "*", p2: "*", p3: "*" },
          phase: "turn.act",
          turnSeat: 0,
          drawnLastFor: "p0",
        }),
        "p0",
        ["tile_split"],
      ),
    );
    const target = findTile(game, K.p9);
    expect(target).toBeDefined();
    expect(handKeys(game)).toContain(K.e); // 1z가 손에 있다

    const r = game.engine.submit({
      player: "p0",
      type: "split_tile",
      payload: { tileId: target!, a: 4 },
    });
    expect(r.ok).toBe(true);

    const after = handKeys(game);
    expect(after).not.toContain(K.e); // 자패가 재료로 소모됐다
    expect(after).toContain(kindKey({ suit: "sou", rank: 5 })); // 외톨이 수패는 남았다
    expect(after).toContain(K.p4);
    expect(after).toContain(K.p5);
  });

  /*
   * 재료 고르기 — **이미 완성된 몸통·머리는 태우지 않는다** (2026-09-04 사용자 보고, #467).
   *
   * 예전에는 이어짐만 봤다. 손패 123m456m789m + 中中 + 5s 에서 中은 서로 이어지는
   * 짝이라 이어짐 점수가 낮고 자패라 순위가 더 낮아, **유일한 머리인 中中이** 재료로
   * 타 버렸다. 이제는 후보마다 쪼갠 뒤의 손을 그대로 만들어 샹텐과 수용 폭을 재므로
   * 머리를 깨는 선택은 뽑히지 않는다 — 몸통 끝의 1만이 재료가 된다.
   *
   * #467이 #469에 지워지면서 이 테스트도 함께 사라져 게이트가 조용히 통과했다
   * (docs/55 M-2). 2026-09-16 복구.
   */
  it("유일한 머리(자패 또이쯔)를 재료로 태우지 않는다", () => {
    const game = setup(pairScene());
    const target = findTile(game, kindKey({ suit: "sou", rank: 5 }))!;
    const r = game.engine.submit({
      player: "p0",
      type: "split_tile",
      payload: { tileId: target, a: 2 },
    });
    expect(r.ok).toBe(true);

    const after = handKeys(game);
    const chun = kindKey({ suit: "dragon", rank: 3 });
    expect(after.filter((k) => k === chun).length).toBe(2); // 머리는 그대로다
    expect(after).toContain(kindKey({ suit: "sou", rank: 2 }));
    expect(after).toContain(kindKey({ suit: "sou", rank: 3 }));
  });

  /*
   * **미리보기 채널 == 실제로 타는 패.** #490의 «대상 → 재료» 표는 옛 고립도 함수 위에
   * 얹혀 있었다. 재료 선정을 «결과 손 샹텐»으로 바꾸면서(#467 재적용) 표도 같은 함수를
   * 봐야 한다 — 한쪽만 바뀌면 화면이 中을 짚고 실제로는 1만이 타는(또는 그 반대) 거짓말이
   * 된다. 中中 머리 장면이라 옛 함수(中)와 새 함수(1만)의 답이 다르므로, 어느 한쪽만
   * 되돌려도 이 테스트가 잡는다.
   */
  it("미리보기 표가 짚은 그 패가 실제로 재료가 된다 — 계산은 한 벌이다", () => {
    const game = setup(pairScene());
    tick(game); // 채널은 이벤트가 한 번 돌아야 실린다 — 손패는 그대로 둔다

    const st = game.engine.state;
    const target = findTile(game, kindKey({ suit: "sou", rank: 5 }))!;
    const table = st.augmentData["view:p0:tile_split:material#round"] as
      | Record<string, TileId>
      | undefined;
    expect(table, "재료 미리보기 채널이 비어 있다").toBeDefined();
    const promised = table![String(target)];
    expect(promised, "5삭을 쪼갤 때의 재료가 표에 없다").toBeDefined();
    // 새 규칙: 유일한 머리 中中이 아니라 몸통 끝 패가 재료다
    expect(kindOf(st, promised!).suit).not.toBe("dragon");

    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: target, a: 2 } }).ok,
    ).toBe(true);

    // 짚어 준 바로 그 패가 나머지 조각(3삭)이 됐고, 中中은 두 장 그대로다
    const after = game.engine.state;
    expect(kindKey(kindOf(after, promised!))).toBe(kindKey({ suit: "sou", rank: 3 }));
    expect(after.tiles[promised!]?.attrs.conjured).toBe(true);
    const chun = kindKey({ suit: "dragon", rank: 3 });
    expect(handKeys(game).filter((k) => k === chun).length).toBe(2);
  });

  it("합이 맞지 않는 분할은 거부된다", () => {
    const game = setup(scene());
    const target = findTile(game, K.p9)!;
    // a는 1..floor(r/2)만 허용 — 9의 절반을 넘는 5는 거부(4+5는 a=4로 표현)
    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: target, a: 5 } }).ok,
    ).toBe(false);
    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: target, a: 0 } }).ok,
    ).toBe(false);
  });

  it("자패는 쪼갤 수 없다", () => {
    const game = setup(scene());
    const honor = findTile(game, K.e)!;
    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: honor, a: 1 } }).ok,
    ).toBe(false);
  });

  it("리치 중에는 발동할 수 없다", () => {
    const game = setup(scene(true));
    const target = findTile(game, K.p9)!;
    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: target, a: 4 } }).ok,
    ).toBe(false);
  });

  it("후보는 쪼갤 수 있는 수패마다 a ≤ r/2 만큼 제시된다", () => {
    const game = setup(scene());
    const provider = game.engine.turnOptionProviders[0];
    const opts = provider ? provider(game.engine.state, "p0") : [];
    const target = findTile(game, K.p9)!;
    const forTarget = opts.filter(
      (o) => o.type === "split_tile" && (o.payload as { tileId: number }).tileId === target,
    );
    // 9 → a=1,2,3,4
    expect(forTarget.map((o) => (o.payload as { a: number }).a).sort()).toEqual([1, 2, 3, 4]);
  });

  /*
   * **재료 미리보기** — 카드는 "가장 고립된 잡패가 변해 생긴다"고만 말하고 어느 패인지는
   * 말하지 않아, 누르고 나서야 무엇을 잃었는지 알 수 있었다(2026-09-07 사용자 요청).
   * 화면은 이 채널만 읽는다 — 클라가 같은 계산을 한 벌 더 갖고 있으면 짚는 패와 실제로
   * 타는 패가 조용히 갈린다.
   */
  it("발동 전에 «쪼갤 패 → 사라질 재료» 표를 보유자 채널로 알려 준다", () => {
    const game = setup(scene());
    // 채널은 이벤트가 한 번 돌아야 실린다. 표는 **자기 순(turn.act)에만** 실리므로
    // (버튼이 뜨는 자리가 거기뿐이다) 버림으로 순을 넘기지 않고 이벤트 하나만 흘린다.
    tick(game);

    const st = game.engine.state;
    const table = st.augmentData["view:p0:tile_split:material#round"] as
      | Record<string, TileId>
      | undefined;
    expect(table, "재료 미리보기 채널이 비어 있다").toBeDefined();

    const target = findTile(game, K.p9)!;
    const promised = table![String(target)];
    expect(promised, "9통을 쪼갤 때의 재료가 표에 없다").toBeDefined();
    // 재료는 쪼갤 대상 자신이 아니고, 손에 실제로 있는 «잡패»(여기서는 고립된 자패 1z·5z 중 하나)다
    expect(promised).not.toBe(target);
    expect(handIdsOf(st, "p0")).toContain(promised);
    expect(["wind", "dragon"]).toContain(kindOf(st, promised!).suit);

    // 표는 **쪼갤 수 있는 패마다** 한 줄이다 (재료가 대상에 따라 달라질 수 있으므로)
    for (const id of handIdsOf(st, "p0")) {
      const k = kindOf(st, id);
      const splittable = (k.suit === "man" || k.suit === "pin" || k.suit === "sou") && k.rank >= 2;
      expect(Object.hasOwn(table!, String(id))).toBe(splittable);
    }
  });

  it("예고한 그 패가 실제로 타는 패다 — 자패 재료가 나머지 조각(5통)이 된다", () => {
    const game = setup(scene());
    const target = findTile(game, K.p9)!;
    const honorsBefore = handIdsOf(game.engine.state, "p0").filter((id) => {
      const su = kindOf(game.engine.state, id).suit;
      return su === "wind" || su === "dragon";
    });
    expect(honorsBefore.length).toBe(2); // 1z · 5z — 둘 다 고립된 잡패다

    expect(
      game.engine.submit({ player: "p0", type: "split_tile", payload: { tileId: target, a: 4 } }).ok,
    ).toBe(true);

    // 자패 **한 장**이 사라지고 그 자리에 5통이 섰다 (미리보기가 짚던 바로 그 패다)
    const after = game.engine.state;
    const burned = honorsBefore.filter((id) => kindKey(kindOf(after, id)) === K.p5);
    expect(burned.length).toBe(1);
  });
});
