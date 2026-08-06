/**
 * 콜 기회 집계(`bot/callAudit.ts`)가 **각 관문을 제대로 구별하는지** 검증한다.
 *
 * 이 집계는 앞으로의 가설이 나오는 자리라, 라벨이 하나만 어긋나도 그 다음 판단이
 * 통째로 틀어진다. 그래서 관문마다 그 관문에서만 걸리는 장면을 하나씩 세워 둔다.
 *
 * 실대국 경로를 건드리지 않는다는 것도 함께 잡는다 — 집계기를 안 걸면 아무것도
 * 기록되지 않아야 한다.
 */

import { describe, expect, it } from "vitest";
import { bidCall } from "../src/bot/call.js";
import { buildRead } from "../src/bot/read.js";
import { NEUTRAL_PROFILE } from "../src/bot/profile.js";
import { CallTally } from "../src/bot/callAudit.js";
import type { CallOutcome } from "../src/bot/callAudit.js";
import { botScene } from "./botTestView.js";
import type { BotScene } from "./botTestView.js";

const ponOf = (scene: BotScene, spec: string, other: string) => ({
  type: "pon",
  payload: { tileIds: [scene.idOf(spec), scene.idOf(other)] },
});

/** 장면 하나를 집계기와 함께 돌리고, 기록된 결말을 돌려준다 */
function outcomeOf(
  scene: BotScene,
  options: readonly unknown[],
): { tally: CallTally; bid: unknown } {
  const tally = new CallTally();
  const read = buildRead(scene.view, "p0", { callAudit: tally });
  const bid = bidCall(read, options as never, null, NEUTRAL_PROFILE);
  return { tally, bid };
}

const only = (tally: CallTally): CallOutcome | null => {
  for (const [outcome, n] of tally.byOutcome) if (n > 0) return outcome;
  return null;
};

describe("콜 기회 집계 — 관문마다 다른 이름이 붙는다", () => {
  it("멘젠 텐파이를 스스로 열지 않은 것은 그 이름으로 남는다", () => {
    const scene = botScene({
      hand: "123m456m789m11p56s",
      lastDiscard: { player: "p1", spec: "1p" },
    });
    const { tally, bid } = outcomeOf(scene, [
      ponOf(scene, "1p", "1p"),
      { type: "pass", payload: {} },
    ]);
    expect(bid).toBeNull();
    expect(only(tally)).toBe("menzen_tenpai");
    expect(tally.averageShanten("menzen_tenpai")).toBe(0);
  });

  it("손이 전진하지 않는 콜은 '전진 없음'이다", () => {
    // 이미 완성된 456p에서 4p5p를 빼 3p를 쳐 봐야 6p만 뜬다 — 손은 그대로다.
    // (멘젠 텐파이가 아닌 손이라야 그 관문에 먼저 걸리지 않는다)
    const scene = botScene({
      hand: "123m789m456p22s5s9s",
      lastDiscard: { player: "p3", spec: "3p" },
    });
    const { tally, bid } = outcomeOf(scene, [
      { type: "chi", payload: { tileIds: [scene.idOf("4p"), scene.idOf("5p")] } },
      { type: "pass", payload: {} },
    ]);
    expect(bid).toBeNull();
    expect(only(tally)).toBe("no_progress");
  });

  it("울면 화료할 역이 없는 것은 '역 없음'이다", () => {
    const scene = botScene({
      hand: "19m19p19s1244z44z",
      lastDiscard: { player: "p1", spec: "4z" },
    });
    const { tally, bid } = outcomeOf(scene, [
      ponOf(scene, "4z", "4z"),
      { type: "pass", payload: {} },
    ]);
    expect(bid).toBeNull();
    expect(only(tally)).toBe("no_yaku");
  });

  it("치뿐인 기회와 펑이 가능한 기회를 나눠 센다", () => {
    const chiScene = botScene({
      hand: "123m789m456p22s5s9s",
      lastDiscard: { player: "p3", spec: "3p" },
    });
    const chi = outcomeOf(chiScene, [
      { type: "chi", payload: { tileIds: [chiScene.idOf("4p"), chiScene.idOf("5p")] } },
      { type: "pass", payload: {} },
    ]).tally;
    expect(chi.ponCount("no_progress")).toBe(0);
    expect(chi.chiOnlyCount("no_progress")).toBe(1);

    const ponScene = botScene({
      hand: "19m19p19s1244z44z",
      lastDiscard: { player: "p1", spec: "4z" },
    });
    const pon = outcomeOf(ponScene, [
      ponOf(ponScene, "4z", "4z"),
      { type: "pass", payload: {} },
    ]).tally;
    expect(pon.ponCount("no_yaku")).toBe(1);
    expect(pon.chiOnlyCount("no_yaku")).toBe(0);
  });

  it("역패 기회는 따로 센다 — 사람이 거의 항상 부르는 쪽이라 눈에 보여야 한다", () => {
    const scene = botScene({
      hand: "1479m2589p369s55z",
      lastDiscard: { player: "p1", spec: "5z" },
    });
    const { tally, bid } = outcomeOf(scene, [
      ponOf(scene, "5z", "5z"),
      { type: "pass", payload: {} },
    ]);
    // 관문은 다 통과한다 — 결말은 EV가 정하므로 여기서는 기록되지 않는다
    expect(bid).not.toBeNull();
    expect(tally.total).toBe(0);
  });

  it("집계기를 안 걸면 아무것도 기록하지 않는다 (실대국 경로)", () => {
    const scene = botScene({
      hand: "19m19p19s1244z44z",
      lastDiscard: { player: "p1", spec: "4z" },
    });
    const read = buildRead(scene.view, "p0");
    expect(read.callAudit).toBeUndefined();
    expect(
      bidCall(
        read,
        [ponOf(scene, "4z", "4z"), { type: "pass", payload: {} }] as never,
        null,
        NEUTRAL_PROFILE,
      ),
    ).toBeNull();
  });
});

describe("아슬아슬함 — EV로 진 것이 동전 던지기였는가", () => {
  it("차이가 작은 패배만 '좁은 패배'로 센다", () => {
    const tally = new CallTally();
    const base = { canPon: true, yakuhai: true, shantenBefore: 2, turn: 5 };
    tally.record({ ...base, outcome: "lost_to_pass", margin: -0.02 });
    tally.record({ ...base, outcome: "lost_to_pass", margin: -0.5 });
    expect(tally.lostSamples).toBe(2);
    expect(tally.narrowLossRate(0.05)).toBe(0.5);
    expect(tally.narrowLossRate(1)).toBe(1);
  });

  it("EV까지 못 간 기회는 아슬아슬함 표본에 들어가지 않는다", () => {
    const tally = new CallTally();
    tally.record({
      outcome: "no_yaku",
      canPon: false,
      yakuhai: false,
      shantenBefore: 3,
      turn: 4,
    });
    expect(tally.lostSamples).toBe(0);
    expect(tally.narrowLossRate(0.05)).toBe(0);
  });
});
