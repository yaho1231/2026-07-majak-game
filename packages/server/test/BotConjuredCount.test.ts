/**
 * 봇의 장 세기(tileTracker)는 **증강이 만들어 낸 패(conjured)를 세지 않는다.**
 *
 * 증강이 "없던 패를 준다"를 구현하는 방식은 기존 타일 한 장의 kind를 덮어쓰는 것이라
 * (`tileKindChanged`, `attrs.conjured`), 같은 종류가 5장 이상 존재할 수 있다
 * (docs/25 P8 — 프리즘의 의도된 상식 파괴).
 *
 * 사람은 이 문제가 없다: 생성패는 화면에 보라색으로 구분되어 그려지므로 셈에서 뺄 수
 * 있다. 반면 봇의 `tileTracker`는 kind만 세고 attrs를 안 봐서 **생성패를 진짜 패로
 * 착각**했다 — 실제로는 1장 남았는데 "다 나갔다"고 판단해 그 대기를 죽은 것으로 보거나
 * 남은 장수 기반 안전도를 잘못 낮게 매긴다. 사람과 봇의 정보 기준을 맞춘다.
 */

import { describe, expect, it } from "vitest";
import type { PlayerView, TileKind } from "@majak/core";
import { tileTracker } from "../src/bot/danger.js";
import { botScene } from "./botTestView.js";

const FIVE_MAN: TileKind = { suit: "man", rank: 5 };

/** 상대 바닥의 마지막 패를 생성패로 표시한 뷰 */
function markLastDiscardConjured(view: PlayerView, player: string): PlayerView {
  const ids = view.zones[`discards:${player}`]?.tileIds ?? [];
  const last = ids[ids.length - 1];
  if (last === undefined) throw new Error("no discard to mark");
  const tile = view.tiles[last];
  if (tile === undefined) throw new Error("no tile");
  return {
    ...view,
    tiles: { ...view.tiles, [last]: { ...tile, attrs: { ...tile.attrs, conjured: true } } },
  };
}

describe("tileTracker — 생성패는 장 세기에서 뺀다", () => {
  it("보이는 5만 3장이 전부 진짜면 1장 남았다고 센다 (기준선)", () => {
    const { view } = botScene({ hand: "123p456p789p11s2s", discards: { p1: "555m" } });
    expect(tileTracker(view)(FIVE_MAN)).toBe(1);
  });

  it("그중 한 장이 생성패면 진짜는 2장뿐 — 2장 남았다고 센다", () => {
    const scene = botScene({ hand: "123p456p789p11s2s", discards: { p1: "555m" } });
    const view = markLastDiscardConjured(scene.view, "p1");
    expect(tileTracker(view)(FIVE_MAN)).toBe(2);
  });

  it("진짜 4장이 다 보이는데 생성패가 하나 더 있어도 0 아래로 내려가지 않는다", () => {
    const scene = botScene({ hand: "5m123p456p789p11s", discards: { p1: "555m" } });
    // 손패 5만 1장 + 상대 바닥 5만 3장 = 진짜 4장. 여기에 생성패 한 장을 더 얹는다.
    const withExtra = botScene({
      hand: "5m123p456p789p11s",
      discards: { p1: "555m", p2: "5m" },
    });
    expect(tileTracker(scene.view)(FIVE_MAN)).toBe(0);
    const view = markLastDiscardConjured(withExtra.view, "p2");
    expect(tileTracker(view)(FIVE_MAN)).toBe(0);
  });

  it("내 손패에 든 생성패도 세지 않는다", () => {
    const scene = botScene({ hand: "5m123p456p789p11s", discards: { p1: "55m" } });
    expect(tileTracker(scene.view)(FIVE_MAN)).toBe(1);
    // 내 손의 5만을 생성패로 바꾸면 진짜는 상대 바닥 2장뿐 → 2장 남았다
    const handIds = scene.view.zones["hand:p0"]?.tileIds ?? [];
    const mine = handIds[0] as number;
    const tile = scene.view.tiles[mine];
    if (tile === undefined) throw new Error("no tile");
    const view: PlayerView = {
      ...scene.view,
      tiles: {
        ...scene.view.tiles,
        [mine]: { ...tile, attrs: { ...tile.attrs, conjured: true } },
      },
    };
    expect(tileTracker(view)(FIVE_MAN)).toBe(2);
  });
});
