/**
 * 횟수형 증강의 **남은 사용 횟수 채널** (`view:{보유자}:uses:{증강id}`).
 *
 * 배경: "게임 내 2회"라고 적힌 증강이 몇 번 남았는지가 화면 어디에도 없었다 —
 * 등가교환처럼 카운터가 augmentData 안에만 있는 증강은, 액티브 버튼이 사라지고 나서야
 * 소진을 알 수 있었다(2026-08-12 사용자 지적). content/util의 `publishUsesLeft`가
 * 규약을 하나로 모으고, 클라이언트 이름표 pill이 이 채널 하나만 읽는다.
 *
 * 지키는 것:
 *  1. 채널이 실제로 실린다 — 쯔모 한 번이면 값이 선다(드래프트가 배패 뒤에 설치돼도).
 *  2. 값의 모양이 `{left, total, scope}`다 (클라가 "n회" + "게임 내 N회 중 n회 남음").
 *  3. 쓰면 줄어든다.
 *  4. 횟수형 증강이 **빠짐없이** 이 규약을 쓴다 — 새 증강을 더할 때 잊지 않게 소스로 못 박는다.
 */

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  FlowController,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { handSwap3 } from "../src/augments/hand_swap3.js";

const HERE = dirname(fileURLToPath(import.meta.url));
const AUG_DIR = join(HERE, "../src/augments");

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

describe("남은 사용 횟수 채널 (uses:{증강id})", () => {
  // 판을 지정하지 않은 craft는 반장전이다 — 등가교환의 매치 예산은 동풍전 2·반장전 3회
  // (2026-08-23 사용자 지시로 반장전 예산이 1.5배가 됐다).
  it("등가교환 — 쯔모 한 번이면 '반장전 3회 중 3회 남음'이 실린다", () => {
    // turn.draw로 시작하면 flow.begin()이 곧바로 sys.draw를 낸다 → 채널이 선다
    const scn = withAugments(
      craft({
        hands: { p0: "123m456p789s11z2z", p1: "*", p2: "*", p3: "*" },
        phase: "turn.draw",
        turnSeat: 0,
      }),
      "p0",
      ["hand_swap3"],
    );
    const game = createStandardGameFromState(scn);
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });
    new FlowController(game.engine).begin();

    expect(game.engine.state.augmentData["view:p0:uses:hand_swap3"]).toEqual({
      left: 3,
      total: 3,
      scope: "match",
    });
  });

  it("한 번 쓰면 남은 횟수가 줄어든다", () => {
    const scn = withAugments(
      craft({
        hands: { p0: "123m456p789s11z2z", p1: "*", p2: "*", p3: "*" },
        phase: "turn.draw",
        turnSeat: 0,
      }),
      "p0",
      ["hand_swap3"],
    );
    const game = createStandardGameFromState(scn);
    installAugment(game.engine, handSwap3, "p0", { yaku: game.yaku });
    const flow = new FlowController(game.engine);
    let status = flow.begin();
    if (status.kind !== "awaiting") throw new Error("expected awaiting");

    // 대상 지정(swap3)이 게임 횟수 1을 소비한다
    const aim = status.prompts
      .find((p) => p.player === "p0")
      ?.options.find((o) => o.type === "swap3");
    if (aim === undefined) throw new Error("no swap3 option");
    status = flow.submit("p0", aim);

    // 채널은 다음 쯔모·버림에 따라붙는다 — 버림 한 번이면 갱신된다
    const discard = status.kind === "awaiting"
      ? status.prompts.find((p) => p.player === "p0")?.options.find((o) => o.type === "discard")
      : undefined;
    if (discard !== undefined) flow.submit("p0", discard);

    const v = game.engine.state.augmentData["view:p0:uses:hand_swap3"] as {
      left: number;
      total: number;
    };
    expect(v.left).toBe(2);
    expect(v.total).toBe(3);
  });

  /*
   * 소스 스캔 — "횟수형인데 잔량을 안 내는 증강"이 다시 생기지 않게 한다.
   *
   * 판정: `<id>:uses:` 또는 `<id>:used:` 꼴 매치/국 카운터를 상한(matchUses·MAX_USES 등)과
   * 비교하는 파일. 예외는 아래 표에 이유와 함께 적는다 — 조용히 빠지는 것만 막으면 된다.
   */
  const EXEMPT: Record<string, string> = {
    // 자기 잔량 채널을 이미 갖고 있고 클라에 전용 분기가 있다 (`{id}:left`)
    "alchemist.ts": "{id}:left 채널을 직접 낸다",
    "tile_dyeing.ts": "{id}:left 채널을 직접 낸다",
    // 카운터가 '사용 횟수'가 아니다 — 방어한 횟수·연장한 판수·쌓인 층이다
    "yakuman_shield.ts": "막은 횟수(상한 없음)라 잔량이 아니다",
  };

  it("횟수형 증강은 전부 publishUsesLeft를 쓴다", () => {
    const missing: string[] = [];
    for (const file of readdirSync(AUG_DIR)) {
      if (!file.endsWith(".ts")) continue;
      if (EXEMPT[file] !== undefined) continue;
      const src = readFileSync(join(AUG_DIR, file), "utf8");
      // 매치/국 사용 카운터를 상한과 견주는 꼴
      const counts =
        /counterOf\(state, use[ds]Key\([^)]*\)\)\s*[<>]=?\s*(matchUses\(state\)|MAX_USES|maxUses\(state\))/.test(
          src,
        ) ||
        /(matchUses\(state\)|MAX_USES|maxUses\(state\))\s*[<>]=?\s*counterOf\(state, use[ds]Key\(/.test(
          src,
        );
      if (!counts) continue;
      if (!src.includes("publishUsesLeft")) missing.push(file);
    }
    expect(missing, `잔량 채널이 없는 횟수형 증강: ${missing.join(", ")}`).toEqual([]);
  });
});
