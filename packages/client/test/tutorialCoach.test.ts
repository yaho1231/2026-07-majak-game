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
import { LESSONS, pickLesson, pickUrgent, placeBubble } from "../src/tutorial.js";
import type { CoachCtx, CoachRect } from "../src/tutorial.js";

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


// ─────────────────────── 말풍선이 가리키는 것을 따라간다 ───────────────────────

describe("말풍선 자리 (placeBubble)", () => {
  /** 1280×720 데스크톱 + 아래쪽에 손패·액션 바 줄 */
  const view = { w: 1280, h: 720 };
  const size = { w: 420, h: 150 };
  const ownArea: CoachRect = { top: 520, left: 140, w: 1000, h: 200 };
  const keep = [ownArea];

  /**
   * 자리(top 또는 bottom + left)를 **화면 위 실제 사각형**으로 되돌린다.
   * 테스트가 보는 것은 필드 이름이 아니라 "말풍선이 결국 어디에 그려지는가"다.
   */
  const boxOf = (
    spot: ReturnType<typeof placeBubble>,
    bubble = size,
    v = view,
  ): CoachRect => ({
    top: spot.top ?? v.h - (spot.bottom ?? 0) - bubble.h,
    left: spot.left,
    ...bubble,
  });
  const hits = (a: CoachRect, b: CoachRect): boolean =>
    a.left < b.left + b.w && b.left < a.left + a.w && a.top < b.top + b.h && b.top < a.top + a.h;
  /** 말풍선 가운데와 강조 가운데 사이 거리 */
  const gap = (a: CoachRect, b: CoachRect): number =>
    Math.hypot(a.left + a.w / 2 - (b.left + b.w / 2), a.top + a.h / 2 - (b.top + b.h / 2));

  it("오른쪽 위 아이콘을 가리키면 그 바로 밑에 붙는다", () => {
    // 예전에는 화면 위쪽 **가운데**에 못 박혀 있어서, 📖를 가리키면서 글은
    // 화면 반대편에 있었다 (2026-08-18 사용자 지적).
    const icon: CoachRect = { top: 10, left: 1070, w: 44, h: 40 };
    const box = boxOf(placeBubble(icon, size, view, keep));
    expect(box.top).toBeGreaterThanOrEqual(icon.top + icon.h);
    expect(hits(box, icon)).toBe(false);
    const band = boxOf({ top: 12, left: (view.w - size.w) / 2 });
    expect(gap(box, icon)).toBeLessThan(gap(band, icon)); // 위쪽 가운데보다 가깝다
  });

  it("가운데(도라 표시)를 가리키면 그 위에 붙는다", () => {
    const dora: CoachRect = { top: 300, left: 600, w: 60, h: 80 };
    const box = boxOf(placeBubble(dora, size, view, keep));
    expect(box.top + box.h).toBeLessThanOrEqual(dora.top);
    expect(hits(box, ownArea)).toBe(false);
  });

  it("손패를 가리킬 때는 손패도 액션 바도 덮지 않는다", () => {
    // 여기가 이 함수의 존재 이유다 — "이 패를 누르세요"라고 해 놓고 그 패를 덮으면 안 된다.
    expect(hits(boxOf(placeBubble(ownArea, size, view, keep)), ownArea)).toBe(false);
  });

  it("액션 바를 가리키면 버튼 바로 위에 선다 — 버튼은 안 가린다", () => {
    const bar: CoachRect = { top: 520, left: 400, w: 480, h: 70 };
    const box = boxOf(placeBubble(bar, size, view, [ownArea]));
    expect(box.top + box.h).toBeLessThanOrEqual(bar.top);
    expect(hits(box, bar)).toBe(false);
  });

  it("위에 붙을 때는 아래쪽 끝을 붙들어 둔다 — 글이 길어져도 아래로 자라지 않는다", () => {
    // 폰 세로에서 실제로 물었던 자리다: 높이를 재고 나서 글이 한 줄 늘면
    // `top` 고정은 그만큼 아래로 자라 치·패스 버튼을 덮는다.
    const bar: CoachRect = { top: 430, left: 20, w: 340, h: 60 };
    const phone = { w: 375, h: 812 };
    const spot = placeBubble(bar, { w: 343, h: 145 }, phone, []);
    expect(spot.bottom).toBeDefined();
    expect(spot.top).toBeUndefined();
    // 같은 자리에 20px 더 높은 말풍선을 그려도 여전히 버튼을 안 문다
    const taller = boxOf(spot, { w: 343, h: 165 }, phone);
    expect(taller.top + taller.h).toBeLessThanOrEqual(bar.top);
  });

  it("화면을 거의 다 덮는 강조(증강 선택창)에는 옆에 설 자리가 없다 — 위쪽 띠로 물러난다", () => {
    const panel: CoachRect = { top: 40, left: 60, w: 1160, h: 640 };
    expect(placeBubble(panel, size, view, keep)).toEqual({
      top: 12,
      left: (view.w - size.w) / 2,
    });
  });

  it("가리킬 것이 없으면 위쪽 띠 가운데", () => {
    expect(placeBubble(null, size, view, keep)).toEqual({
      top: 12,
      left: (view.w - size.w) / 2,
    });
  });

  /*
   * 띠로 물러날 때도 **덜 가리는 쪽**을 고른다 (2026-08-18 PC 실측).
   *
   * 증강 선택창은 화면을 거의 다 덮어서 늘 이 경로로 오는데, 예전에는 무조건 위쪽
   * 띠였고 그 자리에 정확히 "증강 선택" 제목과 남은 시간 타이머가 있었다 —
   * 420×43px이 겹쳐 제목·타이머가 통째로 안 보였다.
   */
  it("위쪽 띠가 가리면 안 되는 줄을 물면 아래쪽 띠로 비켜선다", () => {
    const panel: CoachRect = { top: 40, left: 60, w: 1160, h: 640 };
    const draftHead: CoachRect = { top: 20, left: 180, w: 920, h: 140 };
    const box = boxOf(placeBubble(panel, size, view, [draftHead]));
    expect(hits(box, draftHead)).toBe(false);
    // 아래쪽 띠다 — 위로만 자라도록 bottom을 붙들어 둔다
    expect(box.top + box.h).toBeLessThanOrEqual(view.h);
  });

  it("가리킬 것이 없어도 같은 규칙이 적용된다", () => {
    const draftHead: CoachRect = { top: 20, left: 180, w: 920, h: 140 };
    expect(hits(boxOf(placeBubble(null, size, view, [draftHead])), draftHead)).toBe(false);
  });

  it("위·아래 어느 쪽도 안 가리면 위쪽 띠가 이긴다 (아래에는 손패가 있다)", () => {
    expect(placeBubble(null, size, view, [])).toEqual({
      top: 12,
      left: (view.w - size.w) / 2,
    });
  });

  it("어디에 놓든 화면 밖으로는 안 나간다", () => {
    const corners: CoachRect[] = [
      { top: 0, left: 0, w: 30, h: 30 },
      { top: 690, left: 1250, w: 30, h: 30 },
      { top: 0, left: 1250, w: 30, h: 30 },
      { top: 690, left: 0, w: 30, h: 30 },
    ];
    for (const r of corners) {
      const box = boxOf(placeBubble(r, size, view, keep));
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.left + box.w).toBeLessThanOrEqual(view.w);
      expect(box.top + box.h).toBeLessThanOrEqual(view.h);
    }
  });

  it("좁은 폰 화면에서도 말풍선이 잘리지 않는다", () => {
    const phone = { w: 375, h: 812 };
    const small = { w: 343, h: 210 };
    const icon: CoachRect = { top: 8, left: 320, w: 40, h: 38 };
    const box = boxOf(placeBubble(icon, small, phone, []), small, phone);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.left + box.w).toBeLessThanOrEqual(phone.w);
  });
});
