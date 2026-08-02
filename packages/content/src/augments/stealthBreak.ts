/**
 * 숨은 리치(스텔스 리치) 해제 — 손을 통째로/일부 바꾸는 증강들의 공용 장치.
 *
 * # 왜 필요한가 (2026-08-02 정보 누설 감사)
 *
 * 손을 바꾸는 증강 셋(통째로 바꾸기·손패 3장 교환·자리 바꿈)은 **리치 중인 상대를
 * 대상으로 삼을 수 없다.** 리치는 "이 손으로 텐파이 고정"이 전제라, 손패만 바뀌고
 * riichi 필드가 자리에 남으면 원래 대기와 무관한 손을 쥔 채 강제 쯔모기리하게 된다.
 *
 * 그런데 `FlowController`는 **validate를 통과한 후보만** 프롬프트에 담는다. 그래서 이
 * 가드가 그대로 있으면, 스텔스 리치를 건 사람만 대상 목록에서 조용히 사라진다 —
 * "아무도 내가 리치인 줄 모른다"는 증강이 **목록의 빈자리로 완전히 노출**됐다.
 * 드래프트 상호 배제로도 막을 수 없다(거는 사람과 목록을 보는 사람이 다르다).
 *
 * # 해법 (2026-08-02 사용자 확정)
 *
 * **숨은 리치는 대상으로 허용하고, 교환이 성사되면 그 리치를 해제한다.**
 * 스텔스 리치의 계약이 "남들에게는 리치가 아닌 사람으로 보인다"이므로, 남들은 그를
 * 리치가 아닌 사람으로 **취급**한다 — 그 대가로 손을 뺏기면 리치가 풀린다.
 * 보이는 리치는 지금까지처럼 대상 불가다(모두가 아는 정보라 누설될 것이 없다).
 *
 * ## 은밀함은 해제에도 적용된다
 * 해제 사실은 **당사자에게만** 알린다. 전원 공개 채널로 알리면 "저 사람이 리치였구나"가
 * 뒤늦게 새어 나가, 막으려던 누설이 한 박자 늦게 그대로 일어난다.
 * 당사자는 자기 뷰의 리치 표시가 사라지는 것과 이 채널로 알게 된다.
 *
 * ## 공탁은 돌려주지 않는다
 * 스텔스 리치는 애초에 1000점을 내지 않는다(그게 은닉의 일부다). 돌려줄 것이 없다.
 */

import { augmentDataSet } from "@majak/core";
import type { GameEngine, GameState, PlayerId, ProposedEvent } from "@majak/core";
import { riichiHidden, roundViewKey } from "../util.js";
import { stealthActiveKey } from "./stealth_riichi.js";

/** 이 이벤트 하나로 리치 해제·표식 정리·당사자 통보가 함께 일어난다 */
export const STEALTH_RIICHI_BROKEN = "StealthRiichiBroken";

interface StealthBrokenPayload {
  /** 리치가 풀리는 사람 */
  player: PlayerId;
  /** 손을 바꾼 사람 (통보 문구용) */
  by: PlayerId;
}

/** 당사자 전용 통보 채널 — 국이 끝나면 엔진이 지운다 */
const brokenViewKey = (player: PlayerId): string =>
  roundViewKey(player, `stealth_riichi:broken:${player}`);

/**
 * 지금 이 대상을 "리치라서 손을 못 바꾸는 상대"로 봐야 하는가.
 *
 * 숨은 리치는 **false**다 — 후보에서 빼면 그 빈자리가 곧 정답이 되기 때문이다.
 * 대신 교환이 성사될 때 `breakStealthRiichiEvents`가 그 리치를 해제한다.
 * 손을 바꾸는 증강의 validate·후보 필터는 반드시 이 함수를 쓴다(사본 금지).
 */
export function riichiBlocksSwap(
  rules: Parameters<typeof riichiHidden>[0],
  state: GameState,
  target: PlayerId,
): boolean {
  if (state.round.byPlayer[target]?.riichi == null) return false;
  return !riichiHidden(rules, state, target);
}

/**
 * 교환 성사 시 함께 낼 이벤트 — 대상이 숨은 리치였다면 그 리치를 해제한다.
 * 아니면 빈 배열이라 호출부는 조건 없이 펼쳐 넣으면 된다.
 */
export function breakStealthRiichiEvents(
  rules: Parameters<typeof riichiHidden>[0],
  state: GameState,
  target: PlayerId,
  by: PlayerId,
): ProposedEvent[] {
  if (state.round.byPlayer[target]?.riichi == null) return [];
  if (!riichiHidden(rules, state, target)) return [];
  return [
    {
      type: STEALTH_RIICHI_BROKEN,
      payload: { player: target, by } satisfies StealthBrokenPayload,
    },
  ];
}

/**
 * 해제 리듀서를 게임당 한 번 등록한다 (손을 바꾸는 증강들의 install에서 호출).
 * 여러 증강이 같은 이벤트를 내므로 등록은 반드시 멱등이어야 한다.
 */
export function ensureStealthBreakReducer(engine: GameEngine): void {
  if (engine.reducers.has(STEALTH_RIICHI_BROKEN)) return;
  engine.reducers.register(STEALTH_RIICHI_BROKEN, (state, event) => {
    const p = event.payload as StealthBrokenPayload;
    const rs = state.round.byPlayer[p.player];
    if (rs === undefined) return state;
    return {
      ...state,
      augmentData: {
        ...state.augmentData,
        // 스텔스 표식도 함께 내린다 — 남겨 두면 이 사람이 같은 국에 **표준 리치**를
        // 다시 걸었을 때 riichi.hidden이 되살아나 공탁까지 낸 리치가 은닉된다.
        [stealthActiveKey(state, p.player)]: false,
        // 당사자에게만 알린다 (전원 공개하면 "리치였구나"가 뒤늦게 새어 나간다)
        [brokenViewKey(p.player)]: { by: p.by },
      },
      round: {
        ...state.round,
        byPlayer: {
          ...state.round.byPlayer,
          // 공탁은 애초에 없었으므로 riichiPot은 건드리지 않는다
          [p.player]: { ...rs, riichi: null, riichiFuriten: false },
        },
      },
    };
  });
}
