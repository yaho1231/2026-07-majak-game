/**
 * 상대 읽기 — **누가 했느냐**에 따라 같은 후로·같은 리치가 다르게 읽히는가.
 *
 * 2026-08-05 이전 봇에게 상대 셋은 매 국 처음 보는 사람이었다. 국이 끝나면 아무것도
 * 남지 않아, 다섯 국 내내 한 번도 안 운 사람과 매 국 세 번씩 우는 사람을 **똑같이**
 * 취급했다. 판 안에서도 마찬가지여서, 남의 리치에 현물만 골라 내며 **이미 접은 사람**을
 * 끝까지 무서워했다 — 아무도 노리지 않는 패를 못 버리고 자기 손만 망쳤다.
 *
 * 여기서 잡는 것:
 *   1. 국을 넘는 기억이 쌓이고, 표본이 적을 때는 사전값에 머무는가
 *   2. 그 기억이 위협 판단을 실제로 바꾸는가
 *   3. 판 안의 신호(접기·리치 순목·안 버리는 색)를 읽는가
 */

import { describe, expect, it } from "vitest";
import type { PlayerView } from "@majak/core";
import { OpponentMemory, NEUTRAL_TRAITS } from "../src/bot/opponents.js";
import type { OpponentTraits } from "../src/bot/opponents.js";
import { readThreats } from "../src/bot/danger.js";
import { buildRead } from "../src/bot/read.js";
import { botScene } from "./botTestView.js";
import type { BotViewOptions } from "./botTestView.js";

/** 같은 장면을 국 번호만 바꿔 여러 번 관측시킨다 */
function playRounds(
  mem: OpponentMemory,
  rounds: readonly Partial<BotViewOptions>[],
  base: BotViewOptions,
): void {
  rounds.forEach((over, i) => {
    const view = botScene({ ...base, ...over, roundNumber: i + 1 }).view;
    mem.observe(view, "p0");
  });
  // 마지막 국을 확정시키려면 다음 국이 시작돼야 한다 (진행 중인 국은 세지 않는다)
  mem.observe(botScene({ ...base, roundNumber: rounds.length + 1 }).view, "p0");
}

const BASE: BotViewOptions = { hand: "123m456m789m11p5s7z" };

describe("상대 기억 — 국을 넘어 쌓인다", () => {
  it("관측이 없으면 '보통 사람'으로 본다", () => {
    const mem = new OpponentMemory();
    expect(mem.traitsOf("p1")).toEqual(NEUTRAL_TRAITS);
  });

  it("매 국 리치를 거는 사람은 리치 비율이 올라간다", () => {
    const mem = new OpponentMemory();
    playRounds(mem, [{ riichi: ["p1"] }, { riichi: ["p1"] }, { riichi: ["p1"] }], BASE);
    expect(mem.traitsOf("p1").riichiRate).toBeGreaterThan(NEUTRAL_TRAITS.riichiRate);
    // 한 번도 안 건 사람은 내려간다
    expect(mem.traitsOf("p2").riichiRate).toBeLessThan(NEUTRAL_TRAITS.riichiRate);
  });

  it("매 국 우는 사람은 후로 비율이 올라간다", () => {
    const mem = new OpponentMemory();
    const pon = { oppMelds: { p1: ["555s"] } };
    playRounds(mem, [pon, pon, pon], BASE);
    expect(mem.traitsOf("p1").callRate).toBeGreaterThan(NEUTRAL_TRAITS.callRate);
    expect(mem.traitsOf("p2").callRate).toBeLessThan(NEUTRAL_TRAITS.callRate);
  });

  it("한두 국으로는 단정하지 않는다 — 사전값에 섞어 서서히 움직인다", () => {
    const one = new OpponentMemory();
    playRounds(one, [{ riichi: ["p1"] }], BASE);
    const many = new OpponentMemory();
    playRounds(many, Array.from({ length: 8 }, () => ({ riichi: ["p1"] })), BASE);
    // 같은 '매 국 리치'라도 표본이 많을수록 확신이 커진다
    expect(many.traitsOf("p1").riichiRate).toBeGreaterThan(one.traitsOf("p1").riichiRate);
  });

  it("진행 중인 국은 아직 세지 않는다 (지금 벌어지는 일이 성향으로 되먹으면 순환한다)", () => {
    const mem = new OpponentMemory();
    mem.observe(botScene({ ...BASE, riichi: ["p1"] }).view, "p0");
    expect(mem.traitsOf("p1")).toEqual(NEUTRAL_TRAITS);
  });

  it("리치 순목을 기억한다 — 이른 리치를 거는 사람인가", () => {
    const mem = new OpponentMemory();
    playRounds(
      mem,
      [
        { riichi: ["p1"], turnCount: 4 },
        { riichi: ["p1"], turnCount: 4 },
      ],
      BASE,
    );
    expect(mem.traitsOf("p1").avgRiichiTurn).toBe(4);
  });

  it("새 게임이면 기억을 비운다", () => {
    const mem = new OpponentMemory();
    playRounds(mem, [{ riichi: ["p1"] }, { riichi: ["p1"] }], BASE);
    mem.reset();
    expect(mem.traitsOf("p1")).toEqual(NEUTRAL_TRAITS);
  });
});

describe("기억이 위협 판단을 바꾼다", () => {
  const traits = (over: Partial<OpponentTraits>) => ({ ...NEUTRAL_TRAITS, ...over });

  it("여태 한 번도 안 운 사람의 펑은 더 무섭다", () => {
    const view = botScene({ ...BASE, oppMelds: { p1: ["555s"] }, turnCount: 10 }).view;
    const tight = readThreats(view, "p0", [], () => traits({ callRate: 0.05 }));
    const loose = readThreats(view, "p0", [], () => traits({ callRate: 0.9 }));
    const of = (ts: ReturnType<typeof readThreats>) =>
      ts.find((t) => t.player === "p1")?.level ?? 0;
    expect(of(tight)).toBeGreaterThan(of(loose));
  });

  it("리치를 아끼는 사람의 리치는 더 비싸게 잡힌다", () => {
    const view = botScene({ ...BASE, riichi: ["p1"], turnCount: 8 }).view;
    const tight = readThreats(view, "p0", [], () => traits({ riichiRate: 0.05 }));
    const loose = readThreats(view, "p0", [], () => traits({ riichiRate: 0.6 }));
    const of = (ts: ReturnType<typeof readThreats>) =>
      ts.find((t) => t.player === "p1")?.value ?? 0;
    expect(of(tight)).toBeGreaterThan(of(loose));
  });
});

describe("판 안의 신호", () => {
  it("이른 리치는 늦은 리치보다 비싸게 잡힌다", () => {
    const scene = (index: number): PlayerView =>
      botScene({
        ...BASE,
        riichi: ["p1"],
        discards: { p1: "1112223334445z" },
        riichiTileIndex: { p1: index },
        turnCount: 13,
      }).view;
    const early = readThreats(scene(3), "p0")[0]?.value ?? 0;
    const late = readThreats(scene(12), "p0")[0]?.value ?? 0;
    expect(early).toBeGreaterThan(late);
  });

  it("한 색만 통째로 안 버리는 사람은 그 색을 모으는 중으로 읽는다", () => {
    // p1이 만·통을 실컷 버리면서 삭은 한 장도 안 버렸다 (후로 없이 버림패만으로 읽는다)
    const flush = botScene({
      ...BASE,
      discards: { p1: "1239m1239p" },
      turnCount: 12,
    }).view;
    // 세 색을 고루 버린 사람 (같은 장수·같은 순목)
    const plain = botScene({
      ...BASE,
      discards: { p1: "1239m123s9p" },
      turnCount: 12,
    }).view;
    const v = (view: PlayerView) => readThreats(view, "p0").find((t) => t.player === "p1")?.value ?? 0;
    expect(v(flush)).toBeGreaterThan(v(plain));
  });

  it("남의 리치에 현물만 골라 내는 사람은 이미 접은 것이다 — 무서워하지 않는다", () => {
    // p2는 후로 둘을 눕혔지만, 최근 3장이 전부 p1(리치)의 현물이다.
    const folding = botScene({
      ...BASE,
      riichi: ["p1"],
      oppMelds: { p2: ["222p", "333p"] },
      discards: { p1: "1z2z3z", p2: "9m1z2z3z" },
      turnCount: 12,
    }).view;
    // 같은 후로·같은 순목·거의 같은 버림인데 마지막 한 장이 리치의 현물이 아니다
    const pushing = botScene({
      ...BASE,
      riichi: ["p1"],
      oppMelds: { p2: ["222p", "333p"] },
      discards: { p1: "1z2z3z", p2: "9m1z2z4s" },
      turnCount: 12,
    }).view;
    const lv = (view: PlayerView) =>
      readThreats(view, "p0").find((t) => t.player === "p2")?.level ?? 0;
    expect(lv(folding)).toBeLessThan(lv(pushing) * 0.5);
  });

  it("접은 사람은 기대 실점에서도 가벼워진다 — 그 사람 몫의 위험이 실제로 빠진다", () => {
    const board = {
      ...BASE,
      oppMelds: { p2: ["222p", "333p"] },
      turnCount: 12,
      riichi: ["p1"],
    } as const;
    const folding = buildRead(
      botScene({ ...board, discards: { p1: "1z2z3z", p2: "9m1z2z3z" } }).view,
      "p0",
    );
    const pushing = buildRead(
      botScene({ ...board, discards: { p1: "1z2z3z", p2: "9m1z2z4s" } }).view,
      "p0",
    );
    // 5p는 양쪽 장면 모두에서 아무도 안 버린 패 — 달라지는 것은 p2가 접었는지뿐이다
    const tile = { suit: "pin", rank: 5 } as const;
    expect(folding.expectedLoss(tile)).toBeLessThan(pushing.expectedLoss(tile));
  });
});
