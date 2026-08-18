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

  it("화료를 해 봐야 마무리가 나온다", () => {
    // 마무리 조건은 "강의를 몇 개 봤나"가 아니라 **판을 끝냈나**다 — 리치도 론도
    // 안 해 본 사람에게 "여기까지가 기본입니다"가 뜨면 정작 점수가 오가는 순간을
    // 한 번도 안 보여 준 채 끝난다(2026-08-18 사용자 지시).
    const others = LESSONS.map((l) => l.id).filter((id) => id !== "outro");
    // 화료를 안 해 봤으면 다른 걸 전부 봤어도 마무리가 아니다
    const noWin = new Set(others.filter((id) => id !== "ron" && id !== "win"));
    expect(pickLesson(ctx({ seen: noWin }))?.id).not.toBe("outro");
    // 론 하나면 선다 (쯔모로 끝냈어도 마찬가지)
    expect(pickLesson(ctx({ seen: new Set([...noWin, "ron"]) }))?.id).toBe("outro");
    expect(pickLesson(ctx({ seen: new Set([...noWin, "win"]) }))?.id).toBe("outro");
  });

  it("지금 판에서 벌어지는 일이 '늘 참인 강의'보다 먼저다", () => {
    // 예전에는 후로·리치·화료가 목록 맨 아래라, 치가 성립해 판이 내 답을 기다리는
    // 동안 코치가 "설정은 여기 있습니다"를 말했다(2026-08-18 실측).
    const seen = new Set(["welcome", "hand", "discard"]);
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

  it("배율 — 가운데 % 버튼이 눌리게 되면(=100%가 아니면) 끝", () => {
    // 새 표식을 붙이지 않고 이미 화면에 있는 진실을 읽는다: 그 버튼은 100%일 때만
    // disabled다(App.tsx `ScaleControl`).
    const d = lesson("zoom");
    expect(d.done?.(ctx())).toBe(false);
    expect(d.done?.(ctx({ hit: onScreen(".ui-zoom-now:not(:disabled)") }))).toBe(true);
  });
});

describe("배율 손잡이 강의", () => {
  const seeing = (discards: number): CoachCtx =>
    ctx({ view: viewWith(13, discards), hit: onScreen(".ui-zoom") });

  it("화면 도구 중에서 가장 먼저다 — 판이 잘려 보이면 나머지 안내가 다 헛돈다", () => {
    const tools = LESSONS.filter((l) => l.chapter === "화면 도구").map((l) => l.id);
    expect(tools[0]).toBe("zoom");
  });

  it("손잡이가 화면에 있을 때만, 그리고 손이 빌 때 나온다", () => {
    // 화면 도구는 **할 일이 없을 때**의 이야기다(`handsFree`) — 리치를 걸었거나
    // 몇 순 지난 뒤. 첫 타패 직후에 열면 말풍선 열 개가 한 줄로 붙는다.
    const riichi = { ...seeing(1), riichiDeclared: true };
    expect(LESSONS.filter((l) => l.when(riichi)).map((l) => l.id)).toContain("zoom");
    expect(LESSONS.filter((l) => l.when(seeing(1))).map((l) => l.id)).not.toContain("zoom");
    // 손잡이가 없는 화면에서는 없는 버튼을 가리키지 않는다
    expect(LESSONS.filter((l) => l.when(ctx({ view: viewWith(13, 4) }))).map((l) => l.id)).not.toContain("zoom");
  });

  it("자리가 화면마다 다르므로 위·아래 둘 다 알려 준다", () => {
    // styles.css `.ui-zoom`: 대국+넓은 판이면 우상단 아이콘 줄 아래, 좁으면 오른쪽 아래 구석.
    const { body } = lesson("zoom");
    expect(body).toContain("오른쪽 위");
    expect(body).toContain("오른쪽 아래");
  });

  it("버튼이 안 되는 자리를 대비해 키보드 두 벌을 함께 준다", () => {
    // ⌥/Alt 는 이 게임의 배율, Ctrl(⌘) 은 브라우저 확대 — uiScale.ts 는 ctrl·meta 가
    // 눌려 있으면 손을 떼므로 둘은 서로 먹히지 않고 각자 듣는다.
    const todo = lesson("zoom").todo ?? "";
    expect(todo).toContain("Alt");
    expect(todo).toContain("Ctrl");
  });
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
    const seen = new Set(["welcome", "hand", "discard"]);
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

  it("연금술사는 '바꿀 패를 클릭'이 아니라 1삭을 지목한다", () => {
    const c = scripted({
      seen: new Set(["welcome", "hand", "discard-script"]),
      view: viewWith(14, 1),
      augmentReady: true,
      hit: () => true,
    });
    const l = pickUrgent(c)!;
    expect(l.id).toBe("aug-script");
    expect(l.lock).toEqual({ kind: "sou1", how: "augment" });
    // 후보가 하나뿐인 패라 되묻는 창 없이 그대로 발동한다 — 그 사실이 문구에 있다
    expect(l.body).toContain("2삭");
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

    // 판이 몇 순 돌고 화면 도구가 다 떠 있는 상태 — 여기서 성립하지 않는 강의를
    // 마무리가 요구하고 있으면 그 튜토리얼은 못 끝난다.
    const late = ctx({
      view: viewWith(13, 3),
      hit: () => true,
      augmentReady: true,
      riichiDeclared: true,
    });
    const openLate = new Set(LESSONS.filter((l) => l.when(late)).map((l) => l.id));
    const needed = LESSONS.filter((l) => l.id === "outro")[0]!;
    const all = new Set(LESSONS.map((l) => l.id));
    // 전부 봤다고 하면 마무리가 선다
    expect(needed.when({ ...late, seen: all })).toBe(true);
    // 화료만으로는 안 선다 (화면 도구를 안 짚고 끝나던 것이 이 조건의 이유다)
    expect(needed.when({ ...late, seen: new Set(["ron"]) })).toBe(false);
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
