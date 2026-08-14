/**
 * 시간 정지 (time_stop, prism).
 * 매 국 1회, 자신의 턴에 선언하면 그 국에서 자신의 쯔모+버림을 한 번 더 한다
 * (같은 자리로 턴이 되돌아와 연속 2턴). 시간을 멈춰 한 번 더 움직이는 반칙.
 *
 * 구현 (코어 수정 없이 TURN_PASSED 인터셉터로):
 * - 선언 액션 time_stop_use는 자기 턴(turn.act)에 charge가 남아 있을 때만 제시된다.
 *   누르면 armed 플래그를 세우고 이번 국의 charge를 소진 기록한다(버림은 그대로 진행).
 * - 자신의 버림이 아무에게도 울리지 않고 지나가면 FlowController가 sys.advanceTurn →
 *   TURN_PASSED(nextSeat=다음 자리)를 낸다. armed이고 방금 버린 사람이 보유자면
 *   인터셉터가 nextSeat를 보유자 자리로 되돌린다 → 보유자가 곧바로 다시 쯔모(추가 턴).
 * - 되돌린 직후 리액션에서 armed을 해제한다(무한 루프 방지). 다른 사람이 울어서
 *   TURN_PASSED가 보유자 버림이 아니면 armed은 유지돼 다음 자기 버림에 발동된다.
 *
 * charge: **매 국 1회**(2026-08-02 사용자 버프, 구 2국당 1회). 소진 플래그를 국(roundKey)
 * 스코프로 두면 국이 바뀔 때 자동으로 다시 충전된다 — 본장(연장)도 배패를 다시 하므로
 * 한 국으로 친다(util.roundKey가 본장까지 포함).
 */

import {
  TURN_PASSED,
  augmentDataSet,
  defineAugment,
  playerAtSeat,
} from "@majak/core";
import type {
  ActionDef,
  AugmentDef,
  GameState,
  PlayerId,
} from "@majak/core";
import { flagOf, publishUsesLeft, roundKey, roundViewKey } from "../util.js";
import { plan } from "./botPlan.js";

const ID = "time_stop";
const ACTION = "time_stop_use";
/**
 * 이번 턴에 시간을 멈춰 뒀는가.
 *
 * ⚠ **국 스코프여야 한다.** 선언한 국이 남의 론·유국으로 먼저 끝나면 게임 스코프 키에
 * armed=true가 남아, 다음 국에서 공짜 추가 턴이 새거나(TURN_PASSED 인터셉터) 반대로
 * 재선언이 "already armed"로 막혔다(2026-07-29 감사).
 */
const armedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:armed:${roundKey(state)}:${h}`;
/** 이번 국에 이미 썼는가 — **국 스코프**라 국이 바뀌면 자동으로 다시 충전된다. */
const usedKey = (state: GameState, h: PlayerId): string =>
  `${ID}:used:${roundKey(state)}:${h}`;

const seatOf = (state: GameState, h: PlayerId): number | undefined =>
  state.players.find((p) => p.id === h)?.seat;

/** 이번 국의 charge가 아직 남아 있는가 (매 국 1회) */
function chargeAvailable(state: GameState, h: PlayerId): boolean {
  return !flagOf(state, usedKey(state, h));
}

// 액션은 전원 공용(엔진에 한 번만 등록)이라 특정 보유자를 클로저로 잡지 않는다.
// 행위자가 보유자인지·자기 턴인지·charge가 남았는지를 validate로 판별한다
// (single_path_contract의 공용 선언 액션과 동일한 패턴 — 다인 보유 안전).
const useAction: ActionDef<Record<string, never>> = {
  type: ACTION,
  validate: (req, { state }) => {
    const player = state.players.find((p) => p.id === req.player);
    if (player === undefined || !player.augments.includes(ID)) {
      return "no time_stop augment";
    }
    if (state.round.phase !== "turn.act") return "not in act phase";
    if (playerAtSeat(state, state.round.turnSeat).id !== req.player) {
      return "not your turn";
    }
    if (flagOf(state, armedKey(state, req.player))) return "already armed this turn";
    if (!chargeAvailable(state, req.player)) return "no charge this round";
    return null;
  },
  toEvents: (req, { state }) => [
    augmentDataSet(armedKey(state, req.player), true),
    augmentDataSet(usedKey(state, req.player), true),
    augmentDataSet(roundViewKey(req.player, `${ID}:armed`), true),
  ],
};

export const timeStop: AugmentDef = defineAugment({
  id: ID,
  tier: "prism",
  category: "disrupt",
  complexity: 1,
  name: "시간 정지",
  description:
    "(매 국 1회) 사용하면 내 차례를 한 번 더 진행한다(연속 2순).",
  detail:
    "(매 국 1회) 자기 순에 선언하고 그 순의 버림이 아무에게도 울리지 않으면, 순서가 넘어가지 않고 곧바로 한 번 더 쯔모하고 버린다. 버림이 울리면 발동이 다음 자기 순으로 미뤄질 뿐 소멸하지는 않는다.",
  // 봇: 텐파이일 때 선언한다 — 추가 턴(쯔모)이 곧바로 화료 기회 배증으로 이어진다.
  //     (charge가 없거나 이미 선언했으면 옵션이 제시되지 않아 자동으로 건너뛴다.)
  /**
   * 봇 — **수학적으로 발동이 불가능했다.**
   *
   * `pick`은 텐파이일 때만 후보를 돌려주는데, `advance` 적기는 텐파이를 **0.3**으로 본다
   * ("텐파이면 밀 곳이 없다"). 거기에 `oneShot` 문턱 0.2가 얹혀 기준이 0.35가 되니
   * **0.3 < 0.35 — 조건이 맞는 유일한 순간에 언제나 막혔다.** 25배패 계측에서 다섯 번
   * 들고 한 번도 못 썼다.
   *
   * `oneShot`을 뗀다. 그 표시의 뜻은 "어중간한 자리에서 태우지 않는다"인데, 여기서는
   * **`pick`의 텐파이 조건이 이미 그 일을 하고 있다** — 국에 한 번뿐이라는 사실은
   * 아껴야 할 이유이지, 조건이 맞는 자리에서까지 막을 이유가 아니다.
   *
   * (텐파이에서 한 순을 더 받는 것은 밀기가 아니라 **화료 기회를 한 번 더 사는 것**이다.
   *  적기 0.3은 그 값을 낮게 잡은 것이라 강도만 낮아지고, 발동 자체는 열린다.)
   */
  bot: plan({
    intent: "advance",
    pick: ({ options, tenpai }) =>
      tenpai ? (options.find((o) => o.type === ACTION) ?? null) : null,
  }),
  install(ctx) {
    const { engine, holder } = ctx;

    // 남은 사용 횟수를 이름표 pill에 상시 노출한다 (횟수형 증강 공용 규약).
    // "이번 국 1회"는 이미 썼는지가 화면 어디에도 없어서, 액티브 버튼이 사라지고
    // 나서야 소진을 알 수 있었다(2026-08-15 사용자 지적: "횟수류 전부 안 나온다").
    publishUsesLeft(
      ctx,
      (state) => ({ left: flagOf(state, usedKey(state, holder)) ? 0 : 1, total: 1 }),
      "round",
    );

    if (!engine.actions.has(ACTION)) {
      engine.actions.register(useAction);
    }

    // 자기 턴에 charge가 있으면 선언 옵션 제시
    ctx.holderTurnOptions((state) => {
      if (state.round.phase !== "turn.act") return [];
      if (playerAtSeat(state, state.round.turnSeat).id !== holder) return [];
      if (flagOf(state, armedKey(state, holder))) return []; // 이미 이번 턴 선언함
      if (!chargeAvailable(state, holder)) return [];
      return [{ type: ACTION, payload: {} }];
    });

    // 보유자의 버림이 지나갈 때 다음 자리를 보유자로 되돌린다 (추가 턴)
    ctx.interceptor(TURN_PASSED, (event, ic) => {
      const state = ic.state;
      if (!flagOf(state, armedKey(state, holder))) return event;
      if (state.round.lastDiscard?.player !== holder) return event; // 남이 운 경우 유지
      const seat = seatOf(state, holder);
      if (seat === undefined) return event;
      const payload = event.payload as { nextSeat: number };
      return { type: event.type, payload: { ...payload, nextSeat: seat } };
    });

    // 되돌림이 실제로 적용됐으면 armed 해제 (리듀서 적용 후 turnSeat=보유자 확인)
    ctx.reaction(TURN_PASSED, (event, rc) => {
      void event;
      const state = rc.state;
      if (!flagOf(state, armedKey(state, holder))) return;
      const seat = seatOf(state, holder);
      if (
        seat !== undefined &&
        state.round.lastDiscard?.player === holder &&
        state.round.turnSeat === seat
      ) {
        rc.emit(augmentDataSet(armedKey(state, holder), false));
        rc.emit(augmentDataSet(roundViewKey(holder, `${ID}:armed`), false));
      }
    });
  },
});
