/**
 * 울고 난 국 vs 안 운 국 집계(`bot/openTally.ts`)가 **국을 제대로 가르는지** 검증한다.
 *
 * 이 표는 후로율 격차의 원인을 다시 짚는 근거가 되므로, 갈래를 하나만 잘못 넣어도
 * 다음 판단이 통째로 틀어진다. 특히 **안깡은 후로가 아니다** — 코어 `StatsTracker`의
 * 후로율 정의와 어긋나면 두 표를 나란히 놓고 볼 수 없다.
 */

import { describe, expect, it } from "vitest";
import { CALL_MADE, KAN_DECLARED, ROUND_SETTLED, ROUND_STARTED } from "@majak/core";
import { OpenTally } from "../src/bot/openTally.js";

const SEATS = ["p0", "p1", "p2", "p3"] as const;

const start = { type: ROUND_STARTED };
const call = (caller: string) => ({ type: CALL_MADE, payload: { caller, meldKind: "pon" } });
const kan = (player: string, kanKind: string) => ({
  type: KAN_DECLARED,
  payload: { player, kanKind },
});
const settled = (
  winInfos: { winner: string; points: number; winType: string; from?: string | null }[],
) => ({ type: ROUND_SETTLED, payload: { winInfos } });

function run(events: { type: string; payload?: unknown }[]) {
  const tally = new OpenTally([...SEATS]);
  for (const e of events) tally.consume(e);
  return tally.view();
}

describe("울고 난 국 가르기", () => {
  it("운 사람만 '울었다' 쪽으로 간다 — 국당 4인분을 센다", () => {
    const v = run([
      start,
      call("p1"),
      settled([{ winner: "p1", points: 3900, winType: "ron", from: "p2" }]),
    ]);
    expect(v.opened.rounds).toBe(1);
    expect(v.closed.rounds).toBe(3);
    expect(v.opened.wins).toBe(1);
    expect(v.opened.winPoints).toBe(3900);
    expect(v.closed.dealIns).toBe(1); // p2가 쐈고 p2는 안 울었다
  });

  it("안깡은 후로가 아니다 — 대명깡·가깡만 '울었다'로 센다", () => {
    const v = run([
      start,
      kan("p1", "kan_closed"),
      kan("p2", "kan_open"),
      settled([]),
    ]);
    expect(v.opened.rounds).toBe(1); // p2만
    expect(v.closed.rounds).toBe(3); // p1 포함
  });

  it("한 국에 여러 번 울어도 그 사람은 한 국이다", () => {
    const v = run([start, call("p1"), call("p1"), settled([])]);
    expect(v.opened.rounds).toBe(1);
  });

  it("국이 바뀌면 표시가 초기화된다", () => {
    const v = run([start, call("p1"), settled([]), start, settled([])]);
    expect(v.opened.rounds).toBe(1);
    expect(v.closed.rounds).toBe(7); // 1국차 셋 + 2국차 넷
  });

  it("쯔모 화료는 아무도 쏘지 않는다", () => {
    const v = run([
      start,
      call("p0"),
      settled([{ winner: "p0", points: 2000, winType: "tsumo", from: null }]),
    ]);
    expect(v.opened.dealIns).toBe(0);
    expect(v.closed.dealIns).toBe(0);
    expect(v.opened.winRate).toBe(1);
  });

  it("유국은 화료도 방총도 없이 국만 센다", () => {
    const v = run([start, settled([])]);
    expect(v.closed.rounds).toBe(4);
    expect(v.closed.wins).toBe(0);
    expect(v.closed.winRate).toBe(0);
    expect(v.closed.avgWinPoints).toBe(0);
  });

  it("더블론이면 둘 다 화료로, 쏜 사람은 방총 1회로 센다", () => {
    const v = run([
      start,
      settled([
        { winner: "p1", points: 1000, winType: "ron", from: "p0" },
        { winner: "p2", points: 8000, winType: "ron", from: "p0" },
      ]),
    ]);
    expect(v.closed.wins).toBe(2);
    expect(v.closed.dealIns).toBe(1);
    expect(v.closed.winPoints).toBe(9000);
  });
});
