/**
 * 첫 판 코치 — **기회 목록**이 제대로 도는가.
 *
 * 강의 순서를 대본으로 짜지 않은 이유가 여기서 검증된다(`src/tutorial.ts` 헤더).
 * 대본이면 "리치를 설명한다"가 텐파이까지 오지 않아 뒤가 전부 멎는데, 기회 목록은
 * 안 오는 것은 그냥 안 나올 뿐 아무것도 막지 않는다.
 *
 * 강의가 스무 개를 넘기면서 두 가지가 더 붙었다 — 둘 다 여기서 지킨다:
 * - **속도 조절**: 늘 참인 강의가 첫 순에 한꺼번에 쏟아지지 않는다(`turns`).
 * - **화면 판정**: 고정·발광·생성패 같은 조작은 DOM 표식(`hit`)으로만 판정한다.
 */

import { describe, expect, it } from "vitest";
import type { PlayerView } from "@majak/core";
import { LESSONS, pickLesson, pickUrgent } from "../src/tutorial.js";
import type { CoachCtx } from "../src/tutorial.js";

/**
 * 손패 n장 + 내가 버린 패 d장이 들어 있는 최소 뷰 — 코치가 보는 것은 이 정도뿐이다.
 * 버린 패 수가 곧 "몇 순 지났는가"라서, 늦게 열리는 강의는 d로 연다.
 */
function viewWith(n: number, discards = 0): PlayerView {
  return {
    playerId: "p0",
    tiles: {},
    zones: {
      "hand:p0": { id: "hand:p0", kind: "hand", owner: "p0", tileIds: [], hiddenCount: n },
      "discards:p0": {
        id: "discards:p0",
        kind: "discards",
        owner: "p0",
        tileIds: Array.from({ length: discards }, (_, i) => i),
      },
    },
    players: [],
    round: { doraIndicators: [1] },
    augmentView: {},
    scoringOptions: {},
  } as unknown as PlayerView;
}

/** 기본은 **아무것도 안 떠 있는** 화면 — 강의가 DOM에 기대는 것을 그대로 드러낸다 */
const ctx = (over: Partial<CoachCtx> = {}): CoachCtx => ({
  view: viewWith(13),
  optionTypes: new Set<string>(),
  draftOpen: false,
  augmentReady: false,
  overlay: null,
  hit: () => false,
  seen: new Set<string>(),
  ...over,
});

/** 지정한 선택자들만 화면에 있는 것으로 친다 */
const onScreen =
  (...selectors: string[]) =>
  (q: string): boolean =>
    selectors.includes(q);

const lesson = (id: string) => LESSONS.find((l) => l.id === id)!;

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
    const basics = new Set(["discard", "dora", "hand", "aug-pill", "aug-btn", "codex"]);
    // 마무리만 남기려면 앞선 강의가 전부 '봤음'이어야 한다(그 사이 것들은 조건이 안 서 있다)
    const all = new Set([...LESSONS.map((l) => l.id).filter((id) => id !== "outro"), ...basics]);
    expect(pickLesson(ctx({ seen: all }))?.id).toBe("outro");
    // 하나라도 덜 봤으면 마무리가 아니다
    const partial = new Set([...all]);
    partial.delete("aug-btn");
    expect(pickLesson(ctx({ seen: partial }))?.id).not.toBe("outro");
  });

  it("지금 판에서 벌어지는 일이 '늘 참인 강의'보다 먼저다", () => {
    // 예전에는 후로·리치·화료가 목록 맨 아래라, 치가 성립해 판이 내 답을 기다리는
    // 동안 코치가 "설정은 여기 있습니다"를 말했다(2026-08-18 실측).
    const seen = new Set(["welcome", "hand", "discard"]);
    const late = ctx({ seen, view: viewWith(13, 4), hit: () => true });
    expect(pickLesson({ ...late, optionTypes: new Set(["chi", "pass"]) })?.id).toBe("call");
    expect(pickLesson({ ...late, optionTypes: new Set(["riichi", "discard"]) })?.id).toBe("riichi");
    expect(pickLesson({ ...late, optionTypes: new Set(["win", "pass"]) })?.id).toBe("win");
    // 기회가 없으면 그 자리는 그냥 넘어간다
    expect(pickLesson(late)?.id).toBe("dora");
  });

  it("그래도 손패·타패보다 앞서지는 않는다", () => {
    // 손패가 무엇인지도 모르는 사람에게 "치를 할 수 있습니다"가 첫 마디면 안 된다.
    const c = ctx({ seen: new Set(["welcome"]), optionTypes: new Set(["chi", "pass"]) });
    expect(pickLesson(c)?.id).toBe("hand");
  });

  it("전부 본 뒤에는 아무것도 안 꺼낸다", () => {
    const all = new Set(LESSONS.map((l) => l.id));
    expect(
      pickLesson(ctx({ seen: all, optionTypes: new Set(["discard", "riichi", "win"]) })),
    ).toBeNull();
  });
});

describe("속도 조절 — 한 순에 두세 마디", () => {
  /** 첫 순(아무것도 안 버린 상태)에 조건이 서는 강의 id들 */
  const openAtStart = (over: Partial<CoachCtx> = {}): string[] =>
    LESSONS.filter((l) => l.when(ctx(over))).map((l) => l.id);

  it("첫 순에는 늘 참인 강의가 한꺼번에 열리지 않는다", () => {
    // 아무 조작도 안 한 첫 순 — "판을 읽는 법" 셋만 열려 있어야 한다.
    // (여기에 증강 읽기·화면 도구까지 얹히면 첫 패를 버리기 전에 말풍선을 열댓 번 닫는다.)
    expect(openAtStart()).toEqual(["welcome", "hand", "dora"]);
  });

  it("한 순 지나면 다음 묶음이 열린다", () => {
    expect(openAtStart({ view: viewWith(13, 1) })).toContain("river");
    expect(openAtStart({ view: viewWith(13, 1) })).not.toContain("aug-others");
    expect(openAtStart({ view: viewWith(13, 3) })).toContain("aug-others");
  });

  it("증강 선택창이 떠 있는 동안에는 판 강의를 꺼내지 않는다", () => {
    const open = openAtStart({ draftOpen: true, view: viewWith(13, 4) });
    expect(open).toContain("draft");
    expect(open).not.toContain("hand");
    expect(open).not.toContain("river");
    expect(open).not.toContain("settings");
  });
});

describe("조작을 마치면 저절로 넘어간다", () => {
  it("버리기 — 선택지가 사라지면 끝난 것으로 본다", () => {
    // 클릭 이벤트를 세지 않는다: 드래그·단축키·오른쪽 버튼으로도 버릴 수 있어서
    // 이벤트를 세면 셋 중 둘을 놓친다. 화면의 상태가 유일한 진실이다.
    const d = lesson("discard");
    expect(d.done?.(ctx({ optionTypes: new Set(["discard"]) }))).toBe(false);
    expect(d.done?.(ctx({ optionTypes: new Set() }))).toBe(true);
  });

  it("증강 선택 — 창이 닫히면 끝", () => {
    const d = lesson("draft-pick");
    expect(d.done?.(ctx({ draftOpen: true }))).toBe(false);
    expect(d.done?.(ctx({ draftOpen: false }))).toBe(true);
  });

  it("설명 고정 — 📌 표식이 화면에 뜨면 끝", () => {
    const d = lesson("aug-pin");
    expect(d.done?.(ctx())).toBe(false);
    expect(d.done?.(ctx({ hit: onScreen(".aug-pill-pinned") }))).toBe(true);
  });

  it("자세히 — 펼쳐진 본문이 내 이름표 안에 떠야 끝", () => {
    const d = lesson("aug-detail");
    // 드래프트 카드에서 펼친 것은 이 강의의 완료가 아니다 (자리가 다르다)
    expect(d.done?.(ctx({ hit: onScreen(".draft-card .augdesc-body-full") }))).toBe(false);
    expect(d.done?.(ctx({ hit: onScreen(".own-top-main .augdesc-body-full") }))).toBe(true);
  });

  it("액티브 버튼 발광 — 이름표 알약에 빛이 들어와야 끝", () => {
    const d = lesson("aug-btn");
    expect(d.done?.(ctx())).toBe(false);
    expect(d.done?.(ctx({ hit: onScreen(".aug-pill-usable") }))).toBe(true);
  });

  it("증강 발동 — 보라 생성패가 생기면 끝", () => {
    const d = lesson("aug-use");
    expect(d.done?.(ctx())).toBe(false);
    expect(d.done?.(ctx({ hit: onScreen(".tile-conjured") }))).toBe(true);
  });

  it("도감·규칙 — 실제로 열어야 끝난다", () => {
    expect(lesson("codex").done?.(ctx())).toBe(false);
    expect(lesson("codex").done?.(ctx({ overlay: "codex" }))).toBe(true);
    // 도감을 열었다고 규칙 강의가 끝나지는 않는다
    expect(lesson("help").done?.(ctx({ overlay: "codex" }))).toBe(false);
    expect(lesson("help").done?.(ctx({ overlay: "help" }))).toBe(true);
  });

  it("설정 — 패널이 뜨면 끝", () => {
    const d = lesson("settings");
    expect(d.done?.(ctx())).toBe(false);
    expect(d.done?.(ctx({ hit: onScreen(".settings-panel") }))).toBe(true);
  });
});

describe("읽던 강의를 밀어내고 끼어든다", () => {
  it("치·리치·화료·새 증강 선택창은 읽던 안내를 밀어낸다", () => {
    // 코치는 붙들고 있는 강의가 끝나야 다음을 집는다 — 그래서 그 사이에 생긴
    // 기회는 목록 순서만으로는 못 잡는다(2026-08-18 실측: 치·패스가 판을 막고
    // 선 채로 "증강 이름에 마우스를 올려 보세요"가 떠 있었다).
    const seen = new Set(["welcome", "hand", "discard"]);
    expect(pickUrgent(ctx({ seen, optionTypes: new Set(["chi", "pass"]) }))?.id).toBe("call");
    expect(pickUrgent(ctx({ seen, optionTypes: new Set(["win", "pass"]) }))?.id).toBe("win");
    expect(pickUrgent(ctx({ seen, draftOpen: true }))?.id).toBe("draft");
  });

  it("인사말은 증강 선택창에 밀려나지 않는다", () => {
    // 첫 국은 선택창이 뜬 채로 시작한다 — 인사말이 뜨자마자 밀려나면 아무도 못 읽는다.
    expect(pickUrgent(ctx({ seen: new Set(), draftOpen: true }))?.id).toBe("welcome");
  });

  it("아무 일도 안 벌어지면 끼어들지 않는다", () => {
    const seen = new Set(["welcome", "hand", "discard"]);
    expect(pickUrgent(ctx({ seen, view: viewWith(13, 4), hit: () => true }))).toBeNull();
  });

  it("이미 본 끼어들기는 다시 끼어들지 않는다", () => {
    const seen = new Set(["welcome", "hand", "discard", "call"]);
    expect(pickUrgent(ctx({ seen, optionTypes: new Set(["chi", "pass"]) }))).toBeNull();
  });
});

describe("강의가 지키는 규약", () => {
  it("id가 겹치지 않는다 — 겹치면 뒤엣것이 영영 안 나온다", () => {
    const ids = LESSONS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("해 보라고 한 강의에는 완료 판정이 있다", () => {
    // `todo`만 있고 `done`이 없으면 조작을 마쳐도 말풍선이 그대로 서 있다 —
    // 사용자는 자기가 한 것이 맞는지 알 길이 없다.
    for (const l of LESSONS.filter((x) => x.todo !== undefined)) {
      expect(l.done, `${l.id}: todo가 있으면 done도 있어야 한다`).toBeDefined();
    }
  });

  it("마무리가 요구하는 강의는 전부 실재한다", () => {
    // outro의 `when`은 id 문자열로 앞 강의를 참조한다 — 이름을 고치면 조용히
    // "영영 안 끝나는 튜토리얼"이 된다. 요구 목록이 실제 id인지 확인한다.
    const ids = new Set(LESSONS.map((l) => l.id));
    const required = ["discard", "dora", "hand", "aug-pill", "aug-btn", "codex"];
    for (const id of required) expect(ids.has(id), `${id} 강의가 사라졌다`).toBe(true);
    const seen = new Set(required);
    expect(lesson("outro").when(ctx({ seen }))).toBe(true);
  });
});
