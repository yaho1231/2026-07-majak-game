/**
 * 등 떠밀기 (push_riichi) — 낙인 표시는 **국이 끝나면** 내려간다.
 *
 * 표시 채널이 국 스코프(roundViewKey)라 지워지는 시점이 **다음 국 setupRound** 였다.
 * 그런데 국이 끝나고 다음 국이 시작되기까지 정산 화면과 증강 드래프트가 통째로 끼어
 * 있어서, 이미 죽은 낙인이 그 내내 이름표 관계선과 당사자 뱃지로 서 있었다
 * (2026-08-20 QA disrupt 확정 2). 완전히 같은 모양을 blind_ron·rank_gate 가 먼저
 * `ROUND_SETTLED` 리액션으로 고쳤다 — 그 대조군과 같은 계약을 여기서도 못 박는다.
 */

import { describe, expect, it } from "vitest";
import {
  FlowController,
  ROUND_SCOPED_MARK,
  createStandardGameFromState,
  installAugment,
} from "@majak/core";
import type { GameState, PlayerId } from "@majak/core";
import { craft } from "./helpers.js";
import { pushRiichi } from "../src/augments/push_riichi.js";

/** p0가 국 첫 순에 쯔모 화료할 수 있는 장면 (지목 창이 열려 있다) */
function tsumoScene(): GameState {
  const base = craft({
    hands: { p0: "123m123p123s678s99s", p1: "*", p2: "*", p3: "*" },
    phase: "turn.act",
    turnSeat: 0,
    drawnLastFor: "p0",
  });
  return {
    ...base,
    players: base.players.map((p) =>
      p.id === "p0" ? { ...p, augments: ["push_riichi"] } : p,
    ),
  };
}

const BRAND_VIEW = "view:*:push_riichi:p0" + ROUND_SCOPED_MARK;

describe("등 떠밀기 — 낙인 표시의 수명", () => {
  it("정산이 끝나면 전원 공개 낙인 표시가 내려간다", () => {
    const game = createStandardGameFromState(tsumoScene());
    installAugment(game.engine, pushRiichi, "p0", {
      yaku: game.yaku,
      catalog: game.augments,
    });
    const flow = new FlowController(game.engine);
    flow.begin();

    const marked = flow.submit("p0", {
      type: "push_brand",
      payload: { target: "p1" as PlayerId },
    });
    expect(marked.kind).toBe("awaiting");
    expect(game.engine.state.augmentData[BRAND_VIEW]).toBe("p1");

    const over = flow.submit("p0", { type: "win", payload: {} });
    expect(over.kind).toBe("roundOver");
    // 국이 끝났다 = 낙인 표시도 내려간다 (다음 국 시작을 기다리지 않는다).
    // 빈 문자열이면 PlayerView가 채널 자체를 내려보내지 않는다.
    expect(game.engine.state.augmentData[BRAND_VIEW]).toBe("");
  });
});
