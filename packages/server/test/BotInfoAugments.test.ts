/**
 * **봇이 자기 정보 증강이 열어 준 것을 실제로 쓴다** (QA synergy4 A-14).
 *
 * 4라운드 실측: 투시 60회·천리안 258회·지뢰 탐지 296회를 발동하고도 30/30판 결과가
 * 완전히 동일했다 — 봇 코드 어디에도 그 정보를 읽는 곳이 없었기 때문이다.
 *
 * **치트 경계**: 여기서 읽는 것은 전부 «그 좌석의 뷰에 실려 온 것»이다.
 *  - 상대 손패는 `view.tiles`에 실제로 실려 있을 때만 읽는다(투시가 `visibility.hand`를
 *    "public"으로 열어 준 결과). 가려진 패는 `view.tiles`에 아예 없다.
 *  - 지뢰 탐지·천리안 결과는 `view.augmentView`의 **내 전용 채널**(`view:{나}:*`)이다.
 * 아래 테스트는 그 경계도 함께 지킨다 — 채널·공개가 없으면 판단이 예전과 같아야 한다.
 */

import { describe, expect, it } from "vitest";
import type { PlayerView, TileKind } from "@majak/core";
import { kindKey } from "@majak/core";
import { tileTracker, readThreats, safetyOf } from "../src/bot/danger.js";
import { readIntel } from "../src/bot/intel.js";
import { botScene, h } from "./botTestView.js";

const FIVE_SOU: TileKind = { suit: "sou", rank: 5 };

/** 상대 손패를 **내 뷰에 공개된 채로** 얹는다 (투시가 열어 준 상태) */
function revealHand(view: PlayerView, player: string, spec: string): PlayerView {
  const tiles = { ...view.tiles };
  const ids: number[] = [];
  let next = Math.max(0, ...Object.keys(tiles).map(Number)) + 1;
  for (const kind of h(spec)) {
    tiles[next] = { id: next, kind, attrs: {} };
    ids.push(next);
    next++;
  }
  return {
    ...view,
    tiles,
    zones: {
      ...view.zones,
      [`hand:${player}`]: {
        id: `hand:${player}`,
        kind: "hand",
        owner: player,
        tileIds: ids,
        hiddenCount: 0,
      },
    },
  };
}

/** 손패는 있으나 **가려져 있다**(장수만 보인다) — 투시가 없는 평범한 상태 */
function hiddenHand(view: PlayerView, player: string, count: number): PlayerView {
  return {
    ...view,
    zones: {
      ...view.zones,
      [`hand:${player}`]: {
        id: `hand:${player}`,
        kind: "hand",
        owner: player,
        tileIds: [],
        hiddenCount: count,
      },
    },
  };
}

describe("장 세기 — 뷰에 공개된 손패는 세고, 가려진 손패는 세지 않는다", () => {
  it("가려진 상대 손패는 한 장도 세지 않는다 (치트 경계)", () => {
    const scene = botScene({ hand: "123p456p789p11s2s" });
    const view = hiddenHand(scene.view, "p1", 13);
    expect(tileTracker(view)(FIVE_SOU)).toBe(4);
  });

  it("투시로 열린 상대 손패의 패는 장 세기에 들어온다", () => {
    const scene = botScene({ hand: "123p456p789p11s2s" });
    const view = revealHand(scene.view, "p1", "555s1234m6789m");
    expect(tileTracker(view)(FIVE_SOU)).toBe(1); // 5삭 3장이 저 손에 보인다
  });
});

describe("위협 읽기 — 열린 손패의 대기는 추정하지 않고 그대로 안다", () => {
  it("보이는 손이 텐파이면 그 오름패만 위험하고 나머지는 안전하다", () => {
    const scene = botScene({ hand: "123p456p789p11s2s", turnCount: 8 });
    // p1: 123m 456m 789m 11p + 56s → 4s/7s 대기 (13장)
    const view = revealHand(scene.view, "p1", "123456789m11p56s");
    const intel = readIntel(view, "p0", {});
    const seen = intel.byPlayer.get("p1");
    expect(seen?.exactWaits).toBeDefined();
    expect([...(seen?.exactWaits ?? [])].sort()).toEqual(
      [kindKey({ suit: "sou", rank: 4 }), kindKey({ suit: "sou", rank: 7 })].sort(),
    );

    const threats = readThreats(view, "p0", [], undefined, intel);
    const t = threats.find((x) => x.player === "p1");
    expect(t?.level).toBe(1);
    // p1만 떼어 본다 (나머지 두 사람은 여전히 «모르는 상대»라 잔여 위험이 남는다)
    const only = threats.filter((x) => x.player === "p1");
    const remaining = tileTracker(view);
    expect(safetyOf({ suit: "sou", rank: 4 }, only, remaining)).toBe(0); // 확실히 쏘인다
    expect(safetyOf({ suit: "sou", rank: 5 }, only, remaining)).toBe(1); // 확실히 안전
  });

  it("보이는 손이 노텐이면 그 사람은 위협이 아니다", () => {
    const scene = botScene({ hand: "123p456p789p11s2s", turnCount: 8 });
    const view = revealHand(scene.view, "p1", "147m258p369s1234z");
    const threats = readThreats(view, "p0", [], undefined, readIntel(view, "p0", {}));
    expect(threats.find((x) => x.player === "p1")?.level).toBe(0);
  });

  it("정보가 없으면 종전 추정 그대로다 (기본값이 «아무것도 없음»)", () => {
    const scene = botScene({ hand: "123p456p789p11s2s", riichi: ["p1"], turnCount: 8 });
    const withIntel = readThreats(
      scene.view,
      "p0",
      [],
      undefined,
      readIntel(scene.view, "p0", {}),
    );
    const without = readThreats(scene.view, "p0", []);
    expect(withIntel.map((t) => t.level)).toEqual(without.map((t) => t.level));
  });
});

describe("천리안·지뢰 탐지 — 내 전용 채널만 읽는다", () => {
  it("천리안이 텐파이라고 한 상대는 위협도가 올라간다", () => {
    const base = botScene({ hand: "123p456p789p11s2s", turnCount: 8 });
    const scanned = botScene({
      hand: "123p456p789p11s2s",
      turnCount: 8,
      augmentView: { tenpai_scan: { players: ["p1"], widths: ["보통"], turn: 8 } },
    });
    const lvl = (v: PlayerView): number =>
      readThreats(v, "p0", [], undefined, readIntel(v, "p0", {})).find((t) => t.player === "p1")
        ?.level ?? 0;
    expect(lvl(scanned.view)).toBeGreaterThan(lvl(base.view));
  });

  it("지뢰 탐지가 찍은 패는 안전도가 떨어진다", () => {
    const scene = botScene({
      hand: "123p456p789p11s2s",
      riichi: ["p1"],
      discards: { p1: "2s" },
      turnCount: 8,
      augmentView: { danger_sense: { kinds: [kindKey(FIVE_SOU)], turn: 8 } },
    });
    const plain = botScene({
      hand: "123p456p789p11s2s",
      riichi: ["p1"],
      discards: { p1: "2s" },
      turnCount: 8,
    });
    const safety = (v: PlayerView): number => {
      const intel = readIntel(v, "p0", {});
      const threats = readThreats(v, "p0", [], undefined, intel);
      return safetyOf(FIVE_SOU, threats, tileTracker(v), {
        turn: 8,
        doraKinds: [],
        sujiTrust: 0.6,
        ...(intel.dangerKinds.size > 0
          ? { confirmedDanger: intel.dangerKinds, confirmedDangerTrust: 1 }
          : {}),
      });
    };
    expect(safety(scene.view)).toBeLessThan(safety(plain.view));
  });

  it("채널이 없으면 아무것도 읽지 않는다", () => {
    const scene = botScene({ hand: "123p456p789p11s2s" });
    const intel = readIntel(scene.view, "p0", {});
    expect(intel.any).toBe(false);
    expect(intel.dangerKinds.size).toBe(0);
    expect(intel.byPlayer.size).toBe(0);
  });
});
