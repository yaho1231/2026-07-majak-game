/**
 * 자리 바꿈(seat_swap) × 정산 인터셉터 순서 — **재구성이 원본과 같은 순서로 정산한다.**
 *
 * `settleInterceptor`는 설치 시점에 priority를 한 번 굳힌다. 그 "자리" 자리에
 * `player.seat`을 쓰면, 자리 바꿈이 그 값을 영구히 맞바꾼 뒤의 재구성(이어하기·리플레이,
 * `rebuildAugments`)이 **새 좌석 번호로 다시 정렬**해 원본과 다른 순서로 정산한다.
 * 정산 인터셉터는 교환법칙이 성립하지 않으므로 그건 곧 점수가 갈린다는 뜻이다 —
 * 실측으로 기생충(p1) × 스파이(p2)에서 4,000점이 통째로 오갔다(QA 2026-08-22 synergy 확정 2).
 *
 * 그래서 축을 `players` 배열 인덱스(`settleSeatAxis`)로 바꿨다. 자리 바꿈은 배열 순서를
 * 건드리지 않는다.
 */
import { describe, expect, it } from "vitest";
import {
  ROUND_SETTLED,
  createStandardGame,
  installAugment,
  uninstallAugment,
} from "@majak/core";
import type { PlayerId } from "@majak/core";
import { contentAugments } from "../src/index.js";

const SEATS: PlayerId[] = ["p0", "p1", "p2", "p3"];
/** 정산 인터셉터를 쓰는 대표 증강 — 서로 다른 좌석에 하나씩 */
const PLANT: [string, PlayerId][] = [
  ["parasite", "p0"],
  ["big_hand", "p1"],
  ["spy", "p2"],
  ["counter", "p3"],
];

function scene() {
  const game = createStandardGame({
    seed: 1234,
    playerIds: [...SEATS],
    mode: "hanchan",
    startScore: 25000,
    redFivesPerSuit: 1,
    extraAugments: contentAugments,
  } as never) as never as {
    engine: {
      state: { players: { id: PlayerId; seat: number }[] };
      effects: { interceptorsFor: (t: string) => { source: string }[] };
    };
    yaku: unknown;
    augments: unknown;
  };
  const byId = new Map(contentAugments.map((d) => [d.id, d]));
  const install = (): void => {
    for (const [id, who] of PLANT) {
      installAugment(game.engine as never, byId.get(id)!, who, {
        yaku: game.yaku,
        catalog: game.augments,
      } as never);
    }
  };
  const uninstall = (): void => {
    for (const [id, who] of PLANT) uninstallAugment(game.engine as never, byId.get(id)!, who);
  };
  const order = (): string[] =>
    game.engine.effects
      .interceptorsFor(ROUND_SETTLED)
      .map((e) => e.source)
      .filter((s) => PLANT.some(([id]) => s.endsWith(id)));
  return { game, install, uninstall, order };
}

describe("자리 바꿈 뒤 재구성 — 정산 순서", () => {
  it("자리를 안 바꾸면 재구성이 원본과 같다 (대조군)", () => {
    const s = scene();
    s.install();
    const before = s.order();
    s.uninstall();
    s.install();
    expect(s.order()).toEqual(before);
  });

  it("p0↔p2 자리를 바꿔도 재구성이 원본과 같은 순서로 정산한다", () => {
    const s = scene();
    s.install();
    const before = s.order();
    // seat_swap 이 하는 일 — players[].seat 만 맞바꾼다(배열 순서는 그대로).
    const st = s.game.engine.state;
    const s0 = st.players.find((p) => p.id === "p0")!.seat;
    const s2 = st.players.find((p) => p.id === "p2")!.seat;
    st.players = st.players.map((p) =>
      p.id === "p0" ? { ...p, seat: s2 } : p.id === "p2" ? { ...p, seat: s0 } : p,
    );
    s.uninstall();
    s.install();
    expect(s.order()).toEqual(before);
  });
});
