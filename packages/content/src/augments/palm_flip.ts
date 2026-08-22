/**
 * 손바닥 뒤집기 (palm_flip, prism) — "리치로 잠긴 손이 딱 한 번 풀린다."
 *
 * **2국에 1회.** **리치 중** 자기 순에, 쯔모기리 대신 **손패에서 아무 패나 골라
 * 버린다.** 버린 뒤에도 텐파이여야 하므로 리치는 그대로 서 있고, 대신 **오름패가 바뀐다** —
 * 첫 리치를 기준으로 짠 세 사람의 안전패 계산이 그 자리에서 휴지조각이 된다.
 *
 * ## 2026-08-16 — 리미트를 매치 횟수에서 **2국에 1회**로 (사용자 지시)
 *
 * 매치 횟수(동풍1·반장2)는 "언제 써도 되지만 게임 전체에 한두 번"이라 리치를 걸어 둔
 * 국마다 쓸지 말지를 고민하게 만들지 못했다. 2국에 1회는 **쓴 국과 바로 다음 국이 잠기는**
 * 리듬이라, 리치를 언제 거는지와 이 버튼을 언제 태우는지가 같은 판단이 된다.
 * 배관은 큰손(big_hand)·도라 잔상과 같다 — `trackRoundSeq` + `cooldownReady/cooldownUse`.
 *
 * ## 2026-08-15 ① — 승부수와 겹쳐서 갈랐다
 *
 * 예전의 손바닥 뒤집기는 **리치 해제 + 같은 국 재리치 무료**였다. 그런데 승부수
 * (`last_stand`)가 **리치 해제 + 리치봉 환급**이라 둘 다 "자기 순에 리치를 취소하는
 * 버튼"이어서 사실상 같은 증강이었다(사용자 지적).
 *
 *  · 승부수 = 리치를 **접는** 수단(폴드). 봉을 돌려받고 손이 풀린다.
 *  · 손바닥 뒤집기 = 리치를 **유지한 채 갈아타는** 수단(공격). 리치는 계속 서 있다.
 *
 * ## 2026-08-15 ② — "패산 위 패와 맞바꾸기"는 실전에서 한 번도 못 쓴다 (사용자 보고)
 *
 * 첫 개편에서는 손패 1장을 **패산 맨 위 한 장**과 맞바꾸게 했다. 그런데 들어올 패를
 * 고를 수 없으니, 그 무작위 한 장이 텐파이를 유지시켜 주는 경우가 거의 없다 —
 * 손패 13장 중 X를 빼고 W를 넣어 다시 텐파이가 되려면 W가 정확히 그 자리에 맞아야 한다.
 * 결국 **후보가 늘 비어 버튼이 안 뜨는** 증강이었다("손패가 고정되어서 오름패를 바꿀 수
 * 없는데?"). 사양이 약속한 일을 실제로 못 하면 그건 구현이 아니라 장식이다.
 *
 * 그래서 들어오는 패를 **내가 방금 쯔모한 패**로 바꿨다. 쯔모패가 쓸모 있는 순간에만
 * 후보가 뜨고(바로 그때가 대기를 갈아탈 때다), 그때는 반드시 텐파이가 유지된다.
 * 예: 123m456m789m 11p 46s(칸짱 5s)에서 7s를 쯔모 → 4s를 버려 67s(5s·8s) 량면으로.
 *
 * ## 규칙 하나: 버린 뒤에도 텐파이여야 한다
 *
 * 리치는 텐파이가 전제다. 텐파이가 깨지면 그 리치는 유국까지 아무 일도 못 하는 죽은
 * 리치가 된다(무페널티 원칙 §0에 어긋난다). 그래서 **버려도 텐파이가 남는 패만** 후보다.
 * 쯔모패 자체를 고르는 것은 그냥 쯔모기리이므로 후보에서 뺀다.
 *
 * 리치 후리텐은 함께 풀린다 — 오름패가 통째로 바뀌었는데 예전 대기 때문에 못 나는 것은
 * 이 증강이 약속한 "갈아타기"가 아니다.
 *
 * 구현: `free_riichi_discard`의 `free_discard`와 같은 배관이다. 커스텀 액션이
 * 표준 `TILE_DISCARDED{riichi:false}`를 직접 내고(리치 상태·공탁은 그대로), 그 앞에
 * 작은 이벤트 하나로 리치 후리텐만 내린다. 자유 선언과 다른 점은 **쿨다운(2국에 1회)**과
 * **텐파이 유지 검사**, 그리고 무엇보다 **오름패가 실제로 갱신된다**는 것이다
 * (자유 선언은 리치 시점 손패를 스냅샷으로 고정해 대기가 영영 안 바뀐다 — 그래서 conflicts).
 */

import {
  TILE_DISCARDED,
  augmentDataSet,
  defineAugment,
  handIdsOf,
  kindOf,
  lockedDiscardIds,
  playerAtSeat,
  scoringOptionsOf,
  winningKinds,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
  RuleRegistry,
  TileId,
} from "@majak/core";
import {
  cooldownReady,
  cooldownUse,
  roundKey,
  roundViewKey,
  trackRoundSeq,
} from "../util.js";
import { waitTilesLeft } from "./botHelpers.js";
import { plan } from "./botPlan.js";

const ID = "palm_flip";
const ACTION = "flip_riichi";
/** 리치 후리텐만 내리는 작은 이벤트 (리치 자체·공탁은 건드리지 않는다) */
const EVENT = "RiichiPalmFlipped";

/** 2국에 1회 — 쓴 국과 바로 다음 국이 잠긴다 (큰손·도라 잔상과 같은 배관) */
const COOLDOWN_ROUNDS = 2;

interface FlipPayload {
  player: PlayerId;
}

/** 이 패를 버리고 나면 텐파이인가 (리치가 죽지 않게 하는 유일한 조건) */
function tenpaiAfterDiscard(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
  discardId: TileId,
): boolean {
  const kinds = handIdsOf(state, player)
    .filter((id) => id !== discardId)
    .map((id) => kindOf(state, id));
  const melds = state.round.byPlayer[player]?.melds.length ?? 0;
  return (
    winningKinds(kinds, melds, undefined, scoringOptionsOf(state, rules, player))
      .length > 0
  );
}

/** 지금 이 사람이 손을 풀 수 있는 상황인가 (어느 패를 고르는지와 무관한 조건) */
function commonReject(state: GameState, player: PlayerId): string | null {
  const p = state.players.find((x) => x.id === player);
  if (p === undefined || !p.augments.includes(ID)) return "no palm_flip augment";
  if (state.round.phase !== "turn.act") return "not in act phase";
  if (playerAtSeat(state, state.round.turnSeat).id !== player) return "not your turn";
  if (state.round.byPlayer[player]?.riichi == null) return "not in riichi";
  if (!cooldownReady(state, ID, player, COOLDOWN_ROUNDS)) return "on cooldown";
  return null;
}

/** 후보가 되는 손패 — 쯔모패를 뺀, 버려도 텐파이가 남는 패 (봉인된 패는 제외) */
function flippable(
  state: GameState,
  rules: RuleRegistry,
  player: PlayerId,
): TileId[] {
  const drawn = state.round.lastDrawnTile;
  const handIds = handIdsOf(state, player);
  const sealed = lockedDiscardIds(state, rules, player, handIds);
  return handIds.filter(
    (id) =>
      id !== drawn &&
      !sealed.has(id) &&
      tenpaiAfterDiscard(state, rules, player, id),
  );
}

const flipAction: ActionDef<{ tileId: TileId }> = {
  type: ACTION,
  validate: (req, { state, rules }) => {
    const common = commonReject(state, req.player);
    if (common !== null) return common;
    const handIds = handIdsOf(state, req.player);
    if (!handIds.includes(req.payload.tileId)) return "tile not in hand";
    if (req.payload.tileId === state.round.lastDrawnTile) {
      return "drawn tile must use the normal discard";
    }
    // 봉인된 패는 이 경로로도 못 버린다 — 표준 리치·스텔스 리치와 같은 규칙이다
    if (lockedDiscardIds(state, rules, req.player, handIds).has(req.payload.tileId)) {
      return "tile is sealed";
    }
    if (!tenpaiAfterDiscard(state, rules, req.player, req.payload.tileId)) {
      return "not tenpai after discard";
    }
    return null;
  },
  toEvents: (req, { state }) => [
    /*
     * 후리텐 해제를 **버림보다 먼저** 세운다 — root 이벤트는 하나씩 완전히 처리되므로,
     * 버림을 먼저 내면 그 버림의 리액션이 도는 시점에 옛 리치 후리텐이 아직 살아 있다.
     * (이 버림이 새 대기패를 흘리는 것이라면 코어가 그 자리에서 다시 세운다 — 맞는 동작이다.)
     */
    { type: EVENT, payload: { player: req.player } satisfies FlipPayload },
    // 2국에 1회 — 기준점을 찍고 잔량 표시도 그 자리에서 갱신한다
    ...cooldownUse(state, ID, req.player, COOLDOWN_ROUNDS),
    // 전원 공개 — 상대는 이 사람의 리치 정보에 유통기한이 있다는 걸 알아야 한다
    augmentDataSet(roundViewKey("*", `${ID}:${req.player}`), roundKey(state)),
    {
      type: TILE_DISCARDED,
      payload: {
        player: req.player,
        tileId: req.payload.tileId,
        riichi: false,
        riichiCost: 0,
      },
    },
  ],
};

export const palmFlip: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "riichi",
  complexity: 2,
  name: "손바닥 뒤집기",
  description:
    "(2국에 1회) 리치로 잠긴 손이 한 순만 풀린다 — 쯔모기리 대신 손패에서 골라 버려 오름패를 갈아탄다. 리치는 그대로 선다.",
  detail:
    "(2국에 1회) 리치도 공탁도 그대로이고 바뀌는 것은 오름패뿐이다. 고를 수 있는 것은 **버린 뒤에도 텐파이가 남는 패**뿐이며, 쯔모패 자체와 봉인된 패는 후보가 아니다. 리치로 생긴 후리텐은 대기가 통째로 바뀌면서 함께 풀린다. 발동 사실은 전원에게 공개된다.",
  /**
   * 스텔스 리치와는 함께 갖지 않는다 — 저쪽의 conflicts에도 같은 이유가 적혀 있다.
   * 이 증강은 발동을 **전원에게 공개**하고, 그 공개는 곧 "저 사람 리치였구나"의 확정이다.
   */
  install(ctx) {
    const { engine, holder } = ctx;

    // 쿨다운 기준 — 국이 시작될 때마다 +1 (본장 재배패도 한 국으로 센다).
    // 잔량(`cooldown:palm_flip`)은 이름표 pill이 "N국 뒤"로 읽어 준다.
    trackRoundSeq(ctx, ID, COOLDOWN_ROUNDS);

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(flipAction);
      engine.reducers.register(EVENT, (state, event) => {
        const p = event.payload as FlipPayload;
        const rs = state.round.byPlayer[p.player];
        if (rs === undefined) return state;
        // 리치(riichi)·공탁(riichiPot)은 그대로 — 대기가 바뀌었으므로 리치 후리텐만 내린다
        return {
          ...state,
          round: {
            ...state.round,
            byPlayer: {
              ...state.round.byPlayer,
              [p.player]: { ...rs, riichiFuriten: false },
            },
          },
        };
      });
    }

    ctx.holderTurnOptions((state) => {
      if (commonReject(state, holder) !== null) return [];
      return flippable(state, engine.rules, holder).map((tileId) => ({
        type: ACTION,
        payload: { tileId },
      }));
    });
  },
  /**
   * 승부수(`last_stand`)가 물러서는 수단이라면 이쪽은 **대기를 갈아타는 수단**이다.
   * 그래서 판단 기준도 위험이 아니라 "지금 대기가 죽었는가"다 — 오름패가 세상에 한 장도
   * 남지 않은 리치는 그대로 두면 유국까지 아무 일도 일어나지 않는다.
   *
   * 후보로 뜨는 패는 이미 "버려도 텐파이가 남는 패"라 리치가 죽을 걱정이 없다.
   * 남은 판단은 시점뿐이다 — 새 대기로 화료할 순목이 남아 있을 때만 켠다.
   */
  bot: plan({
    intent: "advance",
    // 타이밍은 이 정책이 직접 본다 — planner의 일반 적기와 성질이 다르다
    fleeting: true,
    pick: (ctx) => {
      const opt = ctx.options.find((o) => o.type === ACTION);
      if (opt === undefined) return null;
      if (!ctx.tenpai) return null;
      if (ctx.wallLeft < 12) return null; // 새 대기로 화료할 시간이 없다
      return waitTilesLeft(ctx) === 0 ? opt : null;
    },
  }),
});
