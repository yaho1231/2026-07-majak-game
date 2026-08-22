/**
 * "이 사람이 자기 손패를 이렇게 가공했다"는 **전원 공개 표식**들을, 그 손이 통째로
 * 남에게 넘어갈 때 지우는 도구.
 *
 * ## 왜 있는가 — 손은 갔는데 표식은 남아 거짓말이 됐다
 *
 * 단색 세계(`suit_unify`)는 "어느 색으로 통일했는지는 전원에게 공개된다"고 약속하고
 * 국 스코프 채널 `view:*:suit_unify:<holder>` 에 색을 싣는다. 그런데 통째로 바꾸기
 * (`full_hand_swap`)가 그 손을 강탈해도 채널은 원주인 자리에 그대로 남았다 —
 * 화면은 "p1 이 청일색을 노린다"고 말하는데 정작 그 손은 p0 이 쥐고 있어서 세 좌석이
 * **전부 잘못된 대상에게 베타오리했다** (QA synergy3 handedit 확정 7, 2026-08-23).
 * 실물의 흔적(생성패·`conjured`·적도라 표식)은 이미 패를 따라간다 — 표식만 안 따라갔다.
 *
 * ## 무엇을 지우고 무엇을 남기는가
 *
 * 지우는 것은 **그 손의 내용을 설명하는** 채널뿐이다. 새 보유자 자리로 옮기지 않는다 —
 * "p0 이 단색 세계를 썼다"도 사실이 아니기 때문이다. 손이 떠난 자리에는 아무 말도
 * 남기지 않는 것이 지금 낼 수 있는 유일한 참말이다.
 *
 * ⚠ 편식(`picky_eater`)은 일부러 뺐다 — 그 퀘스트는 손패가 아니라 **버림 이력**을
 * 세므로 손이 넘어가도 채널이 거짓말이 되지 않는다. 조커(`joker`)도 같은 이유로 뺀다
 * (와일드 판정은 손이 아니라 그 사람에게 붙는다).
 */

import type { GameState, PlayerId } from "@majak/core";
import { roundViewKey } from "../util.js";

/** 손패의 내용을 설명하는 국 스코프 공개 채널을 가진 증강들 */
const HAND_MARK_AUGMENT_IDS: readonly string[] = [
  "alchemist",
  "conjure_draw",
  "even_world",
  "suit_unify",
  "tile_dyeing",
  "tile_split",
];

/**
 * 그 사람의 손 가공 표식을 전부 지우는 `augmentData` 조각.
 * 리듀서에서 `augmentData: { ...state.augmentData, ...clearedHandMarks(state, p.target) }`
 * 처럼 펼쳐 넣는다. 리듀서에는 키 삭제가 없으므로 `undefined` 로 덮는다 —
 * 뷰 빌더가 `undefined`·`null`·`""` 를 "비워진 채널"로 보고 아예 내려보내지 않는다
 * (`core/src/information/PlayerView.ts` 의 `cleared`).
 */
export function clearedHandMarks(
  state: GameState,
  ...players: PlayerId[]
): Record<string, undefined> {
  const out: Record<string, undefined> = {};
  for (const player of players) {
    for (const id of HAND_MARK_AUGMENT_IDS) {
      const key = roundViewKey("*", `${id}:${player}`);
      if (state.augmentData[key] !== undefined) out[key] = undefined;
    }
  }
  return out;
}
