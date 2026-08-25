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

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { PlayerView } from "@majak/core";
import { DRAWN_TILE, LESSONS, pickLesson, pickUrgent, placeBubble } from "../src/tutorial.js";
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
  // 기본 손패는 **비워 둔다** — 대본 강의(9삭·1삭)는 그 패가 손에 있을 때만 서므로,
  // 기본값을 채워 두면 일반 강의를 검사하는 자리마다 대본이 끼어든다.
  handKinds: new Set<string>(),
  riichiDeclared: false,
  roundOver: false,
  won: false,
  seen: new Set<string>(),
  ...over,
});

/** 지정한 선택자들만 화면에 있는 것으로 친다 */
const onScreen =
  (...selectors: string[]) =>
  (q: string): boolean =>
    selectors.includes(q);

const lesson = (id: string) => LESSONS.find((l) => l.id === id)!;

/** 액티브 증강을 무장한 상태의 표식 (`tutorial.ts`의 ARMED_AUG와 같은 선택자) */
const ARMED = ".own-top-main .aug-btn-armed";

/** 마무리가 요구하는 강의들 (tutorial.ts의 `OUTRO_NEEDS`와 한 쌍 — 이름이 어긋나면 안 끝난다) */
const OUTRO_IDS = ["hand", "dora", "aug-pill", "quick-toggles", "codex", "help", "settings"];

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

  it("화료를 **해 봐야** 마무리가 나온다 — 강의를 본 것으로는 안 된다", () => {
    /*
     * 마무리 조건은 "강의를 몇 개 봤나"가 아니라 **정말 이겼나**다.
     * 한때 `seen.has("ron")`으로 셌더니, 론 강의를 «건너뛰기»로 넘긴 사람에게
     * 곧바로 "화료까지 해 보셨습니다"가 떴다 — 론 버튼이 아직 화면에 있는데도
     * 그랬다(2026-08-18 실측).
     */
    const all = new Set(LESSONS.map((l) => l.id).filter((id) => id !== "outro"));
    expect(pickLesson(ctx({ seen: all, won: false }))?.id).not.toBe("outro");
    expect(pickLesson(ctx({ seen: all, won: true }))?.id).toBe("outro");
  });

  it("지금 판에서 벌어지는 일이 '늘 참인 강의'보다 먼저다", () => {
    // 예전에는 후로·리치·화료가 목록 맨 아래라, 치가 성립해 판이 내 답을 기다리는
    // 동안 코치가 "설정은 여기 있습니다"를 말했다(2026-08-18 실측).
    // `conjured`(보라 생성패)는 화면에 그 패가 있으면 끼어드는 강의라, 여기서는
    // 이미 본 것으로 두고 시작한다 — 이 테스트가 보려는 것은 후로·리치·화료의 자리다.
    const seen = new Set(["welcome", "hand", "discard", "conjured"]);
    const late = ctx({ seen, view: viewWith(13, 4), hit: () => true });
    expect(pickLesson({ ...late, optionTypes: new Set(["chi", "pass"]) })?.id).toBe("call");
    expect(pickLesson({ ...late, optionTypes: new Set(["riichi", "discard"]) })?.id).toBe("riichi");
    // 남의 패로 나는 것은 론, 내가 가져와 나는 것은 쯔모 — 말이 다르므로 강의도 다르다
    expect(pickLesson({ ...late, optionTypes: new Set(["win", "pass"]) })?.id).toBe("ron");
    expect(pickLesson({ ...late, optionTypes: new Set(["win", "discard"]) })?.id).toBe("win");
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

  it("첫 패를 **실제로** 버리고 나서야 다음 묶음이 열린다", () => {
    expect(openAtStart({ view: viewWith(13, 1) })).toContain("river");
    expect(openAtStart()).not.toContain("river");
    // 타패 강의를 «건너뛰기»로 넘긴 것은 버린 것이 아니다 — 본 것과 한 것은 다르다
    // (그렇게 세면 아직 제 차례인 사람에게 바닥 이야기가 시작된다).
    expect(openAtStart({ seen: new Set(["discard-script"]) })).not.toContain("river");
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

  /* (배율 +/− 강의는 2026-08-24에 없앴다 — 손잡이 자체가 사라졌다. 배율은 창
     크기에서 자동으로 나온다: uiScale.ts) */
});

describe("읽던 강의를 밀어내고 끼어든다", () => {
  it("치·리치·화료·새 증강 선택창은 읽던 안내를 밀어낸다", () => {
    // 코치는 붙들고 있는 강의가 끝나야 다음을 집는다 — 그래서 그 사이에 생긴
    // 기회는 목록 순서만으로는 못 잡는다(2026-08-18 실측: 치·패스가 판을 막고
    // 선 채로 "증강 이름에 마우스를 올려 보세요"가 떠 있었다).
    const seen = new Set(["welcome", "hand", "discard"]);
    expect(pickUrgent(ctx({ seen, optionTypes: new Set(["chi", "pass"]) }))?.id).toBe("call");
    expect(pickUrgent(ctx({ seen, optionTypes: new Set(["win", "pass"]) }))?.id).toBe("ron");
    expect(pickUrgent(ctx({ seen, draftOpen: true }))?.id).toBe("draft");
  });

  it("인사말은 증강 선택창에 밀려나지 않는다", () => {
    // 첫 국은 선택창이 뜬 채로 시작한다 — 인사말이 뜨자마자 밀려나면 아무도 못 읽는다.
    expect(pickUrgent(ctx({ seen: new Set(), draftOpen: true }))?.id).toBe("welcome");
  });

  it("아무 일도 안 벌어지면 끼어들지 않는다", () => {
    const seen = new Set(["welcome", "hand", "discard", "conjured"]);
    expect(pickUrgent(ctx({ seen, view: viewWith(13, 4), hit: () => true }))).toBeNull();
  });

  it("이미 본 끼어들기는 다시 끼어들지 않는다", () => {
    const seen = new Set(["welcome", "hand", "discard", "call"]);
    expect(pickUrgent(ctx({ seen, optionTypes: new Set(["chi", "pass"]) }))).toBeNull();
  });
});

// ─────────────────────── 대본 — 지목하고, 잠근다 ───────────────────────

describe("대본 강의 (`SCRIPT_NOTE`)", () => {
  /** 서버가 고정해 둔 첫 순의 손 — 9삭과 1삭이 함께 있다 (`RoomManager.TUTORIAL_HAND`) */
  const scripted = (over: Partial<CoachCtx> = {}): CoachCtx =>
    ctx({
      handKinds: new Set(["man2", "man5", "pin4", "pin7", "sou1", "sou2", "sou9"]),
      ...over,
    });

  it("첫 순에는 '필요 없는 패'가 아니라 9삭을 지목한다", () => {
    const c = scripted({ seen: new Set(["welcome", "hand"]), optionTypes: new Set(["discard"]) });
    const l = pickLesson(c)!;
    expect(l.id).toBe("discard-script");
    expect(l.title).toContain("9삭");
    // 지목만으로는 부족하다 — 그 패 말고는 안 눌리게 잠근다
    expect(l.lock).toEqual({ kind: "sou9", how: "discard" });
  });

  it("9삭이 손에 없으면 일반 강의로 물러선다 — 없는 패를 가리키지 않는다", () => {
    const c = ctx({ seen: new Set(["welcome", "hand"]), optionTypes: new Set(["discard"]) });
    expect(pickLesson(c)?.id).toBe("discard");
  });

  it("한 순이라도 지났으면 대본을 다시 꺼내지 않는다", () => {
    // 대본은 **첫 순의 것**이다. 뒤늦게 9삭을 뽑았다고 "이번에는 9삭입니다"가 다시
    // 뜨면 그건 대본이 아니라 잔소리다.
    const c = scripted({
      seen: new Set(["welcome", "hand"]),
      view: viewWith(13, 2),
      optionTypes: new Set(["discard"]),
    });
    expect(pickLesson(c)?.id).toBe("discard");
  });

  it("버렸으면 저절로 넘어간다", () => {
    const l = lesson("discard-script");
    expect(l.done?.(scripted({ optionTypes: new Set(["discard"]) }))).toBe(false);
    expect(l.done?.(scripted({ optionTypes: new Set() }))).toBe(true);
  });

  it("연금술사는 두 마디다 — 먼저 버튼, 그다음 1삭", () => {
    /*
     * 딤은 한 번에 한 곳만 비춘다. 한 마디로 붙여 놓으면 "손패의 1삭"을 비추면서
     * 정작 먼저 눌러야 할 «✦ 액티브 증강»이 어두운 쪽에 남는다(2026-08-18 사용자
     * 지적: "뭘 눌러야하는지 잘 모르겠어"). 누를 곳이 둘이면 마디도 둘이어야 한다.
     */
    const base = {
      seen: new Set(["welcome", "hand", "discard-script"]),
      view: viewWith(14, 1),
      augmentReady: true,
    };
    // 아직 무장 전 — 버튼(또는 열린 목록)을 가리킨다
    const before = pickUrgent(scripted({ ...base, hit: (q: string) => q !== ARMED }))!;
    expect(before.id).toBe("aug-script");
    expect(before.anchor).toContain("aug-btn");
    expect(before.body).toContain("2삭");
    // 무장한 뒤 — 이제 손패의 그 한 장을 가리키고 잠근다
    const after = pickUrgent(scripted({ ...base, hit: () => true }))!;
    expect(after.id).toBe("aug-script-pick");
    expect(after.lock).toEqual({ kind: "sou1", how: "augment" });
  });

  it("1삭이 바뀌면(또는 없으면) 연금술 대본은 끝난 것으로 본다", () => {
    const l = lesson("aug-script");
    expect(l.done?.(scripted())).toBe(false);
    expect(l.done?.(ctx({ handKinds: new Set(["sou2"]) }))).toBe(true);
  });

  it("리치를 이미 걸었으면 증강 대본을 꺼내지 않는다 — 손이 잠긴 뒤다", () => {
    const c = scripted({ view: viewWith(14, 1), augmentReady: true, riichiDeclared: true });
    expect(lesson("aug-script").when(c)).toBe(false);
  });

  it("리치를 걸면 '이제 기다립니다'가 나온다 — 멈춘 것처럼 보이지 않게", () => {
    const seen = new Set(LESSONS.map((l) => l.id).filter((id) => id !== "riichi-wait"));
    // 화료 강의를 이미 본 판이라도(=outro 조건) 기다림 안내가 먼저다
    seen.delete("outro");
    expect(pickLesson(ctx({ seen, riichiDeclared: true }))?.id).toBe("riichi-wait");
    // 리치 전에는 안 나온다
    expect(lesson("riichi-wait").when(ctx({ riichiDeclared: false }))).toBe(false);
  });

  it("리치 선언이 잡히면 리치 강의는 끝난다", () => {
    const l = lesson("riichi");
    expect(l.done?.(ctx({ optionTypes: new Set(["riichi", "discard"]) }))).toBe(false);
    expect(
      l.done?.(ctx({ optionTypes: new Set(["riichi", "discard"]), riichiDeclared: true })),
    ).toBe(true);
  });

  it("잠근 강의는 잠근 그 패를 가리킨다 — 다른 것을 빛내면 안 된다", () => {
    for (const l of LESSONS.filter((x) => x.lock !== undefined)) {
      if (l.id === "aug-script") {
        // 무장 **전** 마디 — 잠금은 손패에 걸지만(그 패를 못 버리게) 가리키는 것은
        // 먼저 눌러야 할 버튼이다. 어느 패인지는 다음 마디가 비춘다.
        expect(l.anchor, "무장 전에는 버튼을 가리킨다").toContain("aug-btn");
        continue;
      }
      if (l.lock!.kind === DRAWN_TILE) {
        // 종류가 아니라 자리로 잠근 것(리치) — 먼저 눌러야 할 버튼을 가리키고,
        // 어느 패를 버릴지는 «해 보세요»가 말한다.
        expect(l.todo, `${l.id}: 어느 패를 버릴지 말해 줘야 한다`).toContain("가져온 패");
        continue;
      }
      expect(l.anchor, `${l.id}: 잠갔으면 어느 패인지도 가리켜야 한다`).toContain(
        `data-kind="${l.lock!.kind}"`,
      );
    }
  });

  it("리치는 가져온 패로만 걸게 한다 — 옆 패를 버리면 후리텐이다", () => {
    // 텐파이를 유지하는 패는 여럿이지만 그중 내 오름패를 버리면 그 국 내내 론이
    // 안 된다. 그러면 "이제 기다리세요"라고 해 놓고 영영 아무 일도 안 일어난다.
    expect(lesson("riichi").lock).toEqual({ kind: DRAWN_TILE, how: "discard" });
  });
});

describe("좌하단 빠른 토글 강의", () => {
  const c = (discards: number): CoachCtx =>
    ctx({ view: viewWith(13, discards), hit: onScreen(".quick-toggles") });

  it("화면에 그 줄이 있을 때, 손이 빌 때 나온다", () => {
    expect(
      LESSONS.filter((l) => l.when({ ...c(1), riichiDeclared: true })).map((l) => l.id),
    ).toContain("quick-toggles");
    expect(LESSONS.filter((l) => l.when(c(1))).map((l) => l.id)).not.toContain("quick-toggles");
    expect(
      LESSONS.filter((l) => l.when(ctx({ view: viewWith(13, 4) }))).map((l) => l.id),
    ).not.toContain("quick-toggles");
  });

  it("되돌릴 수 없는 자동 진행 둘을 이름으로 말린다", () => {
    // 자동화료·자동버림은 켜는 순간 대신 둔다 — 배우는 자리에서 모르고 켜면
    // 그때부터 판이 혼자 굴러간다.
    const { body } = lesson("quick-toggles");
    expect(body).toContain("자동화료");
    expect(body).toContain("자동버림");
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

  it("마무리가 요구하는 강의는 전부 실재한다 — 그리고 언젠가 반드시 성립한다", () => {
    /*
     * outro의 `when`은 id 문자열로 앞 강의를 참조한다 — 이름을 고치면 조용히
     * "영영 안 끝나는 튜토리얼"이 된다.
     *
     * 실재 여부만으로는 부족하다. 요구 목록에 **기회가 안 올 수도 있는 강의**
     * (후로·용어처럼 판이 안 만들어 주면 안 나오는 것)를 넣으면 그것도 끝나지 않는
     * 튜토리얼이 된다. 그래서 "늘 참인 강의"만 요구하는지까지 본다.
     */
    const ids = new Set(LESSONS.map((l) => l.id));
    for (const id of ["ron", "win"]) expect(ids.has(id), `${id} 강의가 사라졌다`).toBe(true);
    for (const id of OUTRO_IDS) expect(ids.has(id), `${id} 강의가 사라졌다`).toBe(true);

    // 판이 몇 순 돌고 화면 도구가 다 떠 있는 상태 — 여기서 성립하지 않는 강의를
    // 마무리가 요구하고 있으면 그 튜토리얼은 못 끝난다.
    const late = ctx({
      view: viewWith(13, 3),
      hit: () => true,
      augmentReady: true,
      riichiDeclared: true,
      won: true,
    });
    const openLate = new Set(LESSONS.filter((l) => l.when(late)).map((l) => l.id));
    const needed = LESSONS.filter((l) => l.id === "outro")[0]!;
    const all = new Set(LESSONS.map((l) => l.id));
    // 전부 봤다고 하면 마무리가 선다
    expect(needed.when({ ...late, seen: all })).toBe(true);
    // 화료만으로는 안 선다 (화면 도구를 안 짚고 끝나던 것이 이 조건의 이유다)
    expect(needed.when({ ...late, seen: new Set() })).toBe(false);
    // 마무리가 요구하는 것들은 이 국면에서 전부 성립한다 = 언젠가 반드시 볼 수 있다
    for (const id of all) {
      if (id === "outro") continue;
      if (!needed.when({ ...late, seen: new Set([...all].filter((x) => x !== id)) })) {
        expect(openLate.has(id), `${id}: 마무리가 요구하는데 기회가 안 올 수 있다`).toBe(true);
      }
    }
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

  /*
   * «누르라»고 한 과녁은 무슨 일이 있어도 비켜선다 (2026-08-25 QA §9, 375×700 실측).
   *
   * 증강 선택창은 화면을 다 덮으므로 늘 띠로 물러나는데, 아래쪽 띠 [14,400,347,288]이
   * 카드 1·2번의 «자세히 ▾»(y=415·667)를 둘 다 물어 `elementFromPoint`가
   * `.coach-bubble`을 돌려줬다 — 강의가 시킨 조작이 그 자리에서 안 됐다.
   * 과녁(90×20)은 제목 줄보다 훨씬 작아서, 무겁게 치지 않으면 늘 진다.
   */
  it("«누르라»고 한 과녁은 제목 줄을 가리는 한이 있어도 비켜선다", () => {
    const phone = { w: 375, h: 700 };
    const bubble = { w: 347, h: 288 };
    const panel: CoachRect = { top: 230, left: 8, w: 359, h: 470 };
    const draftHead: CoachRect = { top: 120, left: 8, w: 359, h: 110 };
    const more: CoachRect[] = [
      { top: 415, left: 142, w: 90, h: 20 },
      { top: 667, left: 142, w: 90, h: 20 },
    ];
    const box = boxOf(placeBubble(panel, bubble, phone, [draftHead], more), bubble, phone);
    for (const m of more) expect(hits(box, m)).toBe(false);
  });

  it("과녁이 없으면 예전 그대로 — 아래쪽 띠로 비켜선다", () => {
    const panel: CoachRect = { top: 40, left: 60, w: 1160, h: 640 };
    const draftHead: CoachRect = { top: 20, left: 180, w: 920, h: 140 };
    expect(placeBubble(panel, size, view, [draftHead], [])).toEqual(
      placeBubble(panel, size, view, [draftHead]),
    );
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

describe("리치를 건 뒤에는 조용해진다", () => {
  const ctxAfterRiichi = (over: Partial<CoachCtx> = {}): CoachCtx => ({
    view: viewWith(13, 2),
    optionTypes: new Set(["discard"]),
    draftOpen: false,
    augmentReady: false,
    overlay: null,
    hit: () => false,
    handKinds: new Set<string>(),
    riichiDeclared: true,
    roundOver: false,
    won: false,
    seen: new Set<string>(["welcome", "hand", "discard-script"]),
    ...over,
  });

  it("타패 강의를 다시 꺼내지 않는다 — 고를 것이 없는 순이다", () => {
    // 리치 중에도 매 순 버리기는 한다(쯔모기리). 그때 "필요 없는 패를 눌러
    // 버리세요"가 뜨면 손이 잠긴 사람에게 고르라고 하는 셈이다(2026-08-18 실측).
    expect(LESSONS.filter((l) => l.when(ctxAfterRiichi())).map((l) => l.id)).not.toContain(
      "discard",
    );
    // 리치 전에는 그대로 나온다
    expect(
      LESSONS.filter((l) => l.when(ctxAfterRiichi({ riichiDeclared: false }))).map((l) => l.id),
    ).toContain("discard");
  });
});

describe("대본의 순서를 운이 앞지르지 않는다", () => {
  /** 운 좋게 텐파이가 서서 리치와 연금술이 **동시에** 열린 순 */
  const both = (over: Partial<CoachCtx> = {}): CoachCtx =>
    ctx({
      view: viewWith(14, 1),
      optionTypes: new Set(["discard", "riichi", "alchemy"]),
      augmentReady: true,
      handKinds: new Set(["sou1", "sou2", "pin7"]),
      seen: new Set(["welcome", "hand", "discard-script"]),
      ...over,
    });

  it("연금술을 아직 안 가르쳤으면 리치보다 먼저다", () => {
    /*
     * 2삭을 뽑으면 연금술 없이도 텐파이가 선다(실측). 그때 리치를 먼저 집으면
     * 연금술 마디는 **영영 안 나온다** — 리치 뒤에는 손이 잠겨 대상을 못 고른다.
     */
    expect(pickUrgent(both())?.id).toBe("aug-script");
    expect(lesson("riichi").when(both())).toBe(false);
  });

  it("연금술을 가르친 뒤에는 리치가 열린다", () => {
    const after = both({ seen: new Set(["welcome", "hand", "discard-script", "aug-script"]) });
    expect(lesson("riichi").when(after)).toBe(true);
  });

  it("대본과 무관한 판(1삭이 없다)에서는 그냥 리치가 열린다", () => {
    expect(lesson("riichi").when(both({ handKinds: new Set(["pin7"]) }))).toBe(true);
  });
});

// ─────────────── 잠금은 **버리는 길을 전부** 막는가 (소스 스캔) ───────────────

/*
 * 튜토리얼이 "이 패를 버리세요"라고 잠근 동안, 그 잠금을 우회해 패가 나가는 길이
 * 있으면 안 된다. 이 판에서 패가 나가는 길은 셋이다 — 클릭 · 드래그 · 오른쪽 버튼.
 * 오른쪽 버튼(쯔모기리)이 실제로 뚫려 있었다(2026-08-18 실측): 코치가 9삭을 지목한
 * 순에 오른쪽 버튼 한 번이면 다음 마디에서 쓸 1삭이 그대로 나갔다.
 *
 * jsdom이 없는 패키지라 다른 가드들과 같은 방식으로 **소스를 읽어** 못을 박는다
 * (onboardingAndLiveness.test.ts와 같은 결).
 */
describe("잠금이 막는 길 (App.tsx 소스 가드)", () => {
  const APP = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../src/App.tsx"), "utf8");

  it("오른쪽 버튼 쯔모기리도 잠금을 본다", () => {
    const fn = APP.slice(
      APP.indexOf("function rightClickTsumogiri"),
      APP.indexOf("function rightClickTsumogiri") + 1800,
    );
    expect(fn, "rightClickTsumogiri가 코치 잠금을 확인하지 않는다").toContain(
      "coachBlocksDiscard",
    );
  });

  it("드래그로 버리는 길도 잠금을 본다", () => {
    const fn = APP.slice(
      APP.indexOf("function discardOptionFor"),
      APP.indexOf("function discardOptionFor") + 1200,
    );
    expect(fn, "discardOptionFor가 코치 잠금을 확인하지 않는다").toContain("coachBlocksDiscard");
  });
});

describe("정산 화면 위에서는 마무리 말고 아무 말도 하지 않는다", () => {
  /*
   * 론을 눌러 8700점을 받은 정산 화면 위에 "리치 성공 — 이제 기다립니다. 누군가
   * 오름패를 버리면 «론» 버튼이 뜹니다"가 떴다(2026-08-19 실측). 판의 사실만 보는
   * 강의는 국이 끝난 뒤에도 그대로 성립하기 때문이다 — 이미 눌러서 끝난 판인데.
   */
  const over = (o: Partial<CoachCtx> = {}): CoachCtx =>
    ctx({ riichiDeclared: true, roundOver: true, ...o });

  it("국이 끝나면 어떤 강의도 새로 꺼내지 않는다", () => {
    expect(pickLesson(over())).toBeNull();
    expect(pickUrgent(over())).toBeNull();
    // 같은 화면인데 국이 안 끝났으면 평소대로 꺼낸다 (조건 자체는 살아 있다)
    expect(pickLesson(over({ roundOver: false }))?.id).toBe("welcome");
  });

  it("마무리만은 예외다 — 그 자리가 정산 화면이다", () => {
    const seen = new Set(LESSONS.map((l) => l.id).filter((id) => id !== "outro"));
    expect(pickLesson(over({ seen, won: true }))?.id).toBe("outro");
  });
});

describe("마무리는 **이 판에서** 이겨야 뜬다", () => {
  /*
   * `won`은 App.tsx의 ref다 — 판이 아니라 **탭**의 수명을 산다. 한 번 이기고 마친
   * 사람이 «🎓 튜토리얼»을 다시 누르면 그 값이 참인 채로 새 판이 시작해, 화료를 한
   * 번도 안 했는데 화면 도구 강의를 다 보는 순간 "화료 성공"이 뜨고 판에서 쫓겨났다
   * (2026-08-19 사용자 보고). 여기 코치 쪽 계약은 "won이 거짓이면 안 뜬다"이고,
   * 그 값을 새 튜토리얼마다 되돌리는 것은 App.tsx의 `startCoach`가 맡는다.
   */
  it("화면 도구를 다 봤어도 화료 전에는 안 뜬다", () => {
    const seen = new Set(LESSONS.map((l) => l.id).filter((id) => id !== "outro"));
    expect(pickLesson(ctx({ seen, won: false }))?.id).not.toBe("outro");
  });

  it("코치를 켤 때 `won`을 되돌린다 (App.tsx 소스 가드)", () => {
    // 켜는 자리가 넷이라(랜딩·홈·게스트 마무리·가입 직후) 하나만 빠져도 되살아난다.
    const src = readFileSync(
      new URL("../src/App.tsx", import.meta.url),
      "utf8",
    );
    expect(src).toMatch(/const startCoach = \(on: boolean\): void => \{\s*if \(on\) iWonRef\.current = false;/);
    expect(src.includes("setCoachOn(true)")).toBe(false);
  });
});
