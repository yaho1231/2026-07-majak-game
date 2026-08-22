/**
 * 정보 계열 3건 (docs/25 정보 #5·#9·#10).
 */

import { describe, expect, it } from "vitest";
import {
  TILE_DRAWN,
  WALL,
  createStandardGameFromState,
  installAugment,
  kindKey,
  kindOf,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { foresight } from "../src/augments/foresight.js";
import { dangerSense } from "../src/augments/danger_sense.js";
import { roundViewKey } from "../src/util.js";

describe("예지 — 뽑힌 패는 예언 스트립에서 지워진다 (docs/25 정보 #5)", () => {
  /*
   * 2026-08-22(QA aug-2 확정 4) 개편: 예언 스트립은 **저장된 스냅샷이 아니라 파생값**이다.
   * 발동 시점의 kind 배열을 들고 있다가 앞을 깎는 방식은, 패산 앞을 TILE_DRAWN 없이
   * 가져가는 경로(미래를 보는 자·통째로 바꾸기·파혼)에서 유령 패를 가리켰다. 이제
   * `peekLeft`(남은 장수)만 세고, 화면에 낼 목록은 **매 이벤트마다 지금 패산 앞**에서
   * 다시 만든다(삼세 예지와 같은 방식).
   *
   * 그래서 이 블록이 검사하는 것도 둘로 나뉜다 —
   * ① TILE_DRAWN이 남은 장수를 올바로 깎는가(영상패는 세지 않는가),
   * ② 그 장수대로 스트립이 실제 패산 앞을 비추는가.
   */
  function scene(): ReturnType<typeof createStandardGameFromState> {
    const base = craft({
      hands: { p0: "123m456m789m11p23p", p1: "*", p2: "*", p3: "*" },
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["foresight"] } : p,
      ),
    };
    const game = createStandardGameFromState(state, undefined, [foresight]);
    installAugment(game.engine, foresight, "p0", { yaku: game.yaku });
    // 예언 4장을 실제로 공개한다 (스트립도 peekLeft도 여기서 선다)
    game.engine.submit({ player: "p0", type: "foresight_reveal", payload: {} });
    return game;
  }

  const strip = (g: ReturnType<typeof createStandardGameFromState>): string[] =>
    (g.engine.state.augmentData[roundViewKey("p0", "foresight_peek")] as string[]) ?? [];

  /** 지금 패산 앞 n장의 kind — 스트립이 비춰야 하는 값 */
  const front = (g: ReturnType<typeof createStandardGameFromState>, n: number): string[] =>
    (g.engine.state.zones[WALL]?.tileIds ?? [])
      .slice(0, n)
      .map((id) => kindKey(kindOf(g.engine.state, id)));

  /** 리액션 하나를 현재 상태에 대고 돌린다 (emit은 그 자리에서 반영) */
  function fire(
    g: ReturnType<typeof createStandardGameFromState>,
    type: string,
    payload: Record<string, unknown>,
  ): void {
    for (const { react } of g.engine.effects.reactionsFor(type)) {
      react(
        { seq: 1, type, payload },
        {
          state: g.engine.state,
          rules: g.engine.rules,
          emit: (e) => {
            const p = e.payload as { key: string; value: unknown };
            g.engine.state.augmentData[p.key] = p.value;
          },
        },
      );
    }
  }

  /**
   * 발동 시점에 예언한 4장의 tileId.
   *
   * (이 하네스는 리액션만 돌리고 패산을 실제로 줄이지 않으므로 이 값이 내내 같다.)
   */
  const peekIds = (g: ReturnType<typeof createStandardGameFromState>): number[] =>
    [...(g.engine.state.zones[WALL]?.tileIds ?? [])].slice(0, 4);

  /**
   * 누군가 패산에서 한 장 뽑았다는 이벤트를 흘리고, 화면 갱신까지 돌린다.
   *
   * ⚠ 예전에는 `tileId: 0`이라는 **가짜 id**를 흘렸다. "쯔모가 일어났으면 패산 앞이
   * 한 장 줄었다"를 무조건 전제하던 시절에는 그래도 통했지만, 밑장빼기(`bottom_deal`)가
   * 패산 **최후미**를 뽑으면서 그 전제가 깨졌다 — 앞이 그대로인데 예언 창만 닫혔다
   * (2026-08-23 QA synergy3 kandora 의심 1). 이제 예언한 4장 중 하나가 실제로 뽑혔을
   * 때만 세므로, 여기서도 **그 자리의 진짜 tileId**를 흘린다.
   */
  function draw(
    g: ReturnType<typeof createStandardGameFromState>,
    player: PlayerId,
    rinshan: boolean,
    nth = 0,
  ): void {
    fire(g, TILE_DRAWN, { player, tileId: peekIds(g)[nth] ?? -1, rinshan });
    fire(g, "*", {});
  }

  it("보유자가 뽑으면 한 장 줄어든다", () => {
    const game = scene();
    expect(strip(game)).toEqual(front(game, 4));
    draw(game, "p0", false);
    expect(strip(game)).toEqual(front(game, 3));
  });

  it("**남이 뽑아도** 줄어든다 — 이 예언은 네 자리의 다음 쯔모다", () => {
    const game = scene();
    draw(game, "p1", false);
    // 예전에는 소비 자체가 없어 이미 남의 손에 들어간 패를 계속 보여 줬다
    expect(strip(game)).toEqual(front(game, 3));
  });

  it("영상패(깡)는 패산 순서를 소모하지 않는다", () => {
    const game = scene();
    draw(game, "p0", true);
    expect(strip(game)).toEqual(front(game, 4));
  });

  it("다 소진되면 빈 채로 남는다 (음수 인덱스 없음)", () => {
    const game = scene();
    for (let i = 0; i < 6; i++) draw(game, "p0", false, i);
    expect(strip(game)).toEqual([]);
  });
});

describe("지뢰 탐지 — 후리텐 상대는 위험으로 세지 않는다 (docs/25 정보 #10)", () => {
  /** p1이 5s 대기 텐파이. furiten이면 5s를 이미 버려 둔 상태로 만든다 */
  function scene(furiten: boolean): ReturnType<typeof createStandardGameFromState> {
    const base = craft({
      hands: {
        p0: "123m456m789m11p5s",
        p1: "234m345p345s678s5s",
        p2: "*",
        p3: "*",
      },
      ...(furiten ? { discards: { p1: "5s" } } : {}),
      phase: "turn.act",
      turnSeat: 0,
      drawnLastFor: "p0",
    });
    const rs1 = base.round.byPlayer["p1"];
    if (rs1 === undefined) throw new Error("no p1");
    const state: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === "p0" ? { ...p, augments: ["danger_sense"] } : p,
      ),
      round: furiten
        ? {
            ...base.round,
            byPlayer: {
              ...base.round.byPlayer,
              p1: { ...rs1, discardedKinds: ["sou5"] },
            },
          }
        : base.round,
    };
    const game = createStandardGameFromState(state, undefined, [dangerSense]);
    installAugment(game.engine, dangerSense, "p0", { yaku: game.yaku });
    return game;
  }

  function dangerKeys(g: ReturnType<typeof createStandardGameFromState>): string[] {
    const res = g.engine.submit({ player: "p0", type: "danger_sense_use", payload: {} });
    if (!res.ok) throw new Error(`danger_sense rejected: ${res.reason}`);
    // 스냅샷은 `{ kinds, turn }` — turn은 화면의 "N순 기준" 표기용이다
    const v = g.engine.state.augmentData[roundViewKey("p0", "danger_sense")] as
      | { kinds?: string[] }
      | undefined;
    const kinds = v?.kinds;
    if (!Array.isArray(kinds)) throw new Error("danger_sense: kinds 없음");
    return kinds;
  }

  it("후리텐이 아니면 그 대기패가 위험으로 잡힌다 (기준선)", () => {
    expect(dangerKeys(scene(false))).toContain("sou5");
  });

  it("후리텐이면 그 대기패는 위험이 아니다", () => {
    // 예전에는 순수 대기만 봐서 론할 수 없는 패까지 "쏘인다"로 표시했다
    expect(dangerKeys(scene(true))).not.toContain("sou5");
  });
});
