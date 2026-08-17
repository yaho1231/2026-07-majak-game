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
 * ## 판정은 전부 뷰에서 온다
 *
 * "버렸는가"를 클릭 이벤트로 알지 않는다 — 드래그로도, 단축키로도, 오른쪽 버튼으로도
 * 버릴 수 있어서 이벤트를 세면 셋 중 둘을 놓친다. 선택지(`prompt.options`)가
 * 사라졌는지를 본다. 화면이 실제로 어떤 상태인지가 유일한 진실이다.
 */

import { handZone } from "@majak/core";
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
  /** 이미 본 강의 id */
  seen: ReadonlySet<string>;
}

export interface Lesson {
  id: string;
  title: string;
  body: string;
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
}

/** 내 손패 장수 (관전·배패 전에는 0) */
function handSize(view: PlayerView | null): number {
  if (view === null) return 0;
  const zone = view.zones[handZone(view.playerId)];
  return (zone?.tileIds.length ?? 0) + (zone?.hiddenCount ?? 0);
}

/** 지금 무언가를 답해야 하는가 */
const prompting = (c: CoachCtx): boolean => c.optionTypes.size > 0;

/** 내 차례 = 버릴 수 있다 */
const myTurn = (c: CoachCtx): boolean =>
  c.optionTypes.has("discard") || c.optionTypes.has("free_discard");

/** 남의 버림패에 반응하는 자리 (치·퐁·깡) */
const CALL_TYPES = ["chi", "pon", "minkan", "kokushi_pon", "bluff_pon", "silent_pon"];

/**
 * 강의 목록 — **위에 있을수록 먼저**.
 *
 * 문장은 짧게 둔다. 판이 돌아가는 중에 읽는 글이라, 세 줄을 넘으면 읽지 않고 닫는다.
 */
export const LESSONS: readonly Lesson[] = [
  {
    id: "welcome",
    title: "봇 3명과 한 판 — 같이 해 봐요",
    body: "화면에서 무엇을 눌러야 하는지 순서대로 알려 드립니다. 규칙을 다 몰라도 됩니다 — 눌러야 할 자리는 그때그때 표시됩니다.",
    when: (c) => c.view !== null,
  },
  {
    id: "draft",
    title: "먼저 증강을 하나 고릅니다",
    body: "국이 시작될 때마다 세 장 중 하나를 고릅니다. 증강은 이 게임의 규칙 자체를 바꾸는 능력입니다 — 무엇을 골라도 됩니다.",
    anchor: ".draft-panel",
    when: (c) => c.draftOpen,
    done: (c) => !c.draftOpen,
  },
  {
    id: "hand",
    title: "아래 줄이 내 손패입니다",
    body: "13장을 쥐고 시작합니다. 만·통·삭·자패 순으로 정렬되어 있고, 끌어서 순서를 바꿀 수도 있습니다.",
    anchor: ".own-hand",
    when: (c) => !c.draftOpen && handSize(c.view) >= 13,
  },
  {
    id: "discard",
    title: "내 차례 — 한 장을 버립니다",
    body: "오른쪽 끝에 방금 가져온 패가 떨어져 붙어 있습니다. 필요 없는 패를 눌러 버리세요. 이걸 계속 반복하며 손을 완성해 갑니다.",
    anchor: ".own-hand",
    when: myTurn,
    done: (c) => !myTurn(c),
  },
  {
    id: "dora",
    title: "가운데 뒤집힌 패가 도라 표시입니다",
    body: "그 패의 “다음” 패가 도라입니다. 도라를 한 장 쥘 때마다 점수가 한 단계씩 올라갑니다.",
    anchor: ".dora-slot",
    when: (c) => !c.draftOpen && (c.view?.round.doraIndicators.length ?? 0) > 0,
  },
  {
    id: "call",
    title: "상대가 버린 패를 가져올 수 있습니다",
    body: "치·퐁은 남의 버림패로 묶음을 완성하는 것입니다. 대신 손패가 열려 리치를 걸 수 없게 됩니다 — 필요 없으면 패스를 누르세요.",
    anchor: ".action-bar",
    when: (c) => CALL_TYPES.some((t) => c.optionTypes.has(t)),
    done: (c) => !prompting(c),
  },
  {
    id: "riichi",
    title: "텐파이입니다 — 리치를 걸 수 있어요",
    body: "한 장만 더 맞으면 완성이라는 뜻입니다. 리치는 1000점을 걸고 점수를 크게 올리지만, 이후에는 가져온 패를 그대로 버려야 합니다.",
    anchor: ".action-bar",
    when: (c) => c.optionTypes.has("riichi"),
    done: (c) => !c.optionTypes.has("riichi"),
  },
  {
    id: "augment",
    title: "고른 증강을 지금 쓸 수 있습니다",
    body: "보라색 ⚡ 버튼이 내가 고른 증강입니다. 쓸 수 있는 때가 되면 이렇게 떠오릅니다.",
    anchor: ".act-aug",
    when: (c) => c.augmentReady,
    done: (c) => !prompting(c),
  },
  {
    id: "win",
    title: "화료할 수 있습니다!",
    body: "손이 완성됐습니다. 빨간 버튼을 누르면 이 국이 끝나고 점수를 받습니다.",
    anchor: ".act-win",
    when: (c) => c.optionTypes.has("win"),
    done: (c) => !c.optionTypes.has("win"),
  },
  {
    id: "outro",
    title: "여기까지가 기본 조작입니다",
    body: "나머지는 두면서 익히면 됩니다. 역·점수·증강 전체 설명은 언제든 오른쪽 위 📘 규칙에서 볼 수 있어요.",
    when: (c) => c.seen.has("discard") && c.seen.has("dora") && c.seen.has("hand"),
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

/** 튜토리얼을 이미 마쳤는가 (localStorage 키) */
export const TUTORIAL_KEY = "majak.tutorialDone";
