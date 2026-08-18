/**
 * tutorial — **실제 판 안에서** 조작을 순서대로 짚어 주는 코치.
 *
 * ## 왜 읽는 설명이 아니라 코치인가
 *
 * 이 게임에는 이미 잘 쓰인 규칙 화면(📘)이 있다. 그런데 처음 온 사람이 겪는 문제는
 * "규칙을 모른다"가 아니라 **"화면에서 무엇을 눌러야 하는지 모른다"** 다 — 손패가
 * 어디고, 왜 지금 내 차례고, 저 빨간 버튼은 눌러도 되는 것인지. 그건 글로 읽어서
 * 넘어가지 않는다. 그래서 안내를 게임 밖으로 빼지 않고 **진짜 판 위에** 얹는다
 * (2026-08-18 사용자 지시: "실제 게스트용 게임 같은 곳에 넣고 실시간으로 가이드").
 *
 * ## 순서를 어떻게 정하는가 — 대본이 아니라 기회다
 *
 * 처음에는 1→2→3 대본으로 짰는데 곧 막힌다. "리치를 설명한다"는 단계는 **텐파이가
 * 될 때까지** 오지 않고, 그동안 뒤 단계가 전부 멎는다. 반대로 억지로 건너뛰면
 * 정작 리치 버튼이 떴을 때 아무 설명이 없다.
 *
 * 그래서 강의는 대본이 아니라 **기회 목록**이다. 매 프레임 "지금 성립하는 것 중
 * 아직 안 본 것"을 위에서부터 하나 고른다. 목록의 순서는 곧 우선순위라 여러 개가
 * 동시에 성립하면 기본적인 것이 먼저 나오고, 끝내 안 오는 기회(예: 깡)는 그냥
 * 안 나올 뿐 아무것도 막지 않는다.
 *
 * ## 판정은 전부 화면에서 온다
 *
 * "버렸는가"를 클릭 이벤트로 알지 않는다 — 드래그로도, 단축키로도, 오른쪽 버튼으로도
 * 버릴 수 있어서 이벤트를 세면 셋 중 둘을 놓친다. 선택지(`prompt.options`)가
 * 사라졌는지를 본다. 화면이 실제로 어떤 상태인지가 유일한 진실이다.
 *
 * 같은 이유로 "설명을 고정했는가" · "액티브 버튼에 손을 올렸는가" 같은 조작도
 * **DOM에 그 표시가 떴는지**(`hit`)로 판정한다. 그 상태는 이미 클래스 하나로
 * 화면에 나와 있다(`.aug-pill-pinned` · `.aug-pill-usable` · `.tile-conjured`…).
 * 콜백을 열두 군데 새로 뚫는 대신 이미 있는 진실을 읽는다.
 *
 * ## 속도 조절 — 한 순에 두세 마디
 *
 * 강의를 스무 개 넘게 얹고 나니 새 문제가 생겼다: 조건이 늘 참인 강의들("손패는
 * 여기입니다", "설정은 여기입니다")이 첫 순에 한꺼번에 쏟아졌다. 배우는 사람은
 * 열다섯 개의 말풍선을 연달아 닫은 뒤에야 첫 패를 버리게 된다 — 그건 읽는 설명이지
 * 코치가 아니다.
 *
 * 그래서 **내가 버린 패의 수**(`turns`)를 속도계로 쓴다. 한 순 지날 때마다 다음
 * 묶음이 열린다. 판이 실제로 움직여야 다음 이야기가 나오므로 "해 보고 → 배우고"의
 * 리듬이 생기고, 판이 빨리 끝나도 남은 강의가 뒤를 막지 않는다(안 나올 뿐이다).
 *
 * ## 기회 목록 안의 **대본** — 지목하고, 잠근다
 *
 * 기회 목록이라고 해서 문장까지 두루뭉술할 이유는 없다. "필요 없는 패를 버리세요"는
 * 마작을 아는 사람에게만 안내다 — 무엇이 필요 없는 패인지가 바로 지금 배워야 할
 * 것이기 때문이다. 그래서 판이 고정된 덕을 여기서 쓴다: **"이번에는 9삭입니다"**
 * 라고 패를 지목하고, 왜 그 패인지까지 한 줄로 붙인다. 연금술사도 마찬가지로
 * "바꿀 손패를 클릭"이 아니라 "1삭을 2삭으로"다 (2026-08-18 사용자 지시).
 *
 * 지목만으로는 부족해서 **잠근다**(`LessonLock`). 처음 온 사람은 어느 것이 9삭인지
 * 모르고, 한 번 잘못 누르면 되돌릴 수 없다. 그 강의가 떠 있는 동안에는 지목한 패
 * 하나만 눌린다 — 그리고 «건너뛰기»를 누르면 강의와 함께 잠금도 풀린다.
 *
 * 대본이 서는 것은 서버가 배패를 고정해 주기 때문이다(`RoomManager.TUTORIAL_HAND`).
 * 그 패가 손에 없으면 대본 강의는 아예 서지 않고 일반 강의가 대신 나온다 —
 * 두 파일이 어긋나도 안내가 깨지지 않고 두루뭉술해질 뿐이다.
 *
 * ## 어디까지 데려가는가 — 리치, 그리고 론
 *
 * 마무리(`outro`)는 강의를 몇 개 봤는지가 아니라 **판을 끝냈는지**로 정한다.
 * 리치도 론도 안 해 본 사람에게 "여기까지가 기본입니다"가 뜨면, 점수가 오가는
 * 유일한 순간을 한 번도 안 보여 준 채 끝나는 셈이다. 서버는 그 끝이 실제로 오도록
 * 리치 뒤에 대기패를 쏴 준다(`RoomManager.TUTORIAL_FEED_NOTE`).
 *
 * ## 판은 튜토리얼용으로 고정돼 있다
 *
 * 서버가 튜토리얼 방을 배우기 좋게 고정한다 — 시작 증강은 **연금술사**(액티브 +
 * 생성패), 손패는 1샹텐 고정, 봇은 리치·화료를 하지 않고, 결정에 시간 제한이
 * 사실상 없다. 그래서 여기 강의는 "액티브 증강이 있다면"을 가정해도 된다.
 * 근거와 이유는 서버의 `TUTORIAL_ROOM_NOTE`에 한자리에 적혀 있다.
 */

import { discardsZone, handZone } from "@majak/core";
import type { PlayerView } from "@majak/core";

/** 코치가 매 프레임 보는 것 — 전부 이미 화면에 있는 값이다 */
export interface CoachCtx {
  /** 지금 뷰 (게임 밖이면 null) */
  view: PlayerView | null;
  /** 지금 내가 고를 수 있는 선택지 종류 (`prompt.options`의 type들) */
  optionTypes: ReadonlySet<string>;
  /** 증강 선택창이 떠 있는가 */
  draftOpen: boolean;
  /**
   * 지금 고를 수 있는 것 중에 **액티브 증강 발동**이 있는가.
   *
   * 증강 액션 타입은 100종이 넘고 계속 는다 — 여기서 목록을 다시 적으면 곧 낡는다.
   * 버튼 색(`act-aug`)을 정하는 App.tsx의 판정을 그대로 받아 쓴다.
   */
  augmentReady: boolean;
  /** 판 위에 전체 화면(도감·규칙)이 떠 있는가 — 그 자체가 강의의 완료 신호다 */
  overlay: "codex" | "help" | null;
  /**
   * 지금 화면에 이 선택자에 해당하는 요소가 **떠 있는가**.
   *
   * 코치가 매 틱 `document.querySelector`로 잰다(§판정은 전부 화면에서 온다).
   * 테스트에서는 원하는 대로 갈아 끼운다.
   */
  hit: (selector: string) => boolean;
  /**
   * 지금 내 손에 있는 패 **종류**(kindKey — `"sou9"`·`"man1"`).
   *
   * 대본 강의(§대본)가 "이번에는 9삭입니다"라고 말해도 되는지를 여기서 확인한다 —
   * 그 패가 손에 없으면 없는 것을 가리키게 되므로, 그때는 일반 강의로 물러선다.
   */
  handKinds: ReadonlySet<string>;
  /** 내가 리치를 선언한 상태인가 */
  riichiDeclared: boolean;
  /** 이미 본 강의 id */
  seen: ReadonlySet<string>;
}

/**
 * **지금은 이 패만 누를 수 있다** — 대본 강의가 화면에 거는 잠금.
 *
 * 왜 안내만으로는 부족한가: "9삭을 버리세요"라고 적어 두어도 처음 온 사람은
 * 어느 것이 9삭인지 모른다. 열네 장이 전부 눌리는 상태에서 이름만 말해 주는 것은
 * 사실상 찍으라는 말이고, 한 번 잘못 누르면 되돌릴 수 없다
 * (2026-08-18 사용자 지시: "이번에는 9삭이라고 알려줘. 다른거 못버리게").
 *
 * 잠금은 **그 강의가 떠 있는 동안만** 산다. 말풍선의 «건너뛰기»를 누르면 강의가
 * 물러나면서 함께 풀리므로, 안내가 감옥이 되는 일은 없다.
 */
export interface LessonLock {
  /** 누를 수 있는 유일한 패 종류 (kindKey) */
  kind: string;
  /**
   * 무엇을 하라고 잠근 것인가.
   * - `discard`: 그 패를 **버린다**. 다른 패는 버릴 수 없다.
   * - `augment`: 그 패를 **증강 대상으로 고른다**. 이 동안에는 버리기 자체가 잠긴다 —
   *   증강을 쓰기 전에 버려 버리면 그 순이 그냥 지나가기 때문이다.
   */
  how: "discard" | "augment";
}

/** 강의를 묶는 장(章) — 말풍선 머리에 작게 붙어 "지금 무슨 이야기 중인지"를 준다 */
export type LessonChapter = "시작" | "증강 고르기" | "기본 조작" | "증강 읽기" | "화면 도구" | "한 판 끝내기";

/**
 * ## 대본 (SCRIPT_NOTE, 2026-08-18)
 *
 * 여기 적힌 패 종류는 **서버가 고정해 둔 튜토리얼 배패**와 한 쌍이다
 * (`RoomManager.TUTORIAL_HAND`). 한쪽만 고치면 코치가 없는 패를 가리킨다 —
 * 그래도 안내가 깨지지는 않는다(손에 없으면 대본 강의가 서지 않고 일반 강의로
 * 물러선다). 그래서 두 파일이 서로를 이름으로 가리키게 두었다.
 *
 * 왜 "필요 없는 패를 버리세요"가 아니라 "9삭을 버리세요"인가: 마작을 처음 하는
 * 사람에게 **무엇이 필요 없는 패인지가 곧 배워야 할 것**이다. 그걸 아는 사람만
 * 따라올 수 있는 안내는 안내가 아니다(2026-08-18 사용자 지시).
 */
/** 첫 순에 버릴 패 — 9삭. 1삭은 2삭 두 장에 붙지만 이 패는 아무 데도 안 붙는다. */
const SCRIPT_DISCARD = "sou9";
/** 연금술사로 바꿀 패 — 1삭. 방향이 +1 하나뿐이라 되묻는 창 없이 2삭이 된다. */
const SCRIPT_ALCHEMY = "sou1";
/** 그 패가 바뀐 결과 — 2삭 (222s가 서면서 7통 단기 텐파이). */
const SCRIPT_ALCHEMY_TO = "2삭";

/** 손패에서 그 종류의 패를 가리키는 선택자 (`data-kind`는 App.tsx가 붙인다) */
const handTile = (kind: string): string => `.own-hand .hand-tile[data-kind="${kind}"]`;

export interface Lesson {
  id: string;
  chapter: LessonChapter;
  title: string;
  body: string;
  /**
   * **직접 해 보라**는 한 줄. 있으면 말풍선에 별도 줄로 서고, 넘기는 버튼이
   * "알겠어요" 대신 "건너뛰기"가 된다 — 읽고 넘기는 것과 해 보고 넘어가는 것을
   * 버튼 글자만으로도 구분한다.
   */
  todo?: string;
  /**
   * 강조할 요소의 CSS 선택자. 없으면 말풍선만 뜬다.
   * 화면에 없으면 강조 없이 말풍선만 — **강의가 사라지지는 않는다**.
   */
  anchor?: string;
  /**
   * 이 강의가 떠 있는 동안 **다른 패를 못 누르게** 한다 (`LessonLock`).
   * 대본 강의에만 붙는다 — 잠글 패가 손에 있는지는 `when`이 이미 확인한다.
   */
  lock?: LessonLock;
  /** 지금 이 강의를 꺼낼 기회인가 */
  when: (c: CoachCtx) => boolean;
  /**
   * 사용자가 그 조작을 **실제로 마쳤는가**. true가 되면 저절로 다음으로 넘어간다.
   * 없으면 "알겠어요" 버튼으로만 넘어간다.
   */
  done?: (c: CoachCtx) => boolean;
  /**
   * **지금 화면에서 벌어지는 일**이라 읽던 강의를 밀어내고 끼어드는가.
   *
   * 목록 순서만으로는 부족했다. 코치는 붙들고 있는 강의가 끝나야 다음을 집으므로,
   * "증강 이름에 마우스를 올려 보세요"를 읽는 중에 치가 성립하면 치·패스 버튼이
   * 판을 막고 선 채로 그 안내가 그대로 서 있었다(2026-08-18 실측). 튜토리얼에는
   * 시간 제한이 없어 판이 얌전히 기다려 주기 때문에 더 어색하다.
   *
   * 끼어들 때 밀려난 강의는 **본 것으로 치지 않는다** — 기회가 지나가면 제자리로
   * 돌아온다. 그래서 끼어들기로 잃는 내용이 없다.
   */
  urgent?: boolean;
}

/** 내 손패 장수 (관전·배패 전에는 0) */
function handSize(view: PlayerView | null): number {
  if (view === null) return 0;
  const zone = view.zones[handZone(view.playerId)];
  return (zone?.tileIds.length ?? 0) + (zone?.hiddenCount ?? 0);
}

/**
 * 내가 지금까지 버린 패의 수 = **지난 순의 수**. 강의 속도계다(§속도 조절).
 *
 * 국이 바뀌면 0으로 돌아가지만 `seen`은 남으므로, 이미 본 강의가 다시 나오지는
 * 않는다 — 못 본 채로 국이 끝났으면 다음 국에서 같은 자리에 다시 나온다.
 */
function turns(view: PlayerView | null): number {
  if (view === null) return 0;
  return view.zones[discardsZone(view.playerId)]?.tileIds.length ?? 0;
}

/** 지금 무언가를 답해야 하는가 */
const prompting = (c: CoachCtx): boolean => c.optionTypes.size > 0;

/** 내 차례 = 버릴 수 있다 */
const myTurn = (c: CoachCtx): boolean =>
  c.optionTypes.has("discard") || c.optionTypes.has("free_discard");

/** 남의 버림패에 반응하는 자리 (치·퐁·깡) */
const CALL_TYPES = ["chi", "pon", "minkan", "kokushi_pon", "bluff_pon", "silent_pon"];

/** 내 이름표(화면 아래 가운데)의 증강 알약 — 상대 이름표의 것과 갈라야 한다 */
const MY_PILLS = ".own-top-main .aug-pill";
/** 내 이름표에서 지금 펼쳐진 증강 툴팁 */
const MY_TIP = ".own-top-main .aug-tip";

/**
 * 강의 목록 — **위에 있을수록 먼저**.
 *
 * 문장은 짧게 둔다. 판이 돌아가는 중에 읽는 글이라, 세 줄을 넘으면 읽지 않고 닫는다.
 * `todo`가 있는 것은 두 줄까지만 — 그 아래 "해 보세요" 줄이 한 줄 더 붙는다.
 */
export const LESSONS: readonly Lesson[] = [
  {
    id: "welcome",
    // 끼어드는 강의가 아니라 **밀려나지 않기 위한** 표식이다. 첫 국은 증강 선택창이
    // 뜬 채로 시작하므로, 이게 없으면 인사말이 뜨자마자 `draft`에 밀려난다.
    urgent: true,
    chapter: "시작",
    title: "봇 3명과 한 판 — 같이 해 봐요",
    body: "화면에서 무엇을 눌러야 하는지 순서대로 알려 드립니다. 규칙을 다 몰라도 됩니다. 이 판은 튜토리얼용이라 시간 제한이 없으니 천천히 보세요.",
    when: (c) => c.view !== null,
  },

  // ─────────── 증강 고르기 — 창이 떠 있는 동안에만 할 수 있는 이야기 ───────────
  {
    id: "draft",
    urgent: true,
    chapter: "증강 고르기",
    title: "먼저 증강을 하나 고릅니다",
    body: "국이 시작될 때마다 세 장 중 하나를 고릅니다. 증강은 이 게임의 규칙 자체를 바꾸는 능력입니다 — 무엇을 골라도 됩니다.",
    anchor: ".draft-panel",
    when: (c) => c.draftOpen,
  },
  {
    id: "draft-detail",
    urgent: true,
    chapter: "증강 고르기",
    title: "카드 설명을 더 펼쳐 볼 수 있어요",
    body: "카드에 보이는 건 한 줄 요약입니다. 조건과 예외까지 담긴 원문은 따로 있습니다.",
    todo: "카드 아래 «자세히 ▾»를 누르거나, Shift를 누른 채로 보세요.",
    anchor: ".draft-cards",
    when: (c) => c.draftOpen,
    done: (c) => !c.draftOpen || c.hit(".draft-card .augdesc-body-full"),
  },
  {
    id: "draft-reroll",
    urgent: true,
    chapter: "증강 고르기",
    title: "마음에 안 들면 한 번 갈아 낄 수 있습니다",
    body: "카드 아래 ↻ 버튼이 새로고침입니다. 자리마다 한 번씩만 되고, 되돌릴 수 없습니다.",
    anchor: ".draft-cards",
    when: (c) => c.draftOpen && c.hit(".draft-reroll:not(.draft-reroll-spent)"),
  },
  {
    id: "draft-pick",
    urgent: true,
    chapter: "증강 고르기",
    title: "이제 하나를 고르세요",
    body: "튜토리얼에서는 제한 시간이 없습니다 — 시간이 지나 저절로 뽑히는 일은 없으니 마음 놓고 읽어 보세요.",
    todo: "카드 한 장을 눌러 고릅니다.",
    anchor: ".draft-cards",
    when: (c) => c.draftOpen,
    done: (c) => !c.draftOpen,
  },

  // ─────────── 기본 조작 ───────────
  {
    id: "hand",
    chapter: "기본 조작",
    title: "아래 줄이 내 손패입니다",
    body: "13장을 쥐고 시작합니다. 만·통·삭·자패 순으로 정렬되어 있고, 끌어서 순서를 바꿀 수도 있습니다.",
    anchor: ".own-hand",
    when: (c) => !c.draftOpen && handSize(c.view) >= 13,
  },
  {
    /*
     * **대본 1 — 9삭을 버린다** (§대본).
     *
     * 일반 강의("필요 없는 패를 버리세요")보다 위에 둔다. 처음 온 사람에게는
     * *무엇이 필요 없는 패인지*가 바로 배워야 할 것이라, 그걸 아는 사람만 따라올
     * 수 있는 안내는 안내가 아니다. 그래서 패를 지목하고, 이유까지 한 줄로 준다.
     * 잠금(`lock`)이 붙어 이 강의가 떠 있는 동안에는 9삭 말고는 나가지 않는다.
     */
    id: "discard-script",
    chapter: "기본 조작",
    title: "내 차례 — 이번에는 9삭을 버립니다",
    body: "손에 안 쓰는 패가 둘 있습니다: 1삭과 9삭. 1삭은 2삭 두 장에 붙어 쓸모가 남지만, 9삭은 아무 데도 안 붙습니다. 그래서 9삭입니다.",
    todo: "빛나는 9삭(🀙 아홉 개짜리 대나무)을 눌러 버리세요. 지금은 다른 패가 눌리지 않습니다.",
    anchor: handTile(SCRIPT_DISCARD),
    lock: { kind: SCRIPT_DISCARD, how: "discard" },
    when: (c) => myTurn(c) && c.handKinds.has(SCRIPT_DISCARD) && turns(c.view) === 0,
    done: (c) => !myTurn(c) || !c.handKinds.has(SCRIPT_DISCARD),
  },
  {
    /**
     * 대본을 벗어났을 때의 일반 강의 — 9삭이 손에 없거나 이미 대본을 지난 뒤.
     * (대본 강의를 «건너뛰기»로 넘긴 사람도 여기로 온다.)
     */
    id: "discard",
    chapter: "기본 조작",
    title: "내 차례 — 한 장을 버립니다",
    body: "오른쪽 끝에 방금 가져온 패가 떨어져 붙어 있습니다. 이걸 반복하며 손을 완성해 갑니다.",
    todo: "필요 없는 패를 눌러 버리세요.",
    anchor: ".own-hand",
    when: (c) => myTurn(c) && !(c.handKinds.has(SCRIPT_DISCARD) && turns(c.view) === 0),
    done: (c) => !myTurn(c),
  },

  /*
   * ─────────── 한 판 끝내기 — **기회가 왔을 때만, 그러나 먼저** ───────────
   *
   * 조건이 늘 참인 강의(도라·바닥·설정…)보다 **위**에 둔다. 아래에 두면 이런
   * 일이 생긴다: 상대가 버린 패로 치가 성립해 판이 내 답을 기다리는데, 코치는
   * 태연히 "설정은 여기 있습니다"를 말한다(2026-08-18 실측). 튜토리얼에는 시간
   * 제한이 없어 판이 멈춰 기다려 주기 때문에 더더욱 어색하다 — 지금 화면에서
   * 벌어지는 일을 먼저 설명해야 한다.
   *
   * 그렇다고 맨 위로 올리지는 않는다. 손패가 무엇인지도 모르는 사람에게 "치를
   * 할 수 있습니다"가 첫 마디가 되면 안 된다 — `hand`·`discard` 바로 아래다.
   */
  {
    /**
     * **론** — 남이 버린 패로 끝낸다. 튜토리얼이 데려가려는 결승선이다
     * (2026-08-18 사용자 지시: "플레이어가 리치 이후 론을 할 때까지 진행해").
     * 이 자리가 오도록 서버가 리치 뒤에 대기패를 쏴 준다(`TUTORIAL_FEED_NOTE`).
     */
    id: "ron",
    urgent: true,
    chapter: "한 판 끝내기",
    title: "론! 상대가 내 오름패를 버렸습니다",
    body: "기다리던 패가 남의 손에서 나왔습니다. «론»을 누르면 그 사람에게서 점수를 받고 국이 끝납니다. 누르지 않고 넘기면 이 국에는 다시 못 먹습니다(후리텐).",
    todo: "빨간 «론» 버튼을 누르세요.",
    anchor: ".act-win",
    when: (c) => c.optionTypes.has("win") && !myTurn(c),
    done: (c) => !c.optionTypes.has("win"),
  },
  {
    /** 쯔모 — 내가 가져온 패로 끝난 경우. 대본은 론으로 가지만 이쪽도 열어 둔다. */
    id: "win",
    urgent: true,
    chapter: "한 판 끝내기",
    title: "쯔모! 직접 가져와 완성했습니다",
    body: "손이 완성됐습니다. 빨간 버튼을 누르면 이 국이 끝나고 세 사람 모두에게서 점수를 받습니다.",
    todo: "«쯔모» 버튼을 누르세요.",
    anchor: ".act-win",
    when: (c) => c.optionTypes.has("win"),
    done: (c) => !c.optionTypes.has("win"),
  },
  {
    /*
     * **대본 2 — 연금술사로 1삭을 2삭으로** (§대본).
     *
     * 증강을 "설명"하는 강의(`aug-pill`·`aug-btn`)보다 **위**에 둔다. 이유는 순서가
     * 아니라 자원이다: 1삭은 누가 봐도 버릴 패라, 읽는 강의 몇 개를 먼저 흘려보내는
     * 사이에 배우는 사람이 그 패를 버려 버린다. 그러면 정작 "직접 써 보기"가 성립할
     * 자리가 사라진다. 그래서 둘째 순에 곧바로, 잠금과 함께 꺼낸다.
     *
     * 후보가 하나뿐인 패(1삭 → +1 방향만 가능)를 고른 것도 같은 이유다 — 되묻는
     * 창이 뜨면 "무엇을 눌러야 하는가"가 다시 흐려진다.
     */
    id: "aug-script",
    urgent: true,
    chapter: "증강 읽기",
    title: "⚡ 증강을 직접 써 봅시다 — 1삭을 2삭으로",
    body: `내 증강 «연금술사»는 손패 한 장의 숫자를 ±1 옮깁니다. 1삭을 ${SCRIPT_ALCHEMY_TO}으로 만들면 2삭이 세 장이 되어 한 장만 더 맞으면 완성인 손이 됩니다.`,
    // 쓸 수 있는 액티브 증강이 둘 이상이면(시작 증강 + 이번 국에 고른 것) 버튼을 누른
    // 뒤에 **고르는 줄이 한 번 더** 뜬다. 그 단계를 안 적어 두면 목록 앞에서 멈춘다
    // (2026-08-18 실측 — 첫 국부터 둘인 경우가 흔하다).
    todo: "«✦ 액티브 증강»을 누르고(목록이 뜨면 «연금술사»), 빛나는 1삭을 클릭하세요.",
    anchor: handTile(SCRIPT_ALCHEMY),
    lock: { kind: SCRIPT_ALCHEMY, how: "augment" },
    when: (c) =>
      c.augmentReady && c.handKinds.has(SCRIPT_ALCHEMY) && turns(c.view) >= 1 && !c.riichiDeclared,
    /*
     * 끝난 신호는 **보라 생성패가 생겼는가**가 먼저다. "1삭이 손에서 사라졌는가"만
     * 보면 그 순에 1삭을 한 장 더 쯔모했을 때(실제로 일어난다) 이미 바꿔 놓고도
     * 강의가 그대로 서 있다 — 같은 일을 또 하라는 말로 읽힌다(2026-08-18 실측).
     * 둘째 갈래는 대본을 벗어난 경우(버렸거나 애초에 없었다)를 위한 것이다.
     */
    done: (c) => c.hit(".tile-conjured") || !c.handKinds.has(SCRIPT_ALCHEMY),
  },
  {
    /**
     * **대본 3 — 리치.** 텐파이가 서면 곧바로 여기로 온다.
     * 버릴 패까지 지목하지는 않는다 — 리치 모드에 들어가면 판이 이미 *걸 수 있는
     * 패만* 남겨 주므로, 화면이 스스로 좁혀 주는 것을 코치가 또 좁힐 필요가 없다.
     */
    id: "riichi",
    urgent: true,
    chapter: "한 판 끝내기",
    title: "텐파이입니다 — 리치를 걸어 보세요",
    body: "한 장만 더 맞으면 완성이라는 뜻입니다. 리치는 1000점을 걸고 점수를 크게 올립니다. 대신 손이 잠겨, 이후에는 가져온 패를 그대로 버리게 됩니다.",
    todo: "«리치»를 누른 뒤, 오른쪽 끝에 떨어져 있는 방금 가져온 패를 누르세요.",
    anchor: ".act-riichi",
    when: (c) => c.optionTypes.has("riichi"),
    done: (c) => c.riichiDeclared || !c.optionTypes.has("riichi"),
  },
  {
    /**
     * 리치를 걸고 나면 할 일이 없다 — 그 사실 자체를 말해 주지 않으면 "멈춘 건가"가
     * 된다. 다음에 무엇이 일어나는지(론 버튼이 뜬다)를 미리 알려 두는 자리다.
     */
    id: "riichi-wait",
    chapter: "한 판 끝내기",
    title: "리치 성공 — 이제 기다립니다",
    body: "손이 잠겨 가져온 패가 그대로 나갑니다. 여기서부터 할 일은 하나뿐입니다: 상대 셋 중 누군가가 내 오름패를 버리면 빨간 «론» 버튼이 뜹니다. 그때 누르면 끝입니다.",
    when: (c) => c.riichiDeclared && !c.optionTypes.has("win"),
  },
  {
    id: "call",
    urgent: true,
    chapter: "한 판 끝내기",
    title: "상대가 버린 패를 가져올 수 있습니다",
    body: "치·퐁은 남의 버림패로 묶음을 완성하는 것입니다. 대신 손패가 열려 리치를 걸 수 없게 됩니다 — 필요 없으면 패스를 누르세요.",
    anchor: ".action-bar",
    when: (c) => CALL_TYPES.some((t) => c.optionTypes.has(t)),
    done: (c) => !prompting(c),
  },

  {
    id: "dora",
    chapter: "기본 조작",
    title: "가운데 뒤집힌 패가 도라 표시입니다",
    body: "그 패의 “다음” 패가 도라입니다. 도라를 한 장 쥘 때마다 점수가 한 단계씩 올라갑니다. 도라는 손패에서 노란색으로 계속 반짝입니다.",
    anchor: ".dora-slot",
    when: (c) => !c.draftOpen && (c.view?.round.doraIndicators.length ?? 0) > 0,
  },
  {
    id: "river",
    chapter: "기본 조작",
    title: "버린 패는 가운데 바닥에 쌓입니다",
    body: "누가 무엇을 버렸는지가 전부 남습니다. 패 오른쪽 아래 동그라미는 쯔모기리(가져와서 그대로 버린 패)이고, 점선은 그 패가 어디서 왔는지 알려 줍니다.",
    anchor: ".river-bottom",
    when: (c) => !c.draftOpen && turns(c.view) >= 1,
  },

  // ─────────── 증강 읽기 — 이 게임의 정체 ───────────
  {
    id: "aug-pill",
    chapter: "증강 읽기",
    title: "내 증강은 이름표에 붙어 있습니다",
    body: "지금 내가 가진 증강입니다. 상대 이름표에도 그 사람이 공개한 증강이 같은 모양으로 붙습니다.",
    todo: "증강 이름에 마우스를 올려 설명을 띄워 보세요.",
    anchor: ".own-top-main .np-augs",
    when: (c) => !c.draftOpen && c.hit(MY_PILLS) && turns(c.view) >= 1,
    done: (c) => c.hit(MY_TIP),
  },
  {
    id: "aug-pin",
    chapter: "증강 읽기",
    title: "눌러 두면 설명이 그대로 서 있습니다",
    body: "마우스를 떼면 설명이 사라져서, 읽는 동안에는 판을 못 봅니다. 눌러서 고정하면 둘을 나란히 볼 수 있어요. 여러 개를 동시에 고정할 수 있고, 다시 누르거나 Esc를 누르면 풀립니다.",
    todo: "증강 이름을 한 번 눌러 설명을 고정해 보세요 (📌 표시가 붙습니다).",
    anchor: ".own-top-main .np-augs",
    when: (c) => !c.draftOpen && c.hit(MY_PILLS) && turns(c.view) >= 1,
    done: (c) => c.hit(".aug-pill-pinned"),
  },
  {
    id: "aug-detail",
    chapter: "증강 읽기",
    title: "설명은 두 겹입니다 — 요약과 상세",
    body: "펼쳐진 설명 안의 «자세히 ▾»를 누르면 작동 원리와 주의점까지 나옵니다. Shift를 누르고 있는 동안에도 같은 것이 펼쳐집니다.",
    todo: "고정해 둔 설명에서 «자세히 ▾»를 눌러 보세요.",
    anchor: ".own-top-main .np-augs",
    when: (c) => !c.draftOpen && (c.hit(".aug-pill-pinned") || c.hit(MY_TIP)),
    done: (c) => c.hit(".own-top-main .augdesc-body-full"),
  },
  {
    id: "aug-terms",
    chapter: "증강 읽기",
    title: "밑줄 그인 말은 눌러 보면 풀이가 나옵니다",
    body: "슌쯔·오름패처럼 처음 보는 마작 용어에는 밑줄이 있습니다. 잠깐 올려 두거나 누르면 한 줄 풀이가 뜹니다. 전체 목록은 📘 규칙의 «용어» 탭에 있어요.",
    anchor: ".gterm",
    when: (c) => !c.draftOpen && c.hit(".gterm"),
  },
  {
    id: "aug-btn",
    chapter: "증강 읽기",
    title: "⚡ 액티브 증강은 직접 눌러야 터집니다",
    body: "저절로 발동하지 않습니다. 쓸 수 있게 되면 «✦ 액티브 증강» 버튼이 켜지고, 그 버튼에 손을 올리면 지금 쓸 수 있는 증강이 이름표에서 함께 빛납니다.",
    todo: "«✦ 액티브 증강» 버튼에 마우스를 올려 보세요.",
    anchor: ".own-top-main .aug-btn",
    when: (c) => c.augmentReady && c.hit(".own-top-main .aug-btn"),
    done: (c) => c.hit(".aug-pill-usable"),
  },
  {
    /**
     * 대본(`aug-script`)을 못 따라간 사람을 위한 일반 강의 — 바꿀 패를 지목하지
     * 않는다. 이미 생성패가 화면에 있으면(=써 봤으면) 꺼내지 않는다: 조건과 완료가
     * 같은 순간에 참이 되어 말풍선이 한 프레임 번쩍이기만 한다.
     */
    id: "aug-use",
    chapter: "증강 읽기",
    title: "실제로 한 번 써 봅시다",
    body: "«연금술사»는 손패의 수패 한 장을 숫자 ±1로 바꿉니다. 게임 5회라 지금 써도 넉넉합니다.",
    todo: "«✦ 액티브 증강»을 누른 뒤 바꿀 손패를 클릭하세요.",
    anchor: ".own-top-main .aug-btn",
    when: (c) => c.augmentReady && c.hit(".own-top-main .aug-btn") && !c.hit(".tile-conjured"),
    done: (c) => c.hit(".tile-conjured"),
  },
  {
    id: "conjured",
    chapter: "증강 읽기",
    title: "보라색 패 = 증강이 만들어낸 패",
    body: "원래 패산에 있던 136장이 아니라 증강이 새로 만든 패입니다. 도라의 노란 반짝임과는 색으로 구분됩니다 — 노랑은 도라, 보라는 생성패입니다.",
    // 내 손이든 상대 바닥이든, 지금 화면에 있는 그 패를 가리킨다 (봇도 생성패를 만든다)
    anchor: ".tile-conjured",
    when: (c) => c.hit(".tile-conjured"),
  },
  {
    id: "aug-others",
    chapter: "증강 읽기",
    title: "상대 이름표의 표식도 읽어 두세요",
    body: "🔒은 상대의 무장해제로 이번 국만 잠긴 것, 🕐N국은 쿨다운, ♻는 재장전, 🎲는 주사위로 얻은 증강입니다. 🎯 퀘스트 증강은 게이지가 조건 진행도예요.",
    anchor: ".nameplate",
    when: (c) => !c.draftOpen && turns(c.view) >= 3,
  },

  // ─────────── 화면 도구 ───────────
  /*
   * 배율은 «화면 도구» 중에서 **가장 먼저** 짚는다. 나머지 도구(도감·규칙·설정)는
   * 몰라도 판을 둘 수 있지만, 판이 잘리거나 겹쳐 보이는 사람은 그 순간부터 아무것도
   * 제대로 못 본다 — 코치가 "여기를 보세요"라고 가리키는 것조차 화면 밖일 수 있다.
   * 그래서 도감·규칙보다 위, 그리고 더 이른 순(turns 2)에 연다.
   */
  {
    id: "zoom",
    chapter: "화면 도구",
    title: "판이 안 맞으면 +/− 로 크기를 맞추세요",
    // 손잡이 위치는 화면마다 다르다 — 대국 + 넓은 판이면 우상단 아이콘 줄 바로 아래,
    // 좁은 판에서는 오른쪽 아래 구석으로 내려간다(styles.css `.ui-zoom` 주석).
    // 둘 다 적어 두지 않으면 절반의 사람에게는 없는 버튼을 가리키는 안내가 된다.
    body: "오른쪽 위 아이콘(⚙📖📘) 바로 아래에 +/− 손잡이가 있습니다 — 화면이 좁으면 오른쪽 아래 구석으로 내려갑니다. 판이 잘리거나 겹쳐 보일 때 먼저 여기를 만져 보세요.",
    // 단축키를 두 벌 적는 이유: 손잡이가 안 보이거나 눌리지 않는 자리가 실제로 있다
    // (패널이 덮은 상태 등). ⌥/Alt 는 **이 게임의** 배율이고, Ctrl(⌘)+−/+ 는
    // 브라우저 자체 확대다 — App.tsx의 단축키는 ctrl·meta가 눌려 있으면 손을 뗀다
    // (`uiScale.ts`), 즉 둘은 서로 먹히는 게 아니라 각자 따로 듣는다.
    todo: "+ 나 − 를 눌러 보세요. ⌥(Alt) + − / + 로도 되고, 그래도 안 되면 브라우저 확대 Ctrl(⌘) + − / + 를 쓰세요.",
    anchor: ".ui-zoom",
    when: (c) => !c.draftOpen && c.hit(".ui-zoom") && turns(c.view) >= 2,
    // 실제로 배율을 바꿨는가 = 가운데 % 버튼이 **눌리는 상태가 되었는가**. 그 버튼은
    // 100%일 때만 disabled다(App.tsx `ScaleControl`) — 새 표식을 붙이지 않고 이미
    // 화면에 있는 진실을 읽는다(§판정은 전부 화면에서 온다).
    done: (c) => c.hit(".ui-zoom-now:not(:disabled)"),
  },
  {
    id: "codex",
    chapter: "화면 도구",
    // 종 수를 적지 않는다 — 서버마다 다르고(도감이 직접 세어 보여 준다) 늘 때마다 낡는다.
    title: "📖 증강 도감 — 있는 증강 전부",
    body: "상대가 방금 공개한 증강이 무엇인지 궁금할 때 판 위에서 바로 열 수 있습니다. 여는 동안에도 게임은 그대로 진행됩니다.",
    todo: "오른쪽 위 📖를 눌러 열어 보세요 (닫으면 판으로 돌아옵니다).",
    anchor: ".codex-btn",
    when: (c) => !c.draftOpen && turns(c.view) >= 2,
    done: (c) => c.overlay === "codex",
  },
  {
    id: "help",
    chapter: "화면 도구",
    title: "📘 규칙 · 도움말 — 역·점수·용어",
    body: "리치마작을 처음 해도 길을 잃지 않을 만큼만 적어 두었습니다. «용어» 탭에는 이 게임에 나오는 말이 전부 풀이돼 있어요.",
    todo: "오른쪽 위 📘를 눌러 열어 보세요.",
    anchor: ".help-btn",
    when: (c) => !c.draftOpen && turns(c.view) >= 2,
    done: (c) => c.overlay === "help",
  },
  {
    /*
     * 좌하단 빠른 토글 — **설정보다 먼저** 짚는다.
     *
     * 여태 코치는 이 줄을 한 번도 말하지 않았다(2026-08-18 사용자 지적: "왼쪽아래
     * 자동정렬같은 버튼들 튜토리얼도 빠져있어"). 판 위에 상시로 떠 있는 네 개짜리
     * 줄인데 이름 말고는 아무 설명이 없어서, 처음 온 사람에게는 "누르면 무슨 일이
     * 생기는지 모르는 버튼 넷"이 손 옆에 계속 서 있는 셈이었다.
     *
     * 자동버림·자동화료를 굳이 말리는 이유: 이 둘은 켜는 순간 되돌릴 수 없는 수를
     * 대신 둔다. 배우는 자리에서 그걸 모르고 켜면 그때부터 판이 혼자 굴러간다
     * (튜토리얼 동안에는 서버가 자동 응답을 멈춰 두지만, 이 판이 끝나면 살아난다).
     *
     * 넓은 화면에서는 왼쪽 아래 구석, 좁은 화면에서는 손패 바로 위에 눕는다
     * (styles.css `.quick-toggles-inline`) — 자리를 둘 다 적어 둔다.
     */
    id: "quick-toggles",
    chapter: "화면 도구",
    title: "왼쪽 아래 네 개 — 판을 두면서 바로 켜고 끄는 것들",
    body: "«자동정렬»을 끄면 손패를 끌어 순서를 바꿀 수 있고, «후로없음»은 치·퐁 기회를 자동으로 넘깁니다. «자동화료»·«자동버림»은 대신 눌러 주는 것이라 배우는 동안에는 꺼 두세요. 좁은 화면에서는 이 줄이 손패 바로 위에 눕습니다.",
    todo: "«자동정렬»을 한 번 눌러 꺼 보세요 — 손패를 직접 끌어 옮길 수 있게 됩니다.",
    anchor: ".quick-toggles",
    when: (c) => !c.draftOpen && c.hit(".quick-toggles") && turns(c.view) >= 2,
    // 실제로 껐는가 = 그 칸의 불이 꺼졌는가. 넷 중 자동정렬만 기본이 켜짐이라
    // 이 표식(`qt-autoSort`)이 없으면 다른 칸의 꺼짐이 완료로 오인된다.
    done: (c) => c.hit(".quick-toggles .qt-autoSort:not(.qt-on)"),
  },
  {
    id: "settings",
    chapter: "화면 도구",
    title: "⚙ 설정 — 자동정렬·소리·용어 설명",
    // 자동 응답이 튜토리얼 동안 멈춰 있다는 사실을 여기서 말한다. 안 적으면 켜 보고
    // "안 먹는다"가 된다 (App.tsx `tryAutoRespond`의 튜토리얼 예외).
    body: "자동 화료, 후로 안 하기, 효과음, 용어 설명 켜고 끄기가 전부 여기 있습니다. 맨 아래에는 게임 무효 투표도 있어요. 자동으로 대신 눌러 주는 설정들은 튜토리얼 동안만 쉽니다 — 직접 눌러 보셔야 하니까요.",
    todo: "오른쪽 위 ⚙를 눌러 열어 보세요.",
    anchor: ".settings-btn",
    when: (c) => !c.draftOpen && turns(c.view) >= 3,
    done: (c) => c.hit(".settings-panel"),
  },

  {
    /*
     * **마무리는 화료가 정한다** (2026-08-18 사용자 지시).
     *
     * 예전 조건은 "기본 강의 여섯 개를 봤는가"였다. 그러면 리치도 론도 안 해 본
     * 사람에게 "여기까지가 기본입니다"가 뜬다 — 정작 이 게임에서 **점수가 오가는
     * 유일한 순간**을 한 번도 안 보여 준 채로 끝나는 셈이다. 지금은 판을 실제로
     * 끝냈을 때만 나온다: 론이든 쯔모든, 내 손으로 화료 버튼을 눌렀을 때.
     *
     * 끝이 안 오면 안 끝난다 — 그래도 말풍선의 «그만 보기»가 언제나 출구다.
     */
    id: "outro",
    chapter: "한 판 끝내기",
    title: "화료 성공 — 여기까지가 기본입니다",
    body: "리치를 걸고 화료까지 해 보셨습니다. 나머지는 두면서 익히면 됩니다. 이 판은 계속 두셔도 되고, «🎓 튜토리얼» 버튼으로 언제든 다시 오실 수 있어요 — 로그인 화면과 홈 양쪽에 있습니다.",
    when: (c) => c.seen.has("ron") || c.seen.has("win"),
  },
];

/** 지금 꺼낼 강의 — 아직 안 본 것 중 기회가 성립하는 첫 번째 */
export function pickLesson(c: CoachCtx): Lesson | null {
  for (const lesson of LESSONS) {
    if (c.seen.has(lesson.id)) continue;
    if (lesson.when(c)) return lesson;
  }
  return null;
}

/**
 * 지금 **읽던 것을 밀어내고** 끼어들 강의 (`urgent`). 없으면 null.
 *
 * 목록 순서만으로는 못 잡는 자리를 메운다 — 코치는 붙들고 있는 강의가 끝나야
 * 다음을 집으므로, 강의 하나를 읽는 사이에 생긴 기회(치·리치·화료·새 증강 선택창)는
 * 그 강의를 닫을 때까지 화면에서 설명 없이 서 있게 된다.
 */
export function pickUrgent(c: CoachCtx): Lesson | null {
  for (const lesson of LESSONS) {
    if (lesson.urgent !== true || c.seen.has(lesson.id)) continue;
    if (lesson.when(c)) return lesson;
  }
  return null;
}

// ─────────────────────────── 말풍선 자리 ───────────────────────────

/** 화면 위의 사각형 — **레이아웃 좌표** px (`uiScale.toLayoutPx`로 되돌린 값) */
export interface CoachRect {
  top: number;
  left: number;
  w: number;
  h: number;
}

/** 말풍선과 강조 사이 틈 */
const BUBBLE_GAP = 10;
/** 화면 가장자리 여백 */
const EDGE_PAD = 8;
/**
 * 강조가 화면의 이만큼을 넘게 차지하면 **옆에 설 자리가 없다**고 본다.
 *
 * 증강 선택창(`.draft-panel`)이 그렇다 — 화면을 거의 다 덮으므로 어느 쪽에 붙여도
 * 결국 그 위에 얹힌다. 그때는 따라다니려 애쓰지 말고 위쪽 띠로 물러난다.
 */
const HUGE_RING_RATIO = 0.6;

/** 두 사각형이 겹치는 넓이 (안 겹치면 0) */
function overlapArea(a: CoachRect, b: CoachRect): number {
  const x = Math.min(a.left + a.w, b.left + b.w) - Math.max(a.left, b.left);
  const y = Math.min(a.top + a.h, b.top + b.h) - Math.max(a.top, b.top);
  return x > 0 && y > 0 ? x * y : 0;
}

/**
 * 말풍선이 앉을 자리 — CSS `top`/`bottom` 중 하나 + `left`.
 *
 * **위에 붙을 때만 `bottom`을 쓴다.** 말풍선 높이는 글 길이와 화면 폭에 따라
 * 달라지는데, `top`으로 고정해 두면 높이가 커지는 순간 아래로 자라 **가리키던 것을
 * 덮는다**(2026-08-18 폰 세로 실측: 치·패스 버튼의 윗줄을 물었다). 아래쪽 끝을
 * 붙들어 두면 위로만 자라므로 그 일이 구조적으로 생기지 않는다.
 */
export interface BubbleSpot {
  top?: number;
  bottom?: number;
  left: number;
}

/**
 * 말풍선을 **가리키는 것 옆에** 놓는다 — 위·아래·왼·오 중 아무것도 가리지 않는 쪽.
 *
 * ## 왜 이게 필요했나
 *
 * 처음에는 말풍선을 늘 화면 위쪽 가운데에 못 박아 두었다. 이유는 있었다: 아래쪽
 * 절반에는 손패와 액션 바(치·퐁·리치·론)가 있고, "이 버튼을 누르세요"라고 해 놓고
 * 그 버튼을 덮는 것만큼 나쁜 안내가 없다. 그런데 그 규칙을 화면 전체에 걸어 두니
 * 이번엔 **가리키는 것과 설명이 늘 멀리 떨어져** 있었다 — 오른쪽 위 📖를 가리키면서
 * 글은 화면 반대편 가운데에 있는 식이다 (2026-08-18 사용자 지적).
 *
 * 그래서 "위쪽 고정"을 "**가려서는 안 되는 곳만** 피한다"로 바꾼다. 피할 곳은
 * 호출부가 `keepClear`로 넘긴다(손패·액션 바 줄). 그 밖에는 강조 바로 옆에 선다.
 *
 * ## 고르는 법
 *
 * 위 → 아래 → 왼 → 오 → 위쪽 띠(안전한 기본) 순으로 후보를 만들고, **가리는 넓이가
 * 가장 작은** 것을 고른다. 같으면 앞선 후보가 이긴다(= 따라가기를 기본으로 둔다).
 * 강조 자신을 덮는 것은 네 배로 친다 — 무엇을 보라고 한 건지가 사라지는 쪽이
 * 손패가 조금 가려지는 것보다 나쁘다.
 *
 * 순수 함수다(DOM을 모른다) — 재는 것은 호출부, 정하는 것은 여기.
 */
export function placeBubble(
  ring: CoachRect | null,
  bubble: { w: number; h: number },
  view: { w: number; h: number },
  keepClear: readonly CoachRect[],
): BubbleSpot {
  const clampX = (x: number): number =>
    Math.min(Math.max(x, EDGE_PAD), Math.max(EDGE_PAD, view.w - bubble.w - EDGE_PAD));
  const clampY = (y: number): number =>
    Math.min(Math.max(y, EDGE_PAD), Math.max(EDGE_PAD, view.h - bubble.h - EDGE_PAD));
  /** 위쪽 띠 가운데 — 가리킬 것이 없거나 옆에 설 자리가 없을 때의 자리 */
  const band = { top: clampY(12), left: clampX((view.w - bubble.w) / 2) };
  /** 아래쪽 띠 가운데 — 위쪽 띠가 덮으면 안 되는 것을 물 때의 대안 */
  const lowBand = { top: clampY(view.h - bubble.h - 12), left: band.left };

  /**
   * 띠로 물러날 때도 **위/아래 중 덜 가리는 쪽**을 고른다.
   *
   * ⚠ 예전에는 무조건 위쪽 띠였다. 증강 선택창처럼 강조가 화면을 거의 다 덮는 화면에서는
   * 링 옆에 설 자리가 없어 늘 이 경로로 오는데, 그 위쪽 띠 자리에 정확히 "증강 선택"
   * 제목과 남은 시간 타이머가 있다 — 제목·타이머가 통째로 안 보였다(2026-08-18 PC 실측:
   * 420×43px 겹침, `elementFromPoint`가 제목 자리에서 말풍선을 돌려줬다).
   * 이제 `keepClear`가 그 줄을 넘겨 주면 아래쪽 띠로 비켜선다.
   */
  const pickBand = (): BubbleSpot => {
    const cost = (b: { top: number; left: number }): number => {
      const box = { top: b.top, left: b.left, w: bubble.w, h: bubble.h };
      let c = 0;
      for (const r of keepClear) c += overlapArea(box, r);
      return c;
    };
    // 같으면 위쪽이 이긴다 — 아래쪽 절반에는 손패·액션 바가 있는 것이 기본 전제다.
    return cost(lowBand) < cost(band)
      ? { bottom: view.h - (lowBand.top + bubble.h), left: lowBand.left }
      : band;
  };

  if (ring === null) return pickBand();
  if (ring.w * ring.h > view.w * view.h * HUGE_RING_RATIO) return pickBand();

  const midX = clampX(ring.left + ring.w / 2 - bubble.w / 2);
  const midY = clampY(ring.top + ring.h / 2 - bubble.h / 2);
  /** 후보 하나 — `top`은 점수를 매기는 데 쓰고, `spot`이 실제로 화면에 나가는 값이다 */
  const above = clampY(ring.top - BUBBLE_GAP - bubble.h);
  const candidates: { top: number; left: number; spot: BubbleSpot }[] = [
    // 위 — 아래쪽 끝을 붙들어 둔다(`BubbleSpot` 주석)
    { top: above, left: midX, spot: { bottom: view.h - (above + bubble.h), left: midX } },
    ...[
      { top: clampY(ring.top + ring.h + BUBBLE_GAP), left: midX }, // 아래
      { top: midY, left: clampX(ring.left - BUBBLE_GAP - bubble.w) }, // 왼쪽
      { top: midY, left: clampX(ring.left + ring.w + BUBBLE_GAP) }, // 오른쪽
      band,
    ].map((c) => ({ ...c, spot: { top: c.top, left: c.left } })),
  ];

  let best = candidates[0]!;
  let bestCost = Infinity;
  for (const c of candidates) {
    const box = { top: c.top, left: c.left, w: bubble.w, h: bubble.h };
    let cost = overlapArea(box, ring) * 4;
    for (const r of keepClear) cost += overlapArea(box, r);
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return best.spot;
}

/** 튜토리얼을 이미 마쳤는가 (localStorage 키) */
export const TUTORIAL_KEY = "majak.tutorialDone";
