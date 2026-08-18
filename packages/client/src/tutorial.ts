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
  /** 이미 본 강의 id */
  seen: ReadonlySet<string>;
}

/** 강의를 묶는 장(章) — 말풍선 머리에 작게 붙어 "지금 무슨 이야기 중인지"를 준다 */
export type LessonChapter = "시작" | "증강 고르기" | "기본 조작" | "증강 읽기" | "화면 도구" | "한 판 끝내기";

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
    id: "discard",
    chapter: "기본 조작",
    title: "내 차례 — 한 장을 버립니다",
    body: "오른쪽 끝에 방금 가져온 패가 떨어져 붙어 있습니다. 이걸 반복하며 손을 완성해 갑니다.",
    todo: "필요 없는 패를 눌러 버리세요.",
    anchor: ".own-hand",
    when: myTurn,
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
    id: "win",
    urgent: true,
    chapter: "한 판 끝내기",
    title: "화료할 수 있습니다!",
    body: "손이 완성됐습니다. 빨간 버튼을 누르면 이 국이 끝나고 점수를 받습니다.",
    todo: "«쯔모» 또는 «론» 버튼을 누르세요.",
    anchor: ".act-win",
    when: (c) => c.optionTypes.has("win"),
    done: (c) => !c.optionTypes.has("win"),
  },
  {
    id: "riichi",
    urgent: true,
    chapter: "한 판 끝내기",
    title: "텐파이입니다 — 리치를 걸 수 있어요",
    body: "한 장만 더 맞으면 완성이라는 뜻입니다. 리치는 1000점을 걸고 점수를 크게 올리지만, 이후에는 가져온 패를 그대로 버려야 합니다.",
    anchor: ".action-bar",
    when: (c) => c.optionTypes.has("riichi"),
    done: (c) => !c.optionTypes.has("riichi"),
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
    id: "aug-use",
    chapter: "증강 읽기",
    title: "실제로 한 번 써 봅시다",
    body: "«연금술사»는 손패의 수패 한 장을 숫자 ±1로 바꿉니다. 게임 5회라 지금 써도 넉넉합니다.",
    todo: "«✦ 액티브 증강»을 누른 뒤 바꿀 손패를 클릭하세요.",
    anchor: ".own-top-main .aug-btn",
    when: (c) => c.augmentReady && c.hit(".own-top-main .aug-btn"),
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
    id: "outro",
    chapter: "한 판 끝내기",
    title: "여기까지가 기본입니다",
    body: "나머지는 두면서 익히면 됩니다. 이 판은 계속 두셔도 되고, «🎓 튜토리얼» 버튼으로 언제든 다시 오실 수 있어요 — 로그인 화면과 홈 양쪽에 있습니다.",
    when: (c) =>
      c.seen.has("discard") &&
      c.seen.has("dora") &&
      c.seen.has("hand") &&
      c.seen.has("aug-pill") &&
      c.seen.has("aug-btn") &&
      c.seen.has("codex"),
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
  if (ring === null) return band;
  if (ring.w * ring.h > view.w * view.h * HUGE_RING_RATIO) return band;

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
