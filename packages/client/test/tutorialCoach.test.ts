/**
 * 첫 판 코치 — **기회 목록**이 제대로 도는가.
 *
 * 강의 순서를 대본으로 짜지 않은 이유가 여기서 검증된다(`src/tutorial.ts` 헤더).
 * 대본이면 "리치를 설명한다"가 텐파이까지 오지 않아 뒤가 전부 멎는데, 기회 목록은
 * 안 오는 것은 그냥 안 나올 뿐 아무것도 막지 않는다.
 */

import { describe, expect, it } from "vitest";
import type { PlayerView } from "@majak/core";
import { LESSONS, pickLesson } from "../src/tutorial.js";
import type { CoachCtx } from "../src/tutorial.js";

/** 손패 13장이 들어 있는 최소 뷰 — 코치가 보는 것은 이 정도뿐이다 */
function viewWithHand(n: number): PlayerView {
  return {
    playerId: "p0",
    tiles: {},
    zones: { "hand:p0": { id: "hand:p0", kind: "hand", owner: "p0", tileIds: [], hiddenCount: n } },
    players: [],
    round: { doraIndicators: [1] },
    augmentView: {},
    scoringOptions: {},
  } as unknown as PlayerView;
}

const ctx = (over: Partial<CoachCtx> = {}): CoachCtx => ({
  view: viewWithHand(13),
  optionTypes: new Set<string>(),
  draftOpen: false,
  augmentReady: false,
  seen: new Set<string>(),
  ...over,
});

describe("무엇을 언제 꺼내는가", () => {
  it("판에 들어오면 환영부터", () => {
    expect(pickLesson(ctx())?.id).toBe("welcome");
  });

  it("이미 본 것은 다시 안 꺼낸다", () => {
    const seen = new Set(["welcome"]);
    expect(pickLesson(ctx({ seen }))?.id).toBe("hand");
  });

  it("증강 선택창이 떠 있으면 그것부터 — 손패보다 앞이다", () => {
    const seen = new Set(["welcome"]);
    expect(pickLesson(ctx({ seen, draftOpen: true }))?.id).toBe("draft");
  });

  it("내 차례가 오면 버리기를 짚는다", () => {
    const seen = new Set(["welcome", "hand", "dora"]);
    const c = ctx({ seen, optionTypes: new Set(["discard"]) });
    expect(pickLesson(c)?.id).toBe("discard");
  });

  it("기회가 안 오면 그 강의는 그냥 안 나온다 — 뒤를 막지 않는다", () => {
    // 리치도 울기도 화료도 없는 조용한 국면. 그래도 다음 강의는 나온다.
    const seen = new Set(["welcome", "hand", "discard"]);
    expect(pickLesson(ctx({ seen }))?.id).toBe("dora");
  });

  it("기본을 다 본 뒤에야 마무리가 나온다", () => {
    const basics = new Set(["welcome", "draft", "hand", "discard", "dora"]);
    expect(pickLesson(ctx({ seen: basics }))?.id).toBe("outro");
    // 하나라도 덜 봤으면 마무리가 아니다
    const partial = new Set(["welcome", "draft", "hand", "discard"]);
    expect(pickLesson(ctx({ seen: partial }))?.id).not.toBe("outro");
  });

  it("전부 본 뒤에는 아무것도 안 꺼낸다", () => {
    const all = new Set(LESSONS.map((l) => l.id));
    expect(pickLesson(ctx({ seen: all, optionTypes: new Set(["discard", "riichi", "win"]) }))).toBeNull();
  });
});

describe("조작을 마치면 저절로 넘어간다", () => {
  const lesson = (id: string) => LESSONS.find((l) => l.id === id)!;

  it("버리기 — 선택지가 사라지면 끝난 것으로 본다", () => {
    // 클릭 이벤트를 세지 않는다: 드래그·단축키·오른쪽 버튼으로도 버릴 수 있어서
    // 이벤트를 세면 셋 중 둘을 놓친다. 화면의 상태가 유일한 진실이다.
    const d = lesson("discard");
    expect(d.done?.(ctx({ optionTypes: new Set(["discard"]) }))).toBe(false);
    expect(d.done?.(ctx({ optionTypes: new Set() }))).toBe(true);
  });

  it("증강 선택 — 창이 닫히면 끝", () => {
    const d = lesson("draft");
    expect(d.done?.(ctx({ draftOpen: true }))).toBe(false);
    expect(d.done?.(ctx({ draftOpen: false }))).toBe(true);
  });
});
